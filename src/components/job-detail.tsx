'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from './button';
import { CloseIcon, HeartIcon, SparklesIcon, TargetIcon, ClockIcon, LayersIcon, UserIcon, CheckIcon } from './icons';
import type { Match, AppState } from '@/lib/jobs-store';

/**
 * The job detail panel.
 *
 * The card answers "is this worth my time"; this answers "what is this job and
 * do I qualify". It opens over the list rather than routing away, because
 * losing your place in a scored list to read one posting is the fastest way to
 * make people stop reading postings.
 */

const LABELS: Record<string, string> = {
  skills: 'Skill match',
  role: 'Role fit',
  seniority: 'Experience level',
  evidence: 'Your background',
  location: 'Location',
  compensation: 'Compensation',
  freshness: 'Freshly posted',
};

/**
 * Job descriptions arrive as one blob with newline conventions that vary by
 * source. Split into paragraphs and detect list items, so a posting reads like
 * a document rather than a wall.
 */
function parseDescription(text: string): { kind: 'p' | 'ul' | 'h'; items: string[] }[] {
  const lines = text
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.trim());

  const blocks: { kind: 'p' | 'ul' | 'h'; items: string[] }[] = [];
  let bullets: string[] = [];

  const flush = () => {
    if (bullets.length > 0) {
      blocks.push({ kind: 'ul', items: bullets });
      bullets = [];
    }
  };

  for (const line of lines) {
    if (!line) {
      flush();
      continue;
    }
    const bullet = /^[-•*·]\s+/.test(line) || /^\d+[.)]\s+/.test(line);
    if (bullet) {
      bullets.push(line.replace(/^[-•*·]\s+/, '').replace(/^\d+[.)]\s+/, ''));
      continue;
    }
    flush();
    /* A short line ending in a colon, or in title case with no full stop, is a
       section heading in almost every posting format. */
    const heading = line.length < 60 && (line.endsWith(':') || !/[.!?]$/.test(line));
    blocks.push({ kind: heading ? 'h' : 'p', items: [line.replace(/:$/, '')] });
  }
  flush();
  return blocks;
}

export function JobDetail({
  match,
  onClose,
  onMove,
  onAsk,
}: {
  match: Match;
  onClose: () => void;
  onMove: (jobId: string, state: AppState) => void;
  onAsk?: (match: Match) => void;
}) {
  const [tab, setTab] = useState<'overview' | 'company' | 'match'>('overview');
  const { job, score, parts, gaps } = match;

  /* Escape closes. A panel that traps you is worse than no panel. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const blocks = useMemo(() => parseDescription(job.description), [job.description]);

  /* Skills the résumé evidences, against skills the posting requires. `gaps` is
     already the unevidenced set, so matched is the complement — derived rather
     than recomputed, so the two can never disagree. */
  const gapSet = new Set(gaps.map((g) => g.toLowerCase()));
  const matched = job.skills.filter((s) => !gapSet.has(s.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" role="dialog" aria-modal="true" aria-label={`${job.title} at ${job.company}`}>
      {/* Clicking the backdrop closes; the panel stops the event. */}
      <button type="button" aria-label="Close" className="absolute inset-0 cursor-default" onClick={onClose} />

      <div className="relative flex h-full w-full max-w-3xl flex-col overflow-hidden bg-surface shadow-[var(--mf-shadow-lg)]">
        {/* ── Header ── */}
        <header className="shrink-0 border-b border-line bg-canvas px-5 py-4 sm:px-6">
          <div className="flex items-start gap-3">
            <span
              aria-hidden
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--mf-radius-md)] bg-ink text-sm font-bold text-canvas"
            >
              {job.company.slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-[19px] font-bold leading-tight text-ink">{job.title}</h2>
              <p className="mt-0.5 text-sm text-muted">
                <span className="font-medium text-ink">{job.company}</span>
                {job.location && <span> · {job.remote ? 'Remote' : job.location}</span>}
              </p>
            </div>
            <Button variant="ghost" iconOnly aria-label="Close" onClick={onClose}>
              <CloseIcon className="h-4 w-4" />
            </Button>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => onMove(job.id, 'APPLIED')}
              className="inline-flex h-10 items-center rounded-[var(--mf-radius-full)] bg-accent-fill px-6 text-[13px] font-bold uppercase tracking-wide text-white transition hover:brightness-110 active:scale-[0.97]"
            >
              Apply on {job.company}
            </a>
            <Button variant="secondary" onClick={() => onMove(job.id, 'PREPARING')}>
              <HeartIcon className="h-3.5 w-3.5" />
              Save
            </Button>
            {onAsk && (
              <Button variant="secondary" onClick={() => onAsk(match)}>
                <SparklesIcon className="h-3.5 w-3.5" />
                Ask about this job
              </Button>
            )}
            <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-mint px-3 py-1.5 text-[13px] font-bold text-accent tabular-nums">
              {score}% fit
            </span>
          </div>

          {/* The link goes to the employer's own posting, not a careers page —
              the tab label says so, because the difference is the whole point. */}
          <nav className="mt-4 flex gap-1 border-b border-line" aria-label="Job sections">
            {(
              [
                ['overview', 'Overview'],
                ['company', 'Company'],
                ['match', 'Your match'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                aria-current={tab === key ? 'page' : undefined}
                className={`-mb-px border-b-2 px-3.5 py-2 text-sm font-semibold transition ${
                  tab === key ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
        </header>

        {/* ── Body ── */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {tab === 'overview' && (
            <>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-[var(--mf-radius-lg)] border border-line bg-canvas p-4 text-[13px] sm:grid-cols-3">
                <Fact icon={<TargetIcon className="h-3.5 w-3.5" />} label="Location" value={job.remote ? 'Remote' : job.location} />
                <Fact icon={<ClockIcon className="h-3.5 w-3.5" />} label="Type" value={job.employment} />
                <Fact icon={<LayersIcon className="h-3.5 w-3.5" />} label="Experience" value={job.yearsExp} />
                <Fact icon={<UserIcon className="h-3.5 w-3.5" />} label="Level" value={job.seniority} />
                <Fact icon={<TargetIcon className="h-3.5 w-3.5" />} label="Work mode" value={job.workMode} />
                <Fact
                  icon={<SparklesIcon className="h-3.5 w-3.5" />}
                  label="From"
                  value={job.minComp ? `$${(job.minComp / 1000).toFixed(0)}k` : ''}
                />
              </dl>

              {job.skills.length > 0 && (
                <div className="mt-5">
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-faint">Skills the posting asks for</h3>
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {job.skills.map((s) => {
                      const have = !gapSet.has(s.toLowerCase());
                      return (
                        <li
                          key={s}
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium ${
                            have ? 'bg-mint text-accent' : 'border border-line text-muted'
                          }`}
                        >
                          {have && <CheckIcon className="h-3 w-3" />}
                          {s}
                        </li>
                      );
                    })}
                  </ul>
                  <p className="mt-1.5 text-xs text-faint">
                    Filled chips are backed by something in your résumé. Outlined ones are not — that is a gap, not a
                    rejection.
                  </p>
                </div>
              )}

              <div className="mt-6">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-faint">The posting</h3>
                {blocks.length === 0 ? (
                  /* Some aggregator results carry only a snippet. Saying so
                     beats rendering an empty section that looks broken. */
                  <p className="mt-2 text-sm text-muted">
                    This source did not include a full description. Open the posting to read it in full.
                  </p>
                ) : (
                  <div className="mt-2 space-y-3">
                    {blocks.map((b, i) =>
                      b.kind === 'ul' ? (
                        <ul key={i} className="ml-4 list-disc space-y-1 text-[14px] leading-relaxed text-muted">
                          {b.items.map((it, j) => (
                            <li key={j}>{it}</li>
                          ))}
                        </ul>
                      ) : b.kind === 'h' ? (
                        <h4 key={i} className="pt-1 text-sm font-bold text-ink">
                          {b.items[0]}
                        </h4>
                      ) : (
                        <p key={i} className="text-[14px] leading-relaxed text-muted">
                          {b.items[0]}
                        </p>
                      ),
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {tab === 'company' && (
            <>
              <h3 className="text-sm font-bold text-ink">{job.company}</h3>
              <p className="mt-1.5 text-[14px] leading-relaxed text-muted">
                {job.companyBlurb || 'No company description came with this posting.'}
              </p>

              <div className="mt-5 rounded-[var(--mf-radius-lg)] border border-line bg-canvas p-4">
                <p className="text-sm font-semibold text-ink">Insider connections</p>
                {/* Jobright shows alumni and mutual contacts here. We have no
                    people graph, and inventing plausible names would be a
                    fabrication a candidate might act on. Named as absent. */}
                <p className="mt-1 text-sm text-muted">
                  MeritFlow does not hold a professional network, so there is nobody here to show you. Searching the
                  company on LinkedIn for people from your school is the manual version of this.
                </p>
              </div>

              <div className="mt-3 rounded-[var(--mf-radius-lg)] border border-line bg-canvas p-4">
                <p className="text-sm font-semibold text-ink">Where this came from</p>
                <p className="mt-1 break-all text-xs text-muted">{job.url}</p>
                <p className="mt-1.5 text-xs text-faint">
                  Links resolve to the application itself. Postings that only offered a generic careers page were dropped
                  during ingest rather than shown here.
                </p>
              </div>
            </>
          )}

          {tab === 'match' && (
            <>
              <p className="text-sm text-muted">
                This is how well the posting lines up with your résumé and preferences. It measures fit, not your odds of
                being hired.
              </p>

              <ul className="mt-4 space-y-2.5">
                {Object.entries(parts)
                  .sort((a, b) => b[1] - a[1])
                  .map(([k, v]) => (
                    <li key={k} className="flex items-center gap-3 text-[13px]">
                      <span className="w-32 shrink-0 text-muted">{LABELS[k] ?? k}</span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-elevated">
                        <span
                          className="block h-full rounded-full bg-accent-fill"
                          style={{ width: `${Math.min(100, (v / 30) * 100)}%` }}
                        />
                      </span>
                      <span className="w-6 text-right tabular-nums text-ink">{v}</span>
                    </li>
                  ))}
              </ul>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="rounded-[var(--mf-radius-lg)] border border-line bg-canvas p-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-success">What lines up</p>
                  {matched.length === 0 ? (
                    <p className="mt-2 text-sm text-muted">Nothing in the required list is evidenced yet.</p>
                  ) : (
                    <ul className="mt-2 space-y-1">
                      {matched.map((s) => (
                        <li key={s} className="flex items-start gap-1.5 text-sm text-ink">
                          <CheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                          {s}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="rounded-[var(--mf-radius-lg)] border border-line bg-canvas p-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-warn">What to close</p>
                  {gaps.length === 0 ? (
                    <p className="mt-2 text-sm text-muted">Nothing required is missing.</p>
                  ) : (
                    <ul className="mt-2 space-y-1">
                      {gaps.map((g) => (
                        <li key={g} className="text-sm text-ink">
                          {g}
                        </li>
                      ))}
                    </ul>
                  )}
                  {gaps.length > 0 && (
                    <p className="mt-2 text-xs text-faint">
                      Each of these is a course you could generate. A gap named is a gap you can act on.
                    </p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  if (!value) return null;
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-[11px] font-medium text-faint">
        <span className="shrink-0">{icon}</span>
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-ink">{value}</dd>
    </div>
  );
}
