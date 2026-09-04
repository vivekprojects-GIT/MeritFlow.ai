import { describe, it, expect, beforeEach } from 'vitest';
import { checkRate, resetRateLimits, LIMITS } from './rate-limit';

beforeEach(resetRateLimits);

describe('checkRate', () => {
  it('allows a burst up to capacity', () => {
    for (let i = 0; i < LIMITS.autopilot.capacity; i += 1) {
      expect(checkRate('u1', 'autopilot').allowed).toBe(true);
    }
  });

  it('refuses the request after capacity is spent', () => {
    for (let i = 0; i < LIMITS.autopilot.capacity; i += 1) checkRate('u1', 'autopilot');
    const r = checkRate('u1', 'autopilot');
    expect(r.allowed).toBe(false);
    expect(r.retryAfter).toBeGreaterThan(0);
  });

  it('keeps users independent', () => {
    for (let i = 0; i < LIMITS.autopilot.capacity; i += 1) checkRate('u1', 'autopilot');
    expect(checkRate('u2', 'autopilot').allowed).toBe(true);
  });

  it('keeps limits independent of each other', () => {
    for (let i = 0; i < LIMITS.autopilot.capacity; i += 1) checkRate('u1', 'autopilot');
    expect(checkRate('u1', 'assistant').allowed).toBe(true);
  });

  it('refills over time', () => {
    const t0 = Date.now();
    for (let i = 0; i < LIMITS.autopilot.capacity; i += 1) checkRate('u1', 'autopilot', t0);
    expect(checkRate('u1', 'autopilot', t0).allowed).toBe(false);
    /* One token per minute for autopilot, so a minute later exactly one is back. */
    expect(checkRate('u1', 'autopilot', t0 + 60_000).allowed).toBe(true);
    expect(checkRate('u1', 'autopilot', t0 + 60_000).allowed).toBe(false);
  });

  it('never refills beyond capacity', () => {
    const t0 = Date.now();
    checkRate('u1', 'autopilot', t0);
    /* A day idle must not bank a day's worth of requests. */
    const far = t0 + 86_400_000;
    for (let i = 0; i < LIMITS.autopilot.capacity; i += 1) {
      expect(checkRate('u1', 'autopilot', far).allowed).toBe(true);
    }
    expect(checkRate('u1', 'autopilot', far).allowed).toBe(false);
  });

  it('meters the expensive endpoint more tightly than reads', () => {
    expect(LIMITS.autopilot.capacity).toBeLessThan(LIMITS.read.capacity);
  });
});
