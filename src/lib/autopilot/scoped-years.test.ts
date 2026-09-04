import { describe, it, expect } from 'vitest';
import { scopesYearsToSubject, checkCompatibility } from './intent-compat';

/**
 * Total experience is not experience with a thing.
 *
 * The router's model maps both onto EXPERIENCE.YEARS because they differ only
 * by the subject. Answering the scoped one with the candidate's career total
 * states a fact about a technology nobody has told us anything about.
 */
describe('years scoped to a subject', () => {
  it('spots a technology', () => {
    expect(scopesYearsToSubject('How many years of experience do you have with Kubernetes?')).toMatch(/kubernetes/i);
  });

  it('spots a domain in the adjective slot', () => {
    expect(scopesYearsToSubject('How many years of design experience do you have?')).toMatch(/design/i);
  });

  it('spots "years in Python"', () => {
    expect(scopesYearsToSubject('Years in Python?')).toMatch(/python/i);
  });

  it('leaves a general question alone', () => {
    expect(scopesYearsToSubject('How many years of experience do you have?')).toBeNull();
    expect(scopesYearsToSubject('How many years of relevant experience do you have?')).toBeNull();
    expect(scopesYearsToSubject('How many years of professional experience do you have?')).toBeNull();
    expect(scopesYearsToSubject('Total years of work experience')).toBeNull();
  });

  it('refuses the routing for a scoped question', () => {
    const r = checkCompatibility('How many years of experience do you have with Kubernetes?', 'EXPERIENCE.YEARS');
    expect(r.ok).toBe(false);
  });

  it('allows the routing for the overall question', () => {
    expect(checkCompatibility('How many years of relevant experience do you have?', 'EXPERIENCE.YEARS').ok).toBe(true);
  });
});
