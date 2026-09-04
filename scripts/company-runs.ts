import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';
async function main(): Promise<void> {
  const db = await getDb();
  const u = await db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [process.argv[2].toLowerCase()]);
  const r = await db.query<{ company: string; title: string; state: string; blocked_reason: string | null; url: string; updated_at: number }>(
    `SELECT j.company, j.title, a.state, a.blocked_reason, j.url, a.updated_at
       FROM autopilot_runs a JOIN jobs j ON j.id=a.job_id
      WHERE a.user_id=$1 AND lower(j.company) LIKE lower($2) ORDER BY a.updated_at DESC`, [u.rows[0].id, `%${process.argv[3]}%`]);
  if (r.rows.length === 0) { process.stdout.write('no run recorded for that employer\n'); process.exit(0); }
  for (const x of r.rows) {
    process.stdout.write(`${x.company} — ${x.title.slice(0,50)}\n  ${x.state}   ${new Date(x.updated_at).toLocaleString()}\n  ${(x.blocked_reason ?? '(no reason recorded)').slice(0,160)}\n  ${x.url}\n\n`);
  }
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
