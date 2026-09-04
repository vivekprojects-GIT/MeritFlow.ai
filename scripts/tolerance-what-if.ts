import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';
import { listJobs, getCandidateProfile, scoreJob } from '../src/lib/jobs-store';
import { getPolicy } from '../src/lib/autopilot/policy-engine';
import { judgeAge } from '../src/lib/autopilot/job-age';
import { judgeExperience } from '../src/lib/autopilot/experience-fit';
import { judgeRoleFit } from '../src/lib/autopilot/role-fit';
import { listRuns } from '../src/lib/autopilot/state-machine';

async function main(): Promise<void> {
  const db = await getDb();
  const u = await db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [process.argv[2].toLowerCase()]);
  const [jobs, c, policy, runs] = await Promise.all([
    listJobs(4000), getCandidateProfile(u.rows[0].id), getPolicy(u.rows[0].id), listRuns(u.rows[0].id, 500),
  ]);
  if (!c || !policy) throw new Error('no profile');
  const handled = new Set(runs.map((r) => r.jobId));

  for (const tol of [1, 2, 3]) {
    let queue = 0, direct = 0;
    for (const j of jobs) {
      if (handled.has(j.id)) continue;
      const score = scoreJob(c, j).score;
      if (!judgeAge({ postedAt: j.postedAt, detectedAt: j.detectedAt, score, floor: policy.minScore }, Date.now()).applies) continue;
      if (!judgeRoleFit({ title: j.title, targetRoles: c.targetRoles }).applies) continue;
      if (!judgeExperience({ title: j.title, description: j.description, candidateYears: 3 }, tol).applies) continue;
      queue += 1;
      if (/job-boards\.greenhouse|boards\.greenhouse|jobs\.lever\.co|jobs\.ashbyhq/.test(j.url)) direct += 1;
    }
    process.stdout.write(`tolerance ${tol} year${tol === 1 ? '' : 's'}:  queue ${String(queue).padStart(3)}   of which on a direct board: ${direct}\n`);
  }
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
