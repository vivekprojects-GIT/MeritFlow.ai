import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';

/** Backfill real names onto stub rows whose receipts already know them. */
async function main(): Promise<void> {
  const db = await getDb();
  const rows = await db.query<{ id: string; title: string; receipt: string | null }>(
    `SELECT j.id, j.title, a.receipt FROM jobs j
       LEFT JOIN autopilot_runs a ON a.job_id = j.id
      WHERE j.title LIKE 'Pasted posting%'`);
  for (const r of rows.rows) {
    if (!r.receipt) continue;
    const rec = JSON.parse(r.receipt) as { company?: string; role?: string };
    if (!rec.company || !rec.role || /ashbyhq|lever\.co/i.test(rec.company)) continue;
    await db.query('UPDATE jobs SET company = $1, title = $2 WHERE id = $3', [rec.company.slice(0,120), rec.role.slice(0,200), r.id]);
    process.stdout.write(`renamed -> ${rec.company} — ${rec.role.slice(0,50)}\n`);
  }
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
