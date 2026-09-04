import { describe, expect, it } from 'vitest';
import { chooseOption, type SelectOption } from './select-option';

/**
 * Which option goes onto someone's application.
 *
 * Answering "No" to work authorisation, or "Yes" to needing sponsorship, is a
 * materially false statement about the candidate — so the cases that matter
 * here are the ones where refusing is the right answer, not the ones where a
 * clever match is possible.
 */

const YES_NO: SelectOption[] = [
  { label: 'Please choose', value: '' },
  { label: 'Yes', value: 'yes' },
  { label: 'No', value: 'no' },
];

describe('chooseOption', () => {
  it('matches the answer as stored', () => {
    expect(chooseOption('Yes', YES_NO)?.value).toBe('yes');
    expect(chooseOption('no', YES_NO)?.value).toBe('no');
  });

  it('strips the qualifier the vault deliberately carries', () => {
    /* The regression: onboarding stores the country in the value so a US
       answer is visibly not a German one, and every dropdown then failed. */
    expect(chooseOption('Yes (United States)', YES_NO)?.value).toBe('yes');
    expect(chooseOption('No (United States)', YES_NO)?.value).toBe('no');
  });

  it('handles the multi-country form onboarding actually writes', () => {
    expect(chooseOption('Yes (United States); No (Germany)', YES_NO)?.value).toBe('yes');
  });

  it('matches a verbose option from a short answer', () => {
    const verbose: SelectOption[] = [
      { label: '', value: '' },
      { label: 'Yes, I am authorized to work in the US', value: '1' },
      { label: 'No, I am not', value: '2' },
    ];
    expect(chooseOption('Yes (United States)', verbose)?.value).toBe('1');
  });

  it('never picks the placeholder row', () => {
    expect(chooseOption('Please choose', YES_NO)).toBeNull();
    expect(chooseOption('', YES_NO)).toBeNull();
  });

  it('refuses when two options could both be meant', () => {
    /* "Yes, with sponsorship" and "Yes, without sponsorship" both begin with
       the answer. Picking either is a coin flip on someone's visa status. */
    const ambiguous: SelectOption[] = [
      { label: 'Yes, and I do not need sponsorship', value: 'a' },
      { label: 'Yes, but I will need sponsorship', value: 'b' },
    ];
    expect(chooseOption('Yes', ambiguous)).toBeNull();
  });

  it('refuses an answer the form does not offer', () => {
    expect(chooseOption('Maybe', YES_NO)).toBeNull();
    expect(chooseOption('Prefer not to say', YES_NO)).toBeNull();
  });

  it('does not confuse one answer for its opposite', () => {
    /* The worst possible failure: a stored "No" landing on "Yes". */
    for (const answer of ['No', 'No (United States)', 'no — I do not']) {
      expect(chooseOption(answer, YES_NO)?.value).toBe('no');
    }
  });

  it('matches on the submitted value when the label differs', () => {
    /* ATS selects routinely show "Yes" and submit "1"; some do the reverse. */
    const coded: SelectOption[] = [
      { label: 'Affirmative', value: 'Yes' },
      { label: 'Negative', value: 'No' },
    ];
    expect(chooseOption('Yes (United States)', coded)?.value).toBe('Yes');
  });

  it('returns null rather than throwing on an empty option list', () => {
    expect(chooseOption('Yes', [])).toBeNull();
  });
});
