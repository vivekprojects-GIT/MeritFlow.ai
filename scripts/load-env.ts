import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Put `.env.local` into `process.env` for a standalone script.
 *
 * Next.js loads this file for the app, and nothing loads it for a script run
 * through tsx. That difference is quiet and misleading: a lookup that needs an
 * API key does not fail, it returns "nothing found" — so a video backfill
 * reported 0 of 16 found in zero seconds and looked like a broken search
 * rather than an unread config file.
 *
 * Written by hand rather than with dotenv because the project does not depend
 * on dotenv, and a script helper is a poor reason to add one.
 *
 * Values already in the environment win, so a one-off override on the command
 * line still works.
 */
export function loadEnv(file = '.env.local'): void {
  let text: string;
  try {
    text = readFileSync(resolve(process.cwd(), file), 'utf8');
  } catch {
    return;
  }

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    const eq = line.indexOf('=');
    if (eq < 1) continue;

    const key = line.slice(0, eq).trim();
    /* Quotes are a shell convention for values with spaces, not part of the
       value — a key read with its quotes attached fails authentication in a
       way that looks like a wrong key. */
    const value = line
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, '');

    if (key && !(key in process.env)) process.env[key] = value;
  }
}
