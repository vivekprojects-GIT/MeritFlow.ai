import { getDb } from './db';

/** Free accounts get this many AI-tutor messages per day; Pro is unlimited. */
export const FREE_TUTOR_DAILY = 5;

function today(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

/** How many tutor messages the user has sent today. */
export async function getTutorUsageToday(userId: string): Promise<number> {
  const db = await getDb();
  const res = await db.query<{ count: number }>(
    'SELECT count FROM tutor_usage WHERE user_id = $1 AND day = $2',
    [userId, today()],
  );
  return res.rows[0] ? Number(res.rows[0].count) : 0;
}

/** Record one tutor message for today and return the new running count. */
export async function incrementTutorUsage(userId: string): Promise<number> {
  const db = await getDb();
  const res = await db.query<{ count: number }>(
    `INSERT INTO tutor_usage (user_id, day, count) VALUES ($1, $2, 1)
     ON CONFLICT (user_id, day) DO UPDATE SET count = tutor_usage.count + 1
     RETURNING count`,
    [userId, today()],
  );
  return Number(res.rows[0].count);
}
