import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';
async function main(): Promise<void> {
  const db = await getDb();
  const r = await db.query<Record<string, unknown>>('SELECT name, email, phone FROM users WHERE lower(email) = $1', [process.argv[2].toLowerCase()]);
  process.stdout.write(JSON.stringify(r.rows[0], null, 2) + '\n');
  process.exit(0);
}
void main();
