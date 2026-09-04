import { randomUUID } from 'node:crypto';
import { getDb } from '../db';
import { COLLECTABLE, detect, type AtsType, type Detection } from './detect';
import { probeBoards } from './probe';

/**
 * The company registry.
 *
 * ## What it replaces
 *
 * A fourteen-element array of board tokens compiled into the application. That
 * proved the collectors work and could never be the discovery layer, because
 * adding an employer meant editing TypeScript and shipping.
 *
 * This is the same information as data: one row per employer, carrying which
 * applicant tracking system they run and the handle it knows them by. Coverage
 * grows by inserting rows. The collectors do not change.
 *
 * ## Scheduling lives here too
 *
 * Because "which company to look at next" is a property of the registry, not of
 * any collector. The queue is oldest-scan-first with exponential backoff on
 * consecutive failures, so a company that has left its vendor stops costing a
 * request every cycle instead of being retried forever — the thing that makes
 * the difference between a list of 50 and a list of 50,000.
 */

export type Company = {
  id: string;
  name: string;
  careerUrl: string;
  ats: AtsType;
  identifier: string;
  country: string;
  lastScanned: number;
  status: 'pending' | 'ok' | 'empty' | 'failed' | 'unsupported';
  note: string;
  jobCount: number;
  failureCount: number;
  /** The employer's own domain. Enough to probe with, on its own. */
  domain: string;
  /** A, B or C. How hard this row is worth working. */
  priority: string;
  /** Which list it came from, so a bad source can be identified and dropped. */
  source: string;
  industry: string;
};

/**
 * How long before a company is due again.
 *
 * A healthy board is re-read a few times a day, which is what makes "posted in
 * the last 24 hours" mean anything. Failures back off geometrically and cap at
 * a week: a token that 404s is usually gone for good, and the cap is there so a
 * company that fixes its board is eventually picked up again rather than being
 * written off permanently.
 */
const BASE_INTERVAL_MS = 6 * 3600_000;
const MAX_BACKOFF_MS = 7 * 24 * 3600_000;

export function dueAt(company: Pick<Company, 'lastScanned' | 'failureCount'>): number {
  const backoff = Math.min(MAX_BACKOFF_MS, BASE_INTERVAL_MS * 2 ** Math.min(company.failureCount, 8));
  return company.lastScanned + backoff;
}

function map(r: Record<string, unknown>): Company {
  return {
    id: String(r.id),
    name: String(r.name),
    careerUrl: String(r.career_url ?? ''),
    ats: String(r.ats_type ?? 'unknown') as AtsType,
    identifier: String(r.ats_identifier ?? ''),
    country: String(r.country ?? ''),
    lastScanned: Number(r.last_scanned ?? 0),
    status: String(r.scan_status ?? 'pending') as Company['status'],
    note: String(r.scan_note ?? ''),
    jobCount: Number(r.job_count ?? 0),
    failureCount: Number(r.failure_count ?? 0),
    domain: String(r.domain ?? ''),
    priority: String(r.priority ?? 'B'),
    source: String(r.source ?? 'seed'),
    industry: String(r.industry ?? ''),
  };
}

/**
 * Add or update one employer.
 *
 * Keyed on the platform identity rather than the name, because "Stripe" and
 * "Stripe, Inc." are one employer and `greenhouse/stripe` is unambiguous. A
 * company whose identifier is not yet known is keyed on its careers URL until
 * detection fills one in.
 */
export async function upsertCompany(input: {
  name: string;
  careerUrl?: string;
  ats?: AtsType;
  identifier?: string;
  country?: string;
}): Promise<Company> {
  const db = await getDb();
  const now = Date.now();
  const ats = input.ats ?? 'unknown';
  const identifier = (input.identifier ?? '').trim();
  const careerUrl = (input.careerUrl ?? '').trim();

  /*
   * Match on identity, then URL, then name.
   *
   * The name clause is what stops one employer becoming two rows. Seeding
   * Databricks twice -- once with its Greenhouse token and once with its
   * careers URL -- produced exactly that: one row happily collecting 199 jobs
   * and a second marked "no applicant tracking system could be identified",
   * which reads on the coverage screen as a company we are failing to reach
   * while we are in fact reaching it.
   *
   * Case-insensitive, because "Scale AI" and "Scale Ai" are one company.
   */
  const existing = identifier
    ? await db.query<Record<string, unknown>>(
        'SELECT * FROM companies WHERE ats_type = $1 AND ats_identifier = $2',
        [ats, identifier],
      )
    : await db.query<Record<string, unknown>>(
        `SELECT * FROM companies
          WHERE (career_url = $1 AND career_url <> '') OR lower(name) = lower($2)
          ORDER BY (ats_identifier <> '') DESC
          LIMIT 1`,
        [careerUrl, input.name],
      );

  if (existing.rows[0]) {
    const row = map(existing.rows[0]);
    /* Never trade a working identifier for an empty one. A careers page that
       renders its jobs in the browser tells us nothing, and "nothing" must not
       overwrite a token that is currently collecting. */
    if (row.identifier && !identifier) {
      await db.query('UPDATE companies SET career_url = $1, updated_at = $2 WHERE id = $3', [
        careerUrl || row.careerUrl,
        now,
        row.id,
      ]);
      return { ...row, careerUrl: careerUrl || row.careerUrl };
    }
    await db.query(
      `UPDATE companies SET name = $1, career_url = $2, ats_type = $3, ats_identifier = $4,
              country = $5, updated_at = $6 WHERE id = $7`,
      [input.name || row.name, careerUrl || row.careerUrl, ats !== 'unknown' ? ats : row.ats, identifier || row.identifier, input.country ?? row.country, now, row.id],
    );
    return { ...row, name: input.name || row.name, careerUrl: careerUrl || row.careerUrl, ats: ats !== 'unknown' ? ats : row.ats, identifier: identifier || row.identifier };
  }

  const id = randomUUID();
  await db.query(
    `INSERT INTO companies (id, name, career_url, ats_type, ats_identifier, country,
                            scan_status, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)`,
    [id, input.name, careerUrl, ats, identifier, input.country ?? '', identifier && COLLECTABLE.has(ats) ? 'pending' : ats === 'unknown' ? 'pending' : 'unsupported', now],
  );

  return {
    id,
    name: input.name,
    careerUrl,
    ats,
    identifier,
    country: input.country ?? '',
    lastScanned: 0,
    status: 'pending',
    note: '',
    jobCount: 0,
    failureCount: 0,
    domain: '',
    priority: 'B',
    source: 'seed',
    industry: '',
  };
}

/** Companies whose platform we can collect from, oldest scan first. */
export async function dueCompanies(limit: number, now = Date.now()): Promise<Company[]> {
  const db = await getDb();
  const res = await db.query<Record<string, unknown>>(
    `SELECT * FROM companies
      WHERE ats_identifier <> '' AND ats_type = ANY($1)
      ORDER BY last_scanned ASC
      LIMIT $2`,
    [[...COLLECTABLE], Math.max(1, limit) * 4],
  );

  /* Backoff is applied here rather than in SQL: the interval is a function of
     the failure count, and expressing that as a predicate makes the query
     harder to read than the loop it replaces. */
  return res.rows.map(map).filter((c) => dueAt(c) <= now).slice(0, limit);
}

/** Companies that still need their platform identified. */
export async function undetectedCompanies(limit: number): Promise<Company[]> {
  const db = await getDb();
  /*
   * Priority first, then least-recently-touched.
   *
   * A bulk import is tens of thousands of rows and identification costs a
   * request each, so the order it works in decides what the product can see
   * this week rather than next month. The source list scores each company from
   * its industry and headcount; A is where the roles this candidate wants
   * actually are.
   *
   * A domain alone is enough to try -- the probe asks the vendors directly, and
   * that is both cheaper and more decisive than guessing a careers path.
   */
  const res = await db.query<Record<string, unknown>>(
    `SELECT * FROM companies
      WHERE ats_identifier = ''
        AND (career_url <> '' OR domain <> '')
        AND scan_status <> 'unsupported'
      ORDER BY priority ASC, failure_count ASC, updated_at ASC
      LIMIT $1`,
    [limit],
  );
  return res.rows.map(map);
}

/** Record what a scan found. */
export async function recordScan(
  id: string,
  outcome: { status: Company['status']; jobCount?: number; note?: string },
): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  const failed = outcome.status === 'failed';

  await db.query(
    `UPDATE companies
        SET last_scanned = $1,
            scan_status  = $2,
            scan_note    = $3,
            job_count    = COALESCE($4, job_count),
            failure_count = CASE WHEN $5 THEN failure_count + 1 ELSE 0 END,
            updated_at   = $1
      WHERE id = $6`,
    [now, outcome.status, (outcome.note ?? '').slice(0, 300), outcome.jobCount ?? null, failed, id],
  );
}

/**
 * Identify the platform for companies that have a careers URL and nothing else.
 *
 * Run in small batches: each one is an HTTP request to somebody's careers page,
 * and there is no hurry — a company that is identified an hour from now is
 * still identified long before anyone would have got to it by hand.
 */
export async function detectPending(limit = 10, fetchImpl = fetch): Promise<{ detected: number; unsupported: number }> {
  const pending = await undetectedCompanies(limit);
  let detected = 0;
  let unsupported = 0;

  for (const company of pending) {
    let result: Detection;
    try {
      /* No careers URL means nothing to read, so go straight to the vendors.
         That is the common case for a bulk-imported list, which carries a
         website and no more. */
      result = company.careerUrl
        ? await detect(company.careerUrl, fetchImpl)
        : { ats: 'unknown', identifier: '', evidence: 'none', collectable: false };

      /*
       * A careers page that renders in the browser tells us nothing.
       *
       * Its markup is an empty shell and the board call happens in JavaScript
       * we are not running, so page detection returns "custom" for companies
       * that are plainly on a board -- Stripe, Databricks and Instacart all
       * came back that way while being Greenhouse boards named after
       * themselves. Falling back to a probe recovers them, and the probe only
       * accepts a token the vendor itself confirms has postings.
       */
      if (!result.identifier) {
        const probed = await probeBoards(
          { name: company.name, careerUrl: company.careerUrl || (company.domain ? `https://${company.domain}` : '') },
          fetchImpl,
        );
        if (probed.identifier) result = probed;
      }
    } catch {
      await recordScan(company.id, { status: 'failed', note: 'Could not read the careers page.' });
      continue;
    }

    const db = await getDb();

    /*
     * Detection can discover that two rows are the same employer.
     *
     * A company seeded twice -- once with a board token, once with just a
     * careers URL -- is two rows until something works out that the second one
     * resolves to the first one's identity. That moment is here, and the
     * unique index on (ats_type, ats_identifier) turns it into a crash unless
     * it is handled: probing Stripe's careers page correctly returned
     * `greenhouse/stripe`, which already existed, and the whole cycle failed.
     *
     * Merging keeps the row that is already collecting -- it has the scan
     * history and the job count -- and folds the careers URL onto it.
     */
    if (result.identifier) {
      const clash = await db.query<{ id: string }>(
        'SELECT id FROM companies WHERE ats_type = $1 AND ats_identifier = $2 AND id <> $3',
        [result.ats, result.identifier, company.id],
      );

      if (clash.rows[0]) {
        await db.query(
          "UPDATE companies SET career_url = CASE WHEN career_url = '' THEN $1 ELSE career_url END, updated_at = $2 WHERE id = $3",
          [company.careerUrl, Date.now(), clash.rows[0].id],
        );
        await db.query('DELETE FROM companies WHERE id = $1', [company.id]);
        detected += 1;
        continue;
      }
    }

    await db.query('UPDATE companies SET ats_type = $1, ats_identifier = $2, updated_at = $3 WHERE id = $4', [
      result.ats,
      result.identifier,
      Date.now(),
      company.id,
    ]);

    if (result.identifier && result.collectable) {
      detected += 1;
      await recordScan(company.id, { status: 'pending', note: `Detected ${result.ats} via ${result.evidence}.` });
    } else {
      unsupported += 1;
      const vendor = result.vendor ?? (result.ats !== 'custom' && result.ats !== 'unknown' ? result.ats : '');
      await recordScan(company.id, {
        status: 'unsupported',
        note: vendor
          ? `Runs ${vendor}; no collector for it yet.`
          : 'No board found from their careers page or by probing the vendor APIs.',
      });
    }
  }

  return { detected, unsupported };
}

/**
 * Fold away rows that turned out to be the same employer.
 *
 * Two rows for one company is not merely untidy: the coverage screen reports
 * one of them as an employer we cannot reach while the other quietly collects
 * two hundred of their jobs, which makes the number that matters -- how much of
 * the market we actually see -- wrong in the pessimistic direction.
 *
 * Only ever deletes the row with no identifier, so nothing that is collecting
 * can be removed by this.
 */
export async function mergeDuplicates(): Promise<number> {
  const db = await getDb();
  const res = await db.query(
    `DELETE FROM companies a
      WHERE a.ats_identifier = ''
        AND EXISTS (
          SELECT 1 FROM companies b
           WHERE b.id <> a.id
             AND b.ats_identifier <> ''
             AND lower(b.name) = lower(a.name)
        )`,
  );
  return res.affectedRows ?? 0;
}

/** The registry as a list, newest activity first. For the coverage screen. */
export async function listCompanies(limit = 200): Promise<Company[]> {
  const db = await getDb();
  const res = await db.query<Record<string, unknown>>(
    'SELECT * FROM companies ORDER BY job_count DESC, name ASC LIMIT $1',
    [limit],
  );
  return res.rows.map(map);
}

/**
 * What this system is actually sized for.
 *
 * A thousand fresh postings a day, not a million active ones. The distinction
 * decides the whole architecture: a million-row corpus needs real Postgres, a
 * sharded collector fleet and a deduplication service, while a thousand a day
 * is a few hundred boards read on a timer into the database we already have.
 *
 * The lever is company count, not scan rate. A healthy board yields a handful
 * of relevant postings a day, so coverage -- not crawl speed -- is what moves
 * this number, which is why the registry matters more than the collectors.
 */
export const TARGET_JOBS_PER_DAY = 1_000;

/** Relevant postings a collectable board yields per day, measured. */
const YIELD_PER_COMPANY_PER_DAY = 3.5;

/** Registry-wide counters for the command centre. */
export async function registryStats(): Promise<{
  companies: number;
  collectable: number;
  byAts: { ats: string; companies: number; jobs: number }[];
  scannedLastDay: number;
  failing: number;
  target: { jobsPerDay: number; companiesNeeded: number; companiesShort: number };
}> {
  const db = await getDb();
  const day = Date.now() - 24 * 3600_000;

  const [total, byAts, recent, failing] = await Promise.all([
    db.query<{ n: string }>('SELECT count(*)::text AS n FROM companies'),
    db.query<{ ats_type: string; c: string; j: string }>(
      `SELECT ats_type, count(*)::text AS c, COALESCE(sum(job_count),0)::text AS j
         FROM companies GROUP BY ats_type ORDER BY count(*) DESC`,
    ),
    db.query<{ n: string }>('SELECT count(*)::text AS n FROM companies WHERE last_scanned > $1', [day]),
    db.query<{ n: string }>('SELECT count(*)::text AS n FROM companies WHERE failure_count > 0'),
  ]);

  const rows = byAts.rows.map((r) => ({ ats: r.ats_type, companies: Number(r.c), jobs: Number(r.j) }));

  const collectable = rows.filter((r) => COLLECTABLE.has(r.ats as AtsType)).reduce((n, r) => n + r.companies, 0);

  return {
    companies: Number(total.rows[0]?.n ?? 0),
    collectable,
    byAts: rows,
    scannedLastDay: Number(recent.rows[0]?.n ?? 0),
    failing: Number(failing.rows[0]?.n ?? 0),
    /* Stated as a shortfall in companies rather than a percentage, because
       companies are the thing anyone can actually go and add. */
    target: {
      jobsPerDay: TARGET_JOBS_PER_DAY,
      companiesNeeded: Math.ceil(TARGET_JOBS_PER_DAY / YIELD_PER_COMPANY_PER_DAY),
      companiesShort: Math.max(0, Math.ceil(TARGET_JOBS_PER_DAY / YIELD_PER_COMPANY_PER_DAY) - collectable),
    },
  };
}
