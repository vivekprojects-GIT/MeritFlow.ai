import { randomUUID, randomBytes } from 'node:crypto';
import { getDb } from './db';
import { PASS_THRESHOLD } from './course-schema';
import type { EnrichedCourse } from './course-schema';

/* ── Types ──────────────────────────────────────────────────────────────── */

export type ClassSummary = {
  id: string;
  joinCode: string;
  joinCodeExpiresAt: number | null;
  title: string;
  subtitle: string;
  level: string;
  lessonCount: number;
  examOpen: boolean;
  createdAt: number;
  enrolledCount: number;
  completedCount: number;
};

/** How long a freshly-generated join code stays valid (1 minute). */
export const JOIN_CODE_TTL_MS = 60_000;

export type RosterEntry = {
  studentId: string;
  email: string;
  enrolledAt: number;
  completedLessons: number;
  completedAt: number | null;
  examScore: number | null;
  examTotal: number | null;
};

export type StudentClass = {
  id: string;
  title: string;
  subtitle: string;
  level: string;
  professorEmail: string;
  lessonCount: number;
  completedCount: number;
  examOpen: boolean;
  completedAt: number | null;
};

function countLessons(course: EnrichedCourse): number {
  return course.modules.reduce((n, m) => n + m.lessons.length, 0);
}

/** Human-friendly join code — no ambiguous characters (0/O, 1/I/L). */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function randomCode(len = 6): string {
  const bytes = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

/* ── Instructor ─────────────────────────────────────────────────────────── */

/** Publish a course as a class. Returns the new class id + its join code. */
export async function createClass(
  instructorId: string,
  course: EnrichedCourse,
): Promise<{ id: string; joinCode: string; expiresAt: number }> {
  const db = await getDb();
  const id = randomUUID();
  // Inherit the publishing instructor's university so admins can see this class.
  const uni = await db.query<{ university_id: string | null }>('SELECT university_id FROM users WHERE id = $1', [
    instructorId,
  ]);
  const universityId = uni.rows[0]?.university_id ?? null;
  let joinCode = randomCode();
  for (let tries = 0; tries < 6; tries++) {
    const exists = await db.query('SELECT 1 FROM classes WHERE join_code = $1', [joinCode]);
    if (exists.rows.length === 0) break;
    joinCode = randomCode();
  }
  const expiresAt = Date.now() + JOIN_CODE_TTL_MS;
  await db.query(
    `INSERT INTO classes (id, instructor_id, join_code, join_code_expires_at, title, subtitle, level, data, lesson_count, exam_open, university_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, FALSE, $10, $11)`,
    [
      id,
      instructorId,
      joinCode,
      expiresAt,
      course.title,
      course.subtitle,
      course.level,
      JSON.stringify(course),
      countLessons(course),
      universityId,
      Date.now(),
    ],
  );
  return { id, joinCode, expiresAt };
}

/**
 * Generate a fresh, unique join code valid for {@link JOIN_CODE_TTL_MS}. Returns the
 * new code + expiry, or null if the instructor doesn't own the class.
 */
export async function regenerateJoinCode(
  instructorId: string,
  classId: string,
): Promise<{ joinCode: string; expiresAt: number } | null> {
  const db = await getDb();
  let joinCode = randomCode();
  for (let tries = 0; tries < 6; tries++) {
    const exists = await db.query('SELECT 1 FROM classes WHERE join_code = $1 AND id <> $2', [joinCode, classId]);
    if (exists.rows.length === 0) break;
    joinCode = randomCode();
  }
  const expiresAt = Date.now() + JOIN_CODE_TTL_MS;
  const res = await db.query(
    'UPDATE classes SET join_code = $1, join_code_expires_at = $2 WHERE id = $3 AND instructor_id = $4',
    [joinCode, expiresAt, classId, instructorId],
  );
  if ((res.affectedRows ?? 0) === 0) return null;
  return { joinCode, expiresAt };
}

export async function listClassesForInstructor(instructorId: string): Promise<ClassSummary[]> {
  const db = await getDb();
  const res = await db.query<{
    id: string;
    join_code: string;
    join_code_expires_at: string | null;
    title: string;
    subtitle: string;
    level: string;
    lesson_count: number;
    exam_open: boolean;
    created_at: string;
    enrolled: number;
    completed: number;
  }>(
    `SELECT c.id, c.join_code, c.join_code_expires_at, c.title, c.subtitle, c.level, c.lesson_count, c.exam_open, c.created_at,
            COALESCE(e.enrolled, 0)  AS enrolled,
            COALESCE(e.completed, 0) AS completed
       FROM classes c
       LEFT JOIN (
         SELECT class_id,
                COUNT(*)::int            AS enrolled,
                COUNT(completed_at)::int AS completed
           FROM enrollments
          GROUP BY class_id
       ) e ON e.class_id = c.id
      WHERE c.instructor_id = $1
      ORDER BY c.created_at DESC`,
    [instructorId],
  );
  return res.rows.map((r) => ({
    id: r.id,
    joinCode: r.join_code,
    joinCodeExpiresAt: r.join_code_expires_at == null ? null : Number(r.join_code_expires_at),
    title: r.title,
    subtitle: r.subtitle,
    level: r.level,
    lessonCount: Number(r.lesson_count),
    examOpen: r.exam_open,
    createdAt: Number(r.created_at),
    enrolledCount: Number(r.enrolled),
    completedCount: Number(r.completed),
  }));
}

/** A class plus its student roster — only if `instructorId` owns it. */
export async function getClassWithRoster(
  instructorId: string,
  classId: string,
): Promise<{ klass: ClassSummary; roster: RosterEntry[] } | null> {
  const db = await getDb();
  const all = await listClassesForInstructor(instructorId);
  const klass = all.find((c) => c.id === classId);
  if (!klass) return null;

  const res = await db.query<{
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
           FROM class_progress
          WHERE class_id = $1
          GROUP BY student_id
       ) p ON p.student_id = en.student_id
      WHERE en.class_id = $1
      ORDER BY en.enrolled_at ASC`,
    [classId],
  );
  const roster: RosterEntry[] = res.rows.map((r) => ({
    studentId: r.student_id,
    email: r.email,
    enrolledAt: Number(r.enrolled_at),
    completedLessons: Number(r.completed_lessons),
    completedAt: r.completed_at == null ? null : Number(r.completed_at),
    examScore: r.exam_score == null ? null : Number(r.exam_score),
    examTotal: r.exam_total == null ? null : Number(r.exam_total),
  }));
  return { klass, roster };
}

/** Roster for any class within a university — used by the admin oversight view. */
export async function getClassRosterForUniversity(
  universityId: string,
  classId: string,
): Promise<{ title: string; joinCode: string; lessonCount: number; roster: RosterEntry[] } | null> {
  const db = await getDb();
  const c = await db.query<{ title: string; join_code: string; lesson_count: number }>(
    'SELECT title, join_code, lesson_count FROM classes WHERE id = $1 AND university_id = $2',
    [classId, universityId],
  );
  const row = c.rows[0];
  if (!row) return null;
  const res = await db.query<{
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
         SELECT student_id, COUNT(*)::int AS cnt FROM class_progress WHERE class_id = $1 GROUP BY student_id
       ) p ON p.student_id = en.student_id
      WHERE en.class_id = $1
      ORDER BY en.enrolled_at ASC`,
    [classId],
  );
  return {
    title: row.title,
    joinCode: row.join_code,
    lessonCount: Number(row.lesson_count),
    roster: res.rows.map((r) => ({
      studentId: r.student_id,
      email: r.email,
      enrolledAt: Number(r.enrolled_at),
      completedLessons: Number(r.completed_lessons),
      completedAt: r.completed_at == null ? null : Number(r.completed_at),
      examScore: r.exam_score == null ? null : Number(r.exam_score),
      examTotal: r.exam_total == null ? null : Number(r.exam_total),
    })),
  };
}

/** Load a class's full course JSON for editing — only if `instructorId` owns it. */
export async function getClassCourseForInstructor(
  instructorId: string,
  classId: string,
): Promise<EnrichedCourse | null> {
  const db = await getDb();
  const res = await db.query<{ data: string }>(
    'SELECT data FROM classes WHERE id = $1 AND instructor_id = $2',
    [classId, instructorId],
  );
  const row = res.rows[0];
  if (!row) return null;
  return JSON.parse(row.data) as EnrichedCourse;
}

/**
 * Replace a class's course content with an edited copy. Re-derives the
 * denormalized title/subtitle/level/lesson_count columns so dashboards and the
 * roster stay accurate. Returns true only if the instructor owns the class.
 */
export async function updateClassCourse(
  instructorId: string,
  classId: string,
  course: EnrichedCourse,
): Promise<boolean> {
  const db = await getDb();
  const res = await db.query(
    `UPDATE classes
        SET title = $1, subtitle = $2, level = $3, data = $4, lesson_count = $5
      WHERE id = $6 AND instructor_id = $7`,
    [
      course.title,
      course.subtitle,
      course.level,
      JSON.stringify(course),
      countLessons(course),
      classId,
      instructorId,
    ],
  );
  const ok = (res.affectedRows ?? 0) > 0;
  if (ok) {
    // Prune progress rows for lessons that no longer exist after the edit, so a
    // student's completed-lesson count can never exceed the live lesson count.
    // class_progress.lesson_key is the positional `${moduleIndex}:${lessonIndex}`.
    const validKeys: string[] = [];
    course.modules.forEach((m, mi) => m.lessons.forEach((_, li) => validKeys.push(`${mi}:${li}`)));
    if (validKeys.length > 0) {
      const placeholders = validKeys.map((_, i) => `$${i + 2}`).join(', ');
      await db.query(
        `DELETE FROM class_progress WHERE class_id = $1 AND lesson_key NOT IN (${placeholders})`,
        [classId, ...validKeys],
      );
    }
  }
  return ok;
}

/** Merge background-found lesson videos into an existing class without changing edited text. */
export async function mergeClassCourseVideos(
  instructorId: string,
  classId: string,
  source: EnrichedCourse,
): Promise<boolean> {
  const db = await getDb();
  const res = await db.query<{ data: string }>(
    'SELECT data FROM classes WHERE id = $1 AND instructor_id = $2',
    [classId, instructorId],
  );
  const row = res.rows[0];
  if (!row) return false;

  const current = JSON.parse(row.data) as EnrichedCourse;
  const changed = mergeVideos(current, source);
  if (!changed) return true;

  const update = await db.query('UPDATE classes SET data = $1 WHERE id = $2 AND instructor_id = $3', [
    JSON.stringify(current),
    classId,
    instructorId,
  ]);
  return (update.affectedRows ?? 0) > 0;
}

/**
 * Permanently delete a class the instructor owns. Enrollments, progress,
 * assignments, and submissions cascade away via foreign keys.
 */
export async function deleteClass(instructorId: string, classId: string): Promise<boolean> {
  const db = await getDb();
  const res = await db.query('DELETE FROM classes WHERE id = $1 AND instructor_id = $2', [
    classId,
    instructorId,
  ]);
  return (res.affectedRows ?? 0) > 0;
}

/** Open or close the final exam for a class. Returns true if the instructor owns it. */
export async function setExamOpen(instructorId: string, classId: string, open: boolean): Promise<boolean> {
  const db = await getDb();
  const res = await db.query(
    'UPDATE classes SET exam_open = $1 WHERE id = $2 AND instructor_id = $3',
    [open, classId, instructorId],
  );
  return (res.affectedRows ?? 0) > 0;
}

function mergeVideos(target: EnrichedCourse, source: EnrichedCourse): boolean {
  let changed = false;
  source.modules.forEach((sourceModule, m) => {
    const targetModule = target.modules[m];
    if (!targetModule) return;
    sourceModule.lessons.forEach((sourceLesson, l) => {
      const video = sourceLesson.video;
      const targetLesson = targetModule.lessons[l];
      if (!targetLesson || !video) return;
      if (targetLesson.video?.id === video.id) return;
      if (targetLesson.video && targetLesson.video.id !== video.id) return;
      targetLesson.video = video;
      changed = true;
    });
  });
  return changed;
}

/* ── Student ────────────────────────────────────────────────────────────── */

/**
 * Enroll the student in the class taught by `professorEmail` with join code `code`.
 * Both must match the same class — the code alone is not enough. Idempotent.
 */
export async function enrollByEmailAndCode(
  studentId: string,
  professorEmail: string,
  code: string,
): Promise<{ id: string; title: string } | { error: string }> {
  const db = await getDb();
  const res = await db.query<{ id: string; title: string; join_code_expires_at: string | null }>(
    `SELECT c.id, c.title, c.join_code_expires_at
       FROM classes c
       JOIN users u ON u.id = c.instructor_id
      WHERE c.join_code = $1 AND LOWER(u.email) = LOWER($2)`,
    [code.trim().toUpperCase(), professorEmail.trim()],
  );
  const klass = res.rows[0];
  if (!klass) return { error: 'No class matches that professor email and code.' };
  const expiresAt = klass.join_code_expires_at == null ? null : Number(klass.join_code_expires_at);
  if (expiresAt == null || expiresAt <= Date.now()) {
    return { error: 'That join code has expired — ask your professor to generate a fresh one.' };
  }
  await db.query(
    `INSERT INTO enrollments (class_id, student_id, enrolled_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (class_id, student_id) DO NOTHING`,
    [klass.id, studentId, Date.now()],
  );
  return { id: klass.id, title: klass.title };
}

export async function listClassesForStudent(studentId: string): Promise<StudentClass[]> {
  const db = await getDb();
  const res = await db.query<{
    id: string;
    title: string;
    subtitle: string;
    level: string;
    professor_email: string;
    lesson_count: number;
    exam_open: boolean;
    completed_at: string | null;
    completed_lessons: number;
  }>(
    `SELECT c.id, c.title, c.subtitle, c.level, u.email AS professor_email, c.lesson_count, c.exam_open, en.completed_at,
            COALESCE(p.cnt, 0) AS completed_lessons
       FROM enrollments en
       JOIN classes c ON c.id = en.class_id
       JOIN users u ON u.id = c.instructor_id
       LEFT JOIN (
         SELECT class_id, COUNT(*)::int AS cnt
           FROM class_progress
          WHERE student_id = $1
          GROUP BY class_id
       ) p ON p.class_id = c.id
      WHERE en.student_id = $1
      ORDER BY en.enrolled_at DESC`,
    [studentId],
  );
  return res.rows.map((r) => ({
    id: r.id,
    title: r.title,
    subtitle: r.subtitle,
    level: r.level,
    professorEmail: r.professor_email,
    lessonCount: Number(r.lesson_count),
    completedCount: Number(r.completed_lessons),
    examOpen: r.exam_open,
    completedAt: r.completed_at == null ? null : Number(r.completed_at),
  }));
}

async function isEnrolled(studentId: string, classId: string): Promise<boolean> {
  const db = await getDb();
  const res = await db.query('SELECT 1 FROM enrollments WHERE class_id = $1 AND student_id = $2', [
    classId,
    studentId,
  ]);
  return res.rows.length > 0;
}

/** The full class course for an enrolled student, with their progress + exam state. */
export async function getEnrolledClass(
  studentId: string,
  classId: string,
): Promise<{
  course: EnrichedCourse;
  examOpen: boolean;
  /** Per-module quiz access, resolved for this learner. */
  quizOpen: boolean[];
  /** Why a closed assessment is closed, so the reader is not left guessing. */
  gateReasons: Record<string, string>;
  completed: string[];
  completedAt: number | null;
} | null> {
  if (!(await isEnrolled(studentId, classId))) return null;
  const db = await getDb();
  const res = await db.query<{ data: string; exam_open: boolean }>(
    'SELECT data, exam_open FROM classes WHERE id = $1',
    [classId],
  );
  const row = res.rows[0];
  if (!row) return null;
  const prog = await db.query<{ lesson_key: string }>(
    'SELECT lesson_key FROM class_progress WHERE class_id = $1 AND student_id = $2',
    [classId, studentId],
  );
  const en = await db.query<{ completed_at: string | null }>(
    'SELECT completed_at FROM enrollments WHERE class_id = $1 AND student_id = $2',
    [classId, studentId],
  );
  const course = JSON.parse(row.data) as EnrichedCourse;

  /* Access is resolved server-side, per learner. The reader used to receive the
     raw class flag and decide for itself, which meant a per-student override
     could not exist and a closed exam was only closed in the UI. */
  const { getClassGates, resolveGate, quizGate } = await import('./assessment-gates');
  const gates = await getClassGates(classId);
  const examDecision = resolveGate(gates, studentId, 'exam');

  const modules = course.modules ?? [];
  const quizDecisions = modules.map((_, i) => resolveGate(gates, studentId, quizGate(i)));

  const gateReasons: Record<string, string> = { exam: examDecision.reason };
  quizDecisions.forEach((d, i) => {
    gateReasons[`quiz:${i}`] = d.reason;
  });

  return {
    course,
    examOpen: examDecision.open,
    quizOpen: quizDecisions.map((d) => d.open),
    gateReasons,
    completed: prog.rows.map((p) => p.lesson_key),
    completedAt: en.rows[0]?.completed_at == null ? null : Number(en.rows[0].completed_at),
  };
}

export async function setClassLessonCompleted(
  studentId: string,
  classId: string,
  lessonKey: string,
  completed: boolean,
): Promise<void> {
  if (!(await isEnrolled(studentId, classId))) return;
  const db = await getDb();
  if (completed) {
    await db.query(
      `INSERT INTO class_progress (class_id, student_id, lesson_key, updated_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (class_id, student_id, lesson_key) DO UPDATE SET updated_at = EXCLUDED.updated_at`,
      [classId, studentId, lessonKey, Date.now()],
    );
  } else {
    await db.query(
      'DELETE FROM class_progress WHERE class_id = $1 AND student_id = $2 AND lesson_key = $3',
      [classId, studentId, lessonKey],
    );
  }
}

/** Record a student's final-exam result; marks the class complete when they pass. */
export async function recordClassExam(
  studentId: string,
  classId: string,
  score: number,
  total: number,
): Promise<boolean> {
  if (!(await isEnrolled(studentId, classId))) return false;
  const db = await getDb();
  const passed = total > 0 && score / total >= PASS_THRESHOLD;
  await db.query(
    `UPDATE enrollments
        SET exam_score = $1, exam_total = $2, completed_at = $3
      WHERE class_id = $4 AND student_id = $5`,
    [score, total, passed ? Date.now() : null, classId, studentId],
  );
  return passed;
}
