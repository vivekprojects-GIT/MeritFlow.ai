import type { GitHubRepo } from './types';
import type { RepoInput } from './analyze';

/**
 * Reading a candidate's GitHub.
 *
 * ## Why there is no OAuth here
 *
 * The privacy gate refuses to publish a private repository under any
 * circumstances, so the product never needs permission to read one. That turns
 * what looked like an OAuth integration into an unauthenticated read of public
 * data, which removes a token to store, a scope to justify, a consent screen to
 * design, and an entire class of "we had access to your private code" problem.
 *
 * A `GITHUB_TOKEN` may still be set by the operator. It buys rate limit —
 * 5,000 requests an hour instead of 60 — and nothing else. It is never a user's
 * token and it never grants access to anything the anonymous read could not
 * see, because a token that could would let the product read code it has no
 * business reading.
 *
 * ## Budget
 *
 * A candidate with sixty repositories would otherwise cost sixty README
 * requests plus sixty language requests, and exhaust an unauthenticated limit
 * on one rebuild. Only the most recently pushed handful get the full read; the
 * rest are analysed from their metadata, which is enough to list them.
 */

const API = 'https://api.github.com';

/** Most recently pushed repositories to read in full. */
const DEEP_READ = 12;

/** Repositories to consider at all. */
const MAX_REPOS = 60;

function headers(): Record<string, string> {
  const base: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    'user-agent': 'MeritFlow-Portfolio',
  };
  const token = process.env.GITHUB_TOKEN?.trim();
  if (token) base.authorization = `Bearer ${token}`;
  return base;
}

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'GitHubError';
  }
}

async function get(path: string, accept?: string): Promise<Response> {
  const res = await fetch(`${API}${path}`, {
    headers: accept ? { ...headers(), accept } : headers(),
    /* The portfolio is rebuilt on demand, not on every page load, and a stale
       repository list is worse than a slow one. */
    cache: 'no-store',
  });

  if (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0') {
    const reset = Number(res.headers.get('x-ratelimit-reset') ?? 0) * 1000;
    const mins = reset ? Math.max(1, Math.ceil((reset - Date.now()) / 60_000)) : 60;
    throw new GitHubError(`GitHub's rate limit is exhausted. It resets in about ${mins} minutes.`, 403);
  }
  return res;
}

/** A GitHub username out of whatever the candidate pasted. */
export function usernameFrom(input: string): string {
  const value = input.trim();
  if (!value) return '';
  const fromUrl = value.match(/github\.com\/([A-Za-z0-9-]{1,39})/i)?.[1];
  const raw = fromUrl ?? value.replace(/^@/, '');
  /* GitHub's own rule: alphanumerics and single hyphens, 39 characters. A
     value that is not a username is rejected rather than sent, because the
     404 it would produce reads to the candidate as "your account is broken". */
  return /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/.test(raw) ? raw : '';
}

export async function fetchRepos(username: string): Promise<GitHubRepo[]> {
  const user = usernameFrom(username);
  if (!user) throw new GitHubError('That does not look like a GitHub username.', 400);

  const res = await get(`/users/${user}/repos?per_page=100&sort=pushed&type=owner`);
  if (res.status === 404) throw new GitHubError(`No GitHub account called ${user}.`, 404);
  if (!res.ok) throw new GitHubError(`GitHub returned ${res.status}.`, res.status);

  const raw = (await res.json()) as GitHubRepo[];
  return raw.slice(0, MAX_REPOS).map((r) => ({ ...r, topics: r.topics ?? [] }));
}

async function fetchLanguages(fullName: string): Promise<Record<string, number>> {
  const res = await get(`/repos/${fullName}/languages`);
  return res.ok ? ((await res.json()) as Record<string, number>) : {};
}

async function fetchReadme(fullName: string): Promise<string> {
  const res = await get(`/repos/${fullName}/readme`, 'application/vnd.github.raw');
  /* A repository with no README is the common case, not an error — and it is
     one of the things the quality report tells the candidate to fix. */
  if (!res.ok) return '';
  const text = await res.text();
  return text.slice(0, 40_000);
}

/**
 * Everything the analyser needs, for one candidate.
 *
 * Deep reads run in parallel but only for the recent handful; a failure on any
 * single repository degrades that repository rather than the whole portfolio,
 * because one archived project with a broken README should not cost someone
 * their entire page.
 */
export async function fetchProfile(username: string): Promise<RepoInput[]> {
  const repos = await fetchRepos(username);
  const deep = repos.slice(0, DEEP_READ);

  const enriched = await Promise.all(
    deep.map(async (repo) => {
      const [languages, readme] = await Promise.all([
        fetchLanguages(repo.full_name).catch(() => ({})),
        fetchReadme(repo.full_name).catch(() => ''),
      ]);
      return { repo, languages, readme };
    }),
  );

  const shallow = repos.slice(DEEP_READ).map((repo) => ({ repo }));
  return [...enriched, ...shallow];
}
