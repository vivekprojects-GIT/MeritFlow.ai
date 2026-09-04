import { getDb, dataDir } from '../src/lib/db';

async function main(): Promise<void> {
  process.stdout.write(`database file: ${dataDir()}\n`);
  const db = await getDb();
  for (const t of ['users', 'candidate_profiles', 'answer_vault', 'documents', 'jobs', 'companies', 'autopilot_runs']) {
    const r = await db.query<{ n: number }>(`SELECT count(*) AS n FROM ${t}`);
    process.stdout.write(`  ${t.padEnd(20)} ${Number(r.rows[0]?.n ?? 0)}\n`);
  }
  const u = await db.query<{ email: string; created_at: number }>('SELECT email, created_at FROM users');
  for (const row of u.rows) {
    process.stdout.write(`  user: ${row.email}  ${new Date(Number(row.created_at)).toISOString()}\n`);
  }
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
