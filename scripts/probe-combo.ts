import { loadEnv } from './env';
loadEnv();
import { chromium } from 'playwright';

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(process.argv[2], { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForTimeout(5000);

  const trials: [string, string][] = [
    ['country', 'United States'],
    ['candidate-location', 'Dallas'],
    ['question_13365641004', 'Yes'],
  ];

  for (const [id, value] of trials) {
    const loc = page.locator(`[id="${id}"]`).first();
    if ((await loc.count()) === 0) { process.stdout.write(`${id}: not found\n`); continue; }
    await loc.click({ timeout: 5000 }).catch(() => {});
    await loc.fill('').catch(() => {});
    await loc.pressSequentially(value, { delay: 40, timeout: 15_000 }).catch(() => {});
    const option = page.locator('[role="option"]:visible').first();
    const appeared = await option.waitFor({ state: 'visible', timeout: 6000 }).then(() => true).catch(() => false);
    let chosen = '(none)';
    if (appeared) {
      chosen = ((await option.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim().slice(0, 40);
      await option.click({ timeout: 5000 }).catch(() => {});
    }
    await page.waitForTimeout(600);
    const after = await loc.inputValue().catch(() => '(unreadable)');
    process.stdout.write(`${id.padEnd(24)} optionsAppeared=${appeared} picked="${chosen}" value="${after}"\n`);
  }
  await browser.close();
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
