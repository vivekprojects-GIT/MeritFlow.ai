import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';
async function main(): Promise<void> {
  const db = await getDb();
  const t = await db.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name", []);
  process.stdout.write(t.rows.map((r) => r.name).join('  ') + '\n');
  process.exit(0);
}
void main();
