process.env.SQLITE_PATH = './test-extlive.db';

import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * The content script, in a real browser, against a real form.
 *
 * `route.test.ts` covers what the server will and will not answer. This covers
 * the half only a browser can prove: that the extraction finds the fields, that
 * the values actually land in the inputs, and — the one that matters — that
 * nothing presses submit.
 *
 * The extension messaging APIs do not exist outside an extension context, so
 * the script's two `chrome.runtime` seams are stubbed: the resolve call is
 * answered by calling the real route handler, and the reply is captured. What
 * runs in the page is the shipped file, read from disk.
 */

let userId = '';
let token = '';
let close: (() => Promise<void>) | null = null;

/**
 * Probed at collection time, not in `beforeAll`.
 *
 * `describe.runIf` is evaluated while the file is being collected, so a flag
 * set in a hook is still false when it is read — the suite silently skips and
 * reports green. On the one file whose job is to prove the browser path works,
 * that is the worst possible outcome.
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

const FORM = `<!doctype html><meta charset="utf-8"><title>Apply</title>
<form>
  <label for="first_name">First name</label><input id="first_name" name="first_name" required>
  <label for="last_name">Last name</label><input id="last_name" name="last_name" required>
  <label for="email">Email</label><input id="email" name="email" type="email" required>
  <label for="phone">Phone</label><input id="phone" name="phone" required>
  <label for="work_auth">Are you legally authorized to work in the US?</label>
  <select id="work_auth" name="work_auth" required><option value="">Choose</option><option>Yes</option><option>No</option></select>
  <label for="k8s">Years of experience with Kubernetes</label><input id="k8s" name="k8s" required>
  <label for="resume">Resume</label><input id="resume" name="resume" type="file" required>
  <button type="submit" id="send">Submit application</button>
</form>`;

beforeAll(async () => {
  const { getDb } = await import('@/lib/db');
  const db = await getDb();
  userId = `extlive-${randomUUID()}`;

  await db.query(
    `INSERT INTO users (id,email,password_hash,role,university_id,account_kind,created_at,name,phone)
     VALUES ($1,$2,'x','student',NULL,'personal',$3,$4,$5)`,
    [userId, `${userId}@t.local`, Date.now(), 'Sai Vivek Katkuri', '+1 469 454 8320'],
  );

  const { ensureExtensionToken } = await import('@/lib/job-settings');
  token = await ensureExtensionToken(userId);

  const { saveAnswer } = await import('@/lib/autopilot/answer-vault');
  await saveAnswer(userId, {
    intent: 'WORK_AUTH.AUTHORIZED',
    value: 'Yes (United States)',
    provenance: 'USER_VERIFIED',
    verified: true,
    sensitivity: 'NORMAL_FACT',
  });
}, 120_000);

afterAll(async () => {
  await close?.();
});

describe.runIf(browserAvailable)('the content script on a live form', () => {
  it('fills what it can, marks what it cannot, and submits nothing', async () => {
    const { chromium } = await import('playwright');
    const { POST } = await import('./route');

    const browser = await chromium.launch({ headless: true });
    close = async () => {
      await browser.close().catch(() => {});
    };
    const page = await browser.newPage();
    await page.setContent(FORM);

    /* Would be set by a real submit. Nothing here should ever set it. */
    await page.evaluate(() => {
      (window as unknown as { submitted: boolean }).submitted = false;
      document.querySelector('form')!.addEventListener('submit', (e) => {
        e.preventDefault();
        (window as unknown as { submitted: boolean }).submitted = true;
      });
    });

    /* Stub the two extension seams, then load the shipped content script. */
    await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      w.__resolveRequest = null;
      w.__reply = null;
      w.chrome = {
        runtime: {
          onMessage: {
            addListener: (fn: unknown) => {
              w.__listener = fn;
            },
          },
          sendMessage: (msg: unknown, cb: (r: unknown) => void) => {
            w.__resolveRequest = msg;
            w.__resolveCallback = cb;
          },
        },
      };
    });

    await page.addScriptTag({ content: await readFile('extension/content.js', 'utf8') });

    /* Kick it off exactly as the popup does. */
    const request = await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      (w.__listener as (m: unknown, s: unknown, r: unknown) => void)({ type: 'MF_FILL' }, null, (res: unknown) => {
        w.__reply = res;
      });
      return w.__resolveRequest;
    });

    /* Answer it with the real route handler, as the service worker would. */
    const res = await POST(
      new Request('http://localhost/api/extension/fill', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify(request),
      }),
    );
    const answer = { ok: true, ...((await res.json()) as Record<string, unknown>) };

    const reply = await page.evaluate(async (payload) => {
      const w = window as unknown as Record<string, unknown>;
      (w.__resolveCallback as (r: unknown) => void)(payload);
      await new Promise((r) => setTimeout(r, 100));
      return w.__reply;
    }, answer);

    const values = await page.evaluate(() => ({
      first: (document.getElementById('first_name') as HTMLInputElement).value,
      last: (document.getElementById('last_name') as HTMLInputElement).value,
      phone: (document.getElementById('phone') as HTMLInputElement).value,
      auth: (document.getElementById('work_auth') as HTMLSelectElement).value,
      k8s: (document.getElementById('k8s') as HTMLInputElement).value,
      submitted: (window as unknown as { submitted: boolean }).submitted,
    }));

    /* Filled from the profile and the vault. */
    expect(values.first).toBe('Sai');
    expect(values.last).toBe('Vivek Katkuri');
    expect(values.phone).toContain('469');

    /* "Yes (United States)" matched against a form offering "Yes" — the
       mismatch that broke every dropdown on the server side. */
    expect(values.auth).toBe('Yes');

    /* Nobody has ever answered this, so it stays empty. */
    expect(values.k8s).toBe('');

    /* The property that makes this a tool rather than an agent. */
    expect(values.submitted).toBe(false);

    const summary = reply as { filled: string[]; blocked: { label: string }[] };
    expect(summary.filled.length).toBeGreaterThanOrEqual(4);
    expect(summary.blocked.map((b) => b.label).join(' ')).toMatch(/Kubernetes/);
    expect(summary.blocked.map((b) => b.label).join(' ')).toMatch(/Resume/i);
  }, 120_000);
});
