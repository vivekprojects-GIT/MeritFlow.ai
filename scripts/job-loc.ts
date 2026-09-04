import { loadEnv } from './env';
loadEnv();
import { listJobs } from '../src/lib/jobs-store';
async function main(): Promise<void> {
  for (const j of await listJobs(4000)) {
    if (/mistral|^cohere$/i.test(j.company)) process.stdout.write(`${j.company.padEnd(12)} loc="${j.location}"  ${j.title.slice(0,44)}\n`);
  }
  process.exit(0);
}
void main();
