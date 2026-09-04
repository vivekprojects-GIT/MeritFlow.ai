import { loadEnv } from './env';
loadEnv();
import { listJobs } from '../src/lib/jobs-store';
async function main(): Promise<void> {
  const jobs = await listJobs(3000);
  const counts = new Map<string, number>();
  let noMention = 0, noMentionButPriced = 0;
  for (const j of jobs) {
    const k = j.minComp === null ? 'null' : String(j.minComp);
    counts.set(k, (counts.get(k) ?? 0) + 1);
    const has = /\$[\d,]{3,}/.test(j.description);
    if (!has) { noMention += 1; if (j.minComp !== null) noMentionButPriced += 1; }
  }
  process.stdout.write('most common minComp values:\n');
  for (const [k, v] of [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
    process.stdout.write(`  ${k.padEnd(10)} ${v}\n`);
  }
  process.stdout.write(`\njobs with no "$" figure in the description: ${noMention}\n`);
  process.stdout.write(`  of those, given a minComp anyway:        ${noMentionButPriced}\n`);
  process.exit(0);
}
void main();
