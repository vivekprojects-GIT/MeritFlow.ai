import { randomUUID } from 'node:crypto';
import { getDb } from './db';

/**
 * Messaging between a professor and their students.
 *
 * The rule that shapes everything here: you may only message someone you share
 * a class with. Without that, an inbox is an open channel between every user on
 * the platform — a spam and harassment surface, and a privacy leak (it would
 * confirm whether any given email has an account). `canMessage` is therefore
 * checked on send, never assumed by the caller.
 *
 * One table covers both shapes: a direct message has `recipient_id`, a class
 * announcement has `class_id` and no recipient.
 */

export type Message = {
  id: string;
  classId: string | null;
  senderId: string;
  senderEmail: string;
  recipientId: string | null;
  body: string;
  createdAt: number;
  readAt: number | null;
  mine: boolean;
};

export type Conversation = {
  withUserId: string;
  withEmail: string;
  classId: string | null;
  className: string | null;
  lastBody: string;
  lastAt: number;
  unread: number;
};

const MAX_BODY = 4000;

/**
 * True when the two users share a class, in either direction — or when the
 * sender is the administrator of the university the recipient studies in.
 *
 * The admin case is not a loosening of the rule so much as the same rule at the
 * next level up: a dashboard that names a stalled learner and then cannot reach
 * them has only moved the work somewhere else. It is still a closed relation —
 * an admin can reach learners inside their own institution and nobody else's.
 */
export async function canMessage(senderId: string, recipientId: string): Promise<boolean> {
  if (senderId === recipientId) return false;
  const db = await getDb();

  /* Personal accounts are outside any institution: no classmates, no
     instructor, nobody to reach. Enforced here rather than only in the UI,
     because a hidden button is not a permission. */
  const kinds = await db.query<{ id: string; account_kind: string | null }>(
    'SELECT id, account_kind FROM users WHERE id = $1 OR id = $2',
    [senderId, recipientId],
  );
  if (kinds.rows.some((r) => r.account_kind === 'personal')) return false;

  const shared = await db.query(
    `SELECT 1
       FROM classes c
       JOIN enrollments e ON e.class_id = c.id
      WHERE (c.instructor_id = $1 AND e.student_id = $2)
         OR (c.instructor_id = $2 AND e.student_id = $1)
      LIMIT 1`,
    [senderId, recipientId],
  );
  if (shared.rows.length > 0) return true;

  /* The recipient must be enrolled in a class taught by a professor of the
     university this sender administers. Enrolment is the link, not the
     university_id stamp on the user row — that is only set at signup. */
  const adminOf = await db.query(
    `SELECT 1
       FROM universities un
       JOIN users p       ON p.university_id = un.id
       JOIN classes c     ON c.instructor_id = p.id
       JOIN enrollments e ON e.class_id = c.id
      WHERE un.admin_id = $1 AND e.student_id = $2
      LIMIT 1`,
    [senderId, recipientId],
  );
  return adminOf.rows.length > 0;
}

export async function sendMessage(
  senderId: string,
  recipientId: string,
  body: string,
  classId?: string | null,
): Promise<Message | null> {
  const text = body.trim().slice(0, MAX_BODY);
  if (!text) return null;
  if (!(await canMessage(senderId, recipientId))) return null;

  const db = await getDb();
  const id = randomUUID();
  const now = Date.now();
  await db.query(
    `INSERT INTO messages (id, class_id, sender_id, recipient_id, body, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, classId ?? null, senderId, recipientId, text, now],
  );
  return {
    id,
    classId: classId ?? null,
    senderId,
    senderEmail: '',
    recipientId,
    body: text,
    createdAt: now,
    readAt: null,
    mine: true,
  };
}

/**
 * Announce to a whole class. Fans out to one row per student so each learner
 * gets it in their own inbox and unread state is tracked per person.
 */
export async function announceToClass(instructorId: string, classId: string, body: string): Promise<number> {
  const text = body.trim().slice(0, MAX_BODY);
  if (!text) return 0;

  const db = await getDb();
  const roster = await db.query<{ student_id: string }>(
    `SELECT e.student_id
       FROM enrollments e
       JOIN classes c ON c.id = e.class_id
      WHERE e.class_id = $1 AND c.instructor_id = $2`,
    [classId, instructorId],
  );
  if (roster.rows.length === 0) return 0;

  const now = Date.now();
  for (const row of roster.rows) {
    await db.query(
      `INSERT INTO messages (id, class_id, sender_id, recipient_id, body, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [randomUUID(), classId, instructorId, row.student_id, text, now],
    );
  }
  return roster.rows.length;
}

/** One entry per person you have exchanged messages with, newest first. */
export async function listConversations(userId: string): Promise<Conversation[]> {
  const db = await getDb();
  const res = await db.query<{
    other_id: string;
    email: string;
    class_id: string | null;
    title: string | null;
    body: string;
    created_at: string;
    unread: number;
  }>(
    `WITH threads AS (
       SELECT
         CASE WHEN m.sender_id = $1 THEN m.recipient_id ELSE m.sender_id END AS other_id,
         m.class_id, m.body, m.created_at,
         CASE WHEN m.recipient_id = $1 AND m.read_at IS NULL THEN 1 ELSE 0 END AS is_unread
       FROM messages m
       WHERE m.sender_id = $1 OR m.recipient_id = $1
     ),
     latest AS (
       SELECT DISTINCT ON (other_id) other_id, class_id, body, created_at
         FROM threads
        ORDER BY other_id, created_at DESC
     )
     SELECT l.other_id, u.email, l.class_id, c.title, l.body, l.created_at,
            COALESCE((SELECT SUM(is_unread)::int FROM threads t WHERE t.other_id = l.other_id), 0) AS unread
       FROM latest l
       JOIN users u ON u.id = l.other_id
       LEFT JOIN classes c ON c.id = l.class_id
      ORDER BY l.created_at DESC`,
    [userId],
  );

  return res.rows.map((r) => ({
    withUserId: r.other_id,
    withEmail: r.email,
    classId: r.class_id,
    className: r.title,
    lastBody: r.body,
    lastAt: Number(r.created_at),
    unread: Number(r.unread),
  }));
}

/** The full exchange with one person. Reading it marks their messages read. */
export async function readThread(userId: string, otherId: string): Promise<Message[]> {
  const db = await getDb();
  const res = await db.query<{
    id: string;
    class_id: string | null;
    sender_id: string;
    email: string;
    recipient_id: string | null;
    body: string;
    created_at: string;
    read_at: string | null;
  }>(
    `SELECT m.id, m.class_id, m.sender_id, u.email, m.recipient_id, m.body, m.created_at, m.read_at
       FROM messages m
       JOIN users u ON u.id = m.sender_id
      WHERE (m.sender_id = $1 AND m.recipient_id = $2)
         OR (m.sender_id = $2 AND m.recipient_id = $1)
      ORDER BY m.created_at ASC`,
    [userId, otherId],
  );

  await db.query(
    'UPDATE messages SET read_at = $1 WHERE recipient_id = $2 AND sender_id = $3 AND read_at IS NULL',
    [Date.now(), userId, otherId],
  );

  return res.rows.map((r) => ({
    id: r.id,
    classId: r.class_id,
    senderId: r.sender_id,
    senderEmail: r.email,
    recipientId: r.recipient_id,
    body: r.body,
    createdAt: Number(r.created_at),
    readAt: r.read_at ? Number(r.read_at) : null,
    mine: r.sender_id === userId,
  }));
}

export async function unreadCount(userId: string): Promise<number> {
  const db = await getDb();
  const res = await db.query<{ n: number }>(
    'SELECT COUNT(*)::int AS n FROM messages WHERE recipient_id = $1 AND read_at IS NULL',
    [userId],
  );
  return Number(res.rows[0]?.n ?? 0);
}
