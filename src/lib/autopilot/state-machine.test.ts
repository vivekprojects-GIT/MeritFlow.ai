import { describe, expect, it } from 'vitest';
import { canTransition, type RunState } from './state-machine';

/**
 * The transitions the workflow actually performs.
 *
 * `advance` rejects an illegal move by matching zero rows, and the workflow
 * does not read the result — so a move the table forbids leaves the run parked
 * at its previous state while the caller reports the new one. Nothing throws
 * and nothing logs; the run simply sits in the wrong place forever.
 *
 * That is exactly what happened when the blocked-path gate was added: it stops
 * a run straight from MATCHED, which the table did not allow, and every Workday
 * posting would have stuck at MATCHED with a message saying otherwise. So the
 * pairs the workflow depends on are pinned here, next to the reason each exists.
 */
const REQUIRED: [RunState, RunState, string][] = [
  ['DISCOVERED', 'SKIPPED', 'no candidate profile, or Autopilot is off'],
  ['DISCOVERED', 'QUALIFIED', 'the happy path begins'],
  ['QUALIFIED', 'MATCHED', 'scored against the posting'],
  ['MATCHED', 'SKIPPED', 'no adapter handles this URL'],
  ['MATCHED', 'NEEDS_USER_ACTION', 'the execution policy forbids visiting this path at all'],
  ['MATCHED', 'PREPARING', 'cleared to read the application'],
  ['PREPARING', 'FAILED', 'the application could not be read'],
  ['PREPARING', 'NEEDS_USER_ACTION', 'a CAPTCHA or an account wall'],
  ['PREPARING', 'RESUME_READY', 'tailoring done'],
  ['RESUME_READY', 'ANSWERS_READY', 'questions resolved against the vault'],
  ['ANSWERS_READY', 'NEEDS_USER_ACTION', 'the verifier blocked the run'],
  ['ANSWERS_READY', 'VERIFIED', 'every gate passed'],
  ['VERIFIED', 'QUEUED', 'verification is the only door into the queue'],
  ['QUEUED', 'FILLING', 'mapping onto the form'],
  ['FILLING', 'VALIDATED', 'structurally complete'],
  ['VALIDATED', 'DRY_RUN_COMPLETE', 'prepared, not sent'],
  ['VALIDATED', 'SUBMITTING', 'every submit gate agreed'],
  ['SUBMITTING', 'SUBMITTED', 'an employer confirmation was seen'],
  ['SUBMITTING', 'NEEDS_USER_ACTION', 'the form needs the person after all'],
  ['SUBMITTING', 'FAILED', 'the submission failed outright'],
  ['DRY_RUN_COMPLETE', 'SUBMITTING', 'the candidate approved it afterwards'],
];

describe('transitions the workflow performs', () => {
  it.each(REQUIRED)('%s → %s (%s)', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });
});

describe('transitions that must stay shut', () => {
  const FORBIDDEN: [RunState, RunState, string][] = [
    ['MATCHED', 'SUBMITTING', 'verification cannot be skipped'],
    ['QUEUED', 'SUBMITTED', 'filling and validation cannot be skipped'],
    ['ANSWERS_READY', 'SUBMITTING', 'the verifier is the only door into the queue'],
    ['REJECTED', 'SUBMITTING', 'a closed application is not reopened by the engine'],
    ['SKIPPED', 'PREPARING', 'a skipped run stays skipped'],
  ];

  it.each(FORBIDDEN)('%s ↛ %s (%s)', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });
});
