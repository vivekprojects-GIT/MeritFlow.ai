import { loadEnv } from './env';
loadEnv();
import { openSession } from '../src/lib/autopilot/adapters/browser';
async function main(): Promise<void> {
  const session = await openSession();
  try {
    await session.page.goto(process.argv[2], { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await session.page.waitForTimeout(4000);
    const js = `(() => {
      const el = Array.from(document.querySelectorAll('*')).find(e => /technical domain/i.test(e.textContent || '') && e.children.length < 30 && (e.textContent||'').length < 400);
      if (!el) return 'question not found';
      const html = el.outerHTML.slice(0, 1600);
      return html;
    })()`;
    process.stdout.write(String(await session.page.evaluate(js)).slice(0, 1600) + '\n');
  } finally { await session.close(); }
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
