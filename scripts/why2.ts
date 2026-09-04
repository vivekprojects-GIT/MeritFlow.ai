import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';
import { getVault } from '../src/lib/autopilot/answer-vault';
import { activeResume } from '../src/lib/jobs/documents';
import { derive, factsFrom } from '../src/lib/autopilot/derive';

async function main(): Promise<void> {
  const db = await getDb();
  const u = await db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [process.argv[2].toLowerCase()]);
  const userId = u.rows[0].id;
  const facts = factsFrom(await getVault(userId), await activeResume(userId), 'COMPANY_CAREER_SITE');
  process.stdout.write(`years on file: ${facts.yearsExperience}\n\n`);
  for (const q of [
    'Do you have more than 6 years of industry experience? Not including internship, co-op or academic.',
    'Do you have 5+ years developing and deploying machine learning models in production environments?',
    'Do you have less than 2 years of industry experience?',
    'Do you have at least 2 years of experience?',
  ]) {
    const d = derive(q, facts);
    process.stdout.write(`${q}\n  -> ${d ? `${d.value}  [${d.rule}]` : 'declined — goes to you'}\n\n`);
  }
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
