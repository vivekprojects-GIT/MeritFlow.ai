import { describe, it, expect } from 'vitest';
import { classifyQuestion } from './question-class';

/**
 * "Affirm" is a verb and a company.
 *
 * The attestation rule matched the bare stem, so every question on Affirm's
 * board was classified as a legal attestation needing authorisation — including
 * "How did you first learn about Affirm as an employer?" — and the employer was
 * unreachable. A real attestation has a subject doing the attesting, or takes a
 * "that" clause.
 */
describe('attestation verbs used as verbs', () => {
  const kind = (q: string) => classifyQuestion(q, 'text' as never).kind;

  it('does not read a company name as an attestation', () => {
    expect(kind('How did you first learn about Affirm as an employer?')).not.toBe('CONSENT_ATTESTATION');
    expect(kind('Have you previously been employed at Affirm?')).not.toBe('CONSENT_ATTESTATION');
    expect(kind('Why do you want to work at Affirm?')).not.toBe('CONSENT_ATTESTATION');
  });

  it('still catches a real attestation', () => {
    for (const q of [
      'I certify that the information provided is accurate',
      'I hereby attest to the accuracy of this application',
      'Do you affirm that you are legally authorized to work?',
      'I declare that the above is true',
      'I swear the information is complete',
      'Signed under penalty of perjury',
    ]) {
      expect(kind(q), q).toBe('CONSENT_ATTESTATION');
    }
  });
});
