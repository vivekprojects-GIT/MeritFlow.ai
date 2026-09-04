process.env.SQLITE_PATH = './test-ext.db';

import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

/**
 * The contract between the extension and the server.
 *
 * The extension is hands and eyes: it types what comes back from here and has
 * no opinion of its own. So this endpoint is the only thing deciding what may
 * be said on someone's application, and the cases worth pinning are the ones
 * where the right answer is a refusal.
 */

let userId = '';
let token = '';

async function post(body: unknown, bearer = token) {
  const { POST } = await import('./route');
  return POST(
    new Request('http://localhost/api/extension/fill', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${bearer}` },
      body: JSON.stringify(body),
    }),
  );
}

const ask = (fields: { id: string; label: string; required?: boolean; kind?: string }[]) => ({ fields });

beforeAll(async () => {
  const { getDb } = await import('@/lib/db');
  const db = await getDb();
  const now = Date.now();
  userId = `ext-${randomUUID()}`;

  await db.query(
    `INSERT INTO users (id,email,password_hash,role,university_id,account_kind,created_at,name,phone)
     VALUES ($1,$2,'x','student',NULL,'personal',$3,$4,$5)`,
    [userId, `${userId}@t.local`, now, 'Sai Vivek Katkuri', '+1 469 454 8320'],
  );

  const { ensureExtensionToken } = await import('@/lib/job-settings');
  token = await ensureExtensionToken(userId);

  const { saveAnswer } = await import('@/lib/autopilot/answer-vault');
  await saveAnswer(userId, {
    intent: 'WORK_AUTH.AUTHORIZED',
    value: 'Yes (United States)',
    provenance: 'USER_VERIFIED',
    verified: true,
    sensitivity: 'NORMAL_FACT',
  });
}, 120_000);

describe('authentication', () => {
  it('refuses an unknown token', async () => {
    const res = await post(ask([{ id: 'email', label: 'Email' }]), 'not-a-real-token-but-long-enough-xx');
    expect(res.status).toBe(401);
  });

  it('refuses no token at all', async () => {
    const res = await post(ask([{ id: 'email', label: 'Email' }]), '');
    expect(res.status).toBe(401);
  });
});

describe('what it answers', () => {
  it('fills identity from the profile', async () => {
    const body = (await (await post(ask([
      { id: 'first_name', label: 'First name' },
      { id: 'last_name', label: 'Last name' },
      { id: 'phone', label: 'Phone' },
    ]))).json()) as { answers: { field: string; value: string }[] };

    const byField = Object.fromEntries(body.answers.map((a) => [a.field, a.value]));
    expect(byField.first_name).toBe('Sai');
    expect(byField.last_name).toBe('Vivek Katkuri');
    expect(byField.phone).toContain('469');
  });

  it('answers a recognised question from the vault', async () => {
    const body = (await (await post(ask([
      { id: 'work_auth', label: 'Are you legally authorized to work in the US?' },
    ]))).json()) as { answers: { field: string; value: string; source: string }[] };

    expect(body.answers[0]).toMatchObject({ field: 'work_auth', value: 'Yes (United States)', source: 'vault' });
  });
});

describe('what it refuses', () => {
  it('never invents an answer to a question nobody has answered', async () => {
    /* The failure this whole design exists to prevent. */
    const body = (await (await post(ask([
      { id: 'k8s', label: 'Years of experience with Kubernetes', required: true },
    ]))).json()) as { answers: unknown[]; blocked: { field: string; reason: string }[] };

    expect(body.answers).toHaveLength(0);
    expect(body.blocked[0].field).toBe('k8s');
    expect(body.blocked[0].reason).toBeTruthy();
  });

  it('never claims to fill a file input', async () => {
    /* A path typed into a file field does nothing except look like it worked. */
    const body = (await (await post(ask([{ id: 'resume', label: 'Resume', kind: 'file' }]))).json()) as {
      answers: unknown[];
      blocked: { reason: string }[];
    };

    expect(body.answers).toHaveLength(0);
    expect(body.blocked[0].reason).toContain('Attach your résumé');
  });

  it('refuses a legal attestation whatever is stored', async () => {
    const body = (await (await post(ask([
      { id: 'certify', label: 'I certify the information above is true', required: true },
    ]))).json()) as { answers: unknown[]; blocked: { reason: string }[] };

    expect(body.answers).toHaveLength(0);
    expect(body.blocked[0].reason).toMatch(/only you|no verified/i);
  });

  it('reports a profile field it does not hold rather than guessing', async () => {
    const body = (await (await post(ask([{ id: 'linkedin', label: 'LinkedIn' }]))).json()) as {
      answers: unknown[];
      blocked: { field: string }[];
    };

    expect(body.answers).toHaveLength(0);
    expect(body.blocked.map((b) => b.field)).toContain('linkedin');
  });
});

describe('input handling', () => {
  it('survives a page with no fields', async () => {
    const body = (await (await post(ask([]))).json()) as { answers: unknown[] };
    expect(body.answers).toEqual([]);
  });

  it('ignores malformed field entries rather than failing the whole page', async () => {
    const res = await post({ fields: [{ id: '' }, { id: 'email', label: 'Email' }, null] });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { answers: { field: string }[] };
    expect(body.answers.map((a) => a.field)).toEqual(['email']);
  });
});
