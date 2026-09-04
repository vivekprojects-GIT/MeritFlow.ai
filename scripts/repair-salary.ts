import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';
import { minCompFromDescription } from '../src/lib/jobs-ingest';

/**
 * Re-read every stored salary from the posting it came from.
 *
 * The old reader took any number in the description and kept the smallest, so
 * rows carry figures their text never stated. Re-parsing with the pay-clause
 * reader either confirms the number or clears it — and a cleared salary is
 * "unknown", which the gate lets through.
 */
async function main(): Promise<void> {
  const db = await getDb();
  const apply = process.argv.includes('--apply');
  const rows = await db.query<{ id: string; company: string; title: string; description: string; min_comp: number | null }>(
    "SELECT id, company, title, description, min_comp FROM jobs WHERE status = 'open'");

  let cleared = 0, changed = 0, kept = 0;
  const examples: string[] = [];

  for (const j of rows.rows) {
    const fresh = minCompFromDescription(j.description);
    const old = j.min_comp;
    if (fresh === old) { kept += 1; continue; }
    if (fresh === null) {
      cleared += 1;
      if (examples.length < 6) examples.push(`  ${j.company} — ${j.title.slice(0, 40)}: $${old?.toLocaleString()} -> unstated`);
    } else {
      changed += 1;
      if (examples.length < 6) examples.push(`  ${j.company} — ${j.title.slice(0, 40)}: $${old?.toLocaleString()} -> $${fresh.toLocaleString()}`);
    }
    if (apply) await db.query('UPDATE jobs SET min_comp = $1 WHERE id = $2', [fresh, j.id]);
  }

  process.stdout.write(`${rows.rows.length} open jobs\n  unchanged ${kept}\n  cleared to unstated ${cleared}\n  corrected to a stated figure ${changed}\n\n`);
  for (const e of examples) process.stdout.write(e + '\n');
  process.stdout.write(`\n${apply ? 'written' : 'dry run — pass --apply'}\n`);
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
