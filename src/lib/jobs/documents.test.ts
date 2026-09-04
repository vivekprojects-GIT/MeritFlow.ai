process.env.SQLITE_PATH = './test-doctest.db';

import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';

/**
 * Documents and the plan allowance, against a real database.
 *
 * Uses its own PGlite directory — the app's is single-process, and sharing it
 * from a test runner corrupts it unrecoverably.
 */

let userId: string;
let docs: typeof import('./documents');
let usage: typeof import('./usage');

beforeAll(async () => {
  const { getDb } = await import('../db');
  docs = await import('./documents');
  usage = await import('./usage');

  const db = await getDb();
  userId = `doc-${randomUUID()}`;
  await db.query(
    'INSERT INTO users (id,email,password_hash,role,university_id,account_kind,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [userId, `${userId}@t.local`, 'x', 'student', null, 'personal', Date.now()],
  );
});

describe('documents', () => {
  it('starts empty', async () => {
    expect(await docs.listDocuments(userId)).toHaveLength(0);
  });

  it('creates a résumé and makes it active', async () => {
    const d = await docs.createDocument(userId, { kind: 'resume', name: 'Engineering', body: 'ML engineer.', isActive: true });
    expect(d.isActive).toBe(true);
    expect(d.kind).toBe('resume');
  });

  it('keeps exactly one résumé active', async () => {
    const second = await docs.createDocument(userId, { kind: 'resume', name: 'Data', body: 'Data scientist.' });
    await docs.setActive(userId, second.id);
    const all = await docs.listDocuments(userId);
    expect(all.filter((d) => d.kind === 'resume' && d.isActive)).toHaveLength(1);
    expect(all.find((d) => d.isActive)?.name).toBe('Data');
  });

  it('pushes the active résumé into the candidate profile', async () => {
    /* This is the link that matters: matching and tailoring read the profile,
       so an editor change that stopped here would show new text while every
       application still sent the old one. */
    const { getCandidateProfile } = await import('../jobs-store');
    expect((await getCandidateProfile(userId))?.resumeText).toBe('Data scientist.');
  });

  it('propagates an edit to the active résumé', async () => {
    const active = (await docs.listDocuments(userId)).find((d) => d.isActive)!;
    await docs.updateDocument(userId, active.id, { body: 'Senior data scientist.' });
    const { getCandidateProfile } = await import('../jobs-store');
    expect((await getCandidateProfile(userId))?.resumeText).toBe('Senior data scientist.');
  });

  it('promotes another résumé when the active one is deleted', async () => {
    const active = (await docs.listDocuments(userId)).find((d) => d.isActive)!;
    await docs.deleteDocument(userId, active.id);
    const rest = (await docs.listDocuments(userId)).filter((d) => d.kind === 'resume');
    expect(rest).toHaveLength(1);
    expect(rest[0].isActive).toBe(true);
  });

  it('keeps cover letters out of the active-résumé rule', async () => {
    const letter = await docs.createDocument(userId, { kind: 'cover_letter', name: 'Generic', body: 'Dear team,' });
    expect(await docs.setActive(userId, letter.id)).toBeNull();
  });
});

describe('the free-plan allowance', () => {
  it('starts unused', async () => {
    const u = await usage.getUsage(userId);
    expect(u.used).toBe(0);
    expect(u.exhausted).toBe(false);
    expect(u.remaining).toBe(usage.FREE_APPLICATIONS_PER_MONTH);
  });

  it('counts each recorded use', async () => {
    await usage.recordUsage(userId);
    await usage.recordUsage(userId);
    expect((await usage.getUsage(userId)).used).toBe(2);
  });

  it('reports exhaustion at the limit', async () => {
    for (let i = 2; i < usage.FREE_APPLICATIONS_PER_MONTH; i += 1) await usage.recordUsage(userId);
    const u = await usage.getUsage(userId);
    expect(u.remaining).toBe(0);
    expect(u.exhausted).toBe(true);
  });

  it('never reports a negative remainder', async () => {
    await usage.recordUsage(userId);
    expect((await usage.getUsage(userId)).remaining).toBe(0);
  });
});
