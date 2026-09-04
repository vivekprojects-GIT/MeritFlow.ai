'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * A view selection that survives a page refresh.
 *
 * ## What was wrong
 *
 * The top-level navigation already wrote itself to the hash — `#jobs` — but
 * every tab inside it kept its selection in React state alone. So refreshing
 * while reading Settings → Answer book put you back on Matches, and the deeper
 * you were the more you lost, which is exactly backwards.
 *
 * ## The whole path, not just the first segment
 *
 * The hash carries a path: `#jobs/settings/answer-book`. Each level claims one
 * segment by its depth, so a nested view is restored without any level knowing
 * about the others — and a link to a specific screen is now just a URL, which
 * it was not before.
 *
 * ## Why this subscribes rather than holding state
 *
 * The URL is an external store: the browser owns it, and it changes from the
 * back button and from other components as well as from here. Mirroring it into
 * `useState` meant reading `window` during the first client render — which the
 * server cannot do, so the two disagreed and React discarded the subtree — or
 * correcting it in an effect, which is a second render every mount.
 * `useSyncExternalStore` exists for exactly this shape and has a server
 * snapshot built in.
 */

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  window.addEventListener('popstate', onChange);
  return () => {
    window.removeEventListener('hashchange', onChange);
    window.removeEventListener('popstate', onChange);
  };
}

function segmentAt(depth: number): string {
  if (typeof window === 'undefined') return '';
  return window.location.hash.replace(/^#\/?/, '').split('/')[depth] ?? '';
}

export function useHashView<T extends string>(
  depth: number,
  allowed: readonly T[],
  fallback: T,
): [T, (next: T) => void] {
  /*
   * Returns a plain string, so repeated calls with an unchanged URL are
   * reference-equal — a fresh object here would make React re-render forever.
   */
  const snapshot = useCallback(() => segmentAt(depth), [depth]);
  const server = useCallback(() => '', []);

  const raw = useSyncExternalStore(subscribe, snapshot, server);
  const view = (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;

  const select = useCallback(
    (next: T) => {
      const parts = window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
      while (parts.length < depth) parts.push('');
      parts[depth] = next;
      /* Anything below this level is about to be wrong: choosing a different
         tab cannot keep the previous tab's sub-selection. */
      parts.length = depth + 1;

      const url = new URL(window.location.href);
      url.hash = parts.join('/');

      /*
       * Replace rather than push. Switching a tab is not somewhere you
       * navigated to, and filling the history with tab changes makes Back stop
       * meaning "the page I came from".
       *
       * `replaceState` fires no event, so the subscription is nudged by hand —
       * otherwise the component would not learn about its own change.
       */
      window.history.replaceState(null, '', url.toString());
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    },
    [depth],
  );

  return [view, select];
}
