'use client';

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

/**
 * State backed by localStorage, safe under SSR.
 *
 * Renders `initial` on the server and on the first client paint, then adopts
 * the stored value once hydration is done — so the markup always matches — and
 * writes back only after the caller actually changes something.
 */
export function usePersisted<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(initial);
  const dirty = useRef(false);

  useEffect(() => {
    const stored = readJson<T>(key);
    if (stored === null) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from localStorage, an external store React can't read during render
    setValue(stored);
  }, [key]);

  useEffect(() => {
    if (dirty.current) writeJson(key, value);
  }, [key, value]);

  const update = useCallback<Dispatch<SetStateAction<T>>>((action) => {
    dirty.current = true;
    setValue(action);
  }, []);

  return [value, update];
}

export function readJson<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage disabled or full — progress just won't persist */
  }
}
