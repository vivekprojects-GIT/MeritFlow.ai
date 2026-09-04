import { loadEnv } from './env';
loadEnv();
import { readFile } from 'node:fs/promises';
import mammoth from 'mammoth';
async function main(): Promise<void> {
  const buf = await readFile(process.argv[2]);
  const { value } = await mammoth.extractRawText({ buffer: buf });
  process.stdout.write(`file: ${process.argv[2]}\nsize: ${buf.length} bytes\nzip signature: ${buf.subarray(0,2).toString('latin1')}\n`);
  process.stdout.write(`extracted characters: ${value.length}\n\n--- first 600 characters an ATS would read ---\n`);
  process.stdout.write(value.slice(0, 600) + '\n');
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
