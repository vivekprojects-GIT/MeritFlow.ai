/** One-off: what derivation makes of the two questions that blocked a run. */
import { derive, factsFrom } from '../src/lib/autopilot/derive';
import { getVault } from '../src/lib/autopilot/answer-vault';
import { activeResume } from '../src/lib/jobs/documents';
import { getDb } from '../src/lib/db';

async function main(): Promise<void> {
  const db = await getDb();
  const u = await db.query<{ id: string }>("SELECT id FROM users WHERE email = $1", ['audit.bot@meritflow.test']);
  const userId = u.rows[0]?.id;
  if (!userId) throw new Error('no such account');

  const facts = factsFrom(await getVault(userId), await activeResume(userId));
  process.stdout.write(`facts: ${JSON.stringify(facts)}\n\n`);

  for (const q of [
    'Are you currently located in Canada?',
    'Have you previously worked at or consulted for GitLab?',
    'How many years of experience do you have with Kubernetes?',
  ]) {
    const d = derive(q, facts);
    process.stdout.write(`${q}\n  -> ${d ? `${d.value}  [${d.rule}]  ${d.basis}` : 'declined — goes to the candidate'}\n\n`);
  }
  process.exit(0);
}

void main().catch((e: unknown) => {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
