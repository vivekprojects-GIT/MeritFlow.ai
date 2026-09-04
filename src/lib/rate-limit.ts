/**
 * Per-user rate limiting.
 *
 * Only the assistant route was metered, which left the expensive endpoints
 * open: the autopilot runner launches a headless browser per job and can hold
 * one open for minutes, and course generation makes several model calls. One
 * impatient double-click on either is enough to double the cost of a request
 * nobody wanted twice.
 *
 * ## In memory, deliberately for now
 *
 * A token bucket per process. That is correct for a single-process deployment,
 * which is what a single app process already implies; the moment it runs on more than
 * one instance this has to move to shared storage, because per-process buckets
 * multiply the real limit by the number of instances. Named here so the
 * limitation is a known one rather than a surprise.
 */

type Bucket = { tokens: number; updatedAt: number };

const buckets = new Map<string, Bucket>();

/* Swept on write rather than on a timer: an interval would keep a serverless
   instance alive, and the map only grows when someone is actually using it. */
const SWEEP_EVERY = 500;
let writes = 0;

export type Limit = { capacity: number; refillPerMinute: number };

/**
 * The limits, by cost rather than by convenience.
 *
 * `autopilot` is the tightest because one call can drive dozens of page loads
 * against other people's servers. `read` is loose because refusing a list
 * endpoint mostly just breaks the UI.
 */
export const LIMITS = {
  autopilot: { capacity: 3, refillPerMinute: 1 },
  /*
   * A portfolio rebuild costs up to 25 requests against GitHub's API.
   * Unauthenticated, GitHub allows 60 an hour *per IP* — which on a deployment
   * is shared by every user, so one person mashing refresh takes the feature
   * down for everybody. Two bursts, refilling roughly every ten minutes.
   * Setting GITHUB_TOKEN raises the upstream ceiling to 5,000 an hour.
   */
  github: { capacity: 2, refillPerMinute: 0.1 },
  generate: { capacity: 5, refillPerMinute: 2 },
  assistant: { capacity: 20, refillPerMinute: 10 },
  write: { capacity: 60, refillPerMinute: 30 },
  read: { capacity: 240, refillPerMinute: 120 },
} as const satisfies Record<string, Limit>;

export type LimitName = keyof typeof LIMITS;

export type RateResult = {
  allowed: boolean;
  /** Whole seconds until one more request is permitted. Zero when allowed. */
  retryAfter: number;
  remaining: number;
};

export function checkRate(key: string, name: LimitName, now = Date.now()): RateResult {
  const limit = LIMITS[name];
  const id = `${name}:${key}`;
  const bucket = buckets.get(id) ?? { tokens: limit.capacity, updatedAt: now };

  /* Continuous refill rather than fixed windows: a window boundary lets
     someone spend a full allowance twice in two adjacent seconds. */
  const elapsedMin = Math.max(0, now - bucket.updatedAt) / 60_000;
  const tokens = Math.min(limit.capacity, bucket.tokens + elapsedMin * limit.refillPerMinute);

  if (tokens < 1) {
    const secondsPerToken = 60 / limit.refillPerMinute;
    const retryAfter = Math.ceil((1 - tokens) * secondsPerToken);
    buckets.set(id, { tokens, updatedAt: now });
    return { allowed: false, retryAfter, remaining: 0 };
  }

  buckets.set(id, { tokens: tokens - 1, updatedAt: now });

  writes += 1;
  if (writes >= SWEEP_EVERY) {
    writes = 0;
    sweep(now, limit.capacity);
  }

  return { allowed: true, retryAfter: 0, remaining: Math.floor(tokens - 1) };
}

/** Drop buckets that have refilled to full — they are indistinguishable from absent. */
function sweep(now: number, capacity: number): void {
  for (const [id, b] of buckets) {
    const elapsedMin = (now - b.updatedAt) / 60_000;
    if (b.tokens + elapsedMin >= capacity) buckets.delete(id);
  }
}

/** A 429 that tells the caller when to come back rather than just refusing. */
export function rateLimited(result: RateResult): Response {
  return Response.json(
    { error: `Too many requests. Try again in ${result.retryAfter} second${result.retryAfter === 1 ? '' : 's'}.` },
    { status: 429, headers: { 'Retry-After': String(result.retryAfter) } },
  );
}

/** Reset, for tests. */
export function resetRateLimits(): void {
  buckets.clear();
  writes = 0;
}
