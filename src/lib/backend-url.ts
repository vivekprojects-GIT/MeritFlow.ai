/**
 * Where the Python generator lives, and how this app proves it may call it.
 *
 * ## Why a module rather than an inline `process.env` read
 *
 * Four call sites read `PYTHON_BACKEND_URL`, each appending a path to it, and
 * each assuming the value is a full URL. On Render the natural way to wire one
 * service to another yields `host:port` with no scheme — which every one of
 * those call sites would turn into a `TypeError: Invalid URL` at the moment a
 * learner pressed Create. Normalising once is cheaper than four identical bugs.
 */

const DEFAULT_BACKEND = 'http://127.0.0.1:8000';

/**
 * The backend's base URL, with a scheme, without a trailing slash.
 *
 * A bare `host:port` is assumed to be plain HTTP because that is what it means
 * on a private network inside a platform. An address that already carries a
 * scheme is left exactly as given.
 */
export function backendBaseUrl(): string {
  const raw = process.env.PYTHON_BACKEND_URL?.trim() || DEFAULT_BACKEND;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  return withScheme.replace(/\/+$/, '');
}

/** A path on the backend, e.g. `backendUrl('/generate-course/stream')`. */
export function backendUrl(path: string): URL {
  return new URL(path, `${backendBaseUrl()}/`);
}

/**
 * Headers proving this request came from the app rather than the internet.
 *
 * The backend has no user accounts and its generate endpoints spend the
 * operator's Anthropic credit, so anything that can reach it can spend money.
 * A private service is the primary defence and this is the second: it costs
 * one header, and it is what makes the deployment safe if the backend ever has
 * to run as a public service because the plan has no private ones.
 *
 * Absent on both sides, nothing is enforced — which is the right default for a
 * backend on loopback during development.
 */
export function backendAuthHeaders(): Record<string, string> {
  const secret = process.env.BACKEND_SHARED_SECRET?.trim();
  return secret ? { 'x-backend-secret': secret } : {};
}
