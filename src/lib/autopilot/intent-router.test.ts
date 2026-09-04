process.env.SQLITE_PATH = './test-router.db';

import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { INTENT_CATALOG } from './answer-vault';
import { routeQuestion } from './intent-router';

/**
 * The semantic router.
 *
 * Handing question-matching to a model is the right call — every intent used to
 * be a hand-written pattern and every new employer wording broke one. What has
 * to hold is the boundary: the model decides what a question *means* and never
 * what the answer is.
 *
 * These tests run without an API key, which exercises exactly the paths that
 * must work when the model is unavailable: patterns, cache, and refusal.
 */

let userId = '';

beforeAll(async () => {
  const { getDb } = await import('../db');
  const db = await getDb();
  userId = randomUUID();
  await db.query("INSERT INTO users (id,email,password_hash,role,created_at) VALUES ($1,$2,'x','student',$3)", [
    userId,
    `${userId}@example.test`,
    Date.now(),
  ]);
});

describe('the catalogue the model may choose from', () => {
  it('is closed, so a routing can only name something that exists', () => {
    expect(INTENT_CATALOG.length).toBeGreaterThan(20);
    for (const entry of INTENT_CATALOG) {
      expect(entry.intent).toMatch(/^[A-Z][A-Z_]*\.[A-Z_]+$/);
      expect(entry.sensitivity).toBeTruthy();
    }
  });

  it('carries no patterns, so the model cannot be steered by our regexes', () => {
    for (const entry of INTENT_CATALOG) {
      expect(Object.keys(entry).sort()).toEqual(['intent', 'sensitivity']);
    }
  });
});

describe('what the router refuses to route', () => {
  it('never sends consent to a model', async () => {
    /*
     * The line that matters most. Whether software may agree to something on a
     * person's behalf is not a question to delegate to a language model, so
     * anything the deterministic classifier reads as consent stops here and
     * goes to the authorization vault instead.
     */
    for (const q of [
      "I acknowledge Acme's Candidate Privacy Policy.",
      'I certify the information provided is accurate.',
      'Do you consent to a background check?',
      'I agree to binding arbitration.',
    ]) {
      const r = await routeQuestion(userId, q);
      expect(r.intent, q).toBeNull();
      expect(r.sensitivity, q).toBe('LEGAL_ATTESTATION');
      expect(r.via, q).toBe('none');
    }
  });

  it('answers from a pattern without spending a call when one matches', async () => {
    const r = await routeQuestion(userId, 'Are you authorized to work in the United States?');
    expect(r.via).toBe('pattern');
    expect(r.intent).toBe('WORK_AUTH.AUTHORIZED');
  });

  it('declines an empty question', async () => {
    expect((await routeQuestion(userId, '   ')).intent).toBeNull();
  });

  it('declines rather than throwing when no model is configured', async () => {
    /* A routing that cannot be decided is a question for the candidate, which
       is where it was going anyway — never an error that fails the run. */
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    const savedGateway = process.env.AI_GATEWAY_API_KEY;
    delete process.env.AI_GATEWAY_API_KEY;

    const r = await routeQuestion(userId, 'Which of our product lines have you used personally?');
    expect(r.intent).toBeNull();
    expect(r.via).toBe('none');

    if (saved) process.env.ANTHROPIC_API_KEY = saved;
    if (savedGateway) process.env.AI_GATEWAY_API_KEY = savedGateway;
  });
});

describe('routings are remembered', () => {
  it('reuses a stored decision instead of asking again', async () => {
    const { getDb } = await import('../db');
    const db = await getDb();

    /* Written directly, as a previous run's decision would have been. */
    await db.query(
      'INSERT INTO question_routes (user_id, route_key, question, intent, created_at) VALUES ($1,$2,$3,$4,$5)',
      [userId, 'whereabouts are you based', 'Whereabouts are you based?', 'PROFILE.CITY', Date.now()],
    );

    const r = await routeQuestion(userId, 'Whereabouts are you based?');
    expect(r.via).toBe('cache');
    expect(r.intent).toBe('PROFILE.CITY');
  });

  it('remembers a refusal, so an unanswerable question is not re-asked forever', async () => {
    const { getDb } = await import('../db');
    const db = await getDb();

    await db.query(
      'INSERT INTO question_routes (user_id, route_key, question, intent, created_at) VALUES ($1,$2,$3,$4,$5)',
      [userId, 'what is the job code number in the posting', 'What is the job code number?', '', Date.now()],
    );

    const r = await routeQuestion(userId, 'What is the job code number in the posting?');
    expect(r.via).toBe('cache');
    expect(r.intent).toBeNull();
  });

  it('normalises wording that differs only in decoration', async () => {
    /* "Whereabouts are you based? *" and "(required)" are the same question. */
    const r = await routeQuestion(userId, '  Whereabouts are you based?  *');
    expect(r.via).toBe('cache');
    expect(r.intent).toBe('PROFILE.CITY');
  });
});
