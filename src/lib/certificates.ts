import { randomUUID } from 'node:crypto';
import { getDb } from './db';

export type Certificate = {
  id: string;
  userId: string;
  courseId: string;
  courseTitle: string;
  recipient: string;
  score: number;
  total: number;
  issuedAt: number;
};

export type IssueInput = {
  courseId: string;
  courseTitle: string;
  recipient: string;
  score: number;
  total: number;
};

function rowToCert(r: {
  id: string;
  user_id: string;
  course_id: string;
  course_title: string;
  recipient: string;
  score: number;
  total: number;
  issued_at: string;
}): Certificate {
  return {
    id: r.id,
    userId: r.user_id,
    courseId: r.course_id,
    courseTitle: r.course_title,
    recipient: r.recipient,
    score: Number(r.score),
    total: Number(r.total),
    issuedAt: Number(r.issued_at),
  };
}

/** Issue a certificate for a passed course. Returns the new certificate id. */
export async function issueCertificate(userId: string, input: IssueInput): Promise<string> {
  const db = await getDb();
  const id = randomUUID();
  await db.query(
    `INSERT INTO certificates (id, user_id, course_id, course_title, recipient, score, total, issued_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, userId, input.courseId, input.courseTitle, input.recipient, input.score, input.total, Date.now()],
  );
  return id;
}

/** Public lookup by id — used by the verification page (no user scoping). */
export async function getCertificate(id: string): Promise<Certificate | null> {
  const db = await getDb();
  const res = await db.query<Parameters<typeof rowToCert>[0]>(
    `SELECT id, user_id, course_id, course_title, recipient, score, total, issued_at
       FROM certificates WHERE id = $1`,
    [id],
  );
  return res.rows[0] ? rowToCert(res.rows[0]) : null;
}

/** All certificates a user has earned, newest first. */
export async function listCertificates(userId: string): Promise<Certificate[]> {
  const db = await getDb();
  const res = await db.query<Parameters<typeof rowToCert>[0]>(
    `SELECT id, user_id, course_id, course_title, recipient, score, total, issued_at
       FROM certificates WHERE user_id = $1 ORDER BY issued_at DESC`,
    [userId],
  );
  return res.rows.map(rowToCert);
}
