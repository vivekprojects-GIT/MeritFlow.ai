import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { getDb } from './db';

export const SESSION_COOKIE = 'courseai_session';
const SESSION_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export type Role = 'student' | 'instructor' | 'admin';
export type AccountKind = 'personal' | 'institutional';
export type User = { id: string; email: string; role: Role; universityId: string | null; accountKind: AccountKind };

/**
 * The access code that lets someone sign up as a university **admin**. Configurable
 * via env; falls back to a known demo code so the feature works out of the box.
 * (Professor codes are admin-generated and live in the `professor_codes` table.)
 */
export const ADMIN_SIGNUP_CODE = process.env.ADMIN_SIGNUP_CODE || 'LECTERN-ADMIN';

export function isValidAdminCode(code: string): boolean {
  return code.trim() === ADMIN_SIGNUP_CODE;
}

/** Hash a password as salt:derivedKey using scrypt (built into Node — no native deps). */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, key] = stored.split(':');
  if (!salt || !key) return false;
  const derived = scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(key, 'hex');
  return derived.length === keyBuf.length && timingSafeEqual(derived, keyBuf);
}

export async function createUser(
  email: string,
  password: string,
  role: Role = 'student',
  universityId: string | null = null,
  /* 'personal' for "Just me". Institutional features stay hidden for them. */
  accountKind: 'personal' | 'institutional' = 'institutional',
): Promise<User> {
  const db = await getDb();
  const id = randomUUID();
  await db.query(
    'INSERT INTO users (id, email, password_hash, role, university_id, account_kind, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [id, email, hashPassword(password), role, universityId, accountKind, Date.now()],
  );
  return { id, email, role, universityId, accountKind };
}

/** Attach a freshly-created user to a university (used after consuming a professor code). */
export async function setUserUniversity(userId: string, universityId: string): Promise<void> {
  const db = await getDb();
  await db.query('UPDATE users SET university_id = $1 WHERE id = $2', [universityId, userId]);
}

/** Roll back a just-created user (e.g. an instructor signup whose code turned out invalid). */
export async function deleteUser(userId: string): Promise<void> {
  const db = await getDb();
  await db.query('DELETE FROM users WHERE id = $1', [userId]);
}

export async function findUserByEmail(
  email: string,
): Promise<{ id: string; email: string; passwordHash: string } | null> {
  const db = await getDb();
  const res = await db.query<{ id: string; email: string; password_hash: string }>(
    'SELECT id, email, password_hash FROM users WHERE email = $1',
    [email],
  );
  const row = res.rows[0];
  return row ? { id: row.id, email: row.email, passwordHash: row.password_hash } : null;
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: number }> {
  const db = await getDb();
  const token = randomBytes(32).toString('hex');
  const expiresAt = Date.now() + SESSION_MS;
  await db.query('INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)', [
    token,
    userId,
    expiresAt,
  ]);
  return { token, expiresAt };
}

export async function deleteSession(token: string): Promise<void> {
  const db = await getDb();
  await db.query('DELETE FROM sessions WHERE token = $1', [token]);
}

/** Resolve the logged-in user from the session cookie, or null. */
export async function getCurrentUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  const res = await db.query<{ id: string; email: string; role: Role; university_id: string | null; account_kind: string | null }>(
    `SELECT u.id, u.email, u.role, u.university_id, u.account_kind
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token = $1 AND s.expires_at > $2`,
    [token, Date.now()],
  );
  const row = res.rows[0];
  return row
    ? {
        id: row.id,
        email: row.email,
        role: row.role ?? 'student',
        universityId: row.university_id ?? null,
        accountKind: row.account_kind === 'personal' ? 'personal' : 'institutional',
      }
    : null;
}

/** Cookie options shared by login/signup (set) and logout (clear). */
export function sessionCookieOptions(expiresAt: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(expiresAt),
  };
}
