import { randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { getDb } from '../db';
import { applyDomain } from '../job-settings';
import { sendMail, mailConfigured } from './send';
import { classifyMail, detectEvent, type MailCategory } from './classify';

/**
 * Inbound mail for application aliases.
 *
 * The alias is a catch-all on a domain we own, so a provider (Cloudflare Email
 * Routing, Postmark inbound, SES + SNS) accepts anything at that domain and
 * POSTs it to the webhook. This module turns that POST into a stored message
 * routed to the right person.
 *
 * Two things make the alias worth having rather than decorative: verification
 * codes become available to the application flow, and recruiter replies can be
 * forwarded on so the candidate is not required to check a second inbox.
 */

export type InboundMessage = {
  id: string;
  alias: string;
  fromAddr: string;
  fromName: string;
  subject: string;
  body: string;
  otp: string;
  company: string;
  category: MailCategory;
  receivedAt: number;
  forwardedAt: number | null;
  readAt: number | null;
};

/* ── Webhook authentication ──────────────────────────────────────────────── */

/**
 * The webhook is a public URL that writes to the database, so it is
 * authenticated by a shared secret.
 *
 * Compared in constant time: a plain `===` on a secret leaks its prefix
 * through timing, and this endpoint is reachable by anyone who finds the path.
 * With no secret configured the endpoint refuses everything rather than
 * defaulting open.
 */
export function verifyWebhookSecret(provided: string | null): boolean {
  const expected = process.env.MAIL_WEBHOOK_SECRET?.trim();
  if (!expected || !provided) return false;
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

/* ── Parsing ─────────────────────────────────────────────────────────────── */

/** The local part of whichever recipient belongs to our apply domain. */
export function aliasFromRecipients(recipients: string[]): string | null {
  const domain = applyDomain();
  if (!domain) return null;
  const suffix = `@${domain.toLowerCase()}`;

  for (const raw of recipients) {
    /* Handles "Name <local@domain>" as well as a bare address. */
    const addr = (raw.match(/<([^>]+)>/)?.[1] ?? raw).trim().toLowerCase();
    if (addr.endsWith(suffix)) return addr.slice(0, -suffix.length);
  }
  return null;
}

/**
 * Pull a one-time code out of a message.
 *
 * Anchored to nearby wording rather than matching any digit run, because a
 * message full of dates, salary figures and reference numbers offers plenty of
 * 6-digit strings that are not codes. A wrong code typed into an employer's
 * form is worse than no code, so this returns nothing unless the context is
 * explicit.
 */
export function extractOtp(subject: string, body: string): string {
  const text = `${subject}\n${body}`;

  const patterns: RegExp[] = [
    /\b(?:verification|security|confirmation|access|one[-\s]?time|login|sign[-\s]?in)\s+code\s*(?:is)?\s*[:\-]?\s*([0-9]{4,8})\b/i,
    /\bcode\s*[:\-]\s*([0-9]{4,8})\b/i,
    /\byour\s+code\s+is\s+([0-9]{4,8})\b/i,
    /\b([0-9]{4,8})\s+is\s+your\s+(?:verification|security|login|one[-\s]?time)\s+code\b/i,
    /\bOTP\s*[:\-]?\s*([0-9]{4,8})\b/i,
  ];

  for (const p of patterns) {
    const m = text.match(p);
    if (m?.[1]) return m[1];
  }
  return '';
}

/** Best guess at the employer, from the sender's domain. */
export function companyFromSender(fromAddr: string): string {
  const domain = fromAddr.split('@')[1]?.toLowerCase() ?? '';
  if (!domain) return '';
  /* ATS vendors send on the employer's behalf, so their domain names the tool
     rather than the company. Named as the vendor instead of guessed wrongly. */
  const vendors: Record<string, string> = {
    'greenhouse.io': 'Greenhouse',
    'us.greenhouse-mail.io': 'Greenhouse',
    'lever.co': 'Lever',
    'hire.lever.co': 'Lever',
    'myworkday.com': 'Workday',
    'icims.com': 'iCIMS',
    'smartrecruiters.com': 'SmartRecruiters',
    'ashbyhq.com': 'Ashby',
  };
  for (const [d, name] of Object.entries(vendors)) if (domain.endsWith(d)) return name;

  const label = domain.split('.').slice(-2)[0] ?? '';
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : '';
}

/* ── Storage ─────────────────────────────────────────────────────────────── */

/** Resolve an alias local-part to the user who owns it. */
export async function userForAlias(alias: string): Promise<{ userId: string; email: string } | null> {
  const db = await getDb();
  const res = await db.query<{ user_id: string; email: string }>(
    `SELECT s.user_id, u.email FROM job_settings s
       JOIN users u ON u.id = s.user_id
      WHERE lower(s.apply_alias) = lower($1)`,
    [alias],
  );
  const row = res.rows[0];
  return row ? { userId: String(row.user_id), email: String(row.email) } : null;
}

export type StoreResult =
  | { status: 'stored'; userId: string; otp: string; messageId: string; category: MailCategory }
  | { status: 'duplicate' }
  | { status: 'unknown_alias'; alias: string };

export async function storeInbound(input: {
  providerMessageId: string;
  recipients: string[];
  fromAddr: string;
  fromName: string;
  subject: string;
  body: string;
}): Promise<StoreResult> {
  const alias = aliasFromRecipients(input.recipients);
  if (!alias) return { status: 'unknown_alias', alias: input.recipients.join(', ').slice(0, 200) };

  const owner = await userForAlias(alias);
  /* Mail for an address nobody owns is dropped rather than stored against a
     guess. A catch-all receives a lot of spam aimed at invented names. */
  if (!owner) return { status: 'unknown_alias', alias };

  const otp = extractOtp(input.subject, input.body);
  const category = classifyMail(input.subject, input.body);
  const id = input.providerMessageId || randomUUID();
  const db = await getDb();

  /* ON CONFLICT DO NOTHING, so a provider retry after a timeout does not
     produce a second copy of the same recruiter email. */
  const company = companyFromSender(input.fromAddr);
  const res = await db.query(
    `INSERT INTO inbound_mail (id, user_id, alias, from_addr, from_name, subject, body, otp, company, category, received_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (id) DO NOTHING`,
    [
      id,
      owner.userId,
      alias,
      input.fromAddr.slice(0, 320),
      input.fromName.slice(0, 200),
      input.subject.slice(0, 500),
      input.body.slice(0, 40_000),
      otp,
      company,
      category,
      Date.now(),
    ],
  );

  if (res.affectedRows === 0) return { status: 'duplicate' };

  /* An invitation with a parseable date becomes a provisional calendar entry.
     Marked unconfirmed and sourced as 'detected', because a date read out of
     prose is a guess — it shows up so the candidate can correct it, not so the
     app can assert it. */
  if (category === 'INTERVIEW' || category === 'ASSESSMENT') {
    const event = detectEvent(`${input.subject}\n${input.body}`);
    if (event.startsAt || event.scheduleUrl) {
      await db
        .query(
          `INSERT INTO interviews
             (id, user_id, company, title, kind, starts_at, location, notes, source, confirmed, mail_id, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'detected',FALSE,$9,$10,$10)`,
          [
            randomUUID(),
            owner.userId,
            company,
            input.subject.slice(0, 200),
            category === 'ASSESSMENT' ? 'ASSESSMENT' : 'INTERVIEW',
            event.startsAt,
            event.location || event.scheduleUrl,
            event.scheduleUrl ? `Booking link: ${event.scheduleUrl}` : '',
            id,
            Date.now(),
          ],
        )
        .catch(() => {
          /* A calendar entry is a convenience; losing one must never reject
             the message that produced it. */
        });
    }
  }

  return { status: 'stored', userId: owner.userId, otp, messageId: id, category };
}

/* ── Forwarding ──────────────────────────────────────────────────────────── */

/**
 * Copy a message to the candidate's own inbox.
 *
 * Reply-to is set to the original sender so answering the forward reaches the
 * recruiter, not us. Failure is recorded by leaving `forwarded_at` null, which
 * is what makes a provider outage visible instead of silent.
 */
export async function forwardToUser(messageId: string): Promise<{ forwarded: boolean; reason: string }> {
  if (!mailConfigured()) return { forwarded: false, reason: 'No mail provider configured.' };

  const db = await getDb();
  const res = await db.query<Record<string, unknown>>(
    `SELECT m.*, u.email AS user_email FROM inbound_mail m
       JOIN users u ON u.id = m.user_id
      WHERE m.id = $1`,
    [messageId],
  );
  const row = res.rows[0];
  if (!row) return { forwarded: false, reason: 'No such message.' };
  if (row.forwarded_at != null) return { forwarded: true, reason: 'Already forwarded.' };

  const otp = String(row.otp ?? '');
  const subject = String(row.subject ?? '(no subject)');
  const result = await sendMail({
    to: String(row.user_email),
    replyTo: String(row.from_addr ?? '') || undefined,
    subject: otp ? `Code ${otp} — ${subject}` : `Job application mail: ${subject}`,
    text: [
      otp ? `Verification code: ${otp}\n` : '',
      `From: ${String(row.from_name ?? '')} <${String(row.from_addr ?? '')}>`,
      `To your application address: ${String(row.alias)}@${applyDomain() ?? ''}`,
      '',
      String(row.body ?? ''),
    ]
      .filter(Boolean)
      .join('\n'),
  });

  if (result.sent) {
    await db.query('UPDATE inbound_mail SET forwarded_at = $1 WHERE id = $2', [Date.now(), messageId]);
  }
  return { forwarded: result.sent, reason: result.reason };
}

/* ── Reading ─────────────────────────────────────────────────────────────── */

export async function listInbound(userId: string, limit = 50): Promise<InboundMessage[]> {
  const db = await getDb();
  const res = await db.query<Record<string, unknown>>(
    `SELECT * FROM inbound_mail WHERE user_id = $1 ORDER BY received_at DESC LIMIT $2`,
    [userId, limit],
  );
  return res.rows.map((r) => ({
    id: String(r.id),
    alias: String(r.alias),
    fromAddr: String(r.from_addr ?? ''),
    fromName: String(r.from_name ?? ''),
    subject: String(r.subject ?? ''),
    body: String(r.body ?? ''),
    otp: String(r.otp ?? ''),
    company: String(r.company ?? ''),
    category: String(r.category ?? 'OTHER') as MailCategory,
    receivedAt: Number(r.received_at),
    forwardedAt: r.forwarded_at == null ? null : Number(r.forwarded_at),
    readAt: r.read_at == null ? null : Number(r.read_at),
  }));
}

/**
 * The most recent unused code for a user, within a freshness window.
 *
 * Codes expire, and handing a run a code from last week guarantees a failed
 * verification that looks like a bug. Ten minutes is the shortest window every
 * major ATS honours.
 */
export async function latestOtp(userId: string, maxAgeMs = 10 * 60_000): Promise<string | null> {
  const db = await getDb();
  const res = await db.query<{ otp: string }>(
    `SELECT otp FROM inbound_mail
      WHERE user_id = $1 AND otp <> '' AND received_at > $2
      ORDER BY received_at DESC LIMIT 1`,
    [userId, Date.now() - maxAgeMs],
  );
  return res.rows[0]?.otp ?? null;
}

/**
 * The code for one specific application.
 *
 * Prefer this over `latestOtp` everywhere an application is in flight. The
 * older function returns whatever arrived most recently, which is correct only
 * when exactly one application is running -- and a batch, which is the point of
 * the product, is when it is most wrong. Three codes inside a minute and the
 * form gets whichever landed last, so one employer's code is typed into
 * another's field, fails, and stalls the run with no explanation.
 *
 * Returns null when nothing can be tied to this application with confidence.
 * That parks the run for the candidate, which is the right outcome: a wrong
 * code burns the employer's verification step.
 */
export async function otpFor(
  userId: string,
  expect: { jobId: string; company: string; ats: string; since: number },
  maxAgeMs = 10 * 60_000,
): Promise<string | null> {
  const { matchOtp } = await import('./correlation');
  const db = await getDb();

  const res = await db.query<Record<string, unknown>>(
    `SELECT id, from_addr, subject, company, otp, received_at FROM inbound_mail
      WHERE user_id = $1 AND otp <> '' AND received_at > $2
      ORDER BY received_at DESC LIMIT 25`,
    [userId, Math.min(expect.since, Date.now() - maxAgeMs) - 60_000],
  );

  const hit = matchOtp(
    { ...expect, expiresAt: Date.now() + maxAgeMs },
    res.rows.map((r) => ({
      id: String(r.id),
      fromAddr: String(r.from_addr ?? ''),
      subject: String(r.subject ?? ''),
      company: String(r.company ?? ''),
      otp: String(r.otp ?? ''),
      receivedAt: Number(r.received_at ?? 0),
    })),
  );

  return hit?.code ?? null;
}
