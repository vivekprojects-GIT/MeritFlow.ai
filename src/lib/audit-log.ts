import { randomUUID } from 'node:crypto';
import { getDb } from './db';

/**
 * Append-only access trail.
 *
 * Reading an individual student's record is a FERPA-relevant act. The defensible
 * position for an institution is not "only the right people can look" but "we
 * can show who looked", and that second one requires writing it down at the
 * moment of access rather than reconstructing it later from server logs.
 *
 * Nothing in the application updates or deletes a row here. That is the whole
 * point of an audit log, and it is worth more than the storage it costs.
 */

export type AuditEntry = {
  id: string;
  actorId: string;
  actorEmail: string;
  action: string;
  subject: string;
  detail: string;
  createdAt: number;
};

/**
 * Record an access. Never throws: an audit failure must not take down the
 * request it is describing, because a hard failure here would push the next
 * engineer to remove the call rather than fix it.
 */
export async function audit(actorId: string, action: string, subject = '', detail = ''): Promise<void> {
  try {
    const db = await getDb();
    await db.query(
      'INSERT INTO audit_log (id, actor_id, action, subject, detail, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
      [randomUUID(), actorId, action.slice(0, 80), subject.slice(0, 200), detail.slice(0, 500), Date.now()],
    );
  } catch {
    /* deliberately swallowed — see above */
  }
}

/** The trail for one university's admin, newest first. */
export async function recentAudit(actorId: string, limit = 100): Promise<AuditEntry[]> {
  const db = await getDb();
  const res = await db.query<{
    id: string;
    actor_id: string;
    email: string;
    action: string;
    subject: string;
    detail: string;
    created_at: string;
  }>(
    `SELECT a.id, a.actor_id, u.email, a.action, a.subject, a.detail, a.created_at
       FROM audit_log a JOIN users u ON u.id = a.actor_id
      WHERE a.actor_id = $1
      ORDER BY a.created_at DESC
      LIMIT $2`,
    [actorId, Math.min(limit, 500)],
  );
  return res.rows.map((r) => ({
    id: r.id,
    actorId: r.actor_id,
    actorEmail: r.email,
    action: r.action,
    subject: r.subject,
    detail: r.detail,
    createdAt: Number(r.created_at),
  }));
}
