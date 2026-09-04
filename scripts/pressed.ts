import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';
async function main(): Promise<void> {
  const db = await getDb();
  const u = await db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [process.argv[2].toLowerCase()]);
  const r = await db.query<{ company: string; title: string; state: string; blocked_reason: string | null }>(
    `SELECT j.company, j.title, a.state, a.blocked_reason FROM autopilot_runs a JOIN jobs j ON j.id = a.job_id
      WHERE a.user_id = $1 AND a.state IN ('SUBMITTED','SUBMISSION_UNCONFIRMED') ORDER BY a.updated_at DESC`, [u.rows[0].id]);
  for (const x of r.rows) {
    process.stdout.write(`${x.state === 'SUBMITTED' ? 'SENT     ' : 'UNCERTAIN'}  ${x.company.slice(0,20).padEnd(22)} ${x.title.slice(0,44)}\n`);
  }
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
