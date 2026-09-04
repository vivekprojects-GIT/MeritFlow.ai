import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';
import { candidateReadiness } from '../src/lib/autopilot/candidate-readiness';

async function main(): Promise<void> {
  const db = await getDb();
  const u = await db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [process.argv[2].toLowerCase()]);
  const r = await candidateReadiness(u.rows[0].id);

  process.stdout.write(`readiness ${r.percent}%  ready=${r.ready}\n`);
  process.stdout.write(`verified ${r.counts.verified} · confirm ${r.counts.needsReview} · missing ${r.counts.missing} · blocking-missing ${r.counts.blockingMissing}\n\n`);

  for (const f of r.facts.filter((x) => x.status !== 'VERIFIED')) {
    process.stdout.write(`  ${f.status.padEnd(13)} ${f.importance.padEnd(9)} ${f.label.padEnd(30)} ${f.value ?? ''}\n`);
  }
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
