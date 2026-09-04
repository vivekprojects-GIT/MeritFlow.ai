'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from './button';
import { DownloadIcon, RefreshIcon } from './icons';
import { ResumeEditor } from './resume-editor';
import { ResumeToolbar, type Face } from './resume-toolbar';
import type { ResumeDoc } from '@/lib/jobs/resume-schema';

/**
 * Résumé and cover letters.
 *
 * A candidate applying to two kinds of role needs two résumés, so this is a
 * named set rather than a file. Exactly one is active: that is the text
 * matching scores against and per-application tailoring rewrites.
 *
 * The document is edited in place at the size and weight it prints. An earlier
 * version put a monospace textarea beside a rendering of the same text, which
 * asked the reader to translate between two things that should be one.
 */

type Doc = {
  id: string;
  kind: 'resume' | 'cover_letter';
  name: string;
  body: string;
  fileName: string;
  template: string;
  font: string;
  fontSize: number;
  isActive: boolean;
  structured: ResumeDoc | null;
  updatedAt: number;
};

const FONT_STACK: Record<string, string> = {
  sans: 'Arial, ui-sans-serif, system-ui, sans-serif',
  serif: '"Times New Roman", ui-serif, Georgia, serif',
  mono: '"Courier New", ui-monospace, monospace',
};

export function JobDocuments() {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Doc | null>(null);
  const [face, setFace] = useState<Face>('resume');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [tailored, setTailored] = useState<
    { jobId: string; company: string; title: string; ats: string; mode: string; submittedAt: number }[]
  >([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/jobs/documents')
      .then(async (r) => {
        const d = (await r.json()) as { documents?: Doc[]; error?: string };
        if (!alive) return;
        if (!r.ok) setError(d.error ?? 'Could not load your documents.');
        else {
          setDocs(d.documents ?? []);
          setOpenId((cur) => cur ?? d.documents?.[0]?.id ?? null);
        }
      })
      .catch(() => alive && setError('Could not load your documents.'));
    fetch('/api/jobs/documents/tailored')
      .then(async (r) => {
        const d = (await r.json()) as { tailored?: typeof tailored };
        if (alive && r.ok) setTailored(d.tailored ?? []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  /**
   * Seed the draft from whichever document is selected.
   *
   * Adjusted during render rather than in an effect: the effect version paints
   * one frame of the previous document's text under the new document's name,
   * which reads as data loss.
   */
  const selected = docs?.find((d) => d.id === openId) ?? null;
  const [seededFrom, setSeededFrom] = useState<string | null>(null);
  const seedKey = selected ? `${selected.id}:${selected.updatedAt}` : null;
  if (seedKey !== seededFrom) {
    setSeededFrom(seedKey);
    setDraft(selected ? structuredClone(selected) : null);
  }

  const post = useCallback(async (body: Record<string, unknown>) => {
    setError(null);
    const res = await fetch('/api/jobs/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const d = (await res.json()) as { error?: string };
      setError(d.error ?? 'That did not save.');
      return null;
    }
    return (await res.json()) as { document?: Doc };
  }, []);

  if (error && !docs) return <p className="rounded-2xl border border-line bg-canvas p-6 text-sm text-muted">{error}</p>;
  if (!docs)
    return (
      <p role="status" aria-live="polite" className="rounded-2xl border border-line bg-canvas p-6 text-sm text-muted">
        Loading your documents…
      </p>
    );

  /* Compared against the stored copy rather than tracked with a flag, so
     editing something back to its original value correctly reads as clean. */
  const dirty = Boolean(draft && selected && JSON.stringify(draft) !== JSON.stringify(selected));

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const r = await post({
        action: 'update',
        id: draft.id,
        name: draft.name,
        body: draft.body,
        template: draft.template,
        font: draft.font,
        fontSize: draft.fontSize,
        structured: draft.structured ?? undefined,
      });
      if (r?.document) setReloadKey((k) => k + 1);
    } finally {
      setSaving(false);
    }
  };

  const create = async (kind: 'resume' | 'cover_letter') => {
    const r = await post({
      action: 'create',
      kind,
      name: kind === 'resume' ? 'New résumé' : 'New cover letter',
      body: '',
    });
    if (r?.document) {
      setReloadKey((k) => k + 1);
      setOpenId(r.document.id);
      setFace(kind === 'resume' ? 'resume' : 'cover');
    }
  };

  const stack = FONT_STACK[draft?.font ?? 'sans'] ?? FONT_STACK.sans;
  const fit = draft?.structured?.fitToOnePage ?? false;

  return (
    <div className="space-y-3">
      {/* What each employer actually received. The editor below is for the
          master documents; these are per-application snapshots, downloadable
          as the same .docx that went out. */}
      {tailored.length > 0 && (
        <details className="rounded-2xl border border-line bg-canvas px-4 py-3">
          <summary className="cursor-pointer text-sm font-bold text-ink">
            Sent with applications ({tailored.length})
          </summary>
          <ul className="mt-2 divide-y divide-line">
            {tailored.slice(0, 30).map((t) => (
              <li key={t.jobId} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium text-ink">{t.company}</span>
                  <span className="text-muted"> — {t.title}</span>
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${t.mode === 'SUBMITTED' ? 'bg-mint text-accent' : 'bg-elevated text-muted'}`}>
                  {t.mode === 'SUBMITTED' ? 'sent' : 'prepared'}
                </span>
                <span className="text-xs tabular-nums text-faint">
                  {new Date(t.submittedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
                <a
                  className="text-xs font-semibold text-accent underline"
                  href={`/api/jobs/documents/tailored?jobId=${encodeURIComponent(t.jobId)}`}
                >
                  .docx
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}
      <ResumeToolbar
        documents={docs.map((d) => ({ id: d.id, name: d.name, kind: d.kind, isActive: d.isActive }))}
        currentId={openId}
        name={draft?.name ?? ''}
        face={face}
        template={draft?.template ?? 'standard'}
        font={draft?.font ?? 'sans'}
        fontSize={draft?.fontSize ?? 10.5}
        doc={draft?.structured ?? null}
        dirty={dirty}
        saving={saving}
        onSelect={setOpenId}
        onRename={(name) => draft && setDraft({ ...draft, name })}
        onSetActive={async () => {
          if (!openId) return;
          await post({ action: 'activate', id: openId });
          setReloadKey((k) => k + 1);
        }}
        onDelete={async () => {
          if (!openId) return;
          await post({ action: 'delete', id: openId });
          setOpenId(null);
          setReloadKey((k) => k + 1);
        }}
        onAdd={create}
        onFace={setFace}
        onFormat={(patch) => draft && setDraft({ ...draft, ...patch })}
        onDoc={(patch) =>
          draft?.structured && setDraft({ ...draft, structured: { ...draft.structured, ...patch } })
        }
        onSave={save}
        onCancel={() => selected && setDraft(structuredClone(selected))}
      />

      {error && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}

      {/* The page */}
      <div className="rounded-b-[var(--mf-radius-lg)] border border-t-0 border-line bg-elevated">
        {!draft ? (
          <p className="p-12 text-center text-sm text-muted">
            {docs.length === 0 ? 'No documents yet. Upload a file or start one.' : 'Pick a document to edit.'}
          </p>
        ) : face === 'details' ? (
          <ProfileDetails doc={draft} />
        ) : (
          <div className="max-h-[44rem] overflow-y-auto px-4 py-8 sm:px-8">
            <Sheet>
              {draft.kind === 'resume' && draft.structured ? (
                <ResumeEditor
                  doc={draft.structured}
                  font={draft.font}
                  /* Fit-to-one-page shrinks the type rather than clipping, so
                     the page stays complete and simply gets denser. */
                  fontSize={fit ? Math.max(8.5, draft.fontSize - 1) : draft.fontSize}
                  template={draft.template}
                  onChange={(structured) => setDraft({ ...draft, structured })}
                />
              ) : (
                <textarea
                  value={draft.body}
                  onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                  aria-label="Document text"
                  spellCheck
                  className="block min-h-[10in] w-full resize-none bg-transparent p-[0.9in] leading-relaxed text-ink focus:outline-none"
                  style={{ fontFamily: stack, fontSize: `${draft.fontSize}pt` }}
                  placeholder="Write your cover letter here."
                />
              )}
            </Sheet>
          </div>
        )}
      </div>

      {/* Getting it out */}
      {draft && (
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`/api/jobs/documents/export?id=${draft.id}&format=pdf`}
            className="inline-flex h-9 items-center gap-1.5 rounded-[var(--mf-radius-md)] border border-line bg-canvas px-3.5 text-sm font-medium text-ink transition hover:bg-elevated"
          >
            <DownloadIcon className="h-3.5 w-3.5" />
            PDF
          </a>
          <a
            href={`/api/jobs/documents/export?id=${draft.id}&format=tex`}
            className="inline-flex h-9 items-center rounded-[var(--mf-radius-md)] border border-line bg-canvas px-3.5 text-sm font-medium text-ink transition hover:bg-elevated"
          >
            LaTeX
          </a>
          <button
            type="button"
            onClick={async () => {
              const res = await fetch(`/api/jobs/documents/export?id=${draft.id}&format=tex`);
              if (!res.ok) {
                setError('Could not build the LaTeX source.');
                return;
              }
              /* Overleaf takes a project as a form POST — a résumé is longer
                 than a query string will carry. */
              const form = document.createElement('form');
              form.method = 'POST';
              form.action = 'https://www.overleaf.com/docs';
              form.target = '_blank';
              const field = document.createElement('input');
              field.type = 'hidden';
              field.name = 'snip';
              field.value = await res.text();
              form.appendChild(field);
              document.body.appendChild(form);
              form.submit();
              form.remove();
            }}
            className="inline-flex h-9 items-center rounded-[var(--mf-radius-md)] border border-line bg-canvas px-3.5 text-sm font-medium text-ink transition hover:bg-elevated"
          >
            Open in Overleaf
          </button>

          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            Replace from a file
          </Button>

          {draft.kind === 'resume' && (
            <Button
              variant="ghost"
              onClick={async () => {
                const r = await post({ action: 'reparse', id: draft.id });
                if (r?.document) setReloadKey((k) => k + 1);
              }}
            >
              <RefreshIcon className="h-3.5 w-3.5" />
              Re-read the upload
            </Button>
          )}
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.docx,.txt"
        className="sr-only"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          setError(null);
          /* Reuses the existing extractor rather than a second one — a single
             place that knows how to read a PDF. */
          const form = new FormData();
          form.append('resume', f);
          form.append('json', '{}');
          const res = await fetch('/api/jobs/profile', { method: 'POST', body: form });
          if (!res.ok) {
            const d = (await res.json()) as { error?: string };
            setError(d.error ?? 'Could not read that file.');
            return;
          }
          setReloadKey((k) => k + 1);
        }}
      />
    </div>
  );
}

/** US Letter at 96dpi, which is the unit every browser lays out in. */
const PAGE_HEIGHT_PX = 11 * 96;

/**
 * The document as a sheet of paper.
 *
 * Two things this fixes, both of which made the editor read as a form rather
 * than as the document an employer receives.
 *
 * **Contrast.** The page was white on an almost-white well, so its edge
 * disappeared and there was no sense of a page at all. The well is now a proper
 * desk surface with the sheet raised off it.
 *
 * **Page breaks.** The first question anyone has about a résumé is whether it
 * fits on one page, and nothing on screen answered it — the editor just kept
 * scrolling. Rules are drawn where the printed page actually ends, measured
 * from the rendered height rather than guessed from a character count, so
 * "this spills onto page two" is visible while editing instead of at the moment
 * the PDF is opened.
 */
/**
 * Slack before a break is drawn.
 *
 * The sheet's own minimum height is exactly one page, so sub-pixel rounding in
 * layout puts `scrollHeight` a fraction over it and a full "Page 2" rule
 * appeared under a résumé that plainly fitted. A line of type of headroom is
 * the difference between a real overflow and a rounding artefact.
 */
const PAGE_SLACK_PX = 24;

function Sheet({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState(1);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () =>
      setPages(Math.max(1, Math.ceil((node.scrollHeight - PAGE_SLACK_PX) / PAGE_HEIGHT_PX)));
    measure();
    /* Re-measured on every content change: typing a bullet is what pushes a
       résumé onto a second page, and a stale rule is worse than none. */
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="relative mx-auto w-full max-w-[8.5in]">
      <div
        ref={ref}
        /* The app's own paper tokens rather than the card surface: this is a
           document being previewed, and it should read as one in either theme
           — with an edge that stays visible in both, which `bg-canvas` on a
           dark well did not. */
        className="relative shadow-[var(--mf-shadow-md)]"
        style={{
          minHeight: PAGE_HEIGHT_PX,
          background: 'var(--color-paper)',
          border: '1px solid var(--color-paper-edge)',
          color: 'var(--color-ink-print)',
        }}
      >
        {children}

        {/* One rule per break. Never at the very top, and never after the last
            page, where a line would read as content ending early. */}
        {Array.from({ length: pages - 1 }, (_, i) => (
          <div
            key={i}
            aria-hidden
            className="pointer-events-none absolute inset-x-0 border-t border-dashed border-line-strong"
            style={{ top: (i + 1) * PAGE_HEIGHT_PX }}
          >
            <span className="absolute right-2 -translate-y-full pb-1 text-[10px] font-semibold uppercase tracking-wider text-faint">
              Page {i + 2}
            </span>
          </div>
        ))}
      </div>

      <p className="mt-2 text-center text-[11px] text-faint">
        {pages === 1 ? 'Fits on one page' : `${pages} pages`}
      </p>
    </div>
  );
}

/**
 * The facts behind the documents.
 *
 * Read-only here on purpose: these live on the profile, and a second place to
 * edit them is a second place for them to disagree.
 */
function ProfileDetails({ doc }: { doc: Doc }) {
  const c = doc.structured?.contact;
  if (!c) return <p className="p-10 text-center text-sm text-muted">This document has no profile details.</p>;

  const rows: [string, string][] = [
    ['Name', c.name],
    ['Headline', c.headline],
    ['Location', c.location],
    ['Email', c.email],
    ['Phone', c.phone],
    ['LinkedIn', c.linkedin],
    ['GitHub', c.github],
    ['Website', c.website],
  ];

  return (
    <div className="mx-auto max-w-2xl p-8">
      <dl className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-canvas">
        {rows.map(([label, value]) => (
          <div key={label} className="flex flex-wrap items-baseline justify-between gap-3 px-4 py-3">
            <dt className="text-sm text-muted">{label}</dt>
            <dd className="text-sm text-ink">{value || <span className="text-faint">Not set</span>}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-faint">
        Edit these on the résumé itself, or in Profile. They are shown here so you can check them at a glance.
      </p>
    </div>
  );
}
