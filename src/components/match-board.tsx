'use client';

import { useEffect, useRef, useState } from 'react';
import { MATCH_FILTERS, prettyPlace } from '@/lib/jobs/match-filters';
import { CloseIcon, HeartIcon, SearchIcon } from './icons';
import type { Match, AppState } from '@/lib/jobs-store';

/**
 * The match board: a ledger, not a billboard.
 *
 * ## Why rows
 *
 * The previous design gave every job a tall two-panel card with a dark score
 * gauge — a layout lifted from every AI job tool this year, and one where six
 * matches filled three screens. A job search is a scanning problem: the eye
 * runs down a column of scores, stops on a title, reads one line of facts.
 * Rows in a single surface put twenty roles on one screen and make the score
 * column comparable at a glance, which a grid of gauges never was.
 *
 * ## The fit spine and score anatomy
 *
 * Each row's score is a number with a thin vertical spine beside it, filled to
 * the score and hued by band — scannable down the list like a sparkline
 * column. Expanding a row shows the *anatomy*: one stacked spectrum where each
 * segment is a real component of the score (skills, role, level…) at its true
 * weight. The score explains itself with its own arithmetic, not a checkmark
 * list.
 *
 * ## Server-side facets
 *
 * Chips and search refetch from /api/jobs/matches, which filters the whole
 * scored corpus before ranking. Each chip shows the count it would leave and
 * disables at zero, so the row can never promise an empty result.
 */

type BoardPayload = {
  matches: Match[];
  total: number;
  corpus: number;
  facets: Record<string, number>;
};

const PAGE = 20;

/** Score component hues — categorical, from the chart series so the anatomy
    reads as parts of one whole rather than good/bad judgements. */
const PART_META: Record<string, { label: string; color: string; max: number }> = {
  skills: { label: 'Skills', color: 'var(--chart-1)', max: 30 },
  role: { label: 'Role fit', color: 'var(--chart-2)', max: 20 },
  seniority: { label: 'Level', color: 'var(--chart-4)', max: 15 },
  evidence: { label: 'Background', color: 'var(--chart-3)', max: 15 },
  location: { label: 'Location', color: 'var(--chart-5)', max: 8 },
  compensation: { label: 'Pay', color: 'var(--chart-neutral)', max: 5 },
  freshness: { label: 'Recency', color: 'var(--color-accent-2)', max: 7 },
};

function bandOf(score: number): { word: string; color: string } {
  if (score >= 85) return { word: 'strong', color: 'var(--color-accent)' };
  if (score >= 70) return { word: 'good', color: 'var(--chart-2)' };
  if (score >= 50) return { word: 'fair', color: 'var(--chart-neutral)' };
  return { word: 'weak', color: 'var(--chart-neutral)' };
}

const TRACKED: Partial<Record<AppState, string>> = {
  APPLIED: 'Applied',
  READY: 'Ready',
  PREPARING: 'Saved',
  INTERVIEW: 'Interview',
  NEEDS_USER_INPUT: 'Needs you',
  OFFER: 'Offer',
};

function ago(ms: number | null, now: number): string {
  if (ms == null) return '';
  const h = Math.floor((now - ms) / 3_600_000);
  if (h < 1) return 'just posted';
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'yesterday' : `${d}d ago`;
}

export function MatchBoard({
  reloadKey,
  busyId,
  onMove,
  onOpen,
}: {
  /** Bump to refetch — the parent bumps it after a state change lands. */
  reloadKey: number;
  busyId: string | null;
  onMove: (jobId: string, state: AppState) => void;
  onOpen: (match: Match) => void;
}) {
  const [board, setBoard] = useState<BoardPayload | null>(null);
  const [failed, setFailed] = useState(false);
  /* Which request the current board answers. The list dims whenever the
     inputs have moved past it — no imperative "loading" flag to desync. */
  const [answered, setAnswered] = useState('');
  const [active, setActive] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [sort, setSort] = useState<'fit' | 'newest' | 'salary'>('fit');
  /* Anatomy is visible by default — the score should explain itself without
     a click; a row can still be folded to save space. */
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [now] = useState(() => Date.now());
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [query, setQuery] = useState('');

  /* Typing searches after a pause, not per keystroke. */
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => setQuery(q), 250);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [q]);

  const requestKey = JSON.stringify([active, query, limit, reloadKey]);

  useEffect(() => {
    let alive = true;
    const [ids, q2, lim] = JSON.parse(requestKey) as [string[], string, number];
    const params = new URLSearchParams();
    if (ids.length) params.set('filters', ids.join(','));
    if (q2) params.set('q', q2);
    params.set('limit', String(lim));
    fetch(`/api/jobs/matches?${params}`)
      .then(async (r) => {
        if (!alive) return;
        if (!r.ok) return setFailed(true);
        setBoard((await r.json()) as BoardPayload);
        setFailed(false);
        setAnswered(requestKey);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [requestKey]);

  const fetching = answered !== requestKey;

  const matches = board ? sortMatches(board.matches, sort) : [];

  return (
    <section>
      <div className="mb-3">
          <h3 className="text-lg font-bold text-ink">Matches</h3>
          <p className="mt-0.5 text-sm text-muted">
            {board ? (
              <>
                <span className="font-semibold tabular-nums text-ink">{board.total.toLocaleString()}</span> of{' '}
                <span className="tabular-nums">{board.corpus.toLocaleString()}</span> open roles fit this view — scored
                on your résumé, not a hiring prediction.
              </>
            ) : (
              'Scoring the board…'
            )}
          </p>
      </div>

      {/* The whole control surface stays reachable while scrolling a long
          board — losing the filters two hundred rows deep is the classic
          job-board frustration. */}
      <div className="sticky top-0 z-10 -mx-2 mb-4 space-y-2.5 rounded-2xl bg-surface/85 px-2 py-2.5 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative flex-1 min-w-[200px] sm:flex-none">
            <span className="sr-only">Search roles</span>
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setLimit(PAGE);
              }}
              placeholder="Title, company, place…"
              className="h-9 w-full rounded-full border border-line bg-canvas pl-8 pr-3 text-[13px] text-ink outline-none placeholder:text-faint focus:border-accent sm:w-60"
            />
          </label>
          <label className="sr-only" htmlFor="match-sort">
            Sort matches
          </label>
          <select
            id="match-sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
            className="h-9 rounded-full border border-line bg-canvas px-3 text-[13px] font-medium text-ink outline-none focus:border-accent"
          >
            <option value="fit">Best fit</option>
            <option value="newest">Newest</option>
            <option value="salary">Salary</option>
          </select>
        </div>

        {/* Facets. Counts are live: the number on a chip is exactly how many
            rows clicking it leaves, and a chip that would empty the board is
            disabled rather than allowed to disappoint. */}
        <div className="flex flex-wrap items-center gap-2">
        {MATCH_FILTERS.map((f) => {
          const on = active.includes(f.id);
          const n = board?.facets[f.id];
          const dead = !on && n === 0;
          return (
            <button
              key={f.id}
              type="button"
              disabled={dead}
              onClick={() => {
                setActive((c) => (on ? c.filter((x) => x !== f.id) : [...c, f.id]));
                setLimit(PAGE);
              }}
              aria-pressed={on}
              title={dead ? 'No roles in this view' : undefined}
              className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition ${
                on
                  ? 'border-accent bg-mint text-accent'
                  : dead
                    ? 'cursor-not-allowed border-line text-faint opacity-60'
                    : 'border-line bg-canvas text-muted hover:bg-elevated'
              }`}
            >
              {f.label}
              {n != null && (
                <span className={`rounded-full px-1.5 text-[11px] font-semibold tabular-nums leading-4 ${on ? 'bg-accent/15' : 'bg-elevated'}`}>
                  {n}
                </span>
              )}
            </button>
          );
        })}
        {active.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setActive([]);
              setLimit(PAGE);
            }}
            className="text-[12px] font-semibold text-muted underline-offset-2 hover:text-ink hover:underline"
          >
            Clear
          </button>
        )}
        </div>
      </div>

      {failed && <p className="rounded-2xl border border-line bg-canvas p-6 text-sm text-muted">Could not load matches.</p>}

      {!failed && !board && (
        <div className="overflow-hidden rounded-2xl border border-line bg-canvas" aria-hidden>
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex gap-4 border-b border-line p-4 last:border-b-0">
              <span className="mf-shimmer h-12 w-12 rounded-xl" />
              <span className="flex-1 space-y-2 py-1">
                <span className="mf-shimmer block h-4 w-2/5 rounded" />
                <span className="mf-shimmer block h-3 w-3/5 rounded" />
              </span>
            </div>
          ))}
        </div>
      )}

      {!failed && board && matches.length === 0 && (
        <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-muted">
          {board.corpus === 0
            ? 'No matches yet. Add target roles to your career profile.'
            : 'Nothing fits this view — clear a filter or widen the search.'}
        </p>
      )}

      {!failed && matches.length > 0 && (
        <div
          aria-busy={fetching}
          className={`overflow-hidden rounded-2xl border border-line bg-canvas transition-opacity ${fetching ? 'opacity-60' : ''}`}
        >
          <ol className="divide-y divide-line">
            {matches.map((m, i) => (
              <MatchRow
                key={m.job.id}
                match={m}
                rank={i + 1}
                now={now}
                busy={busyId === m.job.id}
                expanded={!collapsed.has(m.job.id)}
                onToggle={() =>
                  setCollapsed((cur) => {
                    const next = new Set(cur);
                    if (next.has(m.job.id)) next.delete(m.job.id);
                    else next.add(m.job.id);
                    return next;
                  })
                }
                onMove={onMove}
                onOpen={onOpen}
              />
            ))}
          </ol>
        </div>
      )}

      {board && board.total > matches.length && (
        <div className="mt-3 text-center">
          <button
            type="button"
            onClick={() => setLimit((l) => l + PAGE)}
            className="rounded-full border border-line px-4 py-2 text-[13px] font-semibold text-muted transition hover:bg-elevated hover:text-ink"
          >
            Show more ({(board.total - matches.length).toLocaleString()} left)
          </button>
        </div>
      )}
    </section>
  );
}

function sortMatches(list: Match[], sort: 'fit' | 'newest' | 'salary'): Match[] {
  const out = [...list];
  if (sort === 'newest') out.sort((a, b) => (b.job.postedAt ?? 0) - (a.job.postedAt ?? 0));
  else if (sort === 'salary') out.sort((a, b) => (b.job.minComp ?? -1) - (a.job.minComp ?? -1));
  return out; // 'fit' is the server's order
}

/* ── One row ─────────────────────────────────────────────────────────────── */

function MatchRow({
  match,
  rank,
  now,
  busy,
  expanded,
  onToggle,
  onMove,
  onOpen,
}: {
  match: Match;
  rank: number;
  now: number;
  busy: boolean;
  expanded: boolean;
  onToggle: () => void;
  onMove: (jobId: string, state: AppState) => void;
  onOpen: (match: Match) => void;
}) {
  const { job, score, parts, gaps, state } = match;
  const band = bandOf(score);
  const place = prettyPlace(job.location, job.remote);

  /* Facts as one middot line — sparse data collapses instead of leaving a
     grid of holes. Only what the posting actually said. */
  const facts = [
    place,
    job.workMode && !job.remote ? job.workMode : '',
    job.employment,
    job.yearsExp,
    job.seniority,
    job.minComp ? `from $${Math.round(job.minComp / 1000)}k` : '',
    job.applicants != null ? `${job.applicants} applicants` : '',
    ago(job.postedAt, now),
  ].filter(Boolean);

  const strengths = Object.entries(parts)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] / (PART_META[a[0]]?.max ?? 1) - a[1] / (PART_META[b[0]]?.max ?? 1))
    .slice(0, 3)
    .map(([k]) => PART_META[k]?.label ?? k);

  return (
    <li
      className="group relative animate-fade-in-up"
      style={{ animationDelay: `${Math.min(rank - 1, 8) * 40}ms`, animationDuration: '0.35s' }}
    >
      {/* The fit spine: filled to the score, hued by band. */}
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-elevated">
        <span className="absolute bottom-0 left-0 w-full" style={{ height: `${score}%`, background: band.color }} />
      </span>

      <div className="flex flex-wrap gap-x-4 gap-y-2 py-3.5 pl-5 pr-4 transition group-hover:bg-elevated/40 sm:flex-nowrap sm:py-4">
        {/* Score tile */}
        <div
          className="flex h-[60px] w-[60px] shrink-0 flex-col items-center justify-center rounded-xl"
          style={{ background: `color-mix(in srgb, ${band.color} 9%, transparent)` }}
        >
          <p className="text-[21px] font-bold leading-none tabular-nums" style={{ color: band.color }}>
            {score}
          </p>
          <p className="mt-1 text-[9px] font-bold uppercase tracking-widest text-faint">{band.word}</p>
        </div>

        {/* The role */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h4 className="min-w-0 text-[15px] font-bold leading-snug text-ink">
              <button
                type="button"
                onClick={() => onOpen(match)}
                className="text-left underline-offset-2 hover:text-accent hover:underline"
              >
                {job.title}
              </button>
            </h4>
            {state && TRACKED[state] && (
              <span className="rounded-full bg-mint px-2 py-0.5 text-[11px] font-semibold text-accent">{TRACKED[state]}</span>
            )}
            {job.postedAt != null && now - job.postedAt < 86_400_000 && (
              <span className="rounded-full bg-elevated px-2 py-0.5 text-[11px] font-medium text-muted">new</span>
            )}
          </div>

          <p className="mt-0.5 truncate text-[13px] text-muted">
            <span className="font-semibold text-ink">{job.company}</span>
            {/* Collectors often echo the company name into the blurb slot;
                "Citadel — Citadel" is noise, so an echo is suppressed. */}
            {job.companyBlurb && job.companyBlurb.trim().toLowerCase() !== job.company.trim().toLowerCase() && (
              <span className="text-faint"> — {job.companyBlurb}</span>
            )}
          </p>

          {facts.length > 0 && (
            <p className="mt-1.5 truncate text-[12.5px] text-muted">
              {facts.map((f, i) => (
                <span key={i}>
                  {i > 0 && <span className="mx-1.5 text-faint">·</span>}
                  {f}
                </span>
              ))}
            </p>
          )}

          <p className="mt-1 text-[12px] text-muted">
            <span className="font-medium text-ink">{strengths.join(', ')}</span>
            {strengths.length > 0 && ' carry the score'}
            {gaps.length > 0 && (
              <span className="text-faint">
                {strengths.length > 0 ? ' · ' : ''}missing {gaps.slice(0, 2).join(', ')}
              </span>
            )}
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={expanded}
              className="ml-2 font-semibold text-muted underline-offset-2 hover:text-ink hover:underline"
            >
              {expanded ? 'hide anatomy' : 'score anatomy'}
            </button>
          </p>

          {/* The anatomy: the score's own arithmetic as one spectrum. */}
          {expanded && (
            <div className="mt-2.5 max-w-xl rounded-xl border border-line bg-surface px-3 py-2.5">
              <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-elevated" role="img" aria-label={`Score ${score} of 100`}>
                {Object.entries(parts).map(([k, v]) =>
                  v > 0 ? (
                    <span
                      key={k}
                      className="mf-grow-x"
                      title={`${PART_META[k]?.label ?? k}: ${v} of ${PART_META[k]?.max ?? '?'}`}
                      style={{ width: `${v}%`, background: PART_META[k]?.color ?? 'var(--chart-neutral)' }}
                    />
                  ) : null,
                )}
              </div>
              <ul className="mt-2 grid gap-x-5 gap-y-0.5 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(parts).map(([k, v]) => {
                  const meta = PART_META[k];
                  return (
                    <li key={k} className="flex items-center gap-2 text-[12px]">
                      <span aria-hidden className="h-2 w-2 shrink-0 rounded-[3px]" style={{ background: meta?.color ?? 'var(--chart-neutral)' }} />
                      <span className="text-muted">{meta?.label ?? k}</span>
                      <span className="ml-auto tabular-nums text-ink">
                        {v}
                        <span className="text-faint">/{meta?.max ?? '—'}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        {/* Actions. On a phone the trio drops to its own line under the text
            instead of crushing the title column. */}
        <div className="flex w-full shrink-0 items-start justify-end sm:w-auto">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onMove(job.id, 'SKIPPED')}
              disabled={busy}
              aria-label={`Hide ${job.title}`}
              title="Hide"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-faint transition hover:bg-elevated hover:text-ink disabled:opacity-40"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onMove(job.id, 'PREPARING')}
              disabled={busy}
              aria-label={state === 'PREPARING' ? `${job.title} is saved` : `Save ${job.title}`}
              aria-pressed={state === 'PREPARING'}
              title={state === 'PREPARING' ? 'Saved' : 'Save'}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-full transition disabled:opacity-40 ${
                state === 'PREPARING' ? 'bg-mint text-accent' : 'text-faint hover:bg-elevated hover:text-ink'
              }`}
            >
              <HeartIcon className="h-4 w-4" />
            </button>
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => onMove(job.id, 'APPLIED')}
              className="inline-flex h-8 items-center rounded-full bg-accent-fill px-4 text-[12.5px] font-bold text-white transition hover:brightness-110 active:scale-[0.97]"
            >
              Apply
            </a>
          </div>
        </div>
      </div>
    </li>
  );
}
