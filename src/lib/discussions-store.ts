import { randomUUID } from 'node:crypto';
import { getDb } from './db';

/**
 * Class discussions.
 *
 * A flat two-level model: a post with no parent is a topic, a post with a
 * parent is a reply. Deeper nesting is deliberately not supported — it is
 * harder to follow and rarely used in a class.
 *
 * Access is by class membership: instructor or enrolled student. That check
 * lives here (`canAccessClass`) so no route can forget it.
 */

export type DiscussionPost = {
  id: string;
  authorId: string;
  authorEmail: string;
  authorRole: string;
  body: string;
  createdAt: number;
  mine: boolean;
};

export type DiscussionTopic = DiscussionPost & {
  title: string;
  lessonKey: string | null;
  pinned: boolean;
  replyCount: number;
  lastActivityAt: number;
};

const MAX_BODY = 6000;
const MAX_TITLE = 140;

/** Instructor of the class, or a student enrolled in it. */
export async function canAccessClass(userId: string, classId: string): Promise<boolean> {
  const db = await getDb();
  const res = await db.query(
    `SELECT 1 FROM classes WHERE id = $1 AND instructor_id = $2
     UNION ALL
     SELECT 1 FROM enrollments WHERE class_id = $1 AND student_id = $2
     LIMIT 1`,
    [classId, userId],
  );
  return res.rows.length > 0;
}

export async function isInstructorOf(userId: string, classId: string): Promise<boolean> {
  const db = await getDb();
  const res = await db.query('SELECT 1 FROM classes WHERE id = $1 AND instructor_id = $2', [classId, userId]);
  return res.rows.length > 0;
}

/** Topics for a class, pinned first, then most recently active. */
export async function listTopics(classId: string, userId: string): Promise<DiscussionTopic[]> {
  const db = await getDb();
  const res = await db.query<{
    id: string;
    author_id: string;
    email: string;
    role: string;
    title: string;
    body: string;
    lesson_key: string | null;
    pinned: boolean;
    created_at: string;
    reply_count: number;
    last_activity: string;
  }>(
    `SELECT d.id, d.author_id, u.email, u.role, d.title, d.body, d.lesson_key, d.pinned, d.created_at,
            COALESCE(r.cnt, 0) AS reply_count,
            COALESCE(r.last_at, d.created_at) AS last_activity
       FROM discussions d
       JOIN users u ON u.id = d.author_id
       LEFT JOIN (
         SELECT parent_id, COUNT(*)::int AS cnt, MAX(created_at) AS last_at
           FROM discussions WHERE parent_id IS NOT NULL GROUP BY parent_id
       ) r ON r.parent_id = d.id
      WHERE d.class_id = $1 AND d.parent_id IS NULL
      ORDER BY d.pinned DESC, last_activity DESC`,
    [classId],
  );

  return res.rows.map((r) => ({
    id: r.id,
    authorId: r.author_id,
    authorEmail: r.email,
    authorRole: r.role,
    title: r.title,
    body: r.body,
    lessonKey: r.lesson_key,
    pinned: Boolean(r.pinned),
    createdAt: Number(r.created_at),
    replyCount: Number(r.reply_count),
    lastActivityAt: Number(r.last_activity),
    mine: r.author_id === userId,
  }));
}

export async function listReplies(topicId: string, userId: string): Promise<DiscussionPost[]> {
  const db = await getDb();
  const res = await db.query<{
    id: string;
    author_id: string;
    email: string;
    role: string;
    body: string;
    created_at: string;
  }>(
    `SELECT d.id, d.author_id, u.email, u.role, d.body, d.created_at
       FROM discussions d JOIN users u ON u.id = d.author_id
      WHERE d.parent_id = $1
      ORDER BY d.created_at ASC`,
    [topicId],
  );
  return res.rows.map((r) => ({
    id: r.id,
    authorId: r.author_id,
    authorEmail: r.email,
    authorRole: r.role,
    body: r.body,
    createdAt: Number(r.created_at),
    mine: r.author_id === userId,
  }));
}

export async function createTopic(
  userId: string,
  classId: string,
  title: string,
  body: string,
  lessonKey?: string | null,
): Promise<string | null> {
  if (!(await canAccessClass(userId, classId))) return null;
  const cleanTitle = title.trim().slice(0, MAX_TITLE);
  const cleanBody = body.trim().slice(0, MAX_BODY);
  if (!cleanTitle || !cleanBody) return null;

  const db = await getDb();
  const id = randomUUID();
  await db.query(
    `INSERT INTO discussions (id, class_id, parent_id, author_id, lesson_key, title, body, created_at)
     VALUES ($1, $2, NULL, $3, $4, $5, $6, $7)`,
    [id, classId, userId, lessonKey ?? null, cleanTitle, cleanBody, Date.now()],
  );
  return id;
}

export async function reply(userId: string, topicId: string, body: string): Promise<boolean> {
  const cleanBody = body.trim().slice(0, MAX_BODY);
  if (!cleanBody) return false;

  const db = await getDb();
  /* Derive the class from the topic rather than trusting a client-supplied one,
     so a reply cannot be smuggled into a class the user cannot access. */
  const topic = await db.query<{ class_id: string }>(
    'SELECT class_id FROM discussions WHERE id = $1 AND parent_id IS NULL',
    [topicId],
  );
  const classId = topic.rows[0]?.class_id;
  if (!classId || !(await canAccessClass(userId, classId))) return false;

  await db.query(
    `INSERT INTO discussions (id, class_id, parent_id, author_id, title, body, created_at)
     VALUES ($1, $2, $3, $4, '', $5, $6)`,
    [randomUUID(), classId, topicId, userId, cleanBody, Date.now()],
  );
  return true;
}

/** Pin or unpin a topic. Instructor only. */
export async function setPinned(userId: string, topicId: string, pinned: boolean): Promise<boolean> {
  const db = await getDb();
  const res = await db.query(
    `UPDATE discussions SET pinned = $1
      WHERE id = $2 AND parent_id IS NULL
        AND class_id IN (SELECT id FROM classes WHERE instructor_id = $3)`,
    [pinned, topicId, userId],
  );
  return (res.affectedRows ?? 0) > 0;
}

/** Delete a post. The author may remove their own; an instructor may remove any in their class. */
export async function deletePost(userId: string, postId: string): Promise<boolean> {
  const db = await getDb();
  const res = await db.query(
    `DELETE FROM discussions
      WHERE id = $1
        AND (author_id = $2 OR class_id IN (SELECT id FROM classes WHERE instructor_id = $2))`,
    [postId, userId],
  );
  return (res.affectedRows ?? 0) > 0;
}
