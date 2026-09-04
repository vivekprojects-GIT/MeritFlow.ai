/**
 * Load `.env.local`, the way Next.js does for the app.
 *
 * Without this a script runs with a different configuration from the server it
 * is meant to mirror — which produced a run reporting "automatic submission is
 * not enabled for greenhouse" while the app had it enabled all along. A script
 * that silently disagrees with the app about a safety gate is worse than one
 * that cannot run.
 */
import { readFileSync } from 'node:fs';

export function loadEnv(file = '.env.local'): void {
  let text = '';
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return;
  }

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    /* A value already in the environment wins, so an explicit prefix on the
       command line still overrides the file. */
    if (process.env[key] !== undefined) continue;
    process.env[key] = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
  }
}
