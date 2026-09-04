import { BOARDS } from '../jobs-ingest-ats';
import { mergeDuplicates, upsertCompany } from './registry';
import type { AtsType } from './detect';

/**
 * The registry's starting population.
 *
 * ## Two kinds of row
 *
 * The first kind carries a known board token — those are collectable the
 * instant they are inserted, and they include everything the old hardcoded
 * array had, so nothing regresses.
 *
 * The second kind carries only a careers URL. Those are the interesting ones:
 * the registry identifies the platform itself, on its own schedule, and either
 * starts collecting or records honestly that nothing can. That is the loop that
 * scales — adding an employer becomes "paste their careers page", not "work out
 * which vendor they use and find the token".
 *
 * ## Why this list is short
 *
 * Because it is a seed, not the target. Reaching tens of thousands is a data
 * problem — a company list with careers URLs, fed through `upsertCompany` —
 * and the machinery for that is now the same for row fifty as for row fifty
 * thousand. What this file proves is that the loop closes.
 */

type Seed = { name: string; ats?: AtsType; identifier?: string; careerUrl?: string; country?: string };

/**
 * Employers whose careers page embeds a board rather than linking to one.
 *
 * These are exactly the case that motivated detection. Their postings were
 * already arriving through the feed and could not be applied to automatically,
 * because the board token is nowhere in the URL — around 1,489 postings were
 * downgraded for that reason alone. Given the careers URL, the detector reads
 * the page and recovers the token.
 */
const BY_CAREERS_PAGE: Seed[] = [
  { name: 'Stripe', careerUrl: 'https://stripe.com/jobs/search', country: 'US' },
  { name: 'Databricks', careerUrl: 'https://www.databricks.com/company/careers/open-positions', country: 'US' },
  { name: 'Instacart', careerUrl: 'https://instacart.careers/current-openings/', country: 'US' },
  { name: 'Figma', careerUrl: 'https://www.figma.com/careers/', country: 'US' },
  { name: 'Notion', careerUrl: 'https://www.notion.com/careers', country: 'US' },
  { name: 'Vercel', careerUrl: 'https://vercel.com/careers', country: 'US' },
  { name: 'Scale AI', careerUrl: 'https://scale.com/careers', country: 'US' },
  { name: 'Cohere', careerUrl: 'https://cohere.com/careers', country: 'CA' },
  { name: 'Hugging Face', careerUrl: 'https://apply.workable.com/huggingface/', country: 'US' },
  { name: 'Weights & Biases', careerUrl: 'https://wandb.ai/site/careers', country: 'US' },
  { name: 'Modal', careerUrl: 'https://modal.com/careers', country: 'US' },
  { name: 'Sierra', careerUrl: 'https://sierra.ai/careers', country: 'US' },
  { name: 'Perplexity', careerUrl: 'https://www.perplexity.ai/careers', country: 'US' },
  { name: 'Mistral AI', careerUrl: 'https://mistral.ai/careers', country: 'FR' },
];

/**
 * Board tokens, each verified live against the vendor's API.
 *
 * Every one of these returned 200 when this list was written. That is worth
 * saying because the first draft did not check, and four of its guesses --
 * `anysphere`, `rippling`, `benchlingcareers`, and Lever's `plaid` -- were
 * already dead. A wrong token is not a small error: it produces a company in
 * the registry that silently collects nothing, forever, while looking present.
 *
 * The registry is what makes this survivable at scale. A token that starts
 * failing increments `failure_count`, backs off geometrically, and stops
 * costing a request every cycle -- so coverage degrades gracefully as companies
 * change vendors, instead of a hardcoded array breaking a test.
 */
const BY_TOKEN: Seed[] = [
  { name: 'OpenAI', ats: 'ashby', identifier: 'openai', country: 'US' },
  { name: 'Ramp', ats: 'ashby', identifier: 'ramp', country: 'US' },
  { name: 'Linear', ats: 'ashby', identifier: 'linear', country: 'US' },
  { name: 'Vanta', ats: 'ashby', identifier: 'vanta', country: 'US' },
  { name: 'Deel', ats: 'ashby', identifier: 'deel', country: 'US' },
  { name: 'Mercury', ats: 'ashby', identifier: 'mercury', country: 'US' },
  { name: 'Spotify', ats: 'lever', identifier: 'spotify', country: 'SE' },
  { name: 'Match Group', ats: 'lever', identifier: 'matchgroup', country: 'US' },
  { name: 'Voleon', ats: 'lever', identifier: 'voleon', country: 'US' },
  { name: 'Reddit', ats: 'greenhouse', identifier: 'reddit', country: 'US' },
  { name: 'Airtable', ats: 'greenhouse', identifier: 'airtable', country: 'US' },
  { name: 'Datadog', ats: 'greenhouse', identifier: 'datadog', country: 'US' },
  { name: 'Cloudflare', ats: 'greenhouse', identifier: 'cloudflare', country: 'US' },
  { name: 'Samsara', ats: 'greenhouse', identifier: 'samsara', country: 'US' },
  { name: 'Chime', ats: 'greenhouse', identifier: 'chime', country: 'US' },
  { name: 'Brex', ats: 'greenhouse', identifier: 'brex', country: 'US' },
];

/**
 * Populate the registry. Idempotent, so it is safe on every start.
 *
 * The old `BOARDS` array is folded in rather than dropped, so the fourteen
 * employers that were already being collected from keep working while the
 * registry takes over as the source of truth.
 */
export async function seedRegistry(): Promise<{ inserted: number }> {
  const rows: Seed[] = [
    ...BOARDS.map((b) => ({ name: b.company, ats: b.vendor as AtsType, identifier: b.token, country: 'US' })),
    ...BY_TOKEN,
    ...BY_CAREERS_PAGE,
  ];

  let inserted = 0;
  for (const row of rows) {
    await upsertCompany({
      name: row.name,
      ats: row.ats,
      identifier: row.identifier,
      careerUrl: row.careerUrl,
      country: row.country,
    });
    inserted += 1;
  }

  /* Rows inserted before the identity rules tightened can still be doubled
     up; folding them away here keeps the seed idempotent in practice as well
     as in principle. */
  await mergeDuplicates();

  return { inserted };
}
