import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';
async function main(): Promise<void> {
  const db = await getDb();
  const u = await db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [process.argv[2].toLowerCase()]);
  const r = await db.query<{ job_id: string; company: string; title: string; state: string; blocked_reason: string | null; url: string }>(
    `SELECT a.job_id, j.company, j.title, a.state, a.blocked_reason, j.url FROM autopilot_runs a JOIN jobs j ON j.id=a.job_id
      WHERE a.user_id=$1 AND a.state IN ('SKIPPED','FAILED','FAILED_FINAL','NEEDS_USER_ACTION')`, [u.rows[0].id]);
  const fixable = r.rows.filter((x) => /could not type|refused to send|did not appear|no submit control|layout may have changed/i.test(x.blocked_reason ?? ''));
  process.stdout.write(`${fixable.length} run(s) blocked by problems since fixed:\n`);
  for (const x of fixable) process.stdout.write(`  ${x.job_id}  ${x.company.slice(0,18).padEnd(20)} ${x.title.slice(0,36)}\n     ${(x.blocked_reason??'').slice(0,80)}\n`);
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
