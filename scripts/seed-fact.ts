import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';
import { getVault, saveAnswer } from '../src/lib/autopilot/answer-vault';

async function main(): Promise<void> {
  const db = await getDb();
  const u = await db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [process.argv[2].toLowerCase()]);
  const uid = u.rows[0].id;
  const intent = process.argv[3];
  const value = process.argv.slice(4).join(' ');
  await saveAnswer(uid, { intent, value, provenance: 'USER_VERIFIED', verified: true, sensitivity: 'NORMAL_FACT' });
  const v = await getVault(uid);
  process.stdout.write(`${intent} = ${v.get(intent)?.value ?? '(none)'}\n`);
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
