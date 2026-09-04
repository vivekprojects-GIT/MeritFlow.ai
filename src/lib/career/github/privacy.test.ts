import { describe, expect, it } from 'vitest';
import { classifyRepo, findSecret, redact } from './privacy';
import type { GitHubRepo } from './types';

/**
 * The gate on what reaches a public page under someone's real name.
 *
 * Written from the direction that costs something. A repository wrongly
 * excluded is a missing card on a portfolio; a repository wrongly included can
 * be an employer's internal code, or a live key, indexed by search engines
 * under the candidate's own domain. Those are not comparable, so every case
 * here is about the second kind.
 */

function repo(over: Partial<GitHubRepo> = {}): GitHubRepo {
  return {
    id: 1,
    name: 'invoice-parser',
    full_name: 'saivivek/invoice-parser',
    owner: { login: 'saivivek', type: 'User' },
    private: false,
    fork: false,
    archived: false,
    description: 'Parses invoices',
    html_url: 'https://github.com/saivivek/invoice-parser',
    homepage: null,
    language: 'Python',
    topics: [],
    stargazers_count: 0,
    forks_count: 0,
    size: 100,
    pushed_at: '2026-06-01T00:00:00Z',
    created_at: '2025-01-01T00:00:00Z',
    license: null,
    has_pages: false,
    ...over,
  };
}

describe('classifyRepo', () => {
  it('publishes the candidate’s own public work', () => {
    const verdict = classifyRepo(repo(), 'saivivek');
    expect(verdict).toEqual({ allowed: true, kind: 'own-public', reason: '' });
  });

  it('matches the username case-insensitively', () => {
    expect(classifyRepo(repo(), 'SaiVivek').allowed).toBe(true);
  });

  it('never publishes a private repository', () => {
    /* Being able to read it through an authorised token is not permission to
       republish it. */
    const verdict = classifyRepo(repo({ private: true }), 'saivivek');
    expect(verdict.allowed).toBe(false);
    expect(verdict.kind).toBe('private');
  });

  it('never publishes an organisation repository as the candidate’s own', () => {
    /* "Open source we did at work" and "the employer's internal repo" are
       indistinguishable from the API, so both are contributions, not projects. */
    const verdict = classifyRepo(
      repo({ owner: { login: 'fifth-third-bank', type: 'Organization' } }),
      'saivivek',
    );
    expect(verdict.allowed).toBe(false);
    expect(verdict.kind).toBe('contribution');
    expect(verdict.reason).toContain('fifth-third-bank');
  });

  it('never publishes a fork as original work', () => {
    const verdict = classifyRepo(repo({ fork: true }), 'saivivek');
    expect(verdict.allowed).toBe(false);
    expect(verdict.kind).toBe('fork');
  });

  it('publishes nothing at all when no username is connected', () => {
    /* Without a login there is no way to tell the candidate's work from anyone
       else's, and the safe reading of that is "publish nothing". */
    expect(classifyRepo(repo(), '').allowed).toBe(false);
    expect(classifyRepo(repo(), '   ').kind).toBe('unknown');
  });

  it('holds back a repository whose own description leaks a key', () => {
    const verdict = classifyRepo(
      repo({ description: 'Demo app, key AKIAIOSFODNN7EXAMPLE' }),
      'saivivek',
    );
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toContain('AWS access key');
  });
});

describe('findSecret', () => {
  it.each([
    ['AKIAIOSFODNN7EXAMPLE', 'an AWS access key id'],
    ['ghp_1234567890abcdefghijklmnopqrstuvwx', 'a GitHub token'],
    ['sk-abcdefghijklmnopqrstuvwxyz012345', 'an API secret key'],
    ['-----BEGIN RSA PRIVATE KEY-----', 'a private key block'],
    ['api_key = "abcdefghijklmnop1234"', 'a hard-coded credential'],
  ])('recognises %s', (text, expected) => {
    expect(findSecret(`some text ${text} more text`)).toBe(expected);
  });

  it('does not cry wolf on ordinary prose', () => {
    expect(findSecret('A password manager built with Python and Postgres')).toBeNull();
    expect(findSecret('')).toBeNull();
  });
});

describe('redact', () => {
  it('removes every occurrence, not just the first', () => {
    const out = redact('AKIAIOSFODNN7EXAMPLE and AKIAIOSFODNN7EXAMPLB');
    expect(out).not.toContain('AKIA');
    expect(out.match(/\[redacted\]/g)).toHaveLength(2);
  });

  it('leaves clean text untouched', () => {
    expect(redact('An invoice parser in Python')).toBe('An invoice parser in Python');
  });
});
