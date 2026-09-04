import { readFile } from 'node:fs/promises';
async function main(): Promise<void> {
  const buf = await readFile(process.argv[2]);
  const mammoth = await import('mammoth');
  const { value: html } = await mammoth.convertToHtml({ buffer: buf });
  const text = html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const i = lines.findIndex((l) => /^EDUCATION/i.test(l));
  process.stdout.write('EDUCATION SECTION:\n' + lines.slice(i, i + 8).join('\n') + '\n\n');
  const loc = lines.filter((l) => /\b(TX|CA|NY|NJ|FL|PA|IL|WA|GA|VA|MA|NC|OH|MI|AZ)\b\s*(,|$)|\bTexas|Dallas|Austin|Houston|Plano|Irving/i.test(l));
  process.stdout.write('LINES MENTIONING A US LOCATION:\n' + loc.slice(0, 8).join('\n') + '\n');
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
