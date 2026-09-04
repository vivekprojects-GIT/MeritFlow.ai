import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';
import { listJobs, getCandidateProfile, scoreJob } from '../src/lib/jobs-store';
import { judgeRoleFit } from '../src/lib/autopilot/role-fit';

async function main(): Promise<void> {
  const db = await getDb();
  const u = await db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [process.argv[2].toLowerCase()]);
  const [jobs, c] = await Promise.all([listJobs(4000), getCandidateProfile(u.rows[0].id)]);
  if (!c) throw new Error('no profile');

  const aiml = jobs.filter((j) => judgeRoleFit({ title: j.title, targetRoles: c.targetRoles }).applies && scoreJob(c, j).score >= 68);
  const byCompany = new Map<string, number>();
  for (const j of aiml) byCompany.set(j.company, (byCompany.get(j.company) ?? 0) + 1);

  process.stdout.write(`${jobs.length} postings in the corpus\n`);
  process.stdout.write(`${aiml.length} are AI/ML roles scoring 68%+\n\n`);
  process.stdout.write('who those come from:\n');
  for (const [co, n] of [...byCompany.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    process.stdout.write(`  ${String(n).padStart(3)}  ${co}\n`);
  }
  const db2 = await getDb();
  const reg = await db2.query<{ n: number }>("SELECT COUNT(*) AS n FROM companies WHERE ats_identifier <> ''", []);
  process.stdout.write(`\nregistry companies we can collect from: ${reg.rows[0].n}\n`);
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
