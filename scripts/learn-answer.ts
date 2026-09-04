import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';
import { saveAnswer, learnedKey } from '../src/lib/autopilot/answer-vault';
async function main(): Promise<void> {
  const db = await getDb();
  const u = await db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [process.argv[2].toLowerCase()]);
  const question = process.argv[3];
  const value = process.argv[4];
  await saveAnswer(u.rows[0].id, { intent: learnedKey(question), label: question, value, provenance: 'USER_VERIFIED', verified: true, sensitivity: 'PREFERENCE' });
  process.stdout.write(`learned: "${question.slice(0,60)}" -> ${value}\n`);
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
