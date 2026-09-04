import { describe, expect, it } from 'vitest';
import { derive, factsFrom } from './derive';
import type { VaultAnswer } from './answer-vault';

/**
 * Derivation.
 *
 * The tier between "the candidate answered this" and "nobody can answer this".
 * Every test here is really the same question asked twice: does it compute the
 * answer that follows from a verified fact, and does it refuse everything else?
 */

const answer = (intent: string, value: string): VaultAnswer => ({
  intent,
  value,
  provenance: 'USER_VERIFIED',
  verified: true,
  sensitivity: 'NORMAL_FACT',
  autopilotOk: true,
  updatedAt: 1,
});

const COMPLETENESS = ['HISTORY.EMPLOYMENT_COMPLETE', 'HISTORY.CONSULTING_COMPLETE', 'HISTORY.CLIENTS_COMPLETE'];

const vault = (country?: string, complete = false): Map<string, VaultAnswer> => {
  const m = new Map<string, VaultAnswer>();
  if (country) m.set('PROFILE.COUNTRY', answer('PROFILE.COUNTRY', country));
  if (complete) for (const i of COMPLETENESS) m.set(i, answer(i, 'Yes'));
  return m;
};

const resume = (...employers: string[]) => ({ experience: employers.map((company) => ({ company })) });

const facts = (country?: string, ...employers: string[]) => factsFrom(vault(country), resume(...employers));

/** The same, plus the candidate's explicit assertion that history is complete. */
const factsComplete = (country: string, ...employers: string[]) =>
  factsFrom(vault(country, true), resume(...employers));

describe('located in a country', () => {
  it('answers No when the candidate is somewhere else', () => {
    /* The real blocker. A GitLab posting asked "Are you currently located in
       Canada?" and the run stopped — while the candidate's country sat in the
       vault, answered during setup. */
    expect(derive('Are you currently located in Canada?', facts('United States'))).toMatchObject({
      value: 'No',
      rule: 'LOCATED_IN_COUNTRY',
    });
  });

  it('answers Yes when it is the same country under another name', () => {
    expect(derive('Are you currently located in the US?', facts('United States'))?.value).toBe('Yes');
    expect(derive('Do you reside in the United States of America?', facts('United States'))?.value).toBe('Yes');
    expect(derive('Are you based in the UK?', facts('United Kingdom'))?.value).toBe('Yes');
  });

  it('refuses when we do not know where they are', () => {
    /* A derivation with a missing input declines. It does not assume a country
       and it does not fall back on something plausible. */
    expect(derive('Are you currently located in Canada?', facts())).toBeNull();
  });

  it('refuses a question naming several countries', () => {
    /*
     * "One of these" and "this one" are different questions, and answering the
     * first as though it were the second puts a false statement on an
     * application.
     */
    expect(derive('Are you located in the US or Canada?', facts('United States'))).toBeNull();
    expect(derive('Are you currently living in Canada, Mexico or Brazil?', facts('United States'))).toBeNull();
  });

  it('refuses a country it does not recognise', () => {
    expect(derive('Are you currently located in Freedonia?', facts('United States'))).toBeNull();
  });

  it('does not fire on a question that merely mentions a place', () => {
    expect(derive('Why do you want to work in Canada?', facts('United States'))).toBeNull();
    expect(derive('How many years have you worked in the US?', facts('United States'))).toBeNull();
  });

  it('records the fact it computed from', () => {
    expect(derive('Are you currently located in Canada?', facts('United States'))?.basis).toMatch(/United States/);
  });
});

describe('previously worked at an employer', () => {
  it('refuses when the candidate has not asserted their history is complete', () => {
    /*
     * The rule this file got wrong the first time.
     *
     * A résumé is a curated document. It omits three-month contracts, agency
     * placements, vendor engagements, an internship from a decade ago. Deriving
     * "I have never worked there" from "it is not on the CV" invents a
     * candidate fact — and this particular fact is one an employer acts on, so
     * a wrong No is a false statement they discover later.
     */
    expect(
      derive('Have you previously worked at or consulted for GitLab?', facts('United States', 'Northwind Labs')),
    ).toBeNull();
  });

  it('answers No once the candidate has asserted completeness', () => {
    expect(
      derive('Have you previously worked at or consulted for GitLab?', factsComplete('United States', 'Northwind Labs')),
    ).toMatchObject({ value: 'No', rule: 'NOT_PREVIOUSLY_EMPLOYED' });
  });

  it('requires all three histories, not just salaried employment', () => {
    /* A candidate who has confirmed their jobs but not their consulting work
       cannot support "have you ever consulted for X". */
    const partial = new Map<string, VaultAnswer>([
      ['PROFILE.COUNTRY', answer('PROFILE.COUNTRY', 'United States')],
      ['HISTORY.EMPLOYMENT_COMPLETE', answer('HISTORY.EMPLOYMENT_COMPLETE', 'Yes')],
    ]);
    const f = factsFrom(partial, resume('Northwind Labs'));
    expect(f.historyComplete).toBe(false);
    expect(derive('Have you previously worked at GitLab?', f)).toBeNull();
  });

  it('handles the wordings boards actually use', () => {
    const f = factsComplete('United States', 'Northwind Labs');
    expect(derive('Have you ever been employed by Stripe?', f)?.value).toBe('No');
    expect(derive('Have you worked for Datadog?', f)?.value).toBe('No');
  });

  it('names the employer, not the phrase around it', () => {
    const d = derive(
      'Have you previously worked at or consulted for GitLab?',
      factsComplete('United States', 'Northwind Labs'),
    );
    expect(d?.basis).toMatch(/^GitLab appears in none of your verified work history/);
  });

  it('counts employers the candidate declared beyond the résumé', () => {
    /* Contracts and clients that never appeared on the CV are exactly what the
       completeness assertion is about, so they have to be in the comparison. */
    const v = vault('United States', true);
    v.set('HISTORY.ALL_EMPLOYERS', answer('HISTORY.ALL_EMPLOYERS', 'Acme Consulting, GitLab, Globex'));
    const f = factsFrom(v, resume('Northwind Labs'));
    expect(f.employers).toContain('gitlab');
    /* And a company on that list is no longer answerable as a No. */
    expect(derive('Have you previously worked at GitLab?', f)).toBeNull();
  });

  it('ignores location fragments the parser leaves in the company field', () => {
    const f = factsFrom(vault('United States', true), {
      experience: [{ company: 'Northwind Labs' }, { company: ', Austin, TX' }],
    });
    expect(f.employers).toEqual(['northwind labs']);
  });

  it('never answers Yes', () => {
    /*
     * A name match could be a different company with the same name, and "yes, I
     * worked there" is a claim about the candidate's own past. A hit declines
     * and the question goes to them.
     */
    expect(
      derive('Have you previously worked at Northwind Labs?', factsComplete('United States', 'Northwind Labs')),
    ).toBeNull();
  });

  it('refuses when there is no history at all, however complete it is claimed to be', () => {
    expect(derive('Have you previously worked at GitLab?', factsComplete('United States'))).toBeNull();
  });
});

describe('how did you hear about this job', () => {
  const found = (source: string) => factsFrom(vault('United States'), resume('Northwind Labs'), source);

  it('answers from where the posting was actually found', () => {
    expect(derive('How did you hear about this job?', found('COMPANY_CAREER_SITE'))).toMatchObject({
      value: 'Company website',
      rule: 'DISCOVERY_PROVENANCE',
    });
    expect(derive('How did you first learn about this role?', found('LINKEDIN'))?.value).toBe('LinkedIn');
    expect(derive('Where did you hear about us?', found('INDEED'))?.value).toBe('Indeed');
  });

  it('never claims a referral', () => {
    /*
     * A referral is a relationship, not a URL, and employers act on the answer:
     * referred applications are routed differently and sometimes carry a bonus
     * for the referrer. Claiming one we cannot evidence is a lie with a
     * beneficiary.
     */
    const values = ['COMPANY_CAREER_SITE', 'LINKEDIN', 'INDEED', 'GLASSDOOR', 'REFERRAL', 'EMPLOYEE_REFERRAL'].map(
      (s) => derive('How did you hear about this job?', found(s))?.value ?? null,
    );
    expect(values.some((v) => /referr/i.test(v ?? ''))).toBe(false);
  });

  it('declines rather than inventing a plausible source', () => {
    /* "Company website" sounds harmless and is still a claim. A posting whose
       provenance was never recorded goes to the candidate. */
    expect(derive('How did you hear about this job?', found(''))).toBeNull();
    expect(derive('How did you hear about this job?', found('SOMETHING_NEW'))).toBeNull();
  });
});

describe('what derivation must never cover', () => {
  it('declines anything requiring judgement about the candidate', () => {
    /*
     * The boundary this file must hold. How much experience counts as
     * experience, what salary is acceptable, whether a candidate considers
     * themselves senior — these follow from no stated fact, and a rule that
     * computed them would be guessing with extra steps.
     */
    const f = factsComplete('United States', 'Northwind Labs');
    for (const q of [
      'How many years of experience do you have with Kubernetes?',
      'What are your salary expectations?',
      'Would you describe yourself as a senior engineer?',
      'Why do you want to work here?',
      'Are you willing to relocate?',
    ]) {
      expect(derive(q, f), q).toBeNull();
    }
  });

  it('declines an empty question', () => {
    expect(derive('   ', facts('United States'))).toBeNull();
  });
});
