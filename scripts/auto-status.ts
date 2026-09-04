import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';
import { getJobSettings } from '../src/lib/job-settings';
async function main(): Promise<void> {
  const db = await getDb();
  const u = await db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [process.argv[2].toLowerCase()]);
  const s = await getJobSettings(u.rows[0].id);
  process.stdout.write(`autonomous=${s.autonomous} autoSubmit=${s.autoSubmit} lastCycle=${s.autonomousLastRunAt ? new Date(s.autonomousLastRunAt).toLocaleString() : 'never'}\n`);
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
