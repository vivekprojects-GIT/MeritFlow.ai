'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * The candidate's pipeline, rendered on the GPU.
 *
 * ## Why WebGL for a dashboard chart
 *
 * Not for throughput — thirty bars would render anywhere — but for the
 * quality of motion and light. The bars grow in with a per-bar staggered
 * ease and carry a vertical glow gradient computed in the fragment shader,
 * the kind of finish canvas 2D approximates and a GPU just does. The whole
 * thing is raw WebGL: one program, one quad geometry, per-bar uniforms.
 * No engine, because an engine's first job is managing scenes this chart
 * does not have.
 *
 * ## What is drawn
 *
 * Left: applications per day for the last 30 days, sent stacked over
 * prepared. Right: the fit-score histogram, the accent marking the bins a
 * candidate actually applies from. Hover resolves per-bar through plain
 * hit-testing in JS — interactivity does not need to live on the GPU.
 *
 * ## Theming
 *
 * Colors are read from the CSS custom properties at mount and fed to the
 * shader as uniforms, so the chart follows light/dark with the rest of the
 * page.
 */

export type ActivityPoint = {
  /** Local day, epoch ms at midnight. */
  day: number;
  applied: number;
  prepared: number;
};

const VERT = `
attribute vec2 a_pos;               // unit quad, 0..1
uniform vec4 u_rect;                // x, y, w, h in clip space
varying vec2 v_uv;
void main() {
  v_uv = a_pos;
  vec2 p = u_rect.xy + a_pos * u_rect.zw;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

const FRAG = `
precision mediump float;
varying vec2 v_uv;
uniform vec3 u_color;
uniform float u_alpha;
uniform float u_glow;               // 0..1, how strongly the top glows
void main() {
  // A soft vertical gradient: brighter toward the top of the bar, with a
  // faint core highlight — the "lit from within" look.
  float lift = mix(0.75, 1.25, v_uv.y) ;
  float edge = smoothstep(0.0, 0.12, v_uv.x) * smoothstep(1.0, 0.88, v_uv.x);
  float glow = 1.0 + u_glow * 0.6 * smoothstep(0.6, 1.0, v_uv.y);
  vec3 c = u_color * lift * glow;
  gl_FragColor = vec4(c, u_alpha * (0.55 + 0.45 * edge));
}
`;

function cssVar(el: HTMLElement, name: string, fallback: string): string {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fallback;
}

/** #rrggbb (or #rgb) to normalized rgb. Anything unparseable becomes grey. */
function rgb(hex: string): [number, number, number] {
  const m = hex.replace('#', '').trim();
  const full = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
  const n = parseInt(full.slice(0, 6), 16);
  if (Number.isNaN(n)) return [0.5, 0.5, 0.5];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

type Bar = { x: number; y: number; w: number; h: number; color: [number, number, number]; alpha: number; glow: number; delay: number; tip: string };

export function ActivityChart({ points, scores }: { points: ActivityPoint[]; scores: number[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const barsRef = useRef<Bar[]>([]);
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;

    const gl = canvas.getContext('webgl', { alpha: true, antialias: true });
    if (!gl) return; // No WebGL: the labels below still tell the story.

    /* ── program setup ─────────────────────────────────────────────── */
    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      return sh;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uRect = gl.getUniformLocation(prog, 'u_rect');
    const uColor = gl.getUniformLocation(prog, 'u_color');
    const uAlpha = gl.getUniformLocation(prog, 'u_alpha');
    const uGlow = gl.getUniformLocation(prog, 'u_glow');

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const accent = rgb(cssVar(canvas, '--color-accent', '#2f6b4f'));
    const mutedC = rgb(cssVar(canvas, '--color-muted', '#8a8a85'));

    /* ── layout: bar geometry in unit space ────────────────────────── */
    const H = 200;
    const layout = () => {
      const w = parent.clientWidth;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${H}px`;
      gl.viewport(0, 0, canvas.width, canvas.height);

      const bars: Bar[] = [];
      const days = points.slice(-30);
      const leftW = 0.6;
      const maxY = Math.max(1, ...days.map((p) => p.applied + p.prepared));
      const slot = leftW / Math.max(days.length, 1);
      const bw = slot * 0.66;

      days.forEach((p, i) => {
        const x = 0.015 + i * slot;
        const hs = (p.applied / maxY) * 0.78;
        const hp = (p.prepared / maxY) * 0.78;
        const when = new Date(p.day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        if (hp > 0)
          bars.push({ x, y: 0.12, w: bw, h: hp, color: mutedC, alpha: 0.4, glow: 0, delay: i * 0.018, tip: `${when} · ${p.prepared} prepared` });
        if (hs > 0)
          bars.push({ x, y: 0.12 + hp, w: bw, h: hs, color: accent, alpha: 0.95, glow: 1, delay: i * 0.018, tip: `${when} · ${p.applied} sent` });
      });

      /* histogram: 10 bins, horizontal, right side */
      const bins = new Array<number>(10).fill(0);
      for (const s of scores) bins[Math.min(9, Math.max(0, Math.floor(s / 10)))] += 1;
      const maxBin = Math.max(...bins, 1);
      const hx = leftW + 0.07;
      const bh = 0.78 / 10;
      bins.forEach((n, i) => {
        if (n === 0) return;
        const len = (n / maxBin) * (1 - hx - 0.03);
        const strong = i >= 7;
        bars.push({
          x: hx,
          y: 0.12 + i * bh,
          w: len,
          h: bh * 0.7,
          color: strong ? accent : mutedC,
          alpha: strong ? 0.95 : 0.45,
          glow: strong ? 1 : 0,
          delay: 0.3 + i * 0.03,
          tip: `${n} posting${n === 1 ? '' : 's'} scoring ${i * 10}–${i * 10 + 9}%`,
        });
      });

      barsRef.current = bars;
    };

    /* ── animated draw ─────────────────────────────────────────────── */
    let raf = 0;
    const started = performance.now();
    const draw = () => {
      const t = (performance.now() - started) / 900;
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      let settled = true;
      for (const b of barsRef.current) {
        const k = ease(t - b.delay);
        if (k < 1) settled = false;
        gl.uniform4f(uRect, b.x, b.y, b.w, b.h * k);
        gl.uniform3f(uColor, b.color[0], b.color[1], b.color[2]);
        gl.uniform1f(uAlpha, b.alpha);
        gl.uniform1f(uGlow, b.glow * k);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      if (!settled) raf = requestAnimationFrame(draw);
    };

    layout();
    draw();
    const ro = new ResizeObserver(() => {
      layout();
      cancelAnimationFrame(raf);
      draw();
    });
    ro.observe(parent);

    /* Hover: hit-test in JS; the GPU does not need to know. */
    const onMove = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      const ux = (e.clientX - r.left) / r.width;
      const uy = 1 - (e.clientY - r.top) / r.height;
      const hit = [...barsRef.current].reverse().find((b) => ux >= b.x && ux <= b.x + b.w && uy >= b.y && uy <= b.y + b.h);
      setTip(hit ? { x: e.clientX - r.left, y: e.clientY - r.top, text: hit.tip } : null);
    };
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', () => setTip(null));

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('mousemove', onMove);
    };
  }, [points, scores]);

  const first = points[0] ? new Date(points[0].day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
  const last = points.length ? new Date(points[points.length - 1].day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';

  return (
    <div className="relative w-full">
      <canvas ref={canvasRef} role="img" aria-label="Applications per day and fit score distribution" />
      {tip && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-ink px-2.5 py-1 text-[11px] font-medium text-canvas shadow-lg"
          style={{ left: tip.x, top: tip.y - 8 }}
        >
          {tip.text}
        </div>
      )}
      <div className="mt-1 flex justify-between text-[10px] text-faint">
        <span>{first}</span>
        <span className="mr-[38%]">{last}</span>
        <span>fit distribution →</span>
      </div>
    </div>
  );
}
