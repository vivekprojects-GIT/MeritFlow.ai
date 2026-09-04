'use client';

/**
 * The MeritFlow mark.
 *
 * Four bars, rising left to right, in a gradient from the pale mint of the
 * product's panels to its deepest green. Merit accumulating; the flow is the
 * climb.
 *
 * Drawn rather than embedded. The source lives in Canva, but a raster export
 * would carry a white field into dark mode, go soft at favicon size, and cost
 * ~30KB at every call site. This is the same design in the format the web
 * actually wants.
 *
 * Constraints it was drawn to, deliberately:
 *
 *  - **One shape repeated four times.** A mark that needs six shapes and four
 *    colours cannot survive a 16px favicon; this one is four rectangles.
 *  - **Built on a 24-unit grid.** Bars are 3 wide with 2 between them, so the
 *    whole mark spans 18 units centred in 24 — every edge lands on a whole or
 *    half unit and stays crisp at 16, 24, 32 and 64px.
 *  - **Fully rounded caps.** `rx` is exactly half the bar width, so the ends
 *    are true semicircles at any size rather than the squashed corners you get
 *    from an arbitrary radius.
 *  - **Legible in one colour.** The gradient is an enhancement, never load
 *    bearing: `tone="mono"` renders the same mark in `currentColor` for
 *    favicons, print, and forced-colours mode.
 */

/** x, y, height. Bottom is 20.5 for all four; only the top changes. */
const BARS: [number, number, number][] = [
  [3, 15.5, 5],
  [8, 12, 8.5],
  [13, 8, 12.5],
  [18, 3.5, 17],
];

const BAR_W = 3;
const BAR_R = BAR_W / 2;

function Bars({ fill }: { fill: string }) {
  return (
    <>
      {BARS.map(([x, y, h]) => (
        <rect key={x} x={x} y={y} width={BAR_W} height={h} rx={BAR_R} fill={fill} />
      ))}
    </>
  );
}

/**
 * The gradient runs across the mark rather than along each bar, so the ramp
 * from soft to deep green is read as one movement instead of four.
 *
 * The far stop is `--color-accent` rather than `--color-accent-strong`: in the
 * dark theme those two tokens resolve to the same colour, which would collapse
 * the gradient to flat exactly where the ramp is doing the most work.
 */
function Gradient({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={id} x1="3" y1="20.5" x2="21" y2="3.5" gradientUnits="userSpaceOnUse">
        <stop stopColor="var(--color-accent-2)" />
        <stop offset="1" stopColor="var(--color-accent)" />
      </linearGradient>
    </defs>
  );
}

export function Logo({
  size = 28,
  tone = 'brand',
  className = '',
}: {
  size?: number;
  /** `mono` inherits currentColor — for favicons, print, forced colours. */
  tone?: 'brand' | 'mono';
  className?: string;
}) {
  const gid = `mf-grad-${tone}`;
  const fill = tone === 'mono' ? 'currentColor' : `url(#${gid})`;

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} role="img" aria-label="MeritFlow">
      {tone === 'brand' && <Gradient id={gid} />}
      <Bars fill={fill} />
    </svg>
  );
}

/**
 * Class-sized variant of the mark.
 *
 * Existing call sites size the logo with utilities (`h-8 w-8`) rather than a
 * prop, so this fills its box — same geometry, sized by the parent.
 */
export function LogoMark({ className = '', tone = 'brand' }: { className?: string; tone?: 'brand' | 'mono' }) {
  const gid = `mf-mark-${tone}`;
  const fill = tone === 'mono' ? 'currentColor' : `url(#${gid})`;
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} role="img" aria-label="MeritFlow">
      {tone === 'brand' && <Gradient id={gid} />}
      <Bars fill={fill} />
    </svg>
  );
}

/** The full lockup: mark plus wordmark. */
export function Wordmark({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Logo size={size} />
      {/* Tight tracking and a single weight break, "Merit" carries the
          emphasis, "Flow" recedes, so the word has a shape rather than being
          an even wall of letters. */}
      <span className="font-semibold tracking-[-0.02em] text-ink" style={{ fontSize: size * 0.62, lineHeight: 1 }}>
        Merit<span className="font-normal text-muted">Flow</span>
      </span>
    </span>
  );
}

/**
 * The app icon: the mark on its brand field, at the platform's corner radius.
 *
 * A separate component because an app icon is not a scaled logo — it needs its
 * own optical padding, and the mark has to go white to hold against the field.
 */
export function AppIcon({ size = 40, className = '' }: { size?: number; className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center text-white ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.26,
        background: 'linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-strong) 100%)',
        boxShadow: 'var(--mf-shadow-sm)',
      }}
    >
      <Logo size={size * 0.62} tone="mono" />
    </span>
  );
}

/**
 * The loading mark.
 *
 * The bars rise in sequence rather than the whole logo spinning — a spinner
 * says "waiting", bars filling say "working", and this product is usually
 * doing something real. Each bar is offset by a tenth of a second so the
 * motion reads left to right, the same direction the mark itself climbs.
 *
 * Falls back to a static mark under reduced motion via the global rule in
 * globals.css.
 */
export function LogoSpinner({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <span className={className} role="status" aria-label="Loading">
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
        {BARS.map(([x, y, h], i) => (
          <rect
            key={x}
            x={x}
            y={y}
            width={BAR_W}
            height={h}
            rx={BAR_R}
            fill="var(--color-accent)"
            className="mf-bar"
            /* Origin is bottom-centre of the bar itself: `transform-box:
               fill-box` in globals.css resolves it against the rect's own box,
               so each bar grows upward from its own base regardless of where
               it sits in the viewBox. */
            style={{ transformOrigin: '50% 100%', animationDelay: `${i * 0.1}s` }}
          />
        ))}
      </svg>
    </span>
  );
}
