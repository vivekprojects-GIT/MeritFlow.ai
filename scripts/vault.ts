import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';
async function main(): Promise<void> {
  const db = await getDb();
  const u = await db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [process.argv[2].toLowerCase()]);
  const r = await db.query<{ intent: string; value: string }>(
    'SELECT intent, value FROM answer_vault WHERE user_id = $1 ORDER BY intent', [u.rows[0].id]);
  for (const row of r.rows) process.stdout.write(`  ${String(row.intent).padEnd(32)} ${String(row.value).slice(0, 46)}\n`);
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
