'use client';

import type { CSSProperties } from 'react';
import { usePersisted } from '@/lib/use-persisted';

/**
 * Reading preferences for the book page — the handful of controls a real
 * e-reader gives you, and no more: type size, justified setting, and classic
 * indented paragraphs. Saved on the device, so the reader stays how you like it.
 */

export type ReadingPrefs = {
  size: 'S' | 'M' | 'L';
  justified: boolean;
  indent: boolean;
};

const DEFAULTS: ReadingPrefs = { size: 'M', justified: false, indent: false };

const SIZES: Record<ReadingPrefs['size'], string> = {
  S: '1.0625rem',
  M: '1.2rem',
  L: '1.35rem',
};

export function useReadingPrefs() {
  const [prefs, setPrefs] = usePersisted<ReadingPrefs>('courseai:reading', DEFAULTS);
  const safe: ReadingPrefs = { ...DEFAULTS, ...prefs };

  return {
    prefs: safe,
    setPrefs,
    /** Apply to the page wrapper. */
    style: { ['--book-size' as string]: SIZES[safe.size] } as CSSProperties,
    /** Apply to the prose container. */
    bodyClass: [
      'book-body',
      safe.justified ? 'book-body--justified' : '',
      safe.indent ? 'book-flow' : 'space-y-[1.1em]',
    ]
      .filter(Boolean)
      .join(' '),
  };
}

export function ReadingControls({
  prefs,
  onChange,
}: {
  prefs: ReadingPrefs;
  onChange: (next: ReadingPrefs) => void;
}) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Reading preferences">
      <div className="flex items-center overflow-hidden rounded-md border border-paper-edge bg-white/70">
        {(['S', 'M', 'L'] as const).map((size) => (
          <button
            key={size}
            type="button"
            onClick={() => onChange({ ...prefs, size })}
            aria-pressed={prefs.size === size}
            title={`${size === 'S' ? 'Small' : size === 'M' ? 'Medium' : 'Large'} type`}
            className={[
              'px-2 py-1 font-serif leading-none transition-colors',
              size === 'S' ? 'text-[11px]' : size === 'M' ? 'text-[13px]' : 'text-[15px]',
              prefs.size === size ? 'bg-accent text-white' : 'text-[#8a8175] hover:text-ink',
            ].join(' ')}
          >
            A
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => onChange({ ...prefs, justified: !prefs.justified })}
        aria-pressed={prefs.justified}
        title={prefs.justified ? 'Ragged right edge' : 'Justify both edges'}
        className={[
          'rounded-md border border-paper-edge px-2 py-1.5 transition-colors',
          prefs.justified ? 'bg-accent text-white' : 'bg-white/70 text-[#8a8175] hover:text-ink',
        ].join(' ')}
      >
        <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden>
          <g fill="currentColor">
            <rect x="1" y="2" width="14" height="1.6" rx="0.8" />
            <rect x="1" y="6" width="14" height="1.6" rx="0.8" />
            <rect x="1" y="10" width="14" height="1.6" rx="0.8" />
            <rect x="1" y="14" width={prefs.justified ? 14 : 8} height="1.6" rx="0.8" />
          </g>
        </svg>
      </button>

      <button
        type="button"
        onClick={() => onChange({ ...prefs, indent: !prefs.indent })}
        aria-pressed={prefs.indent}
        title={prefs.indent ? 'Space between paragraphs' : 'Indent paragraphs (book style)'}
        className={[
          'rounded-md border border-paper-edge px-2 py-1.5 font-serif text-[11px] leading-none transition-colors',
          prefs.indent ? 'bg-accent text-white' : 'bg-white/70 text-[#8a8175] hover:text-ink',
        ].join(' ')}
      >
        ¶
      </button>
    </div>
  );
}
