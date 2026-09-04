process.env.SQLITE_PATH = './test-pipeline.db';

import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { applicationKey, canTransition, STATES, type RunState } from './state-machine';
import { confidenceFor } from './audit';

/**
 * The pipeline's invariants.
 *
 * Everything here is a property that must hold for an application to be sent
 * without a person watching: the machine cannot skip verification, the same
 * role cannot be applied to twice, a stop reason is classified into something
 * actionable, and no value reaches a form without a source.
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

describe('the state machine cannot be short-circuited', () => {
  it('has no path from discovery to submission that skips verification', () => {
    /*
     * The property the whole engine rests on. Verification is the only door
     * into the queue, and the queue is the only way to filling — so a bug that
     * adds a convenient shortcut somewhere would be caught here rather than by
     * an employer receiving an unverified application.
     */
    const reachable = (from: RunState, without: RunState): boolean => {
      const seen = new Set<RunState>([from]);
      const stack: RunState[] = [from];
      while (stack.length > 0) {
        const at = stack.pop()!;
        if (at === 'SUBMITTING') return true;
        for (const next of STATES) {
          if (next === without || seen.has(next)) continue;
          if (canTransition(at, next)) {
            seen.add(next);
            stack.push(next);
          }
        }
      }
      return false;
    };

    expect(reachable('DISCOVERED', 'VERIFIED')).toBe(false);
    /* And the normal path does exist, so the test above is not vacuous. */
    expect(reachable('DISCOVERED', 'SKIPPED')).toBe(true);
  });

  it('never allows a submitted application back into preparation', () => {
    for (const state of ['SUBMITTED', 'CONFIRMED', 'REJECTED', 'OFFER'] as const) {
      for (const target of ['PREPARING', 'QUEUED', 'FILLING', 'SUBMITTING'] as const) {
        expect(canTransition(state, target), `${state} -> ${target}`).toBe(false);
      }
    }
  });

  it('lets a retryable failure back in and a final one only out', () => {
    /* Back in at PREPARING, not at RETRYING: a failure during preparation was
       never verified, and RETRYING is a second attempt at something that
       already was. */
    expect(canTransition('FAILED_RETRYABLE', 'PREPARING')).toBe(true);
    expect(canTransition('FAILED_RETRYABLE', 'RETRYING')).toBe(false);
    expect(canTransition('FAILED_FINAL', 'PREPARING')).toBe(false);
    expect(canTransition('FAILED_FINAL', 'SKIPPED')).toBe(true);
  });

  it('only reaches RETRYING from states that have already been verified', () => {
    const enterers = STATES.filter((from) => canTransition(from, 'RETRYING'));
    expect(enterers.sort()).toEqual(['FILLING', 'SUBMITTING']);
  });

  it('gives every human-blocked state a way back', () => {
    /* A run that parks for a person and cannot resume is a run the candidate
       fixes and then watches sit there. */
    for (const state of ['CAPTCHA_REQUIRED', 'MFA_REQUIRED', 'ACCOUNT_REQUIRED', 'NEEDS_USER_ACTION'] as const) {
      const out = STATES.filter((t) => canTransition(state, t));
      expect(out.length, `${state} has no exit`).toBeGreaterThan(0);
      expect(out).toContain('SKIPPED');
    }
  });
});

describe('one application per role, whichever row it arrived in', () => {
  const key = (company: string, title: string) => applicationKey({ userId, company, title });

  it('treats the same role at the same company as one application', () => {
    /*
     * The gap the per-job guard cannot see. The same posting reaching the
     * corpus twice — an embedded board and a direct link, or a re-ingest under
     * a new id — produced two runs that each believed they were the first.
     */
    expect(key('GitLab', 'Backend Engineer, Geo Team')).toBe(key('GitLab', 'Backend Engineer, Geo Team'));
  });

  it('ignores the decoration boards put around a title', () => {
    expect(key('GitLab', 'Backend Engineer (Remote)')).toBe(key('GitLab', 'Backend Engineer'));
    expect(key('GitLab', 'Backend Engineer [REQ-4482]')).toBe(key('GitLab', 'Backend Engineer'));
    expect(key('Stripe', 'Senior  Engineer')).toBe(key('Stripe', 'senior engineer'));
  });

  it('keeps genuinely different roles apart', () => {
    /* The failure mode in the other direction: normalising so hard that two
       real openings collapse, and the candidate is silently prevented from
       applying to the second one. */
    expect(key('GitLab', 'Backend Engineer')).not.toBe(key('GitLab', 'Frontend Engineer'));
    expect(key('GitLab', 'Backend Engineer')).not.toBe(key('Stripe', 'Backend Engineer'));
    expect(key('GitLab', 'Senior Backend Engineer')).not.toBe(key('GitLab', 'Backend Engineer'));
  });

  it('is per candidate', () => {
    const other = applicationKey({ userId: randomUUID(), company: 'GitLab', title: 'Backend Engineer' });
    expect(key('GitLab', 'Backend Engineer')).not.toBe(other);
  });
});

describe('the audit trail records a basis for every value', () => {
  it('ranks a confirmed answer above prose a model wrote', () => {
    /*
     * Confidence is recorded and never read by the submit path. It exists to
     * explain a decision afterwards — "this went out at 50 because a model
     * wrote it" — not to authorise one, because a number in the middle is
     * exactly what turns into a threshold somebody later relaxes.
     */
    expect(confidenceFor('vault')).toBeGreaterThan(confidenceFor('resume'));
    expect(confidenceFor('resume')).toBeGreaterThan(confidenceFor('generated'));
    expect(confidenceFor('file')).toBe(100);
  });

  it('never reports high confidence in a source it does not recognise', () => {
    expect(confidenceFor('something-new')).toBeLessThan(50);
  });

  it('writes one row per field and marks whether it was sent', async () => {
    const { recordApplicationAudit, auditForRun } = await import('./audit');
    const runId = randomUUID();
    const jobId = randomUUID();

    const written = await recordApplicationAudit({
      userId,
      runId,
      jobId,
      submitted: true,
      receipt: {
        company: 'GitLab',
        role: 'Backend Engineer',
        ats: 'greenhouse',
        mode: 'SUBMITTED',
        preparedAt: Date.now(),
        resumeFileName: 'cv.pdf',
        fields: [
          { field: 'resume', source: 'file', value: 'cv.pdf' },
          { field: 'first_name', source: 'profile', value: 'Audit' },
        ],
        answers: [
          { question: 'Are you authorized to work in the US?', intent: 'WORK_AUTH.AUTHORIZED', value: 'Yes', provenance: 'USER_VERIFIED' },
        ],
        unresolved: [],
        validation: { valid: true, missing: [], errors: [] },
        executionPolicy: { status: 'PERMITTED_BROWSER', rationale: '' },
      },
    });

    expect(written).toBe(3);

    const rows = await auditForRun(userId, runId);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.submitted)).toBe(true);
    expect(rows.every((r) => r.source.length > 0)).toBe(true);

    const workAuth = rows.find((r) => r.field === 'WORK_AUTH.AUTHORIZED');
    expect(workAuth?.answer).toBe('Yes');
    expect(workAuth?.question).toMatch(/authorized to work/i);
  });

  it('records nothing for a question that had no answer', async () => {
    /* An unanswered question is not a value the employer received, and putting
       it in the audit trail as an empty string would make the record claim we
       submitted a blank where we submitted nothing. */
    const { recordApplicationAudit, auditForRun } = await import('./audit');
    const runId = randomUUID();

    await recordApplicationAudit({
      userId,
      runId,
      jobId: randomUUID(),
      submitted: false,
      receipt: {
        company: 'Acme',
        role: 'Engineer',
        ats: 'greenhouse',
        mode: 'DRY_RUN',
        preparedAt: Date.now(),
        resumeFileName: null,
        fields: [],
        answers: [{ question: 'Years with Kubernetes?', intent: null, value: null, provenance: null }],
        unresolved: [{ question: 'Years with Kubernetes?', reason: 'No verified answer.', kind: 'text', required: true }],
        validation: { valid: false, missing: [], errors: [] },
        executionPolicy: { status: 'UNREVIEWED', rationale: '' },
      },
    });

    expect(await auditForRun(userId, runId)).toHaveLength(0);
  });
});
