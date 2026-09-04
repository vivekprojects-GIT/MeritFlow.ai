import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';
import { getCandidateProfile, listJobs } from '../src/lib/jobs-store';
import { answerOpenEnded } from '../src/lib/autopilot/open-ended';
import { classifyQuestion } from '../src/lib/autopilot/question-class';

async function main(): Promise<void> {
  const db = await getDb();
  const u = await db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [process.argv[2].toLowerCase()]);
  const candidate = await getCandidateProfile(u.rows[0].id);
  if (!candidate) throw new Error('no profile');

  const jobs = await listJobs(3000);
  const want = process.argv[3] ?? 'cohere';
  const job = jobs.find((j) => new RegExp(want, 'i').test(j.company)) ?? jobs[0];
  process.stdout.write(`job: ${job.company} — ${job.title}
`);

  const questions = process.argv.slice(4).length > 0 ? process.argv.slice(4) : [
    'Why do you want to join Figma?',
    'In 1-2 sentences, why might you be a good fit for this Notifications Relevance team?',
    'Tell us about a time you managed a Kubernetes migration in a regulated bank.',
  ];

  for (const q of questions) {
    const cls = classifyQuestion(q);
    process.stdout.write(`\n[${cls.kind}] ${q}\n`);
    if (cls.kind !== 'OPEN_ENDED') { process.stdout.write('  (not routed to prose)\n'); continue; }
    const a = await answerOpenEnded(q, candidate, job);
    if (!a) { process.stdout.write('  -> declined, nothing supportable\n'); continue; }
    process.stdout.write(`  -> ${a.text}\n`);
    if (a.dropped.length) process.stdout.write(`  dropped ${a.dropped.length}: ${a.dropped[0].slice(0, 90)}\n`);
  }
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
