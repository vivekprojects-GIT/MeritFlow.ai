import { loadEnv } from './env';
loadEnv();
import { chromium } from 'playwright';
async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(process.argv[2], { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForTimeout(5000);
  const js = `(() => Array.from(document.querySelectorAll('input,select,textarea'))
    .filter(e => (e.hasAttribute('required')||e.getAttribute('aria-required')==='true') && (e.offsetWidth||e.offsetHeight))
    .map(e => {
      const id = e.id || e.getAttribute('name') || '';
      let label = '';
      const l = id ? document.querySelector('label[for="' + CSS.escape(id) + '"]') : null;
      if (l) label = l.innerText;
      if (!label) { let n = e.parentElement; for (let i=0;i<4&&n&&!label;i++){ const q=n.querySelector('label'); if(q) label=q.innerText; n=n.parentElement; } }
      return { id: id.slice(0,34), tag: e.tagName.toLowerCase(), type: e.getAttribute('type')||'', role: e.getAttribute('role')||'', ac: e.getAttribute('aria-autocomplete')||'', label: (label||'').replace(/\s+/g,' ').trim().slice(0,56) };
    }))()`;
  const rows = await page.evaluate(js) as Record<string,string>[];
  for (const r of rows) process.stdout.write(`${r.tag}/${r.type||'-'} role=${r.role||'-'} ac=${r.ac||'-'}  ${r.id.padEnd(30)} "${r.label}"\n`);
  await browser.close();
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
