import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';
import { listJobs } from '../src/lib/jobs-store';

import { resolveExecutionPolicy, mayAutoSubmit, detectAts } from '../src/lib/autopilot/execution-policy';

async function main(): Promise<void> {
  const db = await getDb();
  const jobs = await listJobs(3000);
  process.stdout.write(`corpus: ${jobs.length} open jobs\n\n`);

  const byAts = new Map<string, { n: number; submittable: number }>();
  for (const j of jobs) {
    const { ats, employerDomain } = detectAts(j.url);
    const mech = ats === 'greenhouse' ? 'api' : 'browser';
    const ex = resolveExecutionPolicy({ ats, employerDomain, mechanism: mech });
    const cur = byAts.get(ats) ?? { n: 0, submittable: 0 };
    cur.n += 1;
    if (mayAutoSubmit(ex)) cur.submittable += 1;
    byAts.set(ats, cur);
  }

  process.stdout.write('destination            jobs   can auto-submit\n');
  for (const [ats, v] of [...byAts.entries()].sort((a, b) => b[1].n - a[1].n)) {
    process.stdout.write(`  ${ats.padEnd(20)} ${String(v.n).padStart(5)}   ${v.submittable}\n`);
  }
  const total = [...byAts.values()].reduce((a, b) => a + b.submittable, 0);
  process.stdout.write(`\ntotal reachable for auto-submit: ${total} of ${jobs.length}\n`);
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
