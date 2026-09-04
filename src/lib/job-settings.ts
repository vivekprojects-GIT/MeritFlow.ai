import { randomBytes } from 'node:crypto';
import { getDb } from './db';

/**
 * JobPilot settings.
 *
 * One row per learner, created lazily. Everything here is editable — that was
 * the gap: a candidate could complete onboarding and then had no way to change
 * a phone number, swap a résumé, or turn anything off.
 */

export type Optimization = 'off' | 'honest' | 'aggressive';

export type JobSettings = {
  optimization: Optimization;
  autoApprove: boolean;
  reviewBefore: boolean;
  /** Send prepared applications without asking each time. Off by default. */
  autoSubmit: boolean;
  publicPortfolio: boolean;
  /** The dedicated application address. Generated once, never reissued. */
  applyAlias: string | null;
  emailRecs: boolean;
  emailProduct: boolean;
  emailPausedUntil: number | null;
  timezone: string;
  referralCode: string | null;
  /** Secret in the subscribable calendar feed URL. Issued on demand. */
  calendarToken: string | null;
  /** Credential the browser extension uses. Separate from the session cookie. */
  extensionToken: string | null;
  /** Autonomous mode: the worker runs this account without anyone present. */
  autonomous: boolean;
  autonomousLastRunAt: number;
};

const DEFAULTS: JobSettings = {
  optimization: 'honest',
  autoApprove: false,
  /* Off by default, and the one setting that decides whether an employer
     actually receives something. */
  autoSubmit: false,
  /* On by default. Off means an application is sent before the candidate has
     seen it, and that should be a deliberate choice rather than a default. */
  reviewBefore: true,
  publicPortfolio: false,
  applyAlias: null,
  emailRecs: true,
  emailProduct: true,
  emailPausedUntil: null,
  timezone: '',
  referralCode: null,
  calendarToken: null,
  extensionToken: null,
  autonomous: false,
  autonomousLastRunAt: 0,
};

/**
 * The domain applications mail is received on.
 *
 * Configurable because the alias is only useful once inbound routing exists for
 * whatever domain you actually own. Absent, aliases are not issued at all —
 * handing someone an address that silently drops recruiter mail is worse than
 * not offering one.
 */
export function applyDomain(): string | null {
  return process.env.APPLY_EMAIL_DOMAIN?.trim() || null;
}

/** Human-ish, collision-resistant, and stable once issued. */
function mintAlias(email: string): string {
  const stem = (email.split('@')[0] || 'apply').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12) || 'apply';
  return `${stem}.${randomBytes(3).toString('hex')}`;
}

export async function getJobSettings(userId: string): Promise<JobSettings> {
  const db = await getDb();
  const res = await db.query<Record<string, unknown>>('SELECT * FROM job_settings WHERE user_id = $1', [userId]);
  const r = res.rows[0];
  if (!r) return { ...DEFAULTS };
  return {
    optimization: (String(r.optimization) as Optimization) ?? 'honest',
    autoApprove: Boolean(r.auto_approve),
    autoSubmit: Boolean(r.auto_submit),
    reviewBefore: Boolean(r.review_before),
    publicPortfolio: Boolean(r.public_portfolio),
    applyAlias: r.apply_alias == null ? null : String(r.apply_alias),
    emailRecs: Boolean(r.email_recs),
    emailProduct: Boolean(r.email_product),
    emailPausedUntil: r.email_paused_until == null ? null : Number(r.email_paused_until),
    timezone: String(r.timezone ?? ''),
    referralCode: r.referral_code == null ? null : String(r.referral_code),
    calendarToken: r.calendar_token == null ? null : String(r.calendar_token),
    extensionToken: r.extension_token == null ? null : String(r.extension_token),
    autonomous: Boolean(r.autonomous),
    autonomousLastRunAt: Number(r.autonomous_last_run_at ?? 0),
  };
}

export async function saveJobSettings(userId: string, patch: Partial<JobSettings>): Promise<JobSettings> {
  const current = await getJobSettings(userId);

  /* Spreading `patch` directly would let an explicit `undefined` win over the
     stored value, because object spread copies a key whether or not it holds
     anything. Callers build a full patch object and leave the fields they are
     not changing as `undefined`, so a spread would blank every other setting
     each time one toggle moved. Only defined keys are applied. */
  const next: JobSettings = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) (next as Record<string, unknown>)[key] = value;
  }

  /* Neither of these may be set through a normal save: an alias is issued by
     `ensureApplyAlias` and a referral code by `ensureReferralCode`, both once.
     Letting a PATCH rewrite them would let someone claim another person's
     address or referral credit. */
  next.applyAlias = current.applyAlias;
  next.referralCode = current.referralCode;
  /* Same reasoning: the feed token is a credential, issued and revoked by its
     own function rather than settable through a general patch. */
  next.calendarToken = current.calendarToken;
  next.extensionToken = current.extensionToken;

  if (!['off', 'honest', 'aggressive'].includes(next.optimization)) next.optimization = 'honest';

  const db = await getDb();
  await db.query(
    `INSERT INTO job_settings
       (user_id, optimization, auto_approve, review_before, public_portfolio, apply_alias,
        email_recs, email_product, email_paused_until, timezone, referral_code, auto_submit, autonomous, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     ON CONFLICT (user_id) DO UPDATE SET
       optimization = EXCLUDED.optimization,
       auto_approve = EXCLUDED.auto_approve,
       review_before = EXCLUDED.review_before,
       auto_submit = EXCLUDED.auto_submit,
       public_portfolio = EXCLUDED.public_portfolio,
       email_recs = EXCLUDED.email_recs,
       email_product = EXCLUDED.email_product,
       email_paused_until = EXCLUDED.email_paused_until,
       timezone = EXCLUDED.timezone,
       autonomous = EXCLUDED.autonomous,
       updated_at = EXCLUDED.updated_at`,
    [
      userId,
      next.optimization,
      next.autoApprove,
      next.reviewBefore,
      next.publicPortfolio,
      next.applyAlias,
      next.emailRecs,
      next.emailProduct,
      next.emailPausedUntil,
      next.timezone.slice(0, 64),
      next.referralCode,
      next.autoSubmit,
      next.autonomous,
      Date.now(),
    ],
  );
  return next;
}

/**
 * Issue the application address, once.
 *
 * Returns null when no domain is configured, so the UI can explain the feature
 * instead of showing an address that cannot receive anything.
 */
export async function ensureApplyAlias(userId: string, email: string): Promise<string | null> {
  const domain = applyDomain();
  if (!domain) return null;

  const current = await getJobSettings(userId);
  if (current.applyAlias) return `${current.applyAlias}@${domain}`;

  const db = await getDb();
  /* Retry on the unique constraint rather than pre-checking: two concurrent
     first-loads would both pass a SELECT and then one would fail anyway. */
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const local = mintAlias(email);
    try {
      await db.query(
        `INSERT INTO job_settings (user_id, apply_alias, updated_at) VALUES ($1,$2,$3)
         ON CONFLICT (user_id) DO UPDATE SET apply_alias = COALESCE(job_settings.apply_alias, EXCLUDED.apply_alias)`,
        [userId, local, Date.now()],
      );
      const after = await getJobSettings(userId);
      if (after.applyAlias) return `${after.applyAlias}@${domain}`;
    } catch {
      /* collision — mint another */
    }
  }
  return null;
}

/**
 * Issue (or rotate) the calendar feed secret.
 *
 * 32 bytes, because this URL is the only thing standing between a stranger and
 * the candidate's interview schedule — a short code would be guessable by
 * anyone willing to iterate, and calendar clients cannot send a cookie or a
 * header, so there is no second factor behind it.
 *
 * `rotate` revokes every subscription that used the old address, which is the
 * point: a leaked feed URL has to be cancellable.
 */
export async function ensureCalendarToken(userId: string, rotate = false): Promise<string> {
  const current = await getJobSettings(userId);
  if (current.calendarToken && !rotate) return current.calendarToken;

  const db = await getDb();
  const token = randomBytes(32).toString('base64url');
  await db.query(
    `INSERT INTO job_settings (user_id, calendar_token, updated_at) VALUES ($1,$2,$3)
     ON CONFLICT (user_id) DO UPDATE SET calendar_token = EXCLUDED.calendar_token, updated_at = EXCLUDED.updated_at`,
    [userId, token, Date.now()],
  );
  return token;
}

/** Resolve a feed token back to its owner. Returns null for an unknown token. */
export async function userForCalendarToken(token: string): Promise<string | null> {
  if (!token || token.length < 20) return null;
  const db = await getDb();
  const res = await db.query<{ user_id: string }>('SELECT user_id FROM job_settings WHERE calendar_token = $1', [token]);
  return res.rows[0]?.user_id ?? null;
}

/**
 * The extension's credential.
 *
 * Deliberately not the session cookie. The extension runs on employer pages,
 * and handing those origins something that authenticates as the whole account
 * is a far larger grant than one that reads a profile and answers form
 * questions. Rotating it revokes every installed copy, which is the point.
 */
export async function ensureExtensionToken(userId: string, rotate = false): Promise<string> {
  const current = await getJobSettings(userId);
  if (current.extensionToken && !rotate) return current.extensionToken;

  const db = await getDb();
  const token = randomBytes(32).toString('base64url');
  await db.query(
    `INSERT INTO job_settings (user_id, extension_token, updated_at) VALUES ($1,$2,$3)
     ON CONFLICT (user_id) DO UPDATE SET extension_token = EXCLUDED.extension_token, updated_at = EXCLUDED.updated_at`,
    [userId, token, Date.now()],
  );
  return token;
}

/** Resolve an extension token back to its owner. Null for an unknown token. */
export async function userForExtensionToken(token: string): Promise<string | null> {
  if (!token || token.length < 20) return null;
  const db = await getDb();
  const res = await db.query<{ user_id: string }>('SELECT user_id FROM job_settings WHERE extension_token = $1', [token]);
  return res.rows[0]?.user_id ?? null;
}

export async function ensureReferralCode(userId: string): Promise<string> {
  const current = await getJobSettings(userId);
  if (current.referralCode) return current.referralCode;

  const db = await getDb();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = randomBytes(4).toString('hex').toUpperCase();
    try {
      await db.query(
        `INSERT INTO job_settings (user_id, referral_code, updated_at) VALUES ($1,$2,$3)
         ON CONFLICT (user_id) DO UPDATE SET referral_code = COALESCE(job_settings.referral_code, EXCLUDED.referral_code)`,
        [userId, code, Date.now()],
      );
      const after = await getJobSettings(userId);
      if (after.referralCode) return after.referralCode;
    } catch {
      /* collision — mint another */
    }
  }
  return '';
}
