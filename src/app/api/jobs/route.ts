import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { funnelOf, listApplications, topMatches, getCandidateProfile } from '@/lib/jobs-store';
import { ingestAll, closeStaleJobs, purgeSeedJobs } from '@/lib/jobs-ingest';
import { ingestAllBoards } from '@/lib/jobs-ingest-ats';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';

/**
 * JobPilot is for learners only.
 *
 * A professor or a university admin has no business being shown a student's job
 * search, and staff have no use for one of their own here. The check lives in
 * one exported helper so every job route gates identically — a per-route
 * re-implementation is how one endpoint ends up missing the check.
 */
export function isLearner(role: string): boolean {
  return role === 'student';
}

/** Poll the boards at most once an hour. Cheap to call on every request. */
const REFRESH_AFTER = 60 * 60 * 1000;
let forceOnce = true;

/**
 * The board pull, running behind the response rather than in front of it.
 *
 * ## What was wrong
 *
 * This used to be awaited. `forceOnce` guarantees one full ingest per process,
 * so the first visit to the Jobs tab after any restart pulled every ATS board
 * before rendering anything: a measured 34 seconds of blank screen, repeated
 * after every dev reload. Nothing about that is a slow query to be tuned - the
 * page was waiting on a few dozen third-party HTTP calls that it did not need
 * in order to draw itself.
 *
 * The corpus is durable. Whatever was pulled last time is already in the
 * database and renders instantly; the refresh exists to make the *next* view
 * better. So it now runs detached, and the request returns the stored feed.
 *
 * ## The one case that still waits
 *
 * An empty corpus. A brand-new account with no jobs at all would otherwise see
 * "no matches" and reasonably conclude the product is broken. That case waits,
 * but on a timer rather than on completion - a slow board must delay the first
 * screen, not own it.
 */
let inFlight: Promise<void> | null = null;

/** How long a first-ever visit will wait for something to show. */
const COLD_START_WAIT = 8_000;

function startRefresh(): Promise<void> {
  /* One ingest at a time per process. Two concurrent visitors previously
     started two full board pulls that wrote the same rows. */
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      /*
       * ATS boards first, and they matter more than the search feed.
       *
       * Google Jobs returns what the web offers, which is mostly aggregators: a
       * real feed came back 47 LinkedIn and zero Greenhouse, and Autopilot then
       * stopped on those with "needs an account first" and "no application form
       * was found". These endpoints return the employer's own form, which needs
       * no account -- the same pull took the corpus from 124 postings to 790,
       * 375 of them directly applicable.
       */
      await ingestAllBoards();
      await ingestAll();
      await closeStaleJobs(10);
    } catch {
      /* A board being down must not take the page down. Whatever is already
         stored still renders. */
    }
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
}

async function refreshIfStale(): Promise<void> {
  /* Outside the freshness guard on purpose. The guard short-circuits once the
     live corpus is recent, so a purge placed inside it never ran and the
     careers-page rows survived every refresh. This is a cheap DELETE that
     matches nothing after the first call. */
  try {
    await purgeSeedJobs();
  } catch {
    /* non-fatal */
  }

  const db = await getDb();
  const res = await db.query<{ latest: string | null }>(
    "SELECT MAX(last_seen_at) AS latest FROM jobs WHERE source = 'google_jobs'",
  );
  const latest = Number(res.rows[0]?.latest ?? 0);
  /* One forced refresh per process so a link-ranking change reaches existing
     rows without waiting out the hour. */
  if (!forceOnce && latest && Date.now() - latest < REFRESH_AFTER) return;
  forceOnce = false;

  const refresh = startRefresh();

  const stored = await db.query<{ n: string }>("SELECT COUNT(*) AS n FROM jobs WHERE status = 'open'");
  if (Number(stored.rows[0]?.n ?? 0) > 0) {
    /* There is something to show. Draw it now; the pull lands in the next view.
       Detached, and its failure is already swallowed inside `startRefresh`. */
    void refresh;
    return;
  }

  /* Nothing stored at all. Wait, but not indefinitely. */
  await Promise.race([refresh, new Promise((r) => setTimeout(r, COLD_START_WAIT))]);
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isLearner(user.role)) return NextResponse.json({ error: 'Not available for this account type.' }, { status: 403 });

  /* Pull live postings if the board data is stale. Every job stored this way
     carries the employer's real requisition URL, which is the whole point:
     the seeded registry linked to careers *pages*, so Apply dropped people on
     a job board and made them search for the posting again. */
  await refreshIfStale();

  const profile = await getCandidateProfile(user.id);
  const [matches, applications] = await Promise.all([topMatches(user.id, 12), listApplications(user.id)]);

  return NextResponse.json({
    /* Finished setup, or arrived with enough of a profile to skip it. The
       first clause is the one that matters: the wizard asks for neither target
       roles nor a resume, so inferring completion from those two fields meant
       completing the wizard never counted as completing the wizard. */
    hasProfile: Boolean(profile && (profile.onboardedAt > 0 || profile.targetRoles.length > 0 || profile.resumeText)),
    profile,
    matches,
    applications,
    funnel: funnelOf(applications),
  });
}
