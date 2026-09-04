import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';
import { listJobs, getCandidateProfile, scoreJob } from '../src/lib/jobs-store';
import { getPolicy } from '../src/lib/autopilot/policy-engine';
import { judgeRoleFit } from '../src/lib/autopilot/role-fit';
import { judgeExperience } from '../src/lib/autopilot/experience-fit';
import { listRuns } from '../src/lib/autopilot/state-machine';

/** How many postings qualify if the age bands never demand more than `cap`. */
async function main(): Promise<void> {
  const db = await getDb();
  const u = await db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [process.argv[2].toLowerCase()]);
  const [jobs, c, policy, runs] = await Promise.all([
    listJobs(4000), getCandidateProfile(u.rows[0].id), getPolicy(u.rows[0].id), listRuns(u.rows[0].id, 500),
  ]);
  if (!c || !policy) throw new Error('no profile');
  const handled = new Set(runs.map((r) => r.jobId));
  const H = 3_600_000;

  for (const cap of [70, 75, 80, 88]) {
    let total = 0, direct = 0;
    for (const j of jobs) {
      if (handled.has(j.id)) continue;
      const score = scoreJob(c, j).score;
      const ageH = (Date.now() - (j.postedAt || j.detectedAt || 0)) / H;
      /* Same shape as the real bands, but the requirement never exceeds `cap`. */
      const band = ageH <= 72 ? 70 : ageH <= 168 ? 75 : ageH <= 336 ? 80 : 88;
      const need = Math.max(policy.minScore, Math.min(band, cap));
      if (score < need) continue;
      if (ageH > 720) continue;
      if (!judgeRoleFit({ title: j.title, targetRoles: c.targetRoles }).applies) continue;
      if (!judgeExperience({ title: j.title, description: j.description, candidateYears: 3 }).applies) continue;
      total += 1;
      if (/lever\.co|ashbyhq/.test(j.url)) direct += 1;
    }
    process.stdout.write(`bar capped at ${cap}%:  ${String(total).padStart(3)} qualify   on CAPTCHA-free boards (Lever/Ashby): ${direct}\n`);
  }
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
