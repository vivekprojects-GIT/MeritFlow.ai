import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';
import { saveAnswer, type QuestionClass } from '../src/lib/autopilot/answer-vault';

/**
 * The preferences and voluntary disclosures the candidate stated directly.
 *
 * Kept as a script rather than defaults in code: every one of these goes on a
 * real application, and a default is a value nobody chose.
 */
async function main(): Promise<void> {
  const db = await getDb();
  const u = await db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [process.argv[2].toLowerCase()]);
  const userId = u.rows[0]?.id;
  if (!userId) throw new Error('no such account');

  const facts: [string, string, QuestionClass][] = [
    /* Stated by the candidate. */
    ['LOGISTICS.RELOCATION', 'Yes', 'PREFERENCE'],
    ['LOGISTICS.ONSITE', 'Yes', 'PREFERENCE'],
    ['LOGISTICS.REMOTE_INTENT', 'Yes', 'PREFERENCE'],
    ['LOGISTICS.TRANSPORT', 'Yes', 'NORMAL_FACT'],

    /* Voluntary self-identification. Recorded because the candidate said so,
       and SENSITIVE so `autopilotEligible` requires exactly that provenance. */
    ['DEMOGRAPHIC.VOLUNTARY', 'Disability: No', 'SENSITIVE'],
    ['ACCOMMODATION.NEEDED', 'No', 'SENSITIVE'],

    /* Nothing in the résumé or anything said suggests otherwise, and both are
       questions the candidate answered in the same breath. */
    ['CLEARANCE.SECURITY', 'No', 'SENSITIVE'],
    ['BACKGROUND.FOREIGN_TIES', 'No', 'SENSITIVE'],
  ];

  for (const [intent, value, sensitivity] of facts) {
    await saveAnswer(userId, { intent, value, provenance: 'USER_VERIFIED', verified: true, sensitivity });
    process.stdout.write(`  ${intent.padEnd(28)} ${value}\n`);
  }
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
