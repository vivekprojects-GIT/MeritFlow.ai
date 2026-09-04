import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';
import { listJobs, getCandidateProfile, scoreJob } from '../src/lib/jobs-store';
import { listRuns } from '../src/lib/autopilot/state-machine';
import { judgeRoleFit } from '../src/lib/autopilot/role-fit';
import { judgeGeography, authorisedCountry } from '../src/lib/autopilot/work-geography';
import { getVault } from '../src/lib/autopilot/answer-vault';

async function main(): Promise<void> {
  const db = await getDb();
  const u = await db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [process.argv[2].toLowerCase()]);
  const [jobs, c, runs, vault] = await Promise.all([
    listJobs(4000), getCandidateProfile(u.rows[0].id), listRuns(u.rows[0].id, 600), getVault(u.rows[0].id),
  ]);
  if (!c) throw new Error('no profile');
  const handled = new Set(runs.map((r) => r.jobId));
  const auth = authorisedCountry(vault.get('WORK_AUTH.AUTHORIZED')?.value, vault.get('PROFILE.COUNTRY')?.value);

  const rows = jobs
    .filter((j) => !handled.has(j.id))
    .filter((j) => /jobs\.lever\.co|jobs\.ashbyhq/.test(j.url))
    .filter((j) => judgeRoleFit({ title: j.title, targetRoles: c.targetRoles }).applies)
    .filter((j) => judgeGeography({ location: j.location, authorised: auth }).applies)
    .map((j) => ({ j, score: scoreJob(c, j).score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  for (const x of rows) process.stdout.write(`${String(x.score).padStart(3)}%  ${x.j.id}  ${x.j.company.slice(0,20).padEnd(22)} ${x.j.title.slice(0,40)}\n`);
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
