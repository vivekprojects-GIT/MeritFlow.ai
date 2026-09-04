import { loadEnv } from './env';
loadEnv();
import { classifyQuestion } from '../src/lib/autopilot/question-class';
for (const q of [
  'Consent for contacting about future job openings',
  'I agree to receive marketing communications',
  'By selecting "I agree," I understand my information will be processed per the Candidate Privacy Policy.',
]) {
  const c = classifyQuestion(q, 'boolean' as never);
  process.stdout.write(`${c.kind.padEnd(22)} rule=${'rule' in c ? c.rule : '-'}  ${q.slice(0, 56)}\n`);
}
process.exit(0);
