import { describe, it, expect } from 'vitest';
import { checkCompatibility } from './intent-compat';

/**
 * Three answers that reached a real employer on a real submitted application.
 *
 * Kept as tests because each was a pattern doing exactly what it was written to
 * do — matching words that were genuinely present — on a question that meant
 * something else. The words are not the problem; trusting them without a second
 * opinion was.
 */
describe('answers that were sent and should not have been', () => {
  const OBLIGATIONS =
    'Are you subject to any employment agreements and/or post-employment restrictions with your current employer or a past employer?';

  it('refuses to answer a restrictive-covenant question with an employer name', () => {
    const r = checkCompatibility(OBLIGATIONS, 'HISTORY.CURRENT_EMPLOYER');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/agreements or restrictions/i);
  });

  it('still answers a plain question about who you work for', () => {
    expect(checkCompatibility('Who is your current employer?', 'HISTORY.CURRENT_EMPLOYER').ok).toBe(true);
    expect(checkCompatibility('Name of your current company', 'HISTORY.CURRENT_EMPLOYER').ok).toBe(true);
  });

  it('refuses other obligation wordings too', () => {
    for (const q of [
      'Do you have a non-compete with your current employer?',
      'Are you bound by any NDA with a past employer?',
      'What is your notice period with your current employer?',
    ]) {
      expect(checkCompatibility(q, 'HISTORY.CURRENT_EMPLOYER').ok, q).toBe(false);
    }
  });

  it('does not answer a GitLab username with a GitHub URL', () => {
    expect(checkCompatibility('What is your GitLab username?', 'PROFILE.GITHUB').ok).toBe(false);
  });

  it('still answers a question that names GitHub', () => {
    expect(checkCompatibility('GitHub profile', 'PROFILE.GITHUB').ok).toBe(true);
    expect(checkCompatibility('Link to your GitHub', 'PROFILE.GITHUB').ok).toBe(true);
  });

  it('requires LinkedIn to be named for the LinkedIn field', () => {
    expect(checkCompatibility('LinkedIn Profile', 'PROFILE.LINKEDIN').ok).toBe(true);
    expect(checkCompatibility('What is your Xing profile?', 'PROFILE.LINKEDIN').ok).toBe(false);
  });
});
