'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from './button';
import { RadialGauge, SERIES, STATUS } from './charts';
import {
  AlertTriangleIcon,
  CheckIcon,
  CodeIcon,
  ExternalLinkIcon,
  LockIcon,
  RefreshIcon,
  TargetIcon,
} from './icons';

/**
 * Presence — the candidate's professional identity in one place.
 *
 * The three things an employer looks at before replying to an application: the
 * résumé, the GitHub, and whatever the candidate's name turns up. This screen
 * is about the last two, and about making them agree with the first.
 *
 * ## What the layout is for
 *
 * The first version of this screen opened with a form. Connecting an account is
 * a thing you do once and then never again, so putting it first meant the
 * screen led with its least useful row and everything below it was a flat stack
 * of identical cards — nothing readable at a glance, nothing to act on.
 *
 * It now opens with **state**: how complete the presence is, what is connected,
 * and what is missing. The form moved to the bottom, where a once-ever task
 * belongs.
 *
 * ## Two things the design has to keep saying
 *
 *  - Repositories that were **held back** are shown as prominently as the ones
 *    that were published, with the reason. A page that silently drops half
 *    someone's work teaches them nothing; one that says "this is a fork" and
 *    "this belongs to an organisation" tells them exactly what to do next.
 *  - Publishing is a **handover**, not a button. Putting a site on
 *    username.github.io means creating a public repository under someone's own
 *    name, and that is theirs to do.
 */

type Tech = { group: string; items: string[] };

type Published = {
  name: string;
  title: string;
  url: string;
  demoUrl: string;
  description: string;
  tech: Tech[];
  signals: string[];
  stars: number;
  score: number;
  readme: { score: number; suggestions: string[] };
};

type Withheld = { name: string; kind: string; reason: string };
type Gap = { field: string; impact: string; severity: 'blocking' | 'important' | 'nice-to-have' };

type Payload = {
  identity: {
    name: string;
    headline: string;
    email: string;
    phone: string;
    location: string;
    links: { github: string; linkedin: string; portfolio: string; website: string };
    summary: string;
    hasResume: boolean;
  };
  gaps: Gap[];
  github: {
    username: string;
    fetchedAt: number;
    error: string;
    total: number;
    published: Published[];
    withheld: Withheld[];
  };
  portfolios: { slug: string; title: string; projects: number; updatedAt: number }[];
  publish: { repo: string; url: string; files: string[]; steps: string[]; workflow: string } | null;
};

/* ── Vocabulary ──────────────────────────────────────────────────────────── */

const SEVERITY: Record<Gap['severity'], { label: string; dot: string; order: number }> = {
  blocking: { label: 'Blocking', dot: 'var(--color-danger)', order: 0 },
  important: { label: 'Important', dot: 'var(--color-warn)', order: 1 },
  'nice-to-have': { label: 'Optional', dot: 'var(--color-faint)', order: 2 },
};

/** Why a repository did not make the page. Phrased as a state, not an error. */
const WITHHELD: Record<string, string> = {
  private: 'Private',
  fork: 'Fork',
  contribution: 'Someone else’s',
  unknown: 'Unknown owner',
  'own-public': 'Needs cleanup',
};

/** One hue per technology family, so the same group reads the same everywhere. */
const GROUP_TONE: Record<string, string> = {
  AI: SERIES[0],
  Backend: SERIES[1],
  Frontend: SERIES[2],
  Data: SERIES[3],
  Cloud: SERIES[4],
  Infrastructure: STATUS.neutral,
  Mobile: SERIES[2],
  Other: STATUS.neutral,
};

/** What a signal actually tells an employer, in their words rather than ours. */
const SIGNAL: Record<string, string> = {
  'ai-ml': 'AI / ML',
  api: 'API',
  deployed: 'Deployed',
  containerised: 'Containerised',
  'infrastructure-as-code': 'IaC',
  tested: 'Tested',
  documented: 'Documented',
  licensed: 'Licensed',
  diagrammed: 'Diagrams',
};

/* ── Screen ──────────────────────────────────────────────────────────────── */

export function JobPresence() {
  const [data, setData] = useState<Payload | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showWithheld, setShowWithheld] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/career');
    if (!res.ok) {
      setError('Could not load your profile.');
      return;
    }
    setData((await res.json()) as Payload);
  }, []);

  useEffect(() => {
    let alive = true;
    fetch('/api/career')
      .then(async (res) => {
        if (!res.ok) throw new Error('load');
        return (await res.json()) as Payload;
      })
      .then((next) => {
        if (alive) setData(next);
      })
      .catch(() => {
        if (alive) setError('Could not load your profile.');
      });
    return () => {
      alive = false;
    };
  }, []);

  const save = useCallback(
    async (patch: Record<string, string>) => {
      setBusy(true);
      setError('');
      const res = await fetch('/api/career', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) setError(((await res.json()) as { error?: string }).error ?? 'Could not save.');
      else await load();
      setBusy(false);
    },
    [load],
  );

  const refresh = useCallback(async () => {
    setBusy(true);
    setError('');
    const res = await fetch('/api/career', { method: 'PUT' });
    const body = (await res.json()) as { error?: string };
    if (!res.ok) setError(body.error ?? 'Could not read GitHub.');
    else await load();
    setBusy(false);
  }, [load]);

  /**
   * How complete this presence is.
   *
   * A defined count of things that are either present or not — not an
   * engagement score and not a judgement of the person. Weighted by what an
   * application actually stops on, so it agrees with the gap list below rather
   * than telling a second story.
   */
  const completeness = useMemo(() => {
    if (!data) return 0;
    const { identity, github, portfolios } = data;
    const checks: [boolean, number][] = [
      [Boolean(identity.name), 10],
      [Boolean(identity.email), 10],
      [Boolean(identity.phone), 5],
      [identity.hasResume, 20],
      [Boolean(identity.headline), 5],
      [Boolean(identity.links.github), 10],
      [Boolean(identity.links.linkedin), 10],
      [github.published.length > 0, 15],
      [portfolios.length > 0, 5],
      [Boolean(identity.links.portfolio), 10],
    ];
    const earned = checks.reduce((sum, [ok, w]) => sum + (ok ? w : 0), 0);
    const total = checks.reduce((sum, [, w]) => sum + w, 0);
    return Math.round((earned / total) * 100);
  }, [data]);

  if (!data) return <p className="py-16 text-center text-sm text-muted">Loading your profile…</p>;

  const { identity, gaps, github: gh, portfolios, publish } = data;
  const sortedGaps = [...gaps].sort((a, b) => SEVERITY[a.severity].order - SEVERITY[b.severity].order);

  return (
    <div className="space-y-6">
      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-[var(--mf-radius-lg)] bg-danger-soft px-4 py-3 text-sm text-ink"
        >
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-danger" />
          {error}
        </p>
      )}

      {/* ── Identity ── */}
      <section className="overflow-hidden rounded-[var(--mf-radius-xl)] border border-line bg-canvas shadow-[var(--mf-shadow-sm)]">
        <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[22px] font-black leading-tight tracking-[-0.02em] text-ink">
              {identity.name || 'Your name'}
            </h3>
            <p className="mt-0.5 truncate text-sm text-muted">{identity.headline || 'No headline yet'}</p>

            <div className="mt-4 flex flex-wrap gap-2">
              <LinkChip label="GitHub" href={identity.links.github} />
              <LinkChip label="LinkedIn" href={identity.links.linkedin} />
              <LinkChip label="Portfolio" href={identity.links.portfolio} />
              <LinkChip label="Résumé" href={identity.hasResume ? '#' : ''} noLink />
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-6 sm:border-l sm:border-line sm:pl-6">
            <RadialGauge value={completeness} label="Complete" size={96} />
            <dl className="space-y-2.5">
              <Stat value={gh.published.length} label={gh.published.length === 1 ? 'project live' : 'projects live'} />
              <Stat value={portfolios.length} label={portfolios.length === 1 ? 'portfolio page' : 'portfolio pages'} />
            </dl>
          </div>
        </div>

        {/* What is missing, inline with the thing it is missing from. */}
        {sortedGaps.length > 0 && (
          <ul className="divide-y divide-line border-t border-line bg-elevated/40">
            {sortedGaps.map((gap) => (
              <li key={gap.field} className="flex items-start gap-3 px-6 py-2.5">
                <span
                  aria-hidden
                  className="mt-[7px] size-1.5 shrink-0 rounded-full"
                  style={{ background: SEVERITY[gap.severity].dot }}
                />
                <span className="text-[13px] leading-relaxed text-ink">{gap.impact}</span>
                <span className="ml-auto shrink-0 pt-0.5 text-[10px] font-bold uppercase tracking-wider text-faint">
                  {SEVERITY[gap.severity].label}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Portfolio pages ── */}
      {portfolios.length > 0 && (
        <section>
          <SectionHead
            title="Portfolio"
            sub="Same projects, same descriptions — a different three lead, so the version you send an AI team opens on your AI work."
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {portfolios.map((p) => (
              <a
                key={p.slug || 'overview'}
                href={`/api/career/portfolio/${p.slug || 'overview'}`}
                target="_blank"
                rel="noopener"
                className="group rounded-[var(--mf-radius-lg)] border border-line bg-canvas p-4 transition hover:border-ink hover:shadow-[var(--mf-shadow-sm)]"
              >
                <span className="flex items-center justify-between">
                  <span className="font-mono text-[13px] font-semibold text-ink">/{p.slug || ''}</span>
                  <ExternalLinkIcon className="size-3.5 text-faint transition group-hover:text-ink" />
                </span>
                <span className="mt-2 block text-xs text-muted">
                  {p.slug ? p.title.split('—')[1]?.trim() || 'Variant' : 'Overview'}
                </span>
                <span className="mt-1 block text-xs tabular-nums text-faint">{p.projects} projects</span>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* ── Publishing ── */}
      {publish && !identity.links.portfolio && (
        <section className="rounded-[var(--mf-radius-xl)] border border-line bg-mint p-6">
          <div className="flex items-start gap-3">
            <TargetIcon className="mt-0.5 size-5 shrink-0 text-accent" />
            <div className="min-w-0">
              <h4 className="text-sm font-bold text-ink">Publish it to {publish.repo}</h4>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">
                MeritFlow does not push to your GitHub. Publishing creates a public repository under your name, so it
                stays your call — and it is why this product never asks for write access to your account.
              </p>
            </div>
          </div>

          <ol className="mt-4 space-y-2 border-t border-line-strong/40 pt-4">
            {publish.steps.map((step, i) => (
              <li key={step} className="flex gap-3 text-[13px] leading-relaxed text-ink">
                <span className="mt-px flex size-[18px] shrink-0 items-center justify-center rounded-full bg-canvas text-[10px] font-bold tabular-nums text-muted">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>

          <div className="mt-4 flex flex-wrap gap-1.5">
            {[...publish.files, publish.workflow].map((file) => (
              <a
                key={file}
                href={`/api/career/publish/${file}`}
                download
                className="inline-flex items-center gap-1.5 rounded-[var(--mf-radius-sm)] border border-line bg-canvas px-2.5 py-1 font-mono text-[11px] text-ink transition hover:border-ink"
              >
                <span aria-hidden>↓</span>
                {file}
              </a>
            ))}
          </div>
        </section>
      )}

      {/* ── Projects ── */}
      {gh.published.length > 0 && (
        <section>
          <SectionHead
            title="On your portfolio"
            sub="Ranked by how they read to someone skimming — recency, documentation, and whether there is something to look at."
          />
          <div className="space-y-2.5">
            {gh.published.map((repo) => (
              <ProjectRow key={repo.name} repo={repo} />
            ))}
          </div>
        </section>
      )}

      {/* ── Held back ── */}
      {gh.withheld.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setShowWithheld((v) => !v)}
            aria-expanded={showWithheld}
            className="flex w-full items-center gap-2.5 rounded-[var(--mf-radius-lg)] border border-dashed border-line-strong px-4 py-3 text-left transition hover:bg-elevated/60"
          >
            <LockIcon className="size-4 shrink-0 text-faint" />
            <span className="text-[13px] font-semibold text-ink">
              {gh.withheld.length} repositor{gh.withheld.length === 1 ? 'y' : 'ies'} held back
            </span>
            <span className="hidden text-xs text-muted sm:inline">
              Nothing private, forked, or owned by someone else goes on a page with your name on it.
            </span>
            <span className="ml-auto text-xs text-faint">{showWithheld ? 'Hide' : 'Show'}</span>
          </button>

          {showWithheld && (
            <ul className="mt-2 space-y-1.5">
              {gh.withheld.map((repo) => (
                <li
                  key={repo.name}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-[var(--mf-radius-md)] bg-elevated/60 px-4 py-2.5"
                >
                  <span className="rounded bg-canvas px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted">
                    {WITHHELD[repo.kind] ?? repo.kind}
                  </span>
                  <span className="font-mono text-[13px] text-ink">{repo.name}</span>
                  <span className="w-full text-xs leading-relaxed text-muted">{repo.reason}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ── Connections. Last: a thing you do once. ── */}
      <section className="rounded-[var(--mf-radius-xl)] border border-line bg-canvas p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h4 className="text-sm font-bold text-ink">Connected accounts</h4>
            <p className="mt-0.5 text-xs text-muted">
              {gh.fetchedAt > 0
                ? `Last read ${new Date(gh.fetchedAt).toLocaleDateString()} · ${gh.total} repositories`
                : 'Nothing read yet.'}
              {gh.error ? ` · ${gh.error}` : ''}
            </p>
          </div>
          <Button onClick={() => void refresh()} disabled={busy || !gh.username}>
            <RefreshIcon className={`size-3.5 ${busy ? 'animate-spin' : ''}`} />
            {busy ? 'Reading…' : 'Rebuild from GitHub'}
          </Button>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <Field
            label="GitHub"
            hint="Only public repositories are ever read."
            initial={gh.username}
            placeholder="saivivek"
            busy={busy}
            onSave={(v) => save({ github: v })}
          />
          <Field
            label="LinkedIn"
            hint="Applications that ask for it use this."
            initial={identity.links.linkedin}
            placeholder="linkedin.com/in/…"
            busy={busy}
            onSave={(v) => save({ linkedin: v })}
          />
          <Field
            label="Portfolio"
            hint="Set this once published."
            initial={identity.links.portfolio}
            placeholder="saivivek.github.io"
            busy={busy}
            onSave={(v) => save({ portfolio: v })}
          />
        </div>
      </section>
    </div>
  );
}

/* ── Parts ───────────────────────────────────────────────────────────────── */

function SectionHead({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-3">
      <h4 className="text-sm font-bold text-ink">{title}</h4>
      <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-muted">{sub}</p>
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="order-2 text-xs text-muted">{label}</dt>
      <dd className="order-1 text-lg font-black tabular-nums leading-none text-ink">{value}</dd>
    </div>
  );
}

/** A link that reads as connected or missing without needing to be read. */
function LinkChip({ label, href, noLink = false }: { label: string; href: string; noLink?: boolean }) {
  const on = Boolean(href);
  const body = (
    <>
      {on ? (
        <CheckIcon className="size-3 text-accent" />
      ) : (
        <span aria-hidden className="size-3 rounded-full border border-dashed border-line-strong" />
      )}
      {label}
    </>
  );
  const cls = `inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
    on ? 'border-line bg-canvas text-ink hover:border-ink' : 'border-dashed border-line-strong text-faint'
  }`;

  if (!on || noLink) return <span className={cls}>{body}</span>;
  return (
    <a href={href} target="_blank" rel="noopener" className={cls}>
      {body}
    </a>
  );
}

/**
 * One project.
 *
 * The README bar is the actionable part: it is the difference between a
 * repository a hiring manager opens and one they close, and it is the only
 * thing on this screen the candidate can improve in ten minutes.
 */
function ProjectRow({ repo }: { repo: Published }) {
  const tone = repo.readme.score >= 70 ? STATUS.good : repo.readme.score >= 40 ? STATUS.warn : STATUS.bad;

  return (
    <article className="rounded-[var(--mf-radius-lg)] border border-line bg-canvas p-4 transition hover:shadow-[var(--mf-shadow-sm)]">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0 flex-1">
          <h5 className="flex items-center gap-2 text-[15px] font-bold leading-snug text-ink">
            <span className="truncate">{repo.title}</span>
            {repo.demoUrl && (
              <span className="shrink-0 rounded bg-success-soft px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-success">
                Live
              </span>
            )}
          </h5>
          {repo.description && <p className="mt-1 text-[13px] leading-relaxed text-muted">{repo.description}</p>}
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {repo.stars > 0 && <span className="text-xs tabular-nums text-faint">★ {repo.stars}</span>}
          <a
            href={repo.url}
            target="_blank"
            rel="noopener"
            aria-label={`Open ${repo.title} on GitHub`}
            className="text-faint transition hover:text-ink"
          >
            <CodeIcon className="size-4" />
          </a>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {repo.tech.flatMap((g) => g.items.map((item) => ({ item, group: g.group }))).slice(0, 9).map(({ item, group }) => (
          <span
            key={`${group}-${item}`}
            className="inline-flex items-center gap-1.5 rounded bg-elevated px-2 py-0.5 text-[11px] text-ink"
          >
            <span aria-hidden className="size-1.5 rounded-full" style={{ background: GROUP_TONE[group] ?? STATUS.neutral }} />
            {item}
          </span>
        ))}
        {repo.signals
          .filter((s) => SIGNAL[s])
          .slice(0, 4)
          .map((s) => (
            <span key={s} className="rounded border border-line px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-faint">
              {SIGNAL[s]}
            </span>
          ))}
      </div>

      <div className="mt-3 flex items-center gap-3 border-t border-line pt-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-faint">README</span>
        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-elevated">
          <span
            className="block h-full rounded-full transition-[width] duration-500"
            style={{ width: `${repo.readme.score}%`, background: tone }}
          />
        </span>
        <span className="w-9 text-right text-xs font-bold tabular-nums text-ink">{repo.readme.score}</span>
      </div>
      {repo.readme.suggestions.length > 0 && (
        <p className="mt-1.5 text-xs leading-relaxed text-muted">{repo.readme.suggestions[0]}</p>
      )}
    </article>
  );
}

function Field({
  label,
  hint,
  initial,
  placeholder,
  busy,
  onSave,
}: {
  label: string;
  hint: string;
  initial: string;
  placeholder: string;
  busy: boolean;
  onSave: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(false);

  /* Adjusted during render rather than in an effect: the prop is the source of
     truth after a reload, and an effect would show the stale value for a frame. */
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setValue(initial);
  }

  const dirty = value.trim() !== initial.trim();

  return (
    <label className="block">
      <span className="text-[13px] font-semibold text-ink">{label}</span>
      <span className="mt-0.5 block text-[11px] leading-relaxed text-muted">{hint}</span>
      <span className="mt-2 flex gap-1.5">
        <input
          value={value}
          placeholder={placeholder}
          onChange={(e) => {
            setValue(e.target.value);
            setSaved(false);
          }}
          className="min-w-0 flex-1 rounded-[var(--mf-radius-sm)] border border-line bg-surface px-2.5 py-1.5 text-[13px] text-ink outline-none transition focus:border-ink focus:bg-canvas"
        />
        <Button
          variant="ghost"
          size="sm"
          disabled={busy || (!dirty && !saved)}
          onClick={() => {
            onSave(value);
            setSaved(true);
          }}
        >
          {saved && !dirty ? <CheckIcon className="size-3.5 text-accent" /> : 'Save'}
        </Button>
      </span>
    </label>
  );
}
