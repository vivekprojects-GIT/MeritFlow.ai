import { notFound } from 'next/navigation';
import { UiHarness } from './harness';

/**
 * A visual bench for the JobPilot widgets.
 *
 * These components fetch their own data and live behind a session, which makes
 * them impossible to look at while working on them — the practical result being
 * that layout gets written blind and shipped unseen. This mounts them against
 * fixtures so the design can actually be reviewed.
 *
 * Development only. It 404s in a production build rather than relying on the
 * route being obscure.
 */
export default function DevUiPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <UiHarness />;
}
