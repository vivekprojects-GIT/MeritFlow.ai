import { getDb } from './db';
import { PASS_THRESHOLD } from './course-schema';

/* ── Types ──────────────────────────────────────────────────────────────── */

export type GradebookAssignmentCol = { id: string; title: string; points: number };

export type GradebookCell = {
  grade: number | null; // points awarded, null until graded (or if not submitted)
  points: number; // points possible for this assignment
  submitted: boolean;
  pct: number | null; // grade/points * 100, rounded; null until graded
};

export type GradebookRow = {
  studentId: string;
  email: string;
  enrolledAt: number;
  lessonsCompleted: number;
  progressPct: number; // 0-100
  examScore: number | null;
  examTotal: number | null;
  examPct: number | null;
  completedAt: number | null; // class completed (passed the exam)
  assignments: GradebookCell[]; // aligned with `assignments` column order
  overallPct: number | null; // mean of available performance components, null if none yet
};

export type GradebookAverages = {
  progressPct: number | null;
  examPct: number | null;
  overallPct: number | null;
  perAssignmentPct: (number | null)[]; // aligned with `assignments`
};

export type Gradebook = {
  classId: string;
  title: string;
  joinCode: string;
  lessonCount: number;
  passThreshold: number; // 0-1
  assignments: GradebookAssignmentCol[];
  rows: GradebookRow[];
  averages: GradebookAverages;
};

/* ── Aggregation ──────────────────────────────────────────────────────────── */

function mean(xs: number[]): number | null {
  return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
}
function meanOfPresent(xs: (number | null)[]): number | null {
  return mean(xs.filter((x): x is number => x != null));
}

/**
 * Build the full gradebook for a class — only if `instructorId` owns it.
 *
 * Performance components that exist in the DB: the final exam score
 * (`enrollments`) and each assignment grade (`submissions`). Lesson progress
 * (`class_progress`) is reported as completion, not folded into the grade.
 * Per-module quiz results are NOT persisted, so they are not graded here.
 *
 * `overallPct` is the mean of the student's *available graded* performance
 * components (exam % + each graded assignment %), or null if nothing is graded.
 */
export async function getGradebook(instructorId: string, classId: string): Promise<Gradebook | null> {
  const db = await getDb();

  const c = await db.query<{ title: string; join_code: string; lesson_count: number }>(
    'SELECT title, join_code, lesson_count FROM classes WHERE id = $1 AND instructor_id = $2',
    [classId, instructorId],
  );
  if (!c.rows[0]) return null;
  const lessonCount = Number(c.rows[0].lesson_count);

  const aRes = await db.query<{ id: string; title: string; points: number }>(
    'SELECT id, title, points FROM assignments WHERE class_id = $1 ORDER BY created_at ASC',
    [classId],
  );
  const assignments: GradebookAssignmentCol[] = aRes.rows.map((r) => ({
    id: r.id,
    title: r.title,
    points: Number(r.points),
  }));

  const eRes = await db.query<{
    student_id: string;
    email: string;
    enrolled_at: string;
    completed_at: string | null;
    exam_score: number | null;
    exam_total: number | null;
    completed_lessons: number;
  }>(
    `SELECT en.student_id, u.email, en.enrolled_at, en.completed_at, en.exam_score, en.exam_total,
            COALESCE(p.cnt, 0) AS completed_lessons
       FROM enrollments en
       JOIN users u ON u.id = en.student_id
       LEFT JOIN (
         SELECT student_id, COUNT(*)::int AS cnt
           FROM class_progress WHERE class_id = $1 GROUP BY student_id
       ) p ON p.student_id = en.student_id
      WHERE en.class_id = $1
      ORDER BY LOWER(u.email) ASC`,
    [classId],
  );

  // All grades for this class's assignments, keyed by `${assignmentId}:${studentId}`.
  const subMap = new Map<string, number | null>();
  const subSet = new Set<string>();
  if (assignments.length > 0) {
    const sRes = await db.query<{ assignment_id: string; student_id: string; grade: number | null }>(
      `SELECT sub.assignment_id, sub.student_id, sub.grade
         FROM submissions sub
         JOIN assignments a ON a.id = sub.assignment_id
        WHERE a.class_id = $1`,
      [classId],
    );
    for (const r of sRes.rows) {
      const key = `${r.assignment_id}:${r.student_id}`;
      subSet.add(key);
      subMap.set(key, r.grade == null ? null : Number(r.grade));
    }
  }

  const rows: GradebookRow[] = eRes.rows.map((r) => {
    // Clamp to the live lesson count: an instructor who shrinks a course can leave
    // orphaned class_progress rows behind, which would otherwise push this over 100%.
    const lessonsCompleted = Math.min(Number(r.completed_lessons), lessonCount);
    const progressPct = lessonCount > 0 ? Math.min(100, Math.round((lessonsCompleted / lessonCount) * 100)) : 0;
    const examScore = r.exam_score == null ? null : Number(r.exam_score);
    const examTotal = r.exam_total == null ? null : Number(r.exam_total);
    const examPct =
      examScore != null && examTotal != null && examTotal > 0
        ? Math.round((examScore / examTotal) * 100)
        : null;

    const cells: GradebookCell[] = assignments.map((a) => {
      const key = `${a.id}:${r.student_id}`;
      const submitted = subSet.has(key);
      const grade = submitted ? (subMap.get(key) ?? null) : null;
      const pct = grade != null && a.points > 0 ? Math.round((grade / a.points) * 100) : null;
      return { grade, points: a.points, submitted, pct };
    });

    const perf: number[] = [];
    if (examPct != null) perf.push(examPct);
    for (const cell of cells) if (cell.pct != null) perf.push(cell.pct);
    const overallPct = mean(perf);

    return {
      studentId: r.student_id,
      email: r.email,
      enrolledAt: Number(r.enrolled_at),
      lessonsCompleted,
      progressPct,
      examScore,
      examTotal,
      examPct,
      completedAt: r.completed_at == null ? null : Number(r.completed_at),
      assignments: cells,
      overallPct,
    };
  });

  const averages: GradebookAverages = {
    progressPct: rows.length ? Math.round(rows.reduce((a, r) => a + r.progressPct, 0) / rows.length) : null,
    examPct: meanOfPresent(rows.map((r) => r.examPct)),
    overallPct: meanOfPresent(rows.map((r) => r.overallPct)),
    perAssignmentPct: assignments.map((_, i) => meanOfPresent(rows.map((r) => r.assignments[i].pct))),
  };

  return {
    classId,
    title: c.rows[0].title,
    joinCode: c.rows[0].join_code,
    lessonCount,
    passThreshold: PASS_THRESHOLD,
    assignments,
    rows,
    averages,
  };
}

/* ── CSV export ───────────────────────────────────────────────────────────── */

/** Quote a CSV field and neutralize spreadsheet-formula injection. */
function csvCell(value: string | number | null): string {
  let s = value == null ? '' : String(value);
  // Formula-injection guard: a leading =, +, -, @, tab, CR or LF can execute in
  // Excel/Sheets. Some importers trim leading whitespace/BOM first, so look past it.
  if (/^[\s﻿]*[=+\-@\t\r\n]/.test(s)) s = `'${s}`;
  // Always quote and escape embedded quotes — safe for commas/newlines too.
  return `"${s.replace(/"/g, '""')}"`;
}

function isoDate(ms: number): string {
  // YYYY-MM-DD in UTC; stable and locale-independent for exports.
  return new Date(ms).toISOString().slice(0, 10);
}

/** Serialize a gradebook to CSV text (one row per student + a class-average row). */
export function gradebookToCsv(gb: Gradebook): string {
  const header = [
    'Student',
    'Enrolled',
    'Progress %',
    'Lessons completed',
    'Final exam %',
    'Final exam score',
    ...gb.assignments.map((a) => `${a.title} (/${a.points})`),
    'Overall %',
    'Status',
  ];

  const lines: string[] = [header.map(csvCell).join(',')];

  for (const r of gb.rows) {
    const row: (string | number | null)[] = [
      r.email,
      isoDate(r.enrolledAt),
      r.progressPct,
      `${r.lessonsCompleted}/${gb.lessonCount}`,
      r.examPct,
      r.examScore != null && r.examTotal != null ? `${r.examScore}/${r.examTotal}` : '',
      ...r.assignments.map((c) => (c.grade != null ? c.grade : c.submitted ? 'submitted' : '')),
      r.overallPct,
      r.completedAt != null ? 'Completed' : 'In progress',
    ];
    lines.push(row.map(csvCell).join(','));
  }

  // Class-average footer row.
  const avgRow: (string | number | null)[] = [
    'Class average',
    '',
    gb.averages.progressPct,
    '',
    gb.averages.examPct,
    '',
    ...gb.averages.perAssignmentPct,
    gb.averages.overallPct,
    '',
  ];
  lines.push(avgRow.map(csvCell).join(','));

  // Lead with a UTF-8 BOM so Excel on Windows decodes non-ASCII names/titles correctly.
  return '﻿' + lines.join('\r\n');
}

/** A filesystem-safe CSV filename for a class export. */
export function gradebookFilename(gb: Gradebook): string {
  const slug = gb.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'class';
  return `gradebook-${slug}.csv`;
}
