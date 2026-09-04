import { loadEnv } from './env';
loadEnv();
import { listJobs } from '../src/lib/jobs-store';
async function main(): Promise<void> {
  const jobs = await listJobs(3000);
  const now = Date.now();
  const H = 3_600_000;
  const bands = [24, 72, 168, 336, 504, 720, 1e9];
  const labels = ['<24h', '1-3d', '3-7d', '1-2w', '2-3w', '3-4w', '>30d'];
  const counts = new Array(bands.length).fill(0);
  for (const j of jobs) {
    const at = j.postedAt || j.detectedAt || 0;
    const age = at ? (now - at) / H : 1e9;
    counts[bands.findIndex((b) => age <= b)] += 1;
  }
  for (let i = 0; i < labels.length; i += 1) process.stdout.write(`  ${labels[i].padEnd(6)} ${counts[i]}\n`);
  process.exit(0);
}
void main();
