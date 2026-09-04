import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';
import { listJobs } from '../src/lib/jobs-store';
import { runAutopilot } from '../src/lib/autopilot/runner';

async function main(): Promise<void> {
  const db = await getDb();
  const u = await db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [process.argv[2].toLowerCase()]);
  const uid = u.rows[0].id;
  const pattern = new RegExp(process.argv.slice(3).join('|'), 'i');

  const jobs = (await listJobs(3000)).filter((j) => pattern.test(j.company) && /greenhouse|lever|ashbyhq/.test(j.url));
  if (jobs.length === 0) { process.stdout.write('no matching direct-board jobs\n'); process.exit(0); }

  for (const j of jobs) process.stdout.write(`  will try: ${j.company} — ${j.title.slice(0, 50)}\n`);
  process.stdout.write('\nrunning…\n\n');

  const out = await runAutopilot(uid, { jobIds: jobs.map((j) => j.id), limit: jobs.length });
  process.stdout.write(`attempted ${out.attempted} · submitted ${out.submitted} · skipped ${out.skipped}\n`);
  process.stdout.write(`stopped: ${out.stoppedBecause}\n\n`);
  for (const r of out.results) {
    process.stdout.write(`${r.company} — ${r.title}\n  state: ${r.state}\n  ${r.reason}\n\n`);
  }
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
