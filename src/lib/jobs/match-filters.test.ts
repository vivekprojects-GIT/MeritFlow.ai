import { describe, expect, it } from 'vitest';
import { applyFilters, facetCounts, matchesQuery, parseFilterIds, prettyPlace } from './match-filters';
import type { Match } from '@/lib/jobs-store';

const NOW = 1_756_400_000_000;

function m(over: Partial<Match['job']> & { score?: number } = {}): Match {
  const { score = 80, ...job } = over;
  return {
    job: {
      id: Math.random().toString(36).slice(2),
      title: 'AI Engineer',
      company: 'Acme',
      location: 'Austin, TX, United States',
      remote: false,
      track: 'full_time',
      minComp: null,
      postedAt: NOW - 3 * 86_400_000,
      applicants: null,
      ...job,
    } as Match['job'],
    score,
    parts: { skills: 0, role: 0, seniority: 0, evidence: 0, location: 0, compensation: 0, freshness: 0 },
    gaps: [],
    state: null,
  };
}

describe('parseFilterIds', () => {
  it('keeps known ids and drops garbage from a stale URL', () => {
    expect(parseFilterIds('remote, strong,bogus,,intern')).toEqual(['remote', 'strong', 'intern']);
    expect(parseFilterIds(null)).toEqual([]);
  });
});

describe('applyFilters', () => {
  it('ANDs chips: remote + strong narrows to rows passing both', () => {
    const list = [m({ remote: true, score: 90 }), m({ remote: true, score: 60 }), m({ score: 92 })];
    expect(applyFilters(list, ['remote', 'strong'], NOW)).toHaveLength(1);
  });

  it('fresh means a posted_at inside 24 hours, never a missing one', () => {
    const list = [m({ postedAt: NOW - 3_600_000 }), m({ postedAt: null })];
    expect(applyFilters(list, ['fresh'], NOW)).toHaveLength(1);
  });

  it('internship covers co-op; new grad covers entry level', () => {
    const list = [m({ track: 'co_op' }), m({ track: 'entry_level' }), m({ track: 'full_time' })];
    expect(applyFilters(list, ['intern'], NOW)).toHaveLength(1);
    expect(applyFilters(list, ['newgrad'], NOW)).toHaveLength(1);
  });
});

describe('facetCounts', () => {
  it("each chip's count is what clicking it would leave, given the current selection", () => {
    const list = [m({ remote: true, score: 90 }), m({ remote: true, score: 60 }), m({ score: 95 })];
    const counts = facetCounts(list, ['remote'], NOW);
    /* With Remote already on, Strong would leave 1 — not the 2 strong rows overall. */
    expect(counts.strong).toBe(1);
    expect(counts.remote).toBe(2);
  });
});

describe('matchesQuery', () => {
  it('searches title, company and location, case-insensitively', () => {
    expect(matchesQuery(m(), 'acme')).toBe(true);
    expect(matchesQuery(m(), 'austin')).toBe(true);
    expect(matchesQuery(m(), 'plumber')).toBe(false);
    expect(matchesQuery(m(), '  ')).toBe(true);
  });
});

describe('prettyPlace', () => {
  it('collapses country long forms', () => {
    expect(prettyPlace('Tucson, AZ, United States of America', false)).toBe('Tucson, AZ, USA');
    expect(prettyPlace('United States', false)).toBe('USA');
    expect(prettyPlace('London, United Kingdom', false)).toBe('London, UK');
  });

  it('keeps the region on a remote job instead of hiding it behind "Remote"', () => {
    expect(prettyPlace('US - Remote', true)).toBe('Remote · USA');
    expect(prettyPlace('Remote', true)).toBe('Remote');
    expect(prettyPlace('', true)).toBe('Remote');
  });

  it('does not mangle words containing "us"', () => {
    expect(prettyPlace('Austin, TX', false)).toBe('Austin, TX');
  });
});
