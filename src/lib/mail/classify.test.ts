import { describe, it, expect } from 'vitest';
import { classifyMail, detectEvent } from './classify';

/**
 * Ordering carries most of the risk here. Recruiting mail is templated, and
 * the same pleasantry opens a rejection, an invitation and an offer — so the
 * cases that matter are the ones where two categories both look plausible.
 */
describe('classifyMail', () => {
  it('finds a verification code', () => {
    expect(classifyMail('Verify your email', 'Your one-time code is 123456')).toBe('VERIFICATION');
  });

  it('reads a plain rejection', () => {
    expect(classifyMail('Your application', 'We have decided to move forward with other candidates.')).toBe('REJECTION');
  });

  it('reads a rejection that never says no outright', () => {
    expect(classifyMail('Update', 'We will keep your resume on file for future roles.')).toBe('REJECTION');
  });

  it('prefers rejection over interview when the letter mentions interviewing', () => {
    /* The hard one: rejections routinely say they interviewed other people. */
    expect(
      classifyMail('Update', 'After interviewing several candidates we are moving forward with other candidates.'),
    ).toBe('REJECTION');
  });

  it('prefers rejection over the acknowledgement it opens with', () => {
    expect(classifyMail('Your application', 'Thank you for applying. We are moving forward with other candidates.')).toBe(
      'REJECTION',
    );
  });

  it('reads an interview invitation', () => {
    expect(classifyMail('Interview invitation', 'We would like to invite you to an interview next week.')).toBe('INTERVIEW');
  });

  it('treats a scheduling link as an interview', () => {
    expect(classifyMail('Chat?', 'Grab a slot here https://calendly.com/acme/30min')).toBe('INTERVIEW');
  });

  it('separates an assessment from an interview', () => {
    expect(classifyMail('Coding challenge', 'Please complete the HackerRank assessment.')).toBe('ASSESSMENT');
  });

  it('prefers an offer over the acknowledgement it opens with', () => {
    expect(classifyMail('Offer of employment', 'Thank you for applying. We are pleased to offer you the role.')).toBe(
      'OFFER',
    );
  });

  it('reads the most common acknowledgement wording', () => {
    /* "Thank you for applying" — missed by an earlier pattern that allowed
       "thanks for" but not the intervening "you". */
    expect(classifyMail('Application received', 'Thank you for applying to Acme.')).toBe('APPLIED');
  });

  it('leaves unrelated mail alone', () => {
    expect(classifyMail('Acme monthly newsletter', 'Here is what we shipped this month.')).toBe('OTHER');
  });
});

describe('detectEvent', () => {
  const now = new Date(2026, 0, 15).getTime();

  it('reads a month-day-year date with a time', () => {
    const e = detectEvent('Your interview is on March 12, 2026 at 2:30 PM.', now);
    expect(e.startsAt).not.toBeNull();
    expect(new Date(e.startsAt!).getDate()).toBe(12);
    expect(new Date(e.startsAt!).getHours()).toBe(14);
  });

  it('reads a day-month-year date on a 24-hour clock', () => {
    const e = detectEvent('We scheduled you for 8 February 2026, 10:00.', now);
    expect(new Date(e.startsAt!).getHours()).toBe(10);
  });

  it('captures a meeting link', () => {
    expect(detectEvent('Zoom: https://zoom.us/j/9988 on April 3, 2026 at 9:00 am', now).location).toContain('zoom.us');
  });

  /* The refusals matter more than the matches. A wrong time in someone's
     calendar is worse than an empty one, so anything ambiguous is left alone. */
  it('refuses a date with no time', () => {
    expect(detectEvent('Interview on March 12, 2026.', now).startsAt).toBeNull();
  });

  it('refuses a numeric date that means different things in different countries', () => {
    expect(detectEvent('Interview on 12/03 at 2pm', now).startsAt).toBeNull();
  });

  it('refuses prose with no date at all', () => {
    expect(detectEvent('We will be in touch soon.', now).startsAt).toBeNull();
  });
});
