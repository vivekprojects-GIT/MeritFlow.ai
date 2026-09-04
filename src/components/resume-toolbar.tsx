'use client';

import { useState } from 'react';
import { Button } from './button';
import { PencilIcon, TrashIcon, PlusIcon, CheckIcon } from './icons';
import { SECTION_LABEL, type ResumeDoc, type SectionId } from '@/lib/jobs/resume-schema';

/**
 * The chrome around the résumé.
 *
 * Two rows, because they answer two different questions. The first is "which
 * document am I editing" — the named variant and which of its faces (résumé,
 * cover letter, the details behind both). The second is "how does it look" —
 * everything that changes the page without changing a word on it.
 *
 * Keeping them apart matters: a format control mixed in with a document
 * switcher reads as though changing the font might change which file you are
 * in.
 */

export type DocSummary = { id: string; name: string; kind: 'resume' | 'cover_letter'; isActive: boolean };
export type Face = 'resume' | 'cover' | 'details';

const TEMPLATES = [
  { id: 'standard', label: 'Standard' },
  /* Named after the community template most technical candidates already use,
     so the choice means something to the people choosing it. */
  { id: 'jake', label: 'Jake' },
];

const FONT_OPTIONS = [
  { id: 'sans', label: 'Arial' },
  { id: 'serif', label: 'Times' },
  { id: 'mono', label: 'Courier' },
];

export function ResumeToolbar({
  documents,
  currentId,
  name,
  face,
  template,
  font,
  fontSize,
  doc,
  dirty,
  saving,
  onSelect,
  onRename,
  onSetActive,
  onDelete,
  onAdd,
  onFace,
  onFormat,
  onDoc,
  onSave,
  onCancel,
}: {
  documents: DocSummary[];
  currentId: string | null;
  name: string;
  face: Face;
  template: string;
  font: string;
  fontSize: number;
  doc: ResumeDoc | null;
  dirty: boolean;
  saving: boolean;
  onSelect: (id: string) => void;
  onRename: (v: string) => void;
  onSetActive: () => void;
  onDelete: () => void;
  onAdd: (kind: 'resume' | 'cover_letter') => void;
  onFace: (f: Face) => void;
  onFormat: (patch: { template?: string; font?: string; fontSize?: number }) => void;
  onDoc: (patch: Partial<ResumeDoc>) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [sectionsOpen, setSectionsOpen] = useState(false);
  const current = documents.find((d) => d.id === currentId);

  const move = (id: SectionId, by: number) => {
    if (!doc) return;
    const order = [...doc.order];
    const i = order.indexOf(id);
    const j = i + by;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    onDoc({ order });
  };

  return (
    <div className="rounded-t-[var(--mf-radius-lg)] border border-line bg-canvas">
      {/* Which document */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
        <span className="inline-flex items-center gap-1">
          {renaming ? (
            <input
              value={name}
              onChange={(e) => onRename(e.target.value)}
              onBlur={() => setRenaming(false)}
              onKeyDown={(e) => e.key === 'Enter' && setRenaming(false)}
              autoFocus
              aria-label="Document name"
              className="h-9 w-44 rounded-lg border border-accent bg-canvas px-2.5 text-sm font-semibold text-ink focus:outline-none"
            />
          ) : (
            <select
              value={currentId ?? ''}
              onChange={(e) => onSelect(e.target.value)}
              aria-label="Choose a document"
              className="h-9 w-44 rounded-lg border border-line bg-canvas px-2.5 text-sm font-semibold text-ink focus:border-accent focus:outline-none"
            >
              {documents.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                  {d.isActive ? ' ✓' : ''}
                </option>
              ))}
            </select>
          )}

          <IconButton label="Rename" onClick={() => setRenaming(true)}>
            <PencilIcon className="h-3.5 w-3.5" />
          </IconButton>

          {/* The star is the active résumé, which is the one applications
              actually use — not a favourite. */}
          {current?.kind === 'resume' && (
            <IconButton
              label={current.isActive ? 'This résumé is used for applications' : 'Use this résumé for applications'}
              onClick={onSetActive}
              className={current.isActive ? 'text-accent' : ''}
            >
              <StarIcon filled={current.isActive} />
            </IconButton>
          )}

          <IconButton label="Delete" onClick={onDelete} className="hover:text-danger">
            <TrashIcon className="h-3.5 w-3.5" />
          </IconButton>
        </span>

        <button
          type="button"
          onClick={() => onAdd('resume')}
          className="inline-flex h-9 items-center gap-1 rounded-lg px-2.5 text-sm font-medium text-muted transition hover:bg-elevated hover:text-ink"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          Add profile
        </button>

        {/* Faces of one profile */}
        <span className="ml-1 inline-flex overflow-hidden rounded-full bg-elevated p-0.5">
          {(
            [
              ['resume', 'Resume'],
              ['cover', 'Cover Letter'],
              ['details', 'Profile Details'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => onFace(key)}
              aria-pressed={face === key}
              className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition ${
                face === key ? 'bg-canvas text-ink shadow-[var(--mf-shadow-xs)]' : 'text-muted hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </span>

        <span className="ml-auto flex items-center gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={!dirty}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onSave} loading={saving} disabled={!dirty}>
            Save
          </Button>
        </span>
      </div>

      {/* How it looks */}
      {face !== 'details' && (
        <div className="relative flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 text-[13px]">
          <Group label="Template">
            <Segmented options={TEMPLATES} value={template} onChange={(v) => onFormat({ template: v })} />
          </Group>

          <select
            value={font}
            onChange={(e) => onFormat({ font: e.target.value })}
            aria-label="Font"
            className="h-8 rounded-lg border border-line bg-canvas px-2 text-[13px] text-ink focus:border-accent focus:outline-none"
          >
            {FONT_OPTIONS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>

          <Group label="Size">
            <span className="inline-flex items-center gap-1">
              <Step label="Smaller" onClick={() => onFormat({ fontSize: Math.max(8, fontSize - 0.5) })}>
                −
              </Step>
              <span className="w-12 text-center tabular-nums text-ink">{fontSize.toFixed(1)}pt</span>
              <Step label="Larger" onClick={() => onFormat({ fontSize: Math.min(16, fontSize + 0.5) })}>
                +
              </Step>
            </span>
          </Group>

          {doc && (
            <>
              <Group label="Align">
                <Segmented
                  options={[
                    { id: 'left', label: 'Left' },
                    { id: 'justified', label: 'Justified' },
                  ]}
                  value={doc.align}
                  onChange={(v) => onDoc({ align: v as ResumeDoc['align'] })}
                />
              </Group>

              <button
                type="button"
                role="switch"
                aria-checked={doc.fitToOnePage}
                onClick={() => onDoc({ fitToOnePage: !doc.fitToOnePage })}
                className={`inline-flex h-8 items-center gap-2 rounded-full px-3 font-medium transition ${
                  doc.fitToOnePage ? 'bg-mint text-accent' : 'bg-elevated text-muted hover:text-ink'
                }`}
              >
                <span
                  aria-hidden
                  className={`relative h-4 w-7 rounded-full transition ${doc.fitToOnePage ? 'bg-accent-fill' : 'bg-line-strong'}`}
                >
                  <span
                    className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-[left] ${
                      doc.fitToOnePage ? 'left-[0.9rem]' : 'left-0.5'
                    }`}
                  />
                </span>
                Fit to one page
              </button>

              <button
                type="button"
                onClick={() => setSectionsOpen((v) => !v)}
                aria-expanded={sectionsOpen}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 font-medium text-muted transition hover:bg-elevated hover:text-ink"
              >
                ↕ Sections
              </button>

              {sectionsOpen && (
                /* Reordering in one place, rather than only on hover over each
                   heading — a control you have to discover by hovering is a
                   control most people never find. */
                <div className="absolute right-3 top-full z-20 mt-1 w-60 rounded-xl border border-line bg-canvas p-2 shadow-[var(--mf-shadow-md)]">
                  <p className="px-1 pb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-faint">Section order</p>
                  <ul>
                    {doc.order.map((id, i) => (
                      <li key={id} className="flex items-center gap-1 rounded-lg px-1 py-1 hover:bg-elevated">
                        <span className="flex-1 text-[13px] text-ink">{SECTION_LABEL[id]}</span>
                        <Step label={`Move ${SECTION_LABEL[id]} up`} onClick={() => move(id, -1)} disabled={i === 0}>
                          ↑
                        </Step>
                        <Step
                          label={`Move ${SECTION_LABEL[id]} down`}
                          onClick={() => move(id, 1)}
                          disabled={i === doc.order.length - 1}
                        >
                          ↓
                        </Step>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          {dirty && (
            <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted">Unsaved changes</span>
          )}
          {!dirty && current?.isActive && (
            <span className="ml-auto inline-flex items-center gap-1 text-xs text-success">
              <CheckIcon className="h-3.5 w-3.5" />
              Used for applications
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Small parts ─────────────────────────────────────────────────────────── */

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-faint">{label}</span>
      {children}
    </span>
  );
}

function Segmented({
  options,
  value,
  onChange,
}: {
  options: { id: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <span className="inline-flex overflow-hidden rounded-lg bg-elevated p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
          className={`rounded-md px-2.5 py-1 transition ${
            value === o.id ? 'bg-canvas font-semibold text-ink shadow-[var(--mf-shadow-xs)]' : 'text-muted hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </span>
  );
}

function Step({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-6 w-6 items-center justify-center rounded-md border border-line text-muted transition hover:bg-elevated hover:text-ink disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function IconButton({
  label,
  onClick,
  className = '',
  children,
}: {
  label: string;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-elevated hover:text-ink ${className}`}
    >
      {children}
    </button>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m12 3 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 20.9l1.1-6.5L2.6 9.8l6.5-.9L12 3z" />
    </svg>
  );
}
