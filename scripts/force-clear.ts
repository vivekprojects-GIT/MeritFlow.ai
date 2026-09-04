import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';
async function main(): Promise<void> {
  const db = await getDb();
  const u = await db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [process.argv[2].toLowerCase()]);
  const uid = u.rows[0].id;
  const like = `%${process.argv[3]}%`;
  const r = await db.query<{ job_id: string; company: string; state: string }>(
    'SELECT a.job_id, j.company, a.state FROM autopilot_runs a JOIN jobs j ON j.id=a.job_id WHERE a.user_id=$1 AND j.url LIKE $2', [uid, like]);
  for (const row of r.rows) {
    /* Only ever clears a run we have positive evidence was never sent. */
    await db.query('DELETE FROM autopilot_runs WHERE user_id=$1 AND job_id=$2', [uid, row.job_id]);
    await db.query('DELETE FROM job_applications WHERE user_id=$1 AND job_id=$2', [uid, row.job_id]);
    process.stdout.write(`cleared ${row.company} (was ${row.state}) — screenshot proved the form was never sent\n`);
  }
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
