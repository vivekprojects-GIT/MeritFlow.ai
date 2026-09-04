import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { gateOverview, setClassGate, setStudentOverride, type GateKey } from '@/lib/assessment-gates';

export const runtime = 'nodejs';

/** Valid gate keys are 'exam' or 'quiz:<n>'. Anything else is rejected. */
function parseGateKey(raw: unknown): GateKey | null {
  const s = String(raw ?? '');
  if (s === 'exam') return 'exam';
  const m = /^quiz:(\d{1,3})$/.exec(s);
  return m ? (`quiz:${Number(m[1])}` as GateKey) : null;
}

/** Every gate in the class, with per-student exceptions. Instructor only. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;

  const db = await getDb();
  const cls = await db.query<{ data: string }>('SELECT data FROM classes WHERE id = $1 AND instructor_id = $2', [id, user.id]);
  if (cls.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let moduleTitles: string[] = [];
  try {
    const course = JSON.parse(cls.rows[0].data) as { modules?: { title: string }[] };
    moduleTitles = (course.modules ?? []).map((m) => m.title);
  } catch {
    /* A malformed course still has an exam gate; show what we can. */
  }

  const gates = await gateOverview(user.id, id, moduleTitles);
  if (!gates) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ gates });
}

/** Open/close a gate for the class, or for one learner. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;

  let body: { gate?: unknown; open?: unknown; studentId?: unknown; reason?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const gate = parseGateKey(body.gate);
  if (!gate) return NextResponse.json({ error: 'Unknown assessment.' }, { status: 400 });

  /* A per-student call carries a studentId; `open: null` clears the override
     and returns that learner to the class default. */
  if (typeof body.studentId === 'string' && body.studentId) {
    const open = body.open === null ? null : body.open === true;
    const ok = await setStudentOverride(user.id, id, body.studentId, gate, open, String(body.reason ?? ''));
    if (!ok) return NextResponse.json({ error: 'That learner is not in this class.' }, { status: 403 });
    return NextResponse.json({ ok: true });
  }

  if (typeof body.open !== 'boolean') {
    return NextResponse.json({ error: 'Specify whether to open or close it.' }, { status: 400 });
  }
  const ok = await setClassGate(user.id, id, gate, body.open);
  if (!ok) return NextResponse.json({ error: 'You do not own this class.' }, { status: 403 });
  return NextResponse.json({ ok: true });
}
