import { randomUUID } from 'node:crypto';
import { getDb } from '../db';
import { matchRoles } from './roles';
import { goalDetail, type GoalDetail, type LinkedCourse } from './goal-progress';
import { buildSkillFile, type CompletedCourse, type SkillFile } from './skill-file';

/**
 * Goals a learner is working toward, and the courses generated for them.
 *
 * Many goals per learner. Someone weighing "civil engineer" against
 * "architect" is the ordinary case, and the earlier single-goal table made
 * them overwrite one to look at the other — which also threw away the record
 * of what they had generated for it.
 */

export type Goal = {
  id: string;
  goalText: string;
  roleId: string;
  createdAt: number;
  updatedAt: number;
};

export async function listGoals(userId: string): Promise<Goal[]> {
  const db = await getDb();
  const res = await db.query<Record<string, unknown>>(
    'SELECT id, goal_text, role_id, created_at, updated_at FROM goals WHERE user_id = $1 ORDER BY created_at DESC',
    [userId],
  );
  return res.rows.map((r) => ({
    id: String(r.id),
    goalText: String(r.goal_text ?? ''),
    roleId: String(r.role_id ?? ''),
    createdAt: Number(r.created_at ?? 0),
    updatedAt: Number(r.updated_at ?? 0),
  }));
}

/**
 * Add a goal.
 *
 * The same career is not added twice: a learner who types "AI engineer" again
 * means the goal they already have, and a second identical card would split
 * their generated courses across two rows that each look half done.
 */
export async function addGoal(userId: string, text: string, roleId: string | null): Promise<Goal> {
  const db = await getDb();
  const clean = text.trim().slice(0, 400);

  const resolved = roleId ?? (() => {
    const matches = matchRoles(clean);
    return matches.length === 1 ? matches[0].id : null;
  })();

  if (resolved) {
    const existing = await db.query<{ id: string }>(
      'SELECT id FROM goals WHERE user_id = $1 AND role_id = $2',
      [userId, resolved],
    );
    if (existing.rows[0]) {
      const id = String(existing.rows[0].id);
      /* Keep the newer wording: it is how the learner thinks about it now. */
      await db.query('UPDATE goals SET goal_text = $1, updated_at = $2 WHERE id = $3', [clean, Date.now(), id]);
      const all = await listGoals(userId);
      return all.find((g) => g.id === id)!;
    }
  }

  const now = Date.now();
  const goal: Goal = { id: randomUUID(), goalText: clean, roleId: resolved ?? '', createdAt: now, updatedAt: now };
  await db.query(
    'INSERT INTO goals (id, user_id, goal_text, role_id, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$5)',
    [goal.id, userId, goal.goalText, goal.roleId, now],
  );
  return goal;
}

/**
 * Remove a goal.
 *
 * The courses generated for it are deliberately kept. A learner who abandons
 * "architect" still did the work, it still counts toward everything else, and
 * deleting real study because a plan changed would be the worst thing this
 * feature could do.
 */
export async function removeGoal(userId: string, goalId: string): Promise<boolean> {
  const db = await getDb();
  const res = await db.query('DELETE FROM goals WHERE user_id = $1 AND id = $2', [userId, goalId]);
  if (res.affectedRows) await db.query('DELETE FROM goal_courses WHERE goal_id = $1', [goalId]);
  return Boolean(res.affectedRows);
}

async function goalOf(userId: string, goalId: string): Promise<Goal | null> {
  const goals = await listGoals(userId);
  return goals.find((g) => g.id === goalId) ?? null;
}

/** The courses generated for a goal, with how far into each the learner is. */
export async function linkedCourses(userId: string, goalId: string): Promise<LinkedCourse[]> {
  const db = await getDb();
  const res = await db.query<Record<string, unknown>>(
    `SELECT gc.skill, gc.course_id, c.title, c.lesson_count,
            (SELECT COUNT(*) FROM course_progress p WHERE p.user_id = $1 AND p.course_id = gc.course_id) AS done
       FROM goal_courses gc
       JOIN courses c ON c.id = gc.course_id
      WHERE gc.goal_id = $2 AND c.user_id = $1`,
    [userId, goalId],
  );
  return res.rows.map((r) => ({
    skill: String(r.skill),
    courseId: String(r.course_id),
    title: String(r.title ?? ''),
    lessonsDone: Number(r.done ?? 0),
    lessonsTotal: Number(r.lesson_count ?? 0),
  }));
}

/** Record that a course was generated to close one of a goal's gaps. */
export async function linkCourse(goalId: string, skill: string, courseId: string): Promise<void> {
  const db = await getDb();
  await db.query(
    `INSERT INTO goal_courses (goal_id, skill, course_id, created_at)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (goal_id, skill) DO UPDATE SET course_id = EXCLUDED.course_id, created_at = EXCLUDED.created_at`,
    [goalId, skill, courseId, Date.now()],
  );
}

/**
 * A course counts when every lesson is ticked.
 *
 * Duplicated deliberately from the single-goal store rather than shared: the
 * two callers ask the same question and one of them will change first, and a
 * shared helper that quietly serves both is how a definition of "completed"
 * drifts apart from itself.
 */
export async function completedCourses(userId: string): Promise<CompletedCourse[]> {
  const db = await getDb();
  const res = await db.query<Record<string, unknown>>(
    `SELECT c.id, c.title, c.level, c.data, c.lesson_count,
            (SELECT COUNT(*) FROM course_progress p WHERE p.user_id = $1 AND p.course_id = c.id) AS done,
            (SELECT MAX(p.updated_at) FROM course_progress p WHERE p.user_id = $1 AND p.course_id = c.id) AS at
       FROM courses c WHERE c.user_id = $1`,
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
      completedAt: Number(row.at ?? 0),
    });
  }
  return out.sort((a, b) => b.completedAt - a.completedAt);
}

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
    for (const lesson of mod.lessons ?? []) if (lesson.title) topics.push(String(lesson.title));
  }
  return topics.slice(0, 200);
}

/** The learner's skill file, rebuilt from what they have finished. */
export async function skillFileOf(userId: string): Promise<SkillFile> {
  const completed = await completedCourses(userId);
  return buildSkillFile(userId, completed, { text: '', roleId: null });
}

/** One goal with every skill card and where the learner stands on each. */
export async function detailOf(userId: string, goalId: string): Promise<GoalDetail | null> {
  const goal = await goalOf(userId, goalId);
  if (!goal || !goal.roleId) return null;

  const [file, linked] = await Promise.all([skillFileOf(userId), linkedCourses(userId, goalId)]);
  return goalDetail({ id: goal.id, goalText: goal.goalText, roleId: goal.roleId }, file, linked);
}

/** Every goal with its headline numbers, for the list view. */
export async function goalSummaries(userId: string): Promise<(GoalDetail | { goalId: string; goalText: string; unresolved: true })[]> {
  const goals = await listGoals(userId);
  if (goals.length === 0) return [];

  const file = await skillFileOf(userId);

  return Promise.all(
    goals.map(async (g) => {
      /* A goal whose wording never resolved to a career still belongs to the
         learner and is shown, with the choice still open. */
      if (!g.roleId) return { goalId: g.id, goalText: g.goalText, unresolved: true as const };
      const linked = await linkedCourses(userId, g.id);
      return (
        goalDetail({ id: g.id, goalText: g.goalText, roleId: g.roleId }, file, linked) ?? {
          goalId: g.id,
          goalText: g.goalText,
          unresolved: true as const,
        }
      );
    }),
  );
}
