import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';
async function main(): Promise<void> {
  const db = await getDb();
  const u = await db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [process.argv[2].toLowerCase()]);
  const r = await db.query<{ company: string; receipt: string }>(
    "SELECT j.company, a.receipt FROM autopilot_runs a JOIN jobs j ON j.id=a.job_id WHERE a.user_id=$1 AND a.receipt IS NOT NULL ORDER BY a.updated_at DESC LIMIT 25", [u.rows[0].id]);
  const seen = new Set<string>();
  for (const row of r.rows) {
    const rec = JSON.parse(row.receipt) as { unresolved?: { question: string; required: boolean; reason: string }[] };
    for (const x of rec.unresolved ?? []) {
      if (!x.required) continue;
      const k = x.question.slice(0, 60);
      if (seen.has(k)) continue;
      seen.add(k);
      process.stdout.write(`${row.company.slice(0,14).padEnd(16)} ${x.question.replace(/\s+/g,' ').slice(0, 72)}\n     ${x.reason.slice(0, 70)}\n`);
    }
  }
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
