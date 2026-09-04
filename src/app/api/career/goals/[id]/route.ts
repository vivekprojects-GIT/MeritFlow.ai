import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { credentialsFor } from '@/lib/credentials-store';
import { checkRate, rateLimited } from '@/lib/rate-limit';
import { isPro } from '@/lib/billing-store';
import { generateCourseComplete, isProviderRejected } from '@/lib/generate-course';
import { saveCourse } from '@/lib/courses-store';
import { courseWithoutVideos } from '@/lib/video-enrichment';
import { finishCourse } from '@/lib/finish-course';
import { courseBrief } from '@/lib/career/goal-progress';
import { detailOf, linkCourse, linkedCourses } from '@/lib/career/goals-store';
import { roleById } from '@/lib/career/roles';

export const runtime = 'nodejs';
/* Building a course is several model calls and can take six minutes when a
   module has to be rewritten. Without this the platform cuts the request off
   long before the backend is finished. */
export const maxDuration = 800;

/** One goal: every skill it needs, and where the learner stands on each. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  const detail = await detailOf(user.id, id);
  if (!detail) return NextResponse.json({ error: 'That goal is not on your list.' }, { status: 404 });

  return NextResponse.json({ goal: detail });
}

/**
 * Generate the course for one skill of this goal.
 *
 * The course is written for the career, not the skill alone: structural
 * analysis for a civil engineer is a different course from the same subject
 * for an architect, and handing a learner the wrong one wastes the hours they
 * were about to spend.
 *
 * A skill that already has a course returns that course rather than making a
 * second. Generation costs real money and a double click should not spend it
 * twice, nor split a learner's progress across two courses that each look
 * half finished.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: goalId } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { skill?: string };
  const skill = String(body.skill ?? '').trim().toLowerCase();
  if (!skill) return NextResponse.json({ error: 'Which skill?' }, { status: 400 });

  const detail = await detailOf(user.id, goalId);
  if (!detail) return NextResponse.json({ error: 'That goal is not on your list.' }, { status: 404 });

  const card = detail.cards.find((c) => c.skill === skill);
  if (!card) return NextResponse.json({ error: 'That skill is not part of this goal.' }, { status: 400 });

  /* Already generated. Hand back what exists. */
  const existing = (await linkedCourses(user.id, goalId)).find((l) => l.skill === skill);
  if (existing) return NextResponse.json({ courseId: existing.courseId, reused: true, goal: detail });

  const rate = checkRate(user.id, 'generate');
  if (!rate.allowed) return rateLimited(rate);

  if (!(await isPro(user.id))) {
    return NextResponse.json(
      { error: 'Generating courses is a Pro feature — subscribe to build your goal from here.', upgrade: true },
      { status: 402 },
    );
  }

  const role = roleById(detail.role.id);
  if (!role) return NextResponse.json({ error: 'That career is no longer available.' }, { status: 400 });

  const prompt = courseBrief(skill, role);

  /*
   * What the learner already holds, so the course does not re-teach it.
   *
   * The skill file is the honest version of "what do you already know" — it is
   * built from finished courses rather than from what they say — and passing
   * it means a fifth course does not open with the first course's material.
   */
  const known = detail.cards
    .filter((c) => c.state === 'earned')
    .map((c) => c.skill)
    .join(', ')
    .slice(0, 400);

  try {
    /* The learner's own key and model when they saved one. */
    const { anthropicKey, anthropicModel } = await credentialsFor(user.id);
    const course = await generateCourseComplete(prompt, {
      known,
      apiKey: anthropicKey,
      model: anthropicModel,
    });
    const enriched = courseWithoutVideos(course);
    const courseId = await saveCourse(user.id, enriched, prompt);
    await linkCourse(goalId, skill, courseId);

    /* The same finishing passes the create flow runs — cover art, vector
       index and videos — from the one place both routes share. */
    const { videosPending } = finishCourse(user.id, courseId, enriched, prompt);

    return NextResponse.json({
      courseId,
      reused: false,
      videosPending,
      goal: await detailOf(user.id, goalId),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    if (isProviderRejected(err)) {
      return NextResponse.json({ error: message, keyRejected: true }, { status: 401 });
    }
    return NextResponse.json(
      { error: `That course could not be generated: ${message.slice(0, 120)}` },
      { status: 502 },
    );
  }
}
