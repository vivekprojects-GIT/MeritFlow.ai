import { loadEnv } from './env';
loadEnv();
import { checkCompatibility } from '../src/lib/autopilot/intent-compat';
const q = 'Are you subject to any employment agreements and/or post-employment restrictions with your current employer or a past employer?';
process.stdout.write(JSON.stringify(checkCompatibility(q, 'HISTORY.CURRENT_EMPLOYER')) + '\n');
process.stdout.write('agreement match: ' + /\b(agreement|covenant)\b/i.test(q) + '\n');
process.exit(0);
