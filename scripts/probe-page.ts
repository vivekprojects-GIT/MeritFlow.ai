import { loadEnv } from './env';
loadEnv();
import { chromium } from 'playwright';
async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const resp = await page.goto(process.argv[2], { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForTimeout(5000);
  const js = `(() => ({
    status: 'see below',
    url: location.href,
    title: document.title,
    frames: Array.from(document.querySelectorAll('iframe')).map(f => f.src).slice(0,5),
    inputs: document.querySelectorAll('input,textarea,select').length,
    buttons: Array.from(document.querySelectorAll('button,a')).map(b=>(b.innerText||'').trim()).filter(t=>t&&t.length<40).slice(0,14),
    text: document.body.innerText.replace(/\s+/g,' ').slice(0, 300),
  }))()`;
  const out = await page.evaluate(js) as Record<string, unknown>;
  out.status = resp?.status() ?? 0;
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  await browser.close();
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
