import { loadEnv } from './env';
loadEnv();
import { chromium } from 'playwright';
async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(process.argv[2], { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForTimeout(3500);
  const js = `(() => {
    const forms = Array.from(document.querySelectorAll('form'));
    const submit = document.querySelector('button[type=submit]');
    const inputs = Array.from(document.querySelectorAll('input[name], textarea[name], select[name]'));
    const sf = submit ? submit.closest('form') : null;
    const rows = inputs.slice(0, 8).map((el) => ({
      name: el.getAttribute('name'),
      id: el.id || '',
      form: el.closest('form') ? 'form#' + forms.indexOf(el.closest('form')) : 'NONE',
      sharesWithSubmit: sf !== null && el.closest('form') === sf,
    }));
    return {
      formCount: forms.length,
      submitForm: sf ? 'form#' + forms.indexOf(sf) : 'NO FORM ANCESTOR',
      inputs: rows,
    };
  })()`;
  const out = await page.evaluate(js);
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  await browser.close();
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
