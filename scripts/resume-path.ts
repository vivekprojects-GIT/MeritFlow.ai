import { loadEnv } from './env';
loadEnv();
import { getDb } from '../src/lib/db';
import { getCandidateProfile } from '../src/lib/jobs-store';
import { renderResume } from '../src/lib/autopilot/tailor';
import { textToPdf } from '../src/lib/jobs/pdf';
import { writeFile, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

async function main(): Promise<void> {
  const db = await getDb();
  const u = await db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [process.argv[2].toLowerCase()]);
  const c = await getCandidateProfile(u.rows[0].id);
  if (!c?.resumeText) throw new Error('no résumé text on the profile');
  const dir = await mkdtemp(join(tmpdir(), 'meritflow-resume-'));
  const file = join(dir, 'Sai-Vivek-Katkuri-Resume.pdf');
  await writeFile(file, await textToPdf(c.resumeText));
  process.stdout.write(file + '\n');
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
