import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';
async function main(): Promise<void> {
  const db = await getDb();
  const r = await db.query<Record<string, unknown>>(
    `SELECT r.id, r.state, r.blocked_reason, r.attempts, j.company, j.title, j.url
       FROM autopilot_runs r JOIN jobs j ON j.id = r.job_id
      WHERE j.company LIKE $1 ORDER BY r.updated_at DESC LIMIT 3`, ['%GitLab%']);
  for (const row of r.rows) {
    process.stdout.write(`${row.company} — ${row.title}\n  state: ${row.state}\n  reason: ${row.blocked_reason}\n  url: ${row.url}\n  run: ${row.id}\n\n`);
  }
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
