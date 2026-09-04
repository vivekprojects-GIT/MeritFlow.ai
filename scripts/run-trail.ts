import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';
async function main(): Promise<void> {
  const db = await getDb();
  const u = await db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [process.argv[2].toLowerCase()]);
  const r = await db.query<{ company: string; receipt: string }>(
    `SELECT j.company, a.receipt FROM autopilot_runs a JOIN jobs j ON j.id=a.job_id
      WHERE a.user_id=$1 AND lower(j.company) LIKE lower($2) AND a.receipt IS NOT NULL ORDER BY a.updated_at DESC LIMIT 1`,
    [u.rows[0].id, `%${process.argv[3]}%`]);
  if (!r.rows[0]) { process.stdout.write('no receipt\n'); process.exit(0); }
  const rec = JSON.parse(r.rows[0].receipt) as Record<string, unknown>;
  process.stdout.write(`${r.rows[0].company}\n`);
  process.stdout.write(`mode=${rec.mode} fields=${(rec.fields as unknown[] | undefined)?.length ?? 0}\n`);
  const trail = rec.trail as { url?: string; step?: string; action?: string; note?: string }[] | undefined;
  for (const t of trail ?? []) process.stdout.write(`  ${(t.step??'').padEnd(10)} ${(t.action??'').padEnd(12)} ${(t.note??'').slice(0,70)}\n     ${(t.url??'').slice(0,80)}\n`);
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
