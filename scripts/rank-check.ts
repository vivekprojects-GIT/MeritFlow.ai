import { submitRank } from '../src/lib/autopilot/adapters/browser';
for (const l of ['Submit application','Submit Application','Submit','Submit my application','Apply','Apply now','Apply for this job','Send application','Finish and submit']) {
  process.stdout.write(`${String(submitRank(l)).padStart(4)}  ${l}\n`);
}
process.exit(0);
