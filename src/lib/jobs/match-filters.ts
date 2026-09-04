import type { Match } from '@/lib/jobs-store';

/**
 * The Matches facet row, shared by the API and the chips that render it.
 *
 * ## Why filtering happens server-side
 *
 * The old chips filtered the twelve matches the page had already fetched, so
 * "Internship" against a dozen senior AI roles returned nothing and the row
 * read as broken. A facet must narrow the *corpus*, then rank — clicking
 * "Remote" means "my best remote matches", not "whichever of these twelve
 * happen to be remote". The predicates live here so the route and the UI
 * agree on what each chip means, and the UI never promises a facet the
 * server cannot answer.
 *
 * ## Why there is no "Early applicant" chip
 *
 * Not one collected job carries an applicant count — boards rarely publish
 * it. A chip that can never match anything is worse than no chip; the card
 * still shows the count on the day a source reports one.
 */
export type MatchFilter = {
  id: string;
  label: string;
  test: (m: Match, now: number) => boolean;
};

const DAY = 86_400_000;

export const MATCH_FILTERS: readonly MatchFilter[] = [
  { id: 'fresh', label: 'Past 24 hours', test: (m, now) => m.job.postedAt != null && now - m.job.postedAt < DAY },
  { id: 'week', label: 'Past week', test: (m, now) => m.job.postedAt != null && now - m.job.postedAt < 7 * DAY },
  { id: 'remote', label: 'Remote', test: (m) => m.job.remote },
  { id: 'strong', label: 'Strong match', test: (m) => m.score >= 85 },
  { id: 'paid', label: 'Salary listed', test: (m) => m.job.minComp != null },
  { id: 'newgrad', label: 'New grad', test: (m) => m.job.track === 'new_grad' || m.job.track === 'entry_level' },
  { id: 'intern', label: 'Internship', test: (m) => m.job.track === 'internship' || m.job.track === 'co_op' },
] as const;

/** Only ids we defined; unknown ids from a stale URL are dropped, not errors. */
export function parseFilterIds(raw: string | null): string[] {
  if (!raw) return [];
  const known = new Set(MATCH_FILTERS.map((f) => f.id));
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => known.has(s));
}

/** Chips combine with AND: each active chip narrows further. */
export function applyFilters(matches: Match[], ids: string[], now: number): Match[] {
  if (ids.length === 0) return matches;
  const active = MATCH_FILTERS.filter((f) => ids.includes(f.id));
  return matches.filter((m) => active.every((f) => f.test(m, now)));
}

/**
 * How many matches each chip would leave, *given the other active chips*.
 * A chip showing "12" then producing an empty list is the exact lie the row
 * used to tell, so each count is computed against the current selection.
 */
export function facetCounts(matches: Match[], activeIds: string[], now: number): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const f of MATCH_FILTERS) {
    const ids = activeIds.includes(f.id) ? activeIds : [...activeIds, f.id];
    counts[f.id] = applyFilters(matches, ids, now).length;
  }
  return counts;
}

/** Case-insensitive title/company/location search. */
export function matchesQuery(m: Match, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return `${m.job.title} ${m.job.company} ${m.job.location}`.toLowerCase().includes(needle);
}

/**
 * A location line fit for a 13px slot on a card.
 *
 * Boards write "Tucson, AZ, United States of America" and "US - Remote"; the
 * card was truncating the former to "United St…" and hiding the latter behind
 * a bare "Remote". Country names collapse to their short forms and a remote
 * job keeps its region — "Remote · Tucson, AZ, USA" says more than either
 * half alone.
 */
export function prettyPlace(location: string, remote: boolean): string {
  const p = location
    .replace(/\s+/g, ' ')
    .replace(/united states of america/gi, 'USA')
    .replace(/united states/gi, 'USA')
    .replace(/united kingdom/gi, 'UK')
    .replace(/\bUS\b(?!A)/g, 'USA')
    .trim();

  /* Strip the remote wording out of the place itself; the mode chip says it. */
  const stripped = p
    .replace(/\b(?:fully\s+)?remote\b/gi, '')
    .replace(/\bhybrid\b/gi, '')
    .replace(/^[\s\-–—,|·]+|[\s\-–—,|·]+$/g, '')
    .trim();

  if (remote) return stripped ? `Remote · ${stripped}` : 'Remote';
  return p || '';
}
