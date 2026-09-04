import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';
async function main(): Promise<void> {
  const db = await getDb();
  const u = await db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [process.argv[2].toLowerCase()]);
  const uid = u.rows[0].id;

  const states = await db.query<{ state: string; n: number }>(
    'SELECT state, COUNT(*) as n FROM autopilot_runs WHERE user_id = $1 GROUP BY state ORDER BY n DESC', [uid]);
  process.stdout.write('run states:\n');
  for (const r of states.rows) process.stdout.write(`  ${String(r.state).padEnd(22)} ${r.n}\n`);

  const sub = await db.query<{ n: number }>("SELECT COUNT(*) as n FROM autopilot_runs WHERE user_id = $1 AND state = 'SUBMITTED'", [uid]);
  process.stdout.write(`\nruns in SUBMITTED: ${sub.rows[0].n}\n`);

  const receipts = await db.query<{ company: string; receipt: string }>(
    "SELECT j.company, a.receipt FROM autopilot_runs a JOIN jobs j ON j.id=a.job_id WHERE a.user_id=$1 AND a.receipt IS NOT NULL", [uid]);
  let sentMode = 0;
  for (const r of receipts.rows) {
    const m = JSON.parse(r.receipt) as { mode?: string };
    if (m.mode === 'SUBMITTED') { sentMode += 1; process.stdout.write(`  receipt says SUBMITTED: ${r.company}\n`); }
  }
  process.stdout.write(`receipts with mode=SUBMITTED: ${sentMode}\n`);

  const apps = await db.query<{ state: string; n: number }>(
    'SELECT state, COUNT(*) as n FROM job_applications WHERE user_id = $1 GROUP BY state ORDER BY n DESC', [uid]);
  process.stdout.write('\ntracker states:\n');
  for (const r of apps.rows) process.stdout.write(`  ${String(r.state).padEnd(22)} ${r.n}\n`);
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
