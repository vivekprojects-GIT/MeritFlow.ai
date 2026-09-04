import { loadEnv } from './env';
loadEnv();
import { chromium } from 'playwright';
import { isApplicationPost } from '../src/lib/autopilot/adapters/browser';

/**
 * What POSTs a page fires on load, without touching its submit control.
 *
 * Deliberately never clicks: the question is which requests the old check would
 * have counted as an application, and load-time traffic answers it without
 * sending anything.
 */
async function main(): Promise<void> {
  const url = process.argv[2];
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const posts: { url: string; status: number }[] = [];
  page.on('response', (res) => {
    try { if (res.request().method() === 'POST') posts.push({ url: res.url(), status: res.status() }); } catch { /* gone */ }
  });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForTimeout(6000);
  await page.mouse.move(200, 300);
  await page.waitForTimeout(2000);

  process.stdout.write(`POSTs seen without clicking anything: ${posts.length}\n\n`);
  for (const r of posts) {
    const counts = isApplicationPost(url, r.url);
    process.stdout.write(`  ${String(r.status).padEnd(4)} ${counts ? 'COUNTS ' : 'ignored'} ${r.url.slice(0, 88)}\n`);
  }
  const old2xx = posts.filter((r) => r.status >= 200 && r.status < 300).length;
  process.stdout.write(`\nold check would have seen ${old2xx} accepted POST(s) -> ${old2xx > 0 ? 'EVIDENCE OF SUBMISSION' : 'no evidence'}\n`);
  process.stdout.write(`new check counts ${posts.filter((r) => isApplicationPost(url, r.url)).length}\n`);
  await browser.close();
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
