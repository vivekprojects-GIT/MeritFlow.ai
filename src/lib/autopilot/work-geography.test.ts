import { describe, it, expect } from 'vitest';
import { countryOf, authorisedCountry, judgeGeography } from './work-geography';

describe('reading a country from a posting location', () => {
  it('reads named countries', () => {
    expect(countryOf('Remote - Brazil')).toBe('Brazil');
    expect(countryOf('Canada')).toBe('Canada');
    expect(countryOf('Remote-Canada')).toBe('Canada');
    expect(countryOf('India')).toBe('India');
  });

  it('reads cities that imply a country', () => {
    expect(countryOf('Toronto, ON')).toBe('Canada');
    /* The accent that let a Montréal role through to a US-only candidate. */
    expect(countryOf('Montréal')).toBe('Canada');
    expect(countryOf('Québec City')).toBe('Canada');
    expect(countryOf('Bengaluru')).toBe('India');
    expect(countryOf('London')).toBe('United Kingdom');
    expect(countryOf('São Paulo')).toBe('Brazil');
  });

  it('reads US locations', () => {
    expect(countryOf('New York, NY')).toBe('United States');
    expect(countryOf('Dallas, Texas, United States')).toBe('United States');
    expect(countryOf('San Francisco')).toBe('United States');
  });

  it('returns null when no country is named', () => {
    expect(countryOf('Remote')).toBeNull();
    expect(countryOf('')).toBeNull();
    expect(countryOf('Hybrid')).toBeNull();
  });
});

describe('reading where the candidate is authorised', () => {
  it('reads the country out of the stored answer', () => {
    expect(authorisedCountry('Yes (United States)')).toBe('United States');
    expect(authorisedCountry('No (Canada)')).toBe('Canada');
  });

  it('falls back to the profile country', () => {
    expect(authorisedCountry(undefined, 'United States')).toBe('United States');
  });

  it('returns null when nothing is recorded', () => {
    expect(authorisedCountry(undefined, undefined)).toBeNull();
  });
});

describe('deciding whether the candidate may take the job', () => {
  const US = 'United States';

  /* The posting that motivated this: a Lever form that asked for Canadian
     eligibility after a browser had already opened and a résumé been tailored. */
  it('refuses a Canadian role for a US-authorised candidate', () => {
    const v = judgeGeography({ location: 'Canada', authorised: US });
    expect(v.applies).toBe(false);
    expect(v.reason).toMatch(/Canada/);
    expect(v.reason).toMatch(/United States/);
  });

  it('refuses Brazil and India too', () => {
    expect(judgeGeography({ location: 'Remote - Brazil', authorised: US }).applies).toBe(false);
    expect(judgeGeography({ location: 'Hyderabad, India', authorised: US }).applies).toBe(false);
  });

  it('allows a US role', () => {
    expect(judgeGeography({ location: 'Austin, TX', authorised: US }).applies).toBe(true);
    expect(judgeGeography({ location: 'Remote - United States', authorised: US }).applies).toBe(true);
  });

  /* Ambiguity is not rejected: plenty of remote roles are open to anyone
     authorised anywhere, and the form asks when it matters. */
  it('allows a posting that names no country', () => {
    expect(judgeGeography({ location: 'Remote', authorised: US }).applies).toBe(true);
  });

  it('does not filter when the candidate’s authorisation is unknown', () => {
    expect(judgeGeography({ location: 'Canada', authorised: null }).applies).toBe(true);
  });
});
