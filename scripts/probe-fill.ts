import { loadEnv } from './env';
loadEnv();
import { chromium } from 'playwright';

/** Try to fill the identity fields and read them back. Never clicks submit. */
async function main(): Promise<void> {
  const url = process.argv[2];
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForTimeout(4000);

  const js = `(() => Array.from(document.querySelectorAll('input,textarea,select')).slice(0,25).map((el) => ({
    tag: el.tagName.toLowerCase(), type: el.getAttribute('type') || '', name: el.getAttribute('name') || '',
    id: el.id || '', required: el.hasAttribute('required') || el.getAttribute('aria-required') === 'true',
    visible: !!(el.offsetWidth || el.offsetHeight),
  })))()`;
  const fields = (await page.evaluate(js)) as { tag: string; type: string; name: string; id: string; required: boolean; visible: boolean }[];
  process.stdout.write('fields on the page:\n');
  for (const f of fields) process.stdout.write(`  ${f.tag}/${f.type || '-'}  name="${f.name}" id="${f.id}" req=${f.required} vis=${f.visible}\n`);

  for (const key of ['first_name', 'last_name', 'email']) {
    const loc = page.locator(`[name="${key}"], #${key}`).first();
    if ((await loc.count().catch(() => 0)) === 0) { process.stdout.write(`\n${key}: NOT FOUND\n`); continue; }
    await loc.fill('TESTVALUE').catch((e: unknown) => process.stdout.write(`  fill threw: ${String(e).slice(0,60)}\n`));
    const got = await loc.inputValue().catch(() => '(unreadable)');
    process.stdout.write(`\n${key}: after fill -> "${got}"  ${got === 'TESTVALUE' ? 'STUCK' : 'DID NOT STICK'}\n`);
  }
  await browser.close();
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
