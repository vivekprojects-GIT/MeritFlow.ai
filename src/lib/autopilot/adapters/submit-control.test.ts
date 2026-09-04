import { describe, expect, it } from 'vitest';
import { isSubmitLabel, isNotSubmit } from './browser';

/**
 * Which control sends an application.
 *
 * The failure this guards against is not "we could not find the button". It is
 * finding the wrong one: the previous implementation took the first visible
 * `button[type="submit"]`, and on Instacart's careers site — where every
 * navigation button is built that way — the first visible one is "Skip to main
 * content". On a page that also had a form, that click would have been reported
 * as an application sent.
 */

describe('what counts as a submit control', () => {
  it('accepts the wordings ATS forms actually use', () => {
    for (const label of [
      'Submit application',
      'Submit Application',
      'Submit',
      'Submit my application',
      'Apply',
      'Apply now',
      'Apply for this job',
      'Send application',
      'Finish and submit',
    ]) {
      expect(isSubmitLabel(label), label).toBe(true);
    }
  });

  it('rejects the navigation controls that share the same type attribute', () => {
    /* Every one of these was `button[type="submit"]` on a real careers page. */
    for (const label of [
      'Skip to main content',
      'Open Menu',
      'Back',
      'Products',
      'Company',
      'Locations',
      'Teams',
      'Get Started',
      'United States (English)',
      'News & Insights',
    ]) {
      expect(isSubmitLabel(label) && !isNotSubmit(label), label).toBe(false);
    }
  });

  it('rejects controls that would lose or leak the application', () => {
    for (const label of ['Save job', 'Save for later', 'Share', 'Sign in', 'Log in', 'Search', 'Accept all']) {
      expect(isNotSubmit(label), label).toBe(true);
    }
  });

  it('does not match a label that merely contains the word', () => {
    /*
     * Anchored on purpose. "Submit a referral instead" and "Apply to other
     * roles" are different actions, and a substring match would click them.
     */
    expect(isSubmitLabel('Submit a referral instead')).toBe(false);
    expect(isSubmitLabel('Apply to other roles at this company')).toBe(false);
    expect(isSubmitLabel('By clicking Submit you agree to the terms')).toBe(false);
  });

  it('ignores surrounding whitespace, which carries no meaning', () => {
    expect(isSubmitLabel('  Submit Application  ')).toBe(true);
  });

  it('treats an empty label as no evidence at all', () => {
    expect(isSubmitLabel('')).toBe(false);
  });
});
