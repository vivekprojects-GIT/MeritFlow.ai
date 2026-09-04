import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';
import { getPolicy } from '../src/lib/autopilot/policy-engine';
import { getJobSettings } from '../src/lib/job-settings';
import { mayAutoSubmit, resolveExecutionPolicy } from '../src/lib/autopilot/execution-policy';

async function main(): Promise<void> {
  const db = await getDb();
  const u = await db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [process.argv[2].toLowerCase()]);
  const userId = u.rows[0].id;
  const policy = await getPolicy(userId);
  const settings = await getJobSettings(userId);

  process.stdout.write(`policy.mode        ${policy?.mode}\n`);
  process.stdout.write(`policy.neverAsk    ${policy?.neverAsk}\n`);
  process.stdout.write(`settings.autoSubmit ${settings.autoSubmit}\n`);
  process.stdout.write(`settings.reviewBefore ${settings.reviewBefore}\n`);
  process.stdout.write(`env AUTOPILOT_SUBMIT_ENABLED = ${process.env.AUTOPILOT_SUBMIT_ENABLED ?? '(unset)'}\n\n`);

  const runs = await db.query<{ company: string; state: string; receipt: string | null }>(
    `SELECT j.company, a.state, a.receipt FROM autopilot_runs a JOIN jobs j ON j.id = a.job_id
      WHERE a.user_id = $1 AND a.state = 'DRY_RUN_COMPLETE'`, [userId]);

  for (const r of runs.rows) {
    const rec = r.receipt ? JSON.parse(r.receipt) as { ats?: string } : null;
    const ex = resolveExecutionPolicy({ ats: (rec?.ats ?? 'unknown') as never, mechanism: 'browser' });
    process.stdout.write(`${r.company.padEnd(18)} ats=${String(rec?.ats ?? '?').padEnd(12)} execution=${ex.status.padEnd(12)} mayAutoSubmit=${mayAutoSubmit(ex)}\n`);
  }
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
