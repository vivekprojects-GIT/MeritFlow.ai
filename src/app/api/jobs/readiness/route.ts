import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { isLearner } from '../route';
import { candidateReadiness } from '@/lib/autopilot/candidate-readiness';
import { saveAnswer } from '@/lib/autopilot/answer-vault';
import { savePolicy } from '@/lib/autopilot/policy-engine';
import { grantAuthorization } from '@/lib/autopilot/authorization';

export const runtime = 'nodejs';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isLearner(user.role)) return NextResponse.json({ error: 'Not available for this account type.' }, { status: 403 });

  return NextResponse.json(await candidateReadiness(user.id));
}

/**
 * Record one fact, or confirm one the résumé supplied.
 *
 * Everything written here is `USER_VERIFIED`, because everything here was
 * either typed by the candidate or explicitly confirmed by them. That is the
 * provenance the submit gate requires, and the reason confirming a parsed value
 * is worth a click rather than being assumed.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isLearner(user.role)) return NextResponse.json({ error: 'Not available for this account type.' }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { key?: string; value?: string } | null;
  const key = body?.key?.trim();
  const value = body?.value?.trim();
  if (!key || !value) return NextResponse.json({ error: 'A key and a value are required.' }, { status: 400 });

  /* The salary floor is policy, not an answer: the engine filters on it before
     a form is ever opened, so it has to live where the queue can read it. */
  if (key === 'POLICY.MIN_COMP') {
    const amount = Number(value.replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Give a salary figure.' }, { status: 400 });
    }
    await savePolicy(user.id, { minComp: Math.round(amount) });
    return NextResponse.json(await candidateReadiness(user.id));
  }

  /*
   * Authorisations are not answers and never go through the vault.
   *
   * `grantAuthorization` refuses a class-wide grant for the agreements that
   * must be read individually — arbitration, background checks, releases,
   * non-competes, IP assignment — so a request for one of those fails here
   * rather than being quietly recorded.
   */
  if (key.startsWith('AUTH.')) {
    const type = key.slice('AUTH.'.length);
    try {
      await grantAuthorization(user.id, {
        type,
        scope: '*',
        /* Class-wide, so the exact text is the class rather than one form's
           wording. The per-form check still compares against what is on the
           page before anything is ticked. */
        exactText: '*',
        allowedForAutoSubmit: true,
        authorizedByUser: true,
      });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'That cannot be authorised in advance.' }, { status: 400 });
    }
    return NextResponse.json(await candidateReadiness(user.id));
  }

  await saveAnswer(user.id, {
    intent: key,
    value,
    provenance: 'USER_VERIFIED',
    verified: true,
    sensitivity: 'NORMAL_FACT',
  });

  return NextResponse.json(await candidateReadiness(user.id));
}
