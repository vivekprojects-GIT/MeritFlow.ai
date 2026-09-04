import { loadEnv } from './env';
loadEnv();
import { classifyQuestion } from '../src/lib/autopilot/question-class';
for (const q of process.argv.slice(2)) {
  const c = classifyQuestion(q, 'text' as never);
  process.stdout.write(`${c.kind.padEnd(22)} rule=${('rule' in c ? c.rule : '-').padEnd(16)} ${q.slice(0,70)}\n`);
}
process.exit(0);
