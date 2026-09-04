/**
 * Server startup.
 *
 * `register` runs once per server instance, before the first request is
 * handled, which is the only hook that fires without somebody opening a tab —
 * exactly what autonomous mode needs. Everything heavier than starting a timer
 * belongs elsewhere: the server is not ready until this returns.
 */
export async function register(): Promise<void> {
  /* Node only. The Edge runtime has no timers worth trusting for this, no
     filesystem for SQLite, and no business driving a browser. */
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  /* A production build starts a server instance to collect routes. Sweeping
     from inside a build would send real applications during `next build`. */
  if (process.env.NEXT_PHASE === 'phase-production-build') return;

  const { startScheduler } = await import('./lib/autopilot/scheduler');
  startScheduler();
}
