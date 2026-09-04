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
    const obs = await driver.observe();
    process.stdout.write(`fields: ${obs.fields.length}\n`);
    for (const f of obs.fields.slice(0, 14)) process.stdout.write(`  ${f.kind.padEnd(9)} req=${String(f.required).padEnd(5)} ${f.id.slice(0,30).padEnd(32)} "${f.label.slice(0,48)}"${f.options?.length ? ' opts=' + f.options.slice(0,4).join('|').slice(0,40) : ''}\n`);
  } catch (e) {
    process.stdout.write('observe threw: ' + String(e).slice(0, 300) + '\n');
  } finally {
    await session.close();
  }
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
