import { randomUUID } from 'node:crypto';
import { getDb } from './db';

/**
 * SIS rostering — bulk enrolment from a Student Information System.
 *
 * Institutions do not enrol students by handing out a join code; the registrar's
 * SIS (Banner, Workday, PeopleSoft, Colleague) is the source of truth. The
 * universal lowest common denominator for getting data out of all of them is a
 * CSV export, which is also what OneRoster defines. So that is the interface:
 * upload the SIS export, and the roster reconciles to match it.
 *
 * Two properties matter more than convenience here:
 *
 *  - **Idempotent.** Registrars re-run the same file. Re-importing must not
 *    duplicate anybody, so enrolment is upserted on (class, student).
 *  - **Additive by default.** Dropping students is destructive and a
 *    mis-exported file would unenrol a whole class, so removals only happen
 *    when the caller explicitly asks to reconcile.
 *
 * Accounts created here have no password: the student signs in through SSO, or
 * uses password reset. That avoids inventing credentials nobody was told about.
 */

export type RosterRow = { email: string; name: string | null; sourcedId: string | null };

export type RosterImportResult = {
  matched: number;
  createdUsers: number;
  enrolled: number;
  unenrolled: number;
  skipped: { line: number; reason: string }[];
};

/**
 * Parse a OneRoster-ish CSV.
 *
 * Accepts any export with an email column: OneRoster calls it `email`, Banner
 * exports often say `Email Address`, Workday `primaryWorkEmail`. Matching on a
 * normalised header rather than a fixed position means a registrar does not
 * have to reshape their export first.
 */
export function parseRosterCsv(text: string): { rows: RosterRow[]; skipped: { line: number; reason: string }[] } {
  const lines = text.replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim());
  const skipped: { line: number; reason: string }[] = [];
  if (lines.length === 0) return { rows: [], skipped };

  const header = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase().replace(/[^a-z]/g, ''));
  const emailIdx = header.findIndex((h) => h.includes('email'));
  if (emailIdx === -1) {
    return { rows: [], skipped: [{ line: 1, reason: 'No email column found in the header row.' }] };
  }
  const nameIdx = header.findIndex((h) => h === 'name' || h === 'givenname' || h === 'fullname' || h === 'displayname');
  const familyIdx = header.findIndex((h) => h === 'familyname' || h === 'surname' || h === 'lastname');
  const sourcedIdx = header.findIndex((h) => h.includes('sourcedid') || h === 'studentid' || h === 'userid');

  const rows: RosterRow[] = [];
  const seen = new Set<string>();

  for (let i = 1; i < lines.length; i += 1) {
    const cells = splitCsvLine(lines[i]);
    const email = (cells[emailIdx] ?? '').trim().toLowerCase();
    if (!email) {
      skipped.push({ line: i + 1, reason: 'No email address.' });
      continue;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      skipped.push({ line: i + 1, reason: `"${email}" is not a valid email address.` });
      continue;
    }
    /* A student listed twice in one export is one enrolment, not two. */
    if (seen.has(email)) continue;
    seen.add(email);

    const given = nameIdx >= 0 ? (cells[nameIdx] ?? '').trim() : '';
    const family = familyIdx >= 0 ? (cells[familyIdx] ?? '').trim() : '';
    const name = [given, family].filter(Boolean).join(' ') || null;

    rows.push({ email, name, sourcedId: sourcedIdx >= 0 ? (cells[sourcedIdx] ?? '').trim() || null : null });
  }

  return { rows, skipped };
}

/** Minimal RFC-4180 splitter: handles quoted fields and escaped quotes. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else quoted = false;
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/**
 * Apply a parsed roster to a class.
 *
 * `reconcile` removes enrolments absent from the file — the SIS-is-truth model.
 * Off by default because one bad export would otherwise empty a class.
 */
export async function applyRoster(
  instructorId: string,
  classId: string,
  rows: RosterRow[],
  options: { reconcile?: boolean; universityId?: string | null } = {},
): Promise<RosterImportResult | null> {
  const db = await getDb();

  /* Ownership check and data fetch in one: no separate query to drift. */
  const owns = await db.query('SELECT 1 FROM classes WHERE id = $1 AND instructor_id = $2', [classId, instructorId]);
  if (owns.rows.length === 0) return null;

  const result: RosterImportResult = { matched: 0, createdUsers: 0, enrolled: 0, unenrolled: 0, skipped: [] };
  const now = Date.now();
  const studentIds: string[] = [];

  for (const row of rows) {
    const existing = await db.query<{ id: string }>('SELECT id FROM users WHERE LOWER(email) = $1', [row.email]);
    let studentId = existing.rows[0]?.id;

    if (studentId) {
      result.matched += 1;
    } else {
      studentId = randomUUID();
      await db.query(
        `INSERT INTO users (id, email, password_hash, created_at, role, university_id)
         VALUES ($1, $2, $3, $4, 'student', $5)`,
        /* No usable password — these accounts arrive through SSO or reset. */
        [studentId, row.email, 'sis:no-password', now, options.universityId ?? null],
      );
      result.createdUsers += 1;
    }

    studentIds.push(studentId);
    const before = await db.query('SELECT 1 FROM enrollments WHERE class_id = $1 AND student_id = $2', [classId, studentId]);
    await db.query(
      `INSERT INTO enrollments (class_id, student_id, enrolled_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (class_id, student_id) DO NOTHING`,
      [classId, studentId, now],
    );
    if (before.rows.length === 0) result.enrolled += 1;
  }

  if (options.reconcile && studentIds.length > 0) {
    const removed = await db.query(
      `DELETE FROM enrollments
        WHERE class_id = $1 AND student_id <> ALL($2::text[])`,
      [classId, studentIds],
    );
    result.unenrolled = removed.affectedRows ?? 0;
  }

  return result;
}

/**
 * Grade passback file.
 *
 * A registrar imports final grades back into the SIS from a CSV. Real
 * bi-directional API passback is vendor-specific (Banner's ERP APIs differ from
 * Workday's), so the honest, universal step is the export every SIS can ingest.
 */
export function gradesToCsv(rows: Array<{ email: string; overallPct: number | null; examPct: number | null; progressPct: number }>): string {
  const header = 'email,overall_percent,exam_percent,progress_percent';
  const body = rows
    .map((r) =>
      [
        escapeCsv(r.email),
        r.overallPct == null ? '' : String(r.overallPct),
        r.examPct == null ? '' : String(r.examPct),
        String(r.progressPct),
      ].join(','),
    )
    .join('\n');
  return `${header}\n${body}\n`;
}

function escapeCsv(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
