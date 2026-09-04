import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';
import { listJobs, getCandidateProfile, scoreJob } from '../src/lib/jobs-store';
import { getPolicy } from '../src/lib/autopilot/policy-engine';
import { judgeAge } from '../src/lib/autopilot/job-age';
import { listRuns } from '../src/lib/autopilot/state-machine';

async function main(): Promise<void> {
  const db = await getDb();
  const u = await db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [process.argv[2].toLowerCase()]);
  const [jobs, c, policy, runs] = await Promise.all([
    listJobs(4000), getCandidateProfile(u.rows[0].id), getPolicy(u.rows[0].id), listRuns(u.rows[0].id, 500),
  ]);
  if (!c || !policy) throw new Error('no profile');
  const handled = new Set(runs.map((r) => r.jobId));

  const scored = jobs
    .filter((j) => !handled.has(j.id))
    .map((j) => {
      const score = scoreJob(c, j).score;
      const ageH = Math.round((Date.now() - (j.postedAt || j.detectedAt || 0)) / 3_600_000);
      const age = judgeAge({ postedAt: j.postedAt, detectedAt: j.detectedAt, score, floor: policy.minScore }, Date.now());
      return { j, score, ageH, age };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 16);

  for (const x of scored) {
    let host = '?'; try { host = new URL(x.j.url).hostname.replace('www.',''); } catch { /* keep */ }
    process.stdout.write(`${String(x.score).padStart(3)}%  ${String(x.ageH).padStart(5)}h  ${x.age.applies ? 'PASS' : 'stop'}  ${x.j.company.slice(0,16).padEnd(18)} ${host.slice(0,26).padEnd(28)} ${x.j.title.slice(0,34)}\n`);
  }
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
