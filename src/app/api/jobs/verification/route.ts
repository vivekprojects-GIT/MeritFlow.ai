import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { isLearner } from '../route';
import { getVault, saveAnswer } from '@/lib/autopilot/answer-vault';
import { grantAuthorization, listAuthorizations, revokeAuthorization } from '@/lib/autopilot/authorization';
import { checkRate, rateLimited } from '@/lib/rate-limit';

export const runtime = 'nodejs';

/**
 * The two assertions only the candidate can make.
 *
 * Both were built into the engine with no way to reach them, which made the
 * readiness report permanently blocked and the whole autonomous path
 * unreachable — a gate nobody can open is not a gate, it is a wall.
 *
 * ## Why these are not ordinary settings
 *
 * Everything else in settings is a preference: wrong is inconvenient. These
 * two change what the system will say in the candidate's name to an employer.
 *
 * The completeness flags license a *negative* — "I have never worked there" —
 * which cannot be derived from a résumé, because a résumé omits short
 * contracts and agency placements as a matter of course. The authorization
 * licenses agreeing to something. Neither may be inferred, defaulted, or set as
 * a side effect of anything else, so both live behind their own explicit act.
 */

const HISTORY_INTENTS = {
  employment: 'HISTORY.EMPLOYMENT_COMPLETE',
  consulting: 'HISTORY.CONSULTING_COMPLETE',
  clients: 'HISTORY.CLIENTS_COMPLETE',
} as const;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isLearner(user.role)) return NextResponse.json({ error: 'Not available for this account type.' }, { status: 403 });

  const vault = await getVault(user.id);
  const asserted = (intent: string) => /^(yes|true|complete)$/i.test((vault.get(intent)?.value ?? '').trim());

  return NextResponse.json({
    history: {
      employment: asserted(HISTORY_INTENTS.employment),
      consulting: asserted(HISTORY_INTENTS.consulting),
      clients: asserted(HISTORY_INTENTS.clients),
      otherEmployers: vault.get('HISTORY.ALL_EMPLOYERS')?.value ?? '',
    },
    authorizations: await listAuthorizations(user.id),
  });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isLearner(user.role)) return NextResponse.json({ error: 'Not available for this account type.' }, { status: 403 });

  const rate = checkRate(user.id, 'write');
  if (!rate.allowed) return rateLimited(rate);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Expected JSON.' }, { status: 400 });
  }

  /* ── The completeness assertions ──────────────────────────────────────── */
  if (body.action === 'history') {
    /*
     * Written as USER_VERIFIED because that is exactly what they are: a
     * statement by the candidate about their own record. Nothing else in the
     * system may write these intents, and `derive` reads them only through that
     * provenance — so a value arriving any other way cannot license a negative.
     */
    for (const [key, intent] of Object.entries(HISTORY_INTENTS)) {
      const value = body[key];
      if (typeof value !== 'boolean') continue;
      await saveAnswer(user.id, {
        intent,
        value: value ? 'Yes' : 'No',
        provenance: 'USER_VERIFIED',
        verified: true,
        sensitivity: 'NORMAL_FACT',
      });
    }

    if (typeof body.otherEmployers === 'string') {
      await saveAnswer(user.id, {
        intent: 'HISTORY.ALL_EMPLOYERS',
        value: body.otherEmployers.slice(0, 2000),
        provenance: 'USER_VERIFIED',
        verified: true,
        sensitivity: 'NORMAL_FACT',
      });
    }

    return NextResponse.json({ ok: true });
  }

  /* ── Consent ──────────────────────────────────────────────────────────── */
  if (body.action === 'authorize') {
    const type = String(body.type ?? '').trim().toUpperCase();
    const scope = String(body.scope ?? '').trim() || '*';
    const exactText = String(body.exactText ?? '').trim();

    if (!type || !exactText) {
      return NextResponse.json({ error: 'An authorization needs a type and the exact wording.' }, { status: 400 });
    }

    try {
      const granted = await grantAuthorization(user.id, {
        type,
        scope,
        exactText,
        policyUrl: typeof body.policyUrl === 'string' ? body.policyUrl : undefined,
        /* `authorizedByUser` is not read from the request. It is true because
           this endpoint requires the candidate's own session, and accepting it
           as input would mean a caller could assert consent for someone else. */
        authorizedByUser: true,
      });
      return NextResponse.json({ authorization: granted });
    } catch (err) {
      /* The refusals are deliberate — a class-wide grant for arbitration, say —
         and the message explains which one fired. */
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not authorize that.' }, { status: 400 });
    }
  }

  if (body.action === 'revoke') {
    const id = String(body.id ?? '').trim();
    if (!id) return NextResponse.json({ error: 'Which authorization?' }, { status: 400 });
    await revokeAuthorization(user.id, id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
