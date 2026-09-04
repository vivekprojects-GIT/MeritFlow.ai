import { loadEnv } from './env';
loadEnv();
import { listJobs } from '../src/lib/jobs-store';
async function main(): Promise<void> {
  const ids = new Set(process.argv.slice(2));
  for (const j of await listJobs(4000)) if (ids.has(j.id)) process.stdout.write(`${j.id}  loc="${j.location}"  ${j.title.slice(0,50)}\n`);
  process.exit(0);
}
void main();
