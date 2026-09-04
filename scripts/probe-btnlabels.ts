import { loadEnv } from './env';
loadEnv();
import { openSession } from '../src/lib/autopilot/adapters/browser';
import { PlaywrightDriver } from '../src/lib/autopilot/navigator/playwright-driver';
async function main(): Promise<void> {
  const session = await openSession();
  try {
    await session.page.goto(process.argv[2], { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await session.page.waitForTimeout(4000);
    const driver = new PlaywrightDriver(session.page, async () => ({ answers: [], blocked: [] }), null);
    await driver.observe();
    const info = await session.page.evaluate(`(() => {
      const holder = document.querySelector('[data-mf-group="mf-btngroup-0"]');
      if (!holder) return 'no holder';
      const bs = Array.from(holder.querySelectorAll('button[aria-pressed]'));
      return bs.map(b => ({ text: JSON.stringify(b.textContent), inner: JSON.stringify(b.innerText), pressed: b.getAttribute('aria-pressed') }));
    })()`);
    process.stdout.write(JSON.stringify(info, null, 2) + '\n');
    const tryClick = await session.page.evaluate(`(() => {
      const holder = document.querySelector('[data-mf-group="mf-btngroup-0"]');
      const bs = Array.from(holder.querySelectorAll('button[aria-pressed]'));
      const want = 'yes (united states)';
      const label = (b) => ((b.textContent || '').trim().toLowerCase());
      const hit = bs.find(b => label(b) === want) || bs.find(b => label(b).length >= 2 && want.startsWith(label(b)));
      if (!hit) return 'no match; labels=' + JSON.stringify(bs.map(label));
      hit.click();
      return 'clicked ' + label(hit) + ' pressed=' + hit.getAttribute('aria-pressed');
    })()`);
    process.stdout.write('click test: ' + String(tryClick) + '\n');
  } finally { await session.close(); }
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
