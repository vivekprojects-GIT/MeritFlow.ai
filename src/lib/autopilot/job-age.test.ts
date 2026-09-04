import { describe, expect, it } from 'vitest';
import { judgeAge, AGE_BANDS } from './job-age';

/**
 * Age as a discount rather than a boundary.
 *
 * The single `maxJobAgeHours` cutoff was wrong in both directions: at seven days
 * it refused excellent matches a fortnight old, and simply widening it to thirty
 * would spend a day's allowance on month-old listings. The bar has to rise with
 * age, and these tests are about where it rises to and what it never does.
 */

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 7, 28, 12, 0, 0);
const hoursAgo = (h: number) => NOW - h * HOUR;

const judge = (ageInHours: number, score: number, floor = 70) =>
  judgeAge({ postedAt: hoursAgo(ageInHours), detectedAt: hoursAgo(ageInHours), score, floor }, NOW);

describe('the bar rises with age', () => {
  it('takes a good match posted today', () => {
    expect(judge(6, 72).applies).toBe(true);
  });

  it('refuses at three weeks what it accepted today', () => {
    /* The whole point: 78% is worth applying to while it is fresh and is not
       worth an application once hundreds of people have already seen it. */
    expect(judge(6, 78).applies).toBe(true);
    expect(judge(20 * 24, 78).applies).toBe(false);
  });

  it('takes an excellent match at three weeks', () => {
    expect(judge(20 * 24, 90).applies).toBe(true);
  });

  it('skips anything past a month whatever the score', () => {
    const verdict = judge(40 * 24, 99);
    expect(verdict.applies).toBe(false);
    expect(verdict.band).toBeNull();
    expect(verdict.reason).toMatch(/over a month/i);
  });
});

describe("the candidate's floor is a floor", () => {
  it('never lets a band admit something below what they asked for', () => {
    /* A band demanding 70 does not override a candidate who said 85. */
    expect(judge(6, 80, 85).applies).toBe(false);
    expect(judge(6, 86, 85).applies).toBe(true);
  });

  it('lets a band demand more than the floor', () => {
    expect(judge(20 * 24, 80, 70).applies).toBe(false);
    expect(judge(20 * 24, 88, 70).applies).toBe(true);
  });
});

describe('recency orders the queue without opening the gate', () => {
  it('ranks a fresh good match above an older better one', () => {
    /* A fresh 78 beats a three-week-old 82 for the day's allowance. */
    expect(judge(6, 78).rankedScore).toBeGreaterThan(judge(20 * 24, 82).rankedScore);
  });

  it('never uses the bonus to pass a threshold', () => {
    /*
     * The bonus is for ordering only. A 68 posted an hour ago ranks as 78 and
     * is still refused, because passing a bar by being new is how a weak match
     * gets applied to.
     */
    const verdict = judge(1, 68, 70);
    expect(verdict.rankedScore).toBeGreaterThan(70);
    expect(verdict.applies).toBe(false);
  });
});

describe('a posting with no stated date', () => {
  it('is judged from when we first saw it, not treated as ancient', () => {
    /* Boards routinely omit `postedAt`. Treating that as age zero would let
       anything through; treating it as infinite would refuse everything. */
    const verdict = judgeAge({ postedAt: null, detectedAt: hoursAgo(2), score: 75, floor: 70 }, NOW);
    expect(verdict.applies).toBe(true);
    expect(verdict.ageHours).toBeCloseTo(2, 1);
  });

  it('is refused when it has been in the corpus for months', () => {
    const verdict = judgeAge({ postedAt: null, detectedAt: hoursAgo(60 * 24), score: 95, floor: 70 }, NOW);
    expect(verdict.applies).toBe(false);
  });
});

describe('the bands themselves', () => {
  it('are ordered youngest first, so the first match is the right one', () => {
    const hours = AGE_BANDS.map((b) => b.maxHours);
    expect([...hours].sort((a, b) => a - b)).toEqual(hours);
  });

  it('never lower the bar as a posting ages', () => {
    for (let i = 1; i < AGE_BANDS.length; i += 1) {
      expect(AGE_BANDS[i].minScore).toBeGreaterThanOrEqual(AGE_BANDS[i - 1].minScore);
      expect(AGE_BANDS[i].recencyBonus).toBeLessThanOrEqual(AGE_BANDS[i - 1].recencyBonus);
    }
  });
});
