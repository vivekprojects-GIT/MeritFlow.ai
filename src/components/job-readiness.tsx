'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from './button';
import { CheckIcon } from './icons';

/**
 * Candidate Readiness.
 *
 * ## What this replaces
 *
 * Autopilot's interruptions were met one at a time, mid-run: a form asked
 * something true about the candidate that nobody had recorded, the engine
 * refused to invent it, and the run parked. Correct, and a miserable way to
 * find out — there was no way to see how many more were coming, or to answer
 * them in one sitting.
 *
 * This is that list, up front. Fill it once and normal operation stops asking.
 *
 * ## Three states, not two
 *
 * A field is verified, or it needs a look, or it is missing. The middle one is
 * why this page is worth building rather than just showing gaps: values read
 * from the résumé are already filled in, and confirming a parsed employer name
 * takes a second where typing it takes a minute. Nothing derived counts as
 * verified until the candidate says so — the submit gate reads that difference
 * and will not send a factual answer without it.
 *
 * ## Blocking versus optional
 *
 * The percentage counts blocking facts only. Padding it with pronouns and
 * portfolio URLs would show 90% while work authorisation was still unanswered,
 * which is the number being wrong in the only direction that matters.
 */

type FactStatus = 'VERIFIED' | 'NEEDS_REVIEW' | 'MISSING';

type Fact = {
  key: string;
  label: string;
  group: string;
  status: FactStatus;
  value: string | null;
  importance: 'blocking' | 'optional';
  why: string;
};

type Readiness = {
  percent: number;
  ready: boolean;
  facts: Fact[];
  counts: { verified: number; needsReview: number; missing: number; blockingMissing: number };
};

const GROUP_ORDER = [
  'ELIGIBILITY',
  'PREFERENCES',
  'IDENTITY',
  'CONTACT',
  'LOCATION',
  'HISTORY',
  'AUTHORIZATION',
  'VOLUNTARY',
] as const;

const GROUP_LABEL: Record<string, string> = {
  ELIGIBILITY: 'Eligibility',
  PREFERENCES: 'Preferences',
  IDENTITY: 'Identity',
  CONTACT: 'Contact',
  LOCATION: 'Location',
  HISTORY: 'History and education',
  AUTHORIZATION: 'Authorisations',
  VOLUNTARY: 'Voluntary disclosures',
};

/**
 * Suggested values for the questions with a small, closed set of answers.
 *
 * Offered as buttons rather than left as free text because these are the ones
 * an employer's dropdown expects to match, and because a candidate typing
 * "fulltime" into a field that wanted "Full-time" is a silent mismatch nobody
 * sees until an application is rejected.
 */
const CHOICES: Record<string, string[]> = {
  'EMPLOYMENT.TYPE': ['Full-time', 'Contract', 'Full-time or contract'],
  'LANGUAGE.PROFICIENCY': ['Native', 'Fluent', 'Professional', 'Conversational'],
  'LOGISTICS.REMOTE_INTENT': ['Yes', 'No'],
  'LOGISTICS.ONSITE': ['Yes', 'No'],
  'LOGISTICS.RELOCATION': ['Yes', 'No'],
  'LOGISTICS.TRANSPORT': ['Yes', 'No'],
  'LOGISTICS.START_DATE': ['Immediately', 'Two weeks', 'One month'],
  'CLEARANCE.SECURITY': ['No', 'Yes'],
  'HISTORY.REFERRAL': ['Not referred'],
  'HISTORY.EMPLOYMENT_COMPLETE': ['Yes'],
  'HISTORY.CLIENTS_COMPLETE': ['Yes'],
  'HISTORY.CONSULTING_COMPLETE': ['Yes'],
  'ACCOMMODATION.NEEDED': ['No', 'Yes'],
  'BACKGROUND.FOREIGN_TIES': ['No', 'Yes'],
  'DEMOGRAPHIC.VOLUNTARY': ['Decline to self-identify'],
};

export function JobReadiness() {
  const [data, setData] = useState<Readiness | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);

  /* Fetched inline rather than through a callback, matching the other JobPilot
     screens: state is set from the promise, not from the effect body. Saving
     returns the fresh readiness, so nothing needs to re-fetch after mount. */
  useEffect(() => {
    let alive = true;
    fetch('/api/jobs/readiness')
      .then(async (r) => {
        const d = (await r.json()) as Readiness & { error?: string };
        if (!alive) return;
        if (!r.ok) setError(d.error ?? 'Could not load your readiness.');
        else setData(d);
      })
      .catch(() => {
        if (alive) setError('Could not load your readiness.');
      });
    return () => {
      alive = false;
    };
  }, []);

  const save = useCallback(
    async (key: string, value: string) => {
      if (!value.trim()) return;
      setBusy(key);
      try {
        const r = await fetch('/api/jobs/readiness', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ key, value }),
        });
        const d = (await r.json()) as Readiness & { error?: string };
        if (!r.ok) setError(d.error ?? 'Could not save that.');
        else {
          setData(d);
          setError(null);
          setDrafts((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
          });
        }
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  if (error && !data) return <p className="text-sm text-red-600 dark:text-red-400">{error}</p>;
  if (!data) return <p className="text-sm text-neutral-500">Loading…</p>;

  /* Done rows are collapsed by default: the point of the page is what is left,
     and a wall of green pushes the actual work below the fold. */
  const outstanding = data.facts.filter((f) => f.status !== 'VERIFIED');
  const visible = showDone ? data.facts : outstanding;

  return (
    <div className="space-y-6">
      <header className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">Candidate readiness</h2>
          <span className="font-mono text-2xl tabular-nums">{data.percent}%</span>
        </div>

        <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
          <div
            className={`h-full rounded-full transition-all ${data.ready ? 'bg-emerald-600' : 'bg-amber-500'}`}
            style={{ width: `${data.percent}%` }}
          />
        </div>

        <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">
          {data.ready ? (
            <>
              Everything Autopilot needs is recorded. Normal runs will not stop to ask you — a form asking something
              outside this list is skipped and the next job is tried.
            </>
          ) : (
            <>
              <strong className="text-neutral-900 dark:text-neutral-100">{data.counts.blockingMissing}</strong> required{' '}
              {data.counts.blockingMissing === 1 ? 'fact is' : 'facts are'} missing. Each one is a question employers ask
              that Autopilot will not answer for you, so every posting that asks it is skipped.
            </>
          )}
        </p>

        <div className="mt-3 flex flex-wrap gap-4 text-xs text-neutral-500">
          <span>{data.counts.verified} verified</span>
          <span>{data.counts.needsReview} to confirm</span>
          <span>{data.counts.missing} missing</span>
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            className="underline underline-offset-2 hover:text-neutral-800 dark:hover:text-neutral-200"
          >
            {showDone ? 'Hide completed' : 'Show completed'}
          </button>
        </div>
      </header>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {GROUP_ORDER.map((group) => {
        const rows = visible.filter((f) => f.group === group);
        if (rows.length === 0) return null;

        return (
          <section key={group}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
              {GROUP_LABEL[group] ?? group}
            </h3>

            <div className="divide-y divide-neutral-200 overflow-hidden rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
              {rows.map((f) => {
                const choices = CHOICES[f.key];
                const draft = drafts[f.key] ?? '';

                return (
                  <div key={f.key} className="bg-white p-4 dark:bg-neutral-900">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-sm font-medium">
                          {f.label}
                          {f.importance === 'optional' && (
                            <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-normal uppercase tracking-wide text-neutral-500 dark:bg-neutral-800">
                              optional
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 max-w-prose text-xs text-neutral-500">{f.why}</p>
                      </div>

                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          f.status === 'VERIFIED'
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                            : f.status === 'NEEDS_REVIEW'
                              ? 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                              : 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'
                        }`}
                      >
                        {f.status === 'VERIFIED' ? 'Verified' : f.status === 'NEEDS_REVIEW' ? 'Confirm' : 'Missing'}
                      </span>
                    </div>

                    {/* Verified rows show the value and nothing else to do. */}
                    {f.status === 'VERIFIED' && (
                      <p className="mt-2 flex items-center gap-1.5 font-mono text-xs text-neutral-600 dark:text-neutral-400">
                        <CheckIcon className="h-3.5 w-3.5 text-emerald-600" />
                        {f.value}
                      </p>
                    )}

                    {/* A parsed value is one button away from being usable. */}
                    {f.status === 'NEEDS_REVIEW' && f.value && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <code className="rounded bg-neutral-100 px-2 py-1 text-xs dark:bg-neutral-800">{f.value}</code>
                        <Button
                          size="sm"
                          onClick={() => void save(f.key, f.value ?? '')}
                          disabled={busy === f.key}
                        >
                          {busy === f.key ? 'Saving…' : 'Confirm'}
                        </Button>
                      </div>
                    )}

                    {(f.status === 'MISSING' || f.status === 'NEEDS_REVIEW') && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {choices ? (
                          choices.map((c) => (
                            <Button
                              key={c}
                              size="sm"
                              variant="secondary"
                              onClick={() => void save(f.key, c)}
                              disabled={busy === f.key}
                            >
                              {c}
                            </Button>
                          ))
                        ) : f.key.startsWith('AUTH.') ? (
                          <Button size="sm" onClick={() => void save(f.key, 'granted')} disabled={busy === f.key}>
                            Authorise
                          </Button>
                        ) : (
                          <>
                            <input
                              value={draft}
                              onChange={(e) => setDrafts((p) => ({ ...p, [f.key]: e.target.value }))}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') void save(f.key, draft);
                              }}
                              placeholder={f.status === 'NEEDS_REVIEW' ? 'Or type a different value' : 'Your answer'}
                              className="min-w-0 flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-950"
                            />
                            <Button size="sm" onClick={() => void save(f.key, draft)} disabled={busy === f.key || !draft.trim()}>
                              {busy === f.key ? 'Saving…' : 'Save'}
                            </Button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {outstanding.length === 0 && !showDone && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          Nothing outstanding. Autopilot has everything it needs to apply without stopping to ask you.
        </p>
      )}
    </div>
  );
}
