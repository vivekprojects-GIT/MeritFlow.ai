process.env.SQLITE_PATH = './test-credentials.db';
process.env.CREDENTIAL_SECRET = 'test-secret-for-credentials-suite';

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

/**
 * A user's own API keys, against a real database.
 *
 * Two properties matter and neither can be checked by reading the code. First,
 * the key must not be in the row — a mocked database would happily prove a
 * round-trip through a table that stores plaintext. Second, a user's key must
 * actually reach the provider call; the wiring passes through four modules,
 * and a key that is stored perfectly and never used is the same to the learner
 * as no feature at all.
 */

let userId: string;
let other: string;
let store: typeof import('./credentials-store');

const ANTHROPIC = 'sk-ant-api03-vitestvitestvitest1234';
const SERP = 'serp-vitest-key-000000000000abcd';

beforeAll(async () => {
  const { getDb } = await import('./db');
  store = await import('./credentials-store');
  const db = await getDb();

  for (const id of [(userId = `cred-${randomUUID()}`), (other = `cred-${randomUUID()}`)]) {
    await db.query(
      'INSERT INTO users (id,email,password_hash,role,university_id,account_kind,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [id, `${id}@t.local`, 'x', 'student', null, 'personal', Date.now()],
    );
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('saving and reading a key', () => {
  it('stores the key as something other than the key', async () => {
    /* The property the whole module exists for. */
    await store.saveCredential(userId, 'anthropic', { secret: ANTHROPIC });

    const { getDb } = await import('./db');
    const db = await getDb();
    const res = await db.query<{ secret: string; last4: string }>(
      'SELECT secret, last4 FROM user_credentials WHERE user_id = $1 AND provider = $2',
      [userId, 'anthropic'],
    );

    expect(res.rows[0].secret).not.toContain(ANTHROPIC);
    expect(res.rows[0].secret).not.toContain('sk-ant');
    expect(res.rows[0].last4).toBe('1234');
  });

  it('gives the key back to server code that asks for it', async () => {
    const creds = await store.credentialsFor(userId);
    expect(creds.anthropicKey).toBe(ANTHROPIC);
  });

  it('never puts the key in the summary a route may return', async () => {
    const summary = await store.credentialSummary(userId);
    const row = summary.find((r) => r.provider === 'anthropic')!;

    expect(row.present).toBe(true);
    expect(row.hint).toBe('••••1234');
    expect(JSON.stringify(summary)).not.toContain(ANTHROPIC);
  });

  it('keeps one user out of another user\\u2019s keys', async () => {
    expect((await store.credentialsFor(other)).anthropicKey).toBeNull();
  });
});

describe('changing what is saved', () => {
  it('keeps the key when only the model changes', async () => {
    /* The form cannot show the saved key, so it submits an empty field
       whenever the learner only touched the model. Treating that as "erase"
       would delete a key every time someone switched model. */
    await store.saveCredential(userId, 'anthropic', { secret: '', model: 'claude-opus-5' });

    const creds = await store.credentialsFor(userId);
    expect(creds.anthropicKey).toBe(ANTHROPIC);
    expect(creds.anthropicModel).toBe('claude-opus-5');
  });

  it('replaces the key when a new one is given', async () => {
    await store.saveCredential(userId, 'anthropic', { secret: 'sk-ant-api03-replacementkey-9999' });
    const creds = await store.credentialsFor(userId);

    expect(creds.anthropicKey).toBe('sk-ant-api03-replacementkey-9999');
    /* And the model survives a key change, because they are separate choices. */
    expect(creds.anthropicModel).toBe('claude-opus-5');
  });

  it('forgets the key and its model together', async () => {
    await store.saveCredential(userId, 'serpapi', { secret: SERP });
    expect((await store.credentialsFor(userId)).serpApiKey).toBe(SERP);

    await store.deleteCredential(userId, 'serpapi');
    const creds = await store.credentialsFor(userId);

    expect(creds.serpApiKey).toBeNull();
    expect((await store.credentialSummary(userId)).find((r) => r.provider === 'serpapi')!.present).toBe(false);
  });
});

describe('the key actually reaches the provider', () => {
  it('sends the user\\u2019s SerpAPI key rather than the operator\\u2019s', async () => {
    /* Stored perfectly and never used is, to the learner, the same as no
       feature at all — so this checks the URL that leaves the process. */
    vi.stubEnv('SERPAPI_API_KEY', 'operator-key-should-not-be-used');
    vi.stubEnv('YOUTUBE_API_KEY', '');

    const seen: string[] = [];
    vi.stubGlobal('fetch', async (input: string | URL) => {
      seen.push(String(input));
      return new Response(JSON.stringify({ video_results: [] }), { status: 200 });
    });

    const { findBestVideo } = await import('./youtube');
    await findBestVideo('a query no other test used', { serpApiKey: 'learner-own-serp-key' });

    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain('learner-own-serp-key');
    expect(seen[0]).not.toContain('operator-key-should-not-be-used');
  });

  it('falls back to the operator key when the learner saved none', async () => {
    vi.stubEnv('SERPAPI_API_KEY', 'operator-key-in-use');
    vi.stubEnv('YOUTUBE_API_KEY', '');

    const seen: string[] = [];
    vi.stubGlobal('fetch', async (input: string | URL) => {
      seen.push(String(input));
      return new Response(JSON.stringify({ video_results: [] }), { status: 200 });
    });

    const { findBestVideo } = await import('./youtube');
    await findBestVideo('a different query no other test used', {});

    expect(seen[0]).toContain('operator-key-in-use');
  });

  it('turns cover art on for a learner with a key on an install with none', async () => {
    vi.stubEnv('SERPAPI_API_KEY', '');
    vi.stubEnv('SERP_API_KEY', '');

    const { coverLookupEnabled } = await import('./course-cover');
    expect(coverLookupEnabled(null)).toBe(false);
    expect(coverLookupEnabled('learner-own-key')).toBe(true);
  });
});
