import { getDb } from './db';

/**
 * Learning analytics computed from real events.
 *
 * The rule here: every number must be traceable to something that actually
 * happened. `course_progress` and `class_progress` carry an `updated_at` per
 * completed lesson, which is enough for genuine behavioural insight — when
 * someone studies, how fast, whether they have stopped, and where a cohort gets
 * stuck.
 *
 * Deliberately ABSENT, because we do not instrument it:
 *   - session length / "time on task" — there are no start or heartbeat events,
 *     so any minutes-per-session figure would be invented.
 *   - a single "engagement %" — it means nothing without a definition, and a
 *     dashboard that shows two different values for it is worse than one that
 *     shows neither.
 *   - "learning styles" — not a construct with evidence behind it.
 *
 * When there is not enough data, these functions say so (`hasData: false`)
 * rather than returning a confident-looking zero.
 */

const DAY = 86_400_000;

export type ActivityDay = { date: string; lessons: number };

export type LearnerPulse = {
  hasData: boolean;
  /** Lessons completed, all courses. */
  lessonsCompleted: number;
  /** Consecutive days with at least one completed lesson, ending today or yesterday. */
  currentStreak: number;
  longestStreak: number;
  /** Distinct days studied in the last 30. */
  activeDays30: number;
  /** Lessons per active week over the trailing 4 weeks — the honest pace measure. */
  lessonsPerWeek: number;
  /** Days since the last completed lesson; null when nothing is completed yet. */
  daysSinceLastLesson: number | null;
  /** Per-day counts for the last 30 days, oldest first, zero-filled. */
  activity: ActivityDay[];
};

function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Streaks over a set of active day-keys, measured back from today. */
function streaks(days: Set<string>): { current: number; longest: number } {
  if (days.size === 0) return { current: 0, longest: 0 };

  const sorted = [...days].sort();
  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = Date.parse(sorted[i - 1]);
    const curr = Date.parse(sorted[i]);
    if (curr - prev === DAY) {
      run += 1;
      longest = Math.max(longest, run);
    } else {
      run = 1;
    }
  }

  /* A streak stays alive if today is missing but yesterday is present — nobody
     has "broken" a streak at 9am before they have had a chance to study. */
  const today = dayKey(Date.now());
  const yesterday = dayKey(Date.now() - DAY);
  let anchor = days.has(today) ? today : days.has(yesterday) ? yesterday : null;
  let current = 0;
  while (anchor && days.has(anchor)) {
    current += 1;
    anchor = dayKey(Date.parse(anchor) - DAY);
  }

  return { current, longest };
}

export async function learnerPulse(userId: string): Promise<LearnerPulse> {
  const db = await getDb();
  const res = await db.query<{ updated_at: string }>(
    `SELECT updated_at FROM course_progress WHERE user_id = $1
     UNION ALL
     SELECT updated_at FROM class_progress WHERE student_id = $1`,
    [userId],
  );

  const stamps = res.rows.map((r) => Number(r.updated_at)).filter((n) => Number.isFinite(n) && n > 0);
  if (stamps.length === 0) {
    return {
      hasData: false,
      lessonsCompleted: 0,
      currentStreak: 0,
      longestStreak: 0,
      activeDays30: 0,
      lessonsPerWeek: 0,
      daysSinceLastLesson: null,
      activity: emptyActivity(30),
    };
  }

  const days = new Set(stamps.map(dayKey));
  const { current, longest } = streaks(days);
  const now = Date.now();
  const last = Math.max(...stamps);

  const since30 = now - 30 * DAY;
  const activeDays30 = new Set(stamps.filter((s) => s >= since30).map(dayKey)).size;

  /* Pace over the trailing 4 weeks, counted against weeks in which they were
     actually active. Dividing by 4 unconditionally would punish someone who
     started three days ago. */
  const since28 = now - 28 * DAY;
  const recent = stamps.filter((s) => s >= since28);
  const activeWeeks = new Set(recent.map((s) => Math.floor((now - s) / (7 * DAY)))).size;
  const lessonsPerWeek = activeWeeks > 0 ? Math.round((recent.length / activeWeeks) * 10) / 10 : 0;

  return {
    hasData: true,
    lessonsCompleted: stamps.length,
    currentStreak: current,
    longestStreak: longest,
    activeDays30,
    lessonsPerWeek,
    daysSinceLastLesson: Math.floor((now - last) / DAY),
    activity: activitySeries(stamps, 30),
  };
}

function emptyActivity(days: number): ActivityDay[] {
  const out: ActivityDay[] = [];
  for (let i = days - 1; i >= 0; i -= 1) out.push({ date: dayKey(Date.now() - i * DAY), lessons: 0 });
  return out;
}

/** Zero-filled daily counts — gaps are the signal, so they must not be dropped. */
export function activitySeries(stamps: number[], days: number): ActivityDay[] {
  const counts = new Map<string, number>();
  for (const s of stamps) counts.set(dayKey(s), (counts.get(dayKey(s)) ?? 0) + 1);
  return emptyActivity(days).map((d) => ({ date: d.date, lessons: counts.get(d.date) ?? 0 }));
}

/* ── Cohort analytics, for a professor's class ─────────────────────────── */

export type StalledLearner = {
  studentId: string;
  email: string;
  lessonsCompleted: number;
  daysSinceLastLesson: number | null;
};

export type ClassPulse = {
  hasData: boolean;
  enrolled: number;
  /** Started at least one lesson. */
  started: number;
  /** Active in the last 7 days. */
  activeThisWeek: number;
  /**
   * Learners who began but have gone quiet for 7+ days. The single most
   * actionable list on a teaching dashboard — these are the people to contact.
   */
  stalled: StalledLearner[];
  /** Never opened a lesson at all. Different problem, different fix. */
  neverStarted: number;
  /**
   * The lesson most learners stop at — where the class gets stuck. Null until
   * enough learners have stopped somewhere for the pattern to mean anything.
   */
  stickingPoint: { lessonKey: string; stoppedHere: number } | null;
  activity: ActivityDay[];
};

/** Learners must be this quiet before we call them stalled rather than busy. */
const STALL_DAYS = 7;
/** Below this, a "sticking point" is one person's bad week, not a pattern. */
const STICKING_POINT_MIN = 3;

export async function classPulse(classId: string): Promise<ClassPulse> {
  const db = await getDb();

  const roster = await db.query<{ student_id: string; email: string }>(
    `SELECT e.student_id, u.email
       FROM enrollments e JOIN users u ON u.id = e.student_id
      WHERE e.class_id = $1`,
    [classId],
  );

  const progress = await db.query<{ student_id: string; lesson_key: string; updated_at: string }>(
    'SELECT student_id, lesson_key, updated_at FROM class_progress WHERE class_id = $1',
    [classId],
  );

  const now = Date.now();
  const byStudent = new Map<string, { count: number; last: number; lessons: string[] }>();
  for (const row of progress.rows) {
    const at = Number(row.updated_at);
    const entry = byStudent.get(row.student_id) ?? { count: 0, last: 0, lessons: [] };
    entry.count += 1;
    entry.last = Math.max(entry.last, at);
    entry.lessons.push(row.lesson_key);
    byStudent.set(row.student_id, entry);
  }

  const stalled: StalledLearner[] = [];
  let activeThisWeek = 0;
  for (const student of roster.rows) {
    const entry = byStudent.get(student.student_id);
    if (!entry) continue;
    const days = Math.floor((now - entry.last) / DAY);
    if (days <= 7) activeThisWeek += 1;
    else if (days >= STALL_DAYS) {
      stalled.push({
        studentId: student.student_id,
        email: student.email,
        lessonsCompleted: entry.count,
        daysSinceLastLesson: days,
      });
    }
  }
  stalled.sort((a, b) => (b.daysSinceLastLesson ?? 0) - (a.daysSinceLastLesson ?? 0));

  /* Where people stop: the furthest lesson each learner reached. A cluster
     means the class is stuck there, which is a teaching signal, not a metric. */
  const stopCounts = new Map<string, number>();
  for (const [, entry] of byStudent) {
    const furthest = entry.lessons.sort(compareLessonKeys).at(-1);
    if (furthest) stopCounts.set(furthest, (stopCounts.get(furthest) ?? 0) + 1);
  }
  const topStop = [...stopCounts.entries()].sort((a, b) => b[1] - a[1])[0];

  const stamps = progress.rows.map((r) => Number(r.updated_at)).filter(Number.isFinite);

  return {
    hasData: progress.rows.length > 0,
    enrolled: roster.rows.length,
    started: byStudent.size,
    activeThisWeek,
    stalled,
    neverStarted: roster.rows.length - byStudent.size,
    stickingPoint:
      topStop && topStop[1] >= STICKING_POINT_MIN ? { lessonKey: topStop[0], stoppedHere: topStop[1] } : null,
    activity: activitySeries(stamps, 30),
  };
}

/** Lesson keys are "module:lesson" — sort them numerically, not lexically. */
export function compareLessonKeys(a: string, b: string): number {
  const [am, al] = a.split(':').map(Number);
  const [bm, bl] = b.split(':').map(Number);
  return am === bm ? (al || 0) - (bl || 0) : (am || 0) - (bm || 0);
}

/* ── University-wide, for an admin ─────────────────────────────────────── */

export type DormantClass = { classId: string; title: string; professorEmail: string; daysQuiet: number | null };

export type UniversityPulse = {
  hasData: boolean;
  /** Learners who completed a lesson in any class in the last 7 / 30 days. */
  activeLearners7: number;
  activeLearners30: number;
  /** Enrolled but never completed a lesson anywhere — the onboarding gap. */
  neverStarted: number;
  /** Professors who have not created a class — the adoption gap. */
  professorsWithoutClass: number;
  /** Classes with no learner activity for 14+ days, or ever. */
  dormantClasses: DormantClass[];
  activity: ActivityDay[];
};

/** A class is dormant once nobody has touched it for this long. */
const DORMANT_DAYS = 14;

export async function universityPulse(universityId: string): Promise<UniversityPulse> {
  const db = await getDb();

  /* Every class in the university, with its professor. */
  const classes = await db.query<{ id: string; title: string; email: string }>(
    `SELECT c.id, c.title, u.email
       FROM classes c
       JOIN users u ON u.id = c.instructor_id
      WHERE u.university_id = $1`,
    [universityId],
  );

  const progress = await db.query<{ class_id: string; student_id: string; updated_at: string }>(
    `SELECT p.class_id, p.student_id, p.updated_at
       FROM class_progress p
       JOIN classes c ON c.id = p.class_id
       JOIN users u ON u.id = c.instructor_id
      WHERE u.university_id = $1`,
    [universityId],
  );

  const enrolled = await db.query<{ student_id: string }>(
    `SELECT DISTINCT e.student_id
       FROM enrollments e
       JOIN classes c ON c.id = e.class_id
       JOIN users u ON u.id = c.instructor_id
      WHERE u.university_id = $1`,
    [universityId],
  );

  const professors = await db.query<{ id: string; classes: number }>(
    `SELECT u.id, COUNT(c.id)::int AS classes
       FROM users u
       LEFT JOIN classes c ON c.instructor_id = u.id
      WHERE u.university_id = $1 AND u.role = 'instructor'
      GROUP BY u.id`,
    [universityId],
  );

  const now = Date.now();
  const stamps: number[] = [];
  const lastByClass = new Map<string, number>();
  const active7 = new Set<string>();
  const active30 = new Set<string>();
  const everActive = new Set<string>();

  for (const row of progress.rows) {
    const at = Number(row.updated_at);
    if (!Number.isFinite(at)) continue;
    stamps.push(at);
    everActive.add(row.student_id);
    lastByClass.set(row.class_id, Math.max(lastByClass.get(row.class_id) ?? 0, at));
    if (now - at <= 7 * DAY) active7.add(row.student_id);
    if (now - at <= 30 * DAY) active30.add(row.student_id);
  }

  const dormantClasses: DormantClass[] = classes.rows
    .map((klass) => {
      const last = lastByClass.get(klass.id);
      const daysQuiet = last ? Math.floor((now - last) / DAY) : null;
      return { classId: klass.id, title: klass.title, professorEmail: klass.email, daysQuiet };
    })
    /* null means never any activity at all — the most dormant of all. */
    .filter((klass) => klass.daysQuiet === null || klass.daysQuiet >= DORMANT_DAYS)
    .sort((a, b) => (b.daysQuiet ?? Number.MAX_SAFE_INTEGER) - (a.daysQuiet ?? Number.MAX_SAFE_INTEGER));

  return {
    hasData: stamps.length > 0,
    activeLearners7: active7.size,
    activeLearners30: active30.size,
    neverStarted: enrolled.rows.filter((row) => !everActive.has(row.student_id)).length,
    professorsWithoutClass: professors.rows.filter((row) => Number(row.classes) === 0).length,
    dormantClasses,
    activity: activitySeries(stamps, 30),
  };
}
