import { createServer, type Server } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FieldResolver } from './types';

/**
 * The navigator against a real browser and a real multi-page form.
 *
 * `plan.test.ts` and `run.test.ts` cover the decisions; this covers the half
 * that only a browser can prove — that the page-side extractor runs at all,
 * that its selectors find the controls, that filling and uploading and clicking
 * do what they claim. That code is a string of JavaScript handed to Chromium,
 * so nothing in TypeScript's type system has an opinion about whether it works.
 *
 * The wizard below is deliberately awkward in the ways real ones are: the form
 * on step two lives outside any `<form>` element, which is what defeated the
 * previous single-page reader on every React-rendered careers site.
 */

const PAGES: Record<string, string> = {
  '/': `<!doctype html><title>Senior Data Engineer</title>
    <header><nav><input type="search" name="q" placeholder="Search jobs"></nav></header>
    <h1>Senior Data Engineer</h1>
    <p>We are hiring.</p>
    <a role="button" href="/apply">Apply for this job</a>`,

  '/apply': `<!doctype html><title>Apply — step 1</title>
    <h1>Your details</h1><p>Step 1 of 3</p>
    <form method="POST" action="/step2">
      <label for="full_name">Full name</label><input id="full_name" name="full_name" required>
      <label for="email">Email</label><input id="email" name="email" type="email" required>
      <label for="why">Why do you want to work here?</label><textarea id="why" name="why"></textarea>
      <button type="button">Back</button>
      <button type="submit">Next</button>
    </form>`,

  /* No <form> element anywhere: the shape a React application renders, and the
     one the old `form input` selector could not see. */
  '/step2': `<!doctype html><title>Apply — step 2</title>
    <h1>Documents</h1><p>Step 2 of 3</p>
    <div>
      <label for="cv">Résumé</label><input id="cv" name="cv" type="file" required>
      <label for="notice">Notice period</label>
      <select id="notice" name="notice" required>
        <option value="">Please choose</option>
        <option>Immediately</option>
        <option>2 weeks</option>
      </select>
      <button onclick="location.href='/step3'">Next</button>
    </div>`,

  '/step3': `<!doctype html><title>Apply — step 3</title>
    <h1>Final questions</h1><p>Step 3 of 3</p>
    <form method="POST" action="/done">
      <label for="auth">Are you legally authorized to work in the US?</label>
      <select id="auth" name="auth" required><option value="">Choose</option><option>Yes</option><option>No</option></select>
      <button type="submit">Submit application</button>
    </form>`,

  '/done': `<!doctype html><title>Done</title>
    <h1>Thank you for applying</h1>
    <p>Your application has been received. Confirmation number: MF-88123</p>`,
};

let server: Server;
let origin = '';
let resumePath = '';
let workdir = '';

/**
 * Probed at collection time, not inside the tests.
 *
 * An early `return` from a test body when no browser is present reports as a
 * pass, which is the worst possible outcome for the one file whose whole job is
 * to prove the browser path works — it would go green in CI while covering
 * nothing. `describe.runIf` reports a skip as a skip.
 */
const browserAvailable = await (async () => {
  try {
    const { chromium } = await import('playwright');
    const probe = await chromium.launch({ headless: true });
    await probe.close();
    return true;
  } catch {
    return false;
  }
})();

beforeAll(async () => {
  server = createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0];
    if (req.method === 'POST') {
      /* Consume the body, then move the applicant on — a real form post. */
      req.resume();
      req.on('end', () => {
        res.writeHead(303, { Location: path });
        res.end();
      });
      return;
    }
    const body = PAGES[path];
    res.writeHead(body ? 200 : 404, { 'content-type': 'text/html' });
    res.end(body ?? 'not found');
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  origin = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;

  workdir = await mkdtemp(join(tmpdir(), 'mf-nav-'));
  resumePath = join(workdir, 'resume.txt');
  await writeFile(resumePath, 'Sai Vivek Katkuri — Data Engineer');

}, 60_000);

afterAll(async () => {
  const { closeBrowser } = await import('../adapters/browser');
  await closeBrowser();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(workdir, { recursive: true, force: true });
});

/** Stands in for the vault. Answers what a candidate would have stored. */
const answers: Record<string, string> = {
  full_name: 'Sai Vivek Katkuri',
  email: 'sai@example.com',
  notice: '2 weeks',
  auth: 'Yes',
};

const resolver: FieldResolver = async (fields) => ({
  answers: fields.filter((f) => answers[f.id] !== undefined).map((f) => ({ field: f.id, value: answers[f.id] })),
  blocked: fields
    .filter((f) => answers[f.id] === undefined && f.kind !== 'file')
    .map((f) => ({ field: f.id, reason: 'No verified answer for this question yet.' })),
});

async function run(mode: 'survey' | 'apply', allowSubmit: boolean) {
  const [{ openSession }, { navigate }, { PlaywrightDriver }] = await Promise.all([
    import('../adapters/browser'),
    import('./run'),
    import('./playwright-driver'),
  ]);

  const session = await openSession();
  try {
    await session.page.goto(origin, { waitUntil: 'domcontentloaded' });
    const driver = new PlaywrightDriver(session.page, resolver, mode === 'apply' ? resumePath : null);
    return await navigate(driver, { mode, allowSubmit, hasResume: mode === 'apply', budgetMs: 120_000 });
  } finally {
    await session.close();
  }
}

describe.runIf(browserAvailable)('navigator against a live multi-page form', () => {
  it('surveys: follows the apply link and reads step one without typing', async () => {
    const result = await run('survey', false);

    expect(result.outcome).toBe('prepared');
    expect(result.questionsSeen.map((q) => q.id).sort()).toEqual(['email', 'full_name', 'why']);
    /* The header search box is page furniture, not an application question. */
    expect(result.questionsSeen.map((q) => q.id)).not.toContain('q');
    /* Labels come out readable, which is what the candidate is shown. */
    expect(result.questionsSeen.find((q) => q.id === 'email')?.label).toBe('Email');
    expect(result.questionsSeen.find((q) => q.id === 'full_name')?.required).toBe(true);
    expect(result.filled).toEqual([]);
  }, 120_000);

  it('applies: walks all three steps, attaches the CV, and reads the confirmation', async () => {
    const result = await run('apply', true);

    expect(result.outcome).toBe('submitted');
    expect(result).toMatchObject({ reference: 'MF-88123' });

    /* Step two has no <form> element at all — the case the previous reader
       could not see, and the reason enterprise applications never worked. */
    expect(result.questionsSeen.map((q) => q.id)).toContain('cv');
    expect(result.questionsSeen.map((q) => q.id)).toContain('auth');

    expect(result.filled).toContain('full_name');
    expect(result.filled).toContain('cv');
    expect(result.filled).toContain('auth');
    expect(result.pagesVisited).toBe(4);

    /* "Why do you want to work here?" had no stored answer and is optional, so
       it was left rather than invented. */
    expect(result.filled).not.toContain('why');
  }, 120_000);
});
