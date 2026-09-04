import { randomUUID } from 'node:crypto';
import { getDb } from '../db';

/**
 * What was actually sent, frozen at the moment of sending.
 *
 * Job postings get edited and taken down, and the résumé is regenerated per
 * application. Without a snapshot, "what did I tell them?" becomes
 * unanswerable within about a week — which is exactly when the interview call
 * arrives and the candidate needs to reread it.
 *
 * Snapshots are immutable. Re-applying writes a second row rather than
 * updating the first, because the honest answer to "what did I send in March"
 * is what was sent in March.
 */

export type ArchivedApplication = {
  id: string;
  jobId: string;
  company: string;
  title: string;
  jobUrl: string;
  jdSnapshot: string;
  resumeSummary: string;
  resumeBullets: string[];
  coverLetter: string;
  answers: { question: string; value: string }[];
  ats: string;
  mode: string;
  reference: string;
  submittedAt: number;
};

export async function archiveApplication(
  userId: string,
  input: {
    jobId: string;
    company: string;
    title: string;
    jobUrl: string;
    jdSnapshot: string;
    resumeSummary: string;
    resumeBullets: string[];
    coverLetter: string;
    answers: { question: string; value: string }[];
    ats: string;
    mode: string;
    reference: string;
  },
): Promise<void> {
  const db = await getDb();
  await db
    .query(
      `INSERT INTO application_archive
         (id, user_id, job_id, company, title, job_url, jd_snapshot, resume_summary,
          resume_bullets, cover_letter, answers, ats, mode, reference, submitted_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        randomUUID(),
        userId,
        input.jobId,
        input.company.slice(0, 200),
        input.title.slice(0, 300),
        input.jobUrl.slice(0, 1000),
        /* Capped: a posting is a few pages, and the archive grows with every
           application a candidate ever sends. */
        input.jdSnapshot.slice(0, 20_000),
        input.resumeSummary.slice(0, 4000),
        JSON.stringify(input.resumeBullets.slice(0, 20)),
        input.coverLetter.slice(0, 8000),
        JSON.stringify(input.answers.slice(0, 60)),
        input.ats,
        input.mode,
        input.reference.slice(0, 200),
        Date.now(),
      ],
    )
    .catch(() => {
      /* Archiving must never fail an application that was otherwise sent. A
         missing snapshot is a gap in the record; a thrown error here would
         turn a successful submission into a reported failure. */
    });
}

export async function listArchive(userId: string, limit = 100): Promise<ArchivedApplication[]> {
  const db = await getDb();
  const res = await db.query<Record<string, unknown>>(
    'SELECT * FROM application_archive WHERE user_id = $1 ORDER BY submitted_at DESC LIMIT $2',
    [userId, limit],
  );
  return res.rows.map((r) => ({
    id: String(r.id),
    jobId: String(r.job_id),
    company: String(r.company ?? ''),
    title: String(r.title ?? ''),
    jobUrl: String(r.job_url ?? ''),
    jdSnapshot: String(r.jd_snapshot ?? ''),
    resumeSummary: String(r.resume_summary ?? ''),
    resumeBullets: parse<string[]>(String(r.resume_bullets ?? '[]'), []),
    coverLetter: String(r.cover_letter ?? ''),
    answers: parse<{ question: string; value: string }[]>(String(r.answers ?? '[]'), []),
    ats: String(r.ats ?? ''),
    mode: String(r.mode ?? ''),
    reference: String(r.reference ?? ''),
    submittedAt: Number(r.submitted_at),
  }));
}

function parse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
