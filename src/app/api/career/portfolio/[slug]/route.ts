import { getCurrentUser } from '@/lib/auth';
import { NextResponse } from 'next/server';
import { listPortfolios } from '@/lib/career/store';

export const runtime = 'nodejs';

/**
 * Serve one built portfolio page.
 *
 * Behind the session, and only ever the requesting user's own — this is a
 * preview of something not yet published, and the whole point of the design is
 * that nothing reaches the public web until the candidate puts it there.
 *
 * `overview` stands in for the canonical page, whose slug is the empty string
 * and which therefore has no routable path of its own.
 */
export async function GET(_req: Request, context: { params: Promise<{ slug: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { slug } = await context.params;
  const wanted = slug === 'overview' ? '' : slug;

  const page = (await listPortfolios(user.id)).find((p) => p.slug === wanted);
  if (!page) return NextResponse.json({ error: 'No such portfolio page.' }, { status: 404 });

  return new Response(page.html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      /* A preview of unpublished work about a specific person: never cached by
         anything between here and their browser. */
      'cache-control': 'private, no-store',
      'x-robots-tag': 'noindex, nofollow',
    },
  });
}
