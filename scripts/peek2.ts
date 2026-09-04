import { readFile } from 'node:fs/promises';
async function main(): Promise<void> {
  const buf = await readFile(process.argv[2]);
  const mammoth = await import('mammoth');
  const { value: html } = await mammoth.convertToHtml({ buffer: buf });
  const text = html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const heads = lines.filter((l) => /^[A-Z][A-Z \t&/]{4,}:?$/.test(l));
  process.stdout.write('SECTIONS:\n' + heads.join('\n') + '\n\n');
  const idx = lines.findIndex((l) => /experience/i.test(l) && l.length < 40);
  process.stdout.write('AFTER EXPERIENCE HEADING:\n' + lines.slice(idx, idx + 14).join('\n') + '\n');
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
