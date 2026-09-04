process.env.SQLITE_PATH = './test-auto.db';

import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { classify, summarise, OUTCOMES, type Outcome } from './autonomous';
import type { RunnerOutcome } from './runner';

/**
 * Autonomous mode.
 *
 * Two things matter here and neither is about applying to jobs. The first is
 * that a stopped application is classified into something the candidate can
 * act on — "missing information" and "the employer's terms forbid this" look
 * identical in the run state and mean opposite things. The second is that the
 * worker keeps going: one broken account, or one broken application, must not
 * stop the pipeline for everyone else.
 */

describe('classify', () => {
  it.each([
    ['SUBMITTED', 'Acme — application submitted. Reference X.', 'SUBMITTED'],
    ['NEEDS_USER_ACTION', 'This application shows a CAPTCHA, which only you can complete.', 'BLOCKED_EXTERNAL_SECURITY'],
    ['NEEDS_USER_ACTION', 'This application requires an account before it can be sent.', 'BLOCKED_ACCOUNT_REQUIRED'],
    ['NEEDS_USER_ACTION', 'This application wants a verification code that has not arrived yet.', 'WAITING_FOR_EMAIL'],
    ['NEEDS_USER_ACTION', '"Years of experience with Kubernetes" — no verified answer for this question yet.', 'BLOCKED_MISSING_FACT'],
    ['NEEDS_USER_ACTION', "Workday's site terms prohibit accessing the site with automated scripts.", 'UNSUPPORTED_DESTINATION'],
    ['DRY_RUN_COMPLETE', 'Acme — ready to send. Automatic submission is not enabled for greenhouse.', 'UNSUPPORTED_DESTINATION'],
    ['FAILED', 'The browser run failed.', 'FAILED'],
    ['SKIPPED', 'Below your minimum match score.', 'SKIPPED'],
  ])('%s / %s', (state, reason, expected) => {
    expect(classify(state, reason)).toBe(expected as Outcome);
  });

  it('separates the two stops that look the same and are not', () => {
    /* One the candidate fixes in thirty seconds; the other they can never fix.
       Counting both as "needs you" is what made the dashboard useless. */
    const fixable = classify('NEEDS_USER_ACTION', 'Missing from your profile.');
    const permanent = classify('NEEDS_USER_ACTION', 'Their terms prohibit automated access.');
    expect(fixable).toBe('BLOCKED_MISSING_FACT');
    expect(permanent).toBe('UNSUPPORTED_DESTINATION');
  });

  it('never invents an outcome outside the vocabulary', () => {
    expect(OUTCOMES).toContain(classify('NEEDS_USER_ACTION', 'something nobody has seen before'));
  });
});

describe('summarise', () => {
  it('counts a mixed batch the way the dashboard shows it', () => {
    const outcome: RunnerOutcome = {
      attempted: 5,
      submitted: 2,
      prepared: 0,
      awaitingApproval: 0,
      needsUser: 2,
      failed: 1,
      skipped: 0,
      stoppedBecause: '',
      results: [
        { jobId: '1', company: 'A', title: 't', state: 'SUBMITTED', reason: 'application submitted' },
        { jobId: '2', company: 'B', title: 't', state: 'SUBMITTED', reason: 'application submitted' },
        { jobId: '3', company: 'C', title: 't', state: 'NEEDS_USER_ACTION', reason: 'shows a CAPTCHA' },
        { jobId: '4', company: 'D', title: 't', state: 'NEEDS_USER_ACTION', reason: 'no verified answer for this question yet' },
        { jobId: '5', company: 'E', title: 't', state: 'FAILED', reason: 'the browser run failed' },
      ],
    };

    const s = summarise('u1', outcome);
    expect(s.counts.SUBMITTED).toBe(2);
    expect(s.counts.BLOCKED_EXTERNAL_SECURITY).toBe(1);
    expect(s.counts.BLOCKED_MISSING_FACT).toBe(1);
    expect(s.counts.FAILED).toBe(1);
    expect(s.attempted).toBe(5);
  });
});

/* ── Against a real database ─────────────────────────────────────────────── */

let onUser = '';
let offUser = '';

beforeAll(async () => {
  const { getDb } = await import('../db');
  const { saveJobSettings } = await import('../job-settings');
  const db = await getDb();

  for (const [id, autonomous] of [
    [(onUser = `auto-on-${randomUUID()}`), true],
    [(offUser = `auto-off-${randomUUID()}`), false],
  ] as [string, boolean][]) {
    await db.query(
      `INSERT INTO users (id,email,password_hash,role,university_id,account_kind,created_at)
       VALUES ($1,$2,'x','student',NULL,'personal',$3)`,
      [id, `${id}@t.local`, Date.now()],
    );
    await saveJobSettings(id, { autonomous });
  }
}, 120_000);

describe('dueAccounts', () => {
  it('returns accounts with autonomous mode on, and only those', async () => {
    const { dueAccounts } = await import('./autonomous');
    const due = await dueAccounts();
    expect(due).toContain(onUser);
    expect(due).not.toContain(offUser);
  });

  it('does not return an account that just ran', async () => {
    const { dueAccounts, tick } = await import('./autonomous');

    /* The tick stamps the run time before doing any work, so a cycle that
       throws does not leave the account immediately due again — otherwise the
       worker spends every poll retrying one broken account. */
    await tick(onUser, 0);
    expect(await dueAccounts()).not.toContain(onUser);
  }, 120_000);

  it('survives an account whose cycle throws', async () => {
    /* A user row with settings but no profile: runAutopilot stops cleanly, and
       the sweep must return rather than propagate. */
    const { tick } = await import('./autonomous');
    const summary = await tick(offUser, 1);
    expect(summary.userId).toBe(offUser);
    expect(summary.attempted).toBe(0);
    expect(summary.stoppedBecause).toBeTruthy();
  }, 120_000);
});
