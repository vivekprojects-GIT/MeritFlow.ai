import { describe, it, expect } from 'vitest';
import { readConfirmation } from './plan';

/**
 * The phrasing a board uses to say an application arrived.
 *
 * The matcher once required the exact words "thank you for" — and Ashby writes
 * "Thanks for applying", so a completed submission with the résumé attached and
 * every field filled was reported as unconfirmed over one contraction.
 */
describe('recognising a real confirmation', () => {
  it('accepts the contracted form', () => {
    expect(readConfirmation('Thanks for applying! We will be in touch.')).toBeTruthy();
    expect(readConfirmation('Thanks for your application.')).toBeTruthy();
  });

  it('accepts the formal form', () => {
    expect(readConfirmation('Thank you for applying to Hippocratic AI.')).toBeTruthy();
    expect(readConfirmation('Thank you for your application')).toBeTruthy();
  });

  it('accepts the plain statements', () => {
    expect(readConfirmation('Your application has been submitted.')).toBeTruthy();
    expect(readConfirmation('Application received')).toBeTruthy();
    expect(readConfirmation('Successfully submitted')).toBeTruthy();
    expect(readConfirmation('We have received your application')).toBeTruthy();
  });

  it('reads a reference when the page gives one', () => {
    expect(readConfirmation('Thanks for applying! Confirmation #: AB12345')).toBe('AB12345');
  });

  it('returns "confirmed" when there is no reference', () => {
    expect(readConfirmation('Thanks for applying!')).toBe('confirmed');
  });

  /*
   * The false positive that marked three unsent applications as submitted.
   *
   * A widened matcher accepted "application in", which appears in every privacy
   * sentence an employer writes: "we process your application in accordance
   * with...". The Figma job page matched it while the form was still on screen,
   * unfilled and unsent.
   */
  it('does not fire on a policy sentence containing "application in"', () => {
    expect(readConfirmation('Figma will process your application in line with the Candidate Privacy Notice.')).toBe('');
    expect(readConfirmation('We consider your application in accordance with applicable law.')).toBe('');
  });

  it('does not fire on a submit button label', () => {
    expect(readConfirmation('Submit application in the form below')).toBe('');
    expect(readConfirmation('Autofill my application. Submit application')).toBe('');
  });

  it('still accepts the bare statement', () => {
    expect(readConfirmation('Application submitted')).toBeTruthy();
    expect(readConfirmation('Application received')).toBeTruthy();
  });

  /* Strictness is the point: a page offering to take an application is not a
     page confirming one. */
  it('refuses a page that only invites an application', () => {
    expect(readConfirmation('Apply for this job. Submit your application below.')).toBe('');
    expect(readConfirmation('Application form')).toBe('');
    expect(readConfirmation('Thank you for visiting our careers page.')).toBe('');
    expect(readConfirmation('')).toBe('');
  });
});
