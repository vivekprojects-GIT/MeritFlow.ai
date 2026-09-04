import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';
import { getVault } from '../src/lib/autopilot/answer-vault';
import { routeQuestion } from '../src/lib/autopilot/intent-router';

/** Wordings no pattern was ever written for. */
const NOVEL = [
  'Current location',
  'From where do you intend to work?',
  'What city are you based out of these days?',
  'Kindly share the URL of your LinkedIn profile',
  'Tell us the organisation you are presently employed with',
  'Would you need us to file an H-1B on your behalf?',
  'Are you happy to move for this position?',
  'Whereabouts are you based?',
  'Why do you want to join Figma?',
  'What is the job code number in the posting?',
];

async function main(): Promise<void> {
  const db = await getDb();
  const u = await db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [process.argv[2].toLowerCase()]);
  const userId = u.rows[0].id;
  const vault = await getVault(userId);

  const asked = process.argv.slice(3);
  for (const q of (asked.length > 0 ? asked : NOVEL)) {
    const r = await routeQuestion(userId, q);
    const stored = r.intent ? vault.get(r.intent) : undefined;
    const value = stored?.autopilotOk ? stored.value : null;
    process.stdout.write(
      `${q.slice(0, 52).padEnd(54)} ${(r.intent ?? '—').padEnd(26)} ${r.via.padEnd(8)} ${value ?? '(goes to you)'}\n`,
    );
  }
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
