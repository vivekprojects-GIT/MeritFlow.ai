import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';
async function main(): Promise<void> {
  const db = await getDb();
  const u = await db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', ['katkurisaivivek95@gmail.com']);
  const d = await db.query<{ kind: string; name: string }>('SELECT kind, name FROM documents WHERE user_id = $1 ORDER BY created_at DESC LIMIT 8', [u.rows[0].id]);
  for (const r of d.rows) process.stdout.write(`${r.kind} | ${String(r.name).slice(0, 54)}\n`);
  const arc = await db.query<{ n: number }>('SELECT COUNT(*) n FROM application_archive WHERE user_id = $1', [u.rows[0].id]);
  process.stdout.write(`documents: ${d.rows.length} · archived applications: ${arc.rows[0].n}\n`);
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
