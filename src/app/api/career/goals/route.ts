import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { matchRoles, roleById } from '@/lib/career/roles';
import { addGoal, goalSummaries, removeGoal } from '@/lib/career/goals-store';

export const runtime = 'nodejs';

/** Every goal the learner is working toward, each with where they stand. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ goals: await goalSummaries(user.id) });
}

/**
 * Add a goal.
 *
 * When the wording fits several careers the choices come back rather than one
 * being picked. Civil and structural engineering are different jobs, and
 * choosing for someone sends them down the wrong path without telling them.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { text?: string; roleId?: string };
  const text = String(body.text ?? '').trim();
  const roleId = String(body.roleId ?? '').trim();

  if (!text && !roleId) return NextResponse.json({ error: 'Tell us what you want to become.' }, { status: 400 });
  if (roleId && !roleById(roleId)) {
    return NextResponse.json({ error: 'That is not a career we know yet.' }, { status: 400 });
  }

  if (!roleId) {
    const matches = matchRoles(text);
    if (matches.length > 1) {
      return NextResponse.json({
        needsChoice: true,
        text,
        options: matches.map((r) => ({ roleId: r.id, title: r.title, summary: r.summary })),
      });
    }
    if (matches.length === 0) {
      return NextResponse.json(
        {
          error:
            'We could not match that to a career we track yet. Try naming the work — "design buildings", "work with data".',
        },
        { status: 400 },
      );
    }
  }

  await addGoal(user.id, text, roleId || null);
  return NextResponse.json({ goals: await goalSummaries(user.id) });
}

/** Drop a goal. The courses generated for it are kept — that study still happened. */
export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { goalId?: string };
  const goalId = String(body.goalId ?? '').trim();
  if (!goalId) return NextResponse.json({ error: 'Which goal?' }, { status: 400 });

  await removeGoal(user.id, goalId);
  return NextResponse.json({ goals: await goalSummaries(user.id) });
}
