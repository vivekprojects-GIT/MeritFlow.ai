import { NextResponse } from 'next/server';
import { checkRate, rateLimited } from '@/lib/rate-limit';
import { getCurrentUser } from '@/lib/auth';
import { isPro } from '@/lib/billing-store';
import { credentialsFor } from '@/lib/credentials-store';
import { isProviderRejected, providerFailure } from '@/lib/generate-course';
import { backendAuthHeaders, backendBaseUrl, backendUrl } from '@/lib/backend-url';
import { courseSchema, type Course, type EnrichedCourse } from '@/lib/course-schema';
import { saveCourse } from '@/lib/courses-store';
import { courseWithoutVideos } from '@/lib/video-enrichment';
import { finishCourse } from '@/lib/finish-course';

export const runtime = 'nodejs';
export const maxDuration = 300;

type VideoJob = {
  id: string;
  course: EnrichedCourse;
  videosPending: number;
};

type StreamRequest = {
  prompt: string;
  level?: 'Beginner' | 'Intermediate' | 'Advanced';
  known: string;
  language: string;
};

const encoder = new TextEncoder();
const HEARTBEAT_MS = 3500;
const DEFAULT_PYTHON_BACKEND_URL = 'http://127.0.0.1:8000';

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Please sign in to generate a course.' }, { status: 401 });
  }

  /* Metered by cost. Course generation makes several model calls, so a
     repeated click should not repeat the spend. */
  const rate = checkRate(user.id, 'generate');
  if (!rate.allowed) return rateLimited(rate);

  if (!(await isPro(user.id))) {
    return NextResponse.json(
      { error: 'Generating courses is a Pro feature - subscribe to create unlimited courses.', upgrade: true },
      { status: 402 },
    );
  }

  const parsed = await parseRequest(req);
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  /* The finishing passes are registered where the course is saved, through
     the same `finishCourse` the other two routes use. This route used to run
     its own video pass here and no cover lookup or vector index at all, so the
     busiest way to make a course produced the least finished one. */

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let lastActivity = Date.now();
      const send = (payload: Record<string, unknown>) => {
        lastActivity = Date.now();
        controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
      };
      const heartbeat = setInterval(() => {
        if (Date.now() - lastActivity < HEARTBEAT_MS) return;
        try {
          lastActivity = Date.now();
          controller.enqueue(
            encoder.encode(
              `${JSON.stringify({
                type: 'status',
                stage: 'working',
                message: 'Still working - agents are writing in parallel',
              })}\n`,
            ),
          );
        } catch {
          clearInterval(heartbeat);
        }
      }, HEARTBEAT_MS);

      try {
        const startedAt = Date.now();
        send({ type: 'status', stage: 'accepted', message: 'Live build started' });
        const result = await streamCourseGeneration(parsed, user.id, send);
        console.info(
          `[course-generate-stream] textReady ms=${Date.now() - startedAt} course=${result.videoJob.id} modules=${result.videoJob.course.modules.length} videosPending=${result.videoJob.videosPending}`,
        );
        send({ type: 'done' });
      } catch (err) {
        console.error('Streaming course generation failed:', err);
        const message = generationFailureMessage(err);
        /* A provider refusal already says what happened and what to do, so
           prefixing it with "Generation failed" only buries the sentence that
           matters under one that does not. */
        send({
          type: 'error',
          error: isProviderRejected(err) ? message : `Generation failed: ${message}`,
          keyRejected: isProviderRejected(err) || undefined,
        });
      } finally {
        clearInterval(heartbeat);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

async function parseRequest(req: Request): Promise<StreamRequest | { error: string; status: number }> {
  try {
    const body = (await req.json()) as { prompt?: unknown; level?: unknown; known?: unknown; language?: unknown };
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (!prompt) return { error: 'Please describe what you want to learn.', status: 400 };

    let level: StreamRequest['level'];
    if (body.level === 'Beginner' || body.level === 'Intermediate' || body.level === 'Advanced') {
      level = body.level;
    }

    return {
      prompt,
      level,
      known: typeof body.known === 'string' ? body.known.trim().slice(0, 400) : '',
      language: typeof body.language === 'string' ? body.language.trim().slice(0, 80) : '',
    };
  } catch {
    return { error: 'Invalid request body.', status: 400 };
  }
}

async function streamCourseGeneration(
  req: StreamRequest,
  userId: string,
  send: (payload: Record<string, unknown>) => void,
): Promise<{ videoJob: VideoJob }> {
  send({ type: 'status', stage: 'connecting_agents', message: 'Connecting to Python LangGraph agents' });
  return streamFromPythonBackend(req, userId, send);
}

async function streamFromPythonBackend(
  req: StreamRequest,
  userId: string,
  send: (payload: Record<string, unknown>) => void,
): Promise<{ videoJob: VideoJob }> {
  /* The learner's own key and model when they saved one. This is the busiest
     path into generation, so a key that applied everywhere except here would
     look like it did not work at all. */
  const { anthropicKey, anthropicModel } = await credentialsFor(userId);

  const res = await fetch(backendUrl('generate-course/stream'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...backendAuthHeaders() },
    body: JSON.stringify({
      topic: req.prompt,
      level: req.level,
      known: req.known,
      language: req.language,
      apiKey: anthropicKey,
      model: anthropicModel,
    }),
    cache: 'no-store',
  });

  if (!res.ok || !res.body) {
    throw new Error(await pythonBackendError(res));
  }

  send({ type: 'status', stage: 'agents_connected', message: 'Agents connected. Waiting for the first outline.' });
  let saved: VideoJob | null = null;
  await consumeNdjson(res.body, async (event) => {
    if (event.type === 'error') {
      /* The backend reports a refused key or an empty account in the stream
         body, because the headers were long since sent. Classifying it here
         is what lets the route tell the learner to fix their settings rather
         than reporting an outage they cannot act on. */
      const text = typeof event.error === 'string' ? event.error : 'Python backend generation failed.';
      throw providerFailure(text);
    }

    if (event.type === 'course') {
      const course = courseSchema.parse(event.course);
      saved = await saveGeneratedCourse(userId, req.prompt, course, send, event.elapsedMs);
      return;
    }

    send(event as Record<string, unknown>);
  });

  if (!saved) throw new Error('Python backend finished without a course.');
  return { videoJob: saved };
}

async function pythonBackendError(res: Response): Promise<string> {
  const text = await res.text().catch(() => '');
  if (!text) return `Python backend returned ${res.status}`;
  try {
    const parsed = JSON.parse(text) as { detail?: unknown; error?: unknown };
    if (typeof parsed.detail === 'string') return parsed.detail;
    if (typeof parsed.error === 'string') return parsed.error;
  } catch {
    // Keep the raw response below when it is not JSON.
  }
  return text;
}

function generationFailureMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : 'Unknown error';
  if (message.includes('ECONNREFUSED') || message.includes('fetch failed')) {
    return `Python backend is not reachable. Start it on ${backendBaseUrl()}.`;
  }
  if (message === 'terminated' || message.includes('UND_ERR_SOCKET')) {
    return 'Python backend stream closed unexpectedly. The backend may have crashed, restarted, or hit an unhandled module-generation error.';
  }
  return message;
}

async function saveGeneratedCourse(
  userId: string,
  prompt: string,
  course: Course,
  send: (payload: Record<string, unknown>) => void,
  elapsedMs?: unknown,
): Promise<VideoJob> {
  send({ type: 'status', stage: 'saving', message: 'Saving your course' });
  const enriched = courseWithoutVideos(course);
  const id = await saveCourse(userId, enriched, prompt);

  const { videosPending } = finishCourse(userId, id, enriched, prompt);

  send({ type: 'course', course: enriched, id, videosPending, elapsedMs });
  return { id, course: enriched, videosPending: videosPending ? 1 : 0 };
}

async function consumeNdjson(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: Record<string, unknown>) => Promise<void>,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const event = JSON.parse(trimmed) as Record<string, unknown>;
      await onEvent(event);
    }
  }

  const tail = buffer.trim();
  if (tail) {
    const event = JSON.parse(tail) as Record<string, unknown>;
    await onEvent(event);
  }
}
