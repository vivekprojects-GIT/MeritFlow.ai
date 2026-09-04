import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';
async function main(): Promise<void> {
  const db = await getDb();
  const r = await db.query<{ id: string; url: string; title: string }>(
    "SELECT id, url, title FROM jobs WHERE title = 'Pasted posting'");
  for (const row of r.rows) {
    const tail = new URL(row.url).pathname.split('/').filter(Boolean).pop()?.slice(0, 18) ?? row.id.slice(0, 8);
    await db.query('UPDATE jobs SET title = $1, norm_title = $2 WHERE id = $3', [`Pasted posting ${tail}`, `pasted ${row.id}`, row.id]);
    process.stdout.write(`retitled ${row.url.slice(0, 70)}\n`);
  }
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
