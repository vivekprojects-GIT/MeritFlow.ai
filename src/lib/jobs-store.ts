import { randomUUID } from 'node:crypto';
import { getDb } from './db';

/**
 * JobPilot — discovery, matching and tracking.
 *
 * Two things from the specification shape this file more than anything else.
 *
 * **Scoring is structured, not generative.** Section 14 sets a performance
 * target: a large batch must not become one expensive LLM call per job. So the
 * score here is a weighted sum of things that can be computed from data —
 * skill coverage, track fit, seniority, location, compensation, freshness —
 * and every component is returned alongside the total. A number a candidate
 * cannot interrogate is worse than no number, and an LLM asked to rate a job
 * 0-100 will happily produce a confident figure it cannot justify.
 *
 * **No calibrated probability.** The spec is explicit: do not claim an
 * interview probability until there is outcome data to calibrate against. This
 * returns a *fit* score — how well the posting matches the evidence — and says
 * so in the UI. It never says "72% chance of an interview".
 *
 * What this module deliberately does not do is submit anything. Auto-filling
 * and submitting forms on third-party job sites is account automation against
 * services the user has a relationship with and we do not; the states below go
 * up to READY, and applying opens the real posting.
 */

export type Track = 'internship' | 'co_op' | 'new_grad' | 'entry_level' | 'full_time' | 'contract';

/** The subset of the spec's state machine that stops short of auto-submission. */
export type AppState =
  | 'MATCHED'
  | 'PREPARING'
  | 'READY'
  | 'NEEDS_USER_INPUT'
  | 'APPLIED'
  | 'INTERVIEW'
  | 'REJECTED'
  | 'OFFER'
  | 'SKIPPED';

export type CandidateProfile = {
  userId: string;
  careerStage: string;
  targetRoles: string[];
  locations: string[];
  tracks: { type: Track; weight: number }[];
  skills: string[];
  minComp: number | null;
  resumeText: string;
  resumeName: string;
  /** When setup was finished. Zero means the wizard has not been completed. */
  onboardedAt: number;
};

export type Job = {
  id: string;
  company: string;
  title: string;
  location: string;
  remote: boolean;
  track: Track;
  description: string;
  skills: string[];
  minComp: number | null;
  url: string;
  postedAt: number | null;
  /**
   * When this posting first entered the corpus.
   *
   * Boards are inconsistent about `postedAt` -- some omit it, some round it to
   * the day -- so freshness rules need a figure that always exists. This is
   * ours, not the employer's, and is only ever a fallback for that reason.
   */
  detectedAt: number;
  /**
   * Where this posting was found, as a fact rather than an inference.
   *
   * COMPANY_CAREER_SITE | LINKEDIN | INDEED | GOOGLE_JOBS | REFERRAL | MANUAL
   * Empty when the ingester predates this and did not say.
   */
  discoverySource: string;
  companyBlurb: string;
  seniority: string;
  yearsExp: string;
  employment: string;
  workMode: string;
  /** Null when the source does not report it. Never invented. */
  applicants: number | null;
};

export type ScoreParts = {
  skills: number;
  role: number;
  seniority: number;
  evidence: number;
  location: number;
  compensation: number;
  freshness: number;
};

export type Match = {
  job: Job;
  score: number;
  parts: ScoreParts;
  /** Required skills with no evidence behind them — what to learn next. */
  gaps: string[];
  state: AppState | null;
};

/**
 * Weights from spec section 14. They sum to 100 and live here as one object so
 * a change is a single edit rather than seven scattered magic numbers.
 */
const WEIGHTS = {
  skills: 30,
  role: 20,
  seniority: 15,
  evidence: 15,
  location: 8,
  compensation: 5,
  freshness: 7,
} as const;

const DAY = 86_400_000;

/* ── Text helpers ────────────────────────────────────────────────────────── */

/** Lowercase, strip punctuation, collapse whitespace. Used for all matching. */
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9+#. ]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Tokens of 2+ chars, deduped. "C++" and "C#" survive normalisation above. */
function tokens(s: string): Set<string> {
  return new Set(norm(s).split(' ').filter((t) => t.length >= 2));
}

/**
 * US state abbreviations, both directions.
 *
 * Without this, a candidate who says "Texas" scores zero on a job in
 * "Austin, TX" — substring matching cannot know the two are the same place,
 * and the candidate silently loses the location component on exactly the jobs
 * they most want. Only the states are here; cities are handled by the token
 * overlap below, which already matches "Austin" to "Austin, TX".
 */
const STATES: Record<string, string> = {
  al: 'alabama', ak: 'alaska', az: 'arizona', ar: 'arkansas', ca: 'california',
  co: 'colorado', ct: 'connecticut', de: 'delaware', fl: 'florida', ga: 'georgia',
  hi: 'hawaii', id: 'idaho', il: 'illinois', in: 'indiana', ia: 'iowa',
  ks: 'kansas', ky: 'kentucky', la: 'louisiana', me: 'maine', md: 'maryland',
  ma: 'massachusetts', mi: 'michigan', mn: 'minnesota', ms: 'mississippi', mo: 'missouri',
  mt: 'montana', ne: 'nebraska', nv: 'nevada', nh: 'new hampshire', nj: 'new jersey',
  nm: 'new mexico', ny: 'new york', nc: 'north carolina', nd: 'north dakota', oh: 'ohio',
  ok: 'oklahoma', or: 'oregon', pa: 'pennsylvania', ri: 'rhode island', sc: 'south carolina',
  sd: 'south dakota', tn: 'tennessee', tx: 'texas', ut: 'utah', vt: 'vermont',
  va: 'virginia', wa: 'washington', wv: 'west virginia', wi: 'wisconsin', wy: 'wyoming',
  dc: 'district of columbia',
};

/** Expand a place into every name it might be written under. */
function placeTerms(s: string): Set<string> {
  const out = new Set<string>();
  const n = norm(s);
  if (!n) return out;
  out.add(n);
  for (const part of n.split(' ')) {
    if (!part) continue;
    out.add(part);
    if (STATES[part]) out.add(STATES[part]);
  }
  /* And the reverse: a preference of "texas" should also carry "tx". */
  for (const [abbr, full] of Object.entries(STATES)) {
    if (n.includes(full)) out.add(abbr);
  }
  return out;
}

/**
 * Job-title synonyms.
 *
 * "Developer" and "Engineer" are the same job in every posting that matters,
 * and a candidate targeting "Software Engineer" who scores zero on "Backend
 * Developer I" is being failed by vocabulary rather than by fit.
 */
const TITLE_SYNONYMS: Record<string, string> = {
  developer: 'engineer',
  dev: 'engineer',
  swe: 'engineer',
  programmer: 'engineer',
  ml: 'machine',
  ai: 'machine',
};

function titleTokens(s: string): Set<string> {
  const out = new Set<string>();
  for (const t of tokens(s)) out.add(TITLE_SYNONYMS[t] ?? t);
  return out;
}

/**
 * Seniority implied by a job title.
 *
 * Ordered so a candidate can be compared against it: an intern applying to a
 * staff role should lose most of the seniority component, and a senior engineer
 * applying to an internship should too — over-qualification is also a mismatch.
 */
function seniorityOf(title: string): number {
  const t = norm(title);
  if (/\bintern(ship)?\b/.test(t)) return 0;
  if (/\b(new ?grad|graduate|entry|junior|jr|associate|i\b|1\b)\b/.test(t)) return 1;
  if (/\b(senior|sr|lead|iii|3)\b/.test(t)) return 3;
  if (/\b(staff|principal|architect|manager|head|director)\b/.test(t)) return 4;
  return 2; /* mid-level / unmarked */
}

function stageSeniority(stage: string): number {
  const s = norm(stage);
  if (/sophomore|junior|intern/.test(s)) return 0;
  if (/senior|new ?grad|graduate|entry/.test(s)) return 1;
  if (/experienced|mid/.test(s)) return 2;
  return 1;
}

/* ── Scoring ─────────────────────────────────────────────────────────────── */

/**
 * Score one job against one candidate.
 *
 * Pure and synchronous by design: it takes no database handle and makes no
 * network call, so scoring a thousand jobs is a thousand cheap function calls
 * rather than a thousand round-trips.
 */
export function scoreJob(profile: CandidateProfile, job: Job): { score: number; parts: ScoreParts; gaps: string[] } {
  const evidence = tokens(`${profile.resumeText} ${profile.skills.join(' ')}`);

  /* 1. Required-skill coverage — the largest single component, and the only
     one that also produces an actionable list. */
  const required = job.skills.map(norm).filter(Boolean);
  const met = required.filter((s) => {
    /* A multi-word skill counts as met when every word of it appears. */
    return s.split(' ').every((w) => evidence.has(w));
  });
  const gaps = job.skills.filter((_, i) => !met.includes(required[i]));
  const skills = required.length === 0 ? 0.5 : met.length / required.length;

  /* 2. Role similarity — token overlap between the target roles and the title,
     after collapsing Developer/Engineer-style synonyms. */
  const jobTitle = titleTokens(job.title);
  const roleTokens = titleTokens(profile.targetRoles.join(' '));
  const roleOverlap = [...roleTokens].filter((t) => jobTitle.has(t)).length;
  const role = roleTokens.size === 0 ? 0.5 : Math.min(1, roleOverlap / Math.min(roleTokens.size, 3));

  /* 3. Seniority alignment — distance, in levels, in either direction. */
  const gap = Math.abs(seniorityOf(job.title) - stageSeniority(profile.careerStage));
  const seniority = gap === 0 ? 1 : gap === 1 ? 0.6 : gap === 2 ? 0.25 : 0;

  /* 4. Semantic evidence — how much of the description the candidate's own
     history actually speaks to. Token overlap stands in for an embedding here:
     it is transparent, needs no model, and is honest about being coarse. */
  const descTokens = [...tokens(job.description)].filter((t) => t.length > 3);
  const hit = descTokens.filter((t) => evidence.has(t)).length;
  const evidenceScore = descTokens.length === 0 ? 0.4 : Math.min(1, hit / Math.max(12, descTokens.length * 0.18));

  /* 5. Location — remote satisfies everyone; otherwise compare expanded place
     terms, so "Texas" matches "Austin, TX" and "Austin" does too. */
  const jobPlace = placeTerms(job.location);
  const wantsRemote = profile.locations.some((l) => /remote/i.test(l));
  const location =
    (job.remote && (wantsRemote || profile.locations.length === 0)) || profile.locations.length === 0
      ? 1
      : profile.locations.some((p) => {
          if (/remote/i.test(p)) return job.remote;
          return [...placeTerms(p)].some((t) => jobPlace.has(t));
        })
        ? 1
        : 0;

  /* 6. Compensation — unknown pay is neutral, not a penalty. Most postings do
        not publish a band, and scoring those to zero would bury them all. */
  const compensation =
    profile.minComp == null || job.minComp == null ? 0.5 : job.minComp >= profile.minComp ? 1 : Math.max(0, job.minComp / profile.minComp);

  /* 7. Freshness — a month-old posting is usually already filled. */
  const ageDays = job.postedAt == null ? 14 : Math.max(0, (Date.now() - job.postedAt) / DAY);
  const freshness = ageDays <= 3 ? 1 : ageDays <= 14 ? 0.75 : ageDays <= 30 ? 0.4 : 0.15;

  const parts: ScoreParts = {
    skills: Math.round(skills * WEIGHTS.skills),
    role: Math.round(role * WEIGHTS.role),
    seniority: Math.round(seniority * WEIGHTS.seniority),
    evidence: Math.round(evidenceScore * WEIGHTS.evidence),
    location: Math.round(location * WEIGHTS.location),
    compensation: Math.round(compensation * WEIGHTS.compensation),
    freshness: Math.round(freshness * WEIGHTS.freshness),
  };

  const score = Math.min(100, Object.values(parts).reduce((a, b) => a + b, 0));
  return { score, parts, gaps };
}

/* ── Profile ─────────────────────────────────────────────────────────────── */

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function getCandidateProfile(userId: string): Promise<CandidateProfile | null> {
  const db = await getDb();
  const res = await db.query<{
    user_id: string;
    career_stage: string;
    target_roles: string;
    locations: string;
    tracks: string;
    skills: string;
    min_comp: number | null;
    resume_text: string;
    resume_name: string;
    onboarded_at: string | number | null;
  }>('SELECT * FROM candidate_profiles WHERE user_id = $1', [userId]);
  const r = res.rows[0];
  if (!r) return null;
  return {
    userId: r.user_id,
    careerStage: r.career_stage,
    targetRoles: parseJson<string[]>(r.target_roles, []),
    locations: parseJson<string[]>(r.locations, []),
    tracks: parseJson<CandidateProfile['tracks']>(r.tracks, []),
    skills: parseJson<string[]>(r.skills, []),
    minComp: r.min_comp,
    resumeText: r.resume_text,
    resumeName: r.resume_name,
    onboardedAt: Number(r.onboarded_at ?? 0),
  };
}

export async function saveCandidateProfile(userId: string, patch: Partial<Omit<CandidateProfile, 'userId'>>): Promise<CandidateProfile> {
  const db = await getDb();
  const current = (await getCandidateProfile(userId)) ?? {
    userId,
    careerStage: '',
    targetRoles: [],
    locations: [],
    tracks: [],
    skills: [],
    minComp: null,
    resumeText: '',
    resumeName: '',
    onboardedAt: 0,
  };
  const next: CandidateProfile = { ...current, ...patch, userId };

  await db.query(
    `INSERT INTO candidate_profiles
       (user_id, career_stage, target_roles, locations, tracks, skills, min_comp, resume_text, resume_name, updated_at, onboarded_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (user_id) DO UPDATE SET
       career_stage = EXCLUDED.career_stage,
       target_roles = EXCLUDED.target_roles,
       locations    = EXCLUDED.locations,
       tracks       = EXCLUDED.tracks,
       skills       = EXCLUDED.skills,
       min_comp     = EXCLUDED.min_comp,
       resume_text  = EXCLUDED.resume_text,
       resume_name  = EXCLUDED.resume_name,
       updated_at   = EXCLUDED.updated_at,
       /* Never cleared by a later partial save. Setup happened; a subsequent
          write that does not mention it must not un-happen it. */
       onboarded_at = GREATEST(candidate_profiles.onboarded_at, EXCLUDED.onboarded_at)`,
    [
      userId,
      next.careerStage.slice(0, 60),
      JSON.stringify(next.targetRoles.slice(0, 12)),
      JSON.stringify(next.locations.slice(0, 12)),
      JSON.stringify(next.tracks.slice(0, 6)),
      JSON.stringify(next.skills.slice(0, 80)),
      next.minComp,
      /* Capped: a resume is a few pages, and an unbounded blob here would be a
         cheap way to fill the database. */
      next.resumeText.slice(0, 40_000),
      next.resumeName.slice(0, 200),
      Date.now(),
      next.onboardedAt,
    ],
  );
  return next;
}

/* ── Jobs ────────────────────────────────────────────────────────────────── */

function mapJob(r: Record<string, unknown>): Job {
  return {
    id: String(r.id),
    company: String(r.company),
    title: String(r.title),
    location: String(r.location ?? ''),
    remote: Boolean(r.remote),
    track: String(r.track ?? 'entry_level') as Track,
    description: String(r.description ?? ''),
    skills: parseJson<string[]>(String(r.skills ?? '[]'), []),
    minComp: r.min_comp == null ? null : Number(r.min_comp),
    url: String(r.url ?? ''),
    postedAt: r.posted_at == null ? null : Number(r.posted_at),
    detectedAt: Number(r.detected_at ?? 0),
    discoverySource: String(r.discovery_source ?? ''),
    companyBlurb: String(r.company_blurb ?? ''),
    seniority: String(r.seniority ?? ''),
    yearsExp: String(r.years_exp ?? ''),
    employment: String(r.employment ?? ''),
    workMode: String(r.work_mode ?? ''),
    applicants: r.applicants == null ? null : Number(r.applicants),
  };
}

export async function listJobs(limit = 200): Promise<Job[]> {
  const db = await getDb();
  const res = await db.query<Record<string, unknown>>(
    "SELECT * FROM jobs WHERE status = 'open' ORDER BY detected_at DESC LIMIT $1",
    [limit],
  );
  return res.rows.map(mapJob);
}

/** Insert a job, or refresh `last_seen_at` if the same posting already exists. */
/* `detectedAt` is ours to stamp, not the caller's to supply: an ingester that
   passed its own value could backdate a posting past a freshness rule. */
export async function upsertJob(
  job: Omit<Job, 'id' | 'detectedAt' | 'discoverySource'> & {
    source?: string;
    detectedAt?: number;
    discoverySource?: string;
  },
): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  await db.query(
    `INSERT INTO jobs (id, company, title, norm_title, location, remote, track, description,
                       skills, min_comp, url, source, posted_at, detected_at, last_seen_at, status,
                       company_blurb, seniority, years_exp, employment, work_mode, applicants,
                       discovery_source, source_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'open',$16,$17,$18,$19,$20,$21,$22,$23)
     ON CONFLICT (company, norm_title, location)
     DO UPDATE SET
       last_seen_at  = EXCLUDED.last_seen_at,
       status        = 'open',
       -- A posting can be edited by the employer, so re-seeing it refreshes
       -- the descriptive fields too. Previously only the timestamp moved,
       -- which meant an existing row could never pick up a new column.
       description   = EXCLUDED.description,
       skills        = EXCLUDED.skills,
       min_comp      = EXCLUDED.min_comp,
       url           = EXCLUDED.url,
       posted_at     = EXCLUDED.posted_at,
       company_blurb = EXCLUDED.company_blurb,
       seniority     = EXCLUDED.seniority,
       years_exp     = EXCLUDED.years_exp,
       employment    = EXCLUDED.employment,
       work_mode     = EXCLUDED.work_mode,
       applicants    = EXCLUDED.applicants,
       /* Only fill provenance that is missing. A posting first found on the
          employer's own board and later re-seen through an aggregator was
          still found on the board, and overwriting that would turn a true
          answer into a weaker one. */
       discovery_source = CASE WHEN jobs.discovery_source = '' THEN EXCLUDED.discovery_source ELSE jobs.discovery_source END,
       source_url       = CASE WHEN jobs.source_url = '' THEN EXCLUDED.source_url ELSE jobs.source_url END`,
    [
      randomUUID(),
      job.company,
      job.title,
      norm(job.title),
      job.location,
      job.remote,
      job.track,
      job.description,
      JSON.stringify(job.skills),
      job.minComp,
      job.url,
      job.source ?? 'seed',
      job.postedAt,
      now,
      now,
      job.companyBlurb ?? '',
      job.seniority ?? '',
      job.yearsExp ?? '',
      job.employment ?? '',
      job.workMode ?? '',
      job.applicants ?? null,
      job.discoverySource ?? '',
      job.url,
    ],
  );
}

/* ── Matching ────────────────────────────────────────────────────────────── */

export async function topMatches(userId: string, limit = 12): Promise<Match[]> {
  return (await rankedMatches(userId)).slice(0, limit);
}

/**
 * Every scored, deduplicated match, best first — the full board.
 *
 * Split out of topMatches so the Matches facets can narrow the corpus and
 * *then* rank: a chip that only filtered the pre-cut top twelve returned
 * nothing for any facet those twelve did not happen to contain.
 */
export async function rankedMatches(userId: string): Promise<Match[]> {
  const profile = await getCandidateProfile(userId);
  if (!profile) return [];

  /* The whole corpus, not a recency window: 300-by-detection hid the best
     matches behind whatever was collected most recently — the same window bug
     that once made the batch runner report an empty queue. */
  const [jobs, apps] = await Promise.all([listJobs(5000), listApplications(userId)]);
  const stateByJob = new Map(apps.map((a) => [a.job.id, a.state]));

  const ranked = jobs
    .map((job) => {
      const { score, parts, gaps } = scoreJob(profile, job);
      return { job, score, parts, gaps, state: stateByJob.get(job.id) ?? null };
    })
    /* Skipped jobs stay skipped — re-surfacing something the candidate
       dismissed is the fastest way to make a recommender feel broken. */
    .filter((m) => m.state !== 'SKIPPED')
    .sort((a, b) => b.score - a.score);

  /*
   * One card per role. Collectors re-ingest the same posting under several
   * URLs, and a matches list showing the identical Modus Create row four
   * times reads as a bug however good the scores are. The best-scoring copy
   * represents the role; an already-tracked copy wins over an untracked one
   * so the card keeps its state badge.
   */
  const seen = new Map<string, Match>();
  for (const m of ranked) {
    const key = `${m.job.company.toLowerCase()}::${m.job.title.toLowerCase().replace(/\s+/g, ' ').trim()}`;
    const prior = seen.get(key);
    if (!prior || (m.state && !prior.state)) seen.set(key, prior && m.state && !prior.state ? { ...m, score: prior.score } : m);
  }
  return [...seen.values()].sort((a, b) => b.score - a.score);
}

/* ── Applications ────────────────────────────────────────────────────────── */

export type Application = Match & { state: AppState; createdAt: number; updatedAt: number };

export async function listApplications(userId: string): Promise<Application[]> {
  const db = await getDb();
  const res = await db.query<Record<string, unknown>>(
    `SELECT a.state, a.score, a.score_parts, a.gaps, a.created_at, a.updated_at, j.*
       FROM job_applications a JOIN jobs j ON j.id = a.job_id
      WHERE a.user_id = $1
      ORDER BY a.updated_at DESC`,
    [userId],
  );
  return res.rows.map((r) => ({
    job: mapJob(r),
    score: Number(r.score),
    parts: parseJson<ScoreParts>(String(r.score_parts ?? '{}'), {} as ScoreParts),
    gaps: parseJson<string[]>(String(r.gaps ?? '[]'), []),
    state: String(r.state) as AppState,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  }));
}

/** Create or advance an application. Idempotent on (user, job) by primary key. */
export async function setApplicationState(userId: string, jobId: string, state: AppState): Promise<boolean> {
  const db = await getDb();
  const job = await db.query<Record<string, unknown>>('SELECT * FROM jobs WHERE id = $1', [jobId]);
  if (job.rows.length === 0) return false;

  const profile = await getCandidateProfile(userId);
  const scored = profile ? scoreJob(profile, mapJob(job.rows[0])) : { score: 0, parts: {} as ScoreParts, gaps: [] };
  const now = Date.now();

  await db.query(
    `INSERT INTO job_applications (user_id, job_id, state, score, score_parts, gaps, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$7)
     ON CONFLICT (user_id, job_id) DO UPDATE SET state = EXCLUDED.state, updated_at = EXCLUDED.updated_at`,
    [userId, jobId, state, scored.score, JSON.stringify(scored.parts), JSON.stringify(scored.gaps), now],
  );
  return true;
}

/**
 * How far through the process each tracker state is.
 *
 * Used to stop Autopilot dragging a job backwards. Terminal states sit highest
 * because once a candidate has recorded an offer or a rejection, no automated
 * step should overwrite it.
 */
const STATE_RANK: Record<AppState, number> = {
  MATCHED: 0,
  SKIPPED: 1,
  PREPARING: 2,
  READY: 3,
  NEEDS_USER_INPUT: 3,
  APPLIED: 4,
  INTERVIEW: 5,
  OFFER: 6,
  REJECTED: 6,
};

/** Autopilot run states, mapped onto what the tracker shows a person. */
const RUN_TO_TRACKER: Record<string, AppState> = {
  PREPARING: 'PREPARING',
  RESUME_READY: 'PREPARING',
  ANSWERS_READY: 'PREPARING',
  VERIFIED: 'PREPARING',
  QUEUED: 'PREPARING',
  FILLING: 'PREPARING',
  VALIDATED: 'PREPARING',
  DRY_RUN_COMPLETE: 'READY',
  NEEDS_USER_ACTION: 'NEEDS_USER_INPUT',
  /*
   * SUBMITTING is an attempt, not an application.
   *
   * It used to map to APPLIED, and because this mirror deliberately never
   * downgrades a card, any run that reached the click and then failed stayed
   * "Applied" for ever. The candidate's board showed eight applications sent
   * when nothing had left the machine -- which they noticed the only way anyone
   * would, by waiting for confirmation emails that were never coming.
   *
   * Only a state that means the employer has it counts as applied.
   */
  SUBMITTING: 'PREPARING',
  /* Clicked but unproven. Shown as needing you, because resolving it is a
     glance at your inbox and nobody else can do it. */
  SUBMISSION_UNCONFIRMED: 'NEEDS_USER_INPUT',
  SUBMITTED: 'APPLIED',
  CONFIRMED: 'APPLIED',
  INTERVIEW: 'INTERVIEW',
  OFFER: 'OFFER',
  REJECTED: 'REJECTED',
  SKIPPED: 'SKIPPED',
};

/**
 * Mirror an Autopilot run into the learner's tracker.
 *
 * The two tables are separate on purpose — one is durable workflow state, the
 * other is a board the candidate edits freely — but nothing was bridging them,
 * so running Autopilot left the Tracker and the funnel completely empty. From
 * the outside that reads as "auto apply did nothing".
 *
 * Only ever moves forward. If the candidate has already recorded an interview,
 * a later run finishing its paperwork must not drag the card back to Applied.
 */
export async function mirrorRunToTracker(userId: string, jobId: string, runState: string): Promise<void> {
  const target = RUN_TO_TRACKER[runState];
  if (!target) return;

  const db = await getDb();
  const existing = await db.query<{ state: string }>(
    'SELECT state FROM job_applications WHERE user_id = $1 AND job_id = $2',
    [userId, jobId],
  );
  const current = existing.rows[0]?.state as AppState | undefined;

  /* A skip is the candidate's decision as much as ours; never undo one. */
  if (current === 'SKIPPED' && target !== 'SKIPPED') return;
  if (current && STATE_RANK[current] >= STATE_RANK[target]) return;

  await setApplicationState(userId, jobId, target);
}

/* ── Funnel analytics ────────────────────────────────────────────────────── */

export type JobFunnel = {
  total: number;
  byState: Record<string, number>;
  /** The spec's north-star: interviews divided by applications actually sent. */
  interviewRate: number | null;
  /** Mean fit score of everything applied to — is the aim getting better? */
  meanScore: number | null;
};

export function funnelOf(apps: Application[]): JobFunnel {
  const byState: Record<string, number> = {};
  for (const a of apps) byState[a.state] = (byState[a.state] ?? 0) + 1;

  const sent = apps.filter((a) => ['APPLIED', 'INTERVIEW', 'REJECTED', 'OFFER'].includes(a.state));
  const interviews = apps.filter((a) => ['INTERVIEW', 'OFFER'].includes(a.state)).length;

  return {
    total: apps.length,
    byState,
    /* Null rather than 0% until something has actually been sent — a 0% rate
       on an empty funnel reads as failure when it just means "not yet". */
    interviewRate: sent.length === 0 ? null : Math.round((interviews / sent.length) * 100),
    meanScore: sent.length === 0 ? null : Math.round(sent.reduce((a, b) => a + b.score, 0) / sent.length),
  };
}
