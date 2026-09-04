import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';
async function main(): Promise<void> {
  const db = await getDb();
  const u = await db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [process.argv[2].toLowerCase()]);
  const r = await db.query<{ company: string; title: string; state: string; receipt: string | null; blocked_reason: string | null }>(
    `SELECT j.company, j.title, a.state, a.receipt, a.blocked_reason
       FROM autopilot_runs a JOIN jobs j ON j.id = a.job_id
      WHERE a.user_id = $1 ORDER BY a.updated_at DESC LIMIT $2`,
    [u.rows[0].id, Number(process.argv[3] ?? 2)],
  );
  for (const row of r.rows) {
    process.stdout.write(`\n=== ${row.company} — ${row.title} [${row.state}]\n${row.blocked_reason ?? ''}\n`);
    if (!row.receipt) continue;
    const rec = JSON.parse(row.receipt) as { tailoring?: { fitBefore: number; fitAfter: number; usedOriginal?: boolean }; fields?: { field?: string; label?: string; value: string; source: string }[]; unresolved?: { question: string; required: boolean; reason: string; kind?: string }[] };
    if (rec.tailoring) process.stdout.write(`   FIT     base ${rec.tailoring.fitBefore} -> tailored ${rec.tailoring.fitAfter}${rec.tailoring.usedOriginal ? '  (kept original)' : ''}
`);
    for (const f of rec.fields ?? []) process.stdout.write(`   FILLED  ${String(f.label ?? "").slice(0, 44).padEnd(46)} ${String(f.value).slice(0, 34)}\n`);
    for (const x of rec.unresolved ?? []) process.stdout.write(`   OPEN    ${x.question.slice(0, 44).padEnd(46)} req=${x.required} kind=${x.kind ?? '?'} :: ${x.reason}\n`);
  }
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
