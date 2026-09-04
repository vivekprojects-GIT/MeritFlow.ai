import { readFile } from 'node:fs/promises';
async function main(): Promise<void> {
  const buf = await readFile(process.argv[2]);
  const mammoth = await import('mammoth');
  const { value: html } = await mammoth.convertToHtml({ buffer: buf });
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  process.stdout.write([...new Set(hrefs)].join('\n') + '\n');
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
