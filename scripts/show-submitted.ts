import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';
async function main(): Promise<void> {
  const db = await getDb();
  const u = await db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [process.argv[2].toLowerCase()]);
  const r = await db.query<{ company: string; title: string; url: string; receipt: string }>(
    `SELECT j.company, j.title, j.url, a.receipt FROM autopilot_runs a JOIN jobs j ON j.id = a.job_id
      WHERE a.user_id = $1 AND a.state = 'SUBMITTED'`, [u.rows[0].id]);
  for (const row of r.rows) {
    const rec = JSON.parse(row.receipt) as {
      mode: string; ats: string; preparedAt: number;
      confirmation?: { reference: string; capturedAt: number };
      resumeFileName?: string;
      tailoring?: { fitBefore: number; fitAfter: number; usedOriginal?: boolean };
      fields?: { field?: string; value: string; source: string }[];
      answers?: { question: string; value: string | null; provenance: string | null }[];
    };
    process.stdout.write(`${row.company} — ${row.title}\n${row.url}\n\n`);
    process.stdout.write(`  mode        ${rec.mode}\n  ats         ${rec.ats}\n`);
    process.stdout.write(`  reference   ${rec.confirmation?.reference ?? '(none)'}\n`);
    process.stdout.write(`  sent at     ${rec.confirmation ? new Date(rec.confirmation.capturedAt).toLocaleString() : '?'}\n`);
    process.stdout.write(`  resume      ${rec.resumeFileName ?? '(none)'}\n`);
    process.stdout.write(`  fit         ${rec.tailoring?.fitBefore} -> ${rec.tailoring?.fitAfter}${rec.tailoring?.usedOriginal ? ' (kept original)' : ''}\n\n`);
    process.stdout.write(`  fields filled: ${rec.fields?.length ?? 0}\n`);
    for (const f of rec.fields ?? []) process.stdout.write(`    ${String(f.field ?? '?').slice(0,28).padEnd(30)} ${String(f.value).slice(0,40)}  [${f.source}]\n`);
    process.stdout.write(`\n  answers: ${rec.answers?.length ?? 0}\n`);
    for (const a of rec.answers ?? []) process.stdout.write(`    ${a.question.slice(0,44).padEnd(46)} ${String(a.value ?? '—').slice(0,30)}  [${a.provenance ?? '—'}]\n`);
  }
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
