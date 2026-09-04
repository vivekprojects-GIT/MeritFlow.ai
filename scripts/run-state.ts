import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';
async function main(): Promise<void> {
  const db = await getDb();
  const u = await db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [process.argv[2].toLowerCase()]);
  for (const id of process.argv.slice(3)) {
    const r = await db.query<{ state: string; company: string; title: string }>(
      'SELECT a.state, j.company, j.title FROM jobs j LEFT JOIN autopilot_runs a ON a.job_id = j.id AND a.user_id = $1 WHERE j.id = $2',
      [u.rows[0].id, id]);
    const row = r.rows[0];
    process.stdout.write(`${id}  ${(row?.state ?? 'NO RUN').padEnd(24)} ${row?.company ?? '?'} — ${(row?.title ?? '').slice(0,40)}\n`);
  }
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
