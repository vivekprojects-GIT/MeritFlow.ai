import { loadEnv } from './env';
loadEnv();
import { chromium } from 'playwright';
import { writeFile, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { textToDocx } from '../src/lib/jobs/docx';

async function main(): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'probe-'));
  const file = join(dir, 'resume.docx');
  await writeFile(file, textToDocx('Sai Vivek Katkuri\nAI Engineer\nPython, LangGraph, RAG'));

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(process.argv[2], { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForTimeout(5000);

  const inputs = page.locator('input[type="file"]');
  const n = await inputs.count();
  process.stdout.write(`file inputs: ${n}\n`);
  for (let i = 0; i < n; i += 1) {
    const el = inputs.nth(i);
    process.stdout.write(`  [${i}] id=${await el.getAttribute('id')} accept=${await el.getAttribute('accept')} visible=${await el.isVisible().catch(()=>false)}\n`);
  }

  if (n > 0) {
    await inputs.first().setInputFiles(file).catch((e: unknown) => process.stdout.write(`  setInputFiles threw: ${String(e).slice(0,90)}\n`));
    await page.waitForTimeout(4000);
    const got = await inputs.first().evaluate((el) => (el as HTMLInputElement).files?.[0]?.name ?? null).catch(() => null);
    process.stdout.write(`\nafter upload, input holds: ${got}\n`);
    const body = (await page.textContent('body')) ?? '';
    process.stdout.write(`filename visible on page: ${/resume\.docx/i.test(body)}\n`);
  }

  /* Which required fields are still empty. */
  const empties = await page.evaluate(`(() => Array.from(document.querySelectorAll('select, input[type=text], input[type=email]'))
    .filter(e => (e.hasAttribute('required') || e.getAttribute('aria-required') === 'true') && !e.value && (e.offsetWidth||e.offsetHeight))
    .map(e => e.id || e.getAttribute('name') || '?').slice(0, 12))()`) as string[];
  process.stdout.write(`required-and-empty: ${JSON.stringify(empties)}\n`);

  await browser.close();
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
