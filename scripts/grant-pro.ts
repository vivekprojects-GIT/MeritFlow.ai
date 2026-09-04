/**
 * Give an account a Pro subscription locally, or take it away.
 *
 * ## Why this exists
 *
 * Course generation is gated on Pro, so a developer working on anything
 * downstream of generation — the goals page, the skill file, the learning
 * record — cannot exercise their own feature without a subscription. Paying
 * for one to test a code path is not a reasonable requirement.
 *
 * It goes through `activateSubscription` rather than writing the row itself,
 * so the entitlement it produces is exactly the one the checkout produces. A
 * script that invents its own row would eventually drift from the real one and
 * start hiding billing bugs instead of working around them.
 *
 * ## This writes real billing state
 *
 * The row is indistinguishable from a paid subscription to every part of the
 * app that reads it. It is a development aid for a local database, and the
 * revoke path exists so the account can be put back.
 *
 * Usage:
 *   npx tsx scripts/grant-pro.ts <email> [--yearly] [--revoke]
 */
import { activateSubscription, cancelSubscription, getBillingState } from '../src/lib/billing-store';
import { getDb } from '../src/lib/db';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const email = args.find((a) => !a.startsWith('--'));
  const revoke = args.includes('--revoke');
  const plan = args.includes('--yearly') ? 'pro_yearly' : 'pro_monthly';

  if (!email) {
    console.error('usage: grant-pro.ts <email> [--yearly] [--revoke]');
    process.exit(1);
  }

  const db = await getDb();
  const res = await db.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [email]);
  const userId = res.rows[0]?.id;
  if (!userId) {
    console.error(`No account for ${email}.`);
    process.exit(1);
  }

  if (revoke) {
    await cancelSubscription(userId);
    console.log(`Canceled the subscription on ${email}.`);
    return;
  }

  await activateSubscription(userId, plan);
  const state = await getBillingState(userId);
  console.log(
    `${email} is now ${state.isPro ? 'Pro' : 'NOT Pro'} on ${state.plan}, ` +
      `until ${new Date(state.currentPeriodEnd ?? 0).toISOString().slice(0, 10)}.`,
  );
}

void main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
