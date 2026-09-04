import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { setApplicationState, type AppState } from '@/lib/jobs-store';
import { isLearner } from '../route';

export const runtime = 'nodejs';

/**
 * States a candidate may set themselves.
 *
 * Every one of these is a fact the person knows first-hand: they applied, they
 * heard back, they are preparing. There is no SUBMITTING state because nothing
 * here submits on their behalf.
 */
const ALLOWED: AppState[] = ['MATCHED', 'PREPARING', 'READY', 'NEEDS_USER_INPUT', 'APPLIED', 'INTERVIEW', 'REJECTED', 'OFFER', 'SKIPPED'];

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isLearner(user.role)) return NextResponse.json({ error: 'Not available for this account type.' }, { status: 403 });

  let jobId = '';
  let state: AppState = 'MATCHED';
  try {
    const body = (await req.json()) as { jobId?: unknown; state?: unknown };
    jobId = String(body.jobId ?? '');
    const s = String(body.state ?? '') as AppState;
    if (!ALLOWED.includes(s)) return NextResponse.json({ error: 'Unknown state.' }, { status: 400 });
    state = s;
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  if (!jobId) return NextResponse.json({ error: 'Missing job.' }, { status: 400 });

  const ok = await setApplicationState(user.id, jobId, state);
  if (!ok) return NextResponse.json({ error: 'That job no longer exists.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
