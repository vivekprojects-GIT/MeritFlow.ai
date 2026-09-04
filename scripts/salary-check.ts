import { loadEnv } from './env';
loadEnv();
import { listJobs } from '../src/lib/jobs-store';
async function main(): Promise<void> {
  const ids = new Set(process.argv.slice(2));
  for (const j of await listJobs(3000)) {
    if (!ids.has(j.id)) continue;
    process.stdout.write(`\n${j.company} — ${j.title}\n  stored minComp: ${j.minComp}\n`);
    const money = j.description.match(/.{0,90}\$[\d,]{3,}.{0,90}/g) ?? [];
    process.stdout.write(`  salary mentions in the description (${money.length}):\n`);
    for (const m of money.slice(0, 6)) process.stdout.write(`    ...${m.replace(/\s+/g, ' ').trim()}...\n`);
  }
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
