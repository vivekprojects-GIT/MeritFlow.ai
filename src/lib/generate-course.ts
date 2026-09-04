import { courseSchema, type Course } from './course-schema';
import { backendAuthHeaders, backendUrl } from './backend-url';

export type GenerateOptions = {
  /** Adaptive: tunes depth and vocabulary to the learner. */
  level?: 'Beginner' | 'Intermediate' | 'Advanced';
  /** Adaptive: what the learner already knows, so we skip or compress it. */
  known?: string;
  /** Target language for all learner-facing course content. */
  language?: string;
  /** Source document text - when present, the course is built to teach this material. */
  sourceText?: string;
  /**
   * The learner's own Anthropic key and model, when they saved one.
   *
   * Passed per call rather than read from the environment because the choice
   * is per user: the backend is one process serving everyone, and its env can
   * only ever hold the operator's key.
   */
  apiKey?: string | null;
  model?: string | null;
};


/**
 * The model provider refused the key.
 *
 * Its own type because it is the one generation failure the person who caused
 * it can fix, and a route that cannot tell it apart reports "generation
 * failed, status 500" — which reads as the app being broken and sends them
 * looking in the wrong place.
 */
export class ProviderRejectedError extends Error {
  readonly rejected = true;
}

/** Whether a backend failure was a rejected key rather than an outage. */
export const isProviderRejected = (err: unknown): boolean => err instanceof ProviderRejectedError;

/** Both provider refusals the learner can act on: a bad key, and an empty account. */
const REJECTED = /api key was rejected|no credit left/i;

/**
 * Turn a backend failure message into the right kind of Error.
 *
 * Exported because the interactive create route consumes the same NDJSON
 * stream with its own reader, and a second `new Error(...)` there was exactly
 * how a refused key came back to the browser labelled "Generation failed"
 * instead of as something the learner could fix.
 */
export function providerFailure(message: string): Error {
  return failureFrom(message, REJECTED.test(message) ? 401 : 500);
}

function failureFrom(message: string, status: number): Error {
  return status === 401 || REJECTED.test(message) ? new ProviderRejectedError(message) : new Error(message);
}

/** Generate a structured course through the Python LangGraph backend only. */
export async function generateCourse(topic: string, opts: GenerateOptions = {}): Promise<Course> {
  const res = await fetch(backendUrl('generate-course'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...backendAuthHeaders() },
    body: JSON.stringify({
      topic,
      level: opts.level,
      known: opts.known ?? '',
      language: opts.language ?? '',
      sourceText: opts.sourceText,
      apiKey: opts.apiKey ?? null,
      model: opts.model ?? null,
    }),
    cache: 'no-store',
  });

  const text = await res.text();
  const data = parsePythonResponse(text);
  if (!res.ok) {
    throw failureFrom(pythonBackendError(data, text, res.status), res.status);
  }
  if (!data.course) {
    throw new Error('Python backend returned no course.');
  }

  return courseSchema.parse(data.course);
}

/**
 * Generate a course, waiting for the whole thing, without the five-minute wall.
 *
 * ## Why this exists alongside `generateCourse`
 *
 * `generateCourse` posts to the blocking endpoint and waits for the response
 * headers, and Node's HTTP client gives up waiting after five minutes. A real
 * course takes longer than that whenever a module has to be rewritten: the one
 * measured here took six minutes sixteen, and surfaced as the useless message
 * "fetch failed" — indistinguishable from the backend being down.
 *
 * The streaming endpoint sends its headers immediately and then emits progress
 * events, so the clock never runs out. This consumes that stream to the end and
 * hands back only the finished course, which makes it a drop-in for callers
 * that have nowhere to show progress.
 *
 * The interactive create flow has its own consumer of the same endpoint,
 * because it does have somewhere to show progress and forwards every event to
 * the browser.
 */
export async function generateCourseComplete(topic: string, opts: GenerateOptions = {}): Promise<Course> {
  const res = await fetch(backendUrl('generate-course/stream'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...backendAuthHeaders() },
    body: JSON.stringify({
      topic,
      level: opts.level,
      known: opts.known ?? '',
      language: opts.language ?? '',
      sourceText: opts.sourceText,
      apiKey: opts.apiKey ?? null,
      model: opts.model ?? null,
    }),
    cache: 'no-store',
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    throw failureFrom(pythonBackendError(parsePythonResponse(text), text, res.status), res.status);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let course: unknown = null;

  /* Progress events are read and dropped. Reading them is not optional even
     though nothing here displays them: the point of the stream is that data
     keeps arriving, and a reader that stopped pulling would stall it. */
  const handle = (line: string): void => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const event = JSON.parse(trimmed) as Record<string, unknown>;
    if (event.type === 'error') {
      /* The stream reports a rejected key in its body rather than its status,
         because the headers were already sent when the key was tried. */
      const message = typeof event.error === 'string' ? event.error : 'Course generation failed.';
      throw failureFrom(message, REJECTED.test(message) ? 401 : 500);
    }
    if (event.type === 'course') course = event.course;
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) handle(line);
  }
  handle(buffer);

  if (!course) throw new Error('The backend finished without producing a course.');
  return courseSchema.parse(course);
}


function parsePythonResponse(text: string): { course?: unknown; detail?: unknown; error?: unknown } {
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as { course?: unknown; detail?: unknown; error?: unknown };
  } catch {
    return {};
  }
}

function pythonBackendError(
  data: { detail?: unknown; error?: unknown },
  text: string,
  status: number,
): string {
  if (typeof data.detail === 'string') return data.detail;
  if (typeof data.error === 'string') return data.error;
  return text.trim() || `Python backend returned ${status}`;
}
