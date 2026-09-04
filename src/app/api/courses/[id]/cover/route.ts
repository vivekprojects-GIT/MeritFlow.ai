import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { coverLookupEnabled, findCourseCover } from '@/lib/course-cover';
import { getCourse, inferCourseCategory, setCourseCover, userOwnsCourse } from '@/lib/courses-store';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * Look up and cache a cover photo for one course.
 *
 * Backfill for courses created before covers existed: the dashboard calls this
 * for any course still missing one. Returns `{ coverUrl: null }` rather than an
 * error when nothing suitable is found, so the caller stops asking.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  if (!(await userOwnsCourse(user.id, id))) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!coverLookupEnabled()) return NextResponse.json({ coverUrl: null, reason: 'no-key' });

  const course = await getCourse(user.id, id);
  if (!course) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const coverUrl = await findCourseCover(course.title, inferCourseCategory(course.title, course.subtitle));
  /* Record even a null so a course with no good match isn't retried forever. */
  await setCourseCover(user.id, id, coverUrl);
  return NextResponse.json({ coverUrl });
}
