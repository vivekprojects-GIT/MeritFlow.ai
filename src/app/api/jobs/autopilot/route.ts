import { NextResponse } from 'next/server';
import { schedulerStatus } from '@/lib/autopilot/scheduler';
import { readinessReport } from '@/lib/autopilot/readiness-report';
import { checkRate, rateLimited } from '@/lib/rate-limit';
import { getCurrentUser } from '@/lib/auth';
import { isLearner } from '../route';
import { getPolicy, savePolicy, SUGGESTED } from '@/lib/autopilot/policy-engine';
import { submitEnabledFor, type AtsVendor } from '@/lib/autopilot/execution-policy';
import { getJobSettings } from '@/lib/job-settings';
import { autopilotReadiness } from '@/lib/autopilot/readiness';
import { getUsage } from '@/lib/jobs/usage';

/** Vendors an adapter could submit through, so the UI can name them. */
const SUBMITTABLE_VENDORS: AtsVendor[] = ['greenhouse', 'lever', 'ashby', 'smartrecruiters', 'icims', 'workday'];
import { listRuns, logEvent, recentEvents, readRunJson } from '@/lib/autopilot/state-machine';
import { getDb } from '@/lib/db';
import { runDryRun } from '@/lib/autopilot/workflow';
import { runAutopilot } from '@/lib/autopilot/runner';
import { listJobs } from '@/lib/jobs-store';
import type { ApplicationReceipt } from '@/lib/autopilot/adapters/types';

export const runtime = 'nodejs';
export const maxDuration = 800;

/** Autopilot status: policy, runs, live activity, and the funnel counters. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isLearner(user.role)) return NextResponse.json({ error: 'Not available for this account type.' }, { status: 403 });

  const [policy, runs, events] = await Promise.all([
    getPolicy(user.id),
    listRuns(user.id, 100),
    recentEvents(user.id, 40),
  ]);

  /* The funnel the dashboard shows. Derived from durable state, so it always
     agrees with what the engine actually did. */
  const counts = {
    discovered: runs.length,
    qualified: runs.filter((r) => r.state !== 'DISCOVERED' && r.state !== 'SKIPPED').length,
    prepared: runs.filter((r) => ['ANSWERS_READY', 'VERIFIED', 'QUEUED', 'FILLING', 'VALIDATED', 'DRY_RUN_COMPLETE'].includes(r.state)).length,
    dryRunComplete: runs.filter((r) => r.state === 'DRY_RUN_COMPLETE').length,
    needsUser: runs.filter((r) => r.state === 'NEEDS_USER_ACTION').length,
    skipped: runs.filter((r) => r.state === 'SKIPPED').length,
    failed: runs.filter((r) => r.state === 'FAILED').length,
    submitted: runs.filter((r) => ['SUBMITTED', 'CONFIRMED'].includes(r.state)).length,
  };

  /* Which routes can actually send. The UI used to state "submission is off"
     as a constant, which turned into a false claim the moment the allowlist
     was set — telling someone nothing is being sent while applications go out
     is the worst failure this screen could have. It is now read from the same
     function the workflow gates on. */
  const settings = await getJobSettings(user.id);
  const submission = {
    /* 'unknown' covers the generic browser adapter, which is what most
       postings resolve to — omitting it would have shown submission as off
       while it was on for the bulk of the list. */
    vendors: [...SUBMITTABLE_VENDORS, 'unknown' as AtsVendor].filter((v) => submitEnabledFor(v)),
    reviewBefore: settings.reviewBefore,
    autoSubmit: settings.autoSubmit,
    /* Whether the worker runs this account with nobody present. Read from the
       same row the worker queries, so the switch and the behaviour cannot
       disagree. */
    autonomous: settings.autonomous,
    lastRunAt: settings.autonomousLastRunAt,
    /*
     * Whether anything is actually scheduled to act on that flag.
     *
     * These are two different claims and the screen used to make only the
     * first. The switch stored `autonomous: true` and reported success while
     * nothing on the machine was capable of running a cycle, so the honest
     * state -- on, but nobody is listening -- was unreportable.
     */
    scheduler: schedulerStatus(),
  };

  return NextResponse.json({
    enabled: Boolean(policy),
    policy: policy ?? { ...SUGGESTED, userId: user.id, updatedAt: 0 },
    runs,
    events,
    counts,
    submission,
    readiness: await autopilotReadiness(user.id),
    /*
     * The machine-readable version: what exactly is unverified, which fields no
     * adapter could fill, and which consent classes have nothing standing
     * behind them. The banner reads the prose one above; a submission is
     * measured against this, because a sentence cannot be a gate.
     */
    readinessReport: await readinessReport(user.id),
    usage: await getUsage(user.id),
  });
}

/**
 * Update the policy, run one job, or run the queue.
 *
 * The `run` action can send real applications when every gate agrees. What it
 * cannot do is bypass one: the gates live in the workflow, not here.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  /* Metered by cost: this endpoint is expensive enough that an accidental
     double-click should not double the work. */
  const rate = checkRate(user.id, 'autopilot');
  if (!rate.allowed) return rateLimited(rate);
  if (!isLearner(user.role)) return NextResponse.json({ error: 'Not available for this account type.' }, { status: 403 });

  let body: {
    action?: string;
    policy?: Record<string, unknown>;
    jobId?: string;
    limit?: number;
    jobIds?: unknown;
    autonomous?: boolean;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  if (body.action === 'set-autonomous') {
    /*
     * The switch that lets the worker act without anyone watching.
     *
     * It changes who starts a run, not what a run may do: every gate below --
     * readiness, the policy engine, the verifier, the execution policy -- is
     * unchanged, so turning this on cannot cause anything that pressing Run
     * would not have caused.
     */
    const { saveJobSettings } = await import('@/lib/job-settings');
    const on = body.autonomous === true;
    const settings = await saveJobSettings(user.id, { autonomous: on });
    await logEvent(user.id, 'QUEUED', on ? 'Autonomous mode on.' : 'Autonomous mode off.', '');
    return NextResponse.json({ autonomous: settings.autonomous });
  }

  if (body.action === 'save-policy') {
    const p = body.policy ?? {};
    const saved = await savePolicy(user.id, {
      mode: p.mode === 'MANUAL' || p.mode === 'SMART' || p.mode === 'FULL' ? p.mode : undefined,
      minScore: typeof p.minScore === 'number' ? p.minScore : undefined,
      minComp: p.minComp === null ? null : typeof p.minComp === 'number' ? p.minComp : undefined,
      allowContract: typeof p.allowContract === 'boolean' ? p.allowContract : undefined,
      tracks: Array.isArray(p.tracks) ? (p.tracks as never) : undefined,
    });
    return NextResponse.json({ policy: saved });
  }

  if (body.action === 'dry-run') {
    const jobs = await listJobs(300);
    const job = jobs.find((j) => j.id === body.jobId);
    if (!job) return NextResponse.json({ error: 'Unknown job.' }, { status: 404 });
    const outcome = await runDryRun(user.id, job);
    return NextResponse.json(outcome);
  }

  /* The batch runner. Long by nature: each job drives a real browser, so the
     route's maxDuration is raised rather than the work being made concurrent. */
  if (body.action === 'run') {
    const outcome = await runAutopilot(user.id, {
      limit: typeof body.limit === 'number' ? body.limit : undefined,
      jobIds: Array.isArray(body.jobIds) ? body.jobIds.filter((x): x is string => typeof x === 'string') : undefined,
    });
    return NextResponse.json(outcome);
  }

  /* Approve one prepared application and send it.
     The only caller that may bypass the review hold, because that hold exists
     precisely to wait for this decision. Every other gate still applies. */
  if (body.action === 'approve') {
    const jobs = await listJobs(400);
    const job = jobs.find((j) => j.id === body.jobId);
    if (!job) return NextResponse.json({ error: 'Unknown job.' }, { status: 404 });
    const outcome = await runDryRun(user.id, job, { approvedByUser: true });
    return NextResponse.json(outcome);
  }

  if (body.action === 'receipt') {
    const receipt = await readRunJson<ApplicationReceipt>(user.id, String(body.jobId ?? ''), 'receipt');
    if (!receipt) return NextResponse.json({ error: 'No receipt for that run.' }, { status: 404 });
    /* The description the résumé was tailored against, so the candidate can
       judge the tailoring rather than take it on faith. */
    const db = await getDb();
    const jd = await db.query<{ description: string; url: string }>(
      'SELECT description, url FROM jobs WHERE id = $1', [String(body.jobId ?? '')]);
    return NextResponse.json({
      receipt,
      jobDescription: jd.rows[0]?.description ?? '',
      jobUrl: jd.rows[0]?.url ?? '',
    });
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
