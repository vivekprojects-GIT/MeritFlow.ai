import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';
import { savePolicy, getPolicy } from '../src/lib/autopilot/policy-engine';
async function main(): Promise<void> {
  const db = await getDb();
  const u = await db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [process.argv[2].toLowerCase()]);
  await savePolicy(u.rows[0].id, { neverAsk: process.argv[3] !== 'off' });
  const p = await getPolicy(u.rows[0].id);
  process.stdout.write(`neverAsk ${p?.neverAsk} · mode ${p?.mode} · minScore ${p?.minScore} · minComp ${p?.minComp}\n`);
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
