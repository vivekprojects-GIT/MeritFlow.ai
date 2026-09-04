import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';
import { listJobs, getCandidateProfile } from '../src/lib/jobs-store';
async function main(): Promise<void> {
  const db = await getDb();
  const u = await db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [process.argv[2].toLowerCase()]);
  const c = await getCandidateProfile(u.rows[0].id);
  process.stdout.write(`candidate locations: ${JSON.stringify(c?.locations)}\n\n`);
  const jobs = await listJobs(4000);
  const foreign = jobs.filter((j) => /\b(canada|toronto|vancouver|ontario|brazil|india|poland|uk|london|germany|berlin|australia|singapore)\b/i.test(`${j.location} ${j.title}`));
  process.stdout.write(`postings outside the US in the corpus: ${foreign.length} of ${jobs.length}\n`);
  for (const j of foreign.slice(0, 6)) process.stdout.write(`  ${j.company.slice(0,18).padEnd(20)} ${j.location.slice(0,26).padEnd(28)} ${j.title.slice(0,36)}\n`);
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
