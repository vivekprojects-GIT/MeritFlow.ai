import { describe, expect, it } from 'vitest';
import { BOARDS } from './jobs-ingest-ats';

/**
 * The boards, against the live endpoints.
 *
 * The claim this feature rests on is narrow and checkable: these return the
 * employer's own application form, and that form needs no account. A unit test
 * with a recorded fixture cannot check either — it would pass just as happily
 * against a vendor that has since changed its API or started requiring a key.
 *
 * Network-dependent, so it degrades to a skip rather than a failure when
 * offline. What it must never do is pass while silently testing nothing, so
 * every assertion is on data that came back.
 */

async function reachable(): Promise<boolean> {
  try {
    const res = await fetch('https://boards-api.greenhouse.io/v1/boards/databricks/jobs', {
      headers: { accept: 'application/json' },
    });
    return res.ok;
  } catch {
    return false;
  }
}

const online = await reachable();

describe.runIf(online)('ATS boards', () => {
  it('Greenhouse returns real postings with an apply URL', async () => {
    const res = await fetch('https://boards-api.greenhouse.io/v1/boards/databricks/jobs?content=true', {
      headers: { accept: 'application/json' },
    });
    const body = (await res.json()) as { jobs?: { title?: string; absolute_url?: string }[] };

    expect(body.jobs?.length ?? 0).toBeGreaterThan(0);
    const first = body.jobs![0];
    expect(first.title).toBeTruthy();
    /* The employer's own form, not an aggregator redirect. */
    expect(first.absolute_url).toMatch(/greenhouse\.io|databricks/i);
  }, 60_000);

  it('every configured board answers', async () => {
    /* A dead token costs that employer silently in production, so the list is
       checked here instead — a 404 means the company left the vendor. */
    const dead: string[] = [];

    for (const board of BOARDS) {
      const url =
        board.vendor === 'greenhouse'
          ? `https://boards-api.greenhouse.io/v1/boards/${board.token}/jobs`
          : board.vendor === 'lever'
            ? `https://api.lever.co/v0/postings/${board.token}?mode=json`
            : `https://api.ashbyhq.com/posting-api/job-board/${board.token}`;

      try {
        const res = await fetch(url, { headers: { accept: 'application/json' } });
        if (!res.ok) dead.push(`${board.vendor}:${board.token} → ${res.status}`);
      } catch {
        dead.push(`${board.vendor}:${board.token} → unreachable`);
      }
    }

    expect(dead).toEqual([]);
  }, 180_000);
});
