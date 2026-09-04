'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Renders a model-generated visual document safely.
 *
 * Used by the assistant chat — the model writes real HTML/CSS/JS, and this is
 * the only place it is ever put on screen. Containment, in order of importance:
 *
 *  1. `sandbox="allow-scripts"` WITHOUT `allow-same-origin` — the frame runs on
 *     an opaque origin and cannot touch this page's DOM, cookies or storage.
 *     These two flags must never appear together; that combination would let
 *     the frame remove its own sandbox.
 *  2. The document carries `default-src 'none'` (see lib/visual-baseline.ts),
 *     so the generated code has no network access at all.
 *  3. The code itself is never displayed, and neither is the frame chrome.
 *
 * Nothing is shown until the frame reports that it actually painted: an error,
 * an empty body, or a timeout all render nothing rather than a broken box.
 */

const RENDER_TIMEOUT_MS = 6000;

export function SandboxedVisual({ document: doc }: { document: string }) {
  const [phase, setPhase] = useState<'pending' | 'ready' | 'failed'>('pending');
  const [height, setHeight] = useState(280);
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      /* The frame is on an opaque origin, so origin checks are meaningless —
         identify it by window instead. */
      if (!frameRef.current || event.source !== frameRef.current.contentWindow) return;
      const payload = event.data as { __visual?: boolean; ok?: boolean; height?: number } | null;
      if (!payload || payload.__visual !== true) return;

      if (payload.ok) {
        if (typeof payload.height === 'number') setHeight(Math.min(560, Math.max(140, payload.height)));
        setPhase('ready');
      } else {
        setPhase('failed');
      }
    }

    window.addEventListener('message', onMessage);
    const timer = setTimeout(() => setPhase((p) => (p === 'pending' ? 'failed' : p)), RENDER_TIMEOUT_MS);
    return () => {
      window.removeEventListener('message', onMessage);
      clearTimeout(timer);
    };
  }, [doc]);

  /* A visual that didn't render is simply absent — never a broken placeholder. */
  if (phase === 'failed') return null;

  return (
    <div className="relative overflow-hidden rounded-xl border border-line bg-white">
      <iframe
        ref={frameRef}
        title="Generated visual"
        /* allow-scripts only. Adding allow-same-origin would let the frame reach
           into this page, do not add it. */
        sandbox="allow-scripts"
        srcDoc={doc}
        scrolling="no"
        style={{ height, border: 'none' }}
        className={['w-full transition-opacity duration-300', phase === 'ready' ? 'opacity-100' : 'opacity-0'].join(' ')}
      />
    </div>
  );
}
