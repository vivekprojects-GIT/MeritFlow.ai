import { loadEnv } from './env';
loadEnv();
import { listJobs } from '../src/lib/jobs-store';
async function main(): Promise<void> {
  const pat = new RegExp(process.argv.slice(2).join('|'), 'i');
  for (const j of await listJobs(4000)) {
    if (!/lever\.co|ashbyhq/.test(j.url)) continue;
    if (!pat.test(j.title)) continue;
    process.stdout.write(`${j.id}  ${j.company.slice(0,20).padEnd(22)} ${j.title.slice(0,46)}\n`);
  }
  process.exit(0);
}
void main();
