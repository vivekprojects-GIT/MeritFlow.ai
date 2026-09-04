import { readFile } from 'node:fs/promises';

async function main(): Promise<void> {
  const path = process.argv[2];
  const buf = await readFile(path);
  const mammoth = await import('mammoth');
  const { value: html } = await mammoth.convertToHtml({ buffer: buf });
  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  process.stdout.write(`chars: ${text.length}\n\n${text.slice(0, 700)}\n`);
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
