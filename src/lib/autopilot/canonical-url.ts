import { getDb } from '../db';

/**
 * The URL that actually has an application form on it.
 *
 * ## The problem this solves
 *
 * Large employers host their careers page themselves and embed the vendor's
 * board inside it, so a posting arrives as `instacart.careers/job/?gh_jid=8080310`
 * — a page whose HTML contains no form, because the form is rendered later by
 * the embedded board. The engine reads it, finds nothing, and reports "no
 * application form was found on this page" for a job it could apply to.
 *
 * Worse, the Greenhouse URL parser reads the first path segment as the board
 * token, so that URL resolved to a board called `job`, which does not exist.
 *
 * ## Why the registry can answer this
 *
 * We already know Instacart's Greenhouse token — discovery found it and stored
 * it. `gh_jid` is the posting id on that board. Those two facts compose into
 * `job-boards.greenhouse.io/instacart/jobs/8080310`, which is the employer's
 * own application form.
 *
 * ## Why it never guesses
 *
 * The token comes from the registry or nothing happens. A token invented from
 * the domain would eventually resolve to a real board belonging to a different
 * company, and the application would go to the wrong employer — which is worse
 * than not applying.
 */

const VENDOR_HOSTS = /greenhouse\.io$|lever\.co$|ashbyhq\.com$/i;

export async function canonicalUrl(job: { url: string; company: string }): Promise<string> {
  let url: URL;
  try {
    url = new URL(job.url);
  } catch {
    return job.url;
  }

  /*
   * Ashby's application form lives at /application; the base URL is an
   * overview with zero inputs. The navigator can sometimes find the tab, but
   * whether it does depends on how the page renders -- one posting worked and
   * another reported "no application form was found" on the same board. The
   * sub-path is Ashby's own convention, so composing it is a fact, not a
   * guess.
   */
  if (/\.ashbyhq\.com$/i.test(url.hostname)) {
    const path = url.pathname.replace(/\/+$/, '');
    if (!/\/application$/i.test(path) && /^\/[^/]+\/[0-9a-f-]{20,}$/i.test(path)) {
      return `${url.origin}${path}/application`;
    }
    return job.url;
  }

  /* Already on the vendor's own host: nothing to resolve. */
  if (VENDOR_HOSTS.test(url.hostname)) return job.url;

  const jid = url.searchParams.get('gh_jid');
  if (!jid || !/^\d+$/.test(jid)) return job.url;

  const db = await getDb();
  const res = await db.query<{ ats_identifier: string }>(
    `SELECT ats_identifier FROM companies
      WHERE ats_type = 'greenhouse' AND ats_identifier <> '' AND lower(name) = lower($1)
      LIMIT 1`,
    [job.company],
  );

  const token = res.rows[0]?.ats_identifier;
  if (!token) return job.url;

  return `https://job-boards.greenhouse.io/${token}/jobs/${jid}`;
}
