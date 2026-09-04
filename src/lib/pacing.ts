import { getDb } from './db';

/**
 * Pacing, cohort comparison, and the weekly digest.
 *
 * Everything the dashboards measured until now was relative to peers: "behind"
 * meant behind the rest of this class. That hides the case that matters most to
 * a department — a cohort that is *uniformly* late, where everyone looks fine
 * against everyone else and the whole class misses the term. Pacing fixes the
 * frame of reference to the schedule instead of the crowd.
 */

const DAY = 86_400_000;
const WEEK = 7 * DAY;

/* ── Pacing ──────────────────────────────────────────────────────────────── */

export type PacingLearner = {
  studentId: string;
  email: string;
  done: number;
  expected: number;
  /** Lessons behind schedule; negative means ahead. */
  behind: number;
};

export type ClassPacing = {
  hasData: boolean;
  /** Weeks the class is scheduled to run. */
  paceWeeks: number;
  weeksElapsed: number;
  lessonCount: number;
  /** Lessons a learner should have finished by now, given the schedule. */
  expectedByNow: number;
  /** Mean lessons actually completed. */
  actualMean: number;
  /**
   * The gap in lessons. Positive means the class as a whole is behind the
   * schedule — the signal a peer-relative view cannot produce.
   */
  cohortGap: number;
  behindSchedule: PacingLearner[];
  /** True once the term has run past its scheduled length. */
  overrun: boolean;
};

export async function classPacing(classId: string): Promise<ClassPacing> {
  const db = await getDb();

  const cls = await db.query<{ created_at: string; lesson_count: number; pace_weeks: number }>(
    'SELECT created_at, lesson_count, pace_weeks FROM classes WHERE id = $1',
    [classId],
  );
  const c = cls.rows[0];
  const empty: ClassPacing = {
    hasData: false,
    paceWeeks: 12,
    weeksElapsed: 0,
    lessonCount: 0,
    expectedByNow: 0,
    actualMean: 0,
    cohortGap: 0,
    behindSchedule: [],
    overrun: false,
  };
  if (!c) return empty;

  const lessonCount = Number(c.lesson_count) || 0;
  const paceWeeks = Math.max(1, Number(c.pace_weeks) || 12);
  const started = Number(c.created_at);
  const weeksElapsed = Math.max(0, (Date.now() - started) / WEEK);

  const enrolled = await db.query<{ student_id: string; email: string }>(
    `SELECT e.student_id, u.email
       FROM enrollments e JOIN users u ON u.id = e.student_id
      WHERE e.class_id = $1`,
    [classId],
  );
  if (enrolled.rows.length === 0 || lessonCount === 0) return { ...empty, paceWeeks, lessonCount };

  const progress = await db.query<{ student_id: string; n: string }>(
    'SELECT student_id, COUNT(*) AS n FROM class_progress WHERE class_id = $1 GROUP BY student_id',
    [classId],
  );
  const doneBy = new Map(progress.rows.map((r) => [r.student_id, Number(r.n) || 0]));

  /* Linear schedule: the course is meant to be spread evenly across the term.
     Capped at the full course — being "ahead" of a finished course is not a
     thing, and an uncapped expectation would flag everyone as behind forever
     once the term overruns. */
  const expectedByNow = Math.min(lessonCount, Math.round((weeksElapsed / paceWeeks) * lessonCount));

  const learners: PacingLearner[] = enrolled.rows.map((r) => {
    const done = doneBy.get(r.student_id) ?? 0;
    return { studentId: r.student_id, email: r.email, done, expected: expectedByNow, behind: expectedByNow - done };
  });

  const actualMean = learners.reduce((a, l) => a + l.done, 0) / learners.length;

  return {
    hasData: true,
    paceWeeks,
    weeksElapsed: Math.round(weeksElapsed * 10) / 10,
    lessonCount,
    expectedByNow,
    actualMean: Math.round(actualMean * 10) / 10,
    cohortGap: Math.round((expectedByNow - actualMean) * 10) / 10,
    /* One lesson behind is noise; two is a pattern worth a name on a list. */
    behindSchedule: learners.filter((l) => l.behind >= 2).sort((a, b) => b.behind - a.behind),
    overrun: weeksElapsed > paceWeeks,
  };
}

/* ── Cohort comparison ───────────────────────────────────────────────────── */

export type Cohort = {
  /** The term label, or the month the class was created if none is set. */
  label: string;
  classes: number;
  enrolled: number;
  completed: number;
  completionPct: number;
  /** Mean exam percentage across graded exams in the cohort; null if none. */
  examPct: number | null;
};

/**
 * Group a university's classes into cohorts so terms can be compared.
 *
 * Without this there is no way to answer "did the change we made help?" — the
 * only question that turns analytics into improvement rather than reporting.
 */
export async function cohortComparison(universityId: string): Promise<Cohort[]> {
  const db = await getDb();

  const res = await db.query<{
    term: string;
    created_at: string;
    class_id: string;
    enrolled: string;
    completed: string;
    exam_sum: string | null;
    exam_n: string;
  }>(
    `SELECT c.term, c.created_at, c.id AS class_id,
            COUNT(e.student_id)                                   AS enrolled,
            COUNT(e.completed_at)                                 AS completed,
            SUM(CASE WHEN e.exam_total > 0
                     THEN (e.exam_score::float / e.exam_total) * 100 END) AS exam_sum,
            COUNT(CASE WHEN e.exam_total > 0 THEN 1 END)          AS exam_n
       FROM classes c
       JOIN users p ON p.id = c.instructor_id
       LEFT JOIN enrollments e ON e.class_id = c.id
      WHERE p.university_id = $1
      GROUP BY c.term, c.created_at, c.id`,
    [universityId],
  );

  const byLabel = new Map<string, { classes: number; enrolled: number; completed: number; examSum: number; examN: number; sort: number }>();

  for (const r of res.rows) {
    const created = Number(r.created_at);
    /* Fall back to the creation month so cohorts exist before anyone has
       bothered to label a term. */
    const label = r.term?.trim() || new Date(created).toISOString().slice(0, 7);
    const acc = byLabel.get(label) ?? { classes: 0, enrolled: 0, completed: 0, examSum: 0, examN: 0, sort: created };
    acc.classes += 1;
    acc.enrolled += Number(r.enrolled) || 0;
    acc.completed += Number(r.completed) || 0;
    acc.examSum += Number(r.exam_sum) || 0;
    acc.examN += Number(r.exam_n) || 0;
    acc.sort = Math.min(acc.sort, created);
    byLabel.set(label, acc);
  }

  return [...byLabel.entries()]
    .sort((a, b) => a[1].sort - b[1].sort)
    .map(([label, a]) => ({
      label,
      classes: a.classes,
      enrolled: a.enrolled,
      completed: a.completed,
      completionPct: a.enrolled > 0 ? Math.round((a.completed / a.enrolled) * 100) : 0,
      examPct: a.examN > 0 ? Math.round(a.examSum / a.examN) : null,
    }));
}

/* ── Weekly digest ───────────────────────────────────────────────────────── */

export type DigestItem = { kind: 'stalled' | 'never-started' | 'behind' | 'broken-item'; text: string };

export type ClassDigest = { classId: string; title: string; items: DigestItem[] };

/** A learner must be this quiet before the digest names them. */
const QUIET_DAYS = 7;

/**
 * What a professor would want in a Monday email about one class.
 *
 * Insight only changes an outcome if somebody sees it, and nobody opens a
 * dashboard unprompted. This is the push half of the loop. It returns content
 * rather than sending anything — delivery is the caller's choice, and building
 * the summary is the part that has to be right either way.
 */
export async function classDigest(classId: string): Promise<ClassDigest | null> {
  const db = await getDb();
  const cls = await db.query<{ title: string }>('SELECT title FROM classes WHERE id = $1', [classId]);
  if (cls.rows.length === 0) return null;

  const items: DigestItem[] = [];
  const now = Date.now();

  const enrolled = await db.query<{ student_id: string; email: string }>(
    `SELECT e.student_id, u.email FROM enrollments e JOIN users u ON u.id = e.student_id WHERE e.class_id = $1`,
    [classId],
  );
  const last = await db.query<{ student_id: string; last_at: string }>(
    'SELECT student_id, MAX(updated_at) AS last_at FROM class_progress WHERE class_id = $1 GROUP BY student_id',
    [classId],
  );
  const lastBy = new Map(last.rows.map((r) => [r.student_id, Number(r.last_at)]));

  const stalled: string[] = [];
  const never: string[] = [];
  for (const e of enrolled.rows) {
    const at = lastBy.get(e.student_id);
    if (at == null) never.push(e.email);
    else if (now - at >= QUIET_DAYS * DAY) stalled.push(e.email);
  }

  if (stalled.length > 0) {
    items.push({
      kind: 'stalled',
      text: `${stalled.length} ${stalled.length === 1 ? 'learner has' : 'learners have'} gone quiet for a week or more: ${nameList(stalled)}.`,
    });
  }
  if (never.length > 0) {
    items.push({
      kind: 'never-started',
      text: `${never.length} enrolled but never opened a lesson: ${nameList(never)}.`,
    });
  }

  const pacing = await classPacing(classId);
  if (pacing.hasData && pacing.cohortGap >= 2) {
    items.push({
      kind: 'behind',
      text: `The class as a whole is ${pacing.cohortGap} lessons behind schedule (${pacing.actualMean} done, ${pacing.expectedByNow} expected by week ${Math.ceil(pacing.weeksElapsed)}).`,
    });
  }

  const { itemAnalysis } = await import('./item-analysis');
  const analysis = await itemAnalysis(classId);
  for (const bad of analysis.flagged.filter((f) => f.flag === 'mis-keyed').slice(0, 3)) {
    items.push({ kind: 'broken-item', text: `Question ${bad.qIndex + 1} looks mis-keyed — ${bad.note}` });
  }

  return { classId, title: cls.rows[0].title, items };
}

/** "a, b and c" — and never a wall of 40 addresses. */
function nameList(emails: string[]): string {
  const shown = emails.slice(0, 3);
  const rest = emails.length - shown.length;
  const joined = shown.length > 1 ? `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}` : shown[0];
  return rest > 0 ? `${joined} (+${rest} more)` : joined;
}
