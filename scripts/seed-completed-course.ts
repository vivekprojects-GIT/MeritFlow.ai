/**
 * Put one finished course on a learner's account.
 *
 * ## Why this exists
 *
 * The goals page groups skills into what the learner already covers, what they
 * have under way, and what is left. An account with nothing finished can only
 * ever render the third group, so the first two cannot be seen — by a
 * developer, a reviewer, or anyone being shown the feature — until a real
 * course has been completed.
 *
 * This writes one, from a course file on disk, and marks every lesson done. It
 * is a demonstration and development aid, not a fixture: the course it writes
 * is indistinguishable from a generated one and appears in the learner's own
 * library, so run it only against an account where that is wanted.
 *
 * ## Why it refuses to run twice
 *
 * Seeding the same course again would leave the learner with two identical
 * entries in their library and no way to tell which is which. A second run on
 * the same title reports what is there and changes nothing.
 *
 * Usage:
 *   npx tsx scripts/seed-completed-course.ts <email> <path-to-course.json>
 */
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { getDb } from '../src/lib/db';

type Lesson = { title?: string };
type Module = { title?: string; lessons?: Lesson[] };
type CourseFile = { title?: string; subtitle?: string; level?: string; modules?: Module[] };

async function main(): Promise<void> {
  const [email, coursePath] = process.argv.slice(2);
  if (!email || !coursePath) {
    console.error('usage: seed-completed-course.ts <email> <path-to-course.json>');
    process.exit(1);
  }

  const course = JSON.parse(readFileSync(coursePath, 'utf8')) as CourseFile;
  const modules = course.modules ?? [];
  const title = String(course.title ?? '').trim();
  if (!title || modules.length === 0) {
    console.error('That file has no title or no modules.');
    process.exit(1);
  }

  const db = await getDb();

  const user = await db.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [email]);
  const userId = user.rows[0]?.id;
  if (!userId) {
    console.error(`No account for ${email}.`);
    process.exit(1);
  }

  const clash = await db.query<{ id: string }>(
    'SELECT id FROM courses WHERE user_id = $1 AND title = $2',
    [userId, title],
  );
  if (clash.rows[0]) {
    console.log(`"${title}" is already on this account (${clash.rows[0].id}). Nothing written.`);
    return;
  }

  /* The lesson keys must match what the reader writes when a learner ticks a
     lesson off, or the course will look untouched however many rows exist. */
  const keys: string[] = [];
  modules.forEach((mod, moduleIndex) => {
    (mod.lessons ?? []).forEach((_, lessonIndex) => keys.push(`${moduleIndex}:${lessonIndex}`));
  });

  const courseId = randomUUID();
  const now = Date.now();

  await db.query(
    `INSERT INTO courses (id, user_id, title, subtitle, level, prompt, data, created_at, lesson_count)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      courseId,
      userId,
      title,
      String(course.subtitle ?? ''),
      String(course.level ?? ''),
      '',
      JSON.stringify(course),
      now,
      keys.length,
    ],
  );

  for (const key of keys) {
    await db.query(
      'INSERT INTO course_progress (user_id, course_id, lesson_key, updated_at) VALUES ($1,$2,$3,$4)',
      [userId, courseId, key, now],
    );
  }

  console.log(`Wrote "${title}" (${courseId}) with ${keys.length} lessons, all marked complete.`);
}

void main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
