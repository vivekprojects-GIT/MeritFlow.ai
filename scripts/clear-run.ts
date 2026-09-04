import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';
/** Remove a run whose form explicitly refused to send, so it can be retried. */
async function main(): Promise<void> {
  const db = await getDb();
  const u = await db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [process.argv[2].toLowerCase()]);
  const pattern = process.argv[3];
  const rows = await db.query<{ job_id: string; company: string; state: string; blocked_reason: string | null }>(
    `SELECT a.job_id, j.company, a.state, a.blocked_reason FROM autopilot_runs a JOIN jobs j ON j.id = a.job_id
      WHERE a.user_id = $1 AND j.url LIKE $2`, [u.rows[0].id, `%${pattern}%`]);
  for (const r of rows.rows) {
    /* Only ever clears a run the form itself refused — never one that may have
       reached an employer. */
    /* DRY_RUN_COMPLETE means prepared and deliberately not sent, so it is as
       safe to clear as a form that refused. Anything else stays. */
    if (!/refused to send/i.test(r.blocked_reason ?? '') && r.state !== 'DRY_RUN_COMPLETE' && r.state !== 'FAILED_FINAL' && !/^Skipped:/.test(r.blocked_reason ?? '')) {
      process.stdout.write(`  keeping ${r.company} (${r.state}) — cannot prove nothing was sent\n`);
      continue;
    }
    await db.query('DELETE FROM autopilot_runs WHERE user_id = $1 AND job_id = $2', [u.rows[0].id, r.job_id]);
    await db.query('DELETE FROM job_applications WHERE user_id = $1 AND job_id = $2', [u.rows[0].id, r.job_id]);
    process.stdout.write(`  cleared ${r.company} — the form refused it, nothing was sent\n`);
  }
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
