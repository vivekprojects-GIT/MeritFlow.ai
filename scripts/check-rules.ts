import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';
import { getVault, canonicalize } from '../src/lib/autopilot/answer-vault';
import { activeResume } from '../src/lib/jobs/documents';
import { derive, factsFrom } from '../src/lib/autopilot/derive';

async function main(): Promise<void> {
  const db = await getDb();
  const u = await db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [process.argv[2].toLowerCase()]);
  const facts = factsFrom(await getVault(u.rows[0].id), await activeResume(u.rows[0].id), 'COMPANY_CAREER_SITE');
  process.stdout.write(`degree: ${facts.degreeLevel} (${facts.degreeField.slice(0, 40)})   city: ${facts.city}, ${facts.state}\n\n`);

  const qs = [
    'What is your current or previous job title?',
    'Who is your current or previous employer?',
    'Will you require Stripe to sponsor you for a work permit now or in the future for the location(s) you selected?',
    'Do you live in the bay area, California, Seattle or New York',
    'Do you hold a PhD in Economics or a closely related field, with a specialization in data-intensive research?',
    'Do you opt-in to receive WhatsApp messages from Stripe Recruiting?',
    'Please select the country where you currently reside.',
    'If this role offers the option to work from a remote location, do you plan to work remotely?',
  ];

  for (const q of qs) {
    const c = canonicalize(q);
    const d = c ? null : derive(q, facts);
    const answer = c ? `vault:${c.intent}` : d ? `${d.value}  [${d.rule}]` : 'STILL BLOCKED';
    process.stdout.write(`${q.slice(0, 68)}\n  -> ${answer}\n\n`);
  }
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
