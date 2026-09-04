/**
 * Which applicant tracking system a company runs, and what it calls them.
 *
 * ## The whole point of this file
 *
 * Discovery does not scale by writing one scraper per employer. It scales
 * because a few dozen platforms serve almost everybody: thousands of companies
 * run Greenhouse, thousands run Workday, and one collector per platform reaches
 * all of them — provided we know two things about each employer, which platform
 * and which tenant. This turns a careers URL into exactly that pair.
 *
 * ## Why the identifier matters more than the platform
 *
 * "Stripe uses Greenhouse" is not actionable. `boards-api.greenhouse.io/v1/
 * boards/stripe/jobs` is. Detecting the vendor without recovering the tenant
 * handle leaves a company in the registry that nothing can ever collect from —
 * which is what happened here already: postings from Databricks, Stripe and
 * Instacart came in through embedded boards whose token is not in the URL, and
 * roughly 1,489 of them were downgraded because nothing had stored it.
 *
 * ## What this does not do
 *
 * Guess. A token that cannot be recovered is left empty and the company is
 * marked for a look rather than filled in with something plausible — a wrong
 * board token silently collects another company's jobs and attributes them to
 * this one.
 */

export type AtsType =
  | 'greenhouse'
  | 'lever'
  | 'ashby'
  | 'workday'
  | 'smartrecruiters'
  | 'icims'
  | 'successfactors'
  | 'taleo'
  | 'custom'
  | 'unknown';

export type Detection = {
  ats: AtsType;
  /** The tenant handle the platform knows this employer by. */
  identifier: string;
  /** How we know. `url` is certain; `page` came from the careers page markup. */
  evidence: 'url' | 'page' | 'none';
  /** Whether a collector exists for this platform today. */
  collectable: boolean;
  /** The vendor's name when it is one `AtsType` does not enumerate. */
  vendor?: string;
};

const NONE: Detection = { ats: 'unknown', identifier: '', evidence: 'none', collectable: false };

/** Platforms with a working collector. The rest are recorded, not collected. */
export const COLLECTABLE: ReadonlySet<AtsType> = new Set<AtsType>(['greenhouse', 'lever', 'ashby']);

/**
 * Patterns that recover a tenant from a URL.
 *
 * Ordered most-specific first. Each is anchored on the vendor's own host so a
 * company page merely *linking* to Greenhouse cannot be mistaken for one hosted
 * there — the capture group is only trusted when the host is the vendor's.
 */
const URL_RULES: { ats: AtsType; host: RegExp; path?: RegExp; fromHost?: boolean }[] = [
  /* boards.greenhouse.io/acme, job-boards.greenhouse.io/acme/jobs/123 */
  { ats: 'greenhouse', host: /(^|\.)greenhouse\.io$/, path: /^\/(?:embed\/job_board\/?)?([a-z0-9_-]+)/i },
  /* jobs.lever.co/acme/uuid */
  { ats: 'lever', host: /(^|\.)lever\.co$/, path: /^\/([a-z0-9_-]+)/i },
  /* jobs.ashbyhq.com/acme/uuid */
  { ats: 'ashby', host: /(^|\.)ashbyhq\.com$/, path: /^\/([a-z0-9_%.-]+)/i },
  /* acme.wd1.myworkdayjobs.com/... — the tenant is the first host label. */
  { ats: 'workday', host: /(^|\.)myworkdayjobs\.com$/, fromHost: true },
  { ats: 'workday', host: /(^|\.)workday\.com$/, fromHost: true },
  /* jobs.smartrecruiters.com/Acme/123 */
  { ats: 'smartrecruiters', host: /(^|\.)smartrecruiters\.com$/, path: /^\/([a-z0-9_-]+)/i },
  /* careers-acme.icims.com/... */
  { ats: 'icims', host: /(^|\.)icims\.com$/, fromHost: true },
  { ats: 'successfactors', host: /(^|\.)successfactors\.(com|eu)$/, fromHost: true },
  { ats: 'taleo', host: /(^|\.)taleo\.net$/, fromHost: true },
  /* Oracle Cloud recruiting. Recorded so the registry is honest about it; no
     collector exists, and a run against one is not a failure. */
  { ats: 'custom', host: /(^|\.)oraclecloud\.com$/, fromHost: true },
];

/**
 * Detect from the URL alone. Cheap, certain when it hits, and does no I/O.
 */
export function detectFromUrl(raw: string): Detection {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return NONE;
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, '');

  for (const rule of URL_RULES) {
    if (!rule.host.test(host)) continue;

    if (rule.fromHost) {
      /* The tenant is the leftmost label: acme.wd1.myworkdayjobs.com. Common
         prefixes are stripped so "careers-acme" and "acme" agree. */
      const label = host.split('.')[0].replace(/^(careers?|jobs?|apply)-/, '');
      return { ats: rule.ats, identifier: label, evidence: 'url', collectable: COLLECTABLE.has(rule.ats) };
    }

    const m = rule.path ? url.pathname.match(rule.path) : null;
    const token = m?.[1] ? decodeURIComponent(m[1]) : '';
    /* Board paths that are vendor pages rather than tenants. */
    if (!token || /^(jobs|embed|api|v1|boards|search)$/i.test(token)) {
      return { ats: rule.ats, identifier: '', evidence: 'url', collectable: false };
    }
    return { ats: rule.ats, identifier: token, evidence: 'url', collectable: COLLECTABLE.has(rule.ats) };
  }

  return NONE;
}

/**
 * Markers an employer's own careers page leaves when it embeds a board.
 *
 * This is the case the URL cannot answer and the one that matters most: the
 * biggest employers host their careers page themselves and embed the vendor's
 * board inside it, so `stripe.com/jobs` looks like a custom site and is in fact
 * a Greenhouse board named `stripe`.
 */
const PAGE_RULES: { ats: AtsType; patterns: RegExp[] }[] = [
  {
    ats: 'greenhouse',
    patterns: [
      /* The live embed is `/embed/job_board/js?for=token`; the older form omits
         the `/js`. Both are in the wild, so the segment is optional. */
      /boards\.greenhouse\.io\/embed\/job_board(?:\/js)?\?for=([a-z0-9_-]+)/i,
      /job-boards\.greenhouse\.io\/([a-z0-9_-]+)/i,
      /boards-api\.greenhouse\.io\/v1\/boards\/([a-z0-9_-]+)/i,
      /Grnhse\.Settings\s*=\s*\{[^}]*for\s*:\s*['"]([a-z0-9_-]+)['"]/i,
    ],
  },
  { ats: 'lever', patterns: [/jobs\.lever\.co\/([a-z0-9_-]+)/i, /api\.lever\.co\/v0\/postings\/([a-z0-9_-]+)/i] },
  {
    ats: 'ashby',
    patterns: [/jobs\.ashbyhq\.com\/([a-z0-9_%.-]+)/i, /api\.ashbyhq\.com\/posting-api\/job-board\/([a-z0-9_%.-]+)/i],
  },
  { ats: 'smartrecruiters', patterns: [/api\.smartrecruiters\.com\/v1\/companies\/([a-z0-9_-]+)/i] },
  { ats: 'workday', patterns: [/([a-z0-9-]+)\.wd\d+\.myworkdayjobs\.com/i] },
];

/**
 * Every vendor we can recognise, including the ones we cannot collect from.
 *
 * Recording a platform we have no collector for is not wasted work: it is the
 * only way to know which collector to build next. A survey of sixty companies
 * from a bulk import found eight different vendors spread one or two apiece,
 * and forty-three careers pages with no applicant tracking system at all --
 * which is a far more useful answer than a bare hit rate, because it says
 * plainly that the next collector is worth less than a better source list.
 */
const VENDOR_MARKERS: [AtsType, RegExp][] = [
  ['workday', /myworkdayjobs\.com|workday\.com/i],
  ['smartrecruiters', /smartrecruiters\.com/i],
  ['icims', /icims\.com/i],
  ['successfactors', /successfactors\.(com|eu)/i],
  ['taleo', /taleo\.net/i],
];

/** Extra vendors worth naming even though `AtsType` has no case for them. */
const OTHER_MARKERS: [string, RegExp][] = [
  ['workable', /workable\.com/i],
  ['bamboohr', /bamboohr\.(com|co\.uk)/i],
  ['jazzhr', /jazz\.co|applytojob\.com/i],
  ['jobvite', /jobvite\.com/i],
  ['breezy', /breezy\.hr/i],
  ['recruitee', /recruitee\.com/i],
  ['teamtailor', /teamtailor\.com/i],
  ['paylocity', /recruiting\.paylocity\.com/i],
  ['adp', /workforcenow\.adp\.com|myjobs\.adp\.com/i],
  ['ukg', /ultipro\.com/i],
  ['personio', /personio\.(com|de)/i],
];

/** The vendor a page mentions, when it is one we cannot collect from. */
export function vendorMentioned(html: string): { ats: AtsType; label: string } | null {
  for (const [ats, re] of VENDOR_MARKERS) if (re.test(html)) return { ats, label: ats };
  for (const [label, re] of OTHER_MARKERS) if (re.test(html)) return { ats: 'custom', label };
  return null;
}

/**
 * Read the careers page and look for an embedded board.
 *
 * Only called when the URL was not decisive, because it costs a request. The
 * body is capped: a board marker appears in the first few hundred kilobytes or
 * it is not there, and some careers pages are enormous.
 */
export async function detectFromPage(careerUrl: string, fetchImpl = fetch): Promise<Detection> {
  let html = '';
  try {
    const res = await fetchImpl(careerUrl, {
      redirect: 'follow',
      headers: { 'user-agent': 'MeritFlow/1.0 (job discovery; +https://meritflow.app)' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return NONE;
    html = (await res.text()).slice(0, 400_000);
  } catch {
    return NONE;
  }

  for (const rule of PAGE_RULES) {
    for (const pattern of rule.patterns) {
      const m = html.match(pattern);
      const token = m?.[1] ? decodeURIComponent(m[1]) : '';
      if (!token || /^(jobs|embed|api|v1|boards|search)$/i.test(token)) continue;
      return { ats: rule.ats, identifier: token, evidence: 'page', collectable: COLLECTABLE.has(rule.ats) };
    }
  }

  /* No board we can read. Name the vendor anyway when one is visible: a
     registry that knows two hundred of its companies run Workday is a registry
     that can tell you what building a Workday collector would be worth. */
  if (!html) return NONE;
  const seen = vendorMentioned(html);
  return seen
    ? { ats: seen.ats, identifier: '', evidence: 'page', collectable: false, vendor: seen.label }
    : { ats: 'custom', identifier: '', evidence: 'page', collectable: false };
}

/**
 * The full detection: URL first, page only if the URL was not enough.
 *
 * A URL hit that yields no identifier still falls through to the page, because
 * knowing the vendor without the tenant leaves a company nothing can collect
 * from — which is the failure this whole module exists to prevent.
 */
export async function detect(careerUrl: string, fetchImpl = fetch): Promise<Detection> {
  const fromUrl = detectFromUrl(careerUrl);
  if (fromUrl.identifier) return fromUrl;

  const fromPage = await detectFromPage(careerUrl, fetchImpl);
  if (fromPage.identifier) return fromPage;

  /* Keep the more specific of the two. A URL that said "workday, no tenant" is
     better than a page read that said "custom". */
  return fromUrl.ats !== 'unknown' ? fromUrl : fromPage;
}
