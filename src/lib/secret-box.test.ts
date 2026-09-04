import { beforeAll, describe, expect, it } from 'vitest';
import { maskOf, open, seal } from './secret-box';

/**
 * This module holds other people's API keys, which are other people's money.
 * The failures worth guarding are the quiet ones: a value that round-trips but
 * was never actually encrypted, and a tampered value that decrypts to
 * something plausible instead of failing.
 */

beforeAll(() => {
  process.env.CREDENTIAL_SECRET ??= 'test-secret-for-vitest';
});

const KEY = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789';

describe('seal and open', () => {
  it('round-trips a secret', () => {
    expect(open(seal(KEY))).toBe(KEY);
  });

  it('does not leave the secret readable in what it stores', () => {
    /* The whole point. A ciphertext containing the plaintext would pass a
       round-trip test and fail the only requirement that matters. */
    const sealed = seal(KEY);
    expect(sealed).not.toContain(KEY);
    expect(sealed).not.toContain('sk-ant');
    expect(sealed).not.toContain('0123456789');
  });

  it('produces a different ciphertext each time', () => {
    /* A fixed IV would make identical keys produce identical rows, so the
       table would show which users share a key. */
    expect(seal(KEY)).not.toBe(seal(KEY));
  });

  it('refuses a tampered ciphertext rather than decrypting it', () => {
    const sealed = seal(KEY);
    const [v, iv, tag, body] = sealed.split('.');
    const flipped = `${body.slice(0, -2)}${body.slice(-2) === 'AA' ? 'AB' : 'AA'}`;
    expect(open(`${v}.${iv}.${tag}.${flipped}`)).toBeNull();
  });

  it('returns null for anything that is not one of ours', () => {
    /* The realistic case is a database restored beside a different key file.
       Acting as though no key is saved is recoverable; throwing is not. */
    expect(open('')).toBeNull();
    expect(open('plain text')).toBeNull();
    expect(open('v2.a.b.c')).toBeNull();
  });

  it('survives characters an API key can legitimately contain', () => {
    const awkward = 'sk-ant-_-=+/aA0 with spaces and ünïcødé';
    expect(open(seal(awkward))).toBe(awkward);
  });
});

describe('maskOf', () => {
  it('shows only the last four characters', () => {
    expect(maskOf(KEY)).toBe('••••6789');
    expect(maskOf(KEY)).not.toContain('sk-ant');
  });

  it('reveals nothing at all from a short value', () => {
    expect(maskOf('ab')).toBe('••••');
  });
});
