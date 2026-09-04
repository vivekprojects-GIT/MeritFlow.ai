import { loadEnv } from './env';
loadEnv();
import { readConfirmation } from '../src/lib/autopilot/navigator/plan';
const samples: [string, string][] = [
  ['Figma job page text', 'Autofill my application. Apply for this job. We will consider your application in accordance with our policy. Submit application'],
  ['plain form page', 'Submit your application below. Resume/CV Attach'],
  ['real confirmation', 'Thanks for applying! Your application has been received.'],
  ['policy sentence', 'Figma will process your application in line with the Candidate Privacy Notice.'],
  ['Ashby contraction', 'Thanks for applying! We will be in touch.'],
  ['plain statement', 'Application submitted'],
  ['bare word near in', 'Submit application in the form below'],
];
for (const [label, text] of samples) {
  const r = readConfirmation(text);
  process.stdout.write(`${r ? 'CONFIRMED' : 'no       '}  ${label}\n`);
}
process.exit(0);
