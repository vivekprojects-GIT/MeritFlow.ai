import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';
import { getCandidateProfile, scoreJob, listJobs } from '../src/lib/jobs-store';
async function main(): Promise<void> {
  const db = await getDb();
  const u = await db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [process.argv[2].toLowerCase()]);
  const c = await getCandidateProfile(u.rows[0].id);
  const jobs = await listJobs(4000);
  const j = jobs.find((x) => x.url.includes(process.argv[3]));
  if (!j || !c) { process.stdout.write('not found\n'); process.exit(0); }
  const s = scoreJob(c, j);
  process.stdout.write(`${j.company} — ${j.title}\n`);
  process.stdout.write(`  score ${s.score}%  parts ${JSON.stringify(s.parts)}\n`);
  process.stdout.write(`  location "${j.location}"  track "${j.track}"  minComp ${j.minComp}\n`);
  process.stdout.write(`  description length ${j.description.length}  skills ${JSON.stringify(j.skills)}\n`);
  process.stdout.write(`  postedAt ${j.postedAt}  detectedAt ${new Date(j.detectedAt).toLocaleString()}\n`);
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
