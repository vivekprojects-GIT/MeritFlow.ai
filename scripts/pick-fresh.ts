import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';
import { listJobs, getCandidateProfile, scoreJob } from '../src/lib/jobs-store';
import { listRuns } from '../src/lib/autopilot/state-machine';
import { judgeRoleFit } from '../src/lib/autopilot/role-fit';

async function main(): Promise<void> {
  const db = await getDb();
  const u = await db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [process.argv[2].toLowerCase()]);
  const uid = u.rows[0].id;
  const [jobs, candidate, runs] = await Promise.all([listJobs(3000), getCandidateProfile(uid), listRuns(uid, 500)]);
  if (!candidate) throw new Error('no profile');
  const handled = new Set(runs.map((r) => r.jobId));

  const picks = jobs
    .filter((j) => !handled.has(j.id))
    .filter((j) => /greenhouse|lever\.co|ashbyhq/.test(j.url))
    .filter((j) => judgeRoleFit({ title: j.title, targetRoles: candidate.targetRoles }).applies)
    .map((j) => ({ j, score: scoreJob(candidate, j).score, ageH: Math.round((Date.now() - (j.postedAt || j.detectedAt || 0)) / 3_600_000) }))
    .filter((x) => x.score >= 65)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  for (const p of picks) {
    process.stdout.write(`${String(p.score).padStart(3)}%  ${String(p.ageH).padStart(4)}h  ${p.j.company.slice(0,18).padEnd(20)} ${p.j.title.slice(0,42)}\n       ${p.j.url}\n`);
  }
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
