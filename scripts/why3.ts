import { canonicalize } from '../src/lib/autopilot/answer-vault';
import { classifyQuestion } from '../src/lib/autopilot/question-class';
for (const q of [
  'Please provide the name of your current (or most recent) company',
  'By selecting "I agree," I understand that the information I have provided as part of this job application will be processed in accordance with Reddit\'s Candidate Privacy Policy.',
  'Are you currently authorized to work in this country?',
]) {
  const c = canonicalize(q);
  process.stdout.write(`${q.slice(0, 72)}\n  intent: ${c ? c.intent : '(none)'}   class: ${classifyQuestion(q).kind} / ${classifyQuestion(q).rule}\n\n`);
}
process.exit(0);
