import { describe, it, expect } from 'vitest';
import { tidyResumeValue } from './answer-vault';

/**
 * Every case here came from one real parse of one real résumé. The formatting
 * a document uses to look right on a page is not part of the fact, and it was
 * reaching employers verbatim.
 */
describe('tidying a value lifted from a résumé', () => {
  it('drops a bullet dash and the run of spaces before a date column', () => {
    expect(tidyResumeValue('- Southern Arkansas University                MAY 2025')).toBe(
      'Southern Arkansas University',
    );
  });

  it('unwraps a bracketed degree', () => {
    expect(tidyResumeValue("(Master's in Computer & Information Science)")).toBe(
      "Master's in Computer & Information Science",
    );
  });

  it('drops a trailing year range', () => {
    expect(tidyResumeValue('Capgemini America Inc. 2022 - Present')).toBe('Capgemini America Inc.');
    expect(tidyResumeValue('Acme Corp 2019-2021')).toBe('Acme Corp');
  });

  it('collapses internal whitespace', () => {
    expect(tidyResumeValue('Senior   ML    Engineer')).toBe('Senior ML Engineer');
  });

  it('strips bullet glyphs', () => {
    expect(tidyResumeValue('• Stanford University')).toBe('Stanford University');
    expect(tidyResumeValue('· MIT')).toBe('MIT');
  });

  it('drops trailing punctuation but keeps internal punctuation', () => {
    expect(tidyResumeValue('Capgemini America Inc.,')).toBe('Capgemini America Inc.');
  });

  /* Conservative: it removes decoration and never rewrites content. */
  it('leaves a clean value alone', () => {
    expect(tidyResumeValue('Senior Machine Learning Engineer')).toBe('Senior Machine Learning Engineer');
    expect(tidyResumeValue('B.S. Computer Science')).toBe('B.S. Computer Science');
  });

  it('does not invent anything from an empty value', () => {
    expect(tidyResumeValue('')).toBe('');
    expect(tidyResumeValue('   -  ')).toBe('');
  });
});
