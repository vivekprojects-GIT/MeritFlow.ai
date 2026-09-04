import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { isLearner } from '../route';
import { getDb } from '@/lib/db';
import { listCompanies, registryStats, upsertCompany } from '@/lib/discovery/registry';
import { collectOnce } from '@/lib/discovery/collector';
import { detectFromUrl } from '@/lib/discovery/detect';
import { schedulerStatus } from '@/lib/autopilot/scheduler';
import { checkRate, rateLimited } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Discovery coverage: how much of the market this account can see.
 *
 * Separate from the application side on purpose. Coverage and applicability are
 * different questions — we can watch an employer whose platform we cannot yet
 * submit through, and saying so plainly is better than either pretending the
 * gap does not exist or refusing to watch them at all.
 */

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isLearner(user.role)) return NextResponse.json({ error: 'Not available for this account type.' }, { status: 403 });

  const db = await getDb();
  const day = Date.now() - 24 * 3600_000;

  const [stats, jobs, fresh] = await Promise.all([
    registryStats(),
    db.query<{ n: string }>("SELECT count(*)::text AS n FROM jobs WHERE status = 'open'"),
    db.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM jobs WHERE status = 'open' AND COALESCE(posted_at, detected_at) > $1",
      [day],
    ),
  ]);

  return NextResponse.json({
    registry: stats,
    companies: await listCompanies(200),
    jobs: { open: Number(jobs.rows[0]?.n ?? 0), postedLastDay: Number(fresh.rows[0]?.n ?? 0) },
    scheduler: schedulerStatus(),
  });
}

/**
 * Add an employer, or run a collection cycle now.
 *
 * Adding takes a careers URL and nothing else. Whether that URL names its
 * platform outright or hides it behind an embedded board is the registry's
 * problem, not the person's — which is the difference between coverage that
 * grows by data entry and coverage that grows by engineering.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isLearner(user.role)) return NextResponse.json({ error: 'Not available for this account type.' }, { status: 403 });

  const rate = checkRate(user.id, 'autopilot');
  if (!rate.allowed) return rateLimited(rate);

  let body: { action?: unknown; name?: unknown; careerUrl?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Expected JSON.' }, { status: 400 });
  }

  if (body.action === 'recheck') {
    /*
     * Give up on giving up.
     *
     * `unsupported` is excluded from the detection queue, which is right --
     * re-reading a careers page that has told us nothing twice a day is waste.
     * But companies change vendors, and the detector itself improves: the probe
     * fallback recovered boards that page-reading alone had already written
     * off. This clears the verdict so those get another look.
     */
    const db = await getDb();
    const res = await db.query(
      `UPDATE companies SET scan_status = 'pending', failure_count = 0, updated_at = $1
        WHERE scan_status = 'unsupported' AND ats_identifier = '' AND career_url <> ''`,
      [Date.now()],
    );
    return NextResponse.json({ recheck: res.affectedRows ?? 0, registry: await registryStats() });
  }

  if (body.action === 'collect') {
    const cycle = await collectOnce();
    return NextResponse.json({ cycle, registry: await registryStats() });
  }

  const careerUrl = String(body.careerUrl ?? '').trim();
  if (!careerUrl) return NextResponse.json({ error: 'A careers page URL is required.' }, { status: 400 });

  let host = '';
  try {
    const url = new URL(careerUrl);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('scheme');
    host = url.hostname.replace(/^www\./, '');
  } catch {
    return NextResponse.json({ error: 'That is not a URL.' }, { status: 400 });
  }

  /* Detected from the URL synchronously when it is decisive, so the answer is
     immediate. Anything that needs the page read is left to the collector,
     which does it on its own schedule rather than making someone wait. */
  const quick = detectFromUrl(careerUrl);

  const company = await upsertCompany({
    name: String(body.name ?? '').trim() || host,
    careerUrl,
    ats: quick.ats,
    identifier: quick.identifier,
  });

  return NextResponse.json({
    company,
    detected: quick.identifier
      ? `Recognised as ${quick.ats}. It will be collected on the next cycle.`
      : 'Added. Their careers page will be read shortly to work out which platform they use.',
  });
}
