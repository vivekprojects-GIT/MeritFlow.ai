'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The hero visual: a 3D course stack and a 2D pipeline diagram.
 *
 * Built from CSS 3D transforms rather than WebGL. A three.js hero costs upwards
 * of half a megabyte of JavaScript before anything renders, on the one page
 * where time-to-first-paint decides whether a visitor stays. `perspective` plus
 * `transform-style: preserve-3d` gives real depth — the cards genuinely occupy
 * a Z axis and are composited on the GPU — for no bundle at all.
 *
 * The parallax follows the pointer rather than running on a timer, so the
 * motion is something the visitor causes instead of something that nags at
 * them, and it stops entirely when the pointer leaves or when the reader has
 * asked for reduced motion.
 */

const MODULES = [
  { n: '01', title: 'Foundations', lessons: 4, tint: 'var(--chart-1)' },
  { n: '02', title: 'Core concepts', lessons: 5, tint: 'var(--chart-2)' },
  { n: '03', title: 'Practice lab', lessons: 3, tint: 'var(--chart-4)' },
];

export function HeroVisual() {
  const ref = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  const onMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (reduced) return;
      const b = e.currentTarget.getBoundingClientRect();
      /* -1..1 from the centre, then damped: past about 12° the text on the
         cards starts to shear and becomes hard to read. */
      const px = (e.clientX - b.left) / b.width - 0.5;
      const py = (e.clientY - b.top) / b.height - 0.5;
      setTilt({ x: -py * 16, y: px * 20 });
    },
    [reduced],
  );

  return (
    <div className="relative w-full">
      <div
        ref={ref}
        onPointerMove={onMove}
        onPointerLeave={() => setTilt({ x: 0, y: 0 })}
        className="relative mx-auto w-full max-w-[30rem]"
        style={{ perspective: '1200px' }}
      >
        <div
          className="relative transition-transform duration-300 ease-out"
          style={{
            transformStyle: 'preserve-3d',
            transform: `rotateX(${8 + tilt.x}deg) rotateY(${-14 + tilt.y}deg)`,
          }}
        >
          {/* The generated course, as three cards standing apart in depth. */}
          {MODULES.map((m, i) => (
            <div
              key={m.n}
              className="rounded-2xl border border-line bg-canvas p-4 shadow-2xl"
              style={{
                transform: `translateZ(${i * 46}px) translateY(${i * -14}px) translateX(${i * 10}px)`,
                marginTop: i === 0 ? 0 : '-4.5rem',
                position: 'relative',
                zIndex: i,
              }}
            >
              <div className="flex items-center gap-3">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-black text-white"
                  style={{ background: m.tint }}
                >
                  {m.n}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink">{m.title}</p>
                  <p className="text-[11px] text-muted">{m.lessons} lessons · quiz · flashcards</p>
                </div>
              </div>
              {/* Suggested prose, not lorem text: bars read as "a written
                  lesson" without pretending to be words nobody wrote. */}
              <div className="mt-3 space-y-1.5" aria-hidden>
                <span className="block h-1.5 w-full rounded-full bg-elevated" />
                <span className="block h-1.5 w-[88%] rounded-full bg-elevated" />
                <span className="block h-1.5 w-[62%] rounded-full bg-elevated" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="sr-only">
        An illustration of a generated course: three modules. Foundations, Core concepts and Practice lab, each with
        lessons, a quiz and flashcards.
      </p>
    </div>
  );
}

/* ── 2D: what actually happens ───────────────────────────────────────────── */

const STAGES = [
  { label: 'Your document', sub: 'PDF, DOCX or a topic' },
  { label: 'Planned', sub: 'Outline and objectives' },
  { label: 'Written', sub: 'Lessons in parallel' },
  { label: 'Assessed', sub: 'Quizzes and an exam' },
];

/**
 * The pipeline, drawn.
 *
 * A landing page that says "AI-powered" tells a visitor nothing. This says what
 * the machine actually does with their file, in four steps, which is the thing
 * they are trying to find out before they sign up.
 */
export function PipelineDiagram() {
  return (
    <figure className="m-0">
      <svg viewBox="0 0 880 150" className="w-full" role="img" aria-label="How MeritFlow builds a course: your document is planned, written, then assessed">
        <defs>
          <linearGradient id="mf-flow" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--chart-1)" />
            <stop offset="50%" stopColor="var(--chart-4)" />
            <stop offset="100%" stopColor="var(--chart-2)" />
          </linearGradient>
          <marker id="mf-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--chart-axis)" />
          </marker>
        </defs>

        {/* The spine, drawn once beneath the nodes so the arrowheads land on
            the boxes rather than floating between them. */}
        <line x1="20" y1="62" x2="860" y2="62" stroke="url(#mf-flow)" strokeWidth="3" strokeLinecap="round" opacity="0.35" />

        {STAGES.map((s, i) => {
          const x = 20 + i * 220;
          return (
            <g key={s.label}>
              {i > 0 && (
                <line
                  x1={x - 40}
                  y1={62}
                  x2={x - 10}
                  y2={62}
                  stroke="var(--chart-axis)"
                  strokeWidth="1.5"
                  markerEnd="url(#mf-arrow)"
                />
              )}
              <rect x={x} y={30} width={180} height={64} rx={14} fill="var(--color-canvas)" stroke="var(--color-line)" strokeWidth="1.5" />
              <circle cx={x + 26} cy={62} r={9} fill={`var(--chart-${(i % 5) + 1})`} />
              <text x={x + 46} y={57} fontSize="14" fontWeight="700" fill="var(--color-ink)">
                {s.label}
              </text>
              <text x={x + 46} y={76} fontSize="11.5" fill="var(--color-muted)">
                {s.sub}
              </text>
            </g>
          );
        })}

        <text x="440" y="132" textAnchor="middle" fontSize="12" fill="var(--color-muted)">
          Modules are written in parallel, so a full course takes about ninety seconds, not an afternoon.
        </text>
      </svg>
    </figure>
  );
}
