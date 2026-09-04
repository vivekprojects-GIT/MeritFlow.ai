import { getDb } from './db';

const MS_DAY = 86_400_000;
export type Plan = 'pro_monthly' | 'pro_yearly';

export type BillingState = {
  isPro: boolean;
  plan: string | null;
  status: string | null;
  currentPeriodEnd: number | null;
  purchases: string[];
};

export async function getBillingState(userId: string): Promise<BillingState> {
  const db = await getDb();
  const sub = await db.query<{ plan: string; status: string; current_period_end: string }>(
    'SELECT plan, status, current_period_end FROM subscriptions WHERE user_id = $1',
    [userId],
  );
  const pur = await db.query<{ item_id: string }>('SELECT item_id FROM purchases WHERE user_id = $1', [userId]);
  const row = sub.rows[0];
  const end = row ? Number(row.current_period_end) : null;
  const isPro = !!row && row.status === 'active' && (end ?? 0) > Date.now();
  return {
    isPro,
    plan: row?.plan ?? null,
    status: row?.status ?? null,
    currentPeriodEnd: end,
    purchases: pur.rows.map((r) => r.item_id),
  };
}

export async function isPro(userId: string): Promise<boolean> {
  return (await getBillingState(userId)).isPro;
}

export async function activateSubscription(userId: string, plan: Plan): Promise<void> {
  const db = await getDb();
  const end = Date.now() + (plan === 'pro_yearly' ? 365 : 30) * MS_DAY;
  await db.query(
    `INSERT INTO subscriptions (user_id, plan, status, current_period_end, created_at)
     VALUES ($1, $2, 'active', $3, $4)
     ON CONFLICT (user_id) DO UPDATE SET plan = EXCLUDED.plan, status = 'active', current_period_end = EXCLUDED.current_period_end`,
    [userId, plan, end, Date.now()],
  );
}

export async function cancelSubscription(userId: string): Promise<void> {
  const db = await getDb();
  await db.query("UPDATE subscriptions SET status = 'canceled' WHERE user_id = $1", [userId]);
}

export async function purchaseItem(userId: string, itemId: string): Promise<void> {
  const db = await getDb();
  await db.query(
    `INSERT INTO purchases (user_id, item_id, created_at) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, item_id) DO NOTHING`,
    [userId, itemId, Date.now()],
  );
}
