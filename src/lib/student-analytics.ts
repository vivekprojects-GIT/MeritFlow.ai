import { getDb } from './db';

/**
 * Student-level analytics for an administrator.
 *
 * The existing admin view aggregates to professors and classes, which answers
 * "is the platform being adopted" but not "which learner is in trouble". Those
 * are different questions and the second one is the one a dean acts on, so this
 * module resolves down to the individual.
 *
 * Everything is computed in one pass over three queries rather than per-student
 * lookups. A university with 5,000 learners across 200 classes would otherwise
 * issue thousands of round-trips against a WASM Postgres running in-process.
 *
 * What is deliberately *not* here: engagement scores, predicted grades, and
 * risk percentages. Those invent precision the data cannot support, and an
 * administrator acting on a fabricated 73% risk score does real harm to a real
 * student. Every field below is a count, a date, or a ratio of the two.
 */

export type StudentRow = {
  id: string;
  email: string;
  /** Distinct classes the student is enrolled in. */
  classes: number;
  /** Lesson completions summed across every class. */
  lessonsDone: number;
  /** Total lessons across the classes they are enrolled in. */
  lessonsTotal: number;
  progressPct: number;
  /** Classes finished end-to-end. */
  completions: number;
  /** Mean exam percentage across graded exams; null until one is graded. */
  examPct: number | null;
  /** Epoch ms of the most recent lesson completion; null if never active. */
  lastActive: number | null;
  daysQuiet: number | null;
  status: 'never-started' | 'at-risk' | 'active' | 'completed';
};

export type StudentAnalytics = {
  students: StudentRow[];
  /** Cohort progress percentages, for the distribution chart. */
  progressValues: number[];
  counts: { total: number; neverStarted: number; atRisk: number; active: number; completed: number };
};

const DAY = 86_400_000;
/** Enrolled, has started, but nothing for this long. The point of intervention. */
const AT_RISK_DAYS = 10;

export async function universityStudents(universityId: string): Promise<StudentAnalytics> {
  const db = await getDb();

  /* Enrolments joined to the class, scoped to classes owned by this
     university's professors. A student is "in" the university if they are
     enrolled in one of its classes, which is truer than the university_id
     stamp on the user row — that is only set at signup. */
  const enrol = await db.query<{
    student_id: string;
    email: string;
    class_id: string;
    lesson_count: number;
    completed_at: string | null;
    exam_score: number | null;
    exam_total: number | null;
  }>(
    `SELECT e.student_id, u.email, e.class_id, c.lesson_count,
            e.completed_at, e.exam_score, e.exam_total
       FROM enrollments e
       JOIN classes c ON c.id = e.class_id
       JOIN users u   ON u.id = e.student_id
       JOIN users p   ON p.id = c.instructor_id
      WHERE p.university_id = $1`,
    [universityId],
  );

  const progress = await db.query<{ student_id: string; updated_at: string }>(
    `SELECT pr.student_id, pr.updated_at
       FROM class_progress pr
       JOIN classes c ON c.id = pr.class_id
       JOIN users p   ON p.id = c.instructor_id
      WHERE p.university_id = $1`,
    [universityId],
  );

  type Acc = Omit<StudentRow, 'progressPct' | 'daysQuiet' | 'status'> & { examSum: number; examN: number };
  const byStudent = new Map<string, Acc>();

  for (const r of enrol.rows) {
    let s = byStudent.get(r.student_id);
    if (!s) {
      s = {
        id: r.student_id,
        email: r.email,
        classes: 0,
        lessonsDone: 0,
        lessonsTotal: 0,
        completions: 0,
        examPct: null,
        lastActive: null,
        examSum: 0,
        examN: 0,
      };
      byStudent.set(r.student_id, s);
    }
    s.classes += 1;
    s.lessonsTotal += Number(r.lesson_count) || 0;
    if (r.completed_at) s.completions += 1;
    /* Guard the divisor: a zero-total exam would produce Infinity and poison
       the cohort mean. */
    if (r.exam_score != null && r.exam_total != null && r.exam_total > 0) {
      s.examSum += (r.exam_score / r.exam_total) * 100;
      s.examN += 1;
    }
  }

  for (const p of progress.rows) {
    const s = byStudent.get(p.student_id);
    if (!s) continue;
    s.lessonsDone += 1;
    const at = Number(p.updated_at);
    if (!Number.isNaN(at) && (s.lastActive == null || at > s.lastActive)) s.lastActive = at;
  }

  const now = Date.now();
  const students: StudentRow[] = [];

  for (const s of byStudent.values()) {
    const progressPct = s.lessonsTotal > 0 ? Math.min(100, Math.round((s.lessonsDone / s.lessonsTotal) * 100)) : 0;
    const daysQuiet = s.lastActive == null ? null : Math.floor((now - s.lastActive) / DAY);

    /* Order matters: finishing everything outranks being quiet, or every
       successful graduate would be flagged as at-risk the week after. */
    let status: StudentRow['status'];
    if (s.classes > 0 && s.completions === s.classes) status = 'completed';
    else if (s.lastActive == null) status = 'never-started';
    else if ((daysQuiet ?? 0) >= AT_RISK_DAYS) status = 'at-risk';
    else status = 'active';

    students.push({
      id: s.id,
      email: s.email,
      classes: s.classes,
      lessonsDone: s.lessonsDone,
      lessonsTotal: s.lessonsTotal,
      progressPct,
      completions: s.completions,
      examPct: s.examN > 0 ? Math.round(s.examSum / s.examN) : null,
      lastActive: s.lastActive,
      daysQuiet,
      status,
    });
  }

  /* Most-stalled first: the list is a worklist, so the people who need
     attention should not be on page four. */
  const rank = { 'at-risk': 0, 'never-started': 1, active: 2, completed: 3 } as const;
  students.sort((a, b) => rank[a.status] - rank[b.status] || (b.daysQuiet ?? 0) - (a.daysQuiet ?? 0));

  const counts = {
    total: students.length,
    neverStarted: students.filter((s) => s.status === 'never-started').length,
    atRisk: students.filter((s) => s.status === 'at-risk').length,
    active: students.filter((s) => s.status === 'active').length,
    completed: students.filter((s) => s.status === 'completed').length,
  };

  return { students, progressValues: students.map((s) => s.progressPct), counts };
}
