'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from './button';
import { SearchIcon, CheckIcon } from './icons';
import { CATEGORY_META, type MailCategory } from '@/lib/mail/classify';

/**
 * The application inbox.
 *
 * Mail sent to the candidate's apply-only address, classified on arrival so
 * the one message that matters — a verification code mid-application, or an
 * interview invitation — is one click away rather than buried under
 * acknowledgements.
 *
 * List and reading pane, because the alternative is a list of subjects that
 * each need a round trip to read. Bodies load on demand: shipping a whole
 * mailbox to render a list is a lot of somebody's private mail over the wire.
 */

type Row = {
  id: string;
  fromName: string;
  fromAddr: string;
  subject: string;
  preview: string;
  otp: string;
  company: string;
  category: MailCategory;
  receivedAt: number;
  forwarded: boolean;
  read: boolean;
};

type Full = Row & { body: string };

const FILTERS: (MailCategory | 'ALL')[] = [
  'ALL',
  'VERIFICATION',
  'REJECTION',
  'INTERVIEW',
  'ASSESSMENT',
  'REMINDER',
  'OFFER',
  'APPLIED',
];

const TONE_CLASS: Record<string, string> = {
  info: 'bg-[var(--color-mint)] text-accent',
  bad: 'bg-[var(--color-danger-soft)] text-danger',
  good: 'bg-[var(--color-success-soft)] text-success',
  warn: 'bg-[var(--color-warn-soft)] text-warn',
  neutral: 'bg-elevated text-muted',
};

export function JobInbox() {
  const [applyEmail, setApplyEmail] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [filter, setFilter] = useState<MailCategory | 'ALL'>('ALL');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Full | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [composing, setComposing] = useState<{ to: string; subject: string; body: string; replyToId?: string } | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch('/api/jobs/inbox')
      .then(async (r) => {
        const d = (await r.json()) as { messages?: Row[]; applyEmail?: string | null; error?: string };
        if (!alive) return;
        if (!r.ok) setError(d.error ?? 'Could not load your inbox.');
        else {
          setRows(d.messages ?? []);
          setApplyEmail(d.applyEmail ?? null);
        }
      })
      .catch(() => alive && setError('Could not load your inbox.'));
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  const openMessage = useCallback(async (id: string) => {
    const res = await fetch(`/api/jobs/inbox?id=${encodeURIComponent(id)}`);
    const d = (await res.json()) as { message?: Full; error?: string };
    if (res.ok && d.message) {
      setOpen(d.message);
      /* Marked read locally too, so the row updates without refetching the
         whole list. */
      setRows((cur) => cur?.map((r) => (r.id === id ? { ...r, read: true } : r)) ?? cur);
    } else setError(d.error ?? 'Could not open that message.');
  }, []);

  if (error && !rows) return <p className="rounded-2xl border border-line bg-canvas p-6 text-sm text-muted">{error}</p>;
  if (!rows)
    return (
      <p role="status" aria-live="polite" className="rounded-2xl border border-line bg-canvas p-6 text-sm text-muted">
        Loading your inbox…
      </p>
    );

  const q = query.trim().toLowerCase();
  const visible = rows.filter(
    (r) =>
      (filter === 'ALL' || r.category === filter) &&
      (!q || r.subject.toLowerCase().includes(q) || r.fromName.toLowerCase().includes(q) || r.preview.toLowerCase().includes(q)),
  );

  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.category] = (acc[r.category] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-ink">Inbox</h3>
          <p className="mt-0.5 truncate text-sm text-muted">
            {applyEmail ? (
              <>
                Mail sent to <span className="font-mono text-ink">{applyEmail}</span>
              </>
            ) : (
              'Your application address is not issued yet.'
            )}
          </p>
        </div>
        <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
        <label className="relative flex min-w-[13rem] flex-1 items-center sm:max-w-xs">
          <SearchIcon className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-faint" />
          <span className="sr-only">Search messages</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search messages…"
            className="h-9 w-full rounded-full border border-line bg-canvas pl-8 pr-3 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none"
          />
        </label>
        <Button variant="primary" onClick={() => setComposing({ to: '', subject: '', body: '' })}>
          Compose
        </Button>
        </div>
      </div>

      {composing && (
        <Composer
          value={composing}
          sending={sending}
          onChange={setComposing}
          onCancel={() => setComposing(null)}
          onSend={async () => {
            setSending(true);
            setError(null);
            try {
              const res = await fetch('/api/jobs/inbox', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'send', ...composing }),
              });
              const d = (await res.json()) as { error?: string };
              if (!res.ok) setError(d.error ?? 'That message did not send.');
              else {
                setComposing(null);
                setReloadKey((k) => k + 1);
              }
            } finally {
              setSending(false);
            }
          }}
        />
      )}

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => {
          const active = filter === f;
          const meta = f === 'ALL' ? null : CATEGORY_META[f];
          const n = f === 'ALL' ? rows.length : (counts[f] ?? 0);
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              aria-pressed={active}
              className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition ${
                active ? 'border-ink bg-ink text-canvas' : `border-line ${meta ? TONE_CLASS[meta.tone] : 'text-muted'} hover:border-accent/40`
              }`}
            >
              {meta?.label ?? 'All'}
              <span className="tabular-nums opacity-70">{n}</span>
            </button>
          );
        })}
      </div>

      {error && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}

      <div className="grid min-h-[24rem] gap-4 overflow-hidden rounded-2xl border border-line bg-canvas lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-0">
        {/* List */}
        <ul className="divide-y divide-line lg:max-h-[36rem] lg:overflow-y-auto lg:border-r lg:border-line">
          {visible.length === 0 && (
            <li className="p-8 text-center text-sm text-muted">
              {rows.length === 0 ? 'No messages yet. Mail sent to your application address appears here.' : 'Nothing matches.'}
            </li>
          )}
          {visible.map((r) => {
            const meta = CATEGORY_META[r.category];
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => void openMessage(r.id)}
                  className={`w-full px-4 py-3 text-left transition hover:bg-elevated ${open?.id === r.id ? 'bg-elevated' : ''}`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={`min-w-0 truncate text-sm ${r.read ? 'text-muted' : 'font-semibold text-ink'}`}>
                      {r.fromName}
                    </span>
                    <span className="shrink-0 text-[11px] text-faint">{when(r.receivedAt)}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-sm text-ink">{r.subject}</span>
                  <span className="mt-0.5 block truncate text-xs text-faint">{r.preview}</span>
                  <span className="mt-1.5 flex items-center gap-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${TONE_CLASS[meta.tone]}`}>
                      {meta.label}
                    </span>
                    {r.otp && (
                      <span className="rounded-full bg-mint px-2 py-0.5 font-mono text-[10px] font-bold text-accent">{r.otp}</span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {/* Reading pane */}
        <div className="min-w-0 p-5">
          {!open ? (
            <p className="flex h-full items-center justify-center text-sm text-muted">Select a message to read</p>
          ) : (
            <article className="min-w-0">
              <h4 className="text-[17px] font-bold text-ink">{open.subject}</h4>
              <p className="mt-1 break-words text-sm text-muted">
                {open.fromName} &lt;{open.fromAddr}&gt; · {new Date(open.receivedAt).toLocaleString()}
              </p>

              {open.otp && (
                /* Lifted out of the body because someone opening this mid
                   application needs exactly this and nothing else. */
                <p className="mt-3 inline-flex items-center gap-2 rounded-xl bg-mint px-3 py-2">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-accent">Code</span>
                  <span className="font-mono text-lg font-bold tabular-nums text-accent">{open.otp}</span>
                  <Button size="sm" variant="ghost" onClick={() => void navigator.clipboard.writeText(open.otp)}>
                    Copy
                  </Button>
                </p>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {open.forwarded ? (
                  <span className="inline-flex items-center gap-1 text-xs text-success">
                    <CheckIcon className="h-3.5 w-3.5" /> Copied to your inbox
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      const res = await fetch('/api/jobs/inbox', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'forward', id: open.id }),
                      });
                      const d = (await res.json()) as { forwarded?: boolean; reason?: string };
                      if (d.forwarded) setReloadKey((k) => k + 1);
                      else setError(d.reason ?? 'Could not forward that message.');
                    }}
                  >
                    Send to my inbox
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    setComposing({
                      to: open.fromAddr,
                      subject: open.subject.startsWith('Re:') ? open.subject : `Re: ${open.subject}`,
                      body: '',
                      replyToId: open.id,
                    })
                  }
                >
                  Reply
                </Button>
              </div>

              {/* Rendered as text, never as HTML. This is untrusted mail from
                  the public internet, and nothing in it should be able to run
                  or to style the page around it. */}
              <pre className="mt-4 max-h-[22rem] overflow-y-auto whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-ink">
                {open.body}
              </pre>
            </article>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Compose or reply.
 *
 * Sends from the application alias, so a recruiter's thread stays on the
 * address the application used rather than jumping to a personal inbox the
 * employer has never seen.
 */
function Composer({
  value,
  sending,
  onChange,
  onCancel,
  onSend,
}: {
  value: { to: string; subject: string; body: string; replyToId?: string };
  sending: boolean;
  onChange: (v: { to: string; subject: string; body: string; replyToId?: string }) => void;
  onCancel: () => void;
  onSend: () => void;
}) {
  return (
    <form
      className="rounded-2xl border border-accent/30 bg-mint/40 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSend();
      }}
    >
      <p className="text-sm font-semibold text-ink">{value.replyToId ? 'Reply' : 'New message'}</p>

      <div className="mt-2.5 grid gap-2">
        <input
          value={value.to}
          onChange={(e) => onChange({ ...value, to: e.target.value })}
          type="email"
          autoComplete="email"
          required
          placeholder="To"
          aria-label="To"
          className="h-9 w-full rounded-lg border border-line bg-canvas px-2.5 text-sm text-ink focus:border-accent focus:outline-none"
        />
        <input
          value={value.subject}
          onChange={(e) => onChange({ ...value, subject: e.target.value })}
          placeholder="Subject"
          aria-label="Subject"
          className="h-9 w-full rounded-lg border border-line bg-canvas px-2.5 text-sm text-ink focus:border-accent focus:outline-none"
        />
        <textarea
          value={value.body}
          onChange={(e) => onChange({ ...value, body: e.target.value })}
          rows={6}
          placeholder="Message"
          aria-label="Message"
          className="w-full resize-y rounded-lg border border-line bg-canvas p-2.5 text-sm leading-relaxed text-ink focus:border-accent focus:outline-none"
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" loading={sending} disabled={!value.to.trim()}>
          Send
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <span className="text-xs text-faint">Sent from your application address, so replies come back here.</span>
      </div>
    </form>
  );
}

function when(ms: number): string {
  const d = Math.floor((Date.now() - ms) / 86_400_000);
  if (d === 0) return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (d === 1) return 'Yesterday';
  if (d < 7) return `${d}d`;
  return new Date(ms).toLocaleDateString([], { month: 'short', day: 'numeric' });
}
