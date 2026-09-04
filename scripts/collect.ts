import { loadEnv } from './env';
loadEnv();
import { collectOnce } from '../src/lib/discovery/collector';
import { registryStats } from '../src/lib/discovery/registry';

async function main(): Promise<void> {
  const rounds = Number(process.argv[2] ?? 3);
  for (let i = 0; i < rounds; i += 1) {
    /* `now` exists on collectOnce for exactly this: a far-future clock makes
       every company due, so a manual cycle is not blocked by a backoff meant
       to pace the scheduler. */
    const c = await collectOnce({
      scanBudget: 40,
      detectBudget: Number(process.env.DETECT ?? 4),
      now: process.argv.includes('--force') ? Date.now() + 400 * 86_400_000 : undefined,
    });
    process.stdout.write(
      `round ${i + 1}: scanned ${c.scanned} · stored ${c.stored} · detected ${c.detected} · unsupported ${c.unsupported} · failed ${c.failed}\n`,
    );
    if (c.scanned === 0 && c.detected === 0) break;
  }
  const s = await registryStats();
  process.stdout.write(`\nregistry ${s.companies} companies · ${s.collectable} collectable · short ${s.target.companiesShort}\n`);
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
