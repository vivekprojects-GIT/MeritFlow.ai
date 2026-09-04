import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';

/**
 * Correct tracker cards that say APPLIED for applications never sent.
 *
 * An application counts as sent only when its run reached SUBMITTED or beyond,
 * or its receipt records mode SUBMITTED. Anything else marked APPLIED came from
 * the SUBMITTING mirror bug and is reset to what the run actually reached.
 */
async function main(): Promise<void> {
  const db = await getDb();
  const u = await db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [process.argv[2].toLowerCase()]);
  const uid = u.rows[0].id;
  const apply = process.argv.includes('--apply');

  const rows = await db.query<{ job_id: string; company: string; app_state: string; run_state: string | null; receipt: string | null }>(
    `SELECT a.job_id, j.company, a.state AS app_state, r.state AS run_state, r.receipt
       FROM job_applications a
       JOIN jobs j ON j.id = a.job_id
       LEFT JOIN autopilot_runs r ON r.job_id = a.job_id AND r.user_id = a.user_id
      WHERE a.user_id = $1 AND a.state = 'APPLIED'`, [uid]);

  const SENT = ['SUBMITTED', 'CONFIRMED', 'INTERVIEW', 'OFFER', 'REJECTED'];
  let fixed = 0;
  for (const r of rows.rows) {
    const receiptSent = r.receipt ? (JSON.parse(r.receipt) as { mode?: string }).mode === 'SUBMITTED' : false;
    const trulySent = (r.run_state !== null && SENT.includes(r.run_state)) || receiptSent;
    if (trulySent) { process.stdout.write(`  keep  ${r.company} (run ${r.run_state})\n`); continue; }

    const target = r.run_state === 'NEEDS_USER_ACTION' ? 'NEEDS_USER_INPUT'
      : r.run_state === 'DRY_RUN_COMPLETE' ? 'READY'
      : r.run_state === 'SKIPPED' ? 'SKIPPED' : 'PREPARING';
    process.stdout.write(`  fix   ${r.company.padEnd(20)} APPLIED -> ${target}  (run ${r.run_state ?? 'none'})\n`);
    if (apply) await db.query('UPDATE job_applications SET state = $1, updated_at = $2 WHERE user_id = $3 AND job_id = $4', [target, Date.now(), uid, r.job_id]);
    fixed += 1;
  }
  process.stdout.write(`\n${apply ? 'corrected' : 'would correct'} ${fixed} of ${rows.rows.length} cards marked APPLIED\n`);
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
