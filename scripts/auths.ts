import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';
import { listAuthorizations } from '../src/lib/autopilot/authorization';
async function main(): Promise<void> {
  const db = await getDb();
  const u = await db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [process.argv[2].toLowerCase()]);
  for (const a of await listAuthorizations(u.rows[0].id)) {
    process.stdout.write(`${a.id}  ${a.type.padEnd(12)} scope=${a.scope.padEnd(4)} auto=${a.allowedForAutoSubmit} revoked=${a.revokedAt ?? '-'}\n`);
  }
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
