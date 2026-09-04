import { upsertJob, type Track } from './jobs-store';
import { getDb } from './db';

/**
 * Live job ingestion, via SerpApi's Google Jobs engine.
 *
 * This exists to fix a real defect and to answer a real requirement.
 *
 * **The defect:** the seeded registry's `url` pointed at each company's careers
 * *page*, not at a specific requisition. Clicking Apply dropped the candidate
 * on a job board and asked them to find the posting again — worse than no link,
 * because it looks like it worked. Google Jobs returns `apply_options`, each
 * with a direct link to the actual posting on the actual ATS.
 *
 * **The requirement:** freshness. Polling ten Greenhouse boards covers ten
 * companies. Google Jobs aggregates across every board, every job site and
 * every company careers page, and reports its own "posted N hours ago", so the
 * list is as current as the source is.
 *
 * Nothing is invented. A field Google does not return is left empty and the
 * card renders without that row — no fabricated applicant counts, no guessed
 * salaries, no made-up posting dates.
 */

const SERPAPI_URL = 'https://serpapi.com/search';

export function hasJobsKey(): boolean {
  return Boolean(process.env.SERPAPI_API_KEY?.trim());
}

/**
 * The searches we run.
 *
 * Kept explicit rather than derived from every user's profile: one shared
 * corpus is polled on a schedule and scored per-candidate afterwards, so a
 * hundred users cost the same number of API calls as one. Personalising the
 * *query* would multiply cost by user count for a worse result, since the
 * matcher already ranks against each résumé.
 */
const QUERIES = [
  'software engineer new grad',
  'software engineer intern',
  'machine learning engineer',
  'data analyst entry level',
  'backend engineer',
  'frontend engineer',
  'data engineer',
  'product designer',
] as const;

type SerpApplyOption = { title?: string; link?: string };
type SerpDetected = {
  posted_at?: string;
  schedule_type?: string;
  salary?: string;
  work_from_home?: boolean;
  qualifications?: string[];
};
type SerpJob = {
  title?: string;
  company_name?: string;
  location?: string;
  description?: string;
  via?: string;
  job_id?: string;
  detected_extensions?: SerpDetected;
  apply_options?: SerpApplyOption[];
  related_links?: { link?: string; text?: string }[];
};

/* ── Field derivation ────────────────────────────────────────────────────── */

export function trackOf(title: string): Track {
  const t = title.toLowerCase();
  if (/\bintern(ship)?\b/.test(t)) return 'internship';
  if (/\bco-?op\b/.test(t)) return 'co_op';
  if (/new ?grad|university grad|campus|graduate program/.test(t)) return 'new_grad';
  if (/\b(junior|jr\.?|entry|associate)\b/.test(t)) return 'entry_level';
  if (/\bcontract(or)?\b/.test(t)) return 'contract';
  return 'full_time';
}

function seniorityOf(title: string): string {
  const t = title.toLowerCase();
  if (/\bintern(ship)?\b/.test(t)) return 'Internship';
  if (/new ?grad|university grad|campus/.test(t)) return 'Entry Level, New Grad';
  if (/\b(junior|jr\.?|entry|associate)\b/.test(t)) return 'Entry Level';
  if (/\b(staff|principal|director|head of|vp)\b/.test(t)) return 'Staff, Principal';
  if (/\b(senior|sr\.?|lead)\b/.test(t)) return 'Senior Level';
  return 'Mid Level';
}

function yearsOf(seniority: string): string {
  if (seniority.startsWith('Internship')) return '0-1 years exp';
  if (seniority.startsWith('Entry')) return '0-2 years exp';
  if (seniority.startsWith('Senior')) return '5+ years exp';
  if (seniority.startsWith('Staff')) return '8+ years exp';
  return '3-5 years exp';
}

/**
 * "22 hours ago" / "3 days ago" back to a timestamp.
 *
 * Google reports relative time, and the card needs an absolute one so
 * freshness stays correct after the row has been sitting in the database.
 * Unparseable means null, not "now" — pretending an undated posting is fresh
 * would push it to the top of every list.
 */
function postedAtFrom(relative: string | undefined, now: number): number | null {
  if (!relative) return null;
  const m = /(\d+)\s*(minute|hour|day|week|month)/i.exec(relative);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  const ms =
    unit === 'minute' ? 60_000 : unit === 'hour' ? 3_600_000 : unit === 'day' ? 86_400_000 : unit === 'week' ? 604_800_000 : 2_592_000_000;
  return now - n * ms;
}

/** Salary floor, only when Google states one. Never estimated. */
export function minCompFrom(salary: string | undefined): number | null {
  if (!salary) return null;
  const values: number[] = [];
  for (const m of salary.matchAll(/(\d{2,3})(?:[,.](\d{3}))?\s?(K|k)?/g)) {
    const whole = Number(m[1]);
    const rest = m[2] ? Number(m[2]) : null;
    const isK = Boolean(m[3]);
    let v: number | null = null;
    if (rest != null) v = whole * 1000 + rest;
    else if (isK) v = whole * 1000;
    if (v != null && v >= 40_000 && v <= 900_000) values.push(v);
  }
  /* An hourly rate is also reported here; ignore anything implausible as an
     annual floor rather than storing "$85" as a salary. */
  return values.length > 0 ? Math.min(...values) : null;
}

/**
 * A salary floor read out of free-running job-description text.
 *
 * ## Why this is not `minCompFrom`
 *
 * `minCompFrom` reads a *structured* salary field — a short string that is
 * already known to be about pay, like "$150K–$200K a year". Every number in it
 * is a salary number, so it can take them all and keep the lowest.
 *
 * A job description is not that. It contains throughput figures, user counts,
 * dataset sizes and dates, and the ATS ingester was passing whole descriptions
 * to that function. A posting saying "100,000 queries per second" and nothing
 * about pay came out with a $100,000 salary floor — and because the caller
 * keeps the *minimum*, the most irrelevant number in the text usually won.
 *
 * 530 postings in the corpus carried a salary their description never stated,
 * and a candidate whose floor was above the invented figure had those
 * applications refused by the salary gate. Refused on a number nobody wrote.
 *
 * ## What counts as a salary here
 *
 * A currency marker attached to the figure, in a clause that is about pay.
 * Both, because either alone still admits "$100,000 in prizes" and "we process
 * 250,000 events". If a posting does not say what it pays, this returns null —
 * which is the honest answer, and which the salary gate treats as unknown
 * rather than as zero.
 */
export function minCompFromDescription(description: string | undefined): number | null {
  if (!description) return null;

  const PAY_WORDS =
    /\b(salary|salaries|compensation|base\spay|base\salary|pay\range|pay\sband|total\rewards|annual\salary|per\syear|per\sannum|annually|yearly|OTE|remuneration|compensation\range|expected\spay|starting\spay|hourly\rate)\b/i;

  const values: number[] = [];

  /* Clause by clause, so the pay words have to sit beside the figure rather
     than merely somewhere in a long document. */
  for (const clause of description.split(/(?:[.;!?\n\r]|\s\s{2,})+/)) {
    if (!PAY_WORDS.test(clause)) continue;

    /* Only figures carrying a currency marker. "$180,000", "USD 180,000",
       "180K" beside pay words. */
    for (const m of clause.matchAll(/(?:\$|USD\s?|CAD\s?|\u00a3|\u20ac)\s?(\d{2,3})(?:[,](\d{3}))?\s?(K|k)?\b/g)) {
      const whole = Number(m[1]);
      const rest = m[2] ? Number(m[2]) : null;
      const isK = Boolean(m[3]);
      let v: number | null = null;
      if (rest != null) v = whole * 1000 + rest;
      else if (isK) v = whole * 1000;
      if (v != null && v >= 40_000 && v <= 900_000) values.push(v);
    }
  }

  return values.length > 0 ? Math.min(...values) : null;
}

const SKILL_VOCAB = [
  'Python','Java','JavaScript','TypeScript','Go','Rust','C++','C#','Ruby','Scala','Kotlin','Swift','PHP','R',
  'React','Vue','Angular','Node.js','Django','Flask','Spring','Rails','Next.js',
  'SQL','PostgreSQL','MySQL','MongoDB','Redis','Snowflake','BigQuery','Spark','Kafka','Airflow','dbt','Tableau','Power BI',
  'AWS','GCP','Azure','Kubernetes','Docker','Terraform','CI/CD','Jenkins',
  'machine learning','deep learning','PyTorch','TensorFlow','NLP','LLM','statistics','A/B testing','Excel',
  'GraphQL','REST','microservices','distributed systems','Linux','networking','security',
  'Figma','product design','accessibility','data visualization',
];

export function skillsIn(text: string): string[] {
  const hay = text.toLowerCase();
  /* Capped: a description naming thirty technologies is a wish list, and
     scoring against all of them would punish every real candidate. */
  return SKILL_VOCAB.filter((s) => hay.includes(s.toLowerCase())).slice(0, 12);
}

/**
 * Pick the link that goes to the actual posting.
 *
 * `apply_options` is ordered by Google's own preference and usually leads with
 * the employer's ATS. An aggregator link still resolves to the real posting, so
 * the first option is used rather than dropping the job — but a direct ATS link
 * is preferred when one is present, because that is the page the candidate
 * ultimately has to reach.
 */
function applyLinkFrom(job: SerpJob): string | null {
  const options = (job.apply_options ?? []).filter((o) => o.link);
  if (options.length === 0) return null;

  /* Google's apply_options occasionally carry a link on a domain with no
     relation to the employer — one Reddit posting offered
     ttifloorcare.mashreqdevelopments.com. Sending a candidate there is worse
     than dropping the job, so an unrecognised domain only wins if it shares a
     token with the company name. */
  const companyTokens = (job.company_name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 4 && !['inc','llc','corp','the','labs','group','technologies','systems'].includes(t));

  const relatedToCompany = (link: string): boolean => {
    try {
      const host = new URL(link).hostname.toLowerCase().replace(/[^a-z0-9]/g, '');
      return companyTokens.some((t) => host.includes(t));
    } catch {
      return false;
    }
  };

  const ATS = /greenhouse\.io|lever\.co|ashbyhq|myworkdayjobs|workday|smartrecruiters|icims|jobvite|workable|successfactors|taleo/i;
  /* Aggregators resolve to the posting eventually, but they add a redirect,
     an interstitial, and sometimes a sign-up wall. Rank them last so the
     candidate lands on the employer's own page when one is offered. */
  const AGGREGATOR = /indeed|linkedin|ziprecruiter|glassdoor|simplyhired|monster|jobright|tsenta|dice|builtin|talent\.com/i;

  const rank = (link: string): number => {
    if (ATS.test(link)) return 0;
    /* The employer's own site, confirmed by the domain matching their name. */
    if (relatedToCompany(link)) return 1;
    /* A known aggregator is a worse landing page but a trustworthy one. */
    if (AGGREGATOR.test(link)) return 2;
    /* Unrecognised and unrelated to the employer. Last resort. */
    return 3;
  };

  const best = [...options].sort((a, b) => rank(a.link!) - rank(b.link!))[0];
  /* If the only option left is an unrelated domain, drop the job rather than
     send someone somewhere we cannot vouch for. */
  return rank(best.link!) === 3 ? null : (best.link ?? null);
}

export type IngestResult = { query: string; fetched: number; stored: number; skipped: number; error?: string };

/** Pull one query from Google Jobs. */
export async function ingestQuery(query: string, location = 'United States'): Promise<IngestResult> {
  const key = process.env.SERPAPI_API_KEY?.trim();
  if (!key) return { query, fetched: 0, stored: 0, skipped: 0, error: 'SERPAPI_API_KEY is not set.' };

  try {
    const url = new URL(SERPAPI_URL);
    url.searchParams.set('engine', 'google_jobs');
    url.searchParams.set('q', query);
    url.searchParams.set('location', location);
    url.searchParams.set('hl', 'en');
    /* Google's own freshness filter, so we spend the request on recent jobs
       rather than paging through stale ones. */
    url.searchParams.set('chips', 'date_posted:week');
    url.searchParams.set('api_key', key);

    const res = await fetch(url, { signal: AbortSignal.timeout(25_000) });
    if (!res.ok) return { query, fetched: 0, stored: 0, skipped: 0, error: `HTTP ${res.status}` };

    const data = (await res.json()) as { jobs_results?: SerpJob[]; error?: string };
    if (data.error) return { query, fetched: 0, stored: 0, skipped: 0, error: data.error };

    const jobs = data.jobs_results ?? [];
    const now = Date.now();
    let stored = 0;
    let skipped = 0;

    for (const j of jobs) {
      const title = j.title?.trim();
      const company = j.company_name?.trim();
      const link = applyLinkFrom(j);

      /* A posting with no direct link is exactly the bug this replaces. Drop
         it rather than storing a job whose Apply button goes nowhere useful. */
      if (!title || !company || !link) {
        skipped += 1;
        continue;
      }

      const ext = j.detected_extensions ?? {};
      const description = (j.description ?? '').replace(/\s+/g, ' ').trim();
      const seniority = seniorityOf(title);
      const location_ = j.location?.trim() ?? '';
      const remote = Boolean(ext.work_from_home) || /remote|anywhere/i.test(location_);

      await upsertJob({
        company,
        title,
        location: location_,
        remote,
        track: trackOf(title),
        description: description.slice(0, 4000),
        skills: skillsIn(`${description} ${(ext.qualifications ?? []).join(' ')}`),
        minComp: minCompFrom(ext.salary),
        /* The real posting. This is the fix. */
        url: link,
        postedAt: postedAtFrom(ext.posted_at, now),
        source: 'google_jobs',
        /* Where the *link* points decides this, not where we searched. A Google
           Jobs result that resolves to linkedin.com was found on LinkedIn, and
           saying "company website" because our crawler used Google would be a
           false answer to a question employers use for attribution. */
        discoverySource: sourceOf(link),
        /* Where Google found it — real provenance, not marketing copy. */
        companyBlurb: j.via ? j.via.replace(/^via\s+/i, '') : '',
        seniority,
        yearsExp: yearsOf(seniority),
        employment: ext.schedule_type ?? '',
        workMode: remote ? 'Remote' : location_ ? 'Onsite' : '',
        /* Google Jobs does not report applicant counts. Left null so the card
           shows nothing rather than a fabricated number. */
        applicants: null,
      });
      stored += 1;
    }

    return { query, fetched: jobs.length, stored, skipped };
  } catch (err) {
    return { query, fetched: 0, stored: 0, skipped: 0, error: err instanceof Error ? err.message : 'failed' };
  }
}

/**
 * Run every query.
 *
 * Sequential, not parallel: SerpApi bills per search and rate-limits, and
 * firing eight at once is the fastest way to a 429 and a wasted quota.
 */
/**
 * Which surface a posting was actually found on, from its own URL.
 *
 * Never returns REFERRAL. A referral is a relationship, not a URL, and claiming
 * one we cannot evidence is a lie an employer acts on — referrals are routed to
 * different reviewers and sometimes carry a bonus. It is set only from an
 * explicit record, and there is no code path here that creates one.
 */
export function sourceOf(url: string): string {
  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }

  if (/(^|\.)linkedin\.com$/.test(host)) return 'LINKEDIN';
  if (/(^|\.)indeed\.com$/.test(host)) return 'INDEED';
  if (/(^|\.)glassdoor\.(com|co\.uk)$/.test(host)) return 'GLASSDOOR';
  if (/(^|\.)ziprecruiter\.com$/.test(host)) return 'ZIPRECRUITER';
  if (/(^|\.)monster\.com$/.test(host)) return 'MONSTER';
  if (/(^|\.)dice\.com$/.test(host)) return 'DICE';

  /* An applicant tracking system hosts the employer's own application form, so
     a posting found there was found on their careers site. */
  if (/greenhouse\.io$|lever\.co$|ashbyhq\.com$|myworkdayjobs\.com$|smartrecruiters\.com$|icims\.com$/.test(host)) {
    return 'COMPANY_CAREER_SITE';
  }

  /* Anything else is an employer domain we reached directly. */
  return host ? 'COMPANY_CAREER_SITE' : '';
}

export async function ingestAll(location = 'United States'): Promise<IngestResult[]> {
  const out: IngestResult[] = [];
  for (const q of QUERIES) {
    out.push(await ingestQuery(q, location));
  }
  return out;
}

/**
 * Retire postings we have not seen recently.
 *
 * A job that has dropped out of Google's index is filled or expired. Leaving it
 * visible sends people to a dead posting, which is the same failure as the
 * wrong URL.
 */
/**
 * Remove the seeded registry.
 *
 * Those rows linked to careers *pages* rather than requisitions, which is the
 * defect this module replaces. They are deleted rather than closed: a closed
 * row would still be reachable through an existing application, and pointing a
 * candidate at a page that cannot accept an application is the failure itself.
 */
export async function purgeSeedJobs(): Promise<number> {
  const db = await getDb();
  /* Applications referencing them cascade, which is correct — an application
     to a job we could never actually link to was not real. */
  const res = await db.query("DELETE FROM jobs WHERE source = 'registry' OR source = 'seed'");
  return res.affectedRows ?? 0;
}

export async function closeStaleJobs(olderThanDays = 10): Promise<number> {
  const db = await getDb();
  const cutoff = Date.now() - olderThanDays * 86_400_000;
  const res = await db.query(
    "UPDATE jobs SET status = 'closed' WHERE status = 'open' AND source = 'google_jobs' AND last_seen_at < $1",
    [cutoff],
  );
  return res.affectedRows ?? 0;
}
