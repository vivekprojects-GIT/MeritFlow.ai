import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';
import { runAutopilot } from '../src/lib/autopilot/runner';

async function main(): Promise<void> {
  const db = await getDb();
  const u = await db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [process.argv[2].toLowerCase()]);
  const ids = process.argv.slice(3);
  const out = await runAutopilot(u.rows[0].id, { jobIds: ids, limit: ids.length });
  process.stdout.write(`attempted ${out.attempted} · submitted ${out.submitted} · skipped ${out.skipped}\n`);
  process.stdout.write(`stopped: ${out.stoppedBecause}\n\n`);
  for (const r of out.results) process.stdout.write(`${r.company} — ${r.title}\n  ${r.state}\n  ${r.reason}\n\n`);
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
