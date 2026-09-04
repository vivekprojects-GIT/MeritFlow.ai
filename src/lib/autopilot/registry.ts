import { getDb } from '../db';
import type { AtsVendor } from './execution-policy';

/**
 * The ATS registry.
 *
 * One table describing how each applicant tracking system is reached, what it
 * needs from a candidate, and — the part that makes it worth having — whether
 * any of that has actually been observed recently.
 *
 * ## Declared is not verified
 *
 * The obvious way to build this is to write down what each ATS does. That
 * produces a table of intentions which is correct on the day it is typed and
 * quietly wrong a month later, because employers change forms constantly. It is
 * also exactly what a competitor's "29 ATS systems supported" claim is: a
 * number nobody outside can audit, and — the uncomfortable part — often one
 * nobody inside can audit either.
 *
 * So every capability here carries a provenance. `declared` is what a person
 * believed when they added the row. `verified` is what the harness observed
 * against real tenants, with a timestamp. **The router only trusts verified**,
 * and a vendor whose evidence has gone stale degrades to the generic path
 * rather than being trusted on the strength of an old assertion.
 *
 * That is the difference between a registry and a brochure.
 */

/* ── How an application is actually delivered ────────────────────────────── */

/**
 * The delivery mechanism, in descending order of how much it asks of a person.
 *
 * This is the axis that decides what can be automated, and it matters far more
 * than market share. An ATS behind a login is unreachable for an unattended
 * run no matter how many employers use it — which is why Workday, the single
 * largest platform, sits outside what this product can do on its own.
 */
export const DRIVERS = [
  /** A public endpoint accepts the application. Nothing else needed. */
  'PUBLIC_API',
  /** An API exists but the credential belongs to the employer, not to us. */
  'AUTHORIZED_API',
  /** A form, reachable and submittable without an account. */
  'BROWSER_NO_LOGIN',
  /** Requires an account. Out of scope: this product does not create accounts. */
  'BROWSER_LOGIN',
  /** Requires an emailed code. Reachable only once an account already exists. */
  'BROWSER_EMAIL_OTP',
  /** A visible human challenge. Never defeated, always handed back. */
  'BROWSER_CAPTCHA',
  /** Reachable, but the last step is the candidate's to take. */
  'USER_CONFIRMATION_REQUIRED',
  /** Known, and deliberately not automated. */
  'UNSUPPORTED',
] as const;

export type Driver = (typeof DRIVERS)[number];

/** Drivers an unattended run can complete on its own. */
const AUTONOMOUS: ReadonlySet<Driver> = new Set<Driver>(['PUBLIC_API', 'BROWSER_NO_LOGIN']);

export function isAutonomous(driver: Driver): boolean {
  return AUTONOMOUS.has(driver);
}

/* ── Entries ─────────────────────────────────────────────────────────────── */

export type Provenance = 'declared' | 'verified';

export type RegistryEntry = {
  vendor: AtsVendor;
  name: string;
  /** Hosts that identify this ATS. Documentation; detection lives in adapters. */
  hosts: string[];
  /** How postings are read. */
  discovery: Driver;
  /** How an application is delivered. */
  submission: Driver;
  /** Where these two came from — see the note at the top of this file. */
  provenance: Provenance;
  /** Why, in one line, for whoever reads this in six months. */
  note: string;
};

/**
 * The seed.
 *
 * Deliberately short. Every entry marked `verified` was observed by the harness
 * against live tenants; everything else is `declared` and is treated as a
 * hypothesis rather than a capability. Adding thirty rows of `declared` would
 * make this table look impressive and mean nothing.
 */
export const REGISTRY: RegistryEntry[] = [
  {
    vendor: 'greenhouse',
    name: 'Greenhouse',
    hosts: ['boards.greenhouse.io', 'job-boards.greenhouse.io'],
    discovery: 'PUBLIC_API',
    submission: 'BROWSER_NO_LOGIN',
    provenance: 'verified',
    note: 'Board API is open. Submission API needs an employer credential, so the form is the route.',
  },
  {
    vendor: 'lever',
    name: 'Lever',
    hosts: ['jobs.lever.co'],
    discovery: 'PUBLIC_API',
    submission: 'BROWSER_NO_LOGIN',
    provenance: 'verified',
    note: 'Invisible hCaptcha on most tenants, which scores silently and does not challenge.',
  },
  {
    vendor: 'ashby',
    name: 'Ashby',
    hosts: ['jobs.ashbyhq.com'],
    discovery: 'PUBLIC_API',
    submission: 'BROWSER_NO_LOGIN',
    provenance: 'verified',
    note: 'Fields are named by UUID; the label is the only signal.',
  },
  {
    vendor: 'workday',
    name: 'Workday Recruiting',
    hosts: ['myworkdayjobs.com', 'workday.com'],
    discovery: 'PUBLIC_API',
    submission: 'UNSUPPORTED',
    provenance: 'declared',
    note: 'Site terms prohibit automated access, and applications require an account. Both rule it out.',
  },
  {
    vendor: 'smartrecruiters',
    name: 'SmartRecruiters',
    hosts: ['jobs.smartrecruiters.com'],
    discovery: 'PUBLIC_API',
    submission: 'BROWSER_NO_LOGIN',
    provenance: 'declared',
    note: 'Postings API answers unauthenticated. Submission path not yet observed.',
  },
  {
    vendor: 'icims',
    name: 'iCIMS',
    hosts: ['icims.com'],
    discovery: 'BROWSER_NO_LOGIN',
    submission: 'BROWSER_LOGIN',
    provenance: 'declared',
    note: 'Applications require an account. Out of scope until a candidate has one.',
  },
  {
    vendor: 'oracle',
    name: 'Oracle Recruiting Cloud',
    hosts: ['oraclecloud.com'],
    discovery: 'BROWSER_NO_LOGIN',
    submission: 'BROWSER_LOGIN',
    provenance: 'declared',
    note: 'Applications require a candidate account on the employer tenant. Out of scope for an unattended run.',
  },
  {
    vendor: 'bamboohr',
    name: 'BambooHR',
    hosts: ['bamboohr.com'],
    discovery: 'PUBLIC_API',
    submission: 'BROWSER_NO_LOGIN',
    provenance: 'declared',
    note: 'Public careers endpoint. Submission path not yet observed.',
  },
];

export function entryFor(vendor: AtsVendor): RegistryEntry | null {
  return REGISTRY.find((e) => e.vendor === vendor) ?? null;
}

/* ── Evidence ────────────────────────────────────────────────────────────── */

/**
 * What the harness last observed for one vendor.
 *
 * The half of the registry that cannot be written by hand. Without it, a row
 * saying "Lever: BROWSER_NO_LOGIN" is a claim from whenever someone typed it;
 * with it, the router can decline a vendor whose reads started failing last
 * week instead of discovering that one candidate at a time.
 */
export type AtsHealth = {
  vendor: AtsVendor;
  /** Tenants attempted in the last run. */
  attempted: number;
  /** Tenants whose application form was read completely. */
  complete: number;
  checkedAt: number;
};

export async function recordHealth(rows: Omit<AtsHealth, 'checkedAt'>[]): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  for (const r of rows) {
    await db.query(
      `INSERT INTO ats_health (vendor, attempted, complete, checked_at)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (vendor) DO UPDATE SET
         attempted = EXCLUDED.attempted, complete = EXCLUDED.complete, checked_at = EXCLUDED.checked_at`,
      [r.vendor, r.attempted, r.complete, now],
    );
  }
}

export async function getHealth(): Promise<AtsHealth[]> {
  const db = await getDb();
  const res = await db.query<Record<string, unknown>>('SELECT * FROM ats_health');
  return res.rows.map((r) => ({
    vendor: String(r.vendor) as AtsVendor,
    attempted: Number(r.attempted ?? 0),
    complete: Number(r.complete ?? 0),
    checkedAt: Number(r.checked_at ?? 0),
  }));
}

/** Evidence older than this is no longer evidence. */
export const STALE_AFTER_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Should an unattended run trust this vendor right now?
 *
 * Three ways to get a no, and they are different problems: the mechanism needs
 * a person, nobody has checked recently, or the last check went badly. The
 * caller gets the reason rather than a boolean, because "we have not looked at
 * Lever in a month" and "Lever broke" call for opposite responses.
 */
export function trustFor(
  vendor: AtsVendor,
  health: AtsHealth[],
  now = Date.now(),
): { trusted: boolean; reason: string } {
  const entry = entryFor(vendor);
  if (!entry) return { trusted: false, reason: 'Not in the registry.' };

  if (!isAutonomous(entry.submission)) {
    return { trusted: false, reason: `${entry.name} needs a person: ${entry.submission}.` };
  }

  const seen = health.find((h) => h.vendor === vendor);
  if (!seen || seen.checkedAt === 0) {
    return { trusted: false, reason: `${entry.name} has never been verified by the harness.` };
  }
  if (now - seen.checkedAt > STALE_AFTER_MS) {
    return { trusted: false, reason: `${entry.name} was last verified ${Math.round((now - seen.checkedAt) / 86_400_000)} days ago.` };
  }
  if (seen.attempted === 0) {
    return { trusted: false, reason: `${entry.name} had no reachable tenants at the last check.` };
  }

  /* Two thirds reading completely is the bar. Below that the adapter is not
     broken so much as unreliable, and an unattended run is the worst place to
     find that out. */
  const rate = seen.complete / seen.attempted;
  if (rate < 0.67) {
    return {
      trusted: false,
      reason: `${entry.name} read only ${seen.complete} of ${seen.attempted} tenants completely at the last check.`,
    };
  }

  return { trusted: true, reason: `${seen.complete}/${seen.attempted} tenants verified` };
}
