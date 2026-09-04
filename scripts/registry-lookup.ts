import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';
async function main(): Promise<void> {
  const db = await getDb();
  for (const name of process.argv.slice(2)) {
    const r = await db.query<{ name: string; ats_type: string; ats_identifier: string }>(
      "SELECT name, ats_type, ats_identifier FROM companies WHERE lower(name) LIKE lower($1) LIMIT 5",
      [`%${name}%`]);
    process.stdout.write(`\n"${name}":\n`);
    if (r.rows.length === 0) process.stdout.write('  (not in registry)\n');
    for (const c of r.rows) process.stdout.write(`  ${c.name.padEnd(22)} ats=${(c.ats_type||'-').padEnd(12)} token="${c.ats_identifier}"\n`);
  }
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
