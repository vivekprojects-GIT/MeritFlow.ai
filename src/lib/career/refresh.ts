import { analyseAll } from './github/analyze';
import { fetchProfile, GitHubError, usernameFrom } from './github/client';
import { buildAll, DEFAULT_VARIANTS, type PortfolioInput, type Variant } from './portfolio/build';
import { getCareerIdentity } from './identity';
import { getCareerLinks, getSnapshot, savePortfolios, saveSnapshot } from './store';

/**
 * Read GitHub, then rebuild the portfolio from what came back.
 *
 * One entry point, because the two halves must not drift: a portfolio built
 * from a snapshot taken before the candidate made a repository private would
 * keep publishing it. Refreshing always re-runs the privacy gate against
 * whatever GitHub says *now*.
 */

/** How long a snapshot is good for. Repositories do not change by the minute. */
const SNAPSHOT_TTL_MS = 6 * 60 * 60 * 1000;

export type RefreshResult = {
  username: string;
  /** Repositories read, in ranked order, including the ones held back. */
  total: number;
  published: number;
  /** Why each held-back repository was held back, for the candidate to read. */
  withheld: { name: string; kind: string; reason: string }[];
  variants: { slug: string; title: string; projects: number }[];
  fetchedAt: number;
  /** Set when GitHub could not be read. Any previous portfolio is left alone. */
  error: string;
};

export async function refreshGitHub(userId: string, options: { force?: boolean } = {}): Promise<RefreshResult> {
  const links = await getCareerLinks(userId);
  const username = usernameFrom(links.github);

  if (!username) {
    return {
      username: '',
      total: 0,
      published: 0,
      withheld: [],
      variants: [],
      fetchedAt: 0,
      error: 'Connect a GitHub account first.',
    };
  }

  const existing = await getSnapshot(userId);
  const fresh = existing && existing.username === username && Date.now() - existing.fetchedAt < SNAPSHOT_TTL_MS;
  if (fresh && !options.force) return summarise(existing.username, existing.repos, existing.fetchedAt, '', []);

  let analysed;
  try {
    const raw = await fetchProfile(username);
    analysed = analyseAll(raw, username);
  } catch (err) {
    const message =
      err instanceof GitHubError ? err.message : err instanceof Error ? err.message : 'GitHub could not be read.';
    /* The previous snapshot survives a failed read. A rate limit should not
       empty somebody's portfolio. */
    await saveSnapshot(userId, { username, repos: existing?.repos ?? [], error: message });
    return summarise(username, existing?.repos ?? [], existing?.fetchedAt ?? 0, message, []);
  }

  await saveSnapshot(userId, { username, repos: analysed });
  const built = await rebuildPortfolio(userId);
  return summarise(username, analysed, Date.now(), '', built);
}

/**
 * Rebuild the portfolio pages from the stored snapshot and résumé.
 *
 * Separate from the GitHub read so editing a résumé summary does not cost an
 * API call, and so a rate-limited refresh still regenerates from what is
 * already known.
 */
export async function rebuildPortfolio(
  userId: string,
  variants: Variant[] = DEFAULT_VARIANTS,
): Promise<{ slug: string; title: string; projects: number }[]> {
  const identity = await getCareerIdentity(userId);
  if (identity.github.publishable.length === 0) {
    /* Nothing to show. Clearing rather than leaving the old pages up: a
       portfolio still listing a repository the candidate has since made
       private is exactly the failure the gate exists to prevent. */
    await savePortfolios(userId, []);
    return [];
  }

  const input: PortfolioInput = {
    identity: {
      name: identity.name,
      headline: identity.headline,
      location: identity.location,
      email: identity.email,
      linkedin: identity.links.linkedin,
      github: identity.links.github,
      /* The candidate's own site, only when it is not this page. */
      website: identity.links.website === identity.links.portfolio ? '' : identity.links.website,
    },
    summary: identity.summary,
    experience: (identity.resume?.experience ?? []).map((e) => ({
      company: e.company,
      title: e.title,
      start: e.start,
      end: e.end,
      bullets: e.bullets,
    })),
    repos: identity.github.publishable,
  };

  const built = buildAll(input, variants);
  await savePortfolios(userId, built);
  return built.map((b) => ({ slug: b.slug, title: b.title, projects: b.projectIds.length }));
}

function summarise(
  username: string,
  repos: Awaited<ReturnType<typeof analyseAll>>,
  fetchedAt: number,
  error: string,
  variants: { slug: string; title: string; projects: number }[],
): RefreshResult {
  return {
    username,
    total: repos.length,
    published: repos.filter((r) => r.publish.allowed).length,
    withheld: repos
      .filter((r) => !r.publish.allowed)
      .map((r) => ({ name: r.name, kind: r.publish.kind, reason: r.publish.reason })),
    variants,
    fetchedAt,
    error,
  };
}
