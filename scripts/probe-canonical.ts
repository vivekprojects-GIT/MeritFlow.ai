import { loadEnv } from './env';
loadEnv();
import { listJobs } from '../src/lib/jobs-store';
import { canonicalUrl } from '../src/lib/autopilot/canonical-url';
async function main(): Promise<void> {
  const ids = new Set(process.argv.slice(2));
  for (const j of await listJobs(3000)) {
    if (!ids.has(j.id)) continue;
    const c = await canonicalUrl(j);
    process.stdout.write(`company="${j.company}"\n  from: ${j.url}\n  to:   ${c}\n  ${c === j.url ? 'UNCHANGED' : 'resolved'}\n\n`);
  }
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
