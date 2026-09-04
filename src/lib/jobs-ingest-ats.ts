import { upsertJob } from './jobs-store';
import { skillsIn, trackOf, minCompFromDescription } from './jobs-ingest';

/**
 * Jobs pulled straight from applicant tracking systems.
 *
 * ## Why this exists
 *
 * Measured against a real feed: 124 open postings, of which 47 were LinkedIn
 * and none were Greenhouse. Autopilot stopped on 11 of them with "this
 * application needs an account first" and 14 with "no application form was
 * found on this page", because a LinkedIn link is a login wall and an
 * aggregator link is a description with an Apply button pointing somewhere
 * else. The engine was working; it had nothing to work on.
 *
 * Google Jobs returns whatever the web offers, and what it mostly offers is
 * aggregators. These boards return the employer's own application form, every
 * time, and **a Greenhouse, Lever or Ashby application needs no account** —
 * which removes the single largest cause of a run parking on a human.
 *
 * ## Why it is not scraping
 *
 * Each of these is a public JSON endpoint the vendor publishes for exactly
 * this purpose — the same one that powers the employer's own careers page.
 * No login, no key, no rate limit worth speaking of, and nothing here reads a
 * page that a browser was meant to render.
 */

/* ── Boards ──────────────────────────────────────────────────────────────── */

/**
 * The boards to pull.
 *
 * A list rather than a discovery crawl: board tokens are not enumerable, and
 * guessing them produces 404s against companies that never used the vendor.
 * Curated, and cheap to extend — one line per employer.
 */
export type Board = { vendor: 'greenhouse' | 'lever' | 'ashby'; token: string; company: string };

export const BOARDS: Board[] = [
  /* Data and AI employers that hire the roles this product targets. */
  { vendor: 'greenhouse', token: 'databricks', company: 'Databricks' },
  { vendor: 'greenhouse', token: 'stripe', company: 'Stripe' },
  { vendor: 'greenhouse', token: 'anthropic', company: 'Anthropic' },
  { vendor: 'greenhouse', token: 'discord', company: 'Discord' },
  { vendor: 'greenhouse', token: 'robinhood', company: 'Robinhood' },
  { vendor: 'greenhouse', token: 'flexport', company: 'Flexport' },
  { vendor: 'greenhouse', token: 'instacart', company: 'Instacart' },
  { vendor: 'greenhouse', token: 'gitlab', company: 'GitLab' },
  { vendor: 'greenhouse', token: 'affirm', company: 'Affirm' },
  { vendor: 'greenhouse', token: 'adapter', company: 'Adapter' },
  /* Plaid was here. Their Lever board now 404s -- they moved vendors, and the
     token went with them. Left as a note rather than silently deleted, because
     this is the failure the registry was built to absorb: a dead token there
     backs off and stops costing a request, instead of breaking a live test. */
  { vendor: 'lever', token: 'spotify', company: 'Spotify' },
  /* Verified live against the vendor APIs. Benchling and Netflix were dropped
     after both returned 404 -- a company that leaves a vendor takes its board
     token with it, and a dead token costs that employer silently. */
  { vendor: 'ashby', token: 'ramp', company: 'Ramp' },
  { vendor: 'ashby', token: 'linear', company: 'Linear' },
  { vendor: 'ashby', token: 'vanta', company: 'Vanta' },
];

/** Titles worth storing. A board carries every opening the company has. */
const WANTED =
  /\b(data|ml|machine learning|ai|analytics|platform|backend|software|full ?stack|infrastructure)\b.*\b(engineer|developer|scientist|architect)\b|\bengineer\b.*\b(data|ml|ai|platform)\b/i;

export type AtsIngestResult = {
  board: string;
  fetched: number;
  stored: number;
  skipped: number;
  error?: string;
};

/** Strip the HTML a board returns in its description field. */
function textOf(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const REMOTE = /remote|anywhere|distributed/i;

async function json(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': 'MeritFlow-JobIngest' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

/* ── Per vendor ──────────────────────────────────────────────────────────── */

type Raw = { title: string; location: string; description: string; url: string; postedAt: number | null };

async function greenhouse(token: string): Promise<Raw[]> {
  const body = (await json(`https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true`)) as {
    jobs?: { title?: string; location?: { name?: string }; content?: string; absolute_url?: string; updated_at?: string }[];
  };
  return (body.jobs ?? []).map((j) => ({
    title: j.title ?? '',
    location: j.location?.name ?? '',
    /* `content` is HTML-escaped HTML, so it needs unescaping before stripping. */
    description: textOf((j.content ?? '').replace(/&lt;/g, '<').replace(/&gt;/g, '>')),
    url: j.absolute_url ?? '',
    postedAt: j.updated_at ? Date.parse(j.updated_at) : null,
  }));
}

async function lever(token: string): Promise<Raw[]> {
  const body = (await json(`https://api.lever.co/v0/postings/${token}?mode=json`)) as {
    text?: string;
    categories?: { location?: string };
    descriptionPlain?: string;
    hostedUrl?: string;
    createdAt?: number;
  }[];
  return (body ?? []).map((j) => ({
    title: j.text ?? '',
    location: j.categories?.location ?? '',
    description: (j.descriptionPlain ?? '').slice(0, 4000),
    url: j.hostedUrl ?? '',
    postedAt: typeof j.createdAt === 'number' ? j.createdAt : null,
  }));
}

async function ashby(token: string): Promise<Raw[]> {
  const body = (await json(`https://api.ashbyhq.com/posting-api/job-board/${token}?includeCompensation=true`)) as {
    jobs?: { title?: string; location?: string; descriptionPlain?: string; jobUrl?: string; publishedAt?: string }[];
  };
  return (body.jobs ?? []).map((j) => ({
    title: j.title ?? '',
    location: j.location ?? '',
    description: (j.descriptionPlain ?? '').slice(0, 4000),
    url: j.jobUrl ?? '',
    postedAt: j.publishedAt ? Date.parse(j.publishedAt) : null,
  }));
}

const FETCHERS = { greenhouse, lever, ashby } as const;

/* ── Ingest ──────────────────────────────────────────────────────────────── */

export async function ingestBoard(board: Board): Promise<AtsIngestResult> {
  const label = `${board.vendor}:${board.token}`;
  let raw: Raw[];

  try {
    raw = await FETCHERS[board.vendor](board.token);
  } catch (err) {
    /* A board that has moved or closed is normal and must not stop the rest:
       one dead token should cost that employer, not the whole run. */
    return { board: label, fetched: 0, stored: 0, skipped: 0, error: err instanceof Error ? err.message : 'failed' };
  }

  let stored = 0;
  let skipped = 0;

  for (const job of raw) {
    if (!job.title || !job.url) {
      skipped += 1;
      continue;
    }
    if (!WANTED.test(job.title)) {
      skipped += 1;
      continue;
    }

    await upsertJob({
      company: board.company,
      title: job.title,
      location: job.location,
      remote: REMOTE.test(`${job.location} ${job.title}`),
      track: trackOf(job.title),
      description: job.description.slice(0, 4000),
      skills: skillsIn(job.description),
      /* The description-aware reader: a job description is full of numbers that
         are not salaries, and the structured-field parser treated all of them
         as candidates. */
      minComp: minCompFromDescription(job.description),
      /* The employer's own application form. No account, no interstitial. */
      url: job.url,
      source: board.vendor,
      /* A posting read from the employer's own board was found on their careers
         site. That is a fact about how we found it, and it is what "How did you
         hear about this job?" is asking. */
      discoverySource: 'COMPANY_CAREER_SITE',
      postedAt: job.postedAt,
      companyBlurb: '',
      seniority: '',
      yearsExp: '',
      employment: '',
      workMode: '',
      applicants: null,
    });
    stored += 1;
  }

  return { board: label, fetched: raw.length, stored, skipped };
}

/**
 * Pull every board.
 *
 * Sequential rather than parallel. These are other people's public endpoints
 * and fifteen simultaneous requests from one host is the kind of thing that
 * gets an IP blocked — which would cost the whole feed to save a few seconds.
 */
export async function ingestAllBoards(boards: Board[] = BOARDS): Promise<AtsIngestResult[]> {
  const out: AtsIngestResult[] = [];
  for (const board of boards) out.push(await ingestBoard(board));
  return out;
}
