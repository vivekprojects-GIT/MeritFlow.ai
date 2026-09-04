import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';
async function main(): Promise<void> {
  const db = await getDb();
  const u = await db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [process.argv[2].toLowerCase()]);
  const uid = u.rows[0].id;
  /* The OpenAI run never had a form in front of it at submit time — the
     "submit" was pressed on an overview page with zero inputs, so nothing can
     have reached the employer. Safe to clear for one clean retry. */
  const r = await db.query<{ job_id: string }>(
    "SELECT job_id FROM autopilot_runs WHERE user_id=$1 AND job_id=$2 AND state IN ('SUBMISSION_UNCONFIRMED','SUBMITTING')", [uid, process.argv[3]]);
  if (!r.rows[0]) { process.stdout.write('nothing to clear\n'); process.exit(0); }
  await db.query('DELETE FROM autopilot_runs WHERE user_id=$1 AND job_id=$2', [uid, process.argv[3]]);
  await db.query('DELETE FROM job_applications WHERE user_id=$1 AND job_id=$2', [uid, process.argv[3]]);
  process.stdout.write('cleared for retry\n');
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
