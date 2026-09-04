process.env.SQLITE_PATH = './test-backfill.db';

import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';

/**
 * The backfill, against a real database.
 *
 * This is the path that decides whether an existing candidate sees the new
 * editor or the old textarea, so it is tested through the same functions the
 * route calls rather than in isolation.
 */

let userId: string;
let docs: typeof import('./documents');

const RESUME = `Jane Doe
Senior Data Engineer
Austin, TX | jane@example.com

SKILLS
Programming Languages: Python, SQL

WORK EXPERIENCE
Acme | Data Engineer | Remote | Jan 2022 - Present
- Built streaming pipelines handling 2M events a day.
`;

beforeAll(async () => {
  const { getDb } = await import('../db');
  docs = await import('./documents');
  const db = await getDb();
  userId = `bf-${randomUUID()}`;
  await db.query(
    'INSERT INTO users (id,email,password_hash,role,university_id,account_kind,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [userId, `${userId}@t.local`, 'x', 'student', null, 'personal', Date.now()],
  );
});

describe('backfillStructured', () => {
  it('leaves a résumé created before the column with no structure', async () => {
    const { getDb } = await import('../db');
    const db = await getDb();
    const id = randomUUID();
    /* Written the way a row predating the column looks: body only. */
    await db.query(
      `INSERT INTO documents (id, user_id, kind, name, body, is_active, created_at, updated_at)
       VALUES ($1,$2,'resume','Old résumé',$3,TRUE,$4,$4)`,
      [id, userId, RESUME, Date.now()],
    );
    const before = (await docs.listDocuments(userId)).find((d) => d.id === id);
    expect(before?.structured).toBeNull();
  });

  it('gives it structure on the next read', async () => {
    await docs.backfillStructured(userId);
    const after = (await docs.listDocuments(userId))[0];
    expect(after.structured).not.toBeNull();
    expect(after.structured?.contact.name).toBe('Jane Doe');
    expect(after.structured?.contact.headline).toBe('Senior Data Engineer');
    expect(after.structured?.experience[0].company).toBe('Acme');
    expect(after.structured?.skills[0].label).toBe('Programming Languages');
  });

  it('leaves the original text alone', async () => {
    /* The parse is additive. Rewriting the body from a parse that missed
       something would lose it permanently. */
    const after = (await docs.listDocuments(userId))[0];
    expect(after.body).toBe(RESUME);
  });

  it('does not re-parse a document that already has structure', async () => {
    const before = (await docs.listDocuments(userId))[0];
    const edited = { ...before.structured!, summary: 'Edited by hand.' };
    await docs.updateDocument(userId, before.id, { structured: edited });

    await docs.backfillStructured(userId);
    const after = (await docs.listDocuments(userId))[0];
    expect(after.structured?.summary).toBe('Edited by hand.');
  });

  it('skips a document too short to be worth parsing', async () => {
    const { getDb } = await import('../db');
    const db = await getDb();
    const id = randomUUID();
    await db.query(
      `INSERT INTO documents (id, user_id, kind, name, body, is_active, created_at, updated_at)
       VALUES ($1,$2,'resume','Stub','hi',FALSE,$3,$3)`,
      [id, userId, Date.now()],
    );
    await docs.backfillStructured(userId);
    const stub = (await docs.listDocuments(userId)).find((d) => d.id === id);
    expect(stub?.structured).toBeNull();
  });
});
