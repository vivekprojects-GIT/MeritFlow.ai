import type { EnrichedCourse } from './course-schema';

/**
 * Client for the Python backend's ChromaDB vector memory.
 *
 * Retrieval is a semantic layer over course TEXT, not a system of record — the
 * courses table stays authoritative. Everything here is therefore best-effort:
 * when PYTHON_BACKEND_URL is unset, Chroma isn't installed, or the backend is
 * down, these calls quietly no-op and callers fall back to reading the course
 * directly. A failed index must never fail a course generation or an edit.
 */

const TIMEOUT_MS = 15_000;

export type SearchHit = {
  text: string;
  moduleIndex: number | null;
  lessonIndex: number | null;
  moduleTitle: string | null;
  lessonTitle: string | null;
  type: string | null;
  score: number | null;
};

export function vectorSearchEnabled(): boolean {
  return Boolean(process.env.PYTHON_BACKEND_URL?.trim());
}

function endpoint(path: string): string | null {
  const base = process.env.PYTHON_BACKEND_URL?.trim();
  if (!base) return null;
  return new URL(path, base.endsWith('/') ? base : `${base}/`).toString();
}

async function call<T>(path: string, init: RequestInit): Promise<T | null> {
  const url = endpoint(path);
  if (!url) return null;
  try {
    const res = await fetch(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`Vector store ${path} returned ${res.status}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`Vector store ${path} unavailable:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * (Re)index a course's text. Call after generation and after any edit — the
 * backend replaces the course's chunks rather than appending, so repeat calls
 * are safe.
 */
export async function indexCourse(
  courseId: string,
  userId: string,
  course: EnrichedCourse,
): Promise<number | null> {
  const result = await call<{ ok: boolean; chunks: number }>('index-course', {
    method: 'POST',
    body: JSON.stringify({ courseId, userId, course }),
  });
  return result?.chunks ?? null;
}

/** Fire-and-forget indexing, for paths that must not wait on (or fail with) it. */
export function indexCourseInBackground(courseId: string, userId: string, course: EnrichedCourse): void {
  if (!vectorSearchEnabled()) return;
  void indexCourse(courseId, userId, course).catch(() => {
    /* best-effort */
  });
}

export async function searchCourse(options: {
  query: string;
  courseId: string;
  userId?: string;
  moduleIndex?: number;
  lessonIndex?: number;
  kinds?: string[];
  limit?: number;
}): Promise<SearchHit[]> {
  const result = await call<{ hits: SearchHit[] }>('search', {
    method: 'POST',
    body: JSON.stringify({
      query: options.query,
      courseId: options.courseId,
      userId: options.userId,
      moduleIndex: options.moduleIndex,
      lessonIndex: options.lessonIndex,
      kinds: options.kinds,
      limit: options.limit ?? 6,
    }),
  });
  return result?.hits ?? [];
}

export async function deleteCourseIndex(courseId: string): Promise<void> {
  await call(`index-course/${encodeURIComponent(courseId)}`, { method: 'DELETE' });
}
