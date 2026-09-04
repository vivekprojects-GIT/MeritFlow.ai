import { loadEnv } from './env';
loadEnv();
import { classifyQuestion } from '../src/lib/autopilot/question-class';
for (const q of process.argv.slice(2)) {
  const c = classifyQuestion(q, 'textarea' as never);
  process.stdout.write(`${c.kind.padEnd(12)} ${q.slice(0, 90)}\n`);
}
process.exit(0);
