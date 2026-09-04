import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';
import { listJobs, scoreJob, getCandidateProfile } from '../src/lib/jobs-store';
import { getPolicy } from '../src/lib/autopilot/policy-engine';
import { getVault } from '../src/lib/autopilot/answer-vault';
import { judgeAge } from '../src/lib/autopilot/job-age';
import { judgeExperience } from '../src/lib/autopilot/experience-fit';
import { listRuns } from '../src/lib/autopilot/state-machine';

async function main(): Promise<void> {
  const db = await getDb();
  const u = await db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [process.argv[2].toLowerCase()]);
  const uid = u.rows[0].id;

  const [jobs, policy, candidate, vault, runs] = await Promise.all([
    listJobs(3000), getPolicy(uid), getCandidateProfile(uid), getVault(uid), listRuns(uid, 500),
  ]);
  if (!policy || !candidate) throw new Error('no policy or profile');

  const done = new Set(runs.filter((r) => !['DISCOVERED', 'FAILED', 'RETRYING'].includes(r.state)).map((r) => r.jobId));
  const years = Number(String(vault.get('EXPERIENCE.YEARS')?.value ?? '').match(/\d{1,2}/)?.[0]);
  const candidateYears = Number.isFinite(years) ? years : null;

  let afterDone = 0, afterAge = 0, afterSeniority = 0;
  const scores: number[] = [];
  const ageFails: string[] = [];
  const queue: { job: typeof jobs[number]; score: number; rank: number }[] = [];

  for (const j of jobs) {
    if (done.has(j.id)) continue;
    afterDone += 1;
    const score = scoreJob(candidate, j).score;
    scores.push(score);
    const age = judgeAge({ postedAt: j.postedAt, detectedAt: j.detectedAt, score, floor: policy.minScore }, Date.now());
    if (!age.applies) { if (ageFails.length < 3) ageFails.push(`${j.company} ${score}% — ${age.reason ?? ''}`); continue; }
    afterAge += 1;
    const sen = judgeExperience({ title: j.title, description: j.description, candidateYears });
    if (!sen.applies) continue;
    afterSeniority += 1;
    queue.push({ job: j, score, rank: age.rankedScore });
  }
  queue.sort((a, b) => b.rank - a.rank);

  scores.sort((a, b) => b - a);
  process.stdout.write(`corpus                 ${jobs.length}\n`);
  process.stdout.write(`not already handled    ${afterDone}\n`);
  process.stdout.write(`clears age+fit bar     ${afterAge}\n`);
  process.stdout.write(`clears seniority       ${afterSeniority}   <-- the queue\n\n`);
  process.stdout.write(`policy: minScore ${policy.minScore}, minComp ${policy.minComp}, years ${candidateYears}\n`);
  process.stdout.write(`fit scores: best ${scores[0]}%, p90 ${scores[Math.floor(scores.length*0.1)]}%, median ${scores[Math.floor(scores.length/2)]}%\n`);
  process.stdout.write(`above 70: ${scores.filter((s) => s >= 70).length}\n\n`);
  process.stdout.write('the queue, best first:\n');
  for (const q of queue) {
    let host = '?';
    try {
      host = new URL(q.job.url).hostname.replace('www.', '');
    } catch {
      host = q.job.url.slice(0, 30);
    }
    process.stdout.write(
      `  ${String(q.score).padStart(3)}%  ${q.job.company.slice(0, 20).padEnd(22)} ${host.padEnd(30)} ${q.job.title.slice(0, 40)}\n`,
    );
  }
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
