import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';
import { listJobs, getCandidateProfile } from '../src/lib/jobs-store';
import { getPolicy } from '../src/lib/autopilot/policy-engine';
import { getVault } from '../src/lib/autopilot/answer-vault';
import { listRuns } from '../src/lib/autopilot/state-machine';
import { traceJobDecision, summariseDecisions } from '../src/lib/autopilot/decision-trace';
import { authorisedCountry } from '../src/lib/autopilot/work-geography';

async function main(): Promise<void> {
  const db = await getDb();
  const u = await db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [process.argv[2].toLowerCase()]);
  const uid = u.rows[0].id;
  const filter = process.argv[3] ? new RegExp(process.argv.slice(3).join('|'), 'i') : null;

  const [jobs, policy, candidate, vault, runs] = await Promise.all([
    listJobs(3000), getPolicy(uid), getCandidateProfile(uid), getVault(uid), listRuns(uid, 500),
  ]);
  if (!policy || !candidate) throw new Error('no policy or profile');

  const handled = new Set(runs.filter((r) => !['DISCOVERED', 'FAILED', 'RETRYING'].includes(r.state)).map((r) => r.jobId));
  const y = Number(String(vault.get('EXPERIENCE.YEARS')?.value ?? '').match(/\d{1,2}/)?.[0]);
  const candidateYears = Number.isFinite(y) ? y : null;

  const decisions = jobs.map((job) =>
    traceJobDecision({
      job, candidate, policy, candidateYears,
      authorisedCountry: authorisedCountry(vault.get('WORK_AUTH.AUTHORIZED')?.value, vault.get('PROFILE.COUNTRY')?.value),
      alreadyHandled: handled.has(job.id),
    }),
  );

  if (filter) {
    for (const d of decisions.filter((x) => filter.test(x.company))) {
      process.stdout.write(`\n${d.company} — ${d.title.slice(0, 56)}  [${d.score}%]\n`);
      for (const s of d.steps) {
        process.stdout.write(`  ${s.passed ? 'PASS' : 'STOP'}  ${s.gate.padEnd(46)} ${s.reason}\n`);
      }
    }
    process.exit(0);
  }

  if (process.env.SHOW_QUEUE) {
    for (const d of decisions.filter((x) => x.reachedQueue)) {
      let host = '?';
      try { host = new URL(d.url).hostname.replace('www.', ''); } catch { host = d.url.slice(0, 30); }
      process.stdout.write(`  ${String(d.score).padStart(3)}%  ${d.company.slice(0,18).padEnd(20)} ${host.padEnd(28)} ${d.jobId}
`);
    }
    process.exit(0);
  }

  const sum = summariseDecisions(decisions);
  process.stdout.write(`${decisions.length} postings judged · ${sum.reachedQueue} reached the queue\n\n`);
  process.stdout.write('stopped at                                      count  example\n');
  for (const g of sum.byGate) {
    process.stdout.write(`  ${g.gate.slice(0, 44).padEnd(46)} ${String(g.rejected).padStart(5)}  ${g.example.slice(0, 70)}\n`);
  }
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
