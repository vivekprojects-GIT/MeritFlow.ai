'use client';

import type { CSSProperties } from 'react';

/**
 * A radial mindmap of a lesson, built purely from its structure (title + section headings)
 * — no AI call, instant, works for every course. Clicking a branch scrolls to that section.
 */

/** Matches the practice-lab mind map so both maps read as one system. */
const PALETTE = ['#7c3aed', '#0891b2', '#d97706', '#db2777', '#0d9488', '#2563eb'];

function trunc(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
}

/** Split a short title into at most 2 balanced lines for the centre node. */
function twoLines(title: string, max = 16): string[] {
  const words = title.split(/\s+/);
  if (title.length <= max) return [title];
  const lines: string[] = ['', ''];
  let i = 0;
  for (const w of words) {
    if (i === 0 && (lines[0] + ' ' + w).trim().length > max && lines[0]) i = 1;
    lines[i] = (lines[i] + ' ' + w).trim();
  }
  return [lines[0], trunc(lines[1], max + 4)].filter(Boolean);
}

export function LessonMindmap({
  title,
  sections,
  variant = 'compact',
  onSelectSection,
}: {
  title: string;
  sections: { heading: string }[];
  variant?: 'compact' | 'full';
  onSelectSection?: (i: number) => void;
}) {
  const full = variant === 'full';
  const W = full ? 760 : 320;
  const H = full ? 520 : 300;
  const cx = W / 2;
  const cy = H / 2;
  const R = full ? 190 : 104;
  const pillW = full ? 168 : 116;
  const pillH = full ? 46 : 36;
  const labelChars = full ? 24 : 16;

  const n = Math.max(sections.length, 1);
  const centerTitle = twoLines(title, full ? 18 : 13);

  const nodes = sections.map((s, i) => {
    // Start at top, spread evenly around the circle.
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const x = cx + R * Math.cos(angle);
    const y = cy + R * Math.sin(angle);
    return { x, y, color: PALETTE[i % PALETTE.length], heading: s.heading };
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Mindmap of ${title}`}>
      {/* connectors, gently curved so the map reads organic, not mechanical */}
      {nodes.map((node, i) => {
        const midX = (cx + node.x) / 2 + (node.y - cy) * 0.14;
        const midY = (cy + node.y) / 2 - (node.x - cx) * 0.14;
        const length = Math.hypot(node.x - cx, node.y - cy) * 1.25;
        return (
          <path
            key={`l-${i}`}
            d={`M ${cx} ${cy} Q ${midX} ${midY} ${node.x} ${node.y}`}
            fill="none"
            stroke={node.color}
            strokeOpacity={0.5}
            strokeWidth={full ? 2.5 : 2}
            strokeLinecap="round"
            className="edge-draw"
            style={{ ['--len' as string]: length, ['--d' as string]: `${i * 90}ms` } as CSSProperties}
          />
        );
      })}

      {/* branch nodes */}
      {nodes.map((node, i) => (
        <g
          key={`n-${i}`}
          className={onSelectSection ? 'cursor-pointer transition-opacity hover:opacity-80' : ''}
          onClick={() => onSelectSection?.(i)}
        >
          <title>{node.heading}</title>
          <rect
            x={node.x - pillW / 2}
            y={node.y - pillH / 2}
            width={pillW}
            height={pillH}
            rx={pillH / 2}
            fill="#ffffff"
            stroke={node.color}
            strokeWidth={1.5}
          />
          <circle cx={node.x - pillW / 2 + 14} cy={node.y} r={5} fill={node.color} />
          <text
            x={node.x - pillW / 2 + 26}
            y={node.y}
            dominantBaseline="central"
            fontSize={full ? 13 : 10.5}
            fontWeight={600}
            fill="#211f1a"
          >
            {trunc(node.heading, labelChars)}
          </text>
        </g>
      ))}

      {/* centre node */}
      <g>
        <circle cx={cx} cy={cy} r={full ? 58 : 40} fill="url(#mm-grad)" />
        <circle cx={cx} cy={cy} r={full ? 58 : 40} fill="none" stroke="#ffffff" strokeOpacity={0.6} strokeWidth={2} />
        {centerTitle.map((line, i) => (
          <text
            key={i}
            x={cx}
            y={cy + (i - (centerTitle.length - 1) / 2) * (full ? 16 : 12)}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={full ? 13 : 10}
            fontWeight={700}
            fill="#ffffff"
          >
            {line}
          </text>
        ))}
      </g>

      <defs>
        <radialGradient id="mm-grad" cx="35%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#a78bfa" />
          <stop offset="55%" stopColor="#7c3aed" />
          <stop offset="100%" stopColor="#4c1d95" />
        </radialGradient>
      </defs>
    </svg>
  );
}
