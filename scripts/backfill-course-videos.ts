/**
 * Attach videos to a course that was saved without them.
 *
 * ## Why this exists
 *
 * Courses built from a goal card were saved and never sent through the
 * finishing pass, so lessons that asked for a video did not get one. New
 * courses go through `finishCourse` and are fine; this is for the ones already
 * on disk, and it re-uses exactly the same enrichment rather than a second
 * implementation of it.
 *
 * ## What it costs
 *
 * One search per lesson that wants a video. With YOUTUBE_API_KEY set that is
 * the YouTube Data API; without it, the lookup falls through to SerpAPI, so on
 * a metered SerpAPI key this is not free. It prints the count and waits for
 * --yes before spending anything.
 *
 * Usage:
 *   npx tsx scripts/backfill-course-videos.ts <email> [--title "..."] [--yes]
 */
import { loadEnv } from './load-env';
import { getDb } from '../src/lib/db';
import { countVideoLookups, enrichCourseVideos } from '../src/lib/video-enrichment';
import { mergeCourseVideos } from '../src/lib/courses-store';
import type { EnrichedCourse } from '../src/lib/course-schema';

loadEnv();

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const email = args.find((a) => !a.startsWith('--'));
  const confirmed = args.includes('--yes');
  const titleFlag = args.indexOf('--title');
  const onlyTitle = titleFlag >= 0 ? args[titleFlag + 1] : null;

  if (!email) {
    console.error('usage: backfill-course-videos.ts <email> [--title "..."] [--yes]');
    process.exit(1);
  }

  const db = await getDb();
  const user = await db.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [email]);
  const userId = user.rows[0]?.id;
  if (!userId) {
    console.error(`No account for ${email}.`);
    process.exit(1);
  }

  const res = await db.query<{ id: string; title: string; data: string }>(
    'SELECT id, title, data FROM courses WHERE user_id = $1',
    [userId],
  );

  const targets = res.rows
    .filter((r) => !onlyTitle || String(r.title) === onlyTitle)
    .map((r) => ({ id: String(r.id), title: String(r.title), course: JSON.parse(String(r.data)) as EnrichedCourse }))
    .map((c) => ({ ...c, lookups: countVideoLookups(c.course) }))
    .filter((c) => c.lookups > 0);

  if (targets.length === 0) {
    console.log('Nothing to backfill: no saved course has a lesson waiting on a video.');
    return;
  }

  const total = targets.reduce((n, c) => n + c.lookups, 0);
  for (const t of targets) console.log(`${t.title}: ${t.lookups} lookups`);

  const provider = process.env.YOUTUBE_API_KEY ? 'YouTube Data API' : 'SerpAPI (no YOUTUBE_API_KEY set)';
  console.log(`\nTotal: ${total} searches via ${provider}.`);

  if (!confirmed) {
    console.log('Nothing spent. Re-run with --yes to go ahead.');
    return;
  }

  for (const t of targets) {
    const startedAt = Date.now();
    const withVideos = await enrichCourseVideos(t.course);
    await mergeCourseVideos(userId, t.id, withVideos);

    let found = 0;
    for (const mod of withVideos.modules ?? []) {
      for (const lesson of mod.lessons ?? []) if (lesson.video) found++;
    }
    console.log(`${t.title}: ${found} of ${t.lookups} found in ${Math.round((Date.now() - startedAt) / 1000)}s`);
  }
}

void main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
