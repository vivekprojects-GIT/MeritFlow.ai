import { describe, expect, it } from 'vitest';
import { checkCompatibility, isHighRisk, INTENT_RULES } from './intent-compat';

/**
 * The deterministic second opinion on what the router decided.
 *
 * One case motivates this whole file and it is the first test: sponsorship and
 * work authorisation are both stored, both verified, both a bare Yes or No, and
 * they mean opposite things. Nothing downstream can tell them apart, so the
 * check has to happen here or not at all.
 */

describe('the immigration pair', () => {
  it('refuses to answer a sponsorship question from work authorisation', () => {
    expect(
      checkCompatibility('Will you now or in the future require sponsorship?', 'WORK_AUTH.AUTHORIZED').ok,
    ).toBe(false);
  });

  it('refuses to answer an authorisation question from sponsorship', () => {
    expect(
      checkCompatibility('Are you legally authorized to work in the United States?', 'WORK_AUTH.SPONSORSHIP').ok,
    ).toBe(false);
  });

  it('accepts each where it belongs', () => {
    expect(checkCompatibility('Will you require visa sponsorship?', 'WORK_AUTH.SPONSORSHIP').ok).toBe(true);
    expect(checkCompatibility('Are you authorized to work in the US?', 'WORK_AUTH.AUTHORIZED').ok).toBe(true);
  });

  it('reads an H-1B question as sponsorship', () => {
    const q = 'Would you need us to file an H-1B on your behalf?';
    expect(checkCompatibility(q, 'WORK_AUTH.SPONSORSHIP').ok).toBe(true);
    expect(checkCompatibility(q, 'WORK_AUTH.AUTHORIZED').ok).toBe(false);
  });
});

describe('the absurd routings a family check catches', () => {
  it('will not answer an experience question with a city', () => {
    expect(
      checkCompatibility('How many years of Kubernetes experience do you have?', 'PROFILE.CITY').ok,
    ).toBe(false);
  });

  it('will not answer a salary question with a start date', () => {
    expect(checkCompatibility('What are your salary expectations?', 'LOGISTICS.START_DATE').ok).toBe(false);
  });

  it('separates the present from the past', () => {
    /* Adjacent and different: one is a fact about now, the other a claim about
       history that a résumé cannot establish. */
    expect(checkCompatibility('Who is your current employer?', 'HISTORY.PREVIOUS_EMPLOYMENT').ok).toBe(false);
  });
});

describe('high risk is stricter than ordinary', () => {
  it('names the answers that must never be guessed at', () => {
    const high = Object.entries(INTENT_RULES)
      .filter(([, r]) => r.risk === 'high')
      .map(([i]) => i);

    for (const intent of [
      'WORK_AUTH.SPONSORSHIP',
      'WORK_AUTH.AUTHORIZED',
      'CLEARANCE.SECURITY',
      'DEMOGRAPHIC.VOLUNTARY',
      'COMPENSATION.EXPECTED',
      'HISTORY.PREVIOUS_EMPLOYMENT',
    ]) {
      expect(high, intent).toContain(intent);
    }
  });

  it('refuses a high-risk intent when the question cannot be placed', () => {
    /* An unrecognised question is not evidence for anything, and for these
       fields the absence of evidence is a refusal rather than a shrug. */
    for (const intent of ['WORK_AUTH.SPONSORSHIP', 'CLEARANCE.SECURITY', 'DEMOGRAPHIC.VOLUNTARY']) {
      expect(checkCompatibility('Which of our products have you used?', intent).ok, intent).toBe(false);
    }
  });

  it('lets an ordinary intent stand on the router alone', () => {
    /* For a city the router's opinion is the only one available, and a wrong
       city is a correctable annoyance rather than a false statement. */
    expect(checkCompatibility('Which of our offices is nearest you?', 'PROFILE.CITY').ok).toBe(true);
  });

  it('passes an intent with no declared rule', () => {
    /* The table covers what is dangerous. Requiring an entry for everything
       would mean a new intent silently answering nothing until someone
       remembered to add one. */
    expect(checkCompatibility('anything at all', 'SOMETHING.NEW').ok).toBe(true);
    expect(isHighRisk('SOMETHING.NEW')).toBe(false);
  });
});
