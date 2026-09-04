/**
 * Execution policy — where Autopilot is allowed to actually act.
 *
 * The mistake this exists to prevent is encoding a single company-wide belief
 * about "whether ATS automation is allowed". That question does not have one
 * answer. Workday's site terms explicitly prohibit automated access without
 * consent. iCIMS runs a sanctioned integration programme with its own developer
 * terms. Greenhouse's public legal pages do not establish a candidate-side ban,
 * and Lever's terms principally bind its customers rather than candidates. An
 * individual employer may also impose their own rules on their own careers page.
 *
 * So the engine is built once, and *where it may execute* is data — keyed by
 * ATS, by employer domain, and by mechanism — reviewed independently and
 * changed without touching the workflow.
 *
 * Nothing here is a legal opinion. It is a control surface, and every entry
 * starts at UNREVIEWED until a human has looked at that specific path.
 */

export const EXECUTION_STATUSES = [
  /** An official API or sanctioned integration exists. Always preferred. */
  'PARTNER_API',
  /** Reviewed and approved for automated browser submission. */
  'PERMITTED_BROWSER',
  /** We may prepare everything, but a human presses submit. */
  'ASSISTED_ONLY',
  /** Something in the flow needs the person: login, CAPTCHA, an attestation. */
  'USER_ACTION_REQUIRED',
  /** Explicitly off. Never execute here. */
  'BLOCKED',
  /** Nobody has looked at this path yet. Treated as ASSISTED_ONLY. */
  'UNREVIEWED',
] as const;

export type ExecutionStatus = (typeof EXECUTION_STATUSES)[number];

export type Mechanism = 'api' | 'browser' | 'email';

export type AtsVendor =
  | 'greenhouse'
  | 'lever'
  | 'ashby'
  | 'workday'
  | 'smartrecruiters'
  | 'icims'
  | 'oracle'
  | 'bamboohr'
  | 'unknown';

export type PolicyKey = {
  ats: AtsVendor;
  /** Employer domain, when an employer-specific rule should override the ATS. */
  employerDomain?: string;
  mechanism: Mechanism;
};

export type PolicyRecord = {
  status: ExecutionStatus;
  /** Why this status — shown to the user when Autopilot declines to submit. */
  rationale: string;
  /** Who decided, and when. An unreviewed path has neither. */
  reviewedBy?: string;
  reviewedAt?: number;
};

/**
 * The policy table.
 *
 * Deliberately conservative at every entry: nothing is PERMITTED_BROWSER today,
 * because no path has been reviewed and approved for live submission yet. Dry
 * runs are unaffected — they never submit, so they run regardless of status.
 */
const TABLE: { key: PolicyKey; record: PolicyRecord }[] = [
  {
    key: { ats: 'greenhouse', mechanism: 'api' },
    record: {
      status: 'ASSISTED_ONLY',
      rationale:
        'Greenhouse publishes a public job-board API we use to read postings and application questions. Reading is uncontroversial; automated submission has not been reviewed for this path, so materials are prepared and the candidate submits.',
    },
  },
  {
    key: { ats: 'greenhouse', mechanism: 'browser' },
    record: { status: 'UNREVIEWED', rationale: 'Browser submission to Greenhouse has not been reviewed.' },
  },
  {
    key: { ats: 'lever', mechanism: 'browser' },
    record: { status: 'UNREVIEWED', rationale: 'Not yet reviewed.' },
  },
  {
    key: { ats: 'ashby', mechanism: 'browser' },
    record: { status: 'UNREVIEWED', rationale: 'Not yet reviewed.' },
  },
  {
    key: { ats: 'icims', mechanism: 'api' },
    record: {
      status: 'UNREVIEWED',
      rationale:
        'iCIMS operates a developer/integration programme. This path should go through that programme rather than the browser, and requires their terms to be met before it is enabled.',
    },
  },
  {
    key: { ats: 'workday', mechanism: 'browser' },
    record: {
      status: 'BLOCKED',
      rationale:
        "Workday's site terms prohibit accessing the site with automated scripts without consent. Autopilot prepares the application; the candidate completes it in their own browser session.",
      reviewedBy: 'engineering',
      reviewedAt: Date.UTC(2026, 7, 10),
    },
  },
  {
    key: { ats: 'workday', mechanism: 'api' },
    record: {
      status: 'UNREVIEWED',
      rationale: 'Only viable through an authorized integration path. Not established.',
    },
  },
];

/** Unreviewed paths behave as assisted: prepare everything, let the human send. */
const DEFAULT: PolicyRecord = {
  status: 'UNREVIEWED',
  rationale: 'This application path has not been reviewed. Autopilot prepares the application for you to submit.',
};

/**
 * Resolve the policy for a path.
 *
 * Most specific wins: an employer-specific rule beats the ATS default, because
 * a single employer may forbid what their ATS vendor permits. Falls back to
 * DEFAULT rather than to "allow" — an unknown path is never an open one.
 */
/**
 * The operator's submission allowlist.
 *
 * `AUTOPILOT_SUBMIT_ENABLED="greenhouse,lever"` turns real submission on for
 * those vendors and nothing else. It is an environment variable rather than a
 * settings toggle because enabling it is an operator decision about a specific
 * ATS, taken once after reviewing that path — not something an end user should
 * be able to switch on for themselves from a preferences screen.
 *
 * Empty or unset means every path stays at prepare-only, which is the default.
 */
export function submitEnabledFor(ats: AtsVendor): boolean {
  const raw = process.env.AUTOPILOT_SUBMIT_ENABLED?.trim();
  if (!raw) return false;
  const allowed = new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  return allowed.has(ats) || allowed.has('all');
}

export function resolveExecutionPolicy(key: PolicyKey): PolicyRecord {
  const base = resolveTable(key);

  /* The allowlist can promote a path that nobody has reviewed, but it can
     never override an explicit BLOCKED or a path that needs the person. A
     deliberate block exists because of something specific — Workday's terms,
     or an employer's own rule — and an operator flag set months later should
     not silently reverse it. */
  if (base.status === 'BLOCKED' || base.status === 'USER_ACTION_REQUIRED') return base;
  if (!submitEnabledFor(key.ats)) return base;
  if (base.status === 'PARTNER_API' || base.status === 'PERMITTED_BROWSER') return base;

  return {
    ...base,
    status: 'PERMITTED_BROWSER',
    rationale: `${base.rationale} Submission enabled for ${key.ats} by operator configuration.`,
  };
}

function resolveTable(key: PolicyKey): PolicyRecord {
  if (key.employerDomain) {
    const exact = TABLE.find(
      (e) =>
        e.key.ats === key.ats &&
        e.key.mechanism === key.mechanism &&
        e.key.employerDomain?.toLowerCase() === key.employerDomain?.toLowerCase(),
    );
    if (exact) return exact.record;
  }
  const byAts = TABLE.find((e) => e.key.ats === key.ats && e.key.mechanism === key.mechanism && !e.key.employerDomain);
  return byAts?.record ?? DEFAULT;
}

/** May this path submit on the candidate's behalf, right now? */
export function mayAutoSubmit(record: PolicyRecord): boolean {
  return record.status === 'PARTNER_API' || record.status === 'PERMITTED_BROWSER';
}

/**
 * May we point a headless browser at this path at all?
 *
 * Distinct from `mayAutoSubmit`, and previously missing — which left a real
 * inconsistency in the engine. The Workday row is BLOCKED because their terms
 * prohibit automated access to the site, but the workflow ran `inspect()`
 * before consulting any of that, so a blocked posting still got a scripted
 * Chromium session against it. The block only stopped the final click, which is
 * not what the rationale says.
 *
 * BLOCKED now means no automated request is made, and the candidate is handed
 * the link to open themselves.
 */
export function mayDriveBrowser(record: PolicyRecord): boolean {
  return record.status !== 'BLOCKED';
}

/**
 * Identify the ATS behind a posting URL.
 *
 * Host-based, and returns 'unknown' rather than guessing — a wrong vendor id
 * would select the wrong adapter and, worse, the wrong execution policy.
 */
export function detectAts(url: string): { ats: AtsVendor; employerDomain?: string } {
  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return { ats: 'unknown' };
  }

  const map: [string, AtsVendor][] = [
    ['greenhouse.io', 'greenhouse'],
    ['lever.co', 'lever'],
    ['ashbyhq.com', 'ashby'],
    ['myworkdayjobs.com', 'workday'],
    ['workday.com', 'workday'],
    ['smartrecruiters.com', 'smartrecruiters'],
    ['icims.com', 'icims'],
    ['oraclecloud.com', 'oracle'],
    ['bamboohr.com', 'bamboohr'],
  ];
  for (const [needle, ats] of map) {
    if (host.endsWith(needle) || host.includes(`.${needle}`)) return { ats, employerDomain: host };
  }
  return { ats: 'unknown', employerDomain: host };
}
