'use client';

import { useCallback, useEffect, useState } from 'react';
import { RadialGauge, DonutBreakdown, ChartFrame, STATUS, SERIES } from './charts';
import { MatchBoard } from './match-board';
import { JobOnboarding } from './job-onboarding';
import { JobSettings } from './job-settings';
import { JobReadiness } from './job-readiness';
import { ActivityChart, type ActivityPoint } from './activity-chart';
import { useHashView } from './use-hash-view';
import { JobAutopilot } from './job-autopilot';
import { JobDetail } from './job-detail';
import { JobInbox } from './job-inbox';
import { JobCalendar } from './job-calendar';
import { JobDocuments } from './job-documents';
import { JobPresence } from './job-presence';
import type { Application, CandidateProfile, JobFunnel, Match, AppState } from '@/lib/jobs-store';

/** The four surfaces of the job side, in the order someone moves through them. */
const VIEWS = [
  { key: 'matches', label: 'Matches' },
  { key: 'autopilot', label: 'Auto Apply' },
  { key: 'readiness', label: 'Readiness' },
  { key: 'tracker', label: 'Tracker' },
  { key: 'documents', label: 'Documents' },
  { key: 'presence', label: 'Presence' },
  { key: 'inbox', label: 'Inbox' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'settings', label: 'Settings' },
] as const;
type View = (typeof VIEWS)[number]['key'];
const VIEW_KEYS = VIEWS.map((v) => v.key);

type Payload = {
  hasProfile: boolean;
  profile: CandidateProfile | null;
  matches: Match[];
  applications: Application[];
  funnel: JobFunnel;
};

/** Colour and wording per state. Status hues, never the categorical series. */
const STATE_META: Record<AppState, { label: string; color: string }> = {
  MATCHED: { label: 'Matched', color: STATUS.neutral },
  PREPARING: { label: 'Preparing', color: SERIES[0] },
  READY: { label: 'Ready to apply', color: SERIES[3] },
  NEEDS_USER_INPUT: { label: 'Needs you', color: STATUS.warn },
  APPLIED: { label: 'Applied', color: SERIES[1] },
  INTERVIEW: { label: 'Interview', color: STATUS.good },
  REJECTED: { label: 'Rejected', color: STATUS.bad },
  OFFER: { label: 'Offer', color: STATUS.good },
  SKIPPED: { label: 'Skipped', color: STATUS.neutral },
};

const FILTERS: { key: AppState | 'ALL'; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'READY', label: 'Ready' },
  { key: 'APPLIED', label: 'Applied' },
  { key: 'INTERVIEW', label: 'Interview' },
  { key: 'NEEDS_USER_INPUT', label: 'Needs you' },
];

/**
 * JobPilot.
 *
 * Learners only — the API refuses staff accounts, and this component is never
 * mounted for them either. Two gates rather than one, because a UI-only gate is
 * a suggestion and an API-only gate leaves a dead link in the nav.
 */
export function JobPilot() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<AppState | 'ALL'>('ALL');
  /* Depth 1: `#jobs/settings`. Survives a refresh, and makes a tab linkable. */
  const [view, setView] = useHashView<View>(1, VIEW_KEYS, 'matches');
  const [detail, setDetail] = useState<Match | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    fetch('/api/jobs')
      .then(async (r) => {
        const d = (await r.json()) as Payload & { error?: string };
        if (!alive) return;
        if (!r.ok) setError(d.error ?? 'Could not load JobPilot.');
        else setData(d);
      })
      .catch(() => {
        if (alive) setError('Could not load JobPilot.');
      });
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  const move = useCallback(async (jobId: string, state: AppState) => {
    setBusy(jobId);
    try {
      await fetch('/api/jobs/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, state }),
      });
      setReloadKey((k) => k + 1);
    } finally {
      setBusy(null);
    }
  }, []);

  if (error) return <p className="rounded-2xl border border-line bg-canvas p-6 text-sm text-muted">{error}</p>;
  if (!data)
    return (
      <p role="status" aria-live="polite" className="rounded-2xl border border-line bg-canvas p-6 text-sm text-muted">
        Loading JobPilot…
      </p>
    );

  if (!data.hasProfile) return <JobOnboarding onDone={() => setReloadKey((k) => k + 1)} />;

  const { matches, applications, funnel } = data;

  const shown = filter === 'ALL' ? applications : applications.filter((a) => a.state === filter);
  const slices = Object.entries(funnel.byState)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => ({ label: STATE_META[k as AppState]?.label ?? k, value: n }));

  return (
    <div className="space-y-6">
      {/* The four surfaces, level with each other. Settings is a tab rather
          than a gear glyph because changing a phone number or swapping a
          résumé is part of the job search, not a rare preference. */}
      {/* Wraps rather than scrolls.
          Six tabs measure 543px, so inside a 351px phone viewport the last two
          — Calendar and Settings — sat off the right edge with no arrow, no
          fade, and nothing to suggest the row moved at all. They were simply
          invisible. Wrapping costs a second line and shows every tab. */}
      <nav aria-label="JobPilot sections">
        <div className="flex flex-wrap gap-1 rounded-[var(--mf-radius-xl)] border border-line bg-elevated p-1 sm:inline-flex sm:rounded-full">
          {VIEWS.map((v) => {
            const needs = v.key === 'tracker' ? applications.filter((a) => a.state === 'NEEDS_USER_INPUT').length : 0;
            return (
              <button
                key={v.key}
                type="button"
                onClick={() => setView(v.key)}
                aria-current={view === v.key ? 'page' : undefined}
                className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-1.5 text-[13px] font-semibold transition ${
                  view === v.key ? 'bg-canvas text-ink shadow-[var(--mf-shadow-xs)]' : 'text-muted hover:text-ink'
                }`}
              >
                {v.label}
                {needs > 0 && (
                  <span className="rounded-full bg-[var(--color-warn)] px-1.5 text-[10px] font-bold leading-4 text-white">
                    {needs}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {detail && (
        <JobDetail
          match={detail}
          onClose={() => setDetail(null)}
          onMove={(id, state) => {
            void move(id, state);
            if (state === 'SKIPPED') setDetail(null);
          }}
        />
      )}

      {view === 'settings' && <JobSettings />}
      {view === 'autopilot' && <JobAutopilot matches={matches} />}
      {view === 'readiness' && <JobReadiness />}
      {view === 'documents' && <JobDocuments />}
      {view === 'presence' && <JobPresence />}
      {view === 'inbox' && <JobInbox />}
      {view === 'calendar' && <JobCalendar />}

      {view === 'matches' && (
        <MatchBoard reloadKey={reloadKey} busyId={busy} onMove={move} onOpen={setDetail} />
      )}

      {view === 'tracker' && (
        <>
      {/* ── Funnel analytics ── */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <ChartFrame title="Your funnel" hint="Where every tracked application currently sits.">
          <DonutBreakdown slices={slices} centerLabel={String(funnel.total)} emptyMessage="Track a job to see your funnel." />
        </ChartFrame>

        <ChartFrame
          title="Conversion"
          hint="Interviews per application actually sent, the number that matters, not application count."
        >
          <div className="flex flex-wrap items-center justify-center gap-8 py-2">
            {/* Withheld rather than shown as 0%: an empty funnel is "not yet",
                not failure, and a red zero would read as the latter. */}
            {funnel.interviewRate == null ? (
              <p className="text-sm text-muted">Nothing sent yet, mark a job Applied to start tracking.</p>
            ) : (
              <>
                <RadialGauge value={funnel.interviewRate} label="Interview rate" sub="of applications sent" />
                <RadialGauge value={funnel.meanScore ?? 0} label="Mean fit" sub="of what you applied to" color={SERIES[3]} />
              </>
            )}
          </div>
        </ChartFrame>
      </div>

      {/* ── Activity over time and fit distribution ── */}
      <ChartFrame
        title="Activity"
        hint="Applications per day over the last month — solid is sent, faded is prepared — and where your fit scores land."
      >
        <ActivityChart
          points={((): ActivityPoint[] => {
            /* One bucket per local day. Sparse days matter as gaps, so the
               range is filled rather than only days with activity. */
            const byDay = new Map<number, { applied: number; prepared: number }>();
            for (const a of applications) {
              const d = new Date(a.updatedAt);
              d.setHours(0, 0, 0, 0);
              const k = d.getTime();
              const cur = byDay.get(k) ?? { applied: 0, prepared: 0 };
              if (a.state === 'APPLIED' || a.state === 'INTERVIEW' || a.state === 'OFFER') cur.applied += 1;
              else cur.prepared += 1;
              byDay.set(k, cur);
            }
            const out: ActivityPoint[] = [];
            const start = new Date();
            start.setHours(0, 0, 0, 0);
            start.setDate(start.getDate() - 29);
            for (let i = 0; i < 30; i += 1) {
              const k = start.getTime() + i * 86_400_000;
              const v = byDay.get(k) ?? { applied: 0, prepared: 0 };
              out.push({ day: k, ...v });
            }
            return out;
          })()}
          scores={applications.map((a) => a.score).filter((n) => Number.isFinite(n))}
        />
      </ChartFrame>

      {/* ── Applications table ── */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-bold text-ink">All applications</h3>
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                aria-pressed={filter === f.key}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  filter === f.key ? 'border-ink bg-ink text-canvas' : 'border-line text-muted hover:bg-elevated'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-line bg-canvas">
          {shown.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted">Nothing here yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-elevated text-[11px] uppercase tracking-wider text-faint">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Position</th>
                    <th className="px-4 py-2.5 font-semibold">Fit</th>
                    <th className="px-4 py-2.5 font-semibold">Status</th>
                    <th className="px-4 py-2.5 font-semibold">Updated</th>
                    <th className="px-4 py-2.5 font-semibold" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {shown.map((a) => {
                    const meta = STATE_META[a.state];
                    return (
                      <tr key={a.job.id} className="hover:bg-elevated/40">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-ink">{a.job.company}</p>
                          <p className="text-xs text-muted">{a.job.title}</p>
                        </td>
                        <td className="px-4 py-3 tabular-nums text-muted">{a.score}</td>
                        <td className="px-4 py-3">
                          {/* Dot plus word, status is never colour alone. */}
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: meta.color }}>
                            <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} />
                            {meta.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted">{relative(a.updatedAt)}</td>
                        <td className="px-4 py-3 text-right">
                          <select
                            value={a.state}
                            onChange={(e) => void move(a.job.id, e.target.value as AppState)}
                            aria-label={`Status for ${a.job.title} at ${a.job.company}`}
                            className="rounded-full border border-line bg-canvas px-2.5 py-1 text-xs text-ink outline-none focus:border-accent"
                          >
                            {(Object.keys(STATE_META) as AppState[]).map((s) => (
                              <option key={s} value={s}>
                                {STATE_META[s].label}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
        </>
      )}
    </div>
  );
}

/* ── Match card ──────────────────────────────────────────────────────────── */

function relative(ms: number): string {
  const d = Math.floor((Date.now() - ms) / 86_400_000);
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 30) return `${d} days ago`;
  return new Date(ms).toLocaleDateString();
}
