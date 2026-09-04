import { loadEnv } from './env';
loadEnv();
import { randomUUID } from 'node:crypto';
import { getDb } from '../src/lib/db';

/** Mint a local session for a local dev server. Never a password. */
async function main(): Promise<void> {
  const db = await getDb();
  const u = await db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [process.argv[2].toLowerCase()]);
  if (!u.rows[0]) throw new Error('no such account');
  const token = randomUUID();
  await db.query('INSERT INTO sessions (token, user_id, expires_at) VALUES ($1,$2,$3)', [
    token, u.rows[0].id, Date.now() + 6 * 3_600_000,
  ]);
  process.stdout.write(token + '\n');
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
