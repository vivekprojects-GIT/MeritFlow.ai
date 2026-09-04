process.env.SQLITE_PATH = './test-career.db';

import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { AnalysedRepo } from './github/types';

/**
 * The career-identity storage, against a real database.
 *
 * The schema additions this feature needs — three columns on `users` and two
 * tables — only exist if the migration block actually ran, and PGlite applies
 * it once when the connection is created. A unit test with a mocked database
 * would pass against a schema that is not there, which is precisely the failure
 * worth catching here.
 */

let userId: string;
let store: typeof import('./store');

function repo(over: Partial<AnalysedRepo> = {}): AnalysedRepo {
  return {
    id: 1,
    name: 'thing',
    title: 'Thing',
    url: 'https://github.com/x/thing',
    demoUrl: '',
    description: '',
    tech: [],
    signals: [],
    languages: [],
    stars: 0,
    updatedAt: 0,
    readme: {
      present: false,
      words: 0,
      hasHeadings: false,
      hasCodeBlocks: false,
      hasImages: false,
      hasInstall: false,
      hasUsage: false,
      score: 0,
      suggestions: [],
    },
    score: 0,
    publish: { allowed: true, kind: 'own-public', reason: '' },
    ...over,
  };
}

beforeAll(async () => {
  const { getDb } = await import('../db');
  store = await import('./store');
  const db = await getDb();
  userId = `career-${randomUUID()}`;
  await db.query(
    'INSERT INTO users (id,email,password_hash,role,university_id,account_kind,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [userId, `${userId}@t.local`, 'x', 'student', null, 'personal', Date.now()],
  );
});

describe('career links', () => {
  it('starts empty rather than guessing', async () => {
    expect(await store.getCareerLinks(userId)).toEqual({ github: '', linkedin: '', portfolio: '' });
  });

  it('saves only the keys it was given', async () => {
    /* Spreading a partial over the row would blank the siblings the caller
       never mentioned — the bug that once wiped a user's job settings. */
    await store.saveCareerLinks(userId, { github: 'https://github.com/saivivek' });
    await store.saveCareerLinks(userId, { linkedin: 'https://linkedin.com/in/saivivek' });

    const links = await store.getCareerLinks(userId);
    expect(links.github).toBe('https://github.com/saivivek');
    expect(links.linkedin).toBe('https://linkedin.com/in/saivivek');
  });

  it('allows clearing a link', async () => {
    await store.saveCareerLinks(userId, { linkedin: '' });
    expect((await store.getCareerLinks(userId)).linkedin).toBe('');
  });
});

describe('github snapshots', () => {
  it('round-trips analysed repositories', async () => {
    await store.saveSnapshot(userId, { username: 'saivivek', repos: [repo({ id: 7, name: 'parser' })] });
    const snapshot = await store.getSnapshot(userId);

    expect(snapshot?.username).toBe('saivivek');
    expect(snapshot?.repos.map((r) => r.name)).toEqual(['parser']);
    expect(snapshot?.fetchedAt).toBeGreaterThan(0);
  });

  it('keeps the previous repositories when a read fails', async () => {
    /* A rate limit must not empty somebody's portfolio. */
    const before = (await store.getSnapshot(userId))!.repos;
    await store.saveSnapshot(userId, { username: 'saivivek', repos: before, error: 'rate limited' });

    const after = await store.getSnapshot(userId);
    expect(after?.error).toBe('rate limited');
    expect(after?.repos).toHaveLength(before.length);
  });
});

describe('portfolios', () => {
  it('replaces the whole set on a rebuild', async () => {
    /* All-or-nothing, so variants cannot drift out of step with each other. */
    await store.savePortfolios(userId, [
      { slug: '', title: 'Overview', html: '<p>a</p>', projectIds: [1, 2] },
      { slug: 'ai', title: 'AI', html: '<p>b</p>', projectIds: [1] },
    ]);
    expect((await store.listPortfolios(userId)).map((p) => p.slug)).toEqual(['', 'ai']);

    await store.savePortfolios(userId, [{ slug: '', title: 'Overview', html: '<p>c</p>', projectIds: [] }]);
    const after = await store.listPortfolios(userId);
    expect(after).toHaveLength(1);
    expect(after[0].html).toBe('<p>c</p>');
  });

  it('clears every page when there is nothing publishable left', async () => {
    /* A portfolio still listing a repository the candidate has since made
       private is exactly what the privacy gate exists to prevent. */
    await store.savePortfolios(userId, []);
    expect(await store.listPortfolios(userId)).toEqual([]);
  });
});
