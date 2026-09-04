process.env.SQLITE_PATH = './test-consent.db';

import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { classifyQuestion, NEVER_BLANKET_AUTHORIZED } from './question-class';
import { checkAuthorization, grantAuthorization, hashText, revokeAuthorization } from './authorization';

/**
 * Consent.
 *
 * The property under test is one sentence: software must never agree to
 * anything on a person's behalf that the person did not agree to first. Every
 * test here is an attempt to get it to, and every one must fail.
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

describe('classification routes a question to the rule allowed to answer it', () => {
  it('reads consent shapes as consent', () => {
    for (const q of [
      "I acknowledge Cloudflare's Candidate Privacy Policy.",
      'I certify that the information provided is accurate.',
      'Do you consent to a background check?',
      'I agree to the terms and conditions.',
      'Please type your full name to sign electronically.',
      'I agree to resolve disputes through binding arbitration.',
    ]) {
      expect(classifyQuestion(q).kind, q).toBe('CONSENT_ATTESTATION');
    }
  });

  it('resolves ambiguity toward consent, never away from it', () => {
    /*
     * The two mistakes are not the same size. Reading an attestation as a fact
     * means agreeing to it automatically; reading a fact as an attestation
     * means one unnecessary question. So a question that is both wins for
     * consent.
     */
    expect(classifyQuestion('I certify I am authorized to work in the US.').kind).toBe('CONSENT_ATTESTATION');
    expect(classifyQuestion('I acknowledge my start date is negotiable.').kind).toBe('CONSENT_ATTESTATION');
  });

  it('separates facts from preferences', () => {
    expect(classifyQuestion('Are you currently located in Canada?').kind).toBe('FACTUAL');
    expect(classifyQuestion('How many years of Python experience do you have?').kind).toBe('FACTUAL');
    expect(classifyQuestion('Are you authorized to work in the United States?').kind).toBe('FACTUAL');

    expect(classifyQuestion('How did you hear about this job?').kind).toBe('PREFERENCE');
    expect(classifyQuestion('Are you willing to relocate?').kind).toBe('PREFERENCE');
    expect(classifyQuestion('What are your salary expectations?').kind).toBe('PREFERENCE');
  });

  it('sends prose to the evidence-checked path', () => {
    expect(classifyQuestion('Why do you want to work here?').kind).toBe('OPEN_ENDED');
    expect(classifyQuestion('Tell us about a project you are proud of.').kind).toBe('OPEN_ENDED');
    expect(classifyQuestion('Anything else?', 'textarea').kind).toBe('OPEN_ENDED');
  });

  it('sends anything it does not recognise to the candidate', () => {
    expect(classifyQuestion('Which of our products have you used?').kind).toBe('UNKNOWN');
    expect(classifyQuestion('').kind).toBe('UNKNOWN');
  });
});

describe('consent cannot be inferred', () => {
  const TEXT = "I acknowledge Acme's Candidate Privacy Policy.";

  it('refuses when nothing has been authorized', async () => {
    const check = await checkAuthorization(userId, { type: 'POLICY', scope: 'Acme', exactText: TEXT });
    expect(check.allowed).toBe(false);
  });

  it('allows only after the candidate explicitly grants it', async () => {
    await grantAuthorization(userId, {
      type: 'POLICY',
      scope: 'Acme',
      exactText: TEXT,
      authorizedByUser: true,
    });

    const check = await checkAuthorization(userId, { type: 'POLICY', scope: 'Acme', exactText: TEXT });
    expect(check.allowed).toBe(true);
  });

  it('refuses to record consent nobody gave', async () => {
    /* There is deliberately no way to write a row claiming consent that was
       not given. A caller that wants one has to lie visibly. */
    await expect(
      grantAuthorization(userId, {
        type: 'POLICY',
        scope: 'Acme',
        exactText: TEXT,
        authorizedByUser: false as unknown as true,
      }),
    ).rejects.toThrow(/explicit act/i);
  });

  it('stops when the employer rewrites the wording', async () => {
    /*
     * Consent to a document is not consent to its successor. When the checkbox
     * text changes the stored hash stops matching and the run goes back to the
     * candidate — which is the entire reason the text is hashed.
     */
    const check = await checkAuthorization(userId, {
      type: 'POLICY',
      scope: 'Acme',
      exactText: "I acknowledge Acme's Candidate Privacy Policy and consent to international data transfer.",
    });
    expect(check.allowed).toBe(false);
    expect(check.allowed === false && check.reason).toMatch(/wording/i);
  });

  it('ignores whitespace and case, which carry no meaning', async () => {
    const check = await checkAuthorization(userId, {
      type: 'POLICY',
      scope: 'Acme',
      exactText: "  I ACKNOWLEDGE   Acme's Candidate Privacy Policy.  ",
    });
    expect(check.allowed).toBe(true);
  });

  it('does not let one employer authorization cover another', async () => {
    const check = await checkAuthorization(userId, { type: 'POLICY', scope: 'Globex', exactText: TEXT });
    expect(check.allowed).toBe(false);
  });

  it('stops the moment the candidate revokes it', async () => {
    const granted = await grantAuthorization(userId, {
      type: 'ACKNOWLEDGEMENT',
      scope: 'Initech',
      exactText: 'I acknowledge the applicant notice.',
      authorizedByUser: true,
    });

    expect(
      (await checkAuthorization(userId, { type: 'ACKNOWLEDGEMENT', scope: 'Initech', exactText: 'I acknowledge the applicant notice.' })).allowed,
    ).toBe(true);

    await revokeAuthorization(userId, granted.id);

    expect(
      (await checkAuthorization(userId, { type: 'ACKNOWLEDGEMENT', scope: 'Initech', exactText: 'I acknowledge the applicant notice.' })).allowed,
    ).toBe(false);
  });

  it('stops when the authorization has expired', async () => {
    await grantAuthorization(userId, {
      type: 'ACKNOWLEDGEMENT',
      scope: 'Expired Co',
      exactText: 'I acknowledge the notice.',
      authorizedByUser: true,
      expiresAt: Date.now() - 1000,
    });

    const check = await checkAuthorization(userId, {
      type: 'ACKNOWLEDGEMENT',
      scope: 'Expired Co',
      exactText: 'I acknowledge the notice.',
    });
    expect(check.allowed).toBe(false);
  });

  it('stops when the linked policy document has changed', async () => {
    await grantAuthorization(userId, {
      type: 'POLICY',
      scope: 'Hooli',
      exactText: 'I acknowledge the privacy policy.',
      policyUrl: 'https://hooli.example/privacy',
      policyHash: 'aaaa',
      authorizedByUser: true,
    });

    const same = await checkAuthorization(userId, {
      type: 'POLICY',
      scope: 'Hooli',
      exactText: 'I acknowledge the privacy policy.',
      policyHash: 'aaaa',
    });
    expect(same.allowed).toBe(true);

    const changed = await checkAuthorization(userId, {
      type: 'POLICY',
      scope: 'Hooli',
      exactText: 'I acknowledge the privacy policy.',
      policyHash: 'bbbb',
    });
    expect(changed.allowed).toBe(false);
    expect(changed.allowed === false && changed.reason).toMatch(/policy document has changed/i);
  });
});

describe('what may never be authorized in bulk', () => {
  it('refuses a class-wide grant for consent that outlives the application', async () => {
    /*
     * A candidate can reasonably say "acknowledge any employer's candidate
     * privacy notice" — its effect is confined to processing this application.
     * They cannot reasonably pre-authorize arbitration or an IP assignment for
     * every employer forever, against terms nobody has read.
     */
    for (const type of ['ARBITRATION', 'IP_ASSIGNMENT', 'NON_COMPETE', 'BACKGROUND_CHECK']) {
      await expect(
        grantAuthorization(userId, {
          type,
          scope: '*',
          exactText: 'I agree.',
          authorizedByUser: true,
        }),
      ).rejects.toThrow(/cannot be authorized as a class/i);
    }
  });

  it('allows a class-wide grant for an ordinary acknowledgement', async () => {
    const granted = await grantAuthorization(userId, {
      type: 'POLICY',
      scope: '*',
      exactText: 'any candidate privacy policy',
      authorizedByUser: true,
    });
    expect(granted.scope).toBe('*');

    /* And it then covers an employer and wording it has never seen. */
    const check = await checkAuthorization(userId, {
      type: 'POLICY',
      scope: 'Some New Employer',
      exactText: "I acknowledge Some New Employer's candidate privacy notice.",
    });
    expect(check.allowed).toBe(true);
  });

  it('names every type that requires the exact item', () => {
    expect([...NEVER_BLANKET_AUTHORIZED].sort()).toEqual(
      ['ARBITRATION', 'BACKGROUND_CHECK', 'IP_ASSIGNMENT', 'LEGALLY_BOUND', 'NON_COMPETE', 'RELEASE', 'SIGNATURE'].sort(),
    );
  });
});

describe('hashText', () => {
  it('is stable across formatting and sensitive to every word', () => {
    expect(hashText('I agree to the terms.')).toBe(hashText('  i agree   to the terms.  '));
    expect(hashText('I agree to the terms.')).not.toBe(hashText('I agree to the revised terms.'));
  });
});
