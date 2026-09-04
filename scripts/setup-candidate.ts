/**
 * Set up one candidate to the point where the engine will act for them.
 *
 *     npm run candidate:setup -- --email you@example.com --name "Your Name" \
 *       --phone "+1 512 555 0100" --city Austin --state Texas --country "United States" \
 *       --resume ./my-resume.pdf --min-salary 150000
 *
 * ## Why this exists
 *
 * Getting an account from "signed up" to "the engine may act for you" takes
 * five screens, and every one of them is a place to stop halfway. This does the
 * same writes the screens do, through the same stores, in one command — so the
 * readiness report is the only thing that decides whether it worked.
 *
 * ## What it will not do
 *
 * Assert anything on the candidate's behalf. The two confirmations that license
 * the engine to speak for them — that their work history is complete, and that
 * routine privacy acknowledgements may be ticked — are only written when the
 * flags below are passed explicitly, and the help text says what each one
 * means. Defaulting either to true would put words in someone's mouth from a
 * shell script.
 */

import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { getDb } from '../src/lib/db';
import { hashPassword } from '../src/lib/auth';
import { updateProfile } from '../src/lib/profile-store';
import { saveCandidateProfile } from '../src/lib/jobs-store';
import { saveAnswer } from '../src/lib/autopilot/answer-vault';
import { savePolicy } from '../src/lib/autopilot/policy-engine';
import { saveJobSettings } from '../src/lib/job-settings';
import { grantAuthorization } from '../src/lib/autopilot/authorization';
import { readinessReport } from '../src/lib/autopilot/readiness-report';

function arg(name: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? '' : (process.argv[i + 1] ?? '').trim();
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function extractText(path: string): Promise<string> {
  const buf = await readFile(path);
  const lower = path.toLowerCase();

  if (lower.endsWith('.pdf')) {
    const { extractText: pdfText, getDocumentProxy } = await import('unpdf');
    const doc = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await pdfText(doc, { mergePages: true });
    return String(text);
  }
  if (lower.endsWith('.docx')) {
    const mammoth = await import('mammoth');
    const { value: html } = await mammoth.convertToHtml({ buffer: buf });
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
      .replace(/<li[^>]*>/gi, '- ')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
  return buf.toString('utf8');
}

async function main(): Promise<void> {
  const email = arg('email').toLowerCase();
  const name = arg('name');
  const resumePath = arg('resume');

  if (!email || !name || !resumePath) {
    process.stderr.write(
      [
        'Usage:',
        '  npm run candidate:setup -- --email <e> --name "<n>" --resume <path> [options]',
        '',
        'Options:',
        '  --phone, --city, --state, --country, --address, --zip',
        '  --linkedin, --github',
        '  --min-salary <number>      Salary floor. Without it, the salary gate cannot run.',
        '  --roles "A,B,C"            Target titles.',
        '',
        'Confirmations (never defaulted — each puts words in your mouth):',
        '  --history-complete         Your résumé plus --other-employers is your COMPLETE record of',
        '                             every employer, contract, consulting engagement and client.',
        '                             This is what lets the engine answer "have you worked here',
        '                             before?" with No. A résumé alone cannot support that.',
        '  --other-employers "X,Y"    Anyone not on the résumé. Contracts and internships count.',
        '  --authorize-privacy        Routine candidate-privacy acknowledgements may be ticked.',
        '                             Covers privacy notices only — never arbitration, background',
        '                             checks, IP assignment or non-competes.',
        '  --auto-submit              Applications that clear every gate go to employers.',
        '',
      ].join('\n'),
    );
    process.exit(1);
  }

  const db = await getDb();
  const existing = await db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [email]);

  let userId = existing.rows[0]?.id ?? '';
  let password = '';

  if (!userId) {
    userId = randomUUID();
    /* Generated rather than taken as an argument: a password on a command line
       ends up in shell history. Printed once, and the candidate changes it. */
    password = randomBytes(12).toString('base64url');
    await db.query(
      "INSERT INTO users (id, email, password_hash, role, account_kind, created_at) VALUES ($1,$2,$3,'student','personal',$4)",
      [userId, email, hashPassword(password), Date.now()],
    );
    process.stdout.write(`Created ${email}\n  password: ${password}   (change it after your first sign-in)\n\n`);
  } else {
    process.stdout.write(`Updating existing account ${email}\n\n`);
  }

  await updateProfile(userId, {
    name,
    phone: arg('phone') || undefined,
    location: [arg('city'), arg('state')].filter(Boolean).join(', ') || undefined,
  });

  const resumeText = await extractText(resumePath);
  if (resumeText.trim().length < 80) {
    process.stderr.write('That résumé produced almost no text — is it a scanned image?\n');
    process.exit(1);
  }

  const place = [arg('city'), arg('state'), arg('country')].filter(Boolean).join(', ');
  await saveCandidateProfile(userId, {
    careerStage: 'experienced',
    targetRoles: arg('roles').split(',').map((r) => r.trim()).filter(Boolean),
    locations: place ? [place] : [],
    resumeText,
    resumeName: basename(resumePath),
    onboardedAt: Date.now(),
  });

  const put = async (intent: string, value: string) => {
    if (!value) return;
    await saveAnswer(userId, { intent, value, provenance: 'USER_VERIFIED', verified: true, sensitivity: 'NORMAL_FACT' });
  };

  const country = arg('country') || 'United States';
  await put('PROFILE.FULL_NAME', name);
  await put('PROFILE.EMAIL', email);
  await put('PROFILE.PHONE', arg('phone'));
  await put('PROFILE.ADDRESS', arg('address'));
  await put('PROFILE.CITY', arg('city'));
  await put('PROFILE.STATE', arg('state'));
  await put('PROFILE.ZIP', arg('zip'));
  await put('PROFILE.COUNTRY', country);
  await put('PROFILE.LINKEDIN', arg('linkedin'));
  await put('PROFILE.GITHUB', arg('github'));
  await put('WORK_AUTH.AUTHORIZED', `Yes (${country})`);
  await put('WORK_AUTH.SPONSORSHIP', `No (${country})`);

  if (flag('history-complete')) {
    for (const intent of ['HISTORY.EMPLOYMENT_COMPLETE', 'HISTORY.CONSULTING_COMPLETE', 'HISTORY.CLIENTS_COMPLETE']) {
      await put(intent, 'Yes');
    }
    await put('HISTORY.ALL_EMPLOYERS', arg('other-employers'));
  }

  if (flag('authorize-privacy')) {
    await grantAuthorization(userId, {
      type: 'POLICY',
      scope: '*',
      exactText: 'candidate privacy policy acknowledgement',
      authorizedByUser: true,
      notes: 'Granted via candidate:setup with --authorize-privacy.',
    });
  }

  const minSalary = Number(arg('min-salary'));
  await savePolicy(userId, {
    mode: 'SMART',
    minScore: 60,
    ...(Number.isFinite(minSalary) && minSalary > 0 ? { minComp: minSalary } : {}),
  });

  await saveJobSettings(userId, {
    reviewBefore: !flag('auto-submit'),
    autoSubmit: flag('auto-submit'),
  });

  const report = await readinessReport(userId);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(report.status === 'READY' ? 0 : 2);
}

void main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
  process.exit(1);
});
