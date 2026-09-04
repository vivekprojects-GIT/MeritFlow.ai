import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { getDb } from './db';

/**
 * OpenID Connect single sign-on, per university.
 *
 * Authorization Code flow with PKCE. The security here is the whole point, so
 * each control is named with the attack it stops:
 *
 *   state         — CSRF. A callback we did not initiate has no matching row.
 *   nonce         — replay. An ID token minted for an earlier attempt is rejected.
 *   PKCE          — code interception. The code is useless without the verifier.
 *   JWKS + verify — forgery. The ID token signature is checked against the IdP's
 *                   published keys; a decoded-but-unverified token is worthless.
 *   iss / aud     — token substitution from another issuer or client.
 *   email_verified— an IdP asserting an address it has not confirmed.
 *   domain allowlist — a misconfigured or hostile IdP claiming an address that
 *                   belongs to someone else, including another university's user.
 *
 * Attempts are single-use and short-lived; the row is deleted on redemption.
 */

const ATTEMPT_TTL_MS = 10 * 60 * 1000;

export type SsoConfig = {
  universityId: string;
  slug: string;
  name: string;
  issuer: string;
  clientId: string;
  clientSecret: string;
  domains: string[];
};

type Discovery = {
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  issuer: string;
};

/** Cached per issuer — discovery documents change rarely and the fetch is slow. */
const discoveryCache = new Map<string, { at: number; doc: Discovery }>();
const DISCOVERY_TTL_MS = 60 * 60 * 1000;

export async function discover(issuer: string): Promise<Discovery> {
  const cached = discoveryCache.get(issuer);
  if (cached && Date.now() - cached.at < DISCOVERY_TTL_MS) return cached.doc;

  const base = issuer.replace(/\/$/, '');
  const res = await fetch(`${base}/.well-known/openid-configuration`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Could not read the identity provider's configuration (${res.status}).`);
  const doc = (await res.json()) as Discovery;
  if (!doc.authorization_endpoint || !doc.token_endpoint || !doc.jwks_uri) {
    throw new Error('That identity provider did not return a usable OpenID configuration.');
  }
  discoveryCache.set(issuer, { at: Date.now(), doc });
  return doc;
}

export async function ssoConfigForSlug(slug: string): Promise<SsoConfig | null> {
  const db = await getDb();
  const res = await db.query<{
    id: string;
    slug: string;
    name: string;
    sso_issuer: string | null;
    sso_client_id: string | null;
    sso_client_secret: string | null;
    sso_domains: string | null;
  }>(
    'SELECT id, slug, name, sso_issuer, sso_client_id, sso_client_secret, sso_domains FROM universities WHERE slug = $1',
    [slug],
  );
  const row = res.rows[0];
  if (!row?.sso_issuer || !row.sso_client_id || !row.sso_client_secret) return null;

  return {
    universityId: row.id,
    slug: row.slug,
    name: row.name,
    issuer: row.sso_issuer,
    clientId: row.sso_client_id,
    clientSecret: row.sso_client_secret,
    domains: (row.sso_domains ?? '')
      .split(',')
      .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
      .filter(Boolean),
  };
}

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Begin an attempt: returns the URL to send the browser to. */
export async function beginSso(config: SsoConfig, redirectUri: string): Promise<string> {
  const doc = await discover(config.issuer);

  const state = base64url(randomBytes(24));
  const nonce = base64url(randomBytes(24));
  const codeVerifier = base64url(randomBytes(48));
  const codeChallenge = base64url(createHash('sha256').update(codeVerifier).digest());

  const db = await getDb();
  /* Housekeeping: expired attempts are never valid, so drop them rather than
     letting the table grow forever. */
  await db.query('DELETE FROM sso_attempts WHERE created_at < $1', [Date.now() - ATTEMPT_TTL_MS]);
  await db.query(
    'INSERT INTO sso_attempts (state, university_id, code_verifier, nonce, created_at) VALUES ($1, $2, $3, $4, $5)',
    [state, config.universityId, codeVerifier, nonce, Date.now()],
  );

  const url = new URL(doc.authorization_endpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', state);
  url.searchParams.set('nonce', nonce);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

export type SsoIdentity = { email: string; universityId: string; name: string | null };

/**
 * Redeem the callback. Throws with a user-safe message on any failure — every
 * throw here is a rejected sign-in, never a partial one.
 */
export async function completeSso(
  config: SsoConfig,
  code: string,
  state: string,
  redirectUri: string,
): Promise<SsoIdentity> {
  const db = await getDb();

  /* state: consume it atomically so a replayed callback finds nothing. */
  const attempt = await db.query<{ code_verifier: string; nonce: string; university_id: string; created_at: string }>(
    'DELETE FROM sso_attempts WHERE state = $1 RETURNING code_verifier, nonce, university_id, created_at',
    [state],
  );
  const row = attempt.rows[0];
  if (!row) throw new Error('That sign-in link has already been used or has expired. Please try again.');
  if (Date.now() - Number(row.created_at) > ATTEMPT_TTL_MS) throw new Error('That sign-in attempt expired. Please try again.');
  if (row.university_id !== config.universityId) throw new Error('That sign-in attempt does not match this university.');

  const doc = await discover(config.issuer);

  const tokenRes = await fetch(doc.token_endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      /* client_secret_basic is the most widely supported client auth method. */
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: row.code_verifier,
      client_id: config.clientId,
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  });

  if (!tokenRes.ok) throw new Error('The identity provider rejected the sign-in.');
  const tokens = (await tokenRes.json()) as { id_token?: string };
  if (!tokens.id_token) throw new Error('The identity provider did not return an ID token.');

  /* Verify the signature against the IdP's published keys, and check the claims
     that bind this token to this attempt and this client. */
  const jwks = createRemoteJWKSet(new URL(doc.jwks_uri));
  const { payload } = await jwtVerify(tokens.id_token, jwks, {
    issuer: doc.issuer || config.issuer,
    audience: config.clientId,
  });

  if (payload.nonce !== row.nonce) throw new Error('That sign-in could not be verified. Please try again.');

  const email = String(payload.email ?? '').trim().toLowerCase();
  if (!email) throw new Error('Your identity provider did not share an email address.');
  if (payload.email_verified === false) {
    throw new Error('Your institution has not verified that email address.');
  }

  /* The IdP may only assert addresses in its own domains. */
  const domain = email.split('@')[1] ?? '';
  if (config.domains.length > 0 && !config.domains.some((d) => domain === d || domain.endsWith(`.${d}`))) {
    throw new Error(`${config.name} sign-in only accepts its own email domains.`);
  }

  return {
    email,
    universityId: config.universityId,
    name: typeof payload.name === 'string' ? payload.name : null,
  };
}

/**
 * Find or create the local account for a verified identity.
 *
 * New accounts are created as students. Elevation to instructor or admin stays a
 * deliberate act inside the app — an IdP group claim is not something we can
 * safely interpret across institutions.
 */
export async function upsertSsoUser(identity: SsoIdentity): Promise<{ id: string; email: string; role: string }> {
  const db = await getDb();
  const existing = await db.query<{ id: string; email: string; role: string; university_id: string | null }>(
    'SELECT id, email, role, university_id FROM users WHERE email = $1',
    [identity.email],
  );

  const found = existing.rows[0];
  if (found) {
    /* Bind the account to this university the first time they arrive via SSO. */
    if (!found.university_id) {
      await db.query('UPDATE users SET university_id = $1 WHERE id = $2', [identity.universityId, found.id]);
    }
    return { id: found.id, email: found.email, role: found.role };
  }

  const id = randomUUID();
  await db.query(
    `INSERT INTO users (id, email, password_hash, created_at, role, university_id)
     VALUES ($1, $2, $3, $4, 'student', $5)`,
    /* No password: this account can only ever be reached through its IdP. */
    [id, identity.email, 'sso:no-password', Date.now(), identity.universityId],
  );
  return { id, email: identity.email, role: 'student' };
}
