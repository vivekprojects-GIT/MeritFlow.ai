import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { rankedMatches } from '@/lib/jobs-store';
import { isLearner } from '../route';
import { applyFilters, facetCounts, matchesQuery, parseFilterIds } from '@/lib/jobs/match-filters';

export const runtime = 'nodejs';

/**
 * The match board: the scored corpus, faceted server-side.
 *
 * The main /api/jobs payload keeps its fixed top-12 for the other tabs; this
 * route exists so the Matches facets narrow the *whole* ranked corpus before
 * the cut. "Internship" here means the best internships in the corpus, not
 * whichever of twelve senior roles happened to be internships (none, which is
 * why the chips looked broken).
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isLearner(user.role)) return NextResponse.json({ error: 'Not available for this account type.' }, { status: 403 });

  const url = new URL(req.url);
  const ids = parseFilterIds(url.searchParams.get('filters'));
  const q = url.searchParams.get('q') ?? '';
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 20));
  const now = Date.now();

  const ranked = (await rankedMatches(user.id)).filter((m) => matchesQuery(m, q));
  const filtered = applyFilters(ranked, ids, now);

  return NextResponse.json({
    matches: filtered.slice(0, limit),
    /* How deep the board goes, so "Load more" can say whether there is more. */
    total: filtered.length,
    corpus: ranked.length,
    /* Counts are against the current selection — a chip's number is exactly
       how many rows clicking it would leave. */
    facets: facetCounts(ranked, ids, now),
  });
}
