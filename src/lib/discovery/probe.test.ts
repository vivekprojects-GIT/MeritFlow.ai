import { describe, expect, it } from 'vitest';
import { candidateTokens, probeBoards } from './probe';

/**
 * Guess-and-verify.
 *
 * Guessing is forbidden everywhere else in this system because nothing can
 * check the guess. Here the vendor can, so the property under test is not "does
 * it find boards" — it is "does it ever accept one the vendor did not confirm".
 */

describe('candidateTokens', () => {
  it('takes the registrable label from the careers domain', () => {
    expect(candidateTokens({ name: 'Stripe', careerUrl: 'https://stripe.com/jobs/search' })).toContain('stripe');
    expect(candidateTokens({ name: 'Instacart', careerUrl: 'https://instacart.careers/openings' })).toContain(
      'instacart',
    );
  });

  it('looks past a careers or jobs subdomain', () => {
    expect(candidateTokens({ name: 'Acme', careerUrl: 'https://careers.acme.com/' })).toContain('acme');
  });

  it('tries the name with the corporate suffix removed', () => {
    /* "Scale AI" runs a board called `scaleai`, but plenty of companies drop
       the suffix, so both spellings are worth one request each. */
    const tokens = candidateTokens({ name: 'Scale AI', careerUrl: 'https://scale.com/careers' });
    expect(tokens).toContain('scale');
    expect(tokens).toContain('scaleai');
  });

  it('stays within a small budget', () => {
    /* Every candidate is a request to somebody's API, and the hit rate past
       the first few is not worth what it costs them. */
    expect(candidateTokens({ name: 'A Very Long Company Name Ltd' }).length).toBeLessThanOrEqual(4);
  });

  it('produces nothing unusable', () => {
    expect(candidateTokens({ name: '!' })).toEqual([]);
  });
});

/** A vendor that answers for exactly one token, and 404s for everything else. */
const vendor = (liveToken: string, jobs: unknown = { jobs: [{ id: 1 }] }) => {
  const calls: string[] = [];
  const impl = (async (url: string) => {
    calls.push(String(url));
    const ok = String(url).includes(`/${liveToken}`);
    return { ok, json: async () => (ok ? jobs : {}) };
  }) as unknown as typeof fetch;
  return { impl, calls };
};

describe('probeBoards', () => {
  it('accepts a token the vendor confirms has postings', async () => {
    const { impl } = vendor('stripe');
    await expect(probeBoards({ name: 'Stripe', careerUrl: 'https://stripe.com/jobs' }, impl)).resolves.toMatchObject({
      ats: 'greenhouse',
      identifier: 'stripe',
      collectable: true,
    });
  });

  it('refuses a board that answers but is empty', async () => {
    /*
     * The important one. Vendors return 200 with zero postings for tokens that
     * were never theirs, and accepting that would put a company in the registry
     * that can never collect anything — indistinguishable, on the coverage
     * screen, from one that simply has no openings today.
     */
    const { impl } = vendor('stripe', { jobs: [] });
    await expect(probeBoards({ name: 'Stripe', careerUrl: 'https://stripe.com/jobs' }, impl)).resolves.toMatchObject({
      identifier: '',
    });
  });

  it('claims nothing when every candidate misses', async () => {
    const { impl } = vendor('__nothing__');
    const result = await probeBoards({ name: 'Acme', careerUrl: 'https://acme.com/careers' }, impl);
    expect(result.identifier).toBe('');
    expect(result.candidatesTried).toBeGreaterThan(0);
  });

  it('stops at the first confirmed board', async () => {
    /* A company is on one board. Continuing after a match is only a way to
       find a second, wrong answer. */
    const { impl, calls } = vendor('acme');
    await probeBoards({ name: 'Acme', careerUrl: 'https://acme.com/careers' }, impl);
    expect(calls.filter((c) => c.includes('/acme')).length).toBe(1);
  });

  it('treats a network failure as a miss, not an error', async () => {
    const failing = (async () => {
      throw new Error('ECONNRESET');
    }) as unknown as typeof fetch;

    await expect(probeBoards({ name: 'Acme', careerUrl: 'https://acme.com/careers' }, failing)).resolves.toMatchObject({
      identifier: '',
    });
  });
});
