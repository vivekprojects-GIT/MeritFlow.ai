import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';
async function main(): Promise<void> {
  const db = await getDb();
  const u = await db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [process.argv[2].toLowerCase()]);
  const r = await db.query("DELETE FROM autopilot_runs WHERE user_id = $1 AND state <> 'SUBMITTED'", [u.rows[0].id]);
  process.stdout.write(`cleared ${r.affectedRows ?? 0} unsent runs\n`);
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
