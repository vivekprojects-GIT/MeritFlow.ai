import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';
async function main(): Promise<void> {
  const db = await getDb();
  const u = await db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [process.argv[2].toLowerCase()]);
  const runs = await db.query<{ company: string; state: string; verifier: string | null; receipt: string | null }>(
    `SELECT j.company, a.state, a.verifier, a.receipt FROM autopilot_runs a JOIN jobs j ON j.id = a.job_id
      WHERE a.user_id = $1 AND a.verifier IS NOT NULL ORDER BY a.updated_at DESC LIMIT 5`, [u.rows[0].id]);
  for (const r of runs.rows) {
    process.stdout.write(`\n=== ${r.company} [${r.state}]\n`);
    const v = JSON.parse(r.verifier!) as Record<string, unknown>;
    process.stdout.write(`  autopilotAllowed = ${String(v.autopilotAllowed)}\n`);
    for (const [k, val] of Object.entries(v)) {
      if (k === 'autopilotAllowed') continue;
      const text = typeof val === 'string' ? val : JSON.stringify(val);
      if (text && text !== '[]' && text !== 'null' && text !== '{}') process.stdout.write(`  ${k}: ${text.slice(0, 400)}\n`);
    }
  }
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
