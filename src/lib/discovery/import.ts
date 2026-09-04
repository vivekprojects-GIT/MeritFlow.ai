import { randomUUID } from 'node:crypto';
import { getDb } from '../db';

/**
 * Bulk import into the company registry.
 *
 * ## What this is for
 *
 * Coverage is a data problem, not an engineering one — that is the whole point
 * of the registry. A public company list with websites is enough to seed
 * thousands of employers; detection and probing then work out which platform
 * each one runs, on their own schedule, and the collectors take it from there.
 *
 * The Inc. 5000 list is one such source: 5,012 companies with websites,
 * industries and headcounts. Others slot in the same way. Nothing downstream
 * knows or cares where a row came from, beyond the `source` column that lets a
 * bad list be identified and removed.
 *
 * ## Why the careers URL is left empty
 *
 * Because we do not know it, and inventing `https://domain/careers` would spend
 * a request per company on a guess that is wrong often enough to matter. The
 * domain is the honest input, and the probe asks the vendors directly — which
 * is both cheaper and decisive, since the vendor is the authority on whether a
 * board exists.
 */

export type ImportRow = {
  name: string;
  domain?: string;
  website?: string;
  careerUrl?: string;
  industry?: string;
  /** A, B or C. Anything else is treated as B. */
  priority?: string;
  country?: string;
};

export type ImportResult = { inserted: number; updated: number; skipped: number };

const PRIORITIES = new Set(['A', 'B', 'C']);

function cleanDomain(row: ImportRow): string {
  const raw = (row.domain ?? row.website ?? '').trim();
  if (!raw) return '';
  try {
    return new URL(raw.startsWith('http') ? raw : `https://${raw}`).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return raw.toLowerCase().replace(/^www\./, '').split('/')[0];
  }
}

/**
 * Insert or refresh many companies.
 *
 * Batched in one transaction per chunk rather than one per row: five thousand
 * individual transactions is slow, and the whole point of this path is that
 * adding coverage should be cheap.
 *
 * Existing rows are matched on domain and never downgraded — an employer that
 * is already collecting keeps its identifier and its scan history, and gains
 * only the metadata the list adds.
 */
export async function importCompanies(rows: ImportRow[], source = 'import'): Promise<ImportResult> {
  const db = await getDb();
  const now = Date.now();
  const out: ImportResult = { inserted: 0, updated: 0, skipped: 0 };

  /* One lookup for the whole batch. Five thousand round trips to ask "do you
     already have this domain" is the slowest possible way to find out. */
  const existing = await db.query<{ domain: string; name: string }>(
    "SELECT lower(domain) AS domain, lower(name) AS name FROM companies WHERE domain <> '' OR name <> ''",
  );
  const knownDomains = new Set(existing.rows.map((r) => r.domain).filter(Boolean));
  const knownNames = new Set(existing.rows.map((r) => r.name).filter(Boolean));

  for (const row of rows) {
    const name = (row.name ?? '').trim();
    const domain = cleanDomain(row);

    /* A row with no name and no domain is nothing we can act on, and a row
       whose "domain" is a bare TLD or a path fragment is worse than nothing —
       it would be probed forever. */
    if (!name || !domain || !domain.includes('.')) {
      out.skipped += 1;
      continue;
    }

    if (knownDomains.has(domain) || knownNames.has(name.toLowerCase())) {
      out.updated += 1;
      await db.query(
        `UPDATE companies
            SET industry = CASE WHEN industry = '' THEN $1 ELSE industry END,
                priority = $2,
                domain   = CASE WHEN domain = '' THEN $3 ELSE domain END,
                updated_at = $4
          WHERE lower(domain) = $3 OR lower(name) = lower($5)`,
        [row.industry ?? '', PRIORITIES.has(row.priority ?? '') ? row.priority : 'B', domain, now, name],
      );
      continue;
    }

    knownDomains.add(domain);
    knownNames.add(name.toLowerCase());

    await db.query(
      `INSERT INTO companies
         (id, name, career_url, ats_type, ats_identifier, country, domain, priority, source,
          industry, scan_status, created_at, updated_at)
       VALUES ($1,$2,$3,'unknown','',$4,$5,$6,$7,$8,'pending',$9,$9)`,
      [
        randomUUID(),
        name.slice(0, 200),
        (row.careerUrl ?? '').trim().slice(0, 500),
        (row.country ?? 'US').slice(0, 4),
        domain.slice(0, 200),
        PRIORITIES.has(row.priority ?? '') ? row.priority : 'B',
        source.slice(0, 40),
        (row.industry ?? '').slice(0, 100),
        now,
      ],
    );
    out.inserted += 1;
  }

  return out;
}

/**
 * Parse the CSV a registry-builder script produces.
 *
 * Deliberately tolerant about column names, because the useful public company
 * lists all describe the same four things — name, website, industry, size —
 * and each one names them differently. Anything it cannot map is skipped rather
 * than guessed at.
 */
export function parseRegistryCsv(text: string): ImportRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const header = splitCsvLine(lines[0]).map((h) => h.replace(/^﻿/, '').trim().toLowerCase());
  const at = (...names: string[]) => {
    for (const n of names) {
      const i = header.indexOf(n);
      if (i !== -1) return i;
    }
    return -1;
  };

  const cols = {
    name: at('company_name', 'name', 'company'),
    domain: at('normalized_domain', 'domain'),
    website: at('official_website', 'website', 'url'),
    career: at('career_url', 'careers_url', 'careers'),
    industry: at('industry', 'sector'),
    priority: at('job_scan_priority', 'priority'),
    country: at('country'),
  };

  if (cols.name === -1) return [];

  const out: ImportRow[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const pick = (i: number) => (i === -1 ? '' : (cells[i] ?? '').trim());
    const name = pick(cols.name);
    if (!name) continue;

    out.push({
      name,
      domain: pick(cols.domain),
      website: pick(cols.website),
      careerUrl: pick(cols.career),
      industry: pick(cols.industry),
      priority: pick(cols.priority).toUpperCase(),
      country: pick(cols.country) || 'US',
    });
  }

  return out;
}

/** A CSV line splitter that respects quoted fields containing commas. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        /* A doubled quote inside a quoted field is one literal quote. */
        if (line[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      out.push(cell);
      cell = '';
    } else {
      cell += ch;
    }
  }

  out.push(cell);
  return out;
}
