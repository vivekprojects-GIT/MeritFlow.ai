/**
 * How many of an imported list resolve to a board we can actually collect from.
 *
 * Worth measuring before committing the scheduler to days of identification: if
 * the hit rate is two percent, the list is the wrong list and patience does not
 * fix that. A sample, because the point is the ratio, not the coverage.
 */
import { detectPending, registryStats } from '../src/lib/discovery/registry';

const SAMPLE = Number(process.argv[2] ?? 40);

async function main(): Promise<void> {
  const before = await registryStats();
  const started = Date.now();

  const result = await detectPending(SAMPLE);
  const seconds = Math.round((Date.now() - started) / 1000);
  const after = await registryStats();

  process.stdout.write(`Tried ${SAMPLE} companies in ${seconds}s\n`);
  process.stdout.write(`  found a collectable board : ${result.detected}\n`);
  process.stdout.write(`  nothing found             : ${result.unsupported}\n`);
  process.stdout.write(`  hit rate                  : ${Math.round((result.detected / SAMPLE) * 100)}%\n\n`);
  process.stdout.write(`collectable companies: ${before.collectable} -> ${after.collectable}\n`);
  process.exit(0);
}

void main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
