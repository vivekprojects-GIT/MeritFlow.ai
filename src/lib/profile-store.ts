import { getDb } from './db';

export type Profile = {
  id: string;
  email: string;
  role: 'student' | 'instructor' | 'admin';
  /** 'personal' accounts never see class-based features. */
  accountKind: 'personal' | 'institutional';
  name: string;
  avatarUrl: string | null;
  headline: string;
  bio: string;
  /* Contact and identity. Every one is optional — see the note below. */
  phone: string;
  /** ISO `YYYY-MM-DD`, or '' when not given. */
  birthDate: string;
  pronouns: string;
  location: string;
  timezone: string;
  website: string;
  /** Professors: their department. */
  department: string;
  /** Students: their institutional ID, matched against SIS roster imports. */
  studentId: string;
};

/** Max size of an avatar stored as a base64 data URL (~250 KB after client-side downscale). */
export const AVATAR_MAX_CHARS = 400_000;

/**
 * Every field below `email` is optional, deliberately.
 *
 * A profile form that insists on a phone number and a date of birth before it
 * will save is a form people abandon, and half-filled records are worse than
 * empty ones. Nothing in the app gates on any of these; they exist so a person
 * can be reachable and correctly addressed if they choose to be.
 */
const LIMITS: Record<string, number> = {
  name: 120,
  headline: 160,
  bio: 2000,
  phone: 32,
  pronouns: 40,
  location: 120,
  timezone: 64,
  website: 200,
  department: 120,
  studentId: 64,
};

/** Column name for each editable field — keeps the SQL out of the caller. */
const COLUMN: Record<string, string> = {
  name: 'name',
  headline: 'headline',
  bio: 'bio',
  phone: 'phone',
  birthDate: 'birth_date',
  pronouns: 'pronouns',
  location: 'location',
  timezone: 'timezone',
  website: 'website',
  department: 'department',
  studentId: 'student_id',
};

export async function getProfile(userId: string): Promise<Profile | null> {
  const db = await getDb();
  const res = await db.query<{
    id: string;
    email: string;
    role: Profile['role'];
    account_kind: string | null;
    name: string | null;
    avatar_url: string | null;
    headline: string | null;
    bio: string | null;
    phone: string | null;
    birth_date: string | null;
    pronouns: string | null;
    location: string | null;
    timezone: string | null;
    website: string | null;
    department: string | null;
    student_id: string | null;
  }>(
    `SELECT id, email, role, account_kind, name, avatar_url, headline, bio,
            phone, birth_date, pronouns, location, timezone, website, department, student_id
       FROM users WHERE id = $1`,
    [userId],
  );
  const r = res.rows[0];
  if (!r) return null;
  return {
    id: r.id,
    email: r.email,
    role: r.role ?? 'student',
    accountKind: r.account_kind === 'personal' ? 'personal' : 'institutional',
    name: r.name ?? '',
    avatarUrl: r.avatar_url,
    headline: r.headline ?? '',
    bio: r.bio ?? '',
    phone: r.phone ?? '',
    birthDate: r.birth_date ?? '',
    pronouns: r.pronouns ?? '',
    location: r.location ?? '',
    timezone: r.timezone ?? '',
    website: r.website ?? '',
    department: r.department ?? '',
    studentId: r.student_id ?? '',
  };
}

export type ProfilePatch = Partial<
  Pick<
    Profile,
    'name' | 'headline' | 'bio' | 'phone' | 'birthDate' | 'pronouns' | 'location' | 'timezone' | 'website' | 'department' | 'studentId'
  >
> & { avatarUrl?: string | null };

/** Update the user's own profile. Avatar is a base64 data URL (or null to clear). */
export async function updateProfile(userId: string, fields: ProfilePatch): Promise<Profile | null> {
  const db = await getDb();
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;

  for (const [key, column] of Object.entries(COLUMN)) {
    const value = (fields as Record<string, unknown>)[key];
    if (value === undefined) continue;
    let text = String(value ?? '');
    /* A malformed date is dropped rather than stored: a birthday of "yes" would
       otherwise render forever and never be caught. */
    if (key === 'birthDate' && text && !/^\d{4}-\d{2}-\d{2}$/.test(text)) text = '';
    sets.push(`${column} = $${i++}`);
    vals.push(text.slice(0, LIMITS[key] ?? 200));
  }

  if (fields.avatarUrl !== undefined) {
    sets.push(`avatar_url = $${i++}`);
    vals.push(fields.avatarUrl ? fields.avatarUrl.slice(0, AVATAR_MAX_CHARS) : null);
  }

  if (sets.length > 0) {
    vals.push(userId);
    await db.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${i}`, vals);
  }
  return getProfile(userId);
}

/** Lightweight public-facing identity for a user (for course cards, marketplace, etc.). */
export type PublicProfile = { name: string; avatarUrl: string | null; headline: string };

export async function getPublicProfile(userId: string): Promise<PublicProfile | null> {
  const db = await getDb();
  const res = await db.query<{ name: string | null; avatar_url: string | null; headline: string | null; email: string }>(
    'SELECT name, avatar_url, headline, email FROM users WHERE id = $1',
    [userId],
  );
  const r = res.rows[0];
  if (!r) return null;
  return { name: r.name || r.email, avatarUrl: r.avatar_url, headline: r.headline ?? '' };
}
