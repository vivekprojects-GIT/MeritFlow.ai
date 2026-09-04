import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';
import { saveAnswer } from '../src/lib/autopilot/answer-vault';

async function main(): Promise<void> {
  const db = await getDb();
  const u = await db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [process.argv[2].toLowerCase()]);
  const userId = u.rows[0]?.id;
  if (!userId) throw new Error('no such account');

  const facts: [string, string][] = [
    ['PROFILE.LINKEDIN', 'https://linkedin.com/in/saivivekkatkuri'],
    ['PROFILE.GITHUB', 'https://github.com/vivekprojects-GIT'],
    ['EXPERIENCE.YEARS', '3'],
  ];

  for (const [intent, value] of facts) {
    await saveAnswer(userId, { intent, value, provenance: 'USER_VERIFIED', verified: true, sensitivity: 'NORMAL_FACT' });
    process.stdout.write(`  ${intent.padEnd(22)} ${value}\n`);
  }
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
