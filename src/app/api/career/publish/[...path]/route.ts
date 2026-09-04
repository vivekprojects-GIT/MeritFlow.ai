import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { listPortfolios } from '@/lib/career/store';
import { getCareerLinks } from '@/lib/career/store';
import { usernameFrom } from '@/lib/career/github/client';
import { pagesWorkflow, publishFiles } from '@/lib/career/portfolio/publish';

export const runtime = 'nodejs';

/**
 * Serve one file of the publishable site.
 *
 * The publish instructions tell the candidate to download these and commit
 * them, which was a promise the app did not keep — the API returned filenames
 * and nothing behind them.
 *
 * Files are generated in memory and matched against that generated list by
 * exact path. There is no filesystem read here at all, so the usual traversal
 * question does not arise: a path that is not one of the handful this build
 * produced simply matches nothing.
 */
export async function GET(_req: Request, context: { params: Promise<{ path: string[] }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { path } = await context.params;
  const wanted = (path ?? []).join('/');

  const [portfolios, links] = await Promise.all([listPortfolios(user.id), getCareerLinks(user.id)]);
  if (portfolios.length === 0) return NextResponse.json({ error: 'Nothing built yet.' }, { status: 404 });

  const available = [...publishFiles(portfolios), pagesWorkflow()];
  const file = available.find((f) => f.path === wanted);
  if (!file) return NextResponse.json({ error: 'No such file in this build.' }, { status: 404 });

  /* Downloaded, not rendered. The HTML is a document to commit, and serving it
     inline from this origin would run someone's portfolio inside the app's own
     session. */
  const username = usernameFrom(links.github) || 'portfolio';
  const filename = wanted.replace(/\//g, '-') || `${username}-site`;

  return new Response(file.contents, {
    headers: {
      'content-type': 'application/octet-stream',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}
