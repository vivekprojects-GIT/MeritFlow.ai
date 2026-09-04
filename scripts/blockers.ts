import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';
import { classifyQuestion } from '../src/lib/autopilot/question-class';

/** Every question that has ever stopped an application, grouped by cause. */
async function main(): Promise<void> {
  const db = await getDb();
  const rows = await db.query<{ receipt: string; company: string }>(
    `SELECT r.receipt, j.company FROM autopilot_runs r JOIN jobs j ON j.id = r.job_id
      WHERE r.receipt <> '' AND r.receipt <> '{}'`,
  );

  const byClass = new Map<string, number>();
  const questions = new Map<string, { n: number; cls: string; rule: string }>();
  let applications = 0;
  let clean = 0;

  for (const row of rows.rows) {
    let receipt: { unresolved?: { question: string }[] };
    try {
      receipt = JSON.parse(String(row.receipt));
    } catch {
      continue;
    }
    const unresolved = receipt.unresolved ?? [];
    applications += 1;
    if (unresolved.length === 0) clean += 1;

    for (const u of unresolved) {
      const q = (u.question ?? '').replace(/\s+/g, ' ').trim();
      if (!q) continue;
      const c = classifyQuestion(q);
      byClass.set(c.kind, (byClass.get(c.kind) ?? 0) + 1);
      const key = q.slice(0, 90);
      const prev = questions.get(key);
      questions.set(key, { n: (prev?.n ?? 0) + 1, cls: c.kind, rule: c.rule });
    }
  }

  process.stdout.write(`applications prepared: ${applications}\n`);
  process.stdout.write(`with zero unresolved:  ${clean}\n\n`);
  process.stdout.write('blockers by class:\n');
  for (const [k, n] of [...byClass].sort((a, b) => b[1] - a[1])) {
    process.stdout.write(`  ${k.padEnd(22)} ${n}\n`);
  }
  process.stdout.write('\nmost frequent questions:\n');
  for (const [q, v] of [...questions].sort((a, b) => b[1].n - a[1].n).slice(0, 18)) {
    process.stdout.write(`  ${String(v.n).padStart(2)}x [${v.cls}] ${q}\n`);
  }
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
