import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';
async function main(): Promise<void> {
  const db = await getDb();
  const u = await db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [process.argv[2].toLowerCase()]);
  const r = await db.query<{ company: string; title: string; state: string; blocked_reason: string | null; receipt: string | null; updated_at: number }>(
    `SELECT j.company, j.title, a.state, a.blocked_reason, a.receipt, a.updated_at
       FROM autopilot_runs a JOIN jobs j ON j.id = a.job_id
      WHERE a.user_id = $1 ORDER BY a.updated_at DESC LIMIT 3`, [u.rows[0].id]);
  for (const row of r.rows) {
    process.stdout.write(`\n${row.company} — ${row.title.slice(0,52)}\n  ${row.state}   ${new Date(row.updated_at).toLocaleTimeString()}\n  ${row.blocked_reason ?? ''}\n`);
    if (row.receipt) {
      const rec = JSON.parse(row.receipt) as { mode?: string; fields?: unknown[]; confirmation?: { reference: string; evidence?: string[] } };
      process.stdout.write(`  mode=${rec.mode} fields=${rec.fields?.length ?? 0}`);
      if (rec.confirmation) process.stdout.write(`  ref=${rec.confirmation.reference} evidence=${JSON.stringify(rec.confirmation.evidence ?? [])}`);
      process.stdout.write('\n');
    }
  }
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
