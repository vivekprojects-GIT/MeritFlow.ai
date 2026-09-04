import { randomUUID } from 'node:crypto';
import { getDb } from '../db';
import type { ApplicationReceipt } from './adapters/types';

/**
 * What was put on an application, and on what basis.
 *
 * ## Why the receipt is not enough
 *
 * The receipt shows the candidate one prepared application, and it is rewritten
 * every time that run is re-prepared. So it cannot answer the two questions
 * that matter afterwards: *what exactly did this employer receive*, and *what
 * have we ever told anyone about my work authorisation*. Both are questions a
 * candidate is entitled to ask months later, and both need an append-only
 * record rather than a mutable snapshot.
 *
 * ## Confidence is recorded, never trusted
 *
 * Every row carries a confidence, and nothing in the submit path reads it. It
 * exists to explain a decision after the fact — "this went out at 60 because it
 * came from a résumé line rather than an answer you confirmed" — not to
 * authorise one. An answer either has a verified source or it does not, and a
 * number in the middle is exactly the kind of thing that turns into a threshold
 * somebody later relaxes.
 */

export type AuditRow = {
  field: string;
  question: string;
  answer: string;
  source: string;
  confidence: number;
  submitted: boolean;
  createdAt: number;
};

/**
 * How much we can say for each kind of source.
 *
 * A verbatim copy of something the candidate typed and confirmed is the top of
 * the scale. A file we attached is certain. Prose a model wrote — even
 * evidence-checked prose — is the bottom, because "supported by the résumé" and
 * "the sentence the candidate would have written" are different claims.
 */
const CONFIDENCE: Record<string, number> = {
  vault: 95,
  profile: 95,
  file: 100,
  resume: 80,
  generated: 50,
};

export function confidenceFor(source: string): number {
  return CONFIDENCE[source] ?? 40;
}

/**
 * Record every field of one prepared or submitted application.
 *
 * `submitted` distinguishes what an employer actually received from what was
 * merely prepared, which is the difference between an audit trail and a log of
 * intentions.
 */
export async function recordApplicationAudit(input: {
  userId: string;
  runId: string;
  jobId: string;
  receipt: ApplicationReceipt;
  submitted: boolean;
}): Promise<number> {
  const db = await getDb();
  const now = Date.now();

  /* Answers first: they carry the employer's own wording, which is what makes
     a row readable a year later. Fields the adapter filled without a matching
     question — identity, the résumé file — are added after, keyed by field id
     so nothing is recorded twice. */
  const rows: AuditRow[] = [];
  const seen = new Set<string>();

  for (const a of input.receipt.answers) {
    if (!a.value) continue;
    const field = a.intent ?? a.question;
    seen.add(field);
    rows.push({
      field,
      question: a.question,
      answer: a.value,
      source: a.provenance ? 'vault' : 'profile',
      confidence: confidenceFor(a.provenance ? 'vault' : 'profile'),
      submitted: input.submitted,
      createdAt: now,
    });
  }

  for (const f of input.receipt.fields) {
    if (seen.has(f.field)) continue;
    rows.push({
      field: f.field,
      question: f.field,
      answer: f.value,
      source: f.source,
      confidence: confidenceFor(f.source),
      submitted: input.submitted,
      createdAt: now,
    });
  }

  for (const row of rows) {
    await db.query(
      `INSERT INTO application_audit
         (id, user_id, run_id, job_id, field, question, answer, source, confidence, submitted, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        randomUUID(),
        input.userId,
        input.runId,
        input.jobId,
        row.field.slice(0, 200),
        row.question.slice(0, 300),
        /* Capped rather than truncated silently at the database: a cover letter
           is long and the point of the row is provenance, not the full text,
           which the receipt still holds. */
        row.answer.slice(0, 2000),
        row.source,
        row.confidence,
        row.submitted,
        row.createdAt,
      ],
    );
  }

  return rows.length;
}

/** Everything ever sent for one run, oldest first. */
export async function auditForRun(userId: string, runId: string): Promise<AuditRow[]> {
  const db = await getDb();
  const res = await db.query<Record<string, unknown>>(
    'SELECT * FROM application_audit WHERE user_id = $1 AND run_id = $2 ORDER BY created_at ASC',
    [userId, runId],
  );
  return res.rows.map((r) => ({
    field: String(r.field),
    question: String(r.question),
    answer: String(r.answer),
    source: String(r.source),
    confidence: Number(r.confidence ?? 0),
    submitted: Boolean(r.submitted),
    createdAt: Number(r.created_at ?? 0),
  }));
}

/**
 * Everything ever said in answer to one question, across all applications.
 *
 * The question a candidate actually asks: "have I been consistent?" Two
 * different answers to the same work-authorisation question on two applications
 * is a contradiction an employer could find, and this is the only place it
 * would be visible.
 */
export async function auditForField(userId: string, field: string, limit = 100): Promise<AuditRow[]> {
  const db = await getDb();
  const res = await db.query<Record<string, unknown>>(
    `SELECT * FROM application_audit
      WHERE user_id = $1 AND field = $2
      ORDER BY created_at DESC LIMIT $3`,
    [userId, field, limit],
  );
  return res.rows.map((r) => ({
    field: String(r.field),
    question: String(r.question),
    answer: String(r.answer),
    source: String(r.source),
    confidence: Number(r.confidence ?? 0),
    submitted: Boolean(r.submitted),
    createdAt: Number(r.created_at ?? 0),
  }));
}
