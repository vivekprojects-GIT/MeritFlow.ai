import { describe, expect, it } from 'vitest';
import { matchRoles, ROLES } from './roles';

/**
 * The matcher turns a sentence a learner typed into the career they meant.
 *
 * Both ways of getting it wrong cost the learner something real. Returning too
 * many roles asks them to pick from five jobs they did not describe; returning
 * the wrong one sends them down a syllabus for someone else's career. Most of
 * what follows pins the cases where those two failures were actually observed.
 */

const titles = (text: string) => matchRoles(text).map((r) => r.title);

describe('matchRoles', () => {
  it('takes a named role decisively rather than offering its neighbours', () => {
    /* "engineer" is in eleven of twenty titles. Before title words were
       weighted by what they distinguish, this query returned five roles in
       array order — and "ai", being two characters, was filtered out entirely,
       so nothing in the ranking had actually matched "AI" at all. */
    expect(titles('I want to become an AI engineer')).toEqual(['AI Engineer']);
  });

  it('asks when the words genuinely do not separate the jobs', () => {
    const options = titles('I want to be an engineer');
    expect(options.length).toBeGreaterThan(1);
  });

  it('finds the role from the work, not just the job title', () => {
    expect(titles('I want to design bridges and roads')[0]).toBe('Civil Engineer');
    expect(titles('I want to design buildings')[0]).toBe('Architect');
  });

  it('does not match a short word hiding inside a longer one', () => {
    /* Substring matching over the whole blob is how "ai" finds "detail",
       "maintain" and "explain" — three roles that have nothing to do with it. */
    const roles = matchRoles('ai');
    expect(roles.every((r) => r.title.toLowerCase().includes('ai'))).toBe(true);
  });

  it('still matches a word against its own derivations', () => {
    expect(titles('design')).toContain('UX Designer');
  });

  it('returns nothing for a sentence that names no career', () => {
    expect(matchRoles('I want to get a good job and be happy')).toEqual([]);
    expect(matchRoles('')).toEqual([]);
  });

  it('never returns more than five options', () => {
    expect(matchRoles('engineer analyst data design manager').length).toBeLessThanOrEqual(5);
  });

  it('resolves every role from its own title', () => {
    /* If a role cannot be found by naming it, it can never be chosen. */
    for (const role of ROLES) {
      expect(titles(`I want to become a ${role.title}`)).toContain(role.title);
    }
  });
});
