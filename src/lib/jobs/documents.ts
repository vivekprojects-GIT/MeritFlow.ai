import { randomUUID } from 'node:crypto';
import { getDb } from '../db';
import { getCandidateProfile, saveCandidateProfile } from '../jobs-store';
import { resumeSchema, resumeToText, type ResumeDoc } from './resume-schema';
import { parseResume, PARSER_VERSION } from './resume-parse';

/**
 * Named résumé and cover-letter variants.
 *
 * One résumé is wrong for anyone applying to two kinds of role — a data
 * profile and an engineering profile need different orderings of the same
 * facts. This is the set to choose from; the active one is what matching and
 * per-application tailoring read.
 */

export type DocKind = 'resume' | 'cover_letter';

export type Doc = {
  id: string;
  kind: DocKind;
  name: string;
  body: string;
  fileName: string;
  template: string;
  font: string;
  fontSize: number;
  isActive: boolean;
  /** The résumé as addressable parts. Empty for cover letters. */
  structured: ResumeDoc | null;
  /** The upload as extracted, kept so a bad parse is always recoverable. */
  sourceText: string;
  /** Which build of the parser produced . */
  parserVersion: number;
  updatedAt: number;
};

export async function listDocuments(userId: string): Promise<Doc[]> {
  const db = await getDb();
  const res = await db.query<Record<string, unknown>>(
    'SELECT * FROM documents WHERE user_id = $1 ORDER BY kind, updated_at DESC LIMIT 50',
    [userId],
  );
  return res.rows.map(map);
}

export async function getDocument(userId: string, id: string): Promise<Doc | null> {
  const db = await getDb();
  const res = await db.query<Record<string, unknown>>('SELECT * FROM documents WHERE user_id = $1 AND id = $2', [
    userId,
    id,
  ]);
  return res.rows[0] ? map(res.rows[0]) : null;
}

/**
 * Seed the first résumé from whatever onboarding already captured.
 *
 * Without this, a candidate who uploaded a CV during setup opens the editor to
 * an empty list and reasonably concludes their upload was lost.
 */
export async function ensureSeedDocument(userId: string): Promise<void> {
  const existing = await listDocuments(userId);
  if (existing.some((d) => d.kind === 'resume')) return;

  const candidate = await getCandidateProfile(userId);
  if (!candidate?.resumeText?.trim()) return;

  /* Parsed on the way in, so the editor opens on a structured document rather
     than a wall of extracted text. */
  const structured = await parseResume(candidate.resumeText);

  await createDocument(userId, {
    kind: 'resume',
    name: candidate.resumeName || 'My résumé',
    body: candidate.resumeText,
    fileName: candidate.resumeName,
    structured,
    isActive: true,
  });
}

/**
 * The résumé that should be used to fill a form, parsed and ready.
 *
 * ## Why this is not just a `find`
 *
 * The structured résumé is created lazily, and until now the only thing that
 * created it was somebody opening the Documents tab. So a candidate could
 * upload a CV during setup, go straight to Auto Apply, and have every
 * application stop on "Current company" - while the answer sat on line one of
 * the file they had just uploaded. The document existed; nothing had gotten
 * around to parsing it.
 *
 * Parsing on demand rather than on view is the fix. The work is done once, the
 * document is written, and every later call is a read.
 *
 * Returns null when there is genuinely no résumé, which the callers treat as
 * "fill from the account only" rather than as an error.
 */
export async function activeResume(userId: string): Promise<ResumeDoc | null> {
  await ensureSeedDocument(userId);
  await backfillStructured(userId);

  const docs = await listDocuments(userId);
  const resumes = docs.filter((d) => d.kind === 'resume');
  /* The active one, or the most recent - `listDocuments` orders by updated_at,
     and an account whose active flag was lost to a delete should still fill. */
  return (resumes.find((d) => d.isActive) ?? resumes[0])?.structured ?? null;
}

/**
 * Give any résumé that has no structure some.
 *
 * `ensureSeedDocument` only fires when a candidate has no résumé at all, so a
 * document created before the structured column existed kept `structured`
 * empty forever — and the editor quietly fell back to a plain textarea while
 * the alignment, fit-to-page and section controls disappeared with it. From
 * the outside that reads as the new editor simply not working.
 *
 * Runs on read, once per document, and leaves the flattened text untouched.
 */
export async function backfillStructured(userId: string): Promise<void> {
  const docs = await listDocuments(userId);
  /* Stale means either no structure at all, or structure produced by an
     older parser — a fix that only reached new uploads would leave every
     existing candidate looking at the bug that was just fixed. */
  const stale = docs.filter(
    (d) =>
      d.kind === 'resume' &&
      (d.sourceText || d.body).trim().length > 20 &&
      (!d.structured || d.parserVersion < PARSER_VERSION),
  );

  for (const doc of stale) {
    /* Re-read from the preserved upload: the body is regenerated from the
       previous parse, so parsing it again would reproduce the same mistakes. */
    const structured = await parseResume(doc.sourceText || doc.body);
    const db = await getDb();
    /* Written directly rather than through `updateDocument`, which would
       re-derive the body from the parse and could lose anything the parser
       failed to place. The original text is the safer record. */
    await db.query(
      "UPDATE documents SET structured = $1, parser_version = $2, source_text = CASE WHEN source_text = '' THEN $3 ELSE source_text END WHERE user_id = $4 AND id = $5",
      [JSON.stringify(structured), PARSER_VERSION, doc.body, userId, doc.id],
    );
  }
}

export async function createDocument(
  userId: string,
  input: Partial<Doc> & { kind: DocKind; name: string },
): Promise<Doc> {
  const db = await getDb();
  const id = randomUUID();
  const now = Date.now();

  await db.query(
    `INSERT INTO documents (id, user_id, kind, name, body, file_name, template, font, font_size, is_active, structured, source_text, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13)`,
    [
      id,
      userId,
      input.kind,
      input.name.slice(0, 120),
      (input.body ?? '').slice(0, 60_000),
      (input.fileName ?? '').slice(0, 200),
      input.template ?? 'standard',
      input.font ?? 'sans',
      input.fontSize ?? 10.5,
      input.isActive ?? false,
      input.structured ? JSON.stringify(input.structured) : '',
      (input.body ?? '').slice(0, 60_000),
      now,
    ],
  );

  if (input.isActive && input.kind === 'resume') await setActive(userId, id);
  return (await getDocument(userId, id))!;
}

export async function updateDocument(userId: string, id: string, patch: Partial<Doc>): Promise<Doc | null> {
  const current = await getDocument(userId, id);
  if (!current) return null;

  const next = { ...current, ...strip(patch) };

  /* The flattened text is derived, never edited directly once a document is
     structured: two editable representations of one résumé drift, and the
     text is what matching and the evidence check read. */
  if (next.structured) next.body = resumeToText(next.structured);
  const db = await getDb();
  await db.query(
    `UPDATE documents SET name=$1, body=$2, template=$3, font=$4, font_size=$5, structured=$6, updated_at=$7
      WHERE user_id=$8 AND id=$9`,
    [
      next.name.slice(0, 120),
      next.body.slice(0, 60_000),
      next.template,
      next.font,
      next.fontSize,
      next.structured ? JSON.stringify(next.structured) : '',
      Date.now(),
      userId,
      id,
    ],
  );

  /* The active résumé is the one everything else reads, so an edit to it has
     to reach the candidate profile too — otherwise the editor shows new text
     while every application still sends the old. */
  if (current.isActive && current.kind === 'resume') {
    await saveCandidateProfile(userId, { resumeText: next.body, resumeName: next.name });
  }
  return getDocument(userId, id);
}

/**
 * Make one résumé the active one.
 *
 * Clear-then-set in that order: the reverse leaves two rows active if the
 * second statement fails, and "two active résumés" has no sensible reading.
 */
export async function setActive(userId: string, id: string): Promise<Doc | null> {
  const doc = await getDocument(userId, id);
  if (!doc || doc.kind !== 'resume') return null;

  const db = await getDb();
  await db.query("UPDATE documents SET is_active = FALSE WHERE user_id = $1 AND kind = 'resume'", [userId]);
  await db.query('UPDATE documents SET is_active = TRUE WHERE user_id = $1 AND id = $2', [userId, id]);

  await saveCandidateProfile(userId, { resumeText: doc.body, resumeName: doc.name });
  return getDocument(userId, id);
}

export async function deleteDocument(userId: string, id: string): Promise<boolean> {
  const doc = await getDocument(userId, id);
  if (!doc) return false;

  const db = await getDb();
  await db.query('DELETE FROM documents WHERE user_id = $1 AND id = $2', [userId, id]);

  /* Deleting the active résumé would leave the profile pointing at text with
     no document behind it, so another is promoted when one exists. */
  if (doc.isActive && doc.kind === 'resume') {
    const rest = (await listDocuments(userId)).filter((d) => d.kind === 'resume');
    if (rest[0]) await setActive(userId, rest[0].id);
  }
  return true;
}

function strip<T extends object>(o: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out as Partial<T>;
}

/** Stored JSON back into a document, tolerating anything malformed. */
function parseStructured(raw: string): ResumeDoc | null {
  if (!raw) return null;
  try {
    return resumeSchema.parse(JSON.parse(raw));
  } catch {
    /* A shape that no longer validates is treated as absent rather than
       thrown: the flattened text is still intact, so the candidate keeps
       their résumé and simply re-parses it. */
    return null;
  }
}

function map(r: Record<string, unknown>): Doc {
  return {
    id: String(r.id),
    kind: String(r.kind) as DocKind,
    name: String(r.name ?? ''),
    body: String(r.body ?? ''),
    fileName: String(r.file_name ?? ''),
    template: String(r.template ?? 'standard'),
    font: String(r.font ?? 'sans'),
    fontSize: Number(r.font_size ?? 10.5),
    isActive: Boolean(r.is_active),
    structured: parseStructured(String(r.structured ?? '')),
    sourceText: String(r.source_text ?? ''),
    parserVersion: Number(r.parser_version ?? 0),
    updatedAt: Number(r.updated_at),
  };
}
