import { randomUUID, randomBytes } from 'node:crypto';
import { getDb } from './db';

/* ── Types ──────────────────────────────────────────────────────────────── */

export type University = {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  adminId: string;
  createdAt: number;
};

export type ProfessorCode = {
  code: string;
  label: string;
  usedByEmail: string | null;
  usedAt: number | null;
  createdAt: number;
};

export type ProfessorRow = {
  id: string;
  email: string;
  classes: number;
  students: number;
  completions: number;
};

export type AdminClassRow = {
  id: string;
  title: string;
  professorEmail: string;
  enrolled: number;
  completed: number;
  examOpen: boolean;
};

export type AdminOverview = {
  totals: { professors: number; classes: number; students: number; completions: number };
  professors: ProfessorRow[];
  classes: AdminClassRow[];
};

/** Max length of a logo data URL we accept (~650 KB of binary). */
export const LOGO_MAX_CHARS = 900_000;

/* ── Helpers ────────────────────────────────────────────────────────────── */

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function randomCode(len = 7): string {
  const bytes = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return base || 'university';
}

function mapUniversity(r: {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  admin_id: string;
  created_at: string;
}): University {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    logoUrl: r.logo_url ?? null,
    adminId: r.admin_id,
    createdAt: Number(r.created_at),
  };
}

const UNI_COLS = 'id, slug, name, logo_url, admin_id, created_at';

/* ── Universities ───────────────────────────────────────────────────────── */

/** Create the admin's university with a unique slug and attach the admin to it. */
export async function createUniversity(
  adminId: string,
  name: string,
  logoUrl: string | null = null,
): Promise<University> {
  const db = await getDb();
  const id = randomUUID();
  let slug = slugify(name);
  for (let n = 2; n < 50; n++) {
    const exists = await db.query('SELECT 1 FROM universities WHERE slug = $1', [slug]);
    if (exists.rows.length === 0) break;
    slug = `${slugify(name)}-${n}`;
  }
  await db.query(
    `INSERT INTO universities (id, slug, name, logo_url, admin_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, slug, name, logoUrl, adminId, Date.now()],
  );
  await db.query('UPDATE users SET university_id = $1 WHERE id = $2', [id, adminId]);
  return { id, slug, name, logoUrl, adminId, createdAt: Date.now() };
}

export async function getUniversityById(id: string): Promise<University | null> {
  const db = await getDb();
  const res = await db.query<Parameters<typeof mapUniversity>[0]>(
    `SELECT ${UNI_COLS} FROM universities WHERE id = $1`,
    [id],
  );
  return res.rows[0] ? mapUniversity(res.rows[0]) : null;
}

export async function getUniversityBySlug(slug: string): Promise<University | null> {
  const db = await getDb();
  const res = await db.query<Parameters<typeof mapUniversity>[0]>(
    `SELECT ${UNI_COLS} FROM universities WHERE slug = $1`,
    [slug.trim().toLowerCase()],
  );
  return res.rows[0] ? mapUniversity(res.rows[0]) : null;
}

export async function getUniversityForAdmin(adminId: string): Promise<University | null> {
  const db = await getDb();
  const res = await db.query<Parameters<typeof mapUniversity>[0]>(
    `SELECT ${UNI_COLS} FROM universities WHERE admin_id = $1`,
    [adminId],
  );
  return res.rows[0] ? mapUniversity(res.rows[0]) : null;
}

/** Update name/logo of the admin's own university. Returns the updated row or null. */
export async function updateUniversity(
  adminId: string,
  patch: { name?: string; logoUrl?: string | null },
): Promise<University | null> {
  const db = await getDb();
  const current = await getUniversityForAdmin(adminId);
  if (!current) return null;
  const name = patch.name?.trim() || current.name;
  const logoUrl = patch.logoUrl === undefined ? current.logoUrl : patch.logoUrl;
  await db.query('UPDATE universities SET name = $1, logo_url = $2 WHERE id = $3', [name, logoUrl, current.id]);
  return { ...current, name, logoUrl };
}

/* ── Professor codes ────────────────────────────────────────────────────── */

export async function generateProfessorCode(universityId: string, label: string): Promise<string> {
  const db = await getDb();
  let code = randomCode();
  for (let tries = 0; tries < 6; tries++) {
    const exists = await db.query('SELECT 1 FROM professor_codes WHERE code = $1', [code]);
    if (exists.rows.length === 0) break;
    code = randomCode();
  }
  await db.query(
    `INSERT INTO professor_codes (code, university_id, label, created_at) VALUES ($1, $2, $3, $4)`,
    [code, universityId, label.trim(), Date.now()],
  );
  return code;
}

export async function listProfessorCodes(universityId: string): Promise<ProfessorCode[]> {
  const db = await getDb();
  const res = await db.query<{
    code: string;
    label: string;
    used_at: string | null;
    created_at: string;
    email: string | null;
  }>(
    `SELECT pc.code, pc.label, pc.used_at, pc.created_at, u.email
       FROM professor_codes pc
       LEFT JOIN users u ON u.id = pc.used_by
      WHERE pc.university_id = $1
      ORDER BY pc.created_at DESC`,
    [universityId],
  );
  return res.rows.map((r) => ({
    code: r.code,
    label: r.label,
    usedByEmail: r.email ?? null,
    usedAt: r.used_at == null ? null : Number(r.used_at),
    createdAt: Number(r.created_at),
  }));
}

/** Delete an unused code belonging to this university. */
export async function revokeProfessorCode(universityId: string, code: string): Promise<boolean> {
  const db = await getDb();
  const res = await db.query(
    'DELETE FROM professor_codes WHERE code = $1 AND university_id = $2 AND used_by IS NULL',
    [code.trim().toUpperCase(), universityId],
  );
  return (res.affectedRows ?? 0) > 0;
}

/** Validate + consume a professor code, returning the university it grants access to. */
export async function consumeProfessorCode(
  code: string,
  userId: string,
): Promise<{ universityId: string } | { error: string }> {
  const db = await getDb();
  const res = await db.query<{ university_id: string }>(
    'SELECT university_id FROM professor_codes WHERE code = $1 AND used_by IS NULL',
    [code.trim().toUpperCase()],
  );
  const row = res.rows[0];
  if (!row) return { error: 'That professor code is invalid or has already been used.' };
  await db.query('UPDATE professor_codes SET used_by = $1, used_at = $2 WHERE code = $3', [
    userId,
    Date.now(),
    code.trim().toUpperCase(),
  ]);
  return { universityId: row.university_id };
}

/* ── Admin oversight ────────────────────────────────────────────────────── */

export async function adminOverview(universityId: string): Promise<AdminOverview> {
  const db = await getDb();
  const totalsRes = await db.query<{ professors: number; classes: number; students: number; completions: number }>(
    `SELECT
       (SELECT COUNT(*)::int FROM users WHERE university_id = $1 AND role = 'instructor') AS professors,
       (SELECT COUNT(*)::int FROM classes WHERE university_id = $1) AS classes,
       (SELECT COUNT(DISTINCT e.student_id)::int FROM enrollments e JOIN classes c ON c.id = e.class_id WHERE c.university_id = $1) AS students,
       (SELECT COUNT(e.completed_at)::int FROM enrollments e JOIN classes c ON c.id = e.class_id WHERE c.university_id = $1) AS completions`,
    [universityId],
  );
  const profRes = await db.query<{
    id: string;
    email: string;
    classes: number;
    students: number;
    completions: number;
  }>(
    `SELECT u.id, u.email,
            COALESCE(cl.classes, 0)     AS classes,
            COALESCE(en.students, 0)    AS students,
            COALESCE(en.completions, 0) AS completions
       FROM users u
       LEFT JOIN (
         SELECT instructor_id, COUNT(*)::int AS classes
           FROM classes WHERE university_id = $1 GROUP BY instructor_id
       ) cl ON cl.instructor_id = u.id
       LEFT JOIN (
         SELECT c.instructor_id,
                COUNT(DISTINCT e.student_id)::int AS students,
                COUNT(e.completed_at)::int        AS completions
           FROM classes c JOIN enrollments e ON e.class_id = c.id
          WHERE c.university_id = $1 GROUP BY c.instructor_id
       ) en ON en.instructor_id = u.id
      WHERE u.university_id = $1 AND u.role = 'instructor'
      ORDER BY u.email ASC`,
    [universityId],
  );
  const classRes = await db.query<{
    id: string;
    title: string;
    email: string;
    enrolled: number;
    completed: number;
    exam_open: boolean;
  }>(
    `SELECT c.id, c.title, u.email,
            COALESCE(e.enrolled, 0)  AS enrolled,
            COALESCE(e.completed, 0) AS completed,
            c.exam_open
       FROM classes c
       JOIN users u ON u.id = c.instructor_id
       LEFT JOIN (
         SELECT class_id, COUNT(*)::int AS enrolled, COUNT(completed_at)::int AS completed
           FROM enrollments GROUP BY class_id
       ) e ON e.class_id = c.id
      WHERE c.university_id = $1
      ORDER BY c.created_at DESC`,
    [universityId],
  );
  const t = totalsRes.rows[0] ?? { professors: 0, classes: 0, students: 0, completions: 0 };
  return {
    totals: {
      professors: Number(t.professors),
      classes: Number(t.classes),
      students: Number(t.students),
      completions: Number(t.completions),
    },
    professors: profRes.rows.map((r) => ({
      id: r.id,
      email: r.email,
      classes: Number(r.classes),
      students: Number(r.students),
      completions: Number(r.completions),
    })),
    classes: classRes.rows.map((r) => ({
      id: r.id,
      title: r.title,
      professorEmail: r.email,
      enrolled: Number(r.enrolled),
      completed: Number(r.completed),
      examOpen: r.exam_open,
    })),
  };
}
