/** The best-scoring open Greenhouse posting for one candidate. Read-only. */
import { loadEnv } from './env';

loadEnv();

import { getDb } from '../src/lib/db';
import { getCandidateProfile, listJobs, scoreJob } from '../src/lib/jobs-store';

async function main(): Promise<void> {
  const db = await getDb();
  const u = await db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [
    (process.argv[2] ?? '').toLowerCase(),
  ]);
  const userId = u.rows[0]?.id;
  if (!userId) throw new Error('no such account');

  const candidate = await getCandidateProfile(userId);
  if (!candidate) throw new Error('no candidate profile');

  const done = new Set(
    (await db.query<{ job_id: string }>('SELECT job_id FROM autopilot_runs WHERE user_id = $1', [userId])).rows.map(
      (r) => String(r.job_id),
    ),
  );

  const ranked = (await listJobs(3000))
    .filter((j) => /greenhouse\.io/.test(j.url) && !done.has(j.id))
    .map((job) => ({ job, ...scoreJob(candidate, job) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);

  for (const { job, score, gaps } of ranked) {
    process.stdout.write(
      `${String(score).padStart(3)}  ${job.company.padEnd(16)} ${job.title.slice(0, 52).padEnd(54)}` +
        `${job.remote ? 'remote' : (job.location || '').slice(0, 22)}\n` +
        `     gaps: ${gaps.slice(0, 6).join(', ') || '(none)'}\n     ${job.url}\n`,
    );
  }
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
