import { describe, it, expect, afterEach } from 'vitest';
import { resolveExecutionPolicy, mayAutoSubmit, mayDriveBrowser, submitEnabledFor } from './execution-policy';
import { extractOtp, aliasFromRecipients, companyFromSender } from '../mail/inbound';

/**
 * These gates decide whether an application reaches a real employer, so the
 * tests are written from the direction that costs something: a path that
 * should be shut staying shut.
 */

const original = process.env.AUTOPILOT_SUBMIT_ENABLED;
afterEach(() => {
  process.env.AUTOPILOT_SUBMIT_ENABLED = original;
});

describe('operator allowlist', () => {
  it('is closed when unset', () => {
    process.env.AUTOPILOT_SUBMIT_ENABLED = '';
    expect(submitEnabledFor('greenhouse')).toBe(false);
    expect(submitEnabledFor('unknown')).toBe(false);
  });

  it('opens only the vendors named', () => {
    process.env.AUTOPILOT_SUBMIT_ENABLED = 'greenhouse';
    expect(submitEnabledFor('greenhouse')).toBe(true);
    expect(submitEnabledFor('lever')).toBe(false);
  });

  it('supports an explicit all', () => {
    process.env.AUTOPILOT_SUBMIT_ENABLED = 'all';
    expect(submitEnabledFor('lever')).toBe(true);
  });
});

describe('resolveExecutionPolicy', () => {
  it('leaves an unreviewed path unable to submit', () => {
    process.env.AUTOPILOT_SUBMIT_ENABLED = '';
    expect(mayAutoSubmit(resolveExecutionPolicy({ ats: 'unknown', mechanism: 'browser' }))).toBe(false);
  });

  it('promotes an unreviewed path once the operator enables it', () => {
    process.env.AUTOPILOT_SUBMIT_ENABLED = 'all';
    expect(mayAutoSubmit(resolveExecutionPolicy({ ats: 'unknown', mechanism: 'browser' }))).toBe(true);
  });

  it('never lets the allowlist override an explicit block', () => {
    /* Workday's terms prohibit automated access. A flag set months later must
       not silently reverse a deliberate decision. */
    process.env.AUTOPILOT_SUBMIT_ENABLED = 'all';
    const p = resolveExecutionPolicy({ ats: 'workday', mechanism: 'browser' });
    expect(p.status).toBe('BLOCKED');
    expect(mayAutoSubmit(p)).toBe(false);
  });
});

describe('mayDriveBrowser', () => {
  it('keeps a headless browser away from a blocked path entirely', () => {
    /* The rationale on the Workday row is about automated *access*, not about
       the final click. Opening a scripted Chromium session to read the page is
       automated access, so the gate has to sit before the visit. */
    process.env.AUTOPILOT_SUBMIT_ENABLED = 'all';
    expect(mayDriveBrowser(resolveExecutionPolicy({ ats: 'workday', mechanism: 'browser' }))).toBe(false);
  });

  it('still allows reading a path that merely may not submit', () => {
    process.env.AUTOPILOT_SUBMIT_ENABLED = '';
    const p = resolveExecutionPolicy({ ats: 'unknown', mechanism: 'browser' });
    expect(mayAutoSubmit(p)).toBe(false);
    expect(mayDriveBrowser(p)).toBe(true);
  });
});

/**
 * The submit decision, mirrored from the workflow.
 *
 * Held here as a table because the conditions are independent and the failure
 * that matters — one relaxed check letting an application out — is invisible
 * when they are only ever exercised together.
 */
function canSubmit(i: {
  policyPermits: boolean;
  adapterCanSubmit: boolean;
  verifierCleared: boolean;
  formValid: boolean;
  autoSubmit: boolean;
  mode: 'MANUAL' | 'SMART' | 'FULL';
  spotless: boolean;
  reviewBefore: boolean;
  approved: boolean;
}) {
  const modeAllows = i.mode === 'FULL' || (i.mode === 'SMART' && i.spotless);
  const heldForReview = i.reviewBefore && !i.approved;
  return (
    i.policyPermits &&
    i.adapterCanSubmit &&
    i.verifierCleared &&
    i.formValid &&
    i.autoSubmit &&
    i.mode !== 'MANUAL' &&
    modeAllows &&
    !heldForReview
  );
}

const open = {
  policyPermits: true,
  adapterCanSubmit: true,
  verifierCleared: true,
  formValid: true,
  autoSubmit: true,
  mode: 'FULL' as const,
  spotless: true,
  reviewBefore: false,
  approved: false,
};

describe('the submit decision', () => {
  it('sends when every gate is open', () => {
    expect(canSubmit(open)).toBe(true);
  });

  it.each([
    ['the execution policy forbids it', { policyPermits: false }],
    ['no adapter can submit', { adapterCanSubmit: false }],
    ['the verifier did not clear it', { verifierCleared: false }],
    ['the form is incomplete', { formValid: false }],
    ['auto-submit is off', { autoSubmit: false }],
    ['the mode is Manual', { mode: 'MANUAL' as const }],
    ['review is holding it', { reviewBefore: true }],
  ])('refuses when %s', (_label, override) => {
    expect(canSubmit({ ...open, ...override })).toBe(false);
  });

  it('holds an imperfect application in Smart mode', () => {
    expect(canSubmit({ ...open, mode: 'SMART', spotless: false })).toBe(false);
  });

  it('sends an imperfect application in Full mode', () => {
    expect(canSubmit({ ...open, mode: 'FULL', spotless: false })).toBe(true);
  });

  it('lets approval release the review hold', () => {
    expect(canSubmit({ ...open, reviewBefore: true, approved: true })).toBe(true);
  });

  /* Approval is consent to send this one application, not a master key. */
  it.each([
    ['the verifier', { verifierCleared: false }],
    ['an invalid form', { formValid: false }],
    ['Manual mode', { mode: 'MANUAL' as const }],
    ['the operator allowlist', { policyPermits: false }],
    ['auto-submit being off', { autoSubmit: false }],
  ])('does not let approval override %s', (_label, override) => {
    expect(canSubmit({ ...open, reviewBefore: true, approved: true, ...override })).toBe(false);
  });
});

describe('inbound mail parsing', () => {
  it('reads a verification code from context', () => {
    expect(extractOtp('', 'Your verification code is 483920.')).toBe('483920');
  });

  /* A recruiting email is full of digit runs that are not codes. */
  it('ignores a salary', () => {
    expect(extractOtp('Offer', 'Base salary 120000 per year')).toBe('');
  });

  it('ignores a requisition number', () => {
    expect(extractOtp('Received', 'Requisition 4471829 for the role')).toBe('');
  });

  it('routes an alias on our domain', () => {
    process.env.APPLY_EMAIL_DOMAIN = 'apply.test';
    expect(aliasFromRecipients(['Apply <vivek.a1b2@apply.test>'])).toBe('vivek.a1b2');
  });

  it('ignores a recipient on someone else’s domain', () => {
    process.env.APPLY_EMAIL_DOMAIN = 'apply.test';
    expect(aliasFromRecipients(['someone@evil.com'])).toBeNull();
  });

  it('names the ATS vendor rather than guessing the employer', () => {
    expect(companyFromSender('no-reply@us.greenhouse-mail.io')).toBe('Greenhouse');
  });
});
