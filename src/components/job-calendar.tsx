'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from './button';
import { CalendarIcon, CheckIcon, AlertTriangleIcon, DownloadIcon } from './icons';
import { MonthGrid, type CalendarEvent } from './month-grid';

/**
 * Interviews and the application archive.
 *
 * Two views of the same history: what is coming, and what was sent. They live
 * together because the question people actually have is "they called about the
 * Acme role, what did I tell them?" — which needs both halves.
 *
 * Scheduling stays with the candidate. Autopilot proposes a time it read from
 * an invitation and marks it unconfirmed; accepting a slot is a commitment
 * about someone's life, and the cost of getting it wrong is a missed
 * interview.
 */

type Interview = {
  id: string;
  company: string;
  title: string;
  kind: 'INTERVIEW' | 'ASSESSMENT' | 'CALL' | 'OTHER';
  startsAt: number | null;
  durationMin: number;
  location: string;
  notes: string;
  source: 'detected' | 'user';
  confirmed: boolean;
};

type Archived = {
  id: string;
  company: string;
  title: string;
  jobUrl: string;
  jdSnapshot: string;
  resumeSummary: string;
  resumeBullets: string[];
  coverLetter: string;
  answers: { question: string; value: string }[];
  ats: string;
  mode: string;
  reference: string;
  submittedAt: number;
};

export function JobCalendar() {
  const [interviews, setInterviews] = useState<Interview[] | null>(null);
  const [archive, setArchive] = useState<Archived[]>([]);
  const [tab, setTab] = useState<'upcoming' | 'archive'>('upcoming');
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [adding, setAdding] = useState(false);
  const [openArchive, setOpenArchive] = useState<Archived | null>(null);
  const [showSubscribe, setShowSubscribe] = useState(false);
  const [feedPath, setFeedPath] = useState<string>('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch('/api/jobs/calendar')
      .then(async (r) => {
        const d = (await r.json()) as { interviews?: Interview[]; archive?: Archived[]; feedPath?: string; error?: string };
        if (!alive) return;
        if (!r.ok) setError(d.error ?? 'Could not load your calendar.');
        else {
          setInterviews(d.interviews ?? []);
          setArchive(d.archive ?? []);
          setFeedPath(d.feedPath ?? '');
        }
      })
      .catch(() => alive && setError('Could not load your calendar.'));
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  const post = useCallback(async (body: Record<string, unknown>) => {
    const res = await fetch('/api/jobs/calendar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const d = (await res.json()) as { error?: string };
      setError(d.error ?? 'That did not save.');
      return false;
    }
    setReloadKey((k) => k + 1);
    return true;
  }, []);

  if (error && !interviews) return <p className="rounded-2xl border border-line bg-canvas p-6 text-sm text-muted">{error}</p>;
  if (!interviews)
    return (
      <p role="status" aria-live="polite" className="rounded-2xl border border-line bg-canvas p-6 text-sm text-muted">
        Loading your calendar…
      </p>
    );

  /* Built in the browser: a calendar app needs an absolute URL, and the
     server does not reliably know the public origin behind a proxy. */
  const feedUrl = feedPath && typeof window !== 'undefined' ? `${window.location.origin}${feedPath}` : '';

  const dated = interviews.filter((i) => i.startsAt != null);
  const undated = interviews.filter((i) => i.startsAt == null);

  /* Grouped by day and labelled relative to today.
   *
   * A flat list under a tab called Calendar left the reader doing date
   * arithmetic: "AUG 20" only means something if you already know today's
   * date, and the one question anyone brings to this screen is how soon. */
  const days = groupByDay(dated);

  /*
   * Everything with a date, on one month grid: interviews where they will
   * happen, applications where they were sent. The lists below keep the
   * detail; the grid gives the month its shape.
   */
  const gridEvents: CalendarEvent[] = [
    ...dated.map((i) => ({
      at: i.startsAt as number,
      kind: (i.kind === 'ASSESSMENT' ? 'assessment' : 'interview') as CalendarEvent['kind'],
      label: `${i.company} — ${i.title}`,
      detail: [i.location, i.confirmed ? 'confirmed' : 'unconfirmed'].filter(Boolean).join(' · '),
    })),
    ...archive.map((a) => ({
      at: a.submittedAt,
      kind: 'application' as const,
      label: `${a.company} — ${a.title}`,
      detail: a.mode === 'SUBMITTED' ? `sent via ${a.ats}` : `prepared via ${a.ats}`,
    })),
  ];

  return (
    <div className="space-y-5">
      <MonthGrid events={gridEvents} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex overflow-hidden rounded-full border border-line bg-elevated p-0.5">
          {(
            [
              ['upcoming', `Interviews${interviews.length ? ` (${interviews.length})` : ''}`],
              ['archive', `Sent${archive.length ? ` (${archive.length})` : ''}`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              aria-pressed={tab === key}
              className={`rounded-full px-4 py-1.5 text-[13px] font-semibold transition ${
                tab === key ? 'bg-canvas text-ink shadow-[var(--mf-shadow-xs)]' : 'text-muted hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'upcoming' && (
          <div className="flex gap-2">
            {dated.length > 0 && (
              <Button variant="secondary" onClick={() => setShowSubscribe((v) => !v)}>
                <DownloadIcon className="h-3.5 w-3.5" />
                Add to calendar
              </Button>
            )}
            <Button variant="primary" onClick={() => setAdding(true)}>
              Add interview
            </Button>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}

      {showSubscribe && (
        <div className="rounded-[var(--mf-radius-lg)] border border-line bg-canvas p-4">
          <p className="text-sm font-semibold text-ink">Subscribe, so it stays up to date</p>
          <p className="mt-0.5 text-sm text-muted">
            Add this address in Google Calendar, Apple Calendar or Outlook under &ldquo;add by URL&rdquo;. New interviews
            appear on their own. A downloaded file is a snapshot and goes stale.
          </p>

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg border border-line bg-elevated px-3 py-2 text-xs text-ink">
              {feedUrl || 'Loading…'}
            </code>
            <Button
              size="md"
              disabled={!feedUrl}
              onClick={() => {
                void navigator.clipboard.writeText(feedUrl);
                setCopied(true);
              }}
            >
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <a
              href="/api/jobs/calendar?format=ics"
              className="text-xs text-accent underline underline-offset-2"
            >
              Or download a one-off .ics file
            </a>
            <span aria-hidden className="text-faint">
              ·
            </span>
            {/* Anyone holding the link can read the schedule, so revoking has
                to be one click away rather than a support request. */}
            <button
              type="button"
              onClick={async () => {
                const res = await fetch('/api/jobs/calendar', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'rotate-feed' }),
                });
                const d = (await res.json()) as { feedPath?: string };
                if (d.feedPath) {
                  setFeedPath(d.feedPath);
                  setCopied(false);
                }
              }}
              className="text-xs text-muted underline underline-offset-2 hover:text-ink"
            >
              Reset the link
            </button>
          </div>

          <p className="mt-2 text-xs text-faint">
            The link contains a secret and needs no sign-in, because calendar apps cannot log in. Treat it like a
            password, and reset it if you share it by accident.
          </p>
        </div>
      )}

      {adding && <InterviewForm onCancel={() => setAdding(false)} onSave={async (v) => (await post(v)) && setAdding(false)} />}

      {tab === 'upcoming' && (
        <>
          {interviews.length === 0 && !adding && (
            <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-muted">
              Nothing scheduled. Interview invitations that arrive at your application address show up here automatically.
            </p>
          )}

          {days.map(({ key, label, sub, soon, items }) => (
            <div key={key}>
              <p className="mb-2 mt-5 flex items-baseline gap-2 first:mt-0">
                <span
                  className={`text-[11px] font-bold uppercase tracking-[0.14em] ${soon ? 'text-accent' : 'text-faint'}`}
                >
                  {label}
                </span>
                <span className="text-[11px] text-faint">{sub}</span>
              </p>
              <ul className="space-y-2.5">
                {items.map((i) => (
                  <InterviewRow key={i.id} item={i} post={post} />
                ))}
              </ul>
            </div>
          ))}

          {undated.length > 0 && (
            <div>
              {/* Kept separate. An invitation with no readable time is a task,
                  not an appointment, and mixing the two makes the diary lie. */}
              <p className="mb-2 mt-5 text-[11px] font-bold uppercase tracking-[0.14em] text-warn">Needs a time from you</p>
              <ul className="space-y-2.5">
                {undated.map((i) => (
                  <InterviewRow key={i.id} item={i} post={post} />
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {tab === 'archive' && (
        <>
          {archive.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-muted">
              Nothing sent yet. Every application is snapshotted here with the posting and the résumé you sent.
            </p>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-canvas">
              {archive.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => setOpenArchive(openArchive?.id === a.id ? null : a)}
                    className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left transition hover:bg-elevated"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">{a.title}</span>
                      <span className="block truncate text-xs text-muted">
                        {a.company} · {new Date(a.submittedAt).toLocaleDateString()} · {a.ats}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                        a.mode === 'SUBMITTED' ? 'bg-[var(--color-success-soft)] text-success' : 'bg-elevated text-muted'
                      }`}
                    >
                      {a.mode === 'SUBMITTED' ? `Sent${a.reference ? ` · ${a.reference}` : ''}` : 'Prepared'}
                    </span>
                  </button>

                  {openArchive?.id === a.id && <ArchiveDetail item={a} />}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/** Midnight of the day a timestamp falls on, in the reader's own timezone. */
function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

type DayGroup = { key: number; label: string; sub: string; soon: boolean; items: Interview[] };

/**
 * Split a diary into days, newest first, labelled the way people speak.
 *
 * "Tomorrow" and "In 3 days" are what someone actually needs off this screen.
 * An absolute date is kept alongside rather than instead: relative alone is
 * useless for writing something down, and absolute alone is useless for
 * knowing whether to panic.
 */
function groupByDay(items: Interview[]): DayGroup[] {
  const today = startOfDay(Date.now());
  const buckets = new Map<number, Interview[]>();

  for (const item of items) {
    if (item.startsAt == null) continue;
    const key = startOfDay(item.startsAt);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(item);
  }

  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([key, group]) => {
      const days = Math.round((key - today) / 86_400_000);
      const label =
        days < 0 ? (days === -1 ? 'Yesterday' : `${Math.abs(days)} days ago`)
        : days === 0 ? 'Today'
        : days === 1 ? 'Tomorrow'
        : days < 7 ? `In ${days} days`
        : new Date(key).toLocaleDateString([], { weekday: 'long' });

      return {
        key,
        label,
        sub: new Date(key).toLocaleDateString([], { month: 'short', day: 'numeric' }),
        /* Within two days is the window where someone still has to prepare. */
        soon: days >= 0 && days <= 2,
        items: group.sort((a, b) => (a.startsAt ?? 0) - (b.startsAt ?? 0)),
      };
    });
}

function InterviewRow({ item, post }: { item: Interview; post: (b: Record<string, unknown>) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <li>
        <InterviewForm
          initial={item}
          onCancel={() => setEditing(false)}
          onSave={async (v) => (await post({ ...v, action: 'update', id: item.id })) && setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-[var(--mf-radius-lg)] border border-line bg-canvas p-4">
      <span
        aria-hidden
        className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-[var(--mf-radius-md)] bg-elevated"
      >
        {item.startsAt ? (
          <>
            <span className="text-[10px] font-bold uppercase text-muted">
              {new Date(item.startsAt).toLocaleDateString([], { month: 'short' })}
            </span>
            <span className="text-sm font-bold tabular-nums text-ink">{new Date(item.startsAt).getDate()}</span>
          </>
        ) : (
          <CalendarIcon className="h-4 w-4 text-faint" />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-ink">
          {item.company}
          <span className="ml-2 rounded-full bg-elevated px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">
            {item.kind === 'ASSESSMENT' ? 'Assessment' : item.kind === 'CALL' ? 'Call' : 'Interview'}
          </span>
        </span>
        <span className="block truncate text-xs text-muted">
          {item.startsAt
            ? `${new Date(item.startsAt).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })} · ${item.durationMin} min`
            : 'No time set'}
          {item.location && ` · ${item.location.slice(0, 60)}`}
        </span>
        {/* A detected entry says so, because it might be wrong. */}
        {!item.confirmed && (
          <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-warn">
            <AlertTriangleIcon className="h-3 w-3" />
            Read from an email, check it
          </span>
        )}
      </span>

      <span className="flex shrink-0 gap-1.5">
        {!item.confirmed && item.startsAt && (
          <Button size="sm" variant="secondary" onClick={() => void post({ action: 'update', id: item.id, confirmed: true })}>
            <CheckIcon className="h-3.5 w-3.5" />
            Confirm
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
          Edit
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void post({ action: 'delete', id: item.id })}>
          Remove
        </Button>
      </span>
    </li>
  );
}

function InterviewForm({
  initial,
  onCancel,
  onSave,
}: {
  initial?: Interview;
  onCancel: () => void;
  onSave: (v: Record<string, unknown>) => void;
}) {
  const [company, setCompany] = useState(initial?.company ?? '');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [kind, setKind] = useState(initial?.kind ?? 'INTERVIEW');
  const [when, setWhen] = useState(initial?.startsAt ? toLocalInput(initial.startsAt) : '');
  const [duration, setDuration] = useState(String(initial?.durationMin ?? 60));
  const [location, setLocation] = useState(initial?.location ?? '');

  return (
    <form
      className="rounded-[var(--mf-radius-lg)] border border-accent/30 bg-mint/40 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          company,
          title,
          kind,
          startsAt: when ? new Date(when).getTime() : null,
          durationMin: Number(duration) || 60,
          location,
          confirmed: true,
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Company" value={company} onChange={setCompany} required />
        <Field label="Role" value={title} onChange={setTitle} />
        <label className="block">
          <span className="block text-[11px] font-bold uppercase tracking-[0.12em] text-faint">Type</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as Interview['kind'])}
            className="mt-1 h-9 w-full rounded-lg border border-line bg-canvas px-2.5 text-sm text-ink focus:border-accent focus:outline-none"
          >
            <option value="INTERVIEW">Interview</option>
            <option value="ASSESSMENT">Assessment</option>
            <option value="CALL">Call</option>
            <option value="OTHER">Other</option>
          </select>
        </label>
        <label className="block">
          <span className="block text-[11px] font-bold uppercase tracking-[0.12em] text-faint">When</span>
          <input
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            className="mt-1 h-9 w-full rounded-lg border border-line bg-canvas px-2.5 text-sm text-ink focus:border-accent focus:outline-none"
          />
        </label>
        <Field label="Minutes" value={duration} onChange={setDuration} />
        <Field label="Location or link" value={location} onChange={setLocation} />
      </div>
      <div className="mt-3 flex gap-2">
        <Button type="submit" variant="primary" size="sm">
          Save
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-bold uppercase tracking-[0.12em] text-faint">{label}</span>
      <input
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 h-9 w-full rounded-lg border border-line bg-canvas px-2.5 text-sm text-ink focus:border-accent focus:outline-none"
      />
    </label>
  );
}

function ArchiveDetail({ item }: { item: Archived }) {
  return (
    <div className="border-t border-line bg-surface px-4 py-4">
      {item.jobUrl && (
        <a href={item.jobUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-accent underline underline-offset-2">
          The original posting
        </a>
      )}

      {item.resumeSummary && (
        <div className="mt-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-faint">Résumé summary sent</p>
          <p className="mt-1 text-sm text-ink">{item.resumeSummary}</p>
        </div>
      )}

      {item.resumeBullets.length > 0 && (
        <ul className="mt-2 space-y-1">
          {item.resumeBullets.map((b, i) => (
            <li key={i} className="flex gap-2 text-sm text-muted">
              <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-faint" />
              {b}
            </li>
          ))}
        </ul>
      )}

      {item.coverLetter && (
        <div className="mt-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-faint">Cover letter sent</p>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink">{item.coverLetter}</p>
        </div>
      )}

      {item.answers.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-semibold text-muted">
            {item.answers.length} answers given
          </summary>
          <ul className="mt-1.5 space-y-1.5">
            {item.answers.map((a, i) => (
              <li key={i} className="text-xs">
                <span className="text-muted">{a.question}</span>
                <span className="block text-ink">{a.value || '—'}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {item.jdSnapshot && (
        <details className="mt-3">
          {/* The posting as it read on the day, which is often not how it reads
              now, and sometimes the only remaining copy. */}
          <summary className="cursor-pointer text-xs font-semibold text-muted">The posting, as it was that day</summary>
          <pre className="mt-1.5 max-h-64 overflow-y-auto whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-muted">
            {item.jdSnapshot}
          </pre>
        </details>
      )}
    </div>
  );
}

/** `datetime-local` needs a local-time string, not an ISO UTC one. */
function toLocalInput(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
