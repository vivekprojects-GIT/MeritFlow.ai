import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { recordClassExam } from '@/lib/classes-store';
import { recordResponses } from '@/lib/item-analysis';
import { isOpenFor } from '@/lib/assessment-gates';

export const runtime = 'nodejs';

type ResponseInput = { qIndex: number; prompt: string; chosen: number; correctIndex: number };

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;

  let score = 0;
  let total = 0;
  let responses: ResponseInput[] = [];
  try {
    const body = (await req.json()) as { score?: unknown; total?: unknown; responses?: unknown };
    score = Number(body.score ?? 0);
    total = Number(body.total ?? 0);
    /* Optional, so an older client that only sends score/total still works. */
    if (Array.isArray(body.responses)) {
      responses = body.responses
        .filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
        .map((r) => ({
          qIndex: Number(r.qIndex),
          prompt: String(r.prompt ?? ''),
          chosen: Number(r.chosen),
          correctIndex: Number(r.correctIndex),
        }))
        .filter((r) => Number.isInteger(r.qIndex) && Number.isInteger(r.chosen) && Number.isInteger(r.correctIndex));
    }
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  /* The gate is enforced here, not only in the reader. A locked exam that is
     only hidden in the UI is still submittable with a single fetch. */
  const gate = await isOpenFor(id, user.id, 'exam');
  if (!gate.open) {
    return NextResponse.json({ error: gate.reason || 'The final exam is not open.' }, { status: 403 });
  }

  const passed = await recordClassExam(user.id, id, score, total);

  /* Item analysis is a side benefit, never a reason to fail a submission — a
     student's exam result must land even if this write does not. */
  try {
    await recordResponses(id, user.id, 'exam', responses);
  } catch {
    /* swallowed deliberately */
  }

  return NextResponse.json({ ok: true, passed });
}
