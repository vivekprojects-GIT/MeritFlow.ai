import { createHash, randomUUID } from 'node:crypto';
import { getDb } from '../db';
import { NEVER_BLANKET_AUTHORIZED } from './question-class';

/**
 * Consent the candidate has explicitly given, and nothing else.
 *
 * ## Why this is a separate store
 *
 * The answer vault holds facts. This holds permissions, and they behave
 * differently in every way that matters: a fact is true until the candidate
 * changes it, a permission can be revoked, can expire, and is scoped to text
 * that may be rewritten by the other party after it was granted.
 *
 * Keeping them in one table would mean one `verified` flag standing for both
 * "this is my phone number" and "I agree to binding arbitration", and the day
 * somebody relaxes that flag for a good reason on the first, they relax it on
 * the second.
 *
 * ## Nothing here is ever inferred
 *
 * There is no code path that creates an authorization from a model's reading of
 * a page, from a similar authorization, or from the candidate having agreed to
 * something like it before. The only writer is an explicit act by the person.
 *
 * ## What changes invalidate it
 *
 * An authorization is bound to the text it was granted against. When an
 * employer rewrites their privacy notice, the stored hash no longer matches and
 * the run stops for the candidate — which is the entire point. Consent to a
 * document is not consent to its successor.
 */

export type Authorization = {
  id: string;
  /** The consent class, from `classifyQuestion`: POLICY, ACKNOWLEDGEMENT, … */
  type: string;
  /**
   * What it covers. `*` is a class-wide grant, permitted only for consent types
   * whose legal effect is confined to processing an application.
   */
  scope: string;
  authorizedByUser: boolean;
  authorizedAt: number;
  allowedForAutoSubmit: boolean;
  policyUrl: string;
  /** Of the linked policy document, when we fetched one. */
  policyHash: string;
  /** Of the exact checkbox wording this was granted against. */
  textHash: string;
  expiresAt: number | null;
  revokedAt: number | null;
  notes: string;
};

export type AuthorizationCheck =
  | { allowed: true; authorization: Authorization }
  | { allowed: false; reason: string; needsAuthorization: { type: string; scope: string; textHash: string } };

/** Stable across whitespace and case, sensitive to every word. */
export function hashText(text: string): string {
  return createHash('sha256').update(text.trim().replace(/\s+/g, ' ').toLowerCase()).digest('hex').slice(0, 32);
}

function map(r: Record<string, unknown>): Authorization {
  return {
    id: String(r.id),
    type: String(r.authorization_type),
    scope: String(r.scope ?? ''),
    authorizedByUser: Boolean(r.authorized_by_user),
    authorizedAt: Number(r.authorized_at ?? 0),
    allowedForAutoSubmit: Boolean(r.allowed_for_auto_submit),
    policyUrl: String(r.policy_url ?? ''),
    policyHash: String(r.policy_hash ?? ''),
    textHash: String(r.text_hash ?? ''),
    expiresAt: r.expires_at == null ? null : Number(r.expires_at),
    revokedAt: r.revoked_at == null ? null : Number(r.revoked_at),
    notes: String(r.notes ?? ''),
  };
}

/**
 * Grant one authorization.
 *
 * `authorizedByUser` is required and required to be true — there is deliberately
 * no way to write a row that records consent nobody gave. A caller that wants
 * one has to lie in a way that is visible in the diff.
 */
export async function grantAuthorization(
  userId: string,
  input: {
    type: string;
    scope: string;
    exactText: string;
    policyUrl?: string;
    policyHash?: string;
    allowedForAutoSubmit?: boolean;
    expiresAt?: number | null;
    notes?: string;
    authorizedByUser: true;
  },
): Promise<Authorization> {
  if (input.authorizedByUser !== true) {
    throw new Error('An authorization can only be created by an explicit act of the candidate.');
  }

  /* A class-wide grant is refused for consent whose effect outlives the
     application. The candidate may still authorize one specific item. */
  if (input.scope === '*' && NEVER_BLANKET_AUTHORIZED.has(input.type)) {
    throw new Error(`${input.type} cannot be authorized as a class. Authorize the specific item instead.`);
  }

  const db = await getDb();
  const now = Date.now();
  const id = `AUTH-${randomUUID().slice(0, 8).toUpperCase()}`;

  await db.query(
    `INSERT INTO authorizations
       (id, user_id, authorization_type, scope, authorized_by_user, authorized_at,
        allowed_for_auto_submit, policy_url, policy_hash, text_hash, expires_at, revoked_at, notes)
     VALUES ($1,$2,$3,$4,TRUE,$5,$6,$7,$8,$9,$10,NULL,$11)`,
    [
      id,
      userId,
      input.type,
      input.scope,
      now,
      input.allowedForAutoSubmit ?? true,
      (input.policyUrl ?? '').slice(0, 500),
      input.policyHash ?? '',
      hashText(input.exactText),
      input.expiresAt ?? null,
      (input.notes ?? '').slice(0, 500),
    ],
  );

  return {
    id,
    type: input.type,
    scope: input.scope,
    authorizedByUser: true,
    authorizedAt: now,
    allowedForAutoSubmit: input.allowedForAutoSubmit ?? true,
    policyUrl: input.policyUrl ?? '',
    policyHash: input.policyHash ?? '',
    textHash: hashText(input.exactText),
    expiresAt: input.expiresAt ?? null,
    revokedAt: null,
    notes: input.notes ?? '',
  };
}

export async function revokeAuthorization(userId: string, id: string): Promise<void> {
  const db = await getDb();
  await db.query('UPDATE authorizations SET revoked_at = $1 WHERE user_id = $2 AND id = $3', [Date.now(), userId, id]);
}

export async function listAuthorizations(userId: string): Promise<Authorization[]> {
  const db = await getDb();
  const res = await db.query<Record<string, unknown>>(
    'SELECT * FROM authorizations WHERE user_id = $1 ORDER BY authorized_at DESC',
    [userId],
  );
  return res.rows.map(map);
}

/**
 * May this exact checkbox be ticked automatically?
 *
 * Every clause is a way of saying no. The single way to say yes is an
 * unrevoked, unexpired, auto-submit-enabled grant from the candidate whose
 * scope covers this item and whose text still matches.
 */
export async function checkAuthorization(
  userId: string,
  request: { type: string; scope: string; exactText: string; policyHash?: string },
): Promise<AuthorizationCheck> {
  const textHash = hashText(request.exactText);
  const needs = { type: request.type, scope: request.scope, textHash };
  const now = Date.now();

  const all = await listAuthorizations(userId);

  const candidates = all.filter((a) => {
    if (a.type !== request.type) return false;
    if (a.revokedAt != null) return false;
    if (a.expiresAt != null && a.expiresAt < now) return false;
    if (!a.authorizedByUser || !a.allowedForAutoSubmit) return false;
    /* A class-wide grant covers this scope; otherwise the scope must match. */
    if (a.scope !== '*' && a.scope !== request.scope) return false;
    /* And a class-wide grant is never enough for the types that outlive the
       application, whatever a stored row says. */
    if (a.scope === '*' && NEVER_BLANKET_AUTHORIZED.has(request.type)) return false;
    return true;
  });

  if (candidates.length === 0) {
    return { allowed: false, reason: 'You have not authorized this kind of acknowledgement.', needsAuthorization: needs };
  }

  /*
   * Exact-text grants win. A class-wide grant covers wording it has never seen,
   * which is correct for "acknowledge a privacy notice" and would not be for
   * anything narrower — hence the type restriction above.
   */
  const exact = candidates.find((a) => a.textHash === textHash);
  if (exact) {
    if (request.policyHash && exact.policyHash && request.policyHash !== exact.policyHash) {
      return {
        allowed: false,
        reason: 'The linked policy document has changed since you authorized this.',
        needsAuthorization: needs,
      };
    }
    return { allowed: true, authorization: exact };
  }

  const classWide = candidates.find((a) => a.scope === '*');
  if (classWide) return { allowed: true, authorization: classWide };

  return {
    allowed: false,
    reason: 'The wording of this acknowledgement has changed since you authorized it.',
    needsAuthorization: needs,
  };
}
