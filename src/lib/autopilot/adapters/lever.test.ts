import { describe, expect, it } from 'vitest';
import { applyUrlFor, classifyField, fetchPosting, leverAdapter, parseLeverUrl } from './lever';

/**
 * The Lever adapter.
 *
 * Every classification below came from reading a live application rather than
 * from documentation, so the cases are the ones a generic DOM read actually
 * gets wrong — not a tour of the happy path.
 */

const REF = { token: 'spotify', postingId: '890b2c0f-f46f-4a4b-bb73-3a6af6e0edd5' };

describe('parseLeverUrl', () => {
  it('reads a posting URL, an apply URL, and the noise around them', () => {
    /* A feed hands over all three shapes for the same job. */
    for (const url of [
      `https://jobs.lever.co/${REF.token}/${REF.postingId}`,
      `https://jobs.lever.co/${REF.token}/${REF.postingId}/apply`,
      `https://jobs.lever.co/${REF.token}/${REF.postingId}/apply?lever-source=LinkedIn`,
      `https://jobs.lever.co/${REF.token}/${REF.postingId}/`,
    ]) {
      expect(parseLeverUrl(url)).toEqual(REF);
    }
  });

  it('refuses a board listing, which is a page of jobs rather than a job', () => {
    expect(parseLeverUrl('https://jobs.lever.co/spotify')).toBeNull();
    expect(parseLeverUrl('https://jobs.lever.co/spotify/engineering')).toBeNull();
  });

  it('refuses anything that is not Lever', () => {
    expect(parseLeverUrl('https://boards.greenhouse.io/acme/jobs/1')).toBeNull();
    expect(parseLeverUrl('https://lever.co.evil.com/a/b')).toBeNull();
    expect(parseLeverUrl('not a url')).toBeNull();
  });

  it('builds the page that actually accepts an application', () => {
    expect(applyUrlFor(REF)).toBe(`https://jobs.lever.co/${REF.token}/${REF.postingId}/apply`);
  });
});

describe('classifyField', () => {
  it('recognises the identity fields Lever asks for', () => {
    /* One `name`, not first and last — the thing every other ATS does
       differently. */
    for (const f of ['name', 'email', 'phone', 'org', 'location']) {
      expect(classifyField(f)).toBe('identity');
    }
  });

  it('recognises the bracket URL syntax', () => {
    expect(classifyField('urls[LinkedIn]')).toBe('url');
    expect(classifyField('urls[GitHub]')).toBe('url');
    expect(classifyField('urls[Portfolio]')).toBe('url');
  });

  it('treats the employer’s own questions as questions', () => {
    expect(classifyField('cards[92a51f92-d683-4f7b-be57-e25376f60abe][field0]')).toBe('custom');
  });

  it('separates EEO surveys from screening questions', () => {
    /* They are indistinguishable in the DOM and mean completely different
       things. Answering a diversity survey from an inference is answering a
       demographic question on someone's behalf. */
    expect(classifyField('surveysResponses[380b7dba-8003-486d-b65d-28bf53a52415][responses][field0]')).toBe('demographic');
  });

  it('knows which fields are machinery', () => {
    /* A generic reader sees these as unanswered questions and reports the
       candidate as having failed to fill in `accountId`. */
    for (const f of [
      'accountId',
      'origin',
      'referer',
      'source',
      'socialSource',
      'timezone',
      'linkedInData',
      'resumeStorageId',
      'selectedLocation',
      'h-captcha-response',
      'surveysResponses[380b7dba-8003-486d-b65d-28bf53a52415][surveyId]',
      'cards[92a51f92-d683-4f7b-be57-e25376f60abe][baseTemplate]',
    ]) {
      expect(classifyField(f)).toBe('plumbing');
    }
  });

  it('keeps consent separate from both', () => {
    /* Marketing opt-in is a choice the candidate makes, not a fact about them. */
    expect(classifyField('consent[marketing]')).toBe('consent');
  });

  it('sends the résumé to its own bucket', () => {
    expect(classifyField('resume')).toBe('resume');
  });
});

describe('detect', () => {
  it('claims Lever postings and nothing else', () => {
    expect(leverAdapter.detect(`https://jobs.lever.co/${REF.token}/${REF.postingId}`)).toBe(true);
    expect(leverAdapter.detect('https://boards.greenhouse.io/acme/jobs/1')).toBe(false);
    expect(leverAdapter.detect('https://www.linkedin.com/jobs/view/123')).toBe(false);
  });
});

/* ── Against the live API ────────────────────────────────────────────────── */

const online = await fetch('https://api.lever.co/v0/postings/spotify?mode=json', {
  headers: { accept: 'application/json' },
})
  .then((r) => r.ok)
  .catch(() => false);

describe.runIf(online)('fetchPosting', () => {
  it('reads a real posting from the public API', async () => {
    const board = (await (await fetch('https://api.lever.co/v0/postings/spotify?mode=json')).json()) as {
      hostedUrl: string;
    }[];
    const ref = parseLeverUrl(board[0].hostedUrl);
    expect(ref).not.toBeNull();

    const posting = await fetchPosting(ref!);
    expect(posting.open).toBe(true);
    expect(posting.title).toBeTruthy();
    expect(posting.applyUrl).toContain('/apply');
    expect(posting.company).toBe('Spotify');
    expect(posting.description.length).toBeGreaterThan(100);
  }, 60_000);

  it('reports a closed posting as closed rather than as a failure', async () => {
    /* A posting discovered an hour ago is routinely gone by the time an
       application starts, and Lever answers with a 404 *page* — so a
       browser-only adapter reads "no application form was found" and reports a
       bug where there is a closed job. */
    const posting = await fetchPosting({ token: 'spotify', postingId: '00000000-0000-4000-8000-000000000000' });
    expect(posting.open).toBe(false);
  }, 60_000);

  it('does not throw on a board that does not exist', async () => {
    const posting = await fetchPosting({ token: 'no-such-board-xyzzy', postingId: REF.postingId });
    expect(posting.open).toBe(false);
  }, 60_000);
});
