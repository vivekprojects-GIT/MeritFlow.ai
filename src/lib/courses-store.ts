import { randomUUID } from 'node:crypto';
import { getDb } from './db';
import type { EnrichedCourse } from './course-schema';

export type CoursePlaylist = {
  id: string;
  name: string;
  createdAt: number;
  courseCount: number;
};

export type NotificationTone = 'info' | 'success' | 'warning' | 'error';

export type AppNotification = {
  id: string;
  tone: NotificationTone;
  title: string;
  message: string;
  href: string;
  readAt: number | null;
  createdAt: number;
};

export type CourseSummary = {
  id: string;
  title: string;
  subtitle: string;
  level: string;
  category: string;
  /** Cached cover photo; null until the lookup runs, or if it found nothing. */
  coverUrl: string | null;
  favorite: boolean;
  playlistIds: string[];
  createdAt: number;
  lessonCount: number;
  completedCount: number;
};

function countLessons(course: EnrichedCourse): number {
  return course.modules.reduce((n, m) => n + m.lessons.length, 0);
}

export function inferCourseCategory(title: string, subtitle = '', prompt = ''): string {
  const text = `${title} ${subtitle} ${prompt}`.toLowerCase();
  if (/\b(ai|artificial intelligence|machine learning|ml|llm|agent|neural|data science)\b/.test(text)) return 'AI & ML';
  if (/\b(python|javascript|typescript|react|web|code|programming|developer|sql)\b/.test(text)) return 'Programming';
  if (/\b(ui|ux|design|product|figma|research|prototype)\b/.test(text)) return 'Design';
  if (/\b(finance|invest|money|wealth|stock|budget)\b/.test(text)) return 'Finance';
  if (/\b(speak|story|communication|writing|presentation)\b/.test(text)) return 'Communication';
  if (/\b(business|startup|negotiat|management|marketing)\b/.test(text)) return 'Business';
  return 'General';
}

/** Persist a generated course for a user. Returns the new course id. */
export async function saveCourse(userId: string, course: EnrichedCourse, prompt: string): Promise<string> {
  const db = await getDb();
  const id = randomUUID();
  await db.query(
    `INSERT INTO courses (id, user_id, title, subtitle, level, prompt, data, lesson_count, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      userId,
      course.title,
      course.subtitle,
      course.level,
      prompt,
      JSON.stringify(course),
      countLessons(course),
      Date.now(),
    ],
  );
  return id;
}

export async function listCourses(userId: string): Promise<CourseSummary[]> {
  const db = await getDb();
  const res = await db.query<{
    id: string;
    title: string;
    subtitle: string;
    level: string;
    prompt: string;
    created_at: string;
    lesson_count: number;
    completed_count: number;
    favorite: boolean;
    cover_url: string | null;
    playlist_ids: string[] | string | null;
  }>(
    `SELECT c.id, c.title, c.subtitle, c.level, c.prompt, c.created_at, c.lesson_count, c.cover_url,
            COALESCE(p.cnt, 0) AS completed_count,
            (f.course_id IS NOT NULL) AS favorite,
            COALESCE(pl.playlist_ids, '') AS playlist_ids
       FROM courses c
       LEFT JOIN (
         SELECT course_id, COUNT(*)::int AS cnt
           FROM course_progress
          WHERE user_id = $1
          GROUP BY course_id
       ) p ON p.course_id = c.id
       LEFT JOIN course_favorites f
              ON f.course_id = c.id AND f.user_id = $1
       LEFT JOIN (
         -- SQLite has no array type, so the playlist ids come back as one
         -- comma-separated string. The ordering is done in the inner select
         -- because ORDER BY inside an aggregate is not portable.
         SELECT ordered.course_id, group_concat(ordered.playlist_id, ',') AS playlist_ids
           FROM (
             SELECT i.course_id, i.playlist_id
               FROM course_playlist_items i
               JOIN course_playlists cp ON cp.id = i.playlist_id
              WHERE cp.user_id = $1
              ORDER BY cp.created_at DESC
           ) ordered
          GROUP BY ordered.course_id
       ) pl ON pl.course_id = c.id
      WHERE c.user_id = $1
      ORDER BY c.created_at DESC`,
    [userId],
  );
  return res.rows.map((r) => ({
    id: r.id,
    title: r.title,
    subtitle: r.subtitle,
    level: r.level,
    category: inferCourseCategory(r.title, r.subtitle, r.prompt),
    coverUrl: r.cover_url?.trim() || null,
    favorite: Boolean(r.favorite),
    playlistIds: Array.isArray(r.playlist_ids)
      ? r.playlist_ids
      : typeof r.playlist_ids === 'string'
        ? parseIdList(r.playlist_ids)
        : [],
    createdAt: Number(r.created_at),
    lessonCount: Number(r.lesson_count),
    completedCount: Number(r.completed_count),
  }));
}

/**
 * A grouped list of ids, from either database.
 *
 * SQLite returns `group_concat` output as a plain comma-separated string;
 * Postgres returned `array_agg` output in its own `{a,b}` literal form. Both
 * shapes are accepted because the braces are simply stripped when present, and
 * an empty result yields an empty list rather than one empty id.
 */
function parseIdList(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed || trimmed === '{}') return [];
  return trimmed
    .replace(/^\{|\}$/g, '')
    .split(',')
    .map((item) => item.replace(/^"|"$/g, '').trim())
    .filter(Boolean);
}

/** Cache a looked-up cover photo against a course. Best-effort; never throws. */
export async function setCourseCover(userId: string, courseId: string, coverUrl: string | null): Promise<void> {
  const db = await getDb();
  await db.query('UPDATE courses SET cover_url = $1 WHERE id = $2 AND user_id = $3', [coverUrl, courseId, userId]);
}

export async function listPlaylists(userId: string): Promise<CoursePlaylist[]> {
  const db = await getDb();
  const res = await db.query<{ id: string; name: string; created_at: string; course_count: number }>(
    `SELECT p.id, p.name, p.created_at, COUNT(i.course_id)::int AS course_count
       FROM course_playlists p
       LEFT JOIN course_playlist_items i ON i.playlist_id = p.id
      WHERE p.user_id = $1
      GROUP BY p.id, p.name, p.created_at
      ORDER BY p.created_at DESC`,
    [userId],
  );
  return res.rows.map((r) => ({
    id: r.id,
    name: r.name,
    createdAt: Number(r.created_at),
    courseCount: Number(r.course_count),
  }));
}

export async function createPlaylist(userId: string, name: string): Promise<CoursePlaylist> {
  const db = await getDb();
  const id = randomUUID();
  const now = Date.now();
  const clean = name.trim().slice(0, 80);
  await db.query(
    'INSERT INTO course_playlists (id, user_id, name, created_at) VALUES ($1, $2, $3, $4)',
    [id, userId, clean || 'New playlist', now],
  );
  return { id, name: clean || 'New playlist', createdAt: now, courseCount: 0 };
}

export async function addCourseToPlaylist(userId: string, playlistId: string, courseId: string): Promise<boolean> {
  const db = await getDb();
  const owns = await db.query(
    `SELECT 1
       FROM course_playlists p
       JOIN courses c ON c.id = $2 AND c.user_id = p.user_id
      WHERE p.id = $1 AND p.user_id = $3`,
    [playlistId, courseId, userId],
  );
  if (owns.rows.length === 0) return false;
  await db.query(
    `INSERT INTO course_playlist_items (playlist_id, course_id, added_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (playlist_id, course_id) DO UPDATE SET added_at = EXCLUDED.added_at`,
    [playlistId, courseId, Date.now()],
  );
  return true;
}

export async function setCourseFavorite(userId: string, courseId: string, favorite: boolean): Promise<boolean> {
  const db = await getDb();
  if (!(await userOwnsCourse(userId, courseId))) return false;
  if (favorite) {
    await db.query(
      `INSERT INTO course_favorites (user_id, course_id, created_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, course_id) DO NOTHING`,
      [userId, courseId, Date.now()],
    );
  } else {
    await db.query('DELETE FROM course_favorites WHERE user_id = $1 AND course_id = $2', [userId, courseId]);
  }
  return true;
}

export async function listNotifications(userId: string, limit = 20): Promise<AppNotification[]> {
  const db = await getDb();
  const res = await db.query<{
    id: string;
    tone: NotificationTone;
    title: string;
    message: string;
    href: string;
    read_at: string | null;
    created_at: string;
  }>(
    `SELECT id, tone, title, message, href, read_at, created_at
       FROM notifications
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [userId, limit],
  );
  return res.rows.map((r) => ({
    id: r.id,
    tone: r.tone,
    title: r.title,
    message: r.message,
    href: r.href,
    readAt: r.read_at == null ? null : Number(r.read_at),
    createdAt: Number(r.created_at),
  }));
}

export async function createNotification(
  userId: string,
  input: { tone?: NotificationTone; title: string; message?: string; href?: string },
): Promise<AppNotification> {
  const db = await getDb();
  const id = randomUUID();
  const now = Date.now();
  const notification: AppNotification = {
    id,
    tone: input.tone ?? 'info',
    title: input.title.trim().slice(0, 120) || 'Update',
    message: (input.message ?? '').trim().slice(0, 300),
    href: (input.href ?? '').trim().slice(0, 240),
    readAt: null,
    createdAt: now,
  };
  await db.query(
    `INSERT INTO notifications (id, user_id, tone, title, message, href, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      notification.id,
      userId,
      notification.tone,
      notification.title,
      notification.message,
      notification.href,
      notification.createdAt,
    ],
  );
  return notification;
}

export async function markNotificationsRead(userId: string, id?: string): Promise<void> {
  const db = await getDb();
  if (id) {
    await db.query('UPDATE notifications SET read_at = $1 WHERE id = $2 AND user_id = $3', [Date.now(), id, userId]);
    return;
  }
  await db.query('UPDATE notifications SET read_at = $1 WHERE user_id = $2 AND read_at IS NULL', [Date.now(), userId]);
}

export async function getCourse(userId: string, id: string): Promise<EnrichedCourse | null> {
  const db = await getDb();
  const res = await db.query<{ data: string }>(
    'SELECT data FROM courses WHERE id = $1 AND user_id = $2',
    [id, userId],
  );
  const row = res.rows[0];
  return row ? (JSON.parse(row.data) as EnrichedCourse) : null;
}

/**
 * Replace a saved course with an edited version (used by the course chat).
 * Keeps the denormalised columns in step with the JSON so the dashboard list
 * doesn't show a stale title after a rename. Returns false when the course
 * isn't the user's.
 */
export async function updateCourse(userId: string, id: string, course: EnrichedCourse): Promise<boolean> {
  const db = await getDb();
  const res = await db.query(
    `UPDATE courses
        SET title = $1, subtitle = $2, level = $3, data = $4, lesson_count = $5
      WHERE id = $6 AND user_id = $7`,
    [course.title, course.subtitle, course.level, JSON.stringify(course), countLessons(course), id, userId],
  );
  return (res.affectedRows ?? 0) > 0;
}

/** Merge background-found lesson videos into an existing saved course. */
export async function mergeCourseVideos(
  userId: string,
  id: string,
  source: EnrichedCourse,
): Promise<boolean> {
  const db = await getDb();
  const res = await db.query<{ data: string }>(
    'SELECT data FROM courses WHERE id = $1 AND user_id = $2',
    [id, userId],
  );
  const row = res.rows[0];
  if (!row) return false;

  const current = JSON.parse(row.data) as EnrichedCourse;
  const changed = mergeVideos(current, source);
  if (!changed) return true;

  const update = await db.query('UPDATE courses SET data = $1 WHERE id = $2 AND user_id = $3', [
    JSON.stringify(current),
    id,
    userId,
  ]);
  return (update.affectedRows ?? 0) > 0;
}

export async function userOwnsCourse(userId: string, id: string): Promise<boolean> {
  const db = await getDb();
  const res = await db.query('SELECT 1 FROM courses WHERE id = $1 AND user_id = $2', [id, userId]);
  return res.rows.length > 0;
}

export async function getCompletedLessons(userId: string, courseId: string): Promise<string[]> {
  const db = await getDb();
  const res = await db.query<{ lesson_key: string }>(
    'SELECT lesson_key FROM course_progress WHERE user_id = $1 AND course_id = $2',
    [userId, courseId],
  );
  return res.rows.map((r) => r.lesson_key);
}

export async function setLessonCompleted(
  userId: string,
  courseId: string,
  lessonKey: string,
  completed: boolean,
): Promise<void> {
  const db = await getDb();
  if (completed) {
    await db.query(
      `INSERT INTO course_progress (user_id, course_id, lesson_key, updated_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, course_id, lesson_key) DO UPDATE SET updated_at = EXCLUDED.updated_at`,
      [userId, courseId, lessonKey, Date.now()],
    );
  } else {
    await db.query(
      'DELETE FROM course_progress WHERE user_id = $1 AND course_id = $2 AND lesson_key = $3',
      [userId, courseId, lessonKey],
    );
  }
}

export async function deleteCourse(userId: string, id: string): Promise<void> {
  const db = await getDb();
  await db.query('DELETE FROM courses WHERE id = $1 AND user_id = $2', [id, userId]);
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
