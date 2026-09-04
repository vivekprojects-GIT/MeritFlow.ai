import { getDb } from '../db';
import type { Track } from '../jobs-store';

/**
 * The Autopilot policy — what the candidate has authorized.
 *
 * Absent means OFF. There is no "sensible default that starts applying": a
 * system that acts on someone's behalf must be switched on deliberately, and
 * inferring consent from silence is the wrong side of a line worth keeping
 * bright.
 */

export type AutopilotMode =
  /** AI finds and prepares; the candidate reviews and submits. */
  | 'MANUAL'
  /** High confidence submits, medium asks, low skips. The recommended default. */
  | 'SMART'
  /** Every gate clean and an approved path submits without asking. */
  | 'FULL';

export type AutopilotPolicy = {
  userId: string;
  mode: AutopilotMode;
  minScore: number;
  tracks: Track[];
  minComp: number | null;
  locations: string[];
  maxJobAgeHours: number;
  /**
   * Never interrupt the candidate.
   *
   * An application that cannot be completed from verified evidence is skipped
   * and the runner moves on. Nothing about what may be *answered* changes.
   */
  neverAsk: boolean;
  /** Whether an ageing posting must score higher than the floor to qualify. */
  ageEscalation: boolean;
  allowStaffing: boolean;
  allowContract: boolean;
  allowClearance: boolean;
  maxPerDay: number;
  maxPerCompany: number;
  maxActive: number;
  updatedAt: number;
};

/** Applied only when the candidate turns Autopilot on, never before. */
export const SUGGESTED: Omit<AutopilotPolicy, 'userId' | 'updatedAt'> = {
  mode: 'SMART',
  minScore: 88,
  tracks: [],
  minComp: null,
  locations: [],
  /* A week. Most postings are stale well before this, but a tighter default
     would silently discard everything for a candidate who checks weekly. */
  maxJobAgeHours: 168,
  neverAsk: false,
  ageEscalation: true,
  allowStaffing: false,
  allowContract: false,
  allowClearance: false,
  maxPerDay: 20,
  maxPerCompany: 2,
  maxActive: 150,
};

export async function getPolicy(userId: string): Promise<AutopilotPolicy | null> {
  const db = await getDb();
  const res = await db.query<Record<string, unknown>>('SELECT * FROM autopilot_policies WHERE user_id = $1', [userId]);
  const r = res.rows[0];
  if (!r) return null;

  const parse = <T>(raw: unknown, fallback: T): T => {
    try {
      return JSON.parse(String(raw)) as T;
    } catch {
      return fallback;
    }
  };

  return {
    userId,
    mode: String(r.mode) as AutopilotMode,
    minScore: Number(r.min_score),
    tracks: parse<Track[]>(r.tracks, []),
    minComp: r.min_comp == null ? null : Number(r.min_comp),
    locations: parse<string[]>(r.locations, []),
    maxJobAgeHours: Number(r.max_job_age_hrs),
    neverAsk: Boolean(r.never_ask),
    ageEscalation: r.age_escalation == null ? true : Boolean(r.age_escalation),
    allowStaffing: Boolean(r.allow_staffing),
    allowContract: Boolean(r.allow_contract),
    allowClearance: Boolean(r.allow_clearance),
    maxPerDay: Number(r.max_per_day),
    maxPerCompany: Number(r.max_per_company),
    maxActive: Number(r.max_active),
    updatedAt: Number(r.updated_at),
  };
}

export async function savePolicy(userId: string, patch: Partial<Omit<AutopilotPolicy, 'userId' | 'updatedAt'>>): Promise<AutopilotPolicy> {
  const current = (await getPolicy(userId)) ?? { userId, ...SUGGESTED, updatedAt: 0 };
  const next: AutopilotPolicy = { ...current, ...patch, userId, updatedAt: Date.now() };

  /* Clamped rather than trusted: these come from a form, and a maxPerDay of
     100000 would turn a quality tool into the mass-application bot the whole
     design exists to avoid. */
  next.minScore = clamp(next.minScore, 0, 100);
  next.maxPerDay = clamp(next.maxPerDay, 1, 50);
  next.maxPerCompany = clamp(next.maxPerCompany, 1, 10);
  next.maxActive = clamp(next.maxActive, 1, 500);
  next.maxJobAgeHours = clamp(next.maxJobAgeHours, 1, 24 * 90);

  const db = await getDb();
  await db.query(
    `INSERT INTO autopilot_policies
       (user_id, mode, min_score, tracks, min_comp, locations, max_job_age_hrs,
        allow_staffing, allow_contract, allow_clearance, max_per_day, max_per_company, max_active, updated_at, never_ask, age_escalation)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     ON CONFLICT (user_id) DO UPDATE SET
       mode = EXCLUDED.mode, min_score = EXCLUDED.min_score, tracks = EXCLUDED.tracks,
       min_comp = EXCLUDED.min_comp, locations = EXCLUDED.locations, max_job_age_hrs = EXCLUDED.max_job_age_hrs,
       allow_staffing = EXCLUDED.allow_staffing, allow_contract = EXCLUDED.allow_contract,
       allow_clearance = EXCLUDED.allow_clearance, max_per_day = EXCLUDED.max_per_day,
       max_per_company = EXCLUDED.max_per_company, max_active = EXCLUDED.max_active,
       updated_at = EXCLUDED.updated_at, never_ask = EXCLUDED.never_ask,
       age_escalation = EXCLUDED.age_escalation`,
    [
      userId,
      next.mode,
      next.minScore,
      JSON.stringify(next.tracks),
      next.minComp,
      JSON.stringify(next.locations),
      next.maxJobAgeHours,
      next.allowStaffing,
      next.allowContract,
      next.allowClearance,
      next.maxPerDay,
      next.maxPerCompany,
      next.maxActive,
      next.updatedAt,
      next.neverAsk,
      next.ageEscalation,
    ],
  );
  return next;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Math.round(Number.isFinite(n) ? n : lo)));
}
