import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';
async function main(): Promise<void> {
  const db = await getDb();
  const u = await db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [process.argv[2].toLowerCase()]);
  const uid = u.rows[0].id;
  const r = await db.query<{ job_id: string; state: string; blocked_reason: string | null }>(
    'SELECT job_id, state, blocked_reason FROM autopilot_runs WHERE user_id=$1 AND job_id=$2', [uid, process.argv[3]]);
  const row = r.rows[0];
  if (!row) { process.stdout.write('no run\n'); process.exit(0); }
  if (row.state !== 'SKIPPED' || !/^Skipped:|more steps than/.test(row.blocked_reason ?? '')) {
    process.stdout.write(`refusing: state=${row.state} — cannot prove nothing was sent\n`); process.exit(0);
  }
  await db.query('DELETE FROM autopilot_runs WHERE user_id=$1 AND job_id=$2', [uid, process.argv[3]]);
  await db.query('DELETE FROM job_applications WHERE user_id=$1 AND job_id=$2', [uid, process.argv[3]]);
  process.stdout.write('cleared (was a pre-browser skip; nothing was sent)\n');
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
