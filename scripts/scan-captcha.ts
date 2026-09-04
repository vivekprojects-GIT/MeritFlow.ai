import { loadEnv } from './env';
loadEnv();
import { chromium } from 'playwright';
import { listJobs, getCandidateProfile, scoreJob } from '../src/lib/jobs-store';
import { getDb } from '../src/lib/db';
import { judgeRoleFit } from '../src/lib/autopilot/role-fit';
import { listRuns } from '../src/lib/autopilot/state-machine';

const SEL = ['iframe[src*="recaptcha"]','iframe[src*="hcaptcha"]','[class*="cf-turnstile"]'];

async function main(): Promise<void> {
  const db = await getDb();
  const u = await db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [process.argv[2].toLowerCase()]);
  const [jobs, c, runs] = await Promise.all([listJobs(4000), getCandidateProfile(u.rows[0].id), listRuns(u.rows[0].id, 500)]);
  if (!c) throw new Error('no profile');
  const handled = new Set(runs.map((r) => r.jobId));

  const picks = jobs
    .filter((j) => (process.env.INCLUDE_TRIED ? true : !handled.has(j.id)))
    .filter((j) => /greenhouse|lever\.co|ashbyhq|smartrecruiters/.test(j.url))
    .filter((j) => judgeRoleFit({ title: j.title, targetRoles: c.targetRoles }).applies)
    .map((j) => ({ j, score: scoreJob(c, j).score }))
    .filter((x) => x.score >= Number(process.argv[4] ?? 68))
    .sort((a, b) => b.score - a.score)
    .slice(0, Number(process.argv[3] ?? 10));

  const browser = await chromium.launch({ headless: true });
  let clean = 0;
  for (const { j, score } of picks) {
    const page = await browser.newPage();
    let verdict = 'error';
    try {
      await page.goto(j.url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForTimeout(3500);
      verdict = 'clean';
      for (const s of SEL) {
        const loc = page.locator(s).first();
        if ((await loc.count().catch(() => 0)) > 0 && (await loc.isVisible().catch(() => false))) { verdict = 'CAPTCHA'; break; }
      }
    } catch { verdict = 'unreachable'; }
    if (verdict === 'clean') clean += 1;
    process.stdout.write(`${verdict.padEnd(11)} ${String(score).padStart(3)}%  ${j.company.slice(0,18).padEnd(20)} ${j.title.slice(0,38)}\n`);
    await page.close();
  }
  await browser.close();
  process.stdout.write(`\n${clean} of ${picks.length} direct-board postings have no visible CAPTCHA\n`);
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
