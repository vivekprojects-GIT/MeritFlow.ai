import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';
async function main(): Promise<void> {
  const db = await getDb();
  for (const t of process.argv.slice(2)) {
    const r = await db.query<{ name: string; type: string }>(`PRAGMA table_info(${t})`, []);
    process.stdout.write(`\n${t}: ` + r.rows.map((c) => c.name).join(', ') + '\n');
  }
  process.exit(0);
}
void main();
