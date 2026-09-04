import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';
import { listJobs, getCandidateProfile, scoreJob } from '../src/lib/jobs-store';
import { listRuns } from '../src/lib/autopilot/state-machine';
import { judgeRoleFit } from '../src/lib/autopilot/role-fit';

async function main(): Promise<void> {
  const db = await getDb();
  const u = await db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [process.argv[2].toLowerCase()]);
  const [jobs, c, runs] = await Promise.all([listJobs(4000), getCandidateProfile(u.rows[0].id), listRuns(u.rows[0].id, 500)]);
  if (!c) throw new Error('no profile');
  const handled = new Set(runs.map((r) => r.jobId));
  const maxH = Number(process.argv[3] ?? 168);

  const rows = jobs
    .filter((j) => !handled.has(j.id))
    .filter((j) => /job-boards\.greenhouse|boards\.greenhouse|jobs\.lever\.co|jobs\.ashbyhq/.test(j.url))
    .filter((j) => judgeRoleFit({ title: j.title, targetRoles: c.targetRoles }).applies)
    .map((j) => ({ j, score: scoreJob(c, j).score, ageH: Math.round((Date.now() - (j.postedAt || j.detectedAt || 0)) / 3_600_000) }))
    .filter((x) => x.ageH <= maxH)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);

  process.stdout.write(`direct-board AI/ML jobs under ${maxH}h, never run: ${rows.length}\n\n`);
  for (const x of rows) process.stdout.write(`${String(x.score).padStart(3)}%  ${String(x.ageH).padStart(4)}h  ${x.j.company.slice(0,18).padEnd(20)} ${x.j.title.slice(0,40)}\n       ${x.j.url}\n`);
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
