import { getDb } from '../db';
import { isPro } from '../billing-store';

/**
 * The free plan's monthly application allowance.
 *
 * Counted per calendar month keyed by `YYYY-MM`, so the period rolls over on
 * its own. A scheduled reset job would be one more thing to run, and one more
 * thing that can fail quietly and hand somebody a free month.
 */

export const FREE_APPLICATIONS_PER_MONTH = 25;

export type Usage = {
  used: number;
  limit: number | null;
  remaining: number | null;
  /** True when the allowance is spent. Always false on Pro. */
  exhausted: boolean;
  isPro: boolean;
  period: string;
};

function period(now = Date.now()): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export async function getUsage(userId: string, kind = 'application'): Promise<Usage> {
  const db = await getDb();
  const pro = await isPro(userId);

  const res = await db.query<{ count: string }>(
    'SELECT count::text AS count FROM usage_counters WHERE user_id = $1 AND period = $2 AND kind = $3',
    [userId, period(), kind],
  );
  const used = Number(res.rows[0]?.count ?? 0);

  /* Pro has no ceiling, so `limit` and `remaining` are null rather than a
     large number — a number invites a progress bar that means nothing. */
  if (pro) return { used, limit: null, remaining: null, exhausted: false, isPro: true, period: period() };

  return {
    used,
    limit: FREE_APPLICATIONS_PER_MONTH,
    remaining: Math.max(0, FREE_APPLICATIONS_PER_MONTH - used),
    exhausted: used >= FREE_APPLICATIONS_PER_MONTH,
    isPro: false,
    period: period(),
  };
}

/**
 * Record one use, returning the state after it.
 *
 * Incremented in a single upsert rather than read-then-write: two applications
 * finishing at once would otherwise both read the same count and both write
 * the same successor, losing one.
 */
export async function recordUsage(userId: string, kind = 'application'): Promise<Usage> {
  const db = await getDb();
  await db.query(
    `INSERT INTO usage_counters (user_id, period, kind, count) VALUES ($1,$2,$3,1)
     ON CONFLICT (user_id, period, kind) DO UPDATE SET count = usage_counters.count + 1`,
    [userId, period(), kind],
  );
  return getUsage(userId, kind);
}
