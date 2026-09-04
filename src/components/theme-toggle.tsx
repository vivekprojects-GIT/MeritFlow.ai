'use client';

import { useEffect, useSyncExternalStore } from 'react';

type Theme = 'light' | 'dark' | 'system';
const KEY = 'meritflow:theme';

/**
 * The stored preference, as an external store.
 *
 * localStorage is exactly the "external system" `useSyncExternalStore` exists
 * for. Reading it in an effect and calling setState would work, but it triggers
 * a second render on every mount and trips React's cascading-render rule; this
 * reads it during render instead, with a server snapshot that keeps hydration
 * consistent.
 */
let listeners: (() => void)[] = [];

function subscribe(cb: () => void): () => void {
  listeners.push(cb);
  /* Another tab changing the theme should move this one too. */
  window.addEventListener('storage', cb);
  return () => {
    listeners = listeners.filter((l) => l !== cb);
    window.removeEventListener('storage', cb);
  };
}

/* Returns a primitive, so repeated calls are referentially stable and React
   does not see a changed snapshot on every render. */
function getSnapshot(): Theme {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === 'dark' || v === 'light' ? v : 'system';
  } catch {
    return 'system';
  }
}

/* The server cannot know the preference, so it renders the neutral case and
   the inline ThemeScript prevents the flash. */
const getServerSnapshot = (): Theme => 'system';

function setTheme(next: Theme): void {
  try {
    if (next === 'system') window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, next);
  } catch {
    /* private mode — the toggle still works for this session */
  }
  for (const l of [...listeners]) l();
}

/**
 * Theme control.
 *
 * Three states, not two. "System" is the honest default — the OS already knows
 * whether the reader is in a dark room, and a two-way toggle silently overrides
 * that the first time it is touched. The stored value is only written when the
 * reader makes an explicit choice.
 */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  /* Pushing React's state out to the document — the legitimate use of an
     effect, as opposed to pulling state in. */
  useEffect(() => {
    const root = document.documentElement;
    /* Removing the attribute hands control back to the media query rather than
       freezing whichever mode happened to be active. */
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
  }, [theme]);

  const options: { value: Theme; label: string; icon: string }[] = [
    { value: 'light', label: 'Light', icon: '☀' },
    { value: 'system', label: 'System', icon: '◐' },
    { value: 'dark', label: 'Dark', icon: '☾' },
  ];

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={`inline-flex items-center gap-0.5 rounded-full border border-line bg-canvas p-0.5 ${className}`}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={theme === o.value}
          title={o.label}
          onClick={() => setTheme(o.value)}
          className={`rounded-full px-2 py-1 text-xs transition ${
            theme === o.value ? 'bg-accent/12 font-semibold text-accent' : 'text-muted hover:text-ink'
          }`}
        >
          <span aria-hidden>{o.icon}</span>
          <span className="sr-only">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Applies the stored theme before first paint.
 *
 * Without this the page renders light, then snaps to dark once React hydrates —
 * a white flash straight into the eyes of the person who chose dark mode. It
 * has to be inline and synchronous in <head> to beat the first paint.
 */
export function ThemeScript() {
  const js = `try{var t=localStorage.getItem('${KEY}');if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t)}catch(e){}`;
  /* A plain inline <script> in <head>, deliberately, not `next/script`.
     `beforeInteractive` is documented as not blocking hydration, but the bar
     here is higher than hydration, it is first *paint*, and only an inline
     head script parsed synchronously clears it. React 19 logs a dev-only note
     that scripts in components do not re-execute on client navigation; that is
     the desired behaviour, since the attribute is already set by then. */
  return <script dangerouslySetInnerHTML={{ __html: js }} suppressHydrationWarning />;
}
