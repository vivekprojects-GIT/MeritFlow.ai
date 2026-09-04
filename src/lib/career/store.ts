import { randomUUID } from 'node:crypto';
import { getDb } from '../db';
import type { AnalysedRepo } from './github/types';
import type { BuiltPortfolio } from './portfolio/build';

/**
 * Storage for the career-identity layer.
 *
 * Two things live here: the last GitHub read, and the generated portfolios.
 * Both are caches of something derivable, which is why neither is treated as
 * authoritative — a candidate's repositories are the truth, and everything
 * below can be thrown away and rebuilt.
 *
 * The one column that is *not* derived is `users.portfolio_url`. Nothing in
 * this product writes it: it is set when the candidate tells us where they
 * published, because the publishing is theirs to do.
 */

/* ── The links that make up a professional presence ──────────────────────── */

export type CareerLinks = {
  github: string;
  linkedin: string;
  /** Where the candidate published their portfolio. Empty until they say. */
  portfolio: string;
};

export async function getCareerLinks(userId: string): Promise<CareerLinks> {
  const db = await getDb();
  const res = await db.query<Record<string, unknown>>(
    'SELECT github_url, linkedin_url, portfolio_url FROM users WHERE id = $1',
    [userId],
  );
  const r = res.rows[0];
  return {
    github: String(r?.github_url ?? ''),
    linkedin: String(r?.linkedin_url ?? ''),
    portfolio: String(r?.portfolio_url ?? ''),
  };
}

export async function saveCareerLinks(userId: string, patch: Partial<CareerLinks>): Promise<CareerLinks> {
  const columns: Record<keyof CareerLinks, string> = {
    github: 'github_url',
    linkedin: 'linkedin_url',
    portfolio: 'portfolio_url',
  };

  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  for (const [key, column] of Object.entries(columns) as [keyof CareerLinks, string][]) {
    const value = patch[key];
    /* Only keys actually present are written. Spreading a partial over the
       existing row would blank the siblings the caller never mentioned — the
       same bug that once wiped job settings. */
    if (value === undefined) continue;
    sets.push(`${column} = $${i++}`);
    values.push(value.trim().slice(0, 300));
  }

  if (sets.length > 0) {
    const db = await getDb();
    values.push(userId);
    await db.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${i}`, values);
  }
  return getCareerLinks(userId);
}

/* ── The GitHub snapshot ─────────────────────────────────────────────────── */

export type GitHubSnapshot = {
  username: string;
  repos: AnalysedRepo[];
  fetchedAt: number;
  /** Non-empty when the last read failed. The previous repos are kept. */
  error: string;
};

export async function getSnapshot(userId: string): Promise<GitHubSnapshot | null> {
  const db = await getDb();
  const res = await db.query<Record<string, unknown>>('SELECT * FROM github_snapshots WHERE user_id = $1', [userId]);
  const r = res.rows[0];
  if (!r) return null;

  let repos: AnalysedRepo[] = [];
  try {
    repos = JSON.parse(String(r.repos || '[]')) as AnalysedRepo[];
  } catch {
    /* A snapshot that no longer parses is a cache miss, never an error: the
       repositories are still on GitHub and the next read rebuilds it. */
    repos = [];
  }

  return {
    username: String(r.username ?? ''),
    repos,
    fetchedAt: Number(r.fetched_at ?? 0),
    error: String(r.error ?? ''),
  };
}

export async function saveSnapshot(
  userId: string,
  snapshot: { username: string; repos: AnalysedRepo[]; error?: string },
): Promise<void> {
  const db = await getDb();
  await db.query(
    `INSERT INTO github_snapshots (user_id, username, repos, fetched_at, error)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (user_id) DO UPDATE SET
       username = EXCLUDED.username, repos = EXCLUDED.repos,
       fetched_at = EXCLUDED.fetched_at, error = EXCLUDED.error`,
    [userId, snapshot.username, JSON.stringify(snapshot.repos), Date.now(), snapshot.error ?? ''],
  );
}

/* ── Generated portfolios ────────────────────────────────────────────────── */

export type StoredPortfolio = BuiltPortfolio & { id: string; updatedAt: number };

export async function listPortfolios(userId: string): Promise<StoredPortfolio[]> {
  const db = await getDb();
  const res = await db.query<Record<string, unknown>>(
    'SELECT * FROM portfolios WHERE user_id = $1 ORDER BY slug',
    [userId],
  );
  return res.rows.map((r) => ({
    id: String(r.id),
    slug: String(r.slug ?? ''),
    title: String(r.title ?? ''),
    html: String(r.html ?? ''),
    projectIds: safeIds(String(r.projects ?? '')),
    updatedAt: Number(r.updated_at ?? 0),
  }));
}

function safeIds(raw: string): number[] {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed.filter((n): n is number => typeof n === 'number') : [];
  } catch {
    return [];
  }
}

/** Replace the stored set. A rebuild is all-or-nothing, so variants cannot drift apart. */
export async function savePortfolios(userId: string, built: BuiltPortfolio[]): Promise<void> {
  const db = await getDb();
  await db.query('DELETE FROM portfolios WHERE user_id = $1', [userId]);
  const now = Date.now();
  for (const page of built) {
    await db.query(
      `INSERT INTO portfolios (id, user_id, slug, title, html, projects, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [randomUUID(), userId, page.slug, page.title, page.html, JSON.stringify(page.projectIds), now],
    );
  }
}
