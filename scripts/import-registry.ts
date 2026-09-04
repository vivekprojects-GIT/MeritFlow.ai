/**
 * Load a company list into the registry.
 *
 *     npm run registry:import -- path/to/companies.csv [source-label]
 *
 * Safe to run while the dev server is up: SQLite handles concurrent writers,
 * which is the whole reason this project left PGlite.
 */

import { readFile } from 'node:fs/promises';
import { importCompanies, parseRegistryCsv } from '../src/lib/discovery/import';
import { registryStats } from '../src/lib/discovery/registry';

async function main(): Promise<void> {
  const [path, label] = process.argv.slice(2);
  if (!path) {
    process.stderr.write('Usage: npm run registry:import -- <csv> [source]\n');
    process.exit(1);
  }

  const text = await readFile(path, 'utf8');
  const rows = parseRegistryCsv(text);
  process.stdout.write(`Parsed ${rows.length.toLocaleString()} rows from ${path}\n`);
  if (rows.length === 0) {
    process.stderr.write('Nothing recognisable in that file. Expected a header with a company name column.\n');
    process.exit(1);
  }

  const started = Date.now();
  const result = await importCompanies(rows, label || 'import');
  const seconds = Math.round((Date.now() - started) / 1000);

  process.stdout.write(
    `Inserted ${result.inserted.toLocaleString()}, updated ${result.updated.toLocaleString()}, ` +
      `skipped ${result.skipped.toLocaleString()} in ${seconds}s\n`,
  );

  const stats = await registryStats();
  process.stdout.write(`Registry now holds ${stats.companies.toLocaleString()} companies\n`);
  for (const row of stats.byAts) {
    process.stdout.write(`  ${row.ats.padEnd(16)} ${String(row.companies).padStart(6)} companies\n`);
  }

  /* Detection has not run on these yet: they carry a domain and nothing more,
     which is exactly what the probe needs and the scheduler will work through
     priority-first. Said plainly so the numbers above are not mistaken for
     coverage. */
  process.stdout.write('\nThese are seed rows. The scheduler identifies each one before anything is collected.\n');
  process.exit(0);
}

void main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
