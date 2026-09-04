import { getDb } from '../db';
import { addGoal } from './goals-store';
import { buildSkillFile, type CompletedCourse, type SkillFile } from './skill-file';

/**
 * Reading the skill file out of what the learner has actually finished.
 *
 * ## Why the file is derived, not stored
 *
 * Only the goal is written down. The skills are recomputed from finished
 * courses every time they are asked for, which costs one query and removes a
 * whole class of bug: a stored file drifts the moment a course is deleted, a
 * lesson is un-ticked, or the skill vocabulary grows, and a learner's career
 * page would then be quietly describing a past that no longer exists.
 *
 * The cost of recomputing is small — a learner has tens of courses, not
 * thousands — and it means the vocabulary can be extended and every existing
 * learner benefits without a migration.
 */

/**
 * A course counts when every lesson in it is ticked.
 *
 * "Completed" has to mean completed. Counting a course at eighty per cent
 * would let a skill file grow past what the learner has actually done, and the
 * whole feature rests on the file being true.
 */
export async function completedCourses(userId: string): Promise<CompletedCourse[]> {
  const db = await getDb();

  const res = await db.query<{
    id: string;
    title: string;
    level: string;
    data: string;
    lesson_count: number;
    done: number;
    completed_at: number | null;
  }>(
    `SELECT c.id, c.title, c.level, c.data, c.lesson_count,
            (SELECT COUNT(*) FROM course_progress p WHERE p.user_id = $1 AND p.course_id = c.id) AS done,
            (SELECT MAX(p.updated_at) FROM course_progress p WHERE p.user_id = $1 AND p.course_id = c.id) AS completed_at
       FROM courses c
      WHERE c.user_id = $1`,
    [userId],
  );

  const out: CompletedCourse[] = [];
  for (const row of res.rows) {
    const total = Number(row.lesson_count ?? 0);
    if (total === 0 || Number(row.done ?? 0) < total) continue;

    out.push({
      id: String(row.id),
      title: String(row.title),
      topics: topicsOf(row.data),
      level: String(row.level ?? ''),
      completedAt: Number(row.completed_at ?? 0),
    });
  }

  return out.sort((a, b) => b.completedAt - a.completedAt);
}

/**
 * Module and lesson titles, which is where a course says what it is about.
 *
 * The course title alone is too thin — "Foundations" evidences nothing — and
 * the body text is too noisy, since a lesson mentioning a tool in passing is
 * not a lesson teaching it. Titles are what the author chose to name.
 */
function topicsOf(raw: unknown): string[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return [];
  }

  const course = parsed as { modules?: { title?: string; lessons?: { title?: string }[] }[] };
  const topics: string[] = [];

  for (const mod of course.modules ?? []) {
    if (mod.title) topics.push(String(mod.title));
    for (const lesson of mod.lessons ?? []) {
      if (lesson.title) topics.push(String(lesson.title));
    }
  }

  return topics.slice(0, 200);
}

/* ── The goal, which is the only authored part ──────────────────────────── */

type StoredGoal = { text: string; roleId: string | null };

async function readGoal(userId: string): Promise<StoredGoal> {
  const db = await getDb();
  const res = await db.query<{ goal_text: string; role_id: string }>(
    'SELECT goal_text, role_id FROM goals WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1',
    [userId],
  );
  const row = res.rows[0];
  return { text: String(row?.goal_text ?? ''), roleId: row?.role_id ? String(row.role_id) : null };
}

/**
 * Record what the learner said they want to become.
 *
 * A learner has many goals and one dashboard, so this writes into the same
 * table the goals page reads and the dashboard shows the most recent. Keeping
 * a separate single-goal row was how the card and the list came to hold
 * different careers for the same person, which makes both untrustworthy.
 */
export async function saveGoal(userId: string, text: string, roleId: string | null): Promise<StoredGoal> {
  const goal = await addGoal(userId, text, roleId);
  return { text: goal.goalText, roleId: goal.roleId || null };
}

/** The learner's skill file as it stands now. */
export async function getSkillFile(userId: string): Promise<SkillFile> {
  const [completed, goal] = await Promise.all([completedCourses(userId), readGoal(userId)]);
  return buildSkillFile(userId, completed, goal);
}
