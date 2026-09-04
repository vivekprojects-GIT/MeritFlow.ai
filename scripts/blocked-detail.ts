import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';
import { classifyQuestion } from '../src/lib/autopilot/question-class';

async function main(): Promise<void> {
  const db = await getDb();
  const rows = await db.query<{ receipt: string; company: string }>(
    `SELECT r.receipt, j.company FROM autopilot_runs r JOIN jobs j ON j.id = r.job_id
      WHERE r.receipt <> '' AND r.receipt <> '{}' AND j.company IN ('Reddit','Figma')`,
  );
  const seen = new Set<string>();
  for (const row of rows.rows) {
    let rec: { unresolved?: { question: string; reason: string }[] };
    try { rec = JSON.parse(String(row.receipt)); } catch { continue; }
    for (const u of rec.unresolved ?? []) {
      const q = (u.question ?? '').replace(/\s+/g, ' ').trim();
      if (!q || seen.has(q)) continue;
      seen.add(q);
      const c = classifyQuestion(q);
      process.stdout.write(`[${c.kind}/${c.rule}] ${row.company}\n  Q: ${q.slice(0, 170)}\n  why: ${u.reason}\n\n`);
    }
  }
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
