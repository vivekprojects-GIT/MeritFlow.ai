import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';
async function main(): Promise<void> {
  const db = await getDb();
  const u = await db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [process.argv[2].toLowerCase()]);
  const r = await db.query<{ kind: string; summary: string; detail: string; created_at: number }>(
    'SELECT kind, summary, detail, created_at FROM autopilot_events WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
    [u.rows[0].id, Number(process.argv[3] ?? 12)]);
  for (const e of r.rows) {
    process.stdout.write(`${new Date(e.created_at).toLocaleTimeString()}  ${e.kind.padEnd(22)} ${e.summary.slice(0, 96)}\n`);
    if (process.env.VERBOSE && e.detail) {
      try {
        const d = JSON.parse(e.detail) as { gate?: { code: string; passed: boolean; detail?: string }[] };
        for (const c of d.gate ?? []) if (!c.passed) process.stdout.write(`            FAILED ${c.code}: ${c.detail ?? ''}\n`);
      } catch { /* not json */ }
    }
  }
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
