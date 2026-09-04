import { NextResponse } from 'next/server';
import { checkRate, rateLimited } from '@/lib/rate-limit';
import { getCurrentUser } from '@/lib/auth';
import { hasAiKey } from '@/lib/ai';
import { isPro } from '@/lib/billing-store';
import { FREE_TUTOR_DAILY, getTutorUsageToday, incrementTutorUsage } from '@/lib/tutor-usage';
import { runLessonAssistant, type ChatMessage, type LessonContext } from '@/lib/lesson-assistant';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * The single assistant endpoint.
 *
 * Replaces `/api/tutor` (lesson-scoped, read-only) and the lesson half of
 * `/api/courses/chat`. One route means one place where auth, rate limiting,
 * guardrails and usage accounting are applied — the previous split had the
 * daily limit on one path and the content screening on the other.
 */

type Body = {
  context?: LessonContext;
  messages?: ChatMessage[];
  /** Set by the reader when the signed-in user owns the course being read. */
  canEdit?: boolean;
};

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Please sign in to use the assistant.' }, { status: 401 });

  /* Metered by cost. Several model calls per request, so a repeated click
     should not repeat the spend. The daily free-tier allowance below is a
     separate concern: that one is about pricing, this one is about load. */
  const rate = checkRate(user.id, 'assistant');
  if (!rate.allowed) return rateLimited(rate);

  if (!hasAiKey()) {
    return NextResponse.json(
      { error: 'The assistant needs an API key. Add ANTHROPIC_API_KEY and restart.' },
      { status: 503 },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const context = body.context;
  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (!context?.lessonTitle || messages.length === 0) {
    return NextResponse.json({ error: 'Missing lesson context or message.' }, { status: 400 });
  }

  /* Free tier is metered; Pro is not. Generation stays the headline paid
     feature, so a modest free allowance here is affordable. */
  const pro = await isPro(user.id);
  if (!pro) {
    const used = await getTutorUsageToday(user.id);
    if (used >= FREE_TUTOR_DAILY) {
      return NextResponse.json(
        { error: `You have used today's ${FREE_TUTOR_DAILY} free questions. Pro removes the limit.`, limited: true },
        { status: 429 },
      );
    }
  }

  try {
    /* `canEdit` arrives from the client and is a *request*, not a grant — the
       real check is ownership, resolved server-side below. Trusting the flag
       would let any reader rewrite any course. */
    const canEdit = body.canEdit === true && (await ownsCourse(user.id, context.courseTitle));

    const result = await runLessonAssistant({ context, messages, canEdit });

    /* Refusals are not billed: a blocked message did no work. */
    if (!pro && !result.refused) await incrementTutorUsage(user.id);

    const remaining = pro ? null : Math.max(0, FREE_TUTOR_DAILY - (await getTutorUsageToday(user.id)));
    return NextResponse.json({ ...result, remaining });
  } catch (err) {
    /* Logged with context for the operator, generic for the client. */
    console.error('[assistant]', { userId: user.id, lesson: context.lessonTitle, err });
    return NextResponse.json({ error: 'The assistant could not answer that. Try again.' }, { status: 502 });
  }
}

/** Does this user author a course by that title? Editing requires ownership. */
async function ownsCourse(userId: string, courseTitle: string): Promise<boolean> {
  const { getDb } = await import('@/lib/db');
  const db = await getDb();
  const res = await db.query(
    `SELECT 1 FROM courses WHERE user_id = $1 AND title = $2
      UNION ALL
     SELECT 1 FROM classes WHERE instructor_id = $1 AND title = $2
     LIMIT 1`,
    [userId, courseTitle],
  );
  return res.rows.length > 0;
}
