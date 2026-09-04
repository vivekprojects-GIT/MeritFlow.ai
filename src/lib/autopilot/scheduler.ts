import { sweep } from './autonomous';
import { collectOnce } from '../discovery/collector';
import { seedRegistry } from '../discovery/seed';

/**
 * The in-process scheduler.
 *
 * ## Why this exists at all
 *
 * Autonomous mode had a switch, a durable flag, a sweep function and a worker
 * process — and on this deployment it did nothing, because the database was
 * PGlite and PGlite is single-process: the worker and `next dev` could not both
 * hold the data directory. Anyone who turned the switch on got a stored boolean
 * and no applications.
 *
 * The database is SQLite now and that constraint is gone, so `npm run worker`
 * is a real option again. This stays because it is the deployment that needs no
 * second process, and because a scheduler inside the app is one fewer thing to
 * remember to start.
 *
 * A switch that reports success and changes nothing is worse than no switch.
 * So the tick runs here, inside the process that already owns the database.
 *
 * ## What this does not change
 *
 * Nothing about what a run may do. `sweep` picks up only accounts whose
 * autonomous flag is on, and every gate below it — readiness, the daily cap,
 * the policy engine, the verifier, the execution policy, the duplicate guard —
 * is untouched. This decides *when* a run starts, and nothing else. Turning it
 * on cannot cause anything that pressing Run would not have caused.
 *
 * ## The worker is still the right answer in production
 *
 * On real Postgres, a separate process is better: it survives a deploy, it
 * scales independently, and a stuck browser does not take request handling with
 * it. `npm run worker` remains, and setting `AUTOPILOT_IN_PROCESS_WORKER=0`
 * turns this off in favour of it. This is what makes the feature true on the
 * database this app actually runs on today.
 */

export type SchedulerStatus = {
  /** A tick is scheduled. False means autonomous mode cannot act. */
  live: boolean;
  /** Why it is not live, when it is not. */
  reason: string;
  startedAt: number;
  lastSweepAt: number;
  /** Accounts touched by the last sweep that did any work. */
  lastSweepAccounts: number;
  /** Last failure, kept so a silently failing scheduler is visible. */
  lastError: string;
  pollMs: number;
  /** What the last discovery pass did, so coverage is observable. */
  lastCollection?: { at: number; scanned: number; stored: number; detected: number; failed: number };
};

const POLL_MS = Math.max(15_000, Number(process.env.AUTOPILOT_POLL_MS ?? 60_000));

/*
 * Held on globalThis rather than in module scope.
 *
 * Dev reloads re-evaluate modules but keep the process, so a module-level flag
 * would let each reload start another interval — three reloads, three
 * concurrent sweeps, three browsers driving the same account against the same
 * employer. The duplicate guard would catch the second application; it should
 * not have to.
 */
const KEY = Symbol.for('meritflow.autopilot.scheduler');

type Slot = { timer: NodeJS.Timeout | null; status: SchedulerStatus; running: boolean };

const slot: Slot = ((globalThis as Record<symbol, unknown>)[KEY] as Slot) ?? {
  timer: null,
  running: false,
  status: {
    live: false,
    reason: 'Not started.',
    startedAt: 0,
    lastSweepAt: 0,
    lastSweepAccounts: 0,
    lastError: '',
    pollMs: POLL_MS,
  },
};

(globalThis as Record<symbol, unknown>)[KEY] = slot;

export function schedulerStatus(): SchedulerStatus {
  return { ...slot.status };
}

async function cycle(): Promise<void> {
  /*
   * One sweep at a time.
   *
   * A sweep drives real browsers against real employers and can easily outlast
   * the poll interval. Overlapping sweeps would run the same account twice
   * concurrently, which is the one situation the duplicate guard cannot see —
   * both runs read "not yet applied" before either writes.
   */
  if (slot.running) return;
  slot.running = true;
  try {
    /*
     * Discovery first, then application.
     *
     * In that order because an application run can only reach what discovery
     * has already found, and the freshness rule -- unattended runs only touch
     * postings under a day old -- is only meaningful if collection happens
     * often enough to see them while they are that new.
     *
     * Ordinary code, not a model. Reading a board endpoint is an HTTP request
     * and a JSON parse; putting a model in that loop would cost per company and
     * make the cadence unaffordable, which is the whole reason coverage can
     * grow to thousands of employers.
     */
    const collected = await collectOnce();
    slot.status.lastCollection = {
      at: Date.now(),
      scanned: collected.scanned,
      stored: collected.stored,
      detected: collected.detected,
      failed: collected.failed,
    };

    const summaries = await sweep();
    slot.status.lastSweepAt = Date.now();
    slot.status.lastSweepAccounts = summaries.length;
    slot.status.lastError = '';
  } catch (err) {
    /* Recorded, not thrown. A failing sweep must not stop the next one, and it
       must not be invisible either — the status surfaces this to the account
       screen so "autonomous mode is on" and "autonomous mode is working" stay
       different claims. */
    slot.status.lastError = err instanceof Error ? err.message : String(err);
  } finally {
    slot.running = false;
  }
}

export function startScheduler(): SchedulerStatus {
  if (slot.timer) return schedulerStatus();

  if (process.env.AUTOPILOT_IN_PROCESS_WORKER === '0') {
    slot.status = { ...slot.status, live: false, reason: 'Disabled — run `npm run worker` instead.' };
    return schedulerStatus();
  }

  const timer = setInterval(() => {
    void cycle();
  }, POLL_MS);

  /* Never a reason to keep the process alive on its own. */
  timer.unref?.();
  slot.timer = timer;
  slot.status = { ...slot.status, live: true, reason: '', startedAt: Date.now(), pollMs: POLL_MS };

  /* One immediate cycle, so an account that was already due does not wait a
     full interval after a restart. Deferred a beat so startup is not blocked
     behind a browser launch. The registry is seeded first because a cycle with
     an empty registry has nothing to collect from. */
  setTimeout(() => {
    void seedRegistry()
      .catch(() => undefined)
      .then(() => cycle());
  }, 5_000).unref?.();

  return schedulerStatus();
}

export function stopScheduler(): void {
  if (slot.timer) clearInterval(slot.timer);
  slot.timer = null;
  slot.status = { ...slot.status, live: false, reason: 'Stopped.' };
}
