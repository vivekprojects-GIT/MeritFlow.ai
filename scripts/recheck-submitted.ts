import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';
import { advance } from '../src/lib/autopilot/state-machine';

/**
 * Walk back submissions whose confirmation cannot be supported.
 *
 * A run recorded before the evidence was stored has no way to justify itself,
 * and the check that passed it counted an analytics beacon as an accepted
 * application. Rather than leave an unsupportable claim on the tracker, those
 * move to SUBMISSION_UNCONFIRMED, which is the state that says exactly what is
 * known: it was attempted, and nothing proves it arrived.
 */
async function main(): Promise<void> {
  const db = await getDb();
  const u = await db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [process.argv[2].toLowerCase()]);
  const uid = u.rows[0].id;
  const apply = process.argv.includes('--apply');

  const rows = await db.query<{ job_id: string; company: string; receipt: string }>(
    "SELECT a.job_id, j.company, a.receipt FROM autopilot_runs a JOIN jobs j ON j.id = a.job_id WHERE a.user_id = $1 AND a.state = 'SUBMITTED'",
    [uid]);

  for (const r of rows.rows) {
    const rec = JSON.parse(r.receipt) as { confirmation?: { reference: string; evidence?: string[] } };
    const ev = rec.confirmation?.evidence ?? [];
    const ref = rec.confirmation?.reference ?? '';
    const generated = /^(greenhouse|lever|ashby|generic)-[a-z0-9]+$/i.test(ref);

    if (ev.length > 0) { process.stdout.write(`  keep  ${r.company}: ${ev.join('; ')}\n`); continue; }

    const why = `Recorded as submitted on evidence that was not checkable: no confirmation text, no employer reference (${ref} was generated locally), and the network check of the time counted an analytics beacon as an accepted application. Whether this reached the employer is unknown — check your email or the employer's portal.`;
    process.stdout.write(`  walk back  ${r.company}  (reference ${generated ? 'generated' : ref}, no evidence recorded)\n`);
    if (apply) {
      const res = await advance(uid, r.job_id, 'SUBMISSION_UNCONFIRMED', { blockedReason: why });
      process.stdout.write(`             ${res.ok ? 'moved to SUBMISSION_UNCONFIRMED' : res.reason}\n`);
    }
  }
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
