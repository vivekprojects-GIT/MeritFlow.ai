import { loadEnv } from './env';
loadEnv();
import { chromium } from 'playwright';
async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(process.argv[2], { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForTimeout(4000);
  const js = `(() => Array.from(document.querySelectorAll('input,textarea,select')).slice(0,22).map((e) => {
    const id = e.id || e.getAttribute('name') || '';
    let label = '';
    if (e.id) { const l = document.querySelector('label[for="' + CSS.escape(e.id) + '"]'); if (l) label = l.innerText; }
    if (!label) { const l = e.closest('label'); if (l) label = l.innerText; }
    if (!label) { const w = e.closest('li,div,fieldset'); if (w) label = (w.querySelector('label,legend,.application-label')||{}).innerText || ''; }
    return { id: id.slice(0,44), type: e.getAttribute('type')||e.tagName.toLowerCase(), required: e.hasAttribute('required')||e.getAttribute('aria-required')==='true', label: (label||'').replace(/\s+/g,' ').trim().slice(0,58) };
  }))()`;
  const rows = await page.evaluate(js) as { id: string; type: string; required: boolean; label: string }[];
  for (const r of rows) process.stdout.write(`${r.required ? 'REQ ' : '    '}${r.type.padEnd(10)} ${r.id.padEnd(46)} "${r.label}"\n`);
  await browser.close();
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
