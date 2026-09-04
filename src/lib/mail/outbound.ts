import { randomUUID } from 'node:crypto';
import { getDb } from '../db';
import { sendMail, mailConfigured } from './send';
import { applyDomain, getJobSettings } from '../job-settings';

/**
 * Mail the candidate sends from their application address.
 *
 * Replies go out with the alias as the From, so a recruiter's thread stays on
 * the address the application used rather than jumping to a personal inbox
 * the employer has never seen.
 *
 * Failures are stored, not swallowed. A message someone believes they sent and
 * did not is the worst outcome available here.
 */

export type Sent = {
  id: string;
  toAddr: string;
  subject: string;
  body: string;
  replyToId: string | null;
  status: 'sent' | 'failed';
  error: string;
  sentAt: number;
};

export async function listOutbound(userId: string, limit = 50): Promise<Sent[]> {
  const db = await getDb();
  const res = await db.query<Record<string, unknown>>(
    'SELECT * FROM outbound_mail WHERE user_id = $1 ORDER BY sent_at DESC LIMIT $2',
    [userId, limit],
  );
  return res.rows.map((r) => ({
    id: String(r.id),
    toAddr: String(r.to_addr ?? ''),
    subject: String(r.subject ?? ''),
    body: String(r.body ?? ''),
    replyToId: r.reply_to_id == null ? null : String(r.reply_to_id),
    status: String(r.status) === 'failed' ? 'failed' : 'sent',
    error: String(r.error ?? ''),
    sentAt: Number(r.sent_at),
  }));
}

export type SendOutcome = { ok: boolean; id: string; reason: string };

export async function sendFromAlias(
  userId: string,
  input: { to: string; subject: string; body: string; replyToId?: string },
): Promise<SendOutcome> {
  const id = randomUUID();

  /* Validated before anything is stored: a malformed address is the
     candidate's typo, not a delivery failure, and should read that way. */
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.to.trim())) {
    return { ok: false, id, reason: 'That does not look like an email address.' };
  }
  if (!input.subject.trim() && !input.body.trim()) {
    return { ok: false, id, reason: 'Add a subject or a message before sending.' };
  }
  if (!mailConfigured()) {
    return { ok: false, id, reason: 'Sending is not configured yet, so this would not have reached anyone.' };
  }

  const settings = await getJobSettings(userId);
  const domain = applyDomain();
  const from = settings.applyAlias && domain ? `${settings.applyAlias}@${domain}` : undefined;

  const result = await sendMail({
    to: input.to.trim(),
    subject: input.subject.trim() || '(no subject)',
    text: input.body,
    from,
    /* Replies come back to the same alias, which is the whole point of
       sending from it. */
    replyTo: from,
  });

  const db = await getDb();
  await db.query(
    `INSERT INTO outbound_mail (id, user_id, to_addr, subject, body, reply_to_id, status, error, sent_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      id,
      userId,
      input.to.trim().slice(0, 320),
      input.subject.slice(0, 500),
      input.body.slice(0, 40_000),
      input.replyToId ?? null,
      result.sent ? 'sent' : 'failed',
      result.sent ? '' : result.reason.slice(0, 500),
      Date.now(),
    ],
  );

  return { ok: result.sent, id, reason: result.reason };
}
