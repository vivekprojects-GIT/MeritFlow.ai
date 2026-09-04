/** Has anything ever actually been sent to an employer? Read-only. */
import { loadEnv } from './env';

loadEnv();

import { getDb } from '../src/lib/db';

async function main(): Promise<void> {
  const db = await getDb();
  const runs = await db.query<{ state: string; n: number }>(
    'SELECT state, count(*) AS n FROM autopilot_runs GROUP BY state ORDER BY count(*) DESC',
  );
  process.stdout.write(`autopilot_runs by state: ${runs.rows.length === 0 ? '(none)' : ''}\n`);
  for (const r of runs.rows) process.stdout.write(`  ${String(r.state).padEnd(22)} ${Number(r.n)}\n`);

  const audit = await db.query<{ n: number }>('SELECT count(*) AS n FROM application_audit WHERE submitted = 1');
  process.stdout.write(`\nfields ever submitted to an employer: ${Number(audit.rows[0]?.n ?? 0)}\n`);

  for (const t of ['job_applications', 'application_archive']) {
    try {
      const r = await db.query<{ n: number }>(`SELECT count(*) AS n FROM ${t}`);
      process.stdout.write(`${t}: ${Number(r.rows[0]?.n ?? 0)}\n`);
    } catch {
      process.stdout.write(`${t}: (no such table)\n`);
    }
  }
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
