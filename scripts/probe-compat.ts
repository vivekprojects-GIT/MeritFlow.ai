import { loadEnv } from './env';
loadEnv();
import { checkCompatibility } from '../src/lib/autopilot/intent-compat';
import { classifyQuestion } from '../src/lib/autopilot/question-class';
const cases: [string, string, string][] = [
  ['LinkedIn', 'PROFILE.LINKEDIN', 'text'],
  ['LinkedIn Profile', 'PROFILE.LINKEDIN', 'url'],
  ['Current Work Status', 'WORK_AUTH.AUTHORIZED', 'select'],
  ['Full name', 'PROFILE.FULL_NAME', 'text'],
  ['Website', 'PROFILE.WEBSITE', 'url'],
];
for (const [q, intent, kind] of cases) {
  const c = checkCompatibility(q, intent, kind as never);
  const cl = classifyQuestion(q, kind as never);
  process.stdout.write(`${q.padEnd(22)} ${intent.padEnd(20)} compat=${String(c.ok).padEnd(6)}${c.ok ? '' : c.reason} | class=${cl.kind}\n`);
}
process.exit(0);
