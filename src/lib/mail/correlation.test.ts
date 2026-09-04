import { describe, expect, it } from 'vitest';
import { companyTokens, matchOtp, mayFollowLink, scoreCandidate } from './correlation';
import type { MailCandidate, OtpExpectation } from './correlation';

/**
 * Which code goes into which form.
 *
 * The scenario every case here is built around is a batch: ten applications in
 * flight, several verification emails landing within a minute of each other.
 * That is the normal operating condition of this product, and it is exactly
 * where "use the most recent code" quietly puts one employer's code into
 * another employer's form.
 */

const NOW = Date.parse('2026-08-18T12:00:00Z');
const MIN = 60_000;

function expectation(over: Partial<OtpExpectation> = {}): OtpExpectation {
  return {
    jobId: 'job-1',
    company: 'Capital One',
    ats: 'workday',
    since: NOW - 2 * MIN,
    expiresAt: NOW + 8 * MIN,
    ...over,
  };
}

function mail(over: Partial<MailCandidate> = {}): MailCandidate {
  return {
    id: 'm1',
    fromAddr: 'noreply@myworkday.com',
    subject: 'Email Verification',
    company: 'Capital One',
    otp: '739218',
    receivedAt: NOW - 30_000,
    ...over,
  };
}

describe('matchOtp — the batch case', () => {
  it('picks the code from the employer that is actually asking', () => {
    /* Three OTPs inside ninety seconds. The naive "latest" rule returns the
       JPMorgan code, which then fails Capital One's form. */
    const inbox = [
      mail({ id: 'a', company: 'Capital One', otp: '111111', receivedAt: NOW - 90_000 }),
      mail({ id: 'b', company: 'JPMorgan', fromAddr: 'noreply@myworkday.com', subject: 'JPMorgan verification', otp: '222222', receivedAt: NOW - 20_000 }),
      mail({ id: 'c', company: 'Meta', fromAddr: 'no-reply@greenhouse.io', otp: '333333', receivedAt: NOW - 10_000 }),
    ];

    const hit = matchOtp(expectation({ company: 'Capital One' }), inbox, NOW);
    expect(hit?.code).toBe('111111');
    expect(hit?.messageId).toBe('a');
  });

  it('refuses when two employers on the same ATS are indistinguishable', () => {
    /* Both from Workday, neither naming the company, different codes. There is
       no honest way to choose, and choosing wrong burns a verification. */
    const inbox = [
      mail({ id: 'a', company: '', subject: 'Your verification code', otp: '111111', receivedAt: NOW - 40_000 }),
      mail({ id: 'b', company: '', subject: 'Your verification code', otp: '222222', receivedAt: NOW - 20_000 }),
    ];
    expect(matchOtp(expectation(), inbox, NOW)).toBeNull();
  });

  it('accepts the same code delivered twice', () => {
    /* A duplicate is not an ambiguity — both messages agree. */
    const inbox = [
      mail({ id: 'a', company: '', otp: '445566', receivedAt: NOW - 40_000 }),
      mail({ id: 'b', company: '', otp: '445566', receivedAt: NOW - 20_000 }),
    ];
    expect(matchOtp(expectation(), inbox, NOW)?.code).toBe('445566');
  });

  it('ignores a code from a different applicant tracking system', () => {
    const inbox = [mail({ fromAddr: 'no-reply@greenhouse.io', company: '', subject: 'Verify' })];
    expect(matchOtp(expectation({ ats: 'workday' }), inbox, NOW)).toBeNull();
  });

  it('matches on the employer name even from an unknown sender', () => {
    /* Employers routinely send from their own domain rather than the ATS. */
    const inbox = [mail({ fromAddr: 'careers@capitalone.com', company: '', subject: 'Capital One verification code' })];
    expect(matchOtp(expectation({ ats: 'unknown' }), inbox, NOW)?.code).toBe('739218');
  });
});

describe('matchOtp — the window', () => {
  it('ignores a code that arrived before this application started', () => {
    /* Yesterday's Capital One code is a perfect match on every other axis. */
    const stale = [mail({ receivedAt: NOW - 26 * 60 * MIN })];
    expect(matchOtp(expectation(), stale, NOW)).toBeNull();
  });

  it('ignores a code that has expired', () => {
    const late = [mail({ receivedAt: NOW - 30_000 })];
    expect(matchOtp(expectation({ expiresAt: NOW - 60_000 }), late, NOW)).toBeNull();
  });

  it('does not treat recency as evidence on its own', () => {
    /* The heart of the old bug: a message that matches nothing but arrived
       ten seconds ago must not win. */
    const unrelated = [mail({ fromAddr: 'noreply@icims.com', company: 'Someone Else', subject: 'Code', receivedAt: NOW - 10_000 })];
    expect(matchOtp(expectation(), unrelated, NOW)).toBeNull();
  });

  it('ignores a message with no code at all', () => {
    expect(matchOtp(expectation(), [mail({ otp: '' })], NOW)).toBeNull();
    expect(matchOtp(expectation(), [], NOW)).toBeNull();
  });
});

describe('scoreCandidate', () => {
  it('scores an ATS domain and a named employer higher than either alone', () => {
    const both = scoreCandidate(expectation(), mail(), NOW).score;
    const atsOnly = scoreCandidate(expectation(), mail({ company: '', subject: 'Verify' }), NOW).score;
    expect(both).toBeGreaterThan(atsOnly);
    expect(atsOnly).toBeGreaterThan(0);
  });

  it('explains itself in words a person can check', () => {
    expect(scoreCandidate(expectation(), mail(), NOW).why).toContain('myworkday.com');
  });
});

describe('companyTokens', () => {
  it('drops words that identify nobody', () => {
    expect(companyTokens('Acme Technologies Inc')).toEqual(['acme']);
    expect(companyTokens('Fifth Third Bank')).toEqual(['fifth', 'third', 'bank']);
  });
});

describe('mayFollowLink', () => {
  const expect_ = expectation({ company: 'Capital One', ats: 'workday' });

  it('follows a link on the ATS the application is on', () => {
    expect(mayFollowLink(expect_, 'https://capitalone.myworkday.com/verify/abc')).toBe(true);
  });

  it('follows a link on the employer’s own domain', () => {
    expect(mayFollowLink(expectation({ company: 'Databricks', ats: 'unknown' }), 'https://databricks.com/verify/x')).toBe(true);
  });

  it('refuses a link to anywhere else', () => {
    /* Anyone who knows the application address can send a verification email.
       Opening its link because the email said to is following instructions
       from outside the system. */
    expect(mayFollowLink(expect_, 'https://evil.example.com/verify/abc')).toBe(false);
    expect(mayFollowLink(expect_, 'https://capital-one-verify.ru/x')).toBe(false);
  });

  it('refuses anything that is not https', () => {
    expect(mayFollowLink(expect_, 'http://capitalone.myworkday.com/verify')).toBe(false);
    expect(mayFollowLink(expect_, 'javascript:alert(1)')).toBe(false);
    expect(mayFollowLink(expect_, 'not a url')).toBe(false);
  });
});
