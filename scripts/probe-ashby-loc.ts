import { loadEnv } from './env';
loadEnv();
import { openSession } from '../src/lib/autopilot/adapters/browser';
async function main(): Promise<void> {
  const session = await openSession();
  const page = session.page;
  try {
    await page.goto(process.argv[2], { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForTimeout(4000);
    const loc = page.locator('input[placeholder="Start typing..."]').first();
    process.stdout.write(`found: ${await loc.count()}  role=${await loc.getAttribute('role')}\n`);
    await loc.click({ timeout: 5000 });
    await loc.pressSequentially('Dallas', { delay: 60 });
    for (const wait of [1500, 3000, 6000]) {
      await page.waitForTimeout(wait);
      const opts = await page.locator('[role="option"]').allInnerTexts().catch(() => []);
      const lis = await page.locator('[role="listbox"] *').count().catch(() => 0);
      process.stdout.write(`after +${wait}ms: options=${JSON.stringify(opts.slice(0,4))} listboxNodes=${lis}\n`);
      if (opts.length) break;
    }
    const anyPopup = await page.evaluate(`(() => { const els = Array.from(document.querySelectorAll('div')).filter(d => /dallas/i.test(d.textContent||'') && d.children.length<4 && (d.offsetWidth||d.offsetHeight) && (d.textContent||'').length<60); return els.map(d => ({ text: (d.innerText||'').trim().slice(0,40), cls: (d.className||'').toString().slice(0,40) })).slice(0,6); })()`);
    process.stdout.write('popup candidates: ' + JSON.stringify(anyPopup) + '\n');
  } finally { await session.close(); }
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
