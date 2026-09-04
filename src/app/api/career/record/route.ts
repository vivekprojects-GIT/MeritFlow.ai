import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { buildLearningRecord, recordAsText } from '@/lib/career/learning-record';
import { completedCourses, goalSummaries, skillFileOf } from '@/lib/career/goals-store';
import type { GoalDetail } from '@/lib/career/goal-progress';

export const runtime = 'nodejs';

/**
 * The learner's record of what they finished, written to be pasted.
 *
 * Assembled on read from the same sources everything else uses, so it can
 * never say something the goal pages contradict — a CV line and a progress bar
 * disagreeing about the same person is the one failure that would make the
 * whole feature untrustworthy.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [file, courses, summaries] = await Promise.all([
    skillFileOf(user.id),
    completedCourses(user.id),
    goalSummaries(user.id),
  ]);

  /* Goals whose wording never resolved to a career carry no requirements, so
     there is nothing to measure and nothing to claim. */
  const goals = summaries.filter((g): g is GoalDetail => !('unresolved' in g));

  /* The session carries no display name, so the record is built without one
     and the learner puts their own name at the top of their CV — which is
     where it belongs anyway. */
  const record = buildLearningRecord(file, courses, goals);

  return NextResponse.json({ record, text: recordAsText(record) });
}
