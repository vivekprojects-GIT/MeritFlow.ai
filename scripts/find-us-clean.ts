import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';
import { listJobs, getCandidateProfile, scoreJob } from '../src/lib/jobs-store';
import { listRuns } from '../src/lib/autopilot/state-machine';
import { judgeRoleFit } from '../src/lib/autopilot/role-fit';
import { countryOf } from '../src/lib/autopilot/work-geography';

async function main(): Promise<void> {
  const db = await getDb();
  const u = await db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [process.argv[2].toLowerCase()]);
  const [jobs, c, runs] = await Promise.all([listJobs(4000), getCandidateProfile(u.rows[0].id), listRuns(u.rows[0].id, 800)]);
  if (!c) throw new Error('no profile');
  const handled = new Set(runs.map((r) => r.jobId));
  const rows = jobs
    .filter((j) => !handled.has(j.id))
    .filter((j) => /jobs\.lever\.co|jobs\.ashbyhq/.test(j.url))
    .filter((j) => { const co = countryOf(j.location); return co === null || co === 'United States'; })
    .filter((j) => judgeRoleFit({ title: j.title, targetRoles: c.targetRoles }).applies)
    .map((j) => ({ j, score: scoreJob(c, j).score }))
    .filter((x) => x.score >= 62)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
  for (const x of rows) process.stdout.write(`${String(x.score).padStart(3)}%  ${x.j.id}  ${x.j.company.slice(0,16).padEnd(18)} loc="${x.j.location.slice(0,18)}"  ${x.j.title.slice(0,34)}\n`);
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
