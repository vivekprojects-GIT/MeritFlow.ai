import { createHash, randomUUID } from 'node:crypto';
import { getDb } from '../db';

/**
 * The durable application state machine.
 *
 * This is workflow state, not screen state. It lives in the database, survives
 * process restarts, and is the thing a worker resumes from. Keeping it separate
 * from the learner's own `job_applications` tracker matters: that table is a UI
 * affordance the user edits freely, and if the two were one table a dropdown
 * change in the browser could move a worker's position mid-run.
 *
 * Transitions are enforced rather than advisory. An illegal move is rejected at
 * the boundary, so a bug can produce a stuck run — which is visible and fixable
 * — instead of a run that skips verification and submits.
 */

export const STATES = [
  /* Implemented now, through dry run. */
  'DISCOVERED',
  'QUALIFIED',
  'MATCHED',
  'PREPARING',
  'RESUME_READY',
  'ANSWERS_READY',
  'VERIFIED',
  'QUEUED',
  'FILLING',
  'VALIDATED',
  'DRY_RUN_COMPLETE',
  'SUBMITTING',
  'SUBMITTED',
  /**
   * Clicked, and nothing proved the employer received it.
   *
   * Its own state because the two honest answers to "did it go?" are yes and
   * no, and this is neither. Folding it into NEEDS_USER_ACTION buried it among
   * unknown questions and CAPTCHAs; folding it into SUBMITTED would claim
   * something nobody checked. It is the state a person can be asked to resolve
   * in one glance at their inbox.
   */
  'SUBMISSION_UNCONFIRMED',
  'CONFIRMED',
  /*
   * Why a human is needed, not merely that one is.
   *
   * These were a single NEEDS_USER_ACTION, which made the queue unreadable and
   * the runner unable to act: a CAPTCHA is permanent for us, a missing answer
   * is a thirty-second fix that then applies to every future application, and
   * an account wall is neither. Collapsing them lost the only distinction that
   * tells the candidate which of their stopped applications is worth opening.
   *
   * NEEDS_USER_ACTION is kept as the general case and as the state older rows
   * already hold.
   */
  'NEEDS_USER_ACTION',
  'CAPTCHA_REQUIRED',
  'MFA_REQUIRED',
  'ACCOUNT_REQUIRED',
  /*
   * A failure the runner may try again, and one it must not.
   *
   * A timeout is worth three attempts; a form whose fields we no longer
   * recognise is worth a person looking at the saved page. Retrying the second
   * kind forever is how an adapter breaks quietly.
   */
  'FAILED_RETRYABLE',
  'FAILED_FINAL',
  'FAILED',
  'RETRYING',
  /* Outcome states, driven by recruiter signal rather than by the engine. */
  'RECRUITER_RESPONSE',
  'ASSESSMENT',
  'INTERVIEW',
  'REJECTED',
  'OFFER',
  /* Terminal, chosen by policy or by the candidate. */
  'SKIPPED',
] as const;

export type RunState = (typeof STATES)[number];

/**
 * Legal transitions.
 *
 * `NEEDS_USER_ACTION` is reachable from every preparation state on purpose:
 * an unknown question, a CAPTCHA or a login can surface at any point, and the
 * run must be able to park rather than fail.
 */
const TRANSITIONS: Record<RunState, RunState[]> = {
  DISCOVERED: ['QUALIFIED', 'SKIPPED'],
  QUALIFIED: ['MATCHED', 'SKIPPED'],
  /* NEEDS_USER_ACTION straight from MATCHED: the execution policy is resolved
     before anything is prepared, so a path we may not visit at all — Workday,
     whose terms prohibit automated access — parks here without a browser ever
     being pointed at it. */
  MATCHED: ['PREPARING', 'NEEDS_USER_ACTION', 'CAPTCHA_REQUIRED', 'MFA_REQUIRED', 'ACCOUNT_REQUIRED', 'SKIPPED'],
  PREPARING: ['RESUME_READY', 'NEEDS_USER_ACTION', 'CAPTCHA_REQUIRED', 'MFA_REQUIRED', 'ACCOUNT_REQUIRED', 'FAILED', 'FAILED_RETRYABLE', 'FAILED_FINAL', 'SKIPPED'],
  RESUME_READY: ['ANSWERS_READY', 'NEEDS_USER_ACTION', 'FAILED', 'FAILED_RETRYABLE', 'FAILED_FINAL'],
  ANSWERS_READY: ['VERIFIED', 'NEEDS_USER_ACTION', 'FAILED', 'FAILED_RETRYABLE', 'FAILED_FINAL'],
  /* Verification is the only door into the queue. */
  VERIFIED: ['QUEUED', 'NEEDS_USER_ACTION', 'SKIPPED'],
  QUEUED: ['FILLING', 'NEEDS_USER_ACTION', 'CAPTCHA_REQUIRED', 'MFA_REQUIRED', 'ACCOUNT_REQUIRED', 'FAILED', 'FAILED_RETRYABLE', 'FAILED_FINAL', 'SKIPPED'],
  FILLING: ['VALIDATED', 'NEEDS_USER_ACTION', 'CAPTCHA_REQUIRED', 'MFA_REQUIRED', 'ACCOUNT_REQUIRED', 'FAILED', 'FAILED_RETRYABLE', 'FAILED_FINAL', 'RETRYING', 'SKIPPED'],
  /* A prepared application the candidate asked us never to interrupt over is
     abandoned here, after the form was filled and checked. */
  VALIDATED: ['DRY_RUN_COMPLETE', 'SUBMITTING', 'NEEDS_USER_ACTION', 'SKIPPED'],
  /* Terminal for now — no approved execution path leads out of it. */
  DRY_RUN_COMPLETE: ['SUBMITTING', 'SKIPPED'],
  /* SKIPPED is reachable here because under neverAsk a submit-time block --
     a CAPTCHA on the last page, a form that vanished between fill and click --
     resolves to "move on". Without the edge the workflow's skip was silently
     refused and the row sat in SUBMITTING for ever, blocking the role through
     the duplicate guard. */
  SUBMITTING: ['SUBMITTED', 'SUBMISSION_UNCONFIRMED', 'NEEDS_USER_ACTION', 'CAPTCHA_REQUIRED', 'MFA_REQUIRED', 'FAILED', 'FAILED_RETRYABLE', 'FAILED_FINAL', 'RETRYING', 'SKIPPED'],
  /*
   * Every human-blocked state resumes at PREPARING, and nowhere later.
   *
   * These used to offer ANSWERS_READY and QUEUED as re-entry points, which
   * opened a path from DISCOVERED to SUBMITTING that never passed through
   * VERIFIED: park the run, resume it at the queue, and the verifier is simply
   * never consulted. In practice the workflow always walks the full chain, but
   * the machine is supposed to be the guard rather than the caller's
   * discipline, and a transition table that permits an unverified submission is
   * one bug away from producing one.
   *
   * Re-preparing costs a few seconds and re-checks the answer that unblocked
   * the run, which is exactly what should happen to it.
   */
  NEEDS_USER_ACTION: ['PREPARING', 'SKIPPED'],
  CAPTCHA_REQUIRED: ['PREPARING', 'SKIPPED'],
  MFA_REQUIRED: ['PREPARING', 'SKIPPED'],
  ACCOUNT_REQUIRED: ['PREPARING', 'SKIPPED'],
  /* SUBMISSION_UNCONFIRMED is reachable from here as a correction, not as a
     normal step: it is how a submission recorded on evidence that later turned
     out to be worthless gets walked back. Finding that out must be recordable,
     or the tracker keeps a claim nobody can support. */
  SUBMITTED: ['CONFIRMED', 'FAILED', 'SUBMISSION_UNCONFIRMED'],
  /* Resolvable in either direction once someone -- or a confirmation email --
     settles it. Never resubmitted from here: a second application is worse
     than an unconfirmed first one. */
  SUBMISSION_UNCONFIRMED: ['SUBMITTED', 'CONFIRMED', 'FAILED', 'SKIPPED'],
  CONFIRMED: ['RECRUITER_RESPONSE', 'REJECTED'],
  /*
   * A failed run resumes at PREPARING, never at RETRYING.
   *
   * RETRYING exists for a run that had already been verified and then hit a
   * transient fault while filling or submitting — it is a second attempt at the
   * same verified application. Letting a failure from *preparation* enter it
   * gave a second route to SUBMITTING that never passed through VERIFIED, which
   * is the same bypass the human-blocked states had.
   *
   * So RETRYING is reachable only from FILLING and SUBMITTING, both of which
   * are downstream of verification.
   */
  FAILED: ['PREPARING', 'SKIPPED'],
  FAILED_RETRYABLE: ['PREPARING', 'SKIPPED'],
  /* Final failures wait for a person and can only be abandoned. */
  FAILED_FINAL: ['SKIPPED'],
  RETRYING: ['FILLING', 'SUBMITTING', 'FAILED'],
  RECRUITER_RESPONSE: ['ASSESSMENT', 'INTERVIEW', 'REJECTED'],
  ASSESSMENT: ['INTERVIEW', 'REJECTED'],
  INTERVIEW: ['OFFER', 'REJECTED'],
  REJECTED: [],
  OFFER: [],
  SKIPPED: [],
};

/**
 * The identity of an application, independent of which row a posting landed in.
 *
 * The duplicate guard keys on the run's job id, which is correct until the same
 * posting reaches the corpus twice — two boards, an embedded board and a direct
 * link, a re-ingest under a new id. Then there are two job rows, two runs, and
 * two applications to one employer for one role, from a guard that was working
 * exactly as written.
 *
 * This key is what an employer would consider the same application: this
 * candidate, this company, this role. Normalised hard, because "Senior
 * Engineer, Platform (Remote)" and "Senior Engineer, Platform" are one job.
 */
export function applicationKey(input: { userId: string; company: string; title: string }): string {
  const norm = (v: string) =>
    v
      .toLowerCase()
      .normalize('NFKD')
      /* Bracketed suffixes are almost always a location or a requisition id,
         never the difference between two roles. */
      .replace(/[([{].*?[)\]}]/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, '-');

  return createHash('sha256')
    .update(`${input.userId}|${norm(input.company)}|${norm(input.title)}`)
    .digest('hex')
    .slice(0, 32);
}

export function canTransition(from: RunState, to: RunState): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export type Run = {
  id: string;
  userId: string;
  jobId: string;
  state: RunState;
  idempotencyKey: string;
  executionPolicy: string;
  score: number;
  blockedReason: string;
  attempts: number;
  /** Cleared every check; waiting only on the candidate pressing send. */
  awaitingApproval: boolean;
  /**
   * The posting this run is for.
   *
   * Joined here rather than resolved in the browser. The approval queue used to
   * look each run up in the candidate's current top matches, which is a list
   * that refreshes and ages out -- so a run waiting for approval routinely
   * rendered as "This job" with no employer at all. Asking someone to approve
   * sending an application without telling them where it goes is not a
   * cosmetic problem.
   */
  company: string;
  title: string;
  jobUrl: string;
  createdAt: number;
  updatedAt: number;
};

/**
 * A key that is identical for the same candidate and job, forever.
 *
 * Derived rather than random: a worker replaying a timed-out message must
 * compute the same key from the same inputs and land on the existing run. A
 * random key would make every retry a new application, which is precisely the
 * failure this guards against.
 */
export function idempotencyKeyFor(userId: string, jobId: string): string {
  return createHash('sha256').update(`${userId}:${jobId}`).digest('hex').slice(0, 40);
}

/**
 * Start a run, or return the existing one.
 *
 * The unique constraint on `(user_id, job_id)` is the real guarantee; this is
 * the cooperative path to the same outcome. Two concurrent workers both calling
 * this produce one row, and the loser reads it back rather than erroring.
 */
export async function ensureRun(
  userId: string,
  jobId: string,
  /* Optional so existing callers keep working; without it the run simply
     carries no application key and falls back to the per-job guard alone. */
  role?: { company: string; title: string },
): Promise<Run | null> {
  const db = await getDb();
  const now = Date.now();
  const key = idempotencyKeyFor(userId, jobId);
  const appKey = role ? applicationKey({ userId, company: role.company, title: role.title }) : '';

  await db.query(
    `INSERT INTO autopilot_runs (id, user_id, job_id, state, idempotency_key, application_key, created_at, updated_at)
     VALUES ($1, $2, $3, 'DISCOVERED', $4, $5, $6, $6)
     ON CONFLICT (user_id, job_id) DO NOTHING`,
    [randomUUID(), userId, jobId, key, appKey, now],
  );

  /* Backfill for runs created before the column existed, or by a caller that
     did not know the role. Never overwrites a key that is already set. */
  if (appKey) {
    await db.query(
      "UPDATE autopilot_runs SET application_key = $1 WHERE user_id = $2 AND job_id = $3 AND application_key = ''",
      [appKey, userId, jobId],
    );
  }

  return getRun(userId, jobId);
}

/**
 * The furthest-along run for this role, whichever job row it used.
 *
 * Ordered so an application that reached an employer wins over one that did
 * not: the question this answers is "has this employer already heard from me
 * about this role", and a prepared-but-unsent run is not a yes.
 */
export async function runByApplicationKey(userId: string, key: string): Promise<Run | null> {
  if (!key) return null;
  const db = await getDb();
  const res = await db.query<Record<string, unknown>>(
    `SELECT * FROM autopilot_runs
      WHERE user_id = $1 AND application_key = $2
      ORDER BY CASE WHEN state IN ('SUBMITTING','SUBMITTED','CONFIRMED','RECRUITER_RESPONSE','ASSESSMENT','INTERVIEW','REJECTED','OFFER')
                    THEN 0 ELSE 1 END,
               updated_at DESC
      LIMIT 1`,
    [userId, key],
  );
  const r = res.rows[0];
  return r ? mapRun(r) : null;
}

export async function getRun(userId: string, jobId: string): Promise<Run | null> {
  const db = await getDb();
  const res = await db.query<Record<string, unknown>>(
    'SELECT * FROM autopilot_runs WHERE user_id = $1 AND job_id = $2',
    [userId, jobId],
  );
  const r = res.rows[0];
  return r ? mapRun(r) : null;
}

export async function listRuns(userId: string, limit = 100): Promise<Run[]> {
  const db = await getDb();
  /* LEFT JOIN, not INNER: a posting can be removed from the feed while a run
     that referenced it is still parked awaiting approval, and losing the run
     entirely would be worse than showing it without a title. */
  const res = await db.query<Record<string, unknown>>(
    `SELECT r.*, j.company, j.title, j.url AS job_url
       FROM autopilot_runs r LEFT JOIN jobs j ON j.id = r.job_id
      WHERE r.user_id = $1 ORDER BY r.updated_at DESC LIMIT $2`,
    [userId, limit],
  );
  return res.rows.map(mapRun);
}

export type AdvanceResult =
  | { ok: true; run: Run }
  | { ok: false; reason: string; run: Run | null };

/**
 * Move a run forward.
 *
 * The guard is in the UPDATE's WHERE clause, not in a read-then-write: two
 * workers racing the same transition means one UPDATE matches zero rows and
 * loses cleanly, instead of both reading `VERIFIED` and both proceeding.
 */
export async function advance(
  userId: string,
  jobId: string,
  to: RunState,
  patch: {
    blockedReason?: string;
    score?: number;
    executionPolicy?: string;
    verifier?: unknown;
    receipt?: unknown;
    awaitingApproval?: boolean;
  } = {},
): Promise<AdvanceResult> {
  const run = await getRun(userId, jobId);
  if (!run) return { ok: false, reason: 'No run for that job.', run: null };
  if (run.state === to) return { ok: true, run };

  if (!canTransition(run.state, to)) {
    return { ok: false, reason: `${run.state} cannot move to ${to}.`, run };
  }

  const db = await getDb();
  const now = Date.now();
  const res = await db.query(
    `UPDATE autopilot_runs
        SET state = $1,
            blocked_reason = COALESCE($2, blocked_reason),
            score = COALESCE($3, score),
            execution_policy = COALESCE($4, execution_policy),
            verifier = COALESCE($5, verifier),
            receipt = COALESCE($6, receipt),
            awaiting_approval = COALESCE($11, awaiting_approval),
            attempts = attempts + CASE WHEN $1 = 'RETRYING' THEN 1 ELSE 0 END,
            updated_at = $7
      WHERE user_id = $8 AND job_id = $9 AND state = $10`,
    [
      to,
      patch.blockedReason ?? null,
      patch.score ?? null,
      patch.executionPolicy ?? null,
      patch.verifier === undefined ? null : JSON.stringify(patch.verifier),
      patch.receipt === undefined ? null : JSON.stringify(patch.receipt),
      now,
      userId,
      jobId,
      run.state,
      patch.awaitingApproval === undefined ? null : patch.awaitingApproval,
    ],
  );

  if ((res.affectedRows ?? 0) === 0) {
    /* Another worker moved it first. Report where it actually is. */
    const fresh = await getRun(userId, jobId);
    return { ok: false, reason: 'That run moved before this update landed.', run: fresh };
  }

  /**
   * Mirror the move into the candidate's tracker.
   *
   * Done here rather than at each call site because there are a dozen of them
   * and one forgotten call is a silently empty Tracker — which is exactly the
   * bug this fixes: Autopilot wrote only to `autopilot_runs`, so running it
   * left the board and the funnel blank and looked like nothing had happened.
   *
   * Never allowed to fail a transition. The run's own state is the source of
   * truth; the tracker is a view of it for a person, and losing a card update
   * must not roll back durable workflow state.
   */
  try {
    const { mirrorRunToTracker } = await import('../jobs-store');
    await mirrorRunToTracker(userId, jobId, to);
  } catch {
    /* Non-fatal by design — see above. */
  }

  const fresh = await getRun(userId, jobId);
  return fresh ? { ok: true, run: fresh } : { ok: false, reason: 'Run vanished.', run: null };
}

export async function readRunJson<T>(userId: string, jobId: string, column: 'verifier' | 'receipt'): Promise<T | null> {
  const db = await getDb();
  const res = await db.query<Record<string, string>>(
    `SELECT ${column} AS v FROM autopilot_runs WHERE user_id = $1 AND job_id = $2`,
    [userId, jobId],
  );
  const raw = res.rows[0]?.v;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/* ── Activity log ────────────────────────────────────────────────────────── */

export async function logEvent(userId: string, kind: string, summary: string, detail = '', runId?: string) {
  try {
    const db = await getDb();
    await db.query(
      'INSERT INTO autopilot_events (id, user_id, run_id, kind, summary, detail, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [randomUUID(), userId, runId ?? null, kind.slice(0, 40), summary.slice(0, 300), detail.slice(0, 2000), Date.now()],
    );
  } catch {
    /* The feed is an observability surface; losing a line must never fail a run. */
  }
}

export type ActivityEvent = { id: string; kind: string; summary: string; detail: string; createdAt: number };

export async function recentEvents(userId: string, limit = 40): Promise<ActivityEvent[]> {
  const db = await getDb();
  const res = await db.query<Record<string, unknown>>(
    'SELECT id, kind, summary, detail, created_at FROM autopilot_events WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
    [userId, limit],
  );
  return res.rows.map((r) => ({
    id: String(r.id),
    kind: String(r.kind),
    summary: String(r.summary),
    detail: String(r.detail ?? ''),
    createdAt: Number(r.created_at),
  }));
}

function mapRun(r: Record<string, unknown>): Run {
  return {
    id: String(r.id),
    userId: String(r.user_id),
    jobId: String(r.job_id),
    state: String(r.state) as RunState,
    idempotencyKey: String(r.idempotency_key),
    executionPolicy: String(r.execution_policy ?? 'UNREVIEWED'),
    score: Number(r.score ?? 0),
    blockedReason: String(r.blocked_reason ?? ''),
    attempts: Number(r.attempts ?? 0),
    awaitingApproval: Boolean(r.awaiting_approval),
    /* Absent on the single-run reads, which do not join. Empty rather than a
       placeholder: the caller decides what to show, and "This job" masquerading
       as a real answer is what this whole change is undoing. */
    company: String(r.company ?? ''),
    title: String(r.title ?? ''),
    jobUrl: String(r.job_url ?? ''),
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}
