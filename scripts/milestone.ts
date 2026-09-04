/**
 * One autonomous application, end to end, with the full trace.
 *
 * The job is chosen by the engine, not named on the command line — that is what
 * makes this the milestone rather than a demonstration. Bounded to one, because
 * the first real submission should be one.
 */
import { loadEnv } from './env';

loadEnv();

import { getDb } from '../src/lib/db';
import { runAutopilot } from '../src/lib/autopilot/runner';
import { readinessReport } from '../src/lib/autopilot/readiness-report';
import { auditForRun } from '../src/lib/autopilot/audit';

async function main(): Promise<void> {
  const db = await getDb();
  const u = await db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [
    (process.argv[2] ?? '').toLowerCase(),
  ]);
  const userId = u.rows[0]?.id;
  if (!userId) throw new Error('no such account');

  const report = await readinessReport(userId);
  process.stdout.write(`readiness: ${report.status}\n`);
  if (report.status !== 'READY') {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exit(2);
  }

  process.stdout.write('\nrunning…\n\n');
  const limit = Number(process.argv[3] ?? 1);
  const outcome = await runAutopilot(userId, { limit });

  process.stdout.write(
    `attempted ${outcome.attempted} · submitted ${outcome.submitted} · prepared ${outcome.prepared} · ` +
      `awaiting ${outcome.awaitingApproval} · needsUser ${outcome.needsUser} · failed ${outcome.failed} · skipped ${outcome.skipped}\n`,
  );
  if (outcome.stoppedBecause) process.stdout.write(`stopped: ${outcome.stoppedBecause}\n`);

  for (const r of outcome.results) {
    process.stdout.write(`\n${r.company} — ${r.title}\n  state: ${r.state}\n  ${r.reason}\n`);
  }

  const runs = await db.query<{ id: string; job_id: string; state: string; blocked_reason: string }>(
    'SELECT id, job_id, state, blocked_reason FROM autopilot_runs WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1',
    [userId],
  );
  const run = runs.rows[0];
  if (run) {
    const rows = await auditForRun(userId, String(run.id));
    if (rows.length > 0) {
      process.stdout.write(`\naudit trail (${rows.length} fields):\n`);
      for (const a of rows) {
        process.stdout.write(
          `  ${a.field.padEnd(28)} ${String(a.answer).slice(0, 40).padEnd(42)} ${a.source.padEnd(10)} conf ${a.confidence}  ${a.submitted ? 'SENT' : 'prepared'}\n`,
        );
      }
    }
  }
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(`${e instanceof Error ? (e.stack ?? e.message) : String(e)}\n`); process.exit(1); });
