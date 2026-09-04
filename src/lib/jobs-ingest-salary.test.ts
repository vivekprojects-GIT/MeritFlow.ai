import { describe, it, expect } from 'vitest';
import { minCompFromDescription } from './jobs-ingest';

/**
 * Salary read out of a job description.
 *
 * The cases that matter are the negative ones. A description is full of numbers
 * that are not salaries, and the previous reader — built for a structured
 * salary field — treated all of them as candidates and then kept the smallest.
 * 530 postings ended up with a pay figure their text never stated.
 */
describe('reading pay from a description', () => {
  it('reads a stated range and keeps the floor', () => {
    expect(minCompFromDescription('The base salary range for this role is $180,000 - $250,000 per year.')).toBe(180000);
  });

  it('reads a K-suffixed figure', () => {
    expect(minCompFromDescription('Compensation: $150K–$200K annually.')).toBe(150000);
  });

  /* The failure this was written for. */
  it('does not read throughput as pay', () => {
    expect(minCompFromDescription('Our systems handle 100,000 queries per second at peak.')).toBeNull();
  });

  it('does not read user counts as pay', () => {
    expect(minCompFromDescription('We serve 250,000 customers across 40 countries.')).toBeNull();
  });

  it('does not read a bare currency figure with no pay context', () => {
    expect(minCompFromDescription('We raised $100,000,000 in Series C funding.')).toBeNull();
    expect(minCompFromDescription('The team manages a $500,000 infrastructure budget.')).toBeNull();
  });

  it('does not read pay words with no figure', () => {
    expect(minCompFromDescription('We offer competitive compensation and equity.')).toBeNull();
  });

  it('returns null for a description that says nothing about money', () => {
    expect(minCompFromDescription('Build ranking models with a great team. Python and PyTorch required.')).toBeNull();
  });

  it('needs the figure and the pay words in the same clause', () => {
    expect(
      minCompFromDescription('We process 100,000 events per second. We offer competitive salary and benefits.'),
    ).toBeNull();
  });

  it('ignores figures outside a plausible annual range', () => {
    expect(minCompFromDescription('Hourly rate of $25 per hour.')).toBeNull();
    expect(minCompFromDescription('Total rewards package valued at $2,000,000.')).toBeNull();
  });

  it('handles an empty or missing description', () => {
    expect(minCompFromDescription(undefined)).toBeNull();
    expect(minCompFromDescription('')).toBeNull();
  });
});
