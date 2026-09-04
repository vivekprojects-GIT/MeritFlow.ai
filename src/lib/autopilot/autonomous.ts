import { getDb } from '../db';
import { runAutopilot, type RunnerOutcome } from './runner';

/**
 * Autonomous mode: the product running with nobody watching.
 *
 * ## What was missing
 *
 * Everything in this application executed inside an HTTP request. The batch
 * runner walked the queue correctly, isolated per-job failures correctly, and
 * respected every cap — and none of it happened unless a browser tab was open
 * on the site. "Onboard once and close the website" was not slightly
 * incomplete; it was the one claim with no code behind it.
 *
 * This is the part that runs off-request: a durable flag per account, a tick
 * that does one cycle, and a worker process that calls it. Nothing here decides
 * anything new. The policy engine, the verifier and the execution policy all
 * still gate exactly what they gated before, which is the point — autonomy is
 * about *who starts the run*, not about relaxing what the run may do.
 */

/**
 * Where an application ended up, in terms the dashboard can count.
 *
 * Deliberately finer than the run states. "Needs user action" covers a missing
 * salary expectation, a CAPTCHA, and an employer whose terms rule out
 * automation — three things with completely different meanings to someone
 * deciding what to do next, and only one of which they can actually fix.
 */
export const OUTCOMES = [
  'SUBMITTED',
  'READY_TO_SEND',
  'WAITING_FOR_EMAIL',
  'BLOCKED_MISSING_FACT',
  'BLOCKED_EXTERNAL_SECURITY',
  'BLOCKED_ACCOUNT_REQUIRED',
  'UNSUPPORTED_DESTINATION',
  'FAILED',
  'SKIPPED',
] as const;

export type Outcome = (typeof OUTCOMES)[number];

export const OUTCOME_LABEL: Record<Outcome, string> = {
  SUBMITTED: 'Submitted',
  READY_TO_SEND: 'Ready to send',
  WAITING_FOR_EMAIL: 'Waiting for an email',
  BLOCKED_MISSING_FACT: 'Missing information',
  BLOCKED_EXTERNAL_SECURITY: 'Security verification',
  BLOCKED_ACCOUNT_REQUIRED: 'Needs an account',
  UNSUPPORTED_DESTINATION: 'Unsupported destination',
  FAILED: 'Failed',
  SKIPPED: 'Skipped',
};

/**
 * Classify one finished run.
 *
 * Reads the reason the workflow already produced rather than re-deriving
 * anything. The reasons are written for the candidate, so matching on them
 * keeps one wording rather than two — and if a message changes, this falls
 * back to a coarser bucket instead of silently miscounting.
 */
export function classify(state: string, reason: string): Outcome {
  if (state === 'SUBMITTED' || state === 'CONFIRMED') return 'SUBMITTED';
  if (state === 'FAILED') return 'FAILED';
  if (state === 'SKIPPED') return 'SKIPPED';

  const text = reason.toLowerCase();

  if (/captcha|bot check|security check/.test(text)) return 'BLOCKED_EXTERNAL_SECURITY';
  if (/needs an account|requires an account|account first/.test(text)) return 'BLOCKED_ACCOUNT_REQUIRED';
  if (/verification code|has not arrived/.test(text)) return 'WAITING_FOR_EMAIL';
  /* An employer whose terms rule out automation, or an ATS with no submission
     path built. Nothing the candidate can fix, and not a failure either. */
  if (/prohibit|not enabled for|no submission path|no adapter/.test(text)) return 'UNSUPPORTED_DESTINATION';
  if (/no verified answer|needs your answer|missing from your profile|could not type/.test(text)) {
    return 'BLOCKED_MISSING_FACT';
  }

  if (state === 'DRY_RUN_COMPLETE') return 'READY_TO_SEND';
  return 'BLOCKED_MISSING_FACT';
}

export type TickSummary = {
  userId: string;
  attempted: number;
  counts: Record<Outcome, number>;
  stoppedBecause: string;
  ranAt: number;
};

function emptyCounts(): Record<Outcome, number> {
  return Object.fromEntries(OUTCOMES.map((o) => [o, 0])) as Record<Outcome, number>;
}

/** Summarise a runner result into the dashboard's vocabulary. */
export function summarise(userId: string, outcome: RunnerOutcome, ranAt = Date.now()): TickSummary {
  const counts = emptyCounts();
  for (const r of outcome.results) counts[classify(r.state, r.reason)] += 1;
  return { userId, attempted: outcome.attempted, counts, stoppedBecause: outcome.stoppedBecause, ranAt };
}

/* ── The loop ────────────────────────────────────────────────────────────── */

/** How long an account waits between cycles. */
export const CYCLE_MS = 60 * 60 * 1000;

/**
 * Accounts the worker should run now.
 *
 * Ordered by how long they have waited, so a backlog drains fairly instead of
 * the same account being picked every cycle.
 */
export async function dueAccounts(now = Date.now(), cycleMs = CYCLE_MS): Promise<string[]> {
  const db = await getDb();
  const res = await db.query<{ user_id: string }>(
    `SELECT user_id FROM job_settings
      WHERE autonomous = TRUE AND autonomous_last_run_at < $1
      ORDER BY autonomous_last_run_at ASC LIMIT 50`,
    [now - cycleMs],
  );
  return res.rows.map((r) => r.user_id);
}

/**
 * Run one cycle for one account.
 *
 * The timestamp is written *before* the work, not after. A cycle that throws
 * halfway — a browser that will not launch, a database blip — would otherwise
 * leave the account immediately due again, and the worker would spend every
 * tick retrying the same broken account while everyone else waited.
 */
/**
 * How fresh a posting must be for an unattended run to touch it.
 *
 * Autonomous mode's whole advantage is arriving early, and it wakes up every
 * hour, so there is no reason for it to reach backwards. Pressing Run by hand
 * is unrestricted -- that is a person deciding to work through the backlog,
 * which is a different intent from leaving the engine on.
 */
export const AUTONOMOUS_MAX_AGE_HOURS = 24;

export async function tick(userId: string, limit?: number): Promise<TickSummary> {
  const db = await getDb();
  const ranAt = Date.now();
  await db.query('UPDATE job_settings SET autonomous_last_run_at = $1 WHERE user_id = $2', [ranAt, userId]);

  try {
    return summarise(userId, await runAutopilot(userId, { limit, maxAgeHours: AUTONOMOUS_MAX_AGE_HOURS }), ranAt);
  } catch (err) {
    /* One account's failure must not stop the worker. The whole design goal is
       that an exception is isolated to the application that caused it. */
    return {
      userId,
      attempted: 0,
      counts: emptyCounts(),
      stoppedBecause: err instanceof Error ? err.message : 'The cycle failed.',
      ranAt,
    };
  }
}

/**
 * A run only lives in a working state while something is working on it.
 *
 * Every state between PREPARING and SUBMITTING is transient: something is
 * driving a browser. If the process restarts, or a page hangs past its timeout
 * and takes the run down with it, nothing ever moves that row again -- so the
 * screen shows "Preparing" against a job that has had nothing happening to it
 * for two days, and the duplicate guard treats it as in-flight forever.
 *
 * ## SUBMITTING is the careful case
 *
 * Everything else can be reopened, because nothing left the building. A run
 * stuck in SUBMITTING may or may not have reached the employer, and we cannot
 * tell from here. Reopening it risks a second application; leaving it risks the
 * candidate never learning. So it is parked for the person, with the honest
 * reason -- the one thing that must not happen is a silent retry.
 */
const STALE_AFTER_MS = 30 * 60_000;

const REOPENABLE = ['PREPARING', 'RESUME_READY', 'ANSWERS_READY', 'VERIFIED', 'QUEUED', 'FILLING', 'VALIDATED'] as const;

export async function reapStalledRuns(now = Date.now()): Promise<number> {
  const db = await getDb();
  const cutoff = now - STALE_AFTER_MS;

  const reopened = await db.query(
    `UPDATE autopilot_runs
        SET state = 'FAILED',
            blocked_reason = 'This run stopped part-way through and was not finished. Run it again.',
            updated_at = $1
      WHERE state = ANY($2) AND updated_at < $3`,
    [now, [...REOPENABLE], cutoff],
  );

  const parked = await db.query(
    `UPDATE autopilot_runs
        SET state = 'NEEDS_USER_ACTION',
            blocked_reason = 'This application was being sent when the run stopped, so we cannot tell whether the employer received it. Check your email before applying again.',
            updated_at = $1
      WHERE state = 'SUBMITTING' AND updated_at < $2`,
    [now, cutoff],
  );

  return (reopened.affectedRows ?? 0) + (parked.affectedRows ?? 0);
}

/** One pass over every due account. Sequential: each tick drives real browsers. */
export async function sweep(now = Date.now(), limitPerAccount?: number): Promise<TickSummary[]> {
  /* Before anything else: nothing is working on a run left over from a process
     that is no longer running, and pretending otherwise blocks the job. */
  await reapStalledRuns(now);

  const out: TickSummary[] = [];
  for (const userId of await dueAccounts(now)) out.push(await tick(userId, limitPerAccount));
  return out;
}
