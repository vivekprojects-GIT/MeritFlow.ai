import { loadEnv } from './env';
loadEnv();
import { openSession } from '../src/lib/autopilot/adapters/browser';
async function main(): Promise<void> {
  const session = await openSession();
  try {
    await session.page.goto(process.argv[2], { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await session.page.waitForTimeout(4000);
    const js = `(() => {
      const out = [];
      document.querySelectorAll('input:not([type=hidden]), textarea, select').forEach(e => {
        const name = e.getAttribute('name') || e.getAttribute('id') || '';
        if (name) return; // observe sees these already
        if (!(e.offsetWidth || e.offsetHeight)) return;
        let label = '';
        let n = e.parentElement;
        for (let i = 0; i < 6 && n && !label; i++) { const q = n.querySelector('label'); if (q) label = q.innerText; n = n.parentElement; }
        out.push({
          type: e.getAttribute('type') || e.tagName.toLowerCase(),
          placeholder: e.getAttribute('placeholder') || '',
          role: e.getAttribute('role') || '',
          label: (label || '').replace(/\s+/g, ' ').trim().slice(0, 60),
        });
      });
      return out;
    })()`;
    const rows = await session.page.evaluate(js) as Record<string,string>[];
    process.stdout.write(`nameless visible controls: ${rows.length}\n`);
    for (const r of rows) process.stdout.write(`  ${(r.type||'').padEnd(9)} role=${(r.role||'-').padEnd(9)} ph="${r.placeholder}"  label="${r.label}"\n`);
  } finally { await session.close(); }
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
