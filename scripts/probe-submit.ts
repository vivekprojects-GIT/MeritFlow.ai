import { loadEnv } from './env';
loadEnv();
import { chromium } from 'playwright';

/** What submit-looking controls exist on a page, and why ours missed them. */
async function main(): Promise<void> {
  const url = process.argv[2];
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForTimeout(3500);

  const found = await page.evaluate(() => {
    const out: { tag: string; type: string; text: string; visible: boolean; disabled: boolean; id: string }[] = [];
    const nodes = document.querySelectorAll('button, input[type=submit], [role=button], a[href*="apply"]');
    nodes.forEach((el) => {
      const e = el as HTMLElement & { type?: string; disabled?: boolean };
      const r = e.getBoundingClientRect();
      out.push({
        tag: e.tagName.toLowerCase(),
        type: e.type ?? '',
        text: (e.innerText || (e as HTMLInputElement).value || '').trim().slice(0, 48),
        visible: r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden',
        disabled: Boolean(e.disabled),
        id: e.id || '',
      });
    });
    return out;
  });

  process.stdout.write(`${url}\n\n`);
  for (const f of found) {
    process.stdout.write(
      `${f.tag.padEnd(6)} type=${(f.type || '-').padEnd(8)} vis=${String(f.visible).padEnd(5)} dis=${String(f.disabled).padEnd(5)} id=${f.id.slice(0, 20).padEnd(22)} "${f.text}"\n`,
    );
  }
  await browser.close();
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
