'use client';

import { useMemo, type CSSProperties } from 'react';

/**
 * Shared reward primitives — a seeded confetti burst and a score ring.
 * Seeded so the first client render is deterministic (no hydration drift),
 * and reused by both the practice lab and the quiz/exam results.
 */

const CONFETTI_COLORS = ['#7c3aed', '#d97706', '#0d9488', '#e11d48', '#2563eb', '#059669'];

export function Confetti({ seed = 1, pieces = 44 }: { seed?: number; pieces?: number }) {
  const bits = useMemo(() => {
    const random = mulberry32(seed || 1);
    return Array.from({ length: pieces }, (_, index) => ({
      id: index,
      left: random() * 100,
      dx: (random() - 0.5) * 180,
      rot: 240 + random() * 720,
      delay: random() * 700,
      duration: 1500 + random() * 1200,
      color: CONFETTI_COLORS[Math.floor(random() * CONFETTI_COLORS.length)],
      width: 6 + random() * 6,
    }));
  }, [seed, pieces]);

  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden" aria-hidden>
      {bits.map((bit) => (
        <span
          key={bit.id}
          className="confetti-piece"
          style={
            {
              left: `${bit.left}%`,
              width: bit.width,
              background: bit.color,
              ['--dx']: `${bit.dx}px`,
              ['--rot']: `${bit.rot}deg`,
              ['--d']: `${bit.delay}ms`,
              ['--dur-c']: `${bit.duration}ms`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

export function ScoreRing({
  value,
  size = 76,
  stroke = 7,
  color = 'var(--color-accent)',
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  children?: React.ReactNode;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(Math.max(value, 0), 1);

  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          style={{ stroke: 'var(--color-line)' }}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
          style={{ stroke: color, transition: 'stroke-dashoffset 900ms cubic-bezier(0.22,0.68,0.18,1)' }}
        />
      </svg>
      {children && <span className="absolute inset-0 flex items-center justify-center">{children}</span>}
    </span>
  );
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
