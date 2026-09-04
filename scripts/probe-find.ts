import { loadEnv } from './env';
loadEnv();
import { chromium } from 'playwright';
import { submitRank } from '../src/lib/autopilot/adapters/browser';

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(process.argv[2], { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForTimeout(4000);

  const candidates = page.locator('button, input[type="submit"], [role="button"]');
  const total = await candidates.count().catch(() => 0);
  process.stdout.write(`candidates in body: ${total}\n`);

  let scored = 0;
  for (let i = 0; i < Math.min(total, 80); i += 1) {
    const c = candidates.nth(i);
    const vis = await c.isVisible().catch(() => false);
    const dis = await c.isDisabled().catch(() => false);
    const label = (
      (await c.innerText().catch(() => '')) ||
      (await c.getAttribute('value').catch(() => '')) ||
      (await c.getAttribute('aria-label').catch(() => '')) ||
      ''
    ).replace(/\s+/g, ' ').trim();
    const rank = submitRank(label);
    if (rank > 0 || /submit/i.test(label)) {
      scored += 1;
      process.stdout.write(`  [${i}] rank=${rank} vis=${vis} dis=${dis} "${label.slice(0, 50)}"\n`);
    }
  }
  process.stdout.write(`ranked>0 or submit-ish: ${scored}\n`);
  await browser.close();
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
