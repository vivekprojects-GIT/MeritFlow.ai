import { ingestBoard, type Board } from '../jobs-ingest-ats';
import { dueCompanies, detectPending, recordScan, type Company } from './registry';

/**
 * The collector: registry in, jobs out.
 *
 * ## Why this is ordinary code
 *
 * Reading a few hundred board endpoints is not a task that needs a model. It is
 * an HTTP request, a JSON parse, and an upsert, and the moment it involves a
 * model it costs money per company and cannot be run often enough to make
 * "posted in the last 24 hours" mean anything. Intelligence belongs later, on
 * the few hundred postings that survive filtering — not on the million that do
 * not.
 *
 * So this layer is deliberately dull, and the dullness is the feature: it is
 * what makes coverage a matter of adding rows rather than adding budget.
 *
 * ## Pacing
 *
 * Sequential, with a per-cycle budget. These are other people's public
 * endpoints; a burst of parallel requests from one host is how an IP gets
 * blocked, which would cost the entire feed to save a few seconds. At the
 * default budget a registry of a few hundred companies is fully refreshed
 * several times a day, which is the cadence freshness actually needs.
 */

export type CollectionCycle = {
  scanned: number;
  stored: number;
  failed: number;
  /** Companies newly identified from their careers page this cycle. */
  detected: number;
  /** Identified, but running a platform nothing collects from yet. */
  unsupported: number;
  perCompany: { company: string; ats: string; stored: number; error?: string }[];
};

/** How many boards one cycle may read, and how many pages it may identify. */
const SCAN_BUDGET = Number(process.env.DISCOVERY_SCAN_BUDGET ?? 25);
const DETECT_BUDGET = Number(process.env.DISCOVERY_DETECT_BUDGET ?? 5);

/** A registry row, as the board collector wants it. */
function boardFor(company: Company): Board | null {
  const vendor = company.ats;
  if (vendor !== 'greenhouse' && vendor !== 'lever' && vendor !== 'ashby') return null;
  return { vendor, token: company.identifier, company: company.name };
}

export async function collectOnce(
  options: { scanBudget?: number; detectBudget?: number; now?: number } = {},
): Promise<CollectionCycle> {
  const out: CollectionCycle = { scanned: 0, stored: 0, failed: 0, detected: 0, unsupported: 0, perCompany: [] };

  /* Identification first, so a company added by URL five minutes ago can be
     collected from in the same cycle rather than the next one. */
  const identified = await detectPending(options.detectBudget ?? DETECT_BUDGET);
  out.detected = identified.detected;
  out.unsupported = identified.unsupported;

  const due = await dueCompanies(options.scanBudget ?? SCAN_BUDGET, options.now);

  for (const company of due) {
    const board = boardFor(company);
    if (!board) {
      await recordScan(company.id, { status: 'unsupported', note: `No collector for ${company.ats}.` });
      continue;
    }

    const result = await ingestBoard(board);
    out.scanned += 1;

    if (result.error) {
      out.failed += 1;
      await recordScan(company.id, { status: 'failed', note: result.error });
      out.perCompany.push({ company: company.name, ats: company.ats, stored: 0, error: result.error });
      continue;
    }

    out.stored += result.stored;
    await recordScan(company.id, {
      /* `empty` is not a failure. A board with no matching openings today is a
         board working correctly, and counting it as a failure would back it off
         until it was checked once a week. */
      status: result.stored > 0 ? 'ok' : 'empty',
      jobCount: result.stored,
      note: `${result.fetched} listed, ${result.stored} kept.`,
    });
    out.perCompany.push({ company: company.name, ats: company.ats, stored: result.stored });
  }

  return out;
}
