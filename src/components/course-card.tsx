'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';

/**
 * A course row: cover photo on the left, title and vital statistics in the
 * middle, the primary action on the right.
 *
 * The cover is a real photo when one was found, and a generated gradient
 * otherwise — composed deterministically from the title so a course always
 * looks the same. A photo that fails to load falls back to the gradient rather
 * than leaving a hole.
 */

const COVER_PALETTES: Array<[string, string, string]> = [
  ['#1e3a8a', '#4f46e5', '#0ea5e9'],
  ['#134e4a', '#0d9488', '#22d3ee'],
  ['#7c2d12', '#d97706', '#fbbf24'],
  ['#4c1d95', '#7c3aed', '#c084fc'],
  ['#831843', '#db2777', '#fb7185'],
  ['#064e3b', '#059669', '#6ee7b7'],
];

function hash(value: string): number {
  let out = 7;
  for (let i = 0; i < value.length; i += 1) out = (out * 31 + value.charCodeAt(i)) % 2147483647;
  return out;
}

function initials(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'C';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function CourseCover({ title, coverUrl, className = '' }: { title: string; coverUrl?: string | null; className?: string }) {
  const [failed, setFailed] = useState(false);
  const [a, b, c] = COVER_PALETTES[hash(title) % COVER_PALETTES.length];
  const showPhoto = Boolean(coverUrl) && !failed;

  return (
    <div
      className={['relative overflow-hidden bg-elevated', className].join(' ')}
      style={
        {
          backgroundImage: `radial-gradient(120% 120% at 15% 15%, ${c}, transparent 55%), linear-gradient(140deg, ${a}, ${b})`,
        } as CSSProperties
      }
    >
      {showPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote covers come from arbitrary hosts, so next/image's loader config can't cover them
        <img
          src={coverUrl as string}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center font-serif text-3xl font-semibold text-white/85">
          {initials(title)}
        </span>
      )}
    </div>
  );
}

export function CourseStat({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-canvas text-muted">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-faint">{label}</span>
        <span className="block truncate text-[13px] font-semibold text-ink">{value}</span>
      </span>
    </div>
  );
}
