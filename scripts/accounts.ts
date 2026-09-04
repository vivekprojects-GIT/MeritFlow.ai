/** Who is in the database, and how ready each one is. Read-only. */
import { loadEnv } from './env';

loadEnv();

import { getDb } from '../src/lib/db';
import { readinessReport } from '../src/lib/autopilot/readiness-report';

async function main(): Promise<void> {
  const db = await getDb();
  const users = await db.query<{ id: string; email: string; name: string | null; created_at: number }>(
    'SELECT id, email, name, created_at FROM users ORDER BY created_at DESC',
  );

  for (const u of users.rows) {
    const report = await readinessReport(u.id);
    const runs = await db.query<{ n: number }>('SELECT count(*) AS n FROM autopilot_runs WHERE user_id = $1', [u.id]);
    process.stdout.write(
      `${u.email.padEnd(34)} ${report.status.padEnd(8)} runs=${Number(runs.rows[0]?.n ?? 0)}\n`,
    );
    if (report.status !== 'READY') {
      for (const f of report.blockedFields) process.stdout.write(`    blocked  ${f.field}: ${f.why}\n`);
      for (const f of report.unverifiedFacts) process.stdout.write(`    unverified  ${f.field}\n`);
      for (const a of report.blockedAuthorizations) process.stdout.write(`    no auth  ${a.type}\n`);
    }
  }
  process.exit(0);
}

void main().catch((e: unknown) => {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
