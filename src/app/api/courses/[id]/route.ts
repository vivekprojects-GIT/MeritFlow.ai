import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { deleteCourse, getCompletedLessons, getCourse, updateCourse } from '@/lib/courses-store';
import type { EnrichedCourse } from '@/lib/course-schema';
import { deleteCourseIndex, indexCourseInBackground } from '@/lib/vector-store';

export const runtime = 'nodejs';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const course = await getCourse(user.id, id);
  if (!course) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const completed = await getCompletedLessons(user.id, id);
  return NextResponse.json({ course, completed });
}

/**
 * Replace a saved course wholesale. Used to undo an assistant edit by putting
 * back the copy the client was holding before the change.
 */
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;

  let body: { course?: unknown };
  try {
    body = (await req.json()) as { course?: unknown };
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const course = body.course;
  if (!isCourseShaped(course)) return NextResponse.json({ error: 'That is not a course.' }, { status: 400 });

  const ok = await updateCourse(user.id, id, course);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  /* An undo changes the text, so the embeddings have to follow it back. */
  indexCourseInBackground(id, user.id, course);
  return NextResponse.json({ ok: true });
}

/**
 * Structural check only — deliberately not `courseSchema.parse`, which would
 * strip the enrichment fields (videos, lock flags) that live outside it.
 */
function isCourseShaped(value: unknown): value is EnrichedCourse {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<EnrichedCourse>;
  if (typeof candidate.title !== 'string' || !candidate.title.trim()) return false;
  if (!Array.isArray(candidate.modules) || candidate.modules.length === 0) return false;
  return candidate.modules.every(
    (mod) => mod && typeof mod.title === 'string' && Array.isArray(mod.lessons) && mod.lessons.length > 0,
  );
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  await deleteCourse(user.id, id);
  /* Drop the course's embeddings too, so a deleted course can't surface in search. */
  await deleteCourseIndex(id);
  return NextResponse.json({ ok: true });
}
