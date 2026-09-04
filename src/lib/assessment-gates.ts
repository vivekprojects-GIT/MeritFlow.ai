import { getDb } from './db';

/**
 * Who can open which assessment, and when.
 *
 * Two levels, resolved in a fixed order:
 *
 *   1. A **per-student override** — the most specific answer, and always wins.
 *   2. The **class default** — what everyone else gets.
 *
 * The order matters more than it looks. A professor grants one learner a
 * make-up, then closes the exam for the class; if the class default won, that
 * accommodation would silently evaporate. So an override is exactly that: it
 * overrides, in both directions, until the professor removes it.
 *
 * The final exam already had a class-level flag on `classes.exam_open`. That
 * stays the source of truth for the class default so nothing that reads it
 * breaks; this module layers module quizzes and per-student control on top.
 */

export type GateKey = 'exam' | `quiz:${number}`;

export function quizGate(moduleIndex: number): GateKey {
  return `quiz:${moduleIndex}`;
}

/** Every gate for a class, as the professor sees it. */
export type ClassGates = {
  /** Class-level open/closed, keyed by gate. */
  defaults: Record<string, boolean>;
  /** Per-student exceptions, keyed by `${studentId}|${gateKey}`. */
  overrides: Record<string, { open: boolean; reason: string }>;
};

export async function getClassGates(classId: string): Promise<ClassGates> {
  const db = await getDb();

  const [gates, overrides, cls] = await Promise.all([
    db.query<{ gate_key: string; open: boolean }>('SELECT gate_key, open FROM assessment_gates WHERE class_id = $1', [classId]),
    db.query<{ student_id: string; gate_key: string; open: boolean; reason: string }>(
      'SELECT student_id, gate_key, open, reason FROM assessment_overrides WHERE class_id = $1',
      [classId],
    ),
    db.query<{ exam_open: boolean }>('SELECT exam_open FROM classes WHERE id = $1', [classId]),
  ]);

  const defaults: Record<string, boolean> = {};
  /* The exam's class default still lives on the class row. */
  defaults.exam = Boolean(cls.rows[0]?.exam_open);
  for (const g of gates.rows) defaults[g.gate_key] = Boolean(g.open);

  const map: ClassGates['overrides'] = {};
  for (const o of overrides.rows) {
    map[`${o.student_id}|${o.gate_key}`] = { open: Boolean(o.open), reason: o.reason ?? '' };
  }

  return { defaults, overrides: map };
}

export type GateDecision = {
  open: boolean;
  /** Where the answer came from, so the UI can explain it. */
  source: 'override' | 'class-default';
  reason: string;
};

/**
 * Resolve one gate for one learner.
 *
 * Module quizzes default to **open** when the professor has never touched them.
 * Locking every quiz on day one would break every existing class the moment
 * this shipped; the final exam keeps its existing default of closed, because
 * that is what `exam_open` already meant.
 */
export function resolveGate(gates: ClassGates, studentId: string, key: GateKey): GateDecision {
  const override = gates.overrides[`${studentId}|${key}`];
  if (override) {
    return {
      open: override.open,
      source: 'override',
      reason: override.reason || (override.open ? 'Opened for you by your professor.' : 'Closed for you by your professor.'),
    };
  }

  const fallback = key === 'exam' ? false : true;
  const open = gates.defaults[key] ?? fallback;
  return {
    open,
    source: 'class-default',
    reason: open ? 'Open for the class.' : 'Your professor has not opened this yet.',
  };
}

/** Server-side check for a single learner. The one the API should call. */
export async function isOpenFor(classId: string, studentId: string, key: GateKey): Promise<GateDecision> {
  const gates = await getClassGates(classId);
  return resolveGate(gates, studentId, key);
}

/* ── Professor controls ──────────────────────────────────────────────────── */

/** Ownership is checked here, once, rather than in each caller. */
async function ownsClass(instructorId: string, classId: string): Promise<boolean> {
  const db = await getDb();
  const res = await db.query('SELECT 1 FROM classes WHERE id = $1 AND instructor_id = $2', [classId, instructorId]);
  return res.rows.length > 0;
}

export async function setClassGate(instructorId: string, classId: string, key: GateKey, open: boolean): Promise<boolean> {
  if (!(await ownsClass(instructorId, classId))) return false;
  const db = await getDb();
  const now = Date.now();

  /* The exam's class default stays on the class row so existing readers of
     `exam_open` keep working. Everything else goes in the gates table. */
  if (key === 'exam') {
    await db.query('UPDATE classes SET exam_open = $1 WHERE id = $2', [open, classId]);
    return true;
  }

  await db.query(
    `INSERT INTO assessment_gates (class_id, gate_key, open, updated_at)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (class_id, gate_key) DO UPDATE SET open = EXCLUDED.open, updated_at = EXCLUDED.updated_at`,
    [classId, key, open, now],
  );
  return true;
}

export async function setStudentOverride(
  instructorId: string,
  classId: string,
  studentId: string,
  key: GateKey,
  /** `null` removes the override and returns the learner to the class default. */
  open: boolean | null,
  reason = '',
): Promise<boolean> {
  if (!(await ownsClass(instructorId, classId))) return false;
  const db = await getDb();

  /* The learner must actually be in this class. Without this a professor could
     grant an override to any user id at all. */
  const enrolled = await db.query('SELECT 1 FROM enrollments WHERE class_id = $1 AND student_id = $2', [classId, studentId]);
  if (enrolled.rows.length === 0) return false;

  if (open === null) {
    await db.query('DELETE FROM assessment_overrides WHERE class_id = $1 AND student_id = $2 AND gate_key = $3', [
      classId,
      studentId,
      key,
    ]);
    return true;
  }

  await db.query(
    `INSERT INTO assessment_overrides (class_id, student_id, gate_key, open, reason, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (class_id, student_id, gate_key)
     DO UPDATE SET open = EXCLUDED.open, reason = EXCLUDED.reason, updated_at = EXCLUDED.updated_at`,
    [classId, studentId, key, open, reason.slice(0, 200), Date.now()],
  );
  return true;
}

/* ── Professor view ──────────────────────────────────────────────────────── */

export type GateRow = {
  key: GateKey;
  label: string;
  classOpen: boolean;
  /** Learners whose access differs from the class default. */
  exceptions: { studentId: string; email: string; open: boolean; reason: string }[];
};

/**
 * Every gate in a class with its exceptions, for the professor's controls.
 *
 * One query for the roster and one for the overrides, joined in memory — a
 * per-gate lookup would be N+1 over the module count.
 */
export async function gateOverview(
  instructorId: string,
  classId: string,
  moduleTitles: string[],
): Promise<GateRow[] | null> {
  if (!(await ownsClass(instructorId, classId))) return null;

  const db = await getDb();
  const gates = await getClassGates(classId);
  const emails = await db.query<{ student_id: string; email: string }>(
    `SELECT e.student_id, u.email FROM enrollments e JOIN users u ON u.id = e.student_id WHERE e.class_id = $1`,
    [classId],
  );
  const emailById = new Map(emails.rows.map((r) => [r.student_id, r.email]));

  const keys: { key: GateKey; label: string }[] = [
    ...moduleTitles.map((title, i) => ({ key: quizGate(i) as GateKey, label: `Quiz · ${title}` })),
    { key: 'exam' as GateKey, label: 'Final exam' },
  ];

  return keys.map(({ key, label }) => {
    const classOpen = gates.defaults[key] ?? (key === 'exam' ? false : true);
    const exceptions: GateRow['exceptions'] = [];
    for (const [composite, value] of Object.entries(gates.overrides)) {
      const [studentId, gateKey] = composite.split('|');
      if (gateKey !== key) continue;
      const email = emailById.get(studentId);
      /* An override for someone no longer enrolled is stale; do not show it. */
      if (!email) continue;
      exceptions.push({ studentId, email, open: value.open, reason: value.reason });
    }
    return { key, label, classOpen, exceptions };
  });
}
