/** Raise or lower the fit floor for one candidate. */
import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';
import { savePolicy, getPolicy } from '../src/lib/autopilot/policy-engine';

async function main(): Promise<void> {
  const db = await getDb();
  const u = await db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [
    (process.argv[2] ?? '').toLowerCase(),
  ]);
  const userId = u.rows[0]?.id;
  if (!userId) throw new Error('no such account');

  const min = Number(process.argv[3]);
  if (!Number.isFinite(min)) throw new Error('give a number');

  const comp = Number(process.argv[4]);
  await savePolicy(userId, Number.isFinite(comp) ? { minScore: min, minComp: comp } : { minScore: min });
  const p = await getPolicy(userId);
  process.stdout.write(`minScore now ${p?.minScore}, mode ${p?.mode}, minComp ${p?.minComp}\n`);
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
