import { loadEnv } from './env';
loadEnv();
import { chromium } from 'playwright';
const SELECTORS = ['iframe[src*="recaptcha"]','iframe[src*="hcaptcha"]','iframe[title*="challenge" i]','[class*="cf-turnstile"]','#px-captcha','[data-testid*="captcha" i]'];
async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(process.argv[2], { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForTimeout(5000);
  for (const sel of SELECTORS) {
    const loc = page.locator(sel).first();
    const n = await loc.count().catch(() => 0);
    if (n === 0) continue;
    const vis = await loc.isVisible().catch(() => false);
    const box = vis ? await loc.boundingBox().catch(() => null) : null;
    process.stdout.write(`${sel}\n  count=${n} visible=${vis} box=${box ? `${Math.round(box.width)}x${Math.round(box.height)}` : 'none'}\n`);
  }
  const pw = await page.locator('input[type="password"]').count().catch(() => 0);
  process.stdout.write(`password inputs: ${pw}\n`);
  await browser.close();
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
