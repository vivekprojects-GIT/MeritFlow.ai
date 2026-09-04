import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { isLearner } from '../route';
import { ensureApplyAlias, ensureReferralCode, getJobSettings, saveJobSettings, applyDomain } from '@/lib/job-settings';
import { getVault, saveAnswer, type QuestionClass } from '@/lib/autopilot/answer-vault';
import { getCandidateProfile } from '@/lib/jobs-store';
import { getBillingState } from '@/lib/billing-store';
import { getDb } from '@/lib/db';
import { listInbound } from '@/lib/mail/inbound';
import { mailConfigured } from '@/lib/mail/send';
import { submitEnabledFor, type AtsVendor } from '@/lib/autopilot/execution-policy';

const SUBMITTABLE: AtsVendor[] = ['greenhouse', 'lever', 'ashby', 'smartrecruiters', 'icims', 'workday'];
const VENDOR_LABEL: Record<string, string> = {
  greenhouse: 'Greenhouse',
  lever: 'Lever',
  ashby: 'Ashby',
  smartrecruiters: 'SmartRecruiters',
  icims: 'iCIMS',
  workday: 'Workday',
};

export const runtime = 'nodejs';

/**
 * Where the listings actually came from.
 *
 * Reported as counts of live rows rather than as a list of toggles for boards
 * we do not integrate. A switch labelled "LinkedIn" that changes nothing is
 * worse than an honest empty state.
 */
async function jobSources(): Promise<{ source: string; open: number }[]> {
  const db = await getDb();
  const res = await db.query<{ source: string; n: string }>(
    "SELECT source, COUNT(*) AS n FROM jobs WHERE status = 'open' GROUP BY source ORDER BY n DESC",
  );
  return res.rows.map((r) => ({ source: String(r.source), open: Number(r.n) }));
}

/** Everything the settings screen renders, in one round trip. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isLearner(user.role)) return NextResponse.json({ error: 'Not available for this account type.' }, { status: 403 });

  const [settings, vault, candidate, billing, alias, referral, sources] = await Promise.all([
    getJobSettings(user.id),
    getVault(user.id),
    getCandidateProfile(user.id),
    getBillingState(user.id),
    ensureApplyAlias(user.id, user.email),
    ensureReferralCode(user.id),
    jobSources(),
  ]);

  /* The inbox for the apply alias. Without it the address is a string on a
     settings page; with it, the candidate can actually read what arrives. */
  const mail = await listInbound(user.id, 25);

  /* The vault is the editable record of every answer the candidate gave. It is
     returned in full so Settings can show and change any of it — the gap being
     fixed here is that onboarding wrote these once and nothing could revise
     them. Sensitive answers are included because they are the user's own. */
  const answers = [...vault.values()].map((a) => ({
    intent: a.intent,
    value: a.value,
    provenance: a.provenance,
    sensitivity: a.sensitivity,
    autopilotOk: a.autopilotOk,
    updatedAt: a.updatedAt,
  }));

  return NextResponse.json({
    settings,
    answers,
    resume: candidate ? { name: candidate.resumeName, chars: candidate.resumeText.length } : null,
    billing,
    applyEmail: alias,
    applyDomainConfigured: Boolean(applyDomain()),
    referralCode: referral,
    sources,
    account: { email: user.email, role: user.role, accountKind: user.accountKind },
    /* Bodies are omitted from the list: the subject, sender and any code are
       what the screen renders, and shipping every full message body on a
       settings load is a lot of the user's own mail over the wire. */
    mail: mail.map((m) => ({
      id: m.id,
      fromName: m.fromName || m.fromAddr,
      subject: m.subject,
      otp: m.otp,
      company: m.company,
      receivedAt: m.receivedAt,
      forwarded: m.forwardedAt != null,
    })),
    mailForwardingConfigured: mailConfigured(),
    submitVendors: SUBMITTABLE.filter((v) => submitEnabledFor(v)).map((v) => VENDOR_LABEL[v] ?? v),
  });
}

/** Update settings, or edit a single stored answer. */
export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isLearner(user.role)) return NextResponse.json({ error: 'Not available for this account type.' }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  /* Editing one vault answer. Re-saved as USER_VERIFIED because the person
     just typed it — which is exactly the provenance Autopilot may act on. */
  if (typeof body.intent === 'string') {
    const value = String(body.value ?? '');
    const vault = await getVault(user.id);
    const existing = vault.get(body.intent);
    if (!existing) return NextResponse.json({ error: 'No such saved answer.' }, { status: 404 });
    await saveAnswer(user.id, {
      intent: body.intent,
      value,
      provenance: 'USER_VERIFIED',
      verified: true,
      sensitivity: existing.sensitivity as QuestionClass,
    });
    return NextResponse.json({ ok: true });
  }

  const bool = (k: string) => (typeof body[k] === 'boolean' ? (body[k] as boolean) : undefined);
  const settings = await saveJobSettings(user.id, {
    optimization: typeof body.optimization === 'string' ? (body.optimization as never) : undefined,
    autoApprove: bool('autoApprove'),
    autoSubmit: bool('autoSubmit'),
    reviewBefore: bool('reviewBefore'),
    publicPortfolio: bool('publicPortfolio'),
    emailRecs: bool('emailRecs'),
    emailProduct: bool('emailProduct'),
    timezone: typeof body.timezone === 'string' ? body.timezone : undefined,
    emailPausedUntil:
      body.emailPausedUntil === null ? null : typeof body.emailPausedUntil === 'number' ? body.emailPausedUntil : undefined,
  });
  return NextResponse.json({ settings });
}
