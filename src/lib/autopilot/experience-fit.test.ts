import { describe, it, expect } from 'vitest';
import { readRequirement, judgeExperience, YEAR_TOLERANCE } from './experience-fit';

describe('reading the experience a posting asks for', () => {
  it('reads a plain requirement', () => {
    const r = readRequirement('ML Engineer', 'We are looking for 8+ years of experience building ML systems.');
    expect(r.years).toBe(8);
    expect(r.via).toBe('stated');
  });

  it('reads a range as its lower bound, because that is who it was written for', () => {
    const r = readRequirement('ML Engineer', 'You have 3-5 years of professional experience.');
    expect(r.years).toBe(3);
  });

  it('takes the overall bar rather than a per-skill one', () => {
    const r = readRequirement(
      'Backend Engineer',
      '7+ years of software engineering experience.\n2+ years of experience with Go.',
    );
    expect(r.years).toBe(7);
  });

  it('does not treat a preferred clause as the bar', () => {
    const r = readRequirement(
      'ML Engineer',
      '4+ years of experience required.\n10+ years of experience preferred.',
    );
    expect(r.years).toBe(4);
  });

  it('ignores a nice-to-have', () => {
    const r = readRequirement(
      'ML Engineer',
      '3+ years of industry experience. 8 years of research experience is a plus.',
    );
    expect(r.years).toBe(3);
  });

  /* The failure that motivated the clause test: numbers about the company. */
  it('does not read company history as a requirement', () => {
    const r = readRequirement('ML Engineer', 'Founded 12 years ago, we have 10 years of runway.');
    expect(r.years).toBeNull();
  });

  it('does not read a contract length as a requirement', () => {
    const r = readRequirement('ML Engineer', 'This is a 3 year contract position.');
    expect(r.years).toBeNull();
  });

  it('falls back to the title when no years are stated', () => {
    expect(readRequirement('Principal ML Engineer', 'Join our team.').years).toBe(10);
    expect(readRequirement('Senior Engineer', 'Join our team.').years).toBe(4);
    expect(readRequirement('Director of Engineering', 'Join our team.').via).toBe('title');
  });

  it('prefers a stated requirement over the title floor', () => {
    const r = readRequirement('Senior Engineer', 'We need 2+ years of experience.');
    expect(r.years).toBe(2);
    expect(r.via).toBe('stated');
  });

  it('says nothing when the posting says nothing', () => {
    const r = readRequirement('Engineer', 'Come build with us.');
    expect(r.years).toBeNull();
    expect(r.via).toBe('none');
  });
});

describe('judging whether to apply', () => {
  const jd = (text: string) => ({ title: 'Engineer', description: text, candidateYears: 3 });

  it('rejects the ten-year role for a three-year candidate', () => {
    const v = judgeExperience(jd('10+ years of experience required.'));
    expect(v.applies).toBe(false);
    expect(v.reason).toContain('10 years');
    expect(v.reason).toContain('you have 3');
  });

  it('allows a role at the candidate’s own level', () => {
    expect(judgeExperience(jd('3+ years of experience.')).applies).toBe(true);
  });

  it('allows an ordinary stretch, because postings are written aspirationally', () => {
    expect(judgeExperience(jd('4+ years of experience.')).applies).toBe(true);
    /* "5+ years" is the common wording for the roles a three-year engineer
       actually matches. Refusing it left the queue empty. */
    expect(judgeExperience(jd('5+ years of experience.')).applies).toBe(true);
    expect(YEAR_TOLERANCE).toBe(2);
  });

  it('stops at three years of stretch', () => {
    expect(judgeExperience(jd('6+ years of experience.')).applies).toBe(false);
  });

  /* The case the gate exists for, unchanged. */
  it('still refuses a ten-year role for a three-year candidate', () => {
    expect(judgeExperience(jd('10+ years of experience required.')).applies).toBe(false);
  });

  it('rejects a principal role on its title alone', () => {
    const v = judgeExperience({ title: 'Principal Engineer', description: 'Build things.', candidateYears: 3 });
    expect(v.applies).toBe(false);
    expect(v.requirement.via).toBe('title');
  });

  it('allows a senior role for a candidate close to it', () => {
    const v = judgeExperience({ title: 'Senior Engineer', description: 'Build things.', candidateYears: 3 });
    expect(v.applies).toBe(true);
  });

  /* Not knowing is not grounds for rejection -- the same rule the rest of the
     system follows about facts it does not hold. */
  it('does not reject when the candidate never stated their experience', () => {
    const v = judgeExperience({ title: 'Principal Engineer', description: '10+ years of experience.', candidateYears: null });
    expect(v.applies).toBe(true);
  });

  it('does not reject when the posting states nothing', () => {
    expect(judgeExperience({ title: 'Engineer', description: 'Come build.', candidateYears: 3 }).applies).toBe(true);
  });

  it('lets a senior candidate through a senior posting', () => {
    const v = judgeExperience({ title: 'Staff Engineer', description: '8+ years of experience.', candidateYears: 9 });
    expect(v.applies).toBe(true);
  });
});
