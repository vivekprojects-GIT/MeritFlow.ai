'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from './button';
import { CheckIcon, LockIcon, SparklesIcon, ClockIcon } from './icons';
import { Funnel } from './charts';
import type { Match } from '@/lib/jobs-store';

/**
 * Auto Apply.
 *
 * The engine underneath this screen was already complete — policy, a 22-state
 * machine, the answer vault, the verifier, the adapters, the receipt writer —
 * and none of it was visible. Work an operator cannot see is work they cannot
 * trust, so this is the window onto it: what the policy is, what each run did,
 * where it stopped, and exactly what would have been sent.
 *
 * Whether it sends depends on two switches that are shown, never implied: the
 * operator's per-ATS allowlist and the candidate's own Auto-submit. With
 * either closed, every path ends at a receipt the candidate reads.
 */

type Run = {
  id: string;
  jobId: string;
  state: string;
  executionPolicy: string;
  score: number;
  blockedReason: string;
  attempts: number;
  awaitingApproval: boolean;
  company: string;
  title: string;
  jobUrl: string;
  updatedAt: number;
};

type ActivityEvent = { id: string; kind: string; summary: string; detail: string; createdAt: number };

type Policy = {
  mode: 'MANUAL' | 'SMART' | 'FULL';
  minScore: number;
  minComp: number | null;
  maxPerDay: number;
  maxPerCompany: number;
  allowContract: boolean;
};

type Receipt = {
  company: string;
  role: string;
  ats: string;
  mode: string;
  preparedAt: number;
  resumeFileName: string | null;
  tailoring?: {
    summary: string;
    bullets: string[];
    emphasised: string[];
    gaps: string[];
    dropped: string[];
    coverLetter: string;
    coverLetterFileName: string;
    document: string;
    fitBefore: number;
    fitAfter: number;
  };
  fields: { field: string; source: string; value: string }[];
  answers: { question: string; intent: string | null; value: string | null; provenance: string | null }[];
  unresolved: { question: string; reason: string; kind?: string; required?: boolean }[];
  validation: { valid: boolean; missing: string[]; errors: string[] };
  executionPolicy: { status: string; rationale: string };
  confirmation?: { reference: string; capturedAt: number };
};

type Payload = {
  enabled: boolean;
  policy: Policy;
  runs: Run[];
  events: ActivityEvent[];
  counts: Record<string, number>;
  /** Which ATS routes can actually send, read from live configuration. */
  submission: {
    vendors: string[];
    reviewBefore: boolean;
    autoSubmit: boolean;
    autonomous: boolean;
    lastRunAt: number;
    /* Whether anything is scheduled to act on `autonomous`. On its own the flag
       is a stored boolean; this says whether a cycle can actually happen. */
    scheduler?: { live: boolean; reason: string; lastSweepAt: number; lastError: string; pollMs: number };
  };
  /** What the candidate must fix before Autopilot can act for them. */
  readiness: { ready: boolean; gaps: { code: string; message: string }[] };
  usage: {
    used: number;
    limit: number | null;
    remaining: number | null;
    exhausted: boolean;
    isPro: boolean;
  };
};

type BatchOutcome = {
  attempted: number;
  submitted: number;
  prepared: number;
  awaitingApproval: number;
  needsUser: number;
  failed: number;
  skipped: number;
  stoppedBecause: string;
  results: { jobId: string; company: string; title: string; state: string; reason: string; awaitingApproval?: boolean }[];
};

const VENDOR_LABEL: Record<string, string> = {
  unknown: 'any employer form',
  greenhouse: 'Greenhouse',
  lever: 'Lever',
  ashby: 'Ashby',
  smartrecruiters: 'SmartRecruiters',
  icims: 'iCIMS',
  workday: 'Workday',
};

function SubmissionBanner({ submission }: { submission: Payload['submission'] }) {
  const routesOpen = submission.vendors.length > 0;
  /* Both gates must be open for anything to be sent: the operator allowlist and
     the candidate own switch. Naming which one is closed is the difference
     between a useful banner and a mystery. */
  const held = routesOpen && !submission.autoSubmit;

  /*
   * Three genuinely different states, because "on but paused for review" is
   * not the same promise as either "off" or "sending".
   *
   * This branched on `!live`, which folded the middle state into the first one:
   * with routes open and Auto-submit off, `live` is false, so the screen said
   * "No applicant tracking system is enabled for automatic submission right
   * now" -- to a candidate for whom seven of them were, one Settings toggle
   * away. `held` was computed on the line above and could never be read.
   */
  if (!routesOpen) {
    return (
      <div className="flex flex-wrap items-start gap-3 rounded-[var(--mf-radius-xl)] border border-line bg-mint/60 p-5">
        <LockIcon className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        <div className="min-w-0">
          <p className="text-sm font-bold text-ink">Autopilot prepares. You send.</p>
          <p className="mt-1 text-sm text-muted">
            Every run stops at a finished application and hands you a receipt showing each field, each answer, and where it
            came from. No applicant tracking system is enabled for automatic submission right now.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-wrap items-start gap-3 rounded-[var(--mf-radius-xl)] border p-5 ${
        held ? 'border-line bg-[var(--color-warn-soft)]' : 'border-[var(--color-warn)] bg-[var(--color-warn-soft)]'
      }`}
    >
      <SparklesIcon className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
      <div className="min-w-0">
        <p className="text-sm font-bold text-ink">
          {held ? 'Submission is enabled, but held for your review' : 'Applications are being sent automatically'}
        </p>
        <p className="mt-1 text-sm text-muted">
          Autopilot can submit through{' '}
          <span className="font-semibold text-ink">
            {submission.vendors.map((v) => VENDOR_LABEL[v] ?? v).join(', ')}
          </span>
          .{' '}
          {held
            ? 'Auto-submit is off in Settings, so runs still stop at a receipt. Turn it on to let them go out.'
            : 'A run that clears every gate goes to the employer without asking you again. CAPTCHAs and account walls still stop and hand back.'}
        </p>
      </div>
    </div>
  );
}

/**
 * Set the name and phone without leaving the screen.
 *
 * These two fields block every application, and they live in a modal behind
 * the avatar — a place nobody finds from a message that says "Profile",
 * because no such page exists. Two inputs here is the shortest path from
 * blocked to unblocked.
 */
function ProfileFixer({ onSaved }: { onSaved: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <form
      className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        try {
          const body: Record<string, string> = {};
          if (name.trim()) body.name = name.trim();
          if (phone.trim()) body.phone = phone.trim();
          const res = await fetch('/api/profile', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          if (!res.ok) {
            const d = (await res.json()) as { error?: string };
            setErr(d.error ?? 'That did not save.');
            return;
          }
          onSaved();
        } catch {
          setErr('That did not save.');
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="block">
        <span className="block text-[11px] font-bold uppercase tracking-[0.12em] text-faint">Full name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          name="name"
          placeholder="First and last"
          className="mt-1 h-9 w-full rounded-lg border border-line bg-canvas px-2.5 text-sm text-ink focus:border-accent focus:outline-none"
        />
      </label>
      <label className="block">
        <span className="block text-[11px] font-bold uppercase tracking-[0.12em] text-faint">Phone</span>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          autoComplete="tel"
          name="tel"
          type="tel"
          placeholder="+1 555 010 0000"
          className="mt-1 h-9 w-full rounded-lg border border-line bg-canvas px-2.5 text-sm text-ink focus:border-accent focus:outline-none"
        />
      </label>
      <Button type="submit" variant="primary" loading={busy} disabled={!name.trim() && !phone.trim()}>
        Save
      </Button>
      {err && (
        <p role="alert" className="text-sm font-semibold text-danger sm:col-span-3">
          {err}
        </p>
      )}
    </form>
  );
}

/** How each run state reads to a person, and whether it needs them. */
const STATE_META: Record<string, { label: string; tone: 'ok' | 'wait' | 'need' | 'stop' }> = {
  DISCOVERED: { label: 'Found', tone: 'wait' },
  QUALIFIED: { label: 'Passed your filters', tone: 'wait' },
  MATCHED: { label: 'Matched', tone: 'wait' },
  PREPARING: { label: 'Preparing', tone: 'wait' },
  RESUME_READY: { label: 'Résumé ready', tone: 'wait' },
  ANSWERS_READY: { label: 'Answers ready', tone: 'wait' },
  VERIFIED: { label: 'Verified', tone: 'ok' },
  QUEUED: { label: 'Queued', tone: 'wait' },
  FILLING: { label: 'Filling the form', tone: 'wait' },
  VALIDATED: { label: 'Validated', tone: 'ok' },
  DRY_RUN_COMPLETE: { label: 'Ready for you to send', tone: 'ok' },
  NEEDS_USER_ACTION: { label: 'Needs you', tone: 'need' },
  SKIPPED: { label: 'Skipped', tone: 'stop' },
  FAILED: { label: 'Failed', tone: 'stop' },
  SUBMITTED: { label: 'Submitted', tone: 'ok' },
  CONFIRMED: { label: 'Confirmed', tone: 'ok' },
};

const TONE: Record<string, string> = {
  ok: 'text-success',
  wait: 'text-muted',
  need: 'text-warn',
  stop: 'text-faint',
};

/**
 * The three modes, described by what they actually do.
 *
 * Smart and Full used to be the same code path — the workflow only tested
 * `!== 'MANUAL'` — while these descriptions claimed they differed. They now
 * differ on a real bar: Smart holds anything with an unanswered question or a
 * dropped claim; Full sends whenever the form validates.
 */
const MODES: { key: Policy['mode']; title: string; body: string }[] = [
  { key: 'MANUAL', title: 'Manual', body: 'Prepares everything. You press send on each one. Nothing is ever sent for you.' },
  { key: 'SMART', title: 'Smart', body: 'Sends only spotless applications. Anything with an unanswered question waits for you.' },
  { key: 'FULL', title: 'Full', body: 'Sends whenever the form is complete and passes checks, unanswered optional questions included.' },
];

export function JobAutopilot({ matches }: { matches: Match[] }) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [running, setRunning] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [receiptJd, setReceiptJd] = useState<{ text: string; url: string }>({ text: '', url: '' });
  const [lastReason, setLastReason] = useState<string | null>(null);
  const [batch, setBatch] = useState<BatchOutcome | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/jobs/autopilot')
      .then(async (r) => {
        const d = (await r.json()) as Payload & { error?: string };
        if (!alive) return;
        if (!r.ok) setError(d.error ?? 'Could not load Auto Apply.');
        else setData(d);
      })
      .catch(() => {
        if (alive) setError('Could not load Auto Apply.');
      });
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  const post = useCallback(async (body: Record<string, unknown>) => {
    const res = await fetch('/api/jobs/autopilot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { ok: res.ok, json: (await res.json()) as Record<string, unknown> };
  }, []);

  /**
   * Change a setting and show it changed.
   *
   * ## What was wrong
   *
   * Every control on this screen posted its change and then either refetched
   * the entire payload or, in the case of the autonomous switch, did nothing at
   * all. So the switch was clicked, the write succeeded, and the screen went on
   * rendering "Off" -- because nothing had told React the value moved. The
   * candidate clicked again. And again. A real account's event log shows three
   * "Autonomous mode on." entries in three consecutive seconds, which is not a
   * bug in the engine: it is one person clicking a switch that would not move.
   *
   * The full refetch was no better. `/api/jobs/autopilot` assembles readiness,
   * every run, every event and the usage counters, so a slider commit took
   * hundreds of milliseconds during which the control sat at its old value.
   * Indistinguishable, from the outside, from a control that does not work.
   *
   * So: move the value locally first, then write. If the write fails, put it
   * back and say so. The screen is never showing something the server does not
   * have -- it is either the new value, or the old one plus an error.
   */
  const applyLocal = useCallback((patch: (d: Payload) => Payload) => {
    setData((d) => (d ? patch(d) : d));
  }, []);

  const setAutonomous = useCallback(
    async (next: boolean) => {
      const before = data?.submission.autonomous;
      applyLocal((d) => ({ ...d, submission: { ...d.submission, autonomous: next } }));
      setError(null);

      const { ok, json } = await post({ action: 'set-autonomous', autonomous: next });
      if (!ok) {
        applyLocal((d) => ({ ...d, submission: { ...d.submission, autonomous: before ?? false } }));
        setError(String(json.error ?? 'Could not change autonomous mode.'));
        return;
      }
      /* Refetch so the scheduler's own status -- which only the server knows --
         catches up with the flag the candidate just set. */
      setReloadKey((k) => k + 1);
    },
    [applyLocal, data?.submission.autonomous, post],
  );

  const savePolicy = useCallback(
    async (patch: Partial<Policy>) => {
      const before = data?.policy;
      if (!before) return;

      applyLocal((d) => ({ ...d, policy: { ...d.policy, ...patch } }));
      setError(null);

      const { ok, json } = await post({ action: 'save-policy', policy: { ...before, ...patch } });
      if (!ok) {
        applyLocal((d) => ({ ...d, policy: before }));
        setError(String(json.error ?? 'That change did not save.'));
        return;
      }
      /* Trust the server's copy over the optimistic one: it clamps. */
      if (json.policy) applyLocal((d) => ({ ...d, policy: json.policy as Policy }));
    },
    [applyLocal, data?.policy, post],
  );

  /**
   * Run the queue.
   *
   * One request that returns when the whole batch is done, rather than
   * streaming progress. Each job drives a real browser, so a stream would need
   * its own transport and reconnection story for a run that takes minutes;
   * the honest interim is a status line saying so.
   */
  const runBatch = useCallback(async () => {
    setRunning('__batch');
    setBatch(null);
    setError(null);
    try {
      const { ok, json } = await post({ action: 'run' });
      if (!ok) {
        setError(String(json.error ?? 'Autopilot could not run.'));
        return;
      }
      setBatch(json as unknown as BatchOutcome);
      setReloadKey((k) => k + 1);
    } catch {
      setError('Autopilot stopped unexpectedly. Any applications already sent are in your runs below.');
    } finally {
      setRunning(null);
    }
  }, [post]);

  /** Approve one prepared application and send it. */
  const approve = useCallback(
    async (jobId: string) => {
      setRunning(jobId);
      setError(null);
      try {
        const { ok, json } = await post({ action: 'approve', jobId });
        if (!ok) {
          setError(String(json.error ?? 'That application could not be sent.'));
          return;
        }
        setLastReason(String(json.reason ?? ''));
        setReloadKey((k) => k + 1);
      } finally {
        setRunning(null);
      }
    },
    [post],
  );

  /**
   * Approve every waiting application.
   *
   * Sequential, like the runner and for the same reason: each one opens a real
   * browser against a real employer. Stops on the first failure rather than
   * ploughing on, so a systemic problem does not burn the whole queue.
   */
  const approveAll = useCallback(
    async (ids: string[]) => {
      setRunning('__approveAll');
      setError(null);
      try {
        for (const id of ids) {
          const { ok, json } = await post({ action: 'approve', jobId: id });
          if (!ok) {
            setError(String(json.error ?? 'Stopped: one application could not be sent.'));
            break;
          }
        }
        setReloadKey((k) => k + 1);
      } finally {
        setRunning(null);
      }
    },
    [post],
  );

  const dryRun = useCallback(
    async (jobId: string) => {
      setRunning(jobId);
      setReceipt(null);
      setLastReason(null);
      try {
        const { ok, json } = await post({ action: 'dry-run', jobId });
        if (!ok) {
          setError(String(json.error ?? 'That run could not start.'));
          return;
        }
        setLastReason(String(json.reason ?? ''));
        if (json.receipt) setReceipt(json.receipt as Receipt);
        setReloadKey((k) => k + 1);
      } finally {
        setRunning(null);
      }
    },
    [post],
  );

  if (error && !data) return <p className="rounded-2xl border border-line bg-canvas p-6 text-sm text-muted">{error}</p>;
  if (!data)
    return (
      <p role="status" aria-live="polite" className="rounded-2xl border border-line bg-canvas p-6 text-sm text-muted">
        Loading Auto Apply…
      </p>
    );

  const jobTitle = (jobId: string) => matches.find((m) => m.job.id === jobId)?.job;
  const queue = matches.filter((m) => m.score >= data.policy.minScore).slice(0, 8);

  /* Runs that finished cleanly while the review hold was on. Derived from
     durable state rather than from the last batch response, so the queue
     survives a refresh. */
  const awaiting = data.runs.filter((r) => r.state === 'DRY_RUN_COMPLETE' && r.awaitingApproval);

  return (
    <div className="space-y-6">
      <ApplyByUrl />

      <AutonomousSwitch
        on={data.submission.autonomous}
        lastRunAt={data.submission.lastRunAt}
        scheduler={data.submission.scheduler}
        ready={data.readiness.ready}
        onToggle={setAutonomous}
      />

      {/* Reads the live configuration rather than asserting a constant. This
          banner previously always said submission was off, which would have
          become a lie the moment the allowlist was set — and "your
          applications are not being sent" is the single worst thing for this
          screen to get wrong. */}
      {/* Blocking problems first. Without a name on the profile nothing can
          be filled anywhere, so this has to be louder than the mode cards. */}
      {!data.readiness.ready && (
        <div className="rounded-[var(--mf-radius-xl)] border border-[var(--color-warn)] bg-[var(--color-warn-soft)] p-5">
          <p className="text-sm font-bold text-ink">Autopilot cannot apply for you yet</p>
          <ul className="mt-2 space-y-1">
            {data.readiness.gaps.map((g) => (
              <li key={g.code} className="flex gap-2 text-sm text-ink">
                <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--color-warn)]" />
                {g.message}
              </li>
            ))}
          </ul>

          {/* Fixed here rather than elsewhere. The name and phone live in a
              modal behind the avatar and there is no page called Profile, so
              "add it in Profile" sent people looking for something that does
              not exist. */}
          {data.readiness.gaps.some((g) => ['name', 'surname', 'phone'].includes(g.code)) && (
            <ProfileFixer onSaved={() => setReloadKey((k) => k + 1)} />
          )}
        </div>
      )}

      {/* The plan allowance. Shown because it changes what pressing Run will
          actually do, not as an upsell. */}
      {!data.usage.isPro && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--mf-radius-lg)] border border-line bg-canvas px-4 py-3">
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-ink">
              {data.usage.remaining} application{data.usage.remaining === 1 ? '' : 's'} left this month
            </span>
            <span className="block text-xs text-muted">
              {data.usage.used} of {data.usage.limit} used on the free plan. Only applications actually sent are counted.
            </span>
          </span>
          <a
            href="/pricing"
            className="inline-flex h-9 shrink-0 items-center rounded-[var(--mf-radius-md)] bg-[var(--color-accent-fill)] px-4 text-sm font-semibold text-white"
          >
            See plans
          </a>
        </div>
      )}

      <SubmissionBanner submission={data.submission} />

      {/* Live submission changes what a click here does, so it is spelled out
          before the controls rather than after them. */}

      {error && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}

      {/* ── Counters ── */}
      <section>
        <h3 className="mb-1 text-lg font-bold text-ink">Pipeline</h3>
        <p className="mb-3 text-sm text-muted">
          Where every job Autopilot looked at ended up, and where they fall out.
        </p>

        <div className="grid gap-4 rounded-[var(--mf-radius-lg)] border border-line bg-canvas p-5 lg:grid-cols-[1fr_auto]">
          {/*
            A funnel, because that is what it is. Four counters in a row read as
            four unrelated facts and hid the only thing worth seeing here --
            that most jobs stop somewhere, and where.
          */}
          <Funnel
            stages={[
              { label: 'Discovered', value: data.counts.discovered ?? 0 },
              { label: 'Qualified', value: data.counts.qualified ?? 0, hint: 'Passed your rules' },
              { label: 'Prepared', value: data.counts.prepared ?? 0, hint: 'Résumé written, questions answered' },
              { label: 'Ready to send', value: data.counts.dryRunComplete ?? 0 },
            ]}
            emptyMessage="Nothing run yet. Prepare a match to start."
          />

          {/* Needs-you sits outside the funnel: it is not a later stage, it is
              a run that stopped and is waiting on a person. */}
          <div className="flex items-center gap-4 border-t border-line pt-4 lg:w-44 lg:flex-col lg:items-start lg:justify-center lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-faint">Needs you</p>
              <p className="text-3xl font-black tabular-nums text-warn">{data.counts.needsUser ?? 0}</p>
            </div>
            <p className="text-xs leading-relaxed text-muted">
              Stopped on a question, a CAPTCHA, or an employer whose terms rule out automation.
            </p>
          </div>
        </div>
      </section>

      {/* ── Policy ── */}
      <section>
        <h3 className="mb-1 text-lg font-bold text-ink">How Autopilot decides</h3>
        <p className="mb-3 text-sm text-muted">These rules run before anything is prepared, so a job you rule out is never touched.</p>

        <div className="grid gap-3 sm:grid-cols-3">
          {MODES.map((m) => {
            const active = data.policy.mode === m.key;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => savePolicy({ mode: m.key })}
                aria-pressed={active}
                className={`rounded-[var(--mf-radius-lg)] border p-4 text-left transition ${
                  active ? 'border-accent bg-mint' : 'border-line bg-canvas hover:bg-elevated'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <span className={`text-sm font-bold ${active ? 'text-accent' : 'text-ink'}`}>{m.title}</span>
                  {active && <CheckIcon className="h-3.5 w-3.5 text-accent" />}
                </span>
                <span className="mt-1 block text-[12px] leading-snug text-muted">{m.body}</span>
              </button>
            );
          })}
        </div>

        {/* A mode is only half the answer. Saying which other switch is
            currently deciding the outcome prevents someone selecting Full and
            believing applications went out when they did not. */}
        {data.policy.mode !== 'MANUAL' && !data.submission.autoSubmit && (
          <Notice tone="warn">
            {data.policy.mode} mode is saved, but Auto-submit is off in Settings, so runs still stop at a receipt.
          </Notice>
        )}
        {data.policy.mode !== 'MANUAL' && data.submission.autoSubmit && data.submission.vendors.length === 0 && (
          <Notice tone="warn">
            {data.policy.mode} mode is saved and Auto-submit is on, but no applicant tracking system is enabled for
            submission, so runs still stop at a receipt.
          </Notice>
        )}
        {data.policy.mode !== 'MANUAL' && data.submission.autoSubmit && data.submission.vendors.length > 0 && data.submission.reviewBefore && (
          <Notice tone="info">
            Review before submit is on, so each prepared application waits for your approval below.
          </Notice>
        )}

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Slider
            label="Minimum fit"
            value={data.policy.minScore}
            min={0}
            max={100}
            suffix=""
            onCommit={(v) => savePolicy({ minScore: v })}
          />
          <div className="rounded-[var(--mf-radius-lg)] border border-line p-3.5">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-faint">Contract roles</p>
            <button
              type="button"
              role="switch"
              aria-checked={data.policy.allowContract}
              aria-label="Include contract roles"
              onClick={() => savePolicy({ allowContract: !data.policy.allowContract })}
              className={`mt-2.5 relative h-6 w-11 rounded-full transition ${
                data.policy.allowContract ? 'bg-accent-fill' : 'bg-line-strong'
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] ${
                  data.policy.allowContract ? 'left-[1.4rem]' : 'left-0.5'
                }`}
              />
            </button>
            <p className="mt-1.5 text-xs text-muted">{data.policy.allowContract ? 'Included' : 'Excluded'}</p>
          </div>
        </div>
      </section>

      {/* ── The queue ── */}
      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-ink">Ready to prepare</h3>
            <p className="mt-0.5 text-sm text-muted">
              Matches at or above your {data.policy.minScore} fit threshold. Preparing one reads the real application form.
            </p>
          </div>
          <Button
            variant="primary"
            loading={running === '__batch'}
            disabled={queue.length === 0 || !data.readiness.ready}
            onClick={() => void runBatch()}
          >
            {data.submission.autoSubmit && data.submission.vendors.length > 0
              ? `Apply to ${queue.length}`
              : `Prepare ${queue.length}`}
          </Button>
        </div>

        {/* Whichever the button will do, said before it is pressed rather than
            discovered afterwards. */}
        {running === '__batch' && (
          <p role="status" aria-live="polite" className="mb-3 text-sm text-muted">
            Working through the queue one job at a time. Each one opens the real application form, so this takes a
            while — leave the tab open.
          </p>
        )}

        {batch && (
          <div className="mb-4 rounded-[var(--mf-radius-lg)] border border-line bg-canvas p-4">
            <p className="text-sm font-semibold text-ink">
              {batch.submitted > 0 && `${batch.submitted} sent`}
              {batch.submitted > 0 && batch.awaitingApproval > 0 && ', '}
              {batch.awaitingApproval > 0 && `${batch.awaitingApproval} awaiting your approval`}
              {batch.submitted === 0 && batch.awaitingApproval === 0 && `${batch.prepared} prepared`}
              {batch.needsUser > 0 && `, ${batch.needsUser} need you`}
              {batch.failed > 0 && `, ${batch.failed} failed`}
            </p>
            <p className="mt-0.5 text-xs text-muted">{batch.stoppedBecause}</p>
            <ul className="mt-2 space-y-1">
              {batch.results.map((r) => {
                const meta = STATE_META[r.state] ?? { label: r.state, tone: 'wait' as const };
                return (
                  <li key={r.jobId} className="text-xs">
                    <span className={`font-semibold ${TONE[meta.tone]}`}>{meta.label}</span>
                    <span className="text-muted">
                      {' '}
                      {/* The reason already opens with the company, so printing
                          it again gave "Acme — Acme — ready to send". */}
                      · {r.reason.startsWith(r.company) ? r.reason : `${r.company} — ${r.reason}`}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {queue.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-muted">
            Nothing clears your filters yet. Lower the minimum fit, or add target roles to your profile.
          </p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-canvas">
            {queue.map((m) => {
              const run = data.runs.find((r) => r.jobId === m.job.id);
              const meta = run ? STATE_META[run.state] : null;
              return (
                <li key={m.job.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span
                    aria-hidden
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--mf-radius-md)] bg-ink text-[11px] font-bold text-canvas"
                  >
                    {m.job.company.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{m.job.title}</span>
                    <span className="block truncate text-xs text-muted">
                      {m.job.company} · {m.score}% fit
                      {meta && (
                        <>
                          {' · '}
                          <span className={`font-semibold ${TONE[meta.tone]}`}>{meta.label}</span>
                        </>
                      )}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    variant={run?.state === 'DRY_RUN_COMPLETE' ? 'secondary' : 'primary'}
                    loading={running === m.job.id}
                    onClick={() => void dryRun(m.job.id)}
                  >
                    {run?.state === 'DRY_RUN_COMPLETE' ? 'Prepare again' : 'Prepare'}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        {lastReason && !receipt && (
          <p className="mt-3 rounded-xl border border-line bg-elevated/60 p-4 text-sm text-ink">{lastReason}</p>
        )}
      </section>

      {/* ── Awaiting approval ── */}
      {awaiting.length > 0 && (
        <section>
          <div className="mb-3">
            <h3 className="text-lg font-bold text-ink">Waiting for your approval</h3>
            <p className="mt-0.5 text-sm text-muted">
              These are finished and passed every check. Read one before you send it, or send them all.
            </p>
          </div>

          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-[var(--color-warn)] bg-canvas">
            {awaiting.map((r) => {
              /* The run carries the posting now. The match list is only a
                 fallback for a run created before that join existed. */
              const job = jobTitle(r.jobId);
              const title = r.title || job?.title || 'Untitled posting';
              const company = r.company || job?.company || '';
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{title}</span>
                    <span className="block truncate text-xs text-muted">
                      {[company, `${r.score}% fit`].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      const { ok, json } = await post({ action: 'receipt', jobId: r.jobId });
                      if (ok) {
                        setReceipt(json.receipt as Receipt);
                        setReceiptJd({ text: String(json.jobDescription ?? ''), url: String(json.jobUrl ?? '') });
                        setLastReason(null);
                      } else setError('No receipt was written for that run.');
                    }}
                  >
                    Review
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    loading={running === r.jobId}
                    onClick={() => void approve(r.jobId)}
                  >
                    Approve and send
                  </Button>
                </li>
              );
            })}
          </ul>

          {/* Sends every one of them. Separated from the per-row button and
              labelled with the count, because "approve all" is exactly the
              control someone clicks without reading. */}
          <Button
            variant="secondary"
            className="mt-3"
            loading={running === '__approveAll'}
            onClick={() => void approveAll(awaiting.map((r) => r.jobId))}
          >
            Approve and send all {awaiting.length}
          </Button>
        </section>
      )}

      {receipt && <ReceiptView receipt={receipt} reason={lastReason} jd={receiptJd} onClose={() => setReceipt(null)} />}

      {/* ── Runs ── */}
      {data.runs.length > 0 && (
        <section>
          <h3 className="mb-3 text-lg font-bold text-ink">All runs</h3>
          <div className="overflow-hidden rounded-2xl border border-line bg-canvas">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead className="bg-elevated text-[11px] uppercase tracking-wider text-faint">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Job</th>
                    <th className="px-4 py-2.5 font-semibold">State</th>
                    <th className="px-4 py-2.5 font-semibold">Route</th>
                    <th className="px-4 py-2.5 font-semibold">Why it stopped</th>
                    <th className="px-4 py-2.5 font-semibold" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.runs.map((r) => {
                    const job = jobTitle(r.jobId);
                    const meta = STATE_META[r.state] ?? { label: r.state, tone: 'wait' as const };
                    return (
                      <tr key={r.id} className="hover:bg-elevated/40">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-ink">{job?.company ?? 'Job removed'}</p>
                          <p className="text-xs text-muted">{job?.title ?? r.jobId.slice(0, 8)}</p>
                        </td>
                        <td className={`px-4 py-3 text-xs font-semibold ${TONE[meta.tone]}`}>{meta.label}</td>
                        <td className="px-4 py-3 text-xs text-muted">{r.executionPolicy.replace(/_/g, ' ').toLowerCase()}</td>
                        <td className="max-w-[16rem] px-4 py-3 text-xs text-muted">{r.blockedReason || '—'}</td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={async () => {
                              const { ok, json } = await post({ action: 'receipt', jobId: r.jobId });
                              if (ok) {
                                setReceipt(json.receipt as Receipt);
                                setReceiptJd({ text: String(json.jobDescription ?? ''), url: String(json.jobUrl ?? '') });
                                setLastReason(null);
                              } else setError('No receipt was written for that run.');
                            }}
                          >
                            Receipt
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* ── Activity ── */}
      <section>
        <h3 className="mb-1 text-lg font-bold text-ink">Activity</h3>
        <p className="mb-3 text-sm text-muted">Every decision the engine made, newest first.</p>
        {data.events.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-muted">
            Nothing has run yet.
          </p>
        ) : (
          <ol className="space-y-0">
            {data.events.map((e, i) => (
              <li key={e.id} className="relative flex gap-3 pb-4 pl-1">
                {/* Rail drawn per row so it stops cleanly at the last entry. */}
                {i < data.events.length - 1 && <span aria-hidden className="absolute left-[9px] top-5 h-full w-px bg-line" />}
                <span aria-hidden className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-accent-fill ring-4 ring-surface" />
                <span className="min-w-0">
                  <span className="block text-sm text-ink">{e.summary}</span>
                  <span className="block text-xs text-faint">
                    {STATE_META[e.kind]?.label ?? e.kind.replace(/_/g, ' ').toLowerCase()} ·{' '}
                    {new Date(e.createdAt).toLocaleString()}
                  </span>
                  {e.detail && <span className="mt-0.5 block text-xs text-muted">{e.detail}</span>}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

/* ── Receipt ─────────────────────────────────────────────────────────────── */

/**
 * The receipt.
 *
 * This is the artefact the whole engine exists to produce: every field, its
 * value, and where that value came from. Provenance is shown per row because
 * "the AI wrote it" and "you told us this" are different claims, and only the
 * second may go on an application unattended.
 */
function ReceiptView({ receipt, reason, jd, onClose }: { receipt: Receipt; reason: string | null; jd: { text: string; url: string }; onClose: () => void }) {
  const receiptJd = jd;
  return (
    <section className="overflow-hidden rounded-[var(--mf-radius-xl)] border border-line bg-canvas">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line bg-elevated/60 px-5 py-4">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-bold text-ink">
            <SparklesIcon className="h-4 w-4 text-accent" />
            {receipt.role} at {receipt.company}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {receipt.ats} · prepared {new Date(receipt.preparedAt).toLocaleString()} ·{' '}
            {receipt.mode === 'DRY_RUN' ? 'not submitted' : 'submitted'}
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </header>

      <div className="space-y-5 p-5">
        {reason && <p className="text-sm text-ink">{reason}</p>}

        <div
          className={`rounded-xl border p-4 ${
            receipt.validation.valid ? 'border-line bg-[var(--color-success-soft)]' : 'border-line bg-[var(--color-warn-soft)]'
          }`}
        >
          <p className="text-sm font-semibold text-ink">
            {receipt.validation.valid ? 'The form would be accepted' : 'The form is not complete yet'}
          </p>
          {receipt.validation.missing.length > 0 && (
            <p className="mt-1 text-sm text-muted">Still empty: {receipt.validation.missing.join(', ')}</p>
          )}
          {receipt.validation.errors.length > 0 && (
            <p className="mt-1 text-sm text-muted">{receipt.validation.errors.join(' ')}</p>
          )}
          <p className="mt-2 text-xs text-faint">
            Route: {receipt.executionPolicy.status.replace(/_/g, ' ').toLowerCase()}. {receipt.executionPolicy.rationale}
          </p>
        </div>

        {receipt.tailoring && (receipt.tailoring.bullets.length > 0 || receipt.tailoring.coverLetter) && (
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-faint">Tailored for this posting</p>

            {/*
              What the tailoring was worth, before the description of it.

              The screen showed a fit percentage for the posting and then a
              tailored résumé with no number attached, which left the obvious
              question unanswered. Both figures come from the same scorer, so
              the comparison means something -- and a pass that moves the number
              very little is worth seeing move very little.
            */}
            <FitDelta before={receipt.tailoring.fitBefore} after={receipt.tailoring.fitAfter} />

            {receipt.tailoring.summary && (
              <p className="mt-2 rounded-xl border border-line px-3.5 py-2.5 text-sm text-ink">{receipt.tailoring.summary}</p>
            )}

            {receipt.tailoring.bullets.length > 0 && (
              <ul className="mt-2 space-y-1.5">
                {receipt.tailoring.bullets.map((b, i) => (
                  <li key={i} className="flex gap-2 text-sm text-ink">
                    <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-faint" />
                    {b}
                  </li>
                ))}
              </ul>
            )}

            {receipt.tailoring.emphasised.length > 0 && (
              <p className="mt-2 flex flex-wrap gap-1.5">
                {receipt.tailoring.emphasised.map((s) => (
                  <span key={s} className="rounded-full bg-mint px-2.5 py-1 text-[12px] font-medium text-accent">
                    {s}
                  </span>
                ))}
              </p>
            )}

            {receipt.tailoring.coverLetter && (
              <div className="mt-3 rounded-xl border border-line px-3.5 py-2.5">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-faint">Cover letter</p>
                <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-ink">{receipt.tailoring.coverLetter}</p>
              </div>
            )}

            {receipt.tailoring.gaps.length > 0 && (
              <p className="mt-2 text-xs text-muted">
                Not claimed, because your résumé does not evidence it: {receipt.tailoring.gaps.join(', ')}.
              </p>
            )}

            {receipt.tailoring.document && <ResumeDocument text={receipt.tailoring.document} name={receipt.resumeFileName} />}

            {/* The posting the résumé was tailored against. Shown with the
                résumé because the pair is the judgement: without the JD the
                fit number and the emphasised skills are just assertions. */}
            {receiptJd.text && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs font-semibold text-muted">
                  Job description this was tailored to{receiptJd.url ? ' · ' : ''}
                  {receiptJd.url && (
                    <a className="text-accent underline" href={receiptJd.url} target="_blank" rel="noreferrer">
                      open posting
                    </a>
                  )}
                </summary>
                <p className="mt-1.5 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-xl border border-line px-3.5 py-2.5 text-xs leading-relaxed text-muted">
                  {receiptJd.text.slice(0, 8000)}
                </p>
              </details>
            )}

            {/* Surfaced rather than silently discarded. If tailoring keeps
                dropping claims, the candidate should know their résumé is
                thinner than the postings they are chasing. */}
            {receipt.tailoring.dropped.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs font-semibold text-warn">
                  {receipt.tailoring.dropped.length} generated claims were dropped for having no support in your résumé
                </summary>
                <ul className="mt-1.5 space-y-1">
                  {receipt.tailoring.dropped.map((d, i) => (
                    <li key={i} className="text-xs text-muted line-through">
                      {d}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        {receipt.fields.length > 0 && (
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-faint">Fields filled</p>
            <ul className="mt-2 divide-y divide-line overflow-hidden rounded-xl border border-line">
              {receipt.fields.map((f) => (
                <li key={f.field} className="flex flex-wrap items-baseline justify-between gap-2 px-3.5 py-2">
                  <span className="text-sm text-muted">{f.field}</span>
                  <span className="min-w-0 text-right">
                    <span className="block break-words text-sm text-ink">{f.value || '—'}</span>
                    <span className="text-[11px] text-faint">from your {f.source}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {receipt.answers.length > 0 && (
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-faint">Questions answered</p>
            <ul className="mt-2 space-y-2">
              {receipt.answers.map((a, i) => (
                <li key={`${a.intent ?? 'q'}-${i}`} className="rounded-xl border border-line px-3.5 py-2.5">
                  <p className="text-sm text-muted">{a.question}</p>
                  <p className="mt-0.5 text-sm font-medium text-ink">{a.value || '—'}</p>
                  <p className="text-[11px] text-faint">{(a.provenance ?? 'unknown').toLowerCase().replace(/_/g, ' ')}</p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {receipt.unresolved.length > 0 && (
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-warn">Left for you</p>
            {/* Deliberately not guessed. A wrong answer on an application is
                worse than an unanswered one the candidate fills in. */}
            <ul className="mt-2 space-y-2">
              {receipt.unresolved.map((u, i) => (
                <AnswerPrompt key={`${u.question}-${i}`} question={u.question} reason={u.reason} kind={u.kind} />
              ))}
            </ul>
          </div>
        )}

        <p className="flex items-center gap-1.5 text-xs text-faint">
          <ClockIcon className="h-3.5 w-3.5" />
          {receipt.resumeFileName ? `Résumé attached: ${receipt.resumeFileName}` : 'No résumé attached'}
        </p>
      </div>
    </section>
  );
}

/* ── Controls ────────────────────────────────────────────────────────────── */

/**
 * Apply to one posting, by URL.
 *
 * The shortest path through the whole engine, and the one that proves it works
 * at all. Everything else on this screen decides *which* jobs to apply to;
 * none of that is needed to establish that one real application reaches one
 * real employer and comes back with a confirmation.
 *
 * It runs the identical workflow — same gates, same vault, same duplicate
 * guard — so a success here is a success everywhere, and a refusal here names
 * the same reason the batch would have given.
 */
type ApplyResult = {
  state: string;
  reason: string;
  company: string;
  role: string;
  confirmation: { reference: string } | null;
  filled: string[];
  unresolved: { question: string; reason: string; kind?: string; required?: boolean }[];
};

function ApplyByUrl() {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ApplyResult | null>(null);

  /**
   * Coerce whatever came back into something renderable.
   *
   * The first version spread the response straight into state and read
   * `result.state.replace(...)`, which threw and took the whole Auto Apply tab
   * down the moment a body arrived without that field. A response is data from
   * outside this component: a proxy can return HTML, a route can be renamed, a
   * deploy can be half-rolled. None of those should cost the user the screen
   * they were on — least of all this screen, whose entire job is reporting what
   * happened to an application that may have just been sent.
   */
  const normalise = (body: unknown, fallbackReason: string): ApplyResult => {
    const b = (body ?? {}) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === 'string' ? v : '');
    const list = (v: unknown) => (Array.isArray(v) ? v : []);

    return {
      state: str(b.state) || 'FAILED',
      reason: str(b.reason) || str(b.error) || fallbackReason,
      company: str(b.company),
      role: str(b.role),
      confirmation:
        b.confirmation && typeof b.confirmation === 'object'
          ? { reference: str((b.confirmation as Record<string, unknown>).reference) }
          : null,
      filled: list(b.filled).filter((f): f is string => typeof f === 'string'),
      unresolved: list(b.unresolved)
        .map((u) => (u ?? {}) as Record<string, unknown>)
        .map((u) => ({ question: str(u.question), reason: str(u.reason) }))
        .filter((u) => u.question),
    };
  };

  const run = async () => {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch('/api/jobs/apply-url', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      /* A non-JSON body is a real possibility — an error page from a proxy is
         HTML, and `.json()` throws on it. */
      const body = await res.json().catch(() => null);
      setResult(normalise(body, res.ok ? 'The server returned an unexpected response.' : `Request failed (${res.status}).`));
    } catch {
      setResult(normalise(null, 'Could not reach the server.'));
    }
    setBusy(false);
  };

  const sent = result?.state === 'SUBMITTED';

  return (
    <section className="rounded-[var(--mf-radius-xl)] border border-line bg-canvas p-5">
      <h3 className="text-sm font-bold text-ink">Apply to one posting</h3>
      <p className="mt-0.5 text-[13px] text-muted">
        Paste a job URL. It runs the same engine as a batch — same checks, same refusals — on exactly one application.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://job-boards.greenhouse.io/company/jobs/123456"
          className="min-w-[16rem] flex-1 rounded-[var(--mf-radius-md)] border border-line bg-surface px-3 py-2 text-sm text-ink outline-none transition focus:border-ink focus:bg-canvas"
        />
        <Button onClick={() => void run()} disabled={busy || !url.trim()}>
          {busy ? 'Applying…' : 'Apply'}
        </Button>
      </div>

      {result && (
        <div
          className={`mt-4 rounded-[var(--mf-radius-lg)] border p-4 ${
            sent ? 'border-accent bg-mint/60' : 'border-line bg-elevated/50'
          }`}
        >
          <p className="flex flex-wrap items-baseline gap-2">
            <span className={`text-sm font-bold ${sent ? 'text-accent' : 'text-ink'}`}>
              {sent ? 'Submitted' : result.state.replace(/_/g, ' ').toLowerCase()}
            </span>
            {result.company && <span className="text-sm text-muted">{[result.role, result.company].filter(Boolean).join(' · ')}</span>}
          </p>

          <p className="mt-1 text-[13px] leading-relaxed text-muted">{result.reason}</p>

          {result.confirmation && (
            <p className="mt-2 font-mono text-xs text-ink">Reference {result.confirmation.reference}</p>
          )}

          {result.filled.length > 0 && (
            <p className="mt-2 text-xs text-muted">Filled: {result.filled.join(', ')}</p>
          )}

          {result.unresolved.length > 0 && (
            <ul className="mt-2 space-y-2">
              {result.unresolved.slice(0, 6).map((u) => (
                <AnswerPrompt key={u.question} question={u.question} reason={u.reason} kind={u.kind} />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * The switch that lets the worker run this account with nobody present.
 *
 * It changes *who starts a run*, not what a run may do. Every gate below it is
 * unchanged — readiness, the fit threshold, the daily cap, the verifier, the
 * execution policy — so turning this on cannot cause anything that pressing
 * Run would not have caused. The copy says so, because a switch labelled
 * "autonomous" invites the assumption that it also removes the checks.
 *
 * Disabled while readiness is failing. Letting someone arm an unattended
 * process that will stop on its first job, every hour, forever, is worse than
 * telling them it is not ready.
 */
function AutonomousSwitch({
  on,
  lastRunAt,
  ready,
  scheduler,
  onToggle,
}: {
  on: boolean;
  lastRunAt: number;
  ready: boolean;
  scheduler?: { live: boolean; reason: string; lastSweepAt: number; lastError: string; pollMs: number };
  onToggle: (next: boolean) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  /*
   * On, and nothing is listening.
   *
   * This is the state the screen previously could not show. The switch wrote
   * `autonomous: true`, reported success, and the only thing that would have
   * acted on it - a separate worker process - cannot run beside the dev server,
   * because both would open the same single-process database. So the flag was
   * set, the dot pulsed, and no application was ever sent.
   *
   * A control that reports success and does nothing is the worst failure an
   * interface can have, so the disagreement is stated here in plain words.
   */
  const armedButIdle = on && scheduler !== undefined && !scheduler.live;

  return (
    <section
      className={`flex flex-wrap items-center gap-4 rounded-[var(--mf-radius-xl)] border p-5 ${
        on ? 'border-accent bg-mint/60' : 'border-line bg-canvas'
      }`}
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span
            aria-hidden
            className={`size-2 rounded-full ${
              armedButIdle ? 'bg-[var(--color-warn)]' : on ? 'animate-pulse bg-accent' : 'bg-faint'
            }`}
          />
          <span className="text-sm font-bold text-ink">Autonomous mode</span>
          <span className={`text-xs ${armedButIdle ? 'text-warn' : 'text-muted'}`}>
            {armedButIdle ? 'On, but not running' : on ? 'Running' : 'Off'}
          </span>
        </span>
        <span className="mt-1 block text-[13px] leading-relaxed text-muted">
          {on
            ? 'Runs on its own every hour, whether or not this page is open. Same rules — your fit threshold, your daily cap, and every check below still apply.'
            : 'Runs the queue on its own every hour, so you can close this page. It applies the same rules as pressing Run; it only changes who starts it.'}
        </span>
        {on && lastRunAt > 0 && (
          <span className="mt-1 block text-xs text-faint">Last cycle {new Date(lastRunAt).toLocaleString()}</span>
        )}

        {armedButIdle && (
          <span className="mt-1.5 block text-xs text-warn">
            Nothing is scheduled to run cycles, so no applications are going out. {scheduler?.reason}
          </span>
        )}

        {on && scheduler?.live && (
          <span className="mt-1 block text-xs text-faint">
            Checking every {Math.round(scheduler.pollMs / 1000)}s
            {scheduler.lastSweepAt > 0 ? ` - last check ${new Date(scheduler.lastSweepAt).toLocaleTimeString()}` : ''}
          </span>
        )}

        {on && scheduler?.lastError && (
          <span className="mt-1 block text-xs text-warn">Last cycle failed: {scheduler.lastError}</span>
        )}
        {!ready && (
          <span className="mt-1 block text-xs text-warn">
            Finish the setup above first — an unattended run would stop on its first job.
          </span>
        )}
      </span>

      <Button
        variant={on ? 'secondary' : 'primary'}
        disabled={busy || (!on && !ready)}
        onClick={async () => {
          setBusy(true);
          await onToggle(!on);
          setBusy(false);
        }}
      >
        {busy ? 'Saving…' : on ? 'Turn off' : 'Turn on'}
      </Button>
    </section>
  );
}

/**
 * A question the run could not answer, and the box that ends it forever.
 *
 * ## The loop this closes
 *
 * The resume answers what it states. The account answers what it holds.
 * Whatever is left is a question only the candidate can answer - and before
 * this, the interface showed it to them and did nothing with it. They typed the
 * answer into the employer's form by hand, and the next application asked the
 * same thing, because nothing was learning.
 *
 * Answering here writes it to the answer book. Every future application that
 * asks this question fills it in without stopping. That is the whole difference
 * between a tool that prepares applications and one that gets better at it.
 *
 * ## Why the answer is typed rather than suggested
 *
 * There is no "generate an answer" button and there will not be one. Notice
 * period, salary expectation, years with a given tool - these are facts about
 * the candidate that no model has access to, and a plausible-looking guess
 * submitted in their name is the failure this whole system exists to avoid.
 */
function AnswerPrompt({
  question,
  reason,
  kind,
  onSaved,
}: {
  question: string;
  reason: string;
  kind?: string;
  onSaved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [message, setMessage] = useState('');

  /* An attestation is shown but never made answerable. Storing an answer to
     "I certify the above is true" would let it be filled unattended later, and
     that assertion is the candidate's to make on every single application. */
  const attestation = /\b(certif|attest|i\s+agree|acknowledg|consent|declare)/i.test(question);

  const save = async () => {
    if (!value.trim()) return;
    setState('saving');
    try {
      const res = await fetch('/api/jobs/answers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question, value }),
      });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Could not save that.');
      setState('saved');
      setMessage(data.message ?? 'Saved.');
      onSaved?.();
    } catch (err) {
      setState('error');
      setMessage(err instanceof Error ? err.message : 'Could not save that.');
    }
  };

  return (
    <li className="rounded-xl border border-line px-3.5 py-2.5">
      <p className="text-sm text-ink">{question}</p>
      <p className="mt-0.5 text-xs text-muted">{reason}</p>

      {attestation ? (
        <p className="mt-2 text-xs text-faint">
          Only you can agree to this, so it is always handed back to you - even after you answer it once.
        </p>
      ) : state === 'saved' ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-accent">
          <CheckIcon className="h-3.5 w-3.5" />
          {message}
        </p>
      ) : open ? (
        <div className="mt-2.5 flex flex-col gap-2">
          {kind === 'textarea' ? (
            <textarea
              autoFocus
              rows={3}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Your answer"
              className="w-full rounded-[var(--mf-radius-md)] border border-line bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            />
          ) : (
            <input
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void save();
              }}
              placeholder={kind === 'boolean' ? 'Yes or No' : 'Your answer'}
              className="h-10 w-full rounded-[var(--mf-radius-md)] border border-line bg-canvas px-3 text-sm text-ink outline-none focus:border-accent"
            />
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" disabled={state === 'saving' || !value.trim()} onClick={save}>
              {state === 'saving' ? 'Saving...' : 'Save answer'}
            </Button>
            <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted underline">
              Cancel
            </button>
            <span className="text-[11px] text-faint">Used on every future application that asks this.</span>
          </div>

          {state === 'error' && <p className="text-xs text-warn">{message}</p>}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-2 text-xs font-semibold text-accent underline underline-offset-2"
        >
          Answer this once
        </button>
      )}
    </li>
  );
}

/**
 * A short status line about the current configuration.
 *
 * These used to be bare coloured paragraphs hanging under the mode cards,
 * which read as an error the page had thrown rather than as an explanation of
 * what the settings currently add up to. They say something important -- that
 * a mode alone does not send anything -- so they get a shape.
 */
function Notice({ tone, children }: { tone: 'warn' | 'info'; children: React.ReactNode }) {
  const warn = tone === 'warn';
  return (
    <p
      className={`mt-3 flex items-start gap-2 rounded-[var(--mf-radius-md)] px-3 py-2 text-xs leading-relaxed ${
        warn ? 'bg-warn-soft text-ink' : 'bg-elevated text-muted'
      }`}
    >
      <span aria-hidden className={`mt-[3px] size-1.5 shrink-0 rounded-full ${warn ? 'bg-warn' : 'bg-faint'}`} />
      <span>{children}</span>
    </p>
  );
}


/**
 * The fit before and after tailoring.
 *
 * Both numbers come from `scoreJob`, the same function that produced the match
 * percentage on the job card -- run once on the original résumé and once on the
 * document that will actually be attached. That is the only comparison worth
 * showing: a second scorer tuned to flatter its own output would produce a
 * bigger number and mean nothing.
 */
function FitDelta({ before, after }: { before: number; after: number }) {
  const gain = after - before;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-line px-3.5 py-3">
      <span className="flex items-baseline gap-1.5">
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-faint">Your résumé</span>
        <span className="text-lg font-bold tabular-nums text-muted">{before}%</span>
      </span>

      <span aria-hidden className="text-muted">
        &rarr;
      </span>

      <span className="flex items-baseline gap-1.5">
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-faint">Tailored</span>
        <span className={`text-lg font-bold tabular-nums ${after >= before ? 'text-accent' : 'text-ink'}`}>{after}%</span>
      </span>

      <span className="text-xs text-muted">
        {gain > 0
          ? `+${gain} points against this posting's requirements.`
          : gain === 0
            ? 'No change — your résumé already covered what this posting asks for.'
            : `${gain} points. The original was the better match; it is what gets sent.`}
      </span>
    </div>
  );
}

/**
 * The document being sent, readable before it is sent.
 *
 * Collapsed by default because it is long and most people will not want it, and
 * available in one click because it is the thing going out in their name. A
 * summary of a document is not the document.
 */
function ResumeDocument({ text, name }: { text: string; name: string | null }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="text-xs font-semibold text-accent underline underline-offset-2"
      >
        {open ? 'Hide the résumé being sent' : 'Read the résumé being sent'}
      </button>

      {open && (
        <div className="mt-2 rounded-xl border border-line bg-elevated">
          {name && (
            <p className="border-b border-line px-3.5 py-2 font-mono text-[11px] text-muted">{name}</p>
          )}
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap px-3.5 py-3 font-mono text-[12px] leading-relaxed text-ink">
            {text}
          </pre>
        </div>
      )}
    </div>
  );
}

/**
 * A slider that commits once per gesture.
 *
 * ## Why it stopped committing
 *
 * This used to hang the write on the input's own `onPointerUp`. Release the
 * mouse anywhere except over a 16-pixel-tall track -- which is most of the
 * time, because dragging horizontally drifts vertically -- and that event never
 * fires on the input. Two things then went wrong at once: the change was never
 * saved, and `dragging` stayed true forever, so the control went on displaying
 * the value the candidate had dragged to. It looked saved. It was not, and no
 * later render could correct it, because a stuck `dragging` flag also blocks
 * the value coming back from the server.
 *
 * Now the commit is driven by the value settling rather than by a mouse event
 * landing in the right place: a short quiet period after the last change, so a
 * drag across the whole track is still one write. Pointer capture is still
 * honoured where it works, as an immediate commit on release.
 *
 * `pending` is the local value only while a gesture is in flight. Once
 * committed it is cleared, so the prop is the single source of truth again and
 * a rejected write visibly snaps back.
 */
function Slider({
  label,
  value,
  min,
  max,
  suffix,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  onCommit: (v: number) => void;
}) {
  const [pending, setPending] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shown = pending ?? value;

  const commit = useCallback(
    (v: number) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      setPending(null);
      if (v !== value) onCommit(v);
    },
    [onCommit, value],
  );

  /* A gesture in flight must not outlive the control. */
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <div className="rounded-[var(--mf-radius-lg)] border border-line p-3.5">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-faint">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-ink">
        {shown}
        {suffix}
      </p>
      <input
        type="range"
        min={min}
        max={max}
        value={shown}
        aria-label={label}
        onChange={(e) => {
          const next = Number(e.target.value);
          setPending(next);
          if (timer.current) clearTimeout(timer.current);
          /* Long enough that a full drag is one write, short enough that
             letting go feels like it took effect. */
          timer.current = setTimeout(() => commit(next), 350);
        }}
        onPointerUp={(e) => commit(Number(e.currentTarget.value))}
        onBlur={(e) => commit(Number(e.currentTarget.value))}
        className="mt-1.5 w-full accent-[var(--color-accent-fill)]"
      />
    </div>
  );
}
