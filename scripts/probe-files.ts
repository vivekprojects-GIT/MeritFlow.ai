import { loadEnv } from './env';
loadEnv();
import { chromium } from 'playwright';
async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(process.argv[2], { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForTimeout(5000);
  const js = `(() => ({
    fileInputs: Array.from(document.querySelectorAll('input[type=file]')).map((e,i) => ({
      i, id: e.id, name: e.getAttribute('name')||'', accept: e.getAttribute('accept')||'',
      visible: !!(e.offsetWidth||e.offsetHeight), disabled: e.disabled,
      label: (e.closest('div')?.innerText||'').replace(/\s+/g,' ').slice(0,60),
    })),
    locationFields: Array.from(document.querySelectorAll('input')).filter(e => /location|city/i.test(e.id + ' ' + (e.getAttribute('aria-label')||''))).map(e => ({
      id: e.id, role: e.getAttribute('role')||'', autocomplete: e.getAttribute('aria-autocomplete')||'', expanded: e.getAttribute('aria-expanded')||'',
    })),
  }))()`;
  process.stdout.write(JSON.stringify(await page.evaluate(js), null, 2) + '\n');
  await browser.close();
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
