import { NextResponse } from 'next/server';
import { classPulse } from '@/lib/analytics';
import { getCurrentUser } from '@/lib/auth';
import { getClassCourseForInstructor } from '@/lib/classes-store';

export const runtime = 'nodejs';

/**
 * Teaching insights for one class.
 *
 * Instructor-only: the response names individual learners who have stalled, so
 * it must never be readable by a classmate.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  /* Doubles as the ownership check — it only returns for the owning instructor. */
  const course = await getClassCourseForInstructor(user.id, id);
  if (!course) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const pulse = await classPulse(id);

  /* Turn the raw sticking-point key into something a professor can act on. */
  let stickingPoint = null;
  if (pulse.stickingPoint) {
    const [m, l] = pulse.stickingPoint.lessonKey.split(':').map(Number);
    const lesson = course.modules?.[m]?.lessons?.[l];
    stickingPoint = {
      ...pulse.stickingPoint,
      moduleIndex: m,
      lessonIndex: l,
      moduleTitle: course.modules?.[m]?.title ?? `Module ${m + 1}`,
      lessonTitle: lesson?.title ?? `Lesson ${m + 1}.${l + 1}`,
    };
  }

  return NextResponse.json({ ...pulse, stickingPoint });
}
