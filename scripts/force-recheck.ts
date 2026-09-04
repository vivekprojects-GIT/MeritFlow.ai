import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';
async function main(): Promise<void> {
  const db = await getDb();
  const u = await db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [process.argv[2].toLowerCase()]);
  const uid = u.rows[0].id;
  const rows = await db.query<{ job_id: string; receipt: string }>(
    "SELECT job_id, receipt FROM autopilot_runs WHERE user_id = $1 AND state = 'SUBMISSION_UNCONFIRMED'", [uid]);
  for (const r of rows.rows) {
    const rec = JSON.parse(r.receipt) as Record<string, unknown>;
    if (rec.mode === 'SUBMITTED') {
      rec.mode = 'UNCONFIRMED';
      await db.query('UPDATE autopilot_runs SET receipt = $1 WHERE user_id = $2 AND job_id = $3', [JSON.stringify(rec), uid, r.job_id]);
    }
    await db.query("UPDATE job_applications SET state = 'NEEDS_USER_INPUT', updated_at = $1 WHERE user_id = $2 AND job_id = $3 AND state = 'APPLIED'", [Date.now(), uid, r.job_id]);
  }
  process.stdout.write(`corrected ${rows.rows.length} record(s)\n`);
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
