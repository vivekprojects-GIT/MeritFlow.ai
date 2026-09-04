import { describe, expect, it } from 'vitest';
import { detect, detectFromPage, detectFromUrl } from './detect';

/**
 * Platform detection.
 *
 * The failure that matters is not "we did not recognise this company" — that
 * costs one employer's postings. It is recovering the *wrong* tenant handle,
 * which silently collects a different company's jobs and files them under this
 * one's name. So the tests are weighted toward what must never be claimed.
 */

describe('detectFromUrl', () => {
  it('recovers the tenant from each vendor board', () => {
    expect(detectFromUrl('https://boards.greenhouse.io/stripe')).toMatchObject({
      ats: 'greenhouse',
      identifier: 'stripe',
    });
    expect(detectFromUrl('https://job-boards.greenhouse.io/gitlab/jobs/8695515002')).toMatchObject({
      ats: 'greenhouse',
      identifier: 'gitlab',
    });
    expect(detectFromUrl('https://jobs.lever.co/plaid/abc-123')).toMatchObject({ ats: 'lever', identifier: 'plaid' });
    expect(detectFromUrl('https://jobs.ashbyhq.com/ramp/uuid')).toMatchObject({ ats: 'ashby', identifier: 'ramp' });
  });

  it('takes a Workday tenant from the host, where it lives', () => {
    expect(detectFromUrl('https://acme.wd1.myworkdayjobs.com/en-US/careers/job/123')).toMatchObject({
      ats: 'workday',
      identifier: 'acme',
    });
  });

  it('normalises the careers- prefix so one employer is one row', () => {
    /* `careers-acme.icims.com` and `acme.icims.com` are the same tenant, and
       two rows for one employer means two collections and duplicate jobs. */
    expect(detectFromUrl('https://careers-acme.icims.com/jobs/1/x').identifier).toBe('acme');
  });

  it('records a platform it cannot collect from rather than pretending otherwise', () => {
    const workday = detectFromUrl('https://acme.wd5.myworkdayjobs.com/careers');
    expect(workday.ats).toBe('workday');
    expect(workday.collectable).toBe(false);
  });

  it('never reads a vendor path segment as a tenant', () => {
    /* `greenhouse.io/jobs` is a vendor page, not a company called "jobs".
       Collecting under that token would file real postings against a company
       that does not exist. */
    expect(detectFromUrl('https://boards.greenhouse.io/jobs').identifier).toBe('');
    expect(detectFromUrl('https://boards.greenhouse.io/embed').identifier).toBe('');
  });

  it('claims nothing about a URL it does not recognise', () => {
    expect(detectFromUrl('https://acme.com/careers')).toMatchObject({ ats: 'unknown', identifier: '' });
    expect(detectFromUrl('not a url')).toMatchObject({ ats: 'unknown', identifier: '' });
  });
});

/** A page fetch that returns fixed markup, so no test touches the network. */
const page = (html: string, ok = true) =>
  (async () => ({ ok, text: async () => html })) as unknown as typeof fetch;

describe('detectFromPage', () => {
  it('finds the board a careers page embeds', async () => {
    /*
     * The case this module exists for. Large employers host their careers page
     * themselves and embed the vendor's board, so the token appears nowhere in
     * the URL — around 1,489 postings were unapplicable for exactly this
     * reason, from companies whose board we could have read all along.
     */
    const html = '<script src="https://boards.greenhouse.io/embed/job_board/js?for=stripe"></script>';
    await expect(detectFromPage('https://stripe.com/jobs', page(html))).resolves.toMatchObject({
      ats: 'greenhouse',
      identifier: 'stripe',
      evidence: 'page',
    });
  });

  it('reads the Greenhouse settings block some pages use instead', async () => {
    const html = `<script>Grnhse.Settings = { for: 'databricks' };</script>`;
    await expect(detectFromPage('https://databricks.com/careers', page(html))).resolves.toMatchObject({
      identifier: 'databricks',
    });
  });

  it('finds Lever and Ashby the same way', async () => {
    await expect(
      detectFromPage('https://x.com/careers', page('<iframe src="https://jobs.lever.co/netlify"></iframe>')),
    ).resolves.toMatchObject({ ats: 'lever', identifier: 'netlify' });

    await expect(
      detectFromPage('https://y.com/careers', page('fetch("https://api.ashbyhq.com/posting-api/job-board/linear")')),
    ).resolves.toMatchObject({ ats: 'ashby', identifier: 'linear' });
  });

  it('calls a page with no vendor marker custom, which is an answer', async () => {
    /* Distinct from "we could not read it": one means stop re-detecting, the
       other means try again later. */
    await expect(detectFromPage('https://acme.com/careers', page('<h1>Join us</h1>'))).resolves.toMatchObject({
      ats: 'custom',
      identifier: '',
    });
  });

  it('claims nothing when the page could not be read', async () => {
    await expect(detectFromPage('https://acme.com/careers', page('', false))).resolves.toMatchObject({
      ats: 'unknown',
      evidence: 'none',
    });
  });
});

describe('detect', () => {
  it('prefers the URL and never spends a request it does not need', async () => {
    let called = 0;
    const counting = (async () => {
      called += 1;
      return { ok: true, text: async () => '' };
    }) as unknown as typeof fetch;

    const result = await detect('https://boards.greenhouse.io/reddit', counting);
    expect(result.identifier).toBe('reddit');
    expect(called).toBe(0);
  });

  it('falls through to the page when the URL knows the vendor but not the tenant', async () => {
    /* A vendor without a tenant is a company nothing can ever collect from,
       which is the exact failure this module was written to prevent. */
    const html = '<a href="https://job-boards.greenhouse.io/acme/jobs/1">Openings</a>';
    const result = await detect('https://boards.greenhouse.io/embed', page(html));
    expect(result).toMatchObject({ ats: 'greenhouse', identifier: 'acme', evidence: 'page' });
  });
});
