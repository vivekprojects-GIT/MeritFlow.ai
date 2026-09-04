/**
 * The candidate's readiness, as data.
 *
 *     npm run readiness -- you@example.com
 *
 * Safe to run while the dev server is up.
 */
import { readinessReport } from '../src/lib/autopilot/readiness-report';
import { getDb } from '../src/lib/db';

async function main(): Promise<void> {
  const email = (process.argv[2] ?? '').trim().toLowerCase();
  if (!email) {
    process.stderr.write('Usage: npm run readiness -- <email>\n');
    process.exit(1);
  }

  const db = await getDb();
  const res = await db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [email]);
  const userId = res.rows[0]?.id;
  if (!userId) {
    process.stderr.write(`No account for ${email}\n`);
    process.exit(1);
  }

  process.stdout.write(`${JSON.stringify(await readinessReport(userId), null, 2)}\n`);
  process.exit(0);
}

void main().catch((e: unknown) => {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
