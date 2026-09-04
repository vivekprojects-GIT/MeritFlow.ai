process.env.SQLITE_PATH = './test-e2e.db';
/* Opened for this file only. Every other suite, and the app by default, leaves
   this unset — which is exactly why the path behind it had never run. */
process.env.AUTOPILOT_SUBMIT_ENABLED = 'all';

import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Does an application actually get sent?
 *
 * Every other test here covers one gate. This drives the whole thing: a real
 * candidate row, a real job row, a real headless browser, a real form, and
 * `runDryRun` — the same function the batch endpoint calls — with the operator
 * allowlist open.
 *
 * It exists because "why is it not applying" is not answerable by reading the
 * code. There are eight independent conditions on the submit branch and each
 * one is a different sentence to the user; the only way to know which fires is
 * to run it.
 */

const FORM = `<!doctype html><title>Apply — Senior Data Engineer</title>
  <h1>Apply</h1>
  <form method="POST" action="/submitted" enctype="multipart/form-data">
    <label for="first_name">First name</label><input id="first_name" name="first_name" required>
    <label for="last_name">Last name</label><input id="last_name" name="last_name" required>
    <label for="email">Email</label><input id="email" name="email" type="email" required>
    <label for="phone">Phone</label><input id="phone" name="phone" required>
    <label for="resume">Resume</label><input id="resume" name="resume" type="file" required>
    <label for="work_auth">Are you legally authorized to work in the US?</label>
    <select id="work_auth" name="work_auth" required>
      <option value="">Choose</option><option>Yes</option><option>No</option>
    </select>
    <label for="sponsorship">Will you now or in the future require sponsorship?</label>
    <select id="sponsorship" name="sponsorship" required>
      <option value="">Choose</option><option>Yes</option><option>No</option>
    </select>
    <button type="submit">Submit application</button>
  </form>`;

const DONE = `<!doctype html><title>Received</title>
  <h1>Thank you for applying</h1>
  <p>Your application has been received. Confirmation number: E2E-70412</p>`;

let server: Server;
let origin = '';
let userId = '';
let jobId = '';

/** Set by the form handler, so the test can prove an employer really got it. */
let received: { length: number } | null = null;

const browserAvailable = await (async () => {
  try {
    const { chromium } = await import('playwright');
    const probe = await chromium.launch({ headless: true });
    await probe.close();
    return true;
  } catch {
    return false;
  }
})();

beforeAll(async () => {
  server = createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0];
    if (req.method === 'POST') {
      let bytes = 0;
      req.on('data', (c: Buffer) => (bytes += c.length));
      req.on('end', () => {
        /* The multipart body carries the résumé. Recording its size is how the
           test knows a file was actually attached rather than the field being
           counted as filled while empty — a failure this engine has had. */
        received = { length: bytes };
        res.writeHead(303, { Location: '/submitted' });
        res.end();
      });
      return;
    }
    const body = path === '/submitted' ? DONE : FORM;
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(body);
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  origin = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;

  const { getDb } = await import('../db');
  const db = await getDb();
  const now = Date.now();
  userId = `e2e-${randomUUID()}`;
  jobId = `job-${randomUUID()}`;
  /* Unique per run. `jobs` has a unique index on (company, norm_title,
     location), so a fixed name collides with the row a previous run left
     behind in the same data directory. */
  const company = `Acme Data ${jobId.slice(4, 12)}`;

  /* An account with everything an application needs. Missing any one of these
     is its own stop, each with its own message — see readiness.ts. */
  await db.query(
    `INSERT INTO users (id,email,password_hash,role,university_id,account_kind,created_at,name,phone,location)
     VALUES ($1,$2,'x','student',NULL,'personal',$3,$4,$5,$6)`,
    [userId, `${userId}@t.local`, now, 'Sai Vivek Katkuri', '+1 469 454 8320', 'Plano, TX'],
  );

  await db.query(
    `INSERT INTO jobs (id,company,title,norm_title,location,remote,track,description,skills,min_comp,url,source,posted_at,detected_at,last_seen_at,status)
     VALUES ($1,$2,$3,$4,$5,TRUE,'experienced',$6,$7,$8,$9,'e2e',$10,$10,$10,'open')`,
    [
      jobId,
      company,
      'Senior Data Engineer',
      `senior data engineer ${jobId.slice(4, 12)}`,
      'Remote',
      'Build and operate data platforms in Python and SQL.',
      JSON.stringify(['Python', 'SQL']),
      150_000,
      origin,
      now,
    ],
  );

  const { saveCandidateProfile } = await import('../jobs-store');
  await saveCandidateProfile(userId, {
    careerStage: 'experienced',
    targetRoles: ['Data Engineer'],
    locations: ['Remote'],
    skills: ['Python', 'SQL', 'Airflow'],
    minComp: 140_000,
    resumeText: [
      'SAI VIVEK KATKURI',
      'Senior Data Engineer',
      '',
      'PROFESSIONAL SUMMARY',
      'Data engineer with seven years building platforms in Python and SQL.',
      '',
      'SKILLS',
      'Programming Languages: Python, SQL, Airflow',
      '',
      'WORK EXPERIENCE',
      'Acme Corp | Senior Data Engineer | Remote | Jan 2022 - Present',
      '- Built ingestion pipelines in Python handling 2M events a day.',
      '- Tuned SQL batch jobs back inside their SLAs.',
    ].join('\n'),
    resumeName: 'resume.pdf',
  });

  const { savePolicy } = await import('./policy-engine');
  await savePolicy(userId, { mode: 'FULL', minScore: 0, maxPerDay: 50, maxPerCompany: 5 });

  const { saveJobSettings } = await import('../job-settings');
  await saveJobSettings(userId, { autoSubmit: true, reviewBefore: false });

  /* The answers an employer asks for. Stored as the candidate verified them,
     which is the only provenance cleared to speak unattended. */
  const { saveAnswer } = await import('./answer-vault');
  for (const [intent, value] of [
    ['WORK_AUTH.AUTHORIZED', 'Yes'],
    ['WORK_AUTH.SPONSORSHIP', 'No'],
  ] as const) {
    await saveAnswer(userId, { intent, value, provenance: 'USER_VERIFIED', verified: true, sensitivity: 'NORMAL_FACT' });
  }
}, 120_000);

afterAll(async () => {
  const { closeBrowser } = await import('./adapters/browser');
  await closeBrowser();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

/** The seeded posting, read back through the same path the app uses. */
async function loadJob() {
  const { listJobs } = await import('../jobs-store');
  return (await listJobs(500)).find((j) => j.id === jobId);
}

describe.runIf(browserAvailable)('an application, end to end', () => {
  it('fills a real form, submits it, and records the confirmation', async () => {
    const { runDryRun } = await import('./workflow');
    const job = await loadJob();
    expect(job).toBeDefined();

    const outcome = await runDryRun(userId, job!);

    /* Reported before the assertion so a failure names the gate that stopped
       it rather than only saying the state was wrong. */
    expect({ state: outcome.finalState, reason: outcome.reason }).toEqual({
      state: 'SUBMITTED',
      reason: expect.stringContaining('submitted'),
    });

    expect(outcome.receipt?.mode).toBe('SUBMITTED');
    expect(outcome.receipt?.confirmation?.reference).toBe('E2E-70412');
  }, 180_000);

  it('actually attached the résumé', () => {
    /* A form that reports success with an empty CV field is worse than one
       that fails: it burns the opening and tells the candidate it worked. */
    expect(received).not.toBeNull();
    expect(received!.length).toBeGreaterThan(500);
  });

  it('never sends the same application twice', async () => {
    const { runDryRun } = await import('./workflow');
    const before = received!.length;

    const again = await runDryRun(userId, (await loadJob())!);

    /* The guard is a return in runDryRun, not a transition: the failure it
       prevents is a caller that ignores transitions, which is exactly what
       happened here before it existed. */
    expect(again.reason).toContain('will not send a second application');
    expect(received!.length).toBe(before);
  }, 180_000);
});
