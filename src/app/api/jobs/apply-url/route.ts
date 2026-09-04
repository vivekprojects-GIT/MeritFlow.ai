import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { isLearner } from '../route';
import { getDb } from '@/lib/db';
import { listJobs } from '@/lib/jobs-store';
import { detectAts } from '@/lib/autopilot/execution-policy';
import { runDryRun } from '@/lib/autopilot/workflow';
import { checkRate, rateLimited } from '@/lib/rate-limit';

export const runtime = 'nodejs';

/**
 * Apply to one posting, by URL.
 *
 * ## Why this exists
 *
 * Everything else in this engine starts from the discovered feed: matching,
 * scoring, the batch runner, autonomous mode. All of it is machinery for
 * deciding *which* jobs to apply to — and none of it is needed to prove the
 * thing that actually matters, which is that one real application reaches one
 * real employer and comes back with a confirmation.
 *
 * So this is the shortest path through the same engine. Paste a URL, and it
 * runs the identical workflow: detect the ATS, read the form, resolve every
 * answer from the vault, attach the résumé, validate, submit once, and read
 * the confirmation. No discovery, no scoring, no scheduling.
 *
 * ## What it does not skip
 *
 * Every gate. The execution policy still decides whether this path may submit,
 * the verifier still has to clear it, the vault still refuses to guess, and the
 * duplicate guard still applies. A shortcut into the engine is not a shortcut
 * around it — that would make this endpoint the one way to bypass every
 * protection the rest of the system is built from.
 */

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isLearner(user.role)) return NextResponse.json({ error: 'Not available for this account type.' }, { status: 403 });

  /* The autopilot bucket: this opens a browser and may send an application. */
  const rate = checkRate(user.id, 'autopilot');
  if (!rate.allowed) return rateLimited(rate);

  let raw = '';
  try {
    raw = String(((await req.json()) as { url?: unknown }).url ?? '').trim();
  } catch {
    return NextResponse.json({ error: 'Expected JSON.' }, { status: 400 });
  }

  let url: URL;
  try {
    url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('scheme');
  } catch {
    return NextResponse.json({ error: 'That is not a job URL.' }, { status: 400 });
  }

  const { ats } = detectAts(url.href);
  const db = await getDb();

  /*
   * Reuse the stored posting when the feed already has it.
   *
   * Matching on URL rather than inserting blindly: the run is keyed to a job
   * id, so a second row for the same posting would give the same application
   * two independent runs and defeat the duplicate guard — which is the one
   * protection that has already caught a real double submission.
   */
  const existing = (await listJobs(2000)).find((j) => j.url === url.href);

  let jobId = existing?.id ?? '';
  if (!existing) {
    jobId = randomUUID();
    const now = Date.now();
    /* Placeholder company and title: the adapter reads the real ones from the
       ATS a moment later, and inventing them here would put a guess on the
       receipt. The host is at least true. */
    const host = url.hostname.replace(/^www\./, '');
    await db.query(
      `INSERT INTO jobs (id,company,title,norm_title,location,remote,track,description,skills,min_comp,url,source,posted_at,detected_at,last_seen_at,status)
       VALUES ($1,$2,$3,$4,'',FALSE,'experienced','','[]',NULL,$5,'manual',$6,$6,$6,'open')`,
      [jobId, host, `Pasted posting ${url.pathname.split('/').filter(Boolean).pop()?.slice(0, 18) ?? jobId.slice(0, 8)}`, `pasted ${jobId}`, url.href, now],
    );
  }

  const job = (await listJobs(2000)).find((j) => j.id === jobId);
  if (!job) return NextResponse.json({ error: 'Could not record that posting.' }, { status: 500 });

  /* Pasted deliberately: apply the safety gates, not the discovery filters. */
  const outcome = await runDryRun(user.id, job, { chosenByCandidate: true });

  return NextResponse.json({
    ats,
    state: outcome.finalState,
    reason: outcome.reason,
    awaitingApproval: outcome.awaitingApproval ?? false,
    /* The proof, when there is any. A click is not a submission. */
    confirmation: outcome.receipt?.confirmation ?? null,
    company: outcome.receipt?.company ?? job.company,
    role: outcome.receipt?.role ?? job.title,
    filled: outcome.receipt?.fields.map((f) => f.field) ?? [],
    unresolved: outcome.receipt?.unresolved ?? [],
  });
}
