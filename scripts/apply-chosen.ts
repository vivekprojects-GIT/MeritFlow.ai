import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';
import { listJobs } from '../src/lib/jobs-store';
import { runDryRun } from '../src/lib/autopilot/workflow';

/** Apply to one posting the candidate named. Selection filters off; safety gates on. */
async function main(): Promise<void> {
  const db = await getDb();
  const u = await db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [process.argv[2].toLowerCase()]);
  const job = (await listJobs(4000)).find((j) => j.id === process.argv[3]);
  if (!job) throw new Error('job not found');
  process.stdout.write(`${job.company} — ${job.title}\n`);
  const out = await runDryRun(u.rows[0].id, job, { chosenByCandidate: true });
  process.stdout.write(`${out.finalState}\n${out.reason}\n`);
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
