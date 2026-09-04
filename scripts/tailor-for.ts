import { loadEnv } from './env';
loadEnv();
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDb } from '../src/lib/db';
import { getCandidateProfile, scoreJob, type Job } from '../src/lib/jobs-store';
import { tailorResume, renderResume } from '../src/lib/autopilot/tailor';
import { resumeToDocx } from '../src/lib/jobs/docx-template';

/** Tailor the résumé to one job description and write the PDF the engine would send. */
async function main(): Promise<void> {
  const db = await getDb();
  const u = await db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [process.argv[2].toLowerCase()]);
  const candidate = await getCandidateProfile(u.rows[0].id);
  if (!candidate) throw new Error('no profile');

  const description = await readFile(process.argv[3], 'utf8');
  const job = {
    id: 'live', company: process.env.CO ?? 'Employer', title: process.env.ROLE ?? 'Engineer',
    location: 'United States', remote: true, track: 'ai', description,
    skills: (process.env.SKILLS ?? 'Python,LangChain,RAG,LLM,AWS').split(','), minComp: null,
    url: 'https://jobs.ashbyhq.com/hippocratic ai', postedAt: Date.now(), detectedAt: Date.now(),
    discoverySource: 'MANUAL', companyBlurb: '', seniority: 'mid', yearsExp: '3+',
    employment: 'full-time', workMode: 'hybrid', applicants: null,
  } as unknown as Job;

  const before = scoreJob(candidate, job).score;
  const tailored = await tailorResume(candidate, job);
  const doc = renderResume(candidate, tailored, 'Sai Vivek Katkuri');
  const after = scoreJob({ ...candidate, resumeText: doc }, job).score;

  /* The same guard the engine applies: tailoring has to earn the attachment. */
  const keepOriginal = after < before;
  const final = keepOriginal ? candidate.resumeText : doc;

  process.stdout.write(`fit ${before}% -> ${after}%${keepOriginal ? '  (regressed, keeping your original)' : '  (tailored version wins)'}\n`);
  process.stdout.write(`emphasised: ${tailored.emphasised.slice(0, 8).join(', ')}\n`);
  if (tailored.dropped.length) process.stdout.write(`dropped ${tailored.dropped.length} unsupported claim(s)\n`);
  process.stdout.write(`summary: ${tailored.summary.slice(0, 200)}\n`);

  const dir = await mkdtemp(join(tmpdir(), 'meritflow-tailored-'));
  const file = join(dir, 'Sai-Vivek-Katkuri-Resume.docx');
  await writeFile(file, resumeToDocx(final));
  process.stdout.write(`\nPDF: ${file}\n`);
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
