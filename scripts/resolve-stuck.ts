import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';
import { advance } from '../src/lib/autopilot/state-machine';

/**
 * Resolve runs left in SUBMITTING.
 *
 * SUBMITTING means a submit was pressed and the run has not reported back. A
 * process that ended between those two points leaves the row there for ever,
 * which both misreports the application and permanently blocks the role via
 * the duplicate guard.
 *
 * They move to SUBMISSION_UNCONFIRMED, which is the only honest reading: the
 * employer may have it, and nothing here can say.
 */
async function main(): Promise<void> {
  const db = await getDb();
  const u = await db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [process.argv[2].toLowerCase()]);
  const uid = u.rows[0].id;
  const staleAfter = Number(process.argv[3] ?? 5) * 60_000;

  const rows = await db.query<{ job_id: string; company: string; title: string; updated_at: number }>(
    `SELECT a.job_id, j.company, j.title, a.updated_at FROM autopilot_runs a JOIN jobs j ON j.id = a.job_id
      WHERE a.user_id = $1 AND a.state = 'SUBMITTING'`, [uid]);

  for (const r of rows.rows) {
    const age = Date.now() - r.updated_at;
    if (age < staleAfter) { process.stdout.write(`  in flight: ${r.company} (${Math.round(age / 1000)}s)\n`); continue; }
    const why = `A submit was pressed and the run ended before it could confirm. Check your email for ${r.company} before treating this as applied or re-applying.`;
    const res = await advance(uid, r.job_id, 'SUBMISSION_UNCONFIRMED', { blockedReason: why });
    process.stdout.write(`  ${res.ok ? 'resolved' : 'could not resolve'}: ${r.company} — ${r.title.slice(0, 44)}\n`);
  }
  process.stdout.write(`\n${rows.rows.length} run(s) were in SUBMITTING\n`);
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
