import { describe, expect, it } from 'vitest';
import { entryFor, isAutonomous, REGISTRY, STALE_AFTER_MS, trustFor, type AtsHealth } from './registry';

/**
 * The registry.
 *
 * The point of these cases is the distinction the whole file exists for: a row
 * saying an ATS is supported is a claim, and only evidence makes it a
 * capability. Every "trusted: false" below is a different reason, because
 * "nobody has checked Lever in a month" and "Lever broke" call for opposite
 * responses.
 */

const NOW = Date.parse('2026-08-18T12:00:00Z');
const DAY = 86_400_000;

const healthy = (vendor: string, complete = 9, attempted = 9, ageDays = 1): AtsHealth => ({
  vendor: vendor as AtsHealth['vendor'],
  attempted,
  complete,
  checkedAt: NOW - ageDays * DAY,
});

describe('drivers', () => {
  it('treats only the no-person paths as autonomous', () => {
    expect(isAutonomous('PUBLIC_API')).toBe(true);
    expect(isAutonomous('BROWSER_NO_LOGIN')).toBe(true);

    /* Everything that needs a human, for any reason, is not. */
    for (const d of ['BROWSER_LOGIN', 'BROWSER_EMAIL_OTP', 'BROWSER_CAPTCHA', 'AUTHORIZED_API', 'UNSUPPORTED'] as const) {
      expect(isAutonomous(d)).toBe(false);
    }
  });
});

describe('the seed', () => {
  it('marks only what the harness actually observed as verified', () => {
    /* Adding thirty rows of `declared` would make this table look impressive
       and mean nothing. */
    const verified = REGISTRY.filter((e) => e.provenance === 'verified').map((e) => e.vendor);
    expect(verified.sort()).toEqual(['ashby', 'greenhouse', 'lever']);
  });

  it('records Workday as unsupported rather than omitting it', () => {
    /* Silence would read as "not looked at yet". It has been looked at, and
       the answer is no — twice over: their terms and an account requirement. */
    const workday = entryFor('workday');
    expect(workday?.submission).toBe('UNSUPPORTED');
    expect(workday?.note).toMatch(/terms|account/i);
  });

  it('gives every entry a reason a person can read', () => {
    for (const e of REGISTRY) expect(e.note.length).toBeGreaterThan(20);
  });
});

describe('trustFor', () => {
  it('trusts a verified vendor with recent, healthy evidence', () => {
    const t = trustFor('lever', [healthy('lever', 5, 5)], NOW);
    expect(t.trusted).toBe(true);
    expect(t.reason).toContain('5/5');
  });

  it('refuses a vendor that needs a person, however good its evidence', () => {
    /* The mechanism decides this, not the numbers. A perfect Workday score
       would not make Workday reachable. */
    const t = trustFor('workday', [healthy('workday', 10, 10)], NOW);
    expect(t.trusted).toBe(false);
    expect(t.reason).toMatch(/needs a person/);
  });

  it('refuses a vendor nobody has ever verified', () => {
    const t = trustFor('smartrecruiters', [], NOW);
    expect(t.trusted).toBe(false);
    expect(t.reason).toMatch(/never been verified/);
  });

  it('stops trusting evidence once it goes stale', () => {
    /* Employers change forms constantly — a posting 404'd between the API
       listing it and the harness opening it, within minutes. A registry with
       no expiry is confidently wrong within a month. */
    const old = healthy('lever', 5, 5, STALE_AFTER_MS / DAY + 1);
    const t = trustFor('lever', [old], NOW);
    expect(t.trusted).toBe(false);
    expect(t.reason).toMatch(/last verified \d+ days ago/);
  });

  it('refuses a vendor whose reads have started failing', () => {
    /* Two of six is the shape of the Lever result before the hidden-file-input
       and invisible-CAPTCHA fixes. An unattended run is the worst place to
       discover that. */
    const t = trustFor('lever', [healthy('lever', 2, 6)], NOW);
    expect(t.trusted).toBe(false);
    expect(t.reason).toMatch(/read only 2 of 6/);
  });

  it('refuses a vendor whose tenants were all unreachable', () => {
    const t = trustFor('ashby', [healthy('ashby', 0, 0)], NOW);
    expect(t.trusted).toBe(false);
    expect(t.reason).toMatch(/no reachable tenants/);
  });

  it('refuses anything not in the registry at all', () => {
    expect(trustFor('unknown', [], NOW).trusted).toBe(false);
  });

  it('gives a distinct reason for each way of failing', () => {
    /* The reasons are the product here: they are what tells someone whether to
       fix an adapter, run the harness, or do nothing. */
    const reasons = new Set([
      trustFor('workday', [healthy('workday')], NOW).reason,
      trustFor('smartrecruiters', [], NOW).reason,
      trustFor('lever', [healthy('lever', 5, 5, 30)], NOW).reason,
      trustFor('lever', [healthy('lever', 1, 6)], NOW).reason,
    ]);
    expect(reasons.size).toBe(4);
  });
});
