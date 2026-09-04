import { NextResponse } from 'next/server';
import { checkRate, rateLimited } from '@/lib/rate-limit';
import { generateCourse, isProviderRejected } from '@/lib/generate-course';
import { getCurrentUser } from '@/lib/auth';
import { credentialsFor } from '@/lib/credentials-store';
import { isPro } from '@/lib/billing-store';
import { saveCourse } from '@/lib/courses-store';
import { courseWithoutVideos } from '@/lib/video-enrichment';
import { finishCourse } from '@/lib/finish-course';

export const runtime = 'nodejs';
export const maxDuration = 300;

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

  let prompt = '';
  let level: 'Beginner' | 'Intermediate' | 'Advanced' | undefined;
  let known = '';
  let language = '';
  try {
    const body = (await req.json()) as { prompt?: unknown; level?: unknown; known?: unknown; language?: unknown };
    prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (body.level === 'Beginner' || body.level === 'Intermediate' || body.level === 'Advanced') {
      level = body.level;
    }
    known = typeof body.known === 'string' ? body.known.trim().slice(0, 400) : '';
    language = typeof body.language === 'string' ? body.language.trim().slice(0, 80) : '';
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (!prompt) {
    return NextResponse.json({ error: 'Please describe what you want to learn.' }, { status: 400 });
  }

  try {
    const startedAt = Date.now();
    /* The learner's own key and model when they saved one; the operator's
       environment otherwise, which the backend falls back to on its own. */
    const { anthropicKey, anthropicModel } = await credentialsFor(user.id);
    const course = await generateCourse(prompt, {
      level,
      known,
      language,
      apiKey: anthropicKey,
      model: anthropicModel,
    });
    const textReadyMs = Date.now() - startedAt;
    const enriched = courseWithoutVideos(course);
    const id = await saveCourse(user.id, enriched, prompt);

    /* Cover art, vector index and videos, all after the response. Shared with
       the goal-card route so the two ways of making a course cannot drift. */
    const { videosPending } = finishCourse(user.id, id, enriched, prompt);

    console.info(
      `[course-generate] textReady ms=${textReadyMs} course=${id} modules=${course.modules.length} videosPending=${videosPending}`,
    );
    return NextResponse.json({ course: enriched, id, videosPending });
  } catch (err) {
    console.error('Course generation failed:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';

    /* 401 so the client can send them to Settings rather than reporting an
       outage. The message is already the actionable one. */
    if (isProviderRejected(err)) {
      return NextResponse.json({ error: message, keyRejected: true }, { status: 401 });
    }
    return NextResponse.json({ error: `Generation failed: ${message}` }, { status: 500 });
  }
}
