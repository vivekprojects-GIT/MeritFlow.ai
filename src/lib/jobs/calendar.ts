import { randomUUID } from 'node:crypto';
import { getDb } from '../db';

/**
 * Interviews and scheduled events.
 *
 * Entries arrive two ways: detected from an invitation email, or entered by
 * the candidate. Detected ones start unconfirmed, because a date parsed out of
 * prose is a guess and a wrong interview time in someone's calendar is worse
 * than an empty one. Confirming is a deliberate act.
 *
 * Scheduling itself stays with the person. Autopilot will not accept a time on
 * anyone's behalf: a booking is a commitment about their life, not a form
 * field, and the failure mode of getting it wrong is missing an interview.
 */

export type InterviewKind = 'INTERVIEW' | 'ASSESSMENT' | 'CALL' | 'OTHER';

export type Interview = {
  id: string;
  jobId: string | null;
  company: string;
  title: string;
  kind: InterviewKind;
  startsAt: number | null;
  durationMin: number;
  location: string;
  notes: string;
  source: 'detected' | 'user';
  confirmed: boolean;
  mailId: string | null;
};

export async function listInterviews(userId: string): Promise<Interview[]> {
  const db = await getDb();
  const res = await db.query<Record<string, unknown>>(
    /* Undated entries sort last rather than first: a detected invitation with
       no time is a to-do, not the next thing in the diary. */
    `SELECT * FROM interviews WHERE user_id = $1
      ORDER BY (starts_at IS NULL), starts_at ASC`,
    [userId],
  );
  return res.rows.map(mapRow);
}

export async function createInterview(
  userId: string,
  input: Partial<Omit<Interview, 'id'>> & { company: string },
): Promise<Interview> {
  const db = await getDb();
  const id = randomUUID();
  const now = Date.now();
  await db.query(
    `INSERT INTO interviews
       (id, user_id, job_id, company, title, kind, starts_at, duration_min, location, notes, source, confirmed, mail_id, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14)`,
    [
      id,
      userId,
      input.jobId ?? null,
      input.company.slice(0, 200),
      (input.title ?? '').slice(0, 300),
      input.kind ?? 'INTERVIEW',
      input.startsAt ?? null,
      input.durationMin ?? 60,
      (input.location ?? '').slice(0, 500),
      (input.notes ?? '').slice(0, 2000),
      /* Anything created through this function came from a person. */
      'user',
      input.confirmed ?? true,
      input.mailId ?? null,
      now,
    ],
  );
  const one = await getInterview(userId, id);
  return one!;
}

export async function updateInterview(
  userId: string,
  id: string,
  patch: Partial<Interview>,
): Promise<Interview | null> {
  const current = await getInterview(userId, id);
  if (!current) return null;

  const next = { ...current, ...stripUndefined(patch) };
  const db = await getDb();
  await db.query(
    `UPDATE interviews SET company=$1, title=$2, kind=$3, starts_at=$4, duration_min=$5,
            location=$6, notes=$7, confirmed=$8, source=$9, updated_at=$10
      WHERE user_id=$11 AND id=$12`,
    [
      next.company.slice(0, 200),
      next.title.slice(0, 300),
      next.kind,
      next.startsAt,
      next.durationMin,
      next.location.slice(0, 500),
      next.notes.slice(0, 2000),
      next.confirmed,
      /* Editing a detected entry makes it the candidate's, so a later re-parse
         of the same email cannot quietly overwrite their correction. */
      'user',
      Date.now(),
      userId,
      id,
    ],
  );
  return getInterview(userId, id);
}

export async function deleteInterview(userId: string, id: string): Promise<boolean> {
  const db = await getDb();
  const res = await db.query('DELETE FROM interviews WHERE user_id = $1 AND id = $2', [userId, id]);
  return (res.affectedRows ?? 0) > 0;
}

export async function getInterview(userId: string, id: string): Promise<Interview | null> {
  const db = await getDb();
  const res = await db.query<Record<string, unknown>>(
    'SELECT * FROM interviews WHERE user_id = $1 AND id = $2',
    [userId, id],
  );
  return res.rows[0] ? mapRow(res.rows[0]) : null;
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out as Partial<T>;
}

function mapRow(r: Record<string, unknown>): Interview {
  return {
    id: String(r.id),
    jobId: r.job_id == null ? null : String(r.job_id),
    company: String(r.company ?? ''),
    title: String(r.title ?? ''),
    kind: String(r.kind ?? 'INTERVIEW') as InterviewKind,
    startsAt: r.starts_at == null ? null : Number(r.starts_at),
    durationMin: Number(r.duration_min ?? 60),
    location: String(r.location ?? ''),
    notes: String(r.notes ?? ''),
    source: String(r.source ?? 'user') === 'detected' ? 'detected' : 'user',
    confirmed: Boolean(r.confirmed),
    mailId: r.mail_id == null ? null : String(r.mail_id),
  };
}

/* ── Export ──────────────────────────────────────────────────────────────── */

/** RFC 5545 escaping: commas, semicolons and backslashes are delimiters. */
function ics(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

function stamp(ms: number): string {
  return `${new Date(ms).toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
}

/**
 * An .ics feed of the confirmed, dated entries.
 *
 * Undated and unconfirmed ones are left out on purpose: exporting a guess into
 * someone's real calendar is how a parser error becomes a missed interview.
 */
export function toIcs(interviews: Interview[]): string {
  const events = interviews
    .filter((i) => i.startsAt != null)
    .map((i) => {
      const end = i.startsAt! + i.durationMin * 60_000;
      return [
        'BEGIN:VEVENT',
        `UID:${i.id}@meritflow`,
        `DTSTAMP:${stamp(Date.now())}`,
        `DTSTART:${stamp(i.startsAt!)}`,
        `DTEND:${stamp(end)}`,
        `SUMMARY:${ics(`${i.kind === 'ASSESSMENT' ? 'Assessment' : 'Interview'}: ${i.company}`)}`,
        i.location ? `LOCATION:${ics(i.location)}` : '',
        `DESCRIPTION:${ics([i.title, i.notes, i.confirmed ? '' : 'Not confirmed — check the invitation.'].filter(Boolean).join('\n'))}`,
        'END:VEVENT',
      ]
        .filter(Boolean)
        .join('\r\n');
    });

  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MeritFlow//JobPilot//EN', 'CALSCALE:GREGORIAN', ...events, 'END:VCALENDAR'].join(
    '\r\n',
  );
}
