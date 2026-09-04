import { loadEnv } from './env';
loadEnv();
import { openSession } from '../src/lib/autopilot/adapters/browser';
import { PlaywrightDriver } from '../src/lib/autopilot/navigator/playwright-driver';

async function main(): Promise<void> {
  const session = await openSession();
  try {
    await session.page.goto(process.argv[2], { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await session.page.waitForTimeout(4000);
    const driver = new PlaywrightDriver(session.page, async (fields) => ({
      answers: fields.filter((f) => f.id.startsWith('mf-btngroup-')).map((f) => ({ field: f.id, value: f.id === 'mf-btngroup-1' ? 'No (United States)' : 'Yes (United States)' })),
      blocked: [],
    }), null);
    const obs1 = await driver.observe();
    const groups = obs1.fields.filter((f) => f.id.startsWith('mf-btngroup-'));
    process.stdout.write(`groups: ${groups.map((g) => g.id).join(', ')}\n`);
    const resolved = await driver.resolve(groups);
    process.stdout.write(`answerable: ${JSON.stringify(resolved.answerable)}\n`);
    const res = await driver.fill(resolved.answerable);
    process.stdout.write(`fill -> filled=${JSON.stringify(res.filled)} skipped=${JSON.stringify(res.skipped)}\n`);
    await session.page.waitForTimeout(800);
    const obs2 = await driver.observe();
    process.stdout.write(`after: filled per observe = ${JSON.stringify(obs2.filled.filter((x) => x.startsWith('mf-')))}\n`);
    const pressed = await session.page.evaluate(`Array.from(document.querySelectorAll('button[aria-pressed="true"]')).map(b => (b.textContent||'').trim())`);
    process.stdout.write(`pressed buttons: ${JSON.stringify(pressed)}\n`);
  } finally {
    await session.close();
  }
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
