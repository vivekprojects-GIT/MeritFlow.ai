/**
 * The MeritFlow worker.
 *
 * The process that makes "close the website" true. Everything else in this
 * application runs inside an HTTP request, so until this existed the pipeline
 * only advanced while somebody had a tab open on it.
 *
 *     npm run worker
 *
 * ## Running it beside the dev server
 *
 * Fine, now. The database is SQLite with write-ahead logging, so this process
 * and `next dev` can hold it at the same time — which was not true of the
 * WebAssembly Postgres this project used to run on, and is the single reason
 * this worker sat unusable for as long as it did.
 */

import { closeBrowser } from './src/lib/autopilot/adapters/browser';
import { sweep, CYCLE_MS, OUTCOME_LABEL, type Outcome } from './src/lib/autopilot/autonomous';

/** How often to look for accounts that are due. */
const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 60_000);

let stopping = false;

function log(message: string): void {
  process.stdout.write(`${new Date().toISOString()} ${message}\n`);
}

async function once(): Promise<void> {
  const summaries = await sweep();
  if (summaries.length === 0) return;

  for (const s of summaries) {
    const parts = (Object.entries(s.counts) as [Outcome, number][])
      .filter(([, n]) => n > 0)
      .map(([outcome, n]) => `${OUTCOME_LABEL[outcome]} ${n}`);

    log(
      `${s.userId} — ${s.attempted} attempted${parts.length ? `: ${parts.join(', ')}` : ''}` +
        (s.stoppedBecause ? ` (${s.stoppedBecause})` : ''),
    );
  }
}

async function main(): Promise<void> {
  log(`worker up — polling every ${Math.round(POLL_MS / 1000)}s, one cycle per account every ${Math.round(CYCLE_MS / 60000)} min`);

  while (!stopping) {
    try {
      await once();
    } catch (err) {
      /* A sweep that throws must not take the worker down: the next poll is a
         minute away and the alternative is a process that dies overnight and
         is discovered in the morning. */
      log(`sweep failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }

  await closeBrowser();
  log('worker down');
}

/* A run in flight is driving a real browser against a real employer. Finish the
   poll rather than dropping it mid-application. */
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    if (stopping) process.exit(1);
    stopping = true;
    log(`${signal} — finishing the current cycle, press again to force`);
  });
}

void main();
