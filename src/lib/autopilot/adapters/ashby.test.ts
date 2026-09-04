import { describe, expect, it } from 'vitest';
import { applyUrlFor, ashbyAdapter, classifyField, fetchPosting, parseAshbyUrl } from './ashby';

/**
 * The Ashby adapter.
 *
 * Every case here came from reading a live Ashby application. The theme is that
 * Ashby is the inverse of Lever: names are opaque UUIDs and labels carry all the
 * meaning, where Lever's names are structural and its labels are arbitrary.
 */

const REF = { token: 'ramp', postingId: '34413f8d-26bf-4bbc-8ade-eb309a0e2245' };

describe('parseAshbyUrl', () => {
  it('reads the posting and application URLs', () => {
    for (const url of [
      `https://jobs.ashbyhq.com/${REF.token}/${REF.postingId}`,
      `https://jobs.ashbyhq.com/${REF.token}/${REF.postingId}/application`,
      `https://jobs.ashbyhq.com/${REF.token}/${REF.postingId}/application?utm_source=x`,
    ]) {
      expect(parseAshbyUrl(url)).toEqual(REF);
    }
  });

  it('declines a board listing and anything that is not Ashby', () => {
    expect(parseAshbyUrl('https://jobs.ashbyhq.com/ramp')).toBeNull();
    expect(parseAshbyUrl('https://jobs.lever.co/spotify/34413f8d-26bf-4bbc-8ade-eb309a0e2245')).toBeNull();
    expect(parseAshbyUrl('https://ashbyhq.com.evil.net/a/b')).toBeNull();
  });

  it('builds the application URL, which is /application and not /apply', () => {
    /* Lever uses /apply. Getting this wrong is a 404 on every posting. */
    expect(applyUrlFor(REF)).toBe(`https://jobs.ashbyhq.com/${REF.token}/${REF.postingId}/application`);
  });
});

describe('classifyField — names carry no meaning here', () => {
  it('reads a UUID-named field entirely from its label', () => {
    /* The whole reason this adapter exists. A matcher keyed on the field name
       sees "4b71793a-c95c-..." and matches nothing; the label says "Phone". */
    expect(classifyField('4b71793a-c95c-4cc9-9d06-02e6ef7c5777', 'Phone')).toBe('custom');
    expect(classifyField('dc915b3a-c535-49df-abd6-dc8f3ddf6728', 'LinkedIn Profile')).toBe('custom');
  });

  it('recognises Ashby’s own built-ins', () => {
    expect(classifyField('_systemfield_name', 'Legal Name')).toBe('identity');
    expect(classifyField('_systemfield_email', 'Email')).toBe('identity');
    expect(classifyField('_systemfield_resume', 'Resume')).toBe('resume');
  });

  it('finds a résumé field that has no name attribute at all', () => {
    /* Ashby's file inputs carry an id and no name. A reader keyed on name
       misses the CV field, then reports the application complete without one. */
    expect(classifyField('6686ff1d-a7f9-484b-af56-4c32ff8cd99f', 'Resume')).toBe('resume');
    expect(classifyField('', 'Resume')).toBe('resume');
  });

  it('does not mistake a question about a résumé for the résumé field', () => {
    expect(classifyField('0086e069-bc0c-467b-8d38-c3f023146e79', 'Where did you send your resume from?')).toBe('custom');
  });

  it('knows the CAPTCHA input is not a question', () => {
    /* It is a plain text input. A generic reader offers it to the candidate
       as something to answer. */
    expect(classifyField('g-recaptcha-response', '')).toBe('plumbing');
    expect(classifyField('h-captcha-response', '')).toBe('plumbing');
  });

  it('keeps consent separate', () => {
    expect(classifyField('communicationConsent', 'Yes - I consent to receiving text messages')).toBe('consent');
  });
});

describe('detect', () => {
  it('claims Ashby postings and leaves the other boards alone', () => {
    expect(ashbyAdapter.detect(`https://jobs.ashbyhq.com/${REF.token}/${REF.postingId}`)).toBe(true);
    expect(ashbyAdapter.detect('https://job-boards.greenhouse.io/adapter/jobs/4415084008')).toBe(false);
    expect(ashbyAdapter.detect('https://jobs.lever.co/spotify/890b2c0f-f46f-4a4b-bb73-3a6af6e0edd5')).toBe(false);
  });
});

/* ── Against the live API ────────────────────────────────────────────────── */

const online = await fetch('https://api.ashbyhq.com/posting-api/job-board/ramp', {
  headers: { accept: 'application/json' },
})
  .then((r) => r.ok)
  .catch(() => false);

describe.runIf(online)('fetchPosting', () => {
  it('reads a real posting from the public board API', async () => {
    const board = (await (
      await fetch('https://api.ashbyhq.com/posting-api/job-board/ramp')
    ).json()) as { jobs: { jobUrl: string }[] };

    const ref = parseAshbyUrl(board.jobs[0].jobUrl);
    expect(ref).not.toBeNull();

    const posting = await fetchPosting(ref!);
    expect(posting.open).toBe(true);
    expect(posting.title).toBeTruthy();
    expect(posting.applyUrl).toContain('/application');
    expect(posting.company).toBe('Ramp');
  }, 60_000);

  it('reports a posting that is not on the board as closed', async () => {
    const posting = await fetchPosting({ token: 'ramp', postingId: '00000000-0000-4000-8000-000000000000' });
    expect(posting.open).toBe(false);
  }, 60_000);

  it('does not throw on a board that does not exist', async () => {
    const posting = await fetchPosting({ token: 'no-such-board-xyzzy', postingId: REF.postingId });
    expect(posting.open).toBe(false);
  }, 60_000);
});
