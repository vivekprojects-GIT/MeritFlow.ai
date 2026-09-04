import { getDb } from '../src/lib/db';

async function main(): Promise<void> {
  process.stdout.write('connecting…\n');
  const db = await getDb();
  process.stdout.write('connected\n');
  const r = await db.query<{ n: string }>('SELECT count(*)::text AS n FROM users');
  process.stdout.write(`users: ${r.rows[0]?.n}\n`);
  process.exit(0);
}

void main().catch((e: unknown) => {
  process.stderr.write(`FAILED: ${e instanceof Error ? e.stack ?? e.message : String(e)}\n`);
  process.exit(1);
});
