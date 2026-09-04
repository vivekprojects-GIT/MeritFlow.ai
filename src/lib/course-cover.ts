const SERPAPI_URL = 'https://serpapi.com/search';

/**
 * Finds a cover photo for a course via SerpAPI's Google Images engine.
 *
 * Best-effort by design: a missing key, a failed lookup, or a result we don't
 * trust all return null, and the card falls back to its generated gradient.
 * A cover is decoration — it must never block or fail course creation.
 */

type SerpImageResult = {
  original?: string;
  original_width?: number;
  original_height?: number;
  thumbnail?: string;
  source?: string;
};

type SerpImagesResponse = {
  images_results?: SerpImageResult[];
  error?: string;
};

/** Hosts that hotlink badly or serve tracking pixels rather than usable photos. */
const BLOCKED_HOSTS = [/lookaside\./i, /fbcdn\.net/i, /instagram\./i, /pinimg\.com/i, /^data:/i];

function usable(result: SerpImageResult): string | null {
  const url = result.original?.trim() || result.thumbnail?.trim();
  if (!url || !/^https:\/\//i.test(url)) return null;
  if (BLOCKED_HOSTS.some((pattern) => pattern.test(url))) return null;

  /* Prefer landscape: the card crops to roughly 16:9, so a tall image would be
     mostly cropped away. Only enforced when SerpAPI reports dimensions. */
  const w = result.original_width;
  const h = result.original_height;
  if (typeof w === 'number' && typeof h === 'number' && h > 0) {
    if (w / h < 1.15) return null;
    if (w < 640) return null;
  }
  return url;
}

/**
 * Build a search that returns clean, on-topic imagery rather than screenshots
 * of other course platforms.
 */
function coverQuery(title: string, category: string): string {
  const subject = title.replace(/[:\-–—].*$/, '').trim().slice(0, 60) || category;
  return `${subject} ${category === 'General' ? 'concept' : category} illustration background`;
}

/**
 * Whether a cover can be looked up at all.
 *
 * Takes the user's own key so a learner who supplied one still gets covers on
 * an install where the operator configured none.
 */
export function coverLookupEnabled(userKey?: string | null): boolean {
  return Boolean(userKey || process.env.SERPAPI_API_KEY || process.env.SERP_API_KEY);
}

/**
 * Find a cover photo for a course.
 *
 * The user's own key wins over the operator's: they chose to supply it, and
 * spending the shared quota instead is both a surprise and, once the shared
 * quota is exhausted, a silent failure they cannot fix.
 */
export async function findCourseCover(
  title: string,
  category = 'General',
  userKey?: string | null,
): Promise<string | null> {
  const apiKey = userKey || process.env.SERPAPI_API_KEY || process.env.SERP_API_KEY;
  if (!apiKey) return null;

  try {
    const search = new URL(SERPAPI_URL);
    search.searchParams.set('engine', 'google_images');
    search.searchParams.set('q', coverQuery(title, category));
    search.searchParams.set('gl', 'us');
    search.searchParams.set('ijn', '0');
    search.searchParams.set('api_key', apiKey);

    const res = await fetch(search, { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
    if (!res.ok) {
      console.warn('[course-cover] SerpAPI images failed:', res.status);
      return null;
    }

    const json = (await res.json()) as SerpImagesResponse;
    if (json.error) {
      console.warn('[course-cover] SerpAPI images error:', json.error);
      return null;
    }

    for (const result of (json.images_results ?? []).slice(0, 12)) {
      const url = usable(result);
      if (url) return url;
    }
    return null;
  } catch (err) {
    console.warn('[course-cover] lookup failed:', err instanceof Error ? err.message : err);
    return null;
  }
}
