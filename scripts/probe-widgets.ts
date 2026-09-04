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
      // anything focusable that is not a plain input/select/textarea/button[aria-pressed]
      document.querySelectorAll('[role], input[type=radio], [contenteditable]').forEach(e => {
        const role = e.getAttribute('role') || e.tagName.toLowerCase();
        if (!/combobox|listbox|radiogroup|radio|textbox|spinbutton|grid/.test(role) && e.type !== 'radio') return;
        if (!(e.offsetWidth || e.offsetHeight)) return;
        let label = '';
        let n = e.parentElement;
        for (let i = 0; i < 6 && n && !label; i++) { const q = n.querySelector('label'); if (q) label = q.innerText; n = n.parentElement; }
        out.push({ role, tag: e.tagName.toLowerCase(), id: (e.id || e.getAttribute('name') || '').slice(0, 40), label: (label||'').replace(/\s+/g,' ').trim().slice(0, 56) });
      });
      return out;
    })()`;
    const rows = await session.page.evaluate(js) as Record<string,string>[];
    for (const r of rows) process.stdout.write(`${(r.role||'').padEnd(11)} ${(r.tag||'').padEnd(7)} ${(r.id||'').padEnd(42)} "${r.label}"\n`);
  } finally { await session.close(); }
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
