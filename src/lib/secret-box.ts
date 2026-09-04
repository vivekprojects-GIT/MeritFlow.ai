import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { dirname, resolve } from 'node:path';

/**
 * Encryption for secrets this app is trusted to hold — a learner's own API keys.
 *
 * ## The threat this is actually for
 *
 * A user's Anthropic or SerpAPI key is their money. Stored as plain text it
 * leaks with the database, and the database is a single file that gets copied:
 * this repository already contains a dozen `pgdata.*` and `test-*.db` snapshots
 * taken during development. Any one of them would have carried every key.
 *
 * So the ciphertext lives in the database and the key that unwraps it does not.
 * That is the whole design, and it is worth being precise about its limit: this
 * protects against a leaked database file. It does not protect against someone
 * who can read the whole installation, because at that point they have the
 * unwrapping key too. Defending against that needs a secret this process never
 * stores — an operator-supplied passphrase or a KMS — and CREDENTIAL_SECRET is
 * the hook for exactly that.
 *
 * ## Where the key comes from
 *
 * `CREDENTIAL_SECRET` when set, which is the deployment answer. Otherwise a
 * random one generated on first use and written beside the database, which is
 * the self-hosted answer: it keeps the feature working without configuration
 * while still keeping the secret out of the table.
 *
 * AES-256-GCM, so a tampered ciphertext fails to decrypt rather than decrypting
 * to something else. Each value gets a fresh IV; reusing one across values
 * under the same key is what breaks GCM.
 */

const KEY_FILE = resolve(process.cwd(), '.credential-key');

let cachedKey: Buffer | null = null;

function keyMaterial(): string {
  const configured = process.env.CREDENTIAL_SECRET?.trim();
  if (configured) return configured;

  if (existsSync(KEY_FILE)) return readFileSync(KEY_FILE, 'utf8').trim();

  /* First run on this install. Written 0600 so it is not world-readable on a
     shared machine; on Windows the mode is advisory and the ACL governs, which
     is why CREDENTIAL_SECRET is the better answer anywhere that matters. */
  const generated = randomBytes(32).toString('hex');
  mkdirSync(dirname(KEY_FILE), { recursive: true });
  writeFileSync(KEY_FILE, generated, { encoding: 'utf8', mode: 0o600 });
  try {
    chmodSync(KEY_FILE, 0o600);
  } catch {
    /* Not all filesystems honour it. The file is still outside the database,
       which is the property that matters. */
  }
  return generated;
}

function key(): Buffer {
  /* Derived once: scrypt is deliberately slow, and doing it per value would
     make saving a key take longer than the request that uses it. */
  if (!cachedKey) cachedKey = scryptSync(keyMaterial(), 'courseai:credentials:v1', 32);
  return cachedKey;
}

/** Encrypt a secret for storage. Returns an opaque string safe to put in a row. */
export function seal(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${body.toString('base64url')}`;
}

/**
 * Decrypt a stored secret, or null if it cannot be read.
 *
 * Null rather than a throw, because the realistic cause is a changed
 * CREDENTIAL_SECRET or a database restored beside a different key file — and
 * the right behaviour then is to act as though no key is configured and let the
 * user re-enter it, not to fail every course generation with a crypto error.
 */
export function open(sealed: string): string | null {
  try {
    const [version, iv, tag, body] = sealed.split('.');
    if (version !== 'v1' || !iv || !tag || !body) return null;

    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/**
 * The last four characters, for showing a saved key without revealing it.
 *
 * Four is enough for someone to recognise which of their keys is in the box and
 * not enough to be worth stealing. The rest never leaves the server.
 */
export function maskOf(plaintext: string): string {
  const clean = plaintext.trim();
  return clean.length <= 4 ? '••••' : `••••${clean.slice(-4)}`;
}
