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
    const n1 = await session.page.evaluate(`document.querySelectorAll('[data-mf-group]').length`);
    process.stdout.write(`markers right after observe: ${n1}\n`);
    await session.page.waitForTimeout(1500);
    const n2 = await session.page.evaluate(`document.querySelectorAll('[data-mf-group]').length`);
    process.stdout.write(`markers 1.5s later: ${n2}\n`);
    const pressables = await session.page.evaluate(`document.querySelectorAll('button[aria-pressed]').length`);
    process.stdout.write(`button[aria-pressed] on page: ${pressables}\n`);
  } finally { await session.close(); }
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
