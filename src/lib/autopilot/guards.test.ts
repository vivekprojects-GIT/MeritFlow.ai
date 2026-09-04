process.env.SQLITE_PATH = './test-guards.db';

import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

/**
 * The two promises an unattended run makes.
 *
 * Both are the kind of thing that is obviously true until it is not. A double
 * submission already happened once here — `advance` refused the illegal
 * transition, returned `ok: false`, and the caller never read it, so the run
 * sailed past every rejected state change and reached the submit branch a
 * second time. The guard that fixed it had no test until now.
 */

const stale = Date.now() - 5 * 24 * 3600_000;
const fresh = Date.now() - 2 * 3600_000;

let userId = '';

beforeAll(async () => {
  const { getDb } = await import('../db');
  const db = await getDb();

  userId = randomUUID();
  await db.query(
    "INSERT INTO users (id,email,password_hash,role,created_at) VALUES ($1,$2,'x','student',$3)",
    [userId, `${userId}@example.test`, Date.now()],
  );

  const { saveCandidateProfile } = await import('../jobs-store');
  await saveCandidateProfile(userId, {
    careerStage: 'experienced',
    targetRoles: ['Platform Engineer'],
    skills: ['Kubernetes', 'Terraform', 'AWS', 'Go'],
    resumeText: 'Platform engineer. Kubernetes, Terraform, AWS, Go. Built infrastructure at scale.',
    onboardedAt: Date.now(),
  });

  const { savePolicy } = await import('./policy-engine');
  await savePolicy(userId, { mode: 'SMART', minScore: 0 });
});

describe('never the same posting twice', () => {
  it('refuses a second run once the employer already has one', async () => {
    const { upsertJob, listJobs } = await import('../jobs-store');
    const url = `https://jobs.example.test/${randomUUID()}`;

    await upsertJob({
      company: 'Northwind',
      title: 'Platform Engineer',
      location: 'Remote',
      remote: true,
      track: 'full_time',
      description: 'Kubernetes Terraform AWS Go',
      skills: ['Kubernetes'],
      minComp: null,
      url,
      postedAt: fresh,
      companyBlurb: '',
      seniority: '',
      yearsExp: '',
      employment: '',
      workMode: '',
      applicants: null,
    });

    const job = (await listJobs(500)).find((j) => j.url === url)!;
    expect(job).toBeTruthy();

    /* Put the run where a completed application leaves it. */
    const { ensureRun, advance } = await import('./state-machine');
    await ensureRun(userId, job.id);
    /* The real path, in order. `advance` refuses an illegal transition by
       returning `ok: false`, so a shortcut here would leave the run parked
       mid-chain and quietly test nothing. */
    const path = [
      'QUALIFIED', 'MATCHED', 'PREPARING', 'RESUME_READY', 'ANSWERS_READY',
      'VERIFIED', 'QUEUED', 'FILLING', 'VALIDATED', 'SUBMITTING', 'SUBMITTED',
    ] as const;
    for (const state of path) {
      const moved = await advance(userId, job.id, state);
      expect(moved.ok, `could not advance to ${state}`).toBe(true);
    }

    const { runDryRun } = await import('./workflow');
    const again = await runDryRun(userId, job);

    expect(again.reason).toMatch(/already applied/i);
    /* The state is untouched and nothing new was prepared — a guard that
       "stops" by producing a fresh receipt has still done the work. */
    expect(again.finalState).toBe('SUBMITTED');
    expect(again.receipt).toBeNull();
  });
});

describe('unattended runs only touch fresh postings', () => {
  it('leaves a posting older than the window alone', async () => {
    const { upsertJob, listJobs } = await import('../jobs-store');

    const oldUrl = `https://jobs.example.test/old-${randomUUID()}`;
    const base = {
      company: 'Contoso',
      title: 'Platform Engineer',
      location: 'Remote',
      remote: true,
      track: 'full_time' as const,
      description: 'Kubernetes Terraform AWS Go',
      skills: ['Kubernetes'],
      minComp: null,
      companyBlurb: '',
      seniority: '',
      yearsExp: '',
      employment: '',
      workMode: '',
      applicants: null,
    };

    await upsertJob({ ...base, url: oldUrl, postedAt: stale });
    const old = (await listJobs(500)).find((j) => j.url === oldUrl)!;
    expect(old).toBeTruthy();

    const { runAutopilot } = await import('./runner');
    const outcome = await runAutopilot(userId, { jobIds: undefined, maxAgeHours: 24, limit: 5 });

    /* It may legitimately find nothing to do; what it must never do is reach
       for a posting that is five days old. */
    expect(outcome.results.some((r) => r.jobId === old.id)).toBe(false);
  });

  it('does not restrict a run the candidate started by hand', async () => {
    /*
     * The window belongs to autonomous mode, not to the engine. Someone
     * working through their own backlog has decided the age is acceptable, and
     * silently dropping those jobs would look like the button doing nothing.
     */
    const { runAutopilot } = await import('./runner');
    const outcome = await runAutopilot(userId, { limit: 0 });
    expect(outcome.stoppedBecause).not.toMatch(/last 24 hours/i);
  });
});
