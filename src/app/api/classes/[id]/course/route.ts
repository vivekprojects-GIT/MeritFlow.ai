import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getClassCourseForInstructor, updateClassCourse } from '@/lib/classes-store';
import type { EnrichedCourse } from '@/lib/course-schema';

export const runtime = 'nodejs';

/** Load a class's full course content for the owning instructor to edit. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'instructor') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await ctx.params;
  const course = await getClassCourseForInstructor(user.id, id);
  if (!course) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ course });
}

/** Save edited course content back to the class. */
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'instructor') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await ctx.params;

  let course: EnrichedCourse | null = null;
  try {
    const body = (await req.json()) as { course?: unknown };
    if (body.course && typeof body.course === 'object') course = body.course as EnrichedCourse;
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  if (
    !course ||
    typeof course.title !== 'string' ||
    !Array.isArray(course.modules) ||
    course.modules.length === 0
  ) {
    return NextResponse.json(
      { error: 'A course with a title and at least one module is required.' },
      { status: 400 },
    );
  }

  const ok = await updateClassCourse(user.id, id, course);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
