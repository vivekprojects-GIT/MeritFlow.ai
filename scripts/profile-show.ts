import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';
import { getCandidateProfile, scoreJob, listJobs } from '../src/lib/jobs-store';
async function main(): Promise<void> {
  const db = await getDb();
  const u = await db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [process.argv[2].toLowerCase()]);
  const c = await getCandidateProfile(u.rows[0].id);
  if (!c) throw new Error('no profile');
  process.stdout.write(`targetRoles: ${JSON.stringify(c.targetRoles)}\n`);
  process.stdout.write(`tracks:      ${JSON.stringify(c.tracks)}\n`);
  process.stdout.write(`skills:      ${c.skills.slice(0, 14).join(', ')}\n\n`);
  const jobs = await listJobs(3000);
  for (const t of ['Intermediate Backend Engineer, Platform', 'Backend/API Engineer, Money', 'Machine Learning Engineer, Ads Optim']) {
    const j = jobs.find((x) => x.title.includes(t));
    if (!j) continue;
    const s = scoreJob(c, j);
    process.stdout.write(`${j.company} — ${j.title.slice(0,44)}\n  total ${s.score}%  parts ${JSON.stringify(s.parts)}\n`);
  }
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
