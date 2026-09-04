import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';
async function main(): Promise<void> {
  const db = await getDb();
  const r = await db.query<{ name: string }>("PRAGMA table_info(application_archive)", []);
  process.stdout.write(r.rows.map((c) => c.name).join(', ') + '\n');
  process.exit(0);
}
void main();
