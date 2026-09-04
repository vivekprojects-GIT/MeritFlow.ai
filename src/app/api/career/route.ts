import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { isLearner } from '../jobs/route';
import { getCareerIdentity, identityGaps } from '@/lib/career/identity';
import { getCareerLinks, listPortfolios, saveCareerLinks } from '@/lib/career/store';
import { usernameFrom } from '@/lib/career/github/client';
import { refreshGitHub } from '@/lib/career/refresh';
import { publishPlan, pagesWorkflow } from '@/lib/career/portfolio/publish';
import { checkRate, rateLimited } from '@/lib/rate-limit';

export const runtime = 'nodejs';

/**
 * The career identity, and everything derived from it.
 *
 * One endpoint rather than four, because the screen shows one thing: who this
 * candidate is across every surface. Splitting it would mean the page could
 * render an identity and a portfolio that disagree.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isLearner(user.role)) return NextResponse.json({ error: 'Not available for this account type.' }, { status: 403 });

  const identity = await getCareerIdentity(user.id);
  const portfolios = await listPortfolios(user.id);

  return NextResponse.json({
    identity: {
      name: identity.name,
      headline: identity.headline,
      email: identity.email,
      phone: identity.phone,
      location: identity.location,
      links: identity.links,
      summary: identity.summary,
      targetRoles: identity.targetRoles,
      skills: identity.skills,
      hasResume: Boolean(identity.resume),
    },
    gaps: identityGaps(identity),
    github: {
      username: identity.github.username,
      fetchedAt: identity.github.fetchedAt,
      error: identity.github.error,
      total: identity.github.repos.length,
      /* Both halves, deliberately. A list that silently omits repositories
         teaches the candidate nothing; one that says why each was held back
         tells them what to fix. */
      published: identity.github.publishable.map((r) => ({
        name: r.name,
        title: r.title,
        url: r.url,
        demoUrl: r.demoUrl,
        description: r.description,
        tech: r.tech,
        signals: r.signals,
        stars: r.stars,
        score: r.score,
        readme: { score: r.readme.score, suggestions: r.readme.suggestions },
      })),
      withheld: identity.github.repos
        .filter((r) => !r.publish.allowed)
        .map((r) => ({ name: r.name, kind: r.publish.kind, reason: r.publish.reason })),
    },
    portfolios: portfolios.map((p) => ({
      slug: p.slug,
      title: p.title,
      projects: p.projectIds.length,
      updatedAt: p.updatedAt,
    })),
    /* Present only once there is something to publish. */
    publish:
      portfolios.length > 0 && identity.github.username
        ? {
            ...publishPlan(identity.github.username, portfolios),
            /* The file list is metadata here; the contents are served by the
               download route so this response stays small. */
            files: publishPlan(identity.github.username, portfolios).files.map((f) => f.path),
            workflow: pagesWorkflow().path,
          }
        : null,
  });
}

/**
 * Connect an account, or record where the portfolio was published.
 *
 * `portfolio` is written from what the candidate pastes, never from a build —
 * this product does not publish anything, so it cannot know the URL until they
 * tell it.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isLearner(user.role)) return NextResponse.json({ error: 'Not available for this account type.' }, { status: 403 });

  const rate = checkRate(user.id, 'write');
  if (!rate.allowed) return rateLimited(rate);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Expected JSON.' }, { status: 400 });
  }

  const patch: Parameters<typeof saveCareerLinks>[1] = {};

  if (typeof body.github === 'string') {
    const username = usernameFrom(body.github);
    /* Rejected here rather than at fetch time: a 404 from GitHub reads to the
       candidate as "your account is broken" when they simply pasted a company
       page. Clearing the field is always allowed. */
    if (body.github.trim() && !username) {
      return NextResponse.json({ error: 'That does not look like a GitHub username or profile URL.' }, { status: 400 });
    }
    patch.github = username ? `https://github.com/${username}` : '';
  }

  if (typeof body.linkedin === 'string') patch.linkedin = body.linkedin;
  if (typeof body.portfolio === 'string') patch.portfolio = body.portfolio;

  const links = await saveCareerLinks(user.id, patch);
  return NextResponse.json({ links });
}

/** Re-read GitHub and rebuild the portfolio. */
export async function PUT() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isLearner(user.role)) return NextResponse.json({ error: 'Not available for this account type.' }, { status: 403 });

  /* Its own bucket, not the generic write one: each call is up to twenty-five
     requests against an upstream limit that is shared across all users. */
  const rate = checkRate(user.id, 'github');
  if (!rate.allowed) return rateLimited(rate);

  const links = await getCareerLinks(user.id);
  if (!usernameFrom(links.github)) {
    return NextResponse.json({ error: 'Connect a GitHub account first.' }, { status: 400 });
  }

  return NextResponse.json(await refreshGitHub(user.id, { force: true }));
}
