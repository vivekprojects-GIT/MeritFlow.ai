import { getDb } from './db';
import { maskOf, open, seal } from './secret-box';

/**
 * A user's own API keys, and which model they want their key spent on.
 *
 * ## Why the app offers this at all
 *
 * Generation runs on the operator's Anthropic key and video search on the
 * operator's SerpAPI key, so every learner spends someone else's quota — and
 * when that quota runs out, as SerpAPI's did here, the feature simply stops
 * working for everyone with no way for an individual to carry on. Letting
 * someone supply their own key turns a shared ceiling into a personal one.
 *
 * ## The rule this module exists to enforce
 *
 * A secret goes in and never comes back out to a browser. There are two ways
 * to read this table and they are deliberately different functions:
 * `credentialsFor` decrypts and is for server code about to call a provider;
 * `credentialSummary` never decrypts and is what an API route may return.
 * Anything that reaches the client goes through the second one.
 */

export type Provider = 'anthropic' | 'serpapi';

const PROVIDERS: Provider[] = ['anthropic', 'serpapi'];

export const isProvider = (value: string): value is Provider => (PROVIDERS as string[]).includes(value);

/**
 * Models a learner may point their own key at.
 *
 * Listed rather than free text because a typo in a model id fails deep inside
 * a generation that has already cost the user money, and the error it produces
 * names neither the field nor the fix.
 */
export const ANTHROPIC_MODELS = [
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5', note: 'Fastest and cheapest. The default.' },
  { id: 'claude-sonnet-5', label: 'Sonnet 5', note: 'Stronger writing, moderate cost.' },
  { id: 'claude-opus-5', label: 'Opus 5', note: 'The most capable, and the most expensive.' },
] as const;

export const isAnthropicModel = (value: string): boolean => ANTHROPIC_MODELS.some((m) => m.id === value);

/** What the settings page may show: that a key exists, and which one. */
export type CredentialSummary = {
  provider: Provider;
  /** False when the user has never saved one, or has cleared it. */
  present: boolean;
  /** "••••df3a", or empty when nothing is saved. */
  hint: string;
  model: string;
  updatedAt: number;
};

/** Decrypted keys, for server code about to call a provider. Never serialise this. */
export type Credentials = {
  anthropicKey: string | null;
  anthropicModel: string | null;
  serpApiKey: string | null;
};

type Row = { provider: string; secret: string; last4: string; model: string; updated_at: number };

async function rowsFor(userId: string): Promise<Row[]> {
  const db = await getDb();
  const res = await db.query<Record<string, unknown>>(
    'SELECT provider, secret, last4, model, updated_at FROM user_credentials WHERE user_id = $1',
    [userId],
  );
  return res.rows.map((r) => ({
    provider: String(r.provider ?? ''),
    secret: String(r.secret ?? ''),
    last4: String(r.last4 ?? ''),
    model: String(r.model ?? ''),
    updated_at: Number(r.updated_at ?? 0),
  }));
}

/** Every provider's state, with nothing decrypted. Safe to return from a route. */
export async function credentialSummary(userId: string): Promise<CredentialSummary[]> {
  const rows = await rowsFor(userId);
  return PROVIDERS.map((provider) => {
    const row = rows.find((r) => r.provider === provider);
    const present = Boolean(row?.secret);
    return {
      provider,
      present,
      hint: present && row?.last4 ? `••••${row.last4}` : '',
      model: row?.model ?? '',
      updatedAt: row?.updated_at ?? 0,
    };
  });
}

/**
 * The user's keys in the clear, for a server-side provider call.
 *
 * Returns null per field rather than falling back to the operator's env key.
 * The caller decides that, because the decision differs: generation should fall
 * back so the app keeps working, and it should be obvious in the calling code
 * that it is doing so.
 */
export async function credentialsFor(userId: string): Promise<Credentials> {
  const rows = await rowsFor(userId);
  const read = (provider: Provider): string | null => {
    const row = rows.find((r) => r.provider === provider);
    if (!row?.secret) return null;
    return open(row.secret);
  };

  const anthropic = rows.find((r) => r.provider === 'anthropic');
  return {
    anthropicKey: read('anthropic'),
    anthropicModel: anthropic?.model || null,
    serpApiKey: read('serpapi'),
  };
}

/**
 * Save a key, a model, or both.
 *
 * A blank `secret` leaves the stored key alone rather than erasing it, because
 * the settings form cannot show the current key and therefore submits an empty
 * field whenever the user only changed the model. Erasing is its own action.
 */
export async function saveCredential(
  userId: string,
  provider: Provider,
  input: { secret?: string; model?: string },
): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  const secret = input.secret?.trim() ?? '';
  const model = input.model?.trim() ?? '';

  const existing = (await rowsFor(userId)).find((r) => r.provider === provider);

  const sealed = secret ? seal(secret) : (existing?.secret ?? '');
  const last4 = secret ? maskOf(secret).slice(-4) : (existing?.last4 ?? '');
  const nextModel = input.model === undefined ? (existing?.model ?? '') : model;

  await db.query(
    `INSERT INTO user_credentials (user_id, provider, secret, last4, model, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (user_id, provider) DO UPDATE SET
       secret = EXCLUDED.secret,
       last4 = EXCLUDED.last4,
       model = EXCLUDED.model,
       updated_at = EXCLUDED.updated_at`,
    [userId, provider, sealed, last4, nextModel, now],
  );
}

/** Forget a provider's key. The model choice goes with it — it has nothing to spend. */
export async function deleteCredential(userId: string, provider: Provider): Promise<void> {
  const db = await getDb();
  await db.query('DELETE FROM user_credentials WHERE user_id = $1 AND provider = $2', [userId, provider]);
}
