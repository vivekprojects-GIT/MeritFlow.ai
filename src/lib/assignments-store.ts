import { randomUUID } from 'node:crypto';
import { getDb } from './db';

/* ── Types ──────────────────────────────────────────────────────────────── */

export type Assignment = {
  id: string;
  classId: string;
  title: string;
  instructions: string;
  rubric: string;
  points: number;
  dueAt: number | null;
  createdAt: number;
};

export type InstructorAssignment = Assignment & { submissionCount: number; gradedCount: number };

export type StudentSubmission = {
  text: string;
  link: string;
  fileName: string | null;
  fileData: string | null;
  submittedAt: number;
  grade: number | null;
  feedback: string | null;
  gradedAt: number | null;
} | null;

export type StudentAssignment = Assignment & { submission: StudentSubmission };

/** A dated assignment across one of a student's classes, for the deadlines view. */
export type UpcomingAssignment = {
  id: string;
  classId: string;
  classTitle: string;
  title: string;
  points: number;
  dueAt: number; // always set — this list is due-dated assignments only
  submittedAt: number | null;
  graded: boolean;
  grade: number | null;
};

export type SubmissionEntry = {
  studentId: string;
  email: string;
  text: string;
  link: string;
  fileName: string | null;
  fileData: string | null;
  submittedAt: number;
  grade: number | null;
  feedback: string | null;
  gradedAt: number | null;
};

/** Max size of an uploaded submission file as a data URL (~2.5 MB). */
export const SUBMISSION_FILE_MAX_CHARS = 3_500_000;

/* ── Helpers ────────────────────────────────────────────────────────────── */

async function ownsClass(instructorId: string, classId: string): Promise<boolean> {
  const db = await getDb();
  const r = await db.query('SELECT 1 FROM classes WHERE id = $1 AND instructor_id = $2', [classId, instructorId]);
  return r.rows.length > 0;
}
async function isEnrolled(studentId: string, classId: string): Promise<boolean> {
  const db = await getDb();
  const r = await db.query('SELECT 1 FROM enrollments WHERE class_id = $1 AND student_id = $2', [classId, studentId]);
  return r.rows.length > 0;
}
/** The class an assignment belongs to (or null). */
async function classOfAssignment(assignmentId: string): Promise<string | null> {
  const db = await getDb();
  const r = await db.query<{ class_id: string }>('SELECT class_id FROM assignments WHERE id = $1', [assignmentId]);
  return r.rows[0]?.class_id ?? null;
}

type AssignmentRow = {
  id: string;
  class_id: string;
  title: string;
  instructions: string;
  rubric: string;
  points: number;
  due_at: string | null;
  created_at: string;
};
function mapAssignment(r: AssignmentRow): Assignment {
  return {
    id: r.id,
    classId: r.class_id,
    title: r.title,
    instructions: r.instructions,
    rubric: r.rubric,
    points: Number(r.points),
    dueAt: r.due_at == null ? null : Number(r.due_at),
    createdAt: Number(r.created_at),
  };
}

/* ── Instructor ─────────────────────────────────────────────────────────── */

export async function createAssignment(
  instructorId: string,
  classId: string,
  data: { title: string; instructions: string; rubric: string; points: number; dueAt: number | null },
): Promise<Assignment | null> {
  if (!(await ownsClass(instructorId, classId))) return null;
  const db = await getDb();
  const id = randomUUID();
  await db.query(
    `INSERT INTO assignments (id, class_id, title, instructions, rubric, points, due_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, classId, data.title, data.instructions, data.rubric, data.points, data.dueAt, Date.now()],
  );
  return {
    id,
    classId,
    title: data.title,
    instructions: data.instructions,
    rubric: data.rubric,
    points: data.points,
    dueAt: data.dueAt,
    createdAt: Date.now(),
  };
}

export async function listAssignmentsForInstructor(
  instructorId: string,
  classId: string,
): Promise<InstructorAssignment[] | null> {
  if (!(await ownsClass(instructorId, classId))) return null;
  const db = await getDb();
  const res = await db.query<AssignmentRow & { submissions: number; graded: number }>(
    `SELECT a.*, COALESCE(s.cnt, 0) AS submissions, COALESCE(s.graded, 0) AS graded
       FROM assignments a
       LEFT JOIN (
         SELECT assignment_id, COUNT(*)::int AS cnt, COUNT(grade)::int AS graded
           FROM submissions GROUP BY assignment_id
       ) s ON s.assignment_id = a.id
      WHERE a.class_id = $1
      ORDER BY a.created_at DESC`,
    [classId],
  );
  return res.rows.map((r) => ({
    ...mapAssignment(r),
    submissionCount: Number(r.submissions),
    gradedCount: Number(r.graded),
  }));
}

export async function deleteAssignment(instructorId: string, assignmentId: string): Promise<boolean> {
  const classId = await classOfAssignment(assignmentId);
  if (!classId || !(await ownsClass(instructorId, classId))) return false;
  const db = await getDb();
  await db.query('DELETE FROM assignments WHERE id = $1', [assignmentId]);
  return true;
}

export async function listSubmissions(
  instructorId: string,
  assignmentId: string,
): Promise<{ assignment: Assignment; submissions: SubmissionEntry[] } | null> {
  const classId = await classOfAssignment(assignmentId);
  if (!classId || !(await ownsClass(instructorId, classId))) return null;
  const db = await getDb();
  const a = await db.query<AssignmentRow>('SELECT * FROM assignments WHERE id = $1', [assignmentId]);
  if (!a.rows[0]) return null;
  const res = await db.query<{
    student_id: string;
    email: string;
    text: string;
    link: string;
    file_name: string | null;
    file_data: string | null;
    submitted_at: string;
    grade: number | null;
    feedback: string | null;
    graded_at: string | null;
  }>(
    `SELECT sub.student_id, u.email, sub.text, sub.link, sub.file_name, sub.file_data,
            sub.submitted_at, sub.grade, sub.feedback, sub.graded_at
       FROM submissions sub
       JOIN users u ON u.id = sub.student_id
      WHERE sub.assignment_id = $1
      ORDER BY sub.submitted_at ASC`,
    [assignmentId],
  );
  return {
    assignment: mapAssignment(a.rows[0]),
    submissions: res.rows.map((r) => ({
      studentId: r.student_id,
      email: r.email,
      text: r.text,
      link: r.link,
      fileName: r.file_name,
      fileData: r.file_data,
      submittedAt: Number(r.submitted_at),
      grade: r.grade == null ? null : Number(r.grade),
      feedback: r.feedback,
      gradedAt: r.graded_at == null ? null : Number(r.graded_at),
    })),
  };
}

export async function gradeSubmission(
  instructorId: string,
  assignmentId: string,
  studentId: string,
  grade: number,
  feedback: string,
): Promise<boolean> {
  const classId = await classOfAssignment(assignmentId);
  if (!classId || !(await ownsClass(instructorId, classId))) return false;
  const db = await getDb();
  const res = await db.query(
    `UPDATE submissions SET grade = $1, feedback = $2, graded_at = $3
      WHERE assignment_id = $4 AND student_id = $5`,
    [grade, feedback, Date.now(), assignmentId, studentId],
  );
  return (res.affectedRows ?? 0) > 0;
}

/* ── Student ────────────────────────────────────────────────────────────── */

export async function listAssignmentsForStudent(
  studentId: string,
  classId: string,
): Promise<StudentAssignment[] | null> {
  if (!(await isEnrolled(studentId, classId))) return null;
  const db = await getDb();
  const res = await db.query<
    AssignmentRow & {
      s_text: string | null;
      s_link: string | null;
      s_file_name: string | null;
      s_file_data: string | null;
      s_submitted_at: string | null;
      s_grade: number | null;
      s_feedback: string | null;
      s_graded_at: string | null;
    }
  >(
    `SELECT a.*, sub.text AS s_text, sub.link AS s_link, sub.file_name AS s_file_name, sub.file_data AS s_file_data,
            sub.submitted_at AS s_submitted_at, sub.grade AS s_grade, sub.feedback AS s_feedback, sub.graded_at AS s_graded_at
       FROM assignments a
       LEFT JOIN submissions sub ON sub.assignment_id = a.id AND sub.student_id = $2
      WHERE a.class_id = $1
      ORDER BY a.created_at ASC`,
    [classId, studentId],
  );
  return res.rows.map((r) => ({
    ...mapAssignment(r),
    submission:
      r.s_submitted_at == null
        ? null
        : {
            text: r.s_text ?? '',
            link: r.s_link ?? '',
            fileName: r.s_file_name,
            fileData: r.s_file_data,
            submittedAt: Number(r.s_submitted_at),
            grade: r.s_grade == null ? null : Number(r.s_grade),
            feedback: r.s_feedback,
            gradedAt: r.s_graded_at == null ? null : Number(r.s_graded_at),
          },
  }));
}

/**
 * Every due-dated assignment across all of a student's enrolled classes, with their
 * submission status, ordered by due date — powers the cross-class deadlines panel.
 */
export async function listUpcomingForStudent(studentId: string): Promise<UpcomingAssignment[]> {
  const db = await getDb();
  const res = await db.query<{
    id: string;
    class_id: string;
    class_title: string;
    title: string;
    points: number;
    due_at: string;
    submitted_at: string | null;
    grade: number | null;
  }>(
    `SELECT a.id, a.class_id, c.title AS class_title, a.title, a.points, a.due_at,
            sub.submitted_at, sub.grade
       FROM enrollments en
       JOIN classes c ON c.id = en.class_id
       JOIN assignments a ON a.class_id = c.id
       LEFT JOIN submissions sub ON sub.assignment_id = a.id AND sub.student_id = en.student_id
      WHERE en.student_id = $1 AND a.due_at IS NOT NULL
      ORDER BY a.due_at ASC`,
    [studentId],
  );
  return res.rows.map((r) => ({
    id: r.id,
    classId: r.class_id,
    classTitle: r.class_title,
    title: r.title,
    points: Number(r.points),
    dueAt: Number(r.due_at),
    submittedAt: r.submitted_at == null ? null : Number(r.submitted_at),
    graded: r.grade != null,
    grade: r.grade == null ? null : Number(r.grade),
  }));
}

export async function submitAssignment(
  studentId: string,
  assignmentId: string,
  data: { text: string; link: string; fileName: string | null; fileData: string | null },
): Promise<{ ok: true } | { error: string }> {
  const classId = await classOfAssignment(assignmentId);
  if (!classId || !(await isEnrolled(studentId, classId))) return { error: 'Not enrolled in this class.' };
  const db = await getDb();
  // Don't allow overwriting a submission the professor already graded.
  const existing = await db.query<{ grade: number | null }>(
    'SELECT grade FROM submissions WHERE assignment_id = $1 AND student_id = $2',
    [assignmentId, studentId],
  );
  if (existing.rows[0] && existing.rows[0].grade != null) {
    return { error: 'This submission has already been graded and cannot be changed.' };
  }
  await db.query(
    `INSERT INTO submissions (assignment_id, student_id, text, link, file_name, file_data, submitted_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (assignment_id, student_id)
       DO UPDATE SET text = EXCLUDED.text, link = EXCLUDED.link, file_name = EXCLUDED.file_name,
                     file_data = EXCLUDED.file_data, submitted_at = EXCLUDED.submitted_at`,
    [assignmentId, studentId, data.text, data.link, data.fileName, data.fileData, Date.now()],
  );
  return { ok: true };
}
