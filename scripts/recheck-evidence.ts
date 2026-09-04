import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';
import { advance } from '../src/lib/autopilot/state-machine';
import { readConfirmation } from '../src/lib/autopilot/navigator/plan';

/**
 * Re-judge every recorded submission against the corrected matcher.
 *
 * A submission whose only support was the phrase "the page says the application
 * was received" was accepted by a matcher that also fired on "we process your
 * application in accordance with...". Those claims cannot stand, and a claim
 * that cannot stand must be walked back rather than left to be discovered by a
 * candidate waiting for an email.
 */
async function main(): Promise<void> {
  const db = await getDb();
  const u = await db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [process.argv[2].toLowerCase()]);
  const uid = u.rows[0].id;
  const apply = process.argv.includes('--apply');

  const rows = await db.query<{ job_id: string; company: string; receipt: string }>(
    "SELECT a.job_id, j.company, a.receipt FROM autopilot_runs a JOIN jobs j ON j.id=a.job_id WHERE a.user_id=$1 AND a.state='SUBMITTED'", [uid]);

  for (const r of rows.rows) {
    const rec = JSON.parse(r.receipt) as { mode?: string; confirmation?: { reference: string; evidence?: string[] } };
    const ev = rec.confirmation?.evidence ?? [];
    const ref = rec.confirmation?.reference ?? '';
    const employerRef = !/^(greenhouse|lever|ashby|generic)-[a-z0-9]+$/i.test(ref);
    /* An accepted application POST is independent of the page's wording and
       still stands; a text match alone no longer does. */
    const hardEvidence = ev.some((e) => /POST was accepted|application reference|confirmation URL/i.test(e)) || employerRef;

    if (hardEvidence) { process.stdout.write(`  stands   ${r.company}\n`); continue; }

    const why = 'Recorded as submitted on a page-text match that has since been found unreliable: the phrase it matched also appears in ordinary privacy wording. A saved screenshot showed the form still on screen. Treat this as not sent, and re-apply.';
    process.stdout.write(`  WALK BACK ${r.company} — evidence was only: ${ev.join('; ') || '(none)'}\n`);
    if (apply) {
      const fixed = { ...rec, mode: 'UNCONFIRMED' } as Record<string, unknown>;
      const res = await advance(uid, r.job_id, 'SUBMISSION_UNCONFIRMED', { blockedReason: why, receipt: fixed });
      await db.query("UPDATE job_applications SET state='NEEDS_USER_INPUT', updated_at=$1 WHERE user_id=$2 AND job_id=$3 AND state='APPLIED'", [Date.now(), uid, r.job_id]);
      process.stdout.write(`            ${res.ok ? 'moved to SUBMISSION_UNCONFIRMED' : res.reason}\n`);
    }
  }
  process.stdout.write(`\n${apply ? 'corrected' : 'dry run — pass --apply'}\n`);
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
