import { loadEnv } from './env';
loadEnv();
import { listJobs } from '../src/lib/jobs-store';
async function main(): Promise<void> {
  const want = process.argv[2];
  const jobs = await listJobs(3000);
  for (const j of jobs.filter((x) => new RegExp(want, 'i').test(x.company)).slice(0, 4)) {
    process.stdout.write(`${j.company} — ${j.title}\n  ${j.url}\n`);
  }
  process.exit(0);
}
void main();
