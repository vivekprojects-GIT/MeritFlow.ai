import { COLLECTABLE, type AtsType, type Detection } from './detect';

/**
 * Guess a board token, then prove it.
 *
 * ## The gap this closes
 *
 * Reading a careers page works when the vendor's board is embedded in the HTML.
 * It fails completely on a page that renders its jobs in the browser — the
 * markup is an empty shell and the board call happens later, in JavaScript we
 * are not running. Stripe, Databricks, Instacart, Figma, Vercel and Scale all
 * came back "no applicant tracking system could be identified" for exactly that
 * reason, while three of them are Greenhouse boards whose token is simply their
 * own name.
 *
 * ## Why guessing is safe here, and only here
 *
 * Because nothing is ever believed on the strength of the guess. A candidate
 * token is sent to the vendor's own API and accepted only if it answers 200
 * with postings. The vendor is the authority on whether a board exists, so a
 * wrong guess costs one 404 and is discarded — it can never become a company in
 * the registry collecting somebody else's jobs.
 *
 * That distinction is the whole design. Elsewhere in this system guessing is
 * forbidden because nothing can check the guess. Here it can.
 */

export type ProbeResult = Detection & { candidatesTried: number };

/**
 * Plausible tokens for a company, most likely first.
 *
 * Drawn from the domain and the name, because that is what boards are almost
 * always named after. Three or four candidates is the right budget: beyond that
 * the hit rate collapses and every miss is a request to somebody's API.
 */
export function candidateTokens(input: { name: string; careerUrl?: string }): string[] {
  const out: string[] = [];

  const push = (v: string) => {
    const clean = v.toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (clean.length >= 2 && clean.length <= 40 && !out.includes(clean)) out.push(clean);
  };

  if (input.careerUrl) {
    try {
      const host = new URL(input.careerUrl).hostname.toLowerCase().replace(/^www\./, '');
      const labels = host.split('.');
      /* `stripe.com` -> stripe; `instacart.careers` -> instacart;
         `wandb.ai` -> wandb. The registrable label, not the TLD. */
      push(labels[0] === 'careers' || labels[0] === 'jobs' ? labels[1] ?? '' : labels[0]);
    } catch {
      /* A malformed URL just means one fewer candidate. */
    }
  }

  const name = input.name.toLowerCase();
  push(name.replace(/\s+/g, ''));
  push(name.replace(/\s+/g, '-'));
  /* "Scale AI" is very often just "scale"; "Weights & Biases" is "wandb", which
     the domain already supplied. */
  push(name.replace(/\s+(ai|inc|labs?|technologies|corp)\.?$/i, '').replace(/\s+/g, ''));

  return out.slice(0, 4);
}

/** The vendor endpoints that can confirm a token exists. */
const VERIFIERS: { ats: AtsType; url: (token: string) => string; hasJobs: (body: unknown) => boolean }[] = [
  {
    ats: 'greenhouse',
    url: (t) => `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(t)}/jobs`,
    hasJobs: (b) => Array.isArray((b as { jobs?: unknown[] })?.jobs) && (b as { jobs: unknown[] }).jobs.length > 0,
  },
  {
    ats: 'ashby',
    url: (t) => `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(t)}`,
    hasJobs: (b) => Array.isArray((b as { jobs?: unknown[] })?.jobs) && (b as { jobs: unknown[] }).jobs.length > 0,
  },
  {
    ats: 'lever',
    url: (t) => `https://api.lever.co/v0/postings/${encodeURIComponent(t)}?mode=json`,
    hasJobs: (b) => Array.isArray(b) && b.length > 0,
  },
];

const NONE: ProbeResult = { ats: 'unknown', identifier: '', evidence: 'none', collectable: false, candidatesTried: 0 };

/**
 * Try each candidate against each vendor until one answers with real postings.
 *
 * Sequential, and it stops at the first hit. A company is on one board, so
 * continuing after a confirmed match would only be a way to find a second,
 * wrong answer.
 */
export async function probeBoards(
  input: { name: string; careerUrl?: string },
  fetchImpl = fetch,
): Promise<ProbeResult> {
  const candidates = candidateTokens(input);
  let tried = 0;

  for (const token of candidates) {
    for (const vendor of VERIFIERS) {
      tried += 1;
      try {
        const res = await fetchImpl(vendor.url(token), {
          headers: { accept: 'application/json' },
          signal: AbortSignal.timeout(12_000),
        });
        if (!res.ok) continue;

        const body = (await res.json()) as unknown;
        /* An empty board is not proof. Plenty of vendors answer 200 with zero
           postings for a token that was never theirs, and accepting that would
           register a company we can never collect anything from. */
        if (!vendor.hasJobs(body)) continue;

        return {
          ats: vendor.ats,
          identifier: token,
          evidence: 'page',
          collectable: COLLECTABLE.has(vendor.ats),
          candidatesTried: tried,
        };
      } catch {
        /* A timeout or a parse failure is a miss, not an error worth raising:
           the next candidate is the whole recovery strategy. */
      }
    }
  }

  return { ...NONE, candidatesTried: tried };
}
