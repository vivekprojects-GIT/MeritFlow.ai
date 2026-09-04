import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { isLearner } from '../../jobs/route';
import { ensureExtensionToken } from '@/lib/job-settings';
import { checkRate, rateLimited } from '@/lib/rate-limit';

export const runtime = 'nodejs';

/**
 * Issue — or rotate — the extension's connection token.
 *
 * Behind the session, unlike `/fill`, which is the whole point of there being
 * two endpoints: this one is reached from the app while signed in, and hands
 * over a credential the extension then uses on employer pages without ever
 * carrying the session cookie there.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isLearner(user.role)) return NextResponse.json({ error: 'Not available for this account type.' }, { status: 403 });

  const rate = checkRate(user.id, 'write');
  if (!rate.allowed) return rateLimited(rate);

  let rotate = false;
  try {
    rotate = Boolean(((await req.json()) as { rotate?: unknown }).rotate);
  } catch {
    /* No body means "give me the current one". */
  }

  /* Rotating invalidates every installed copy, which is what makes a leaked
     token recoverable. */
  return NextResponse.json({ token: await ensureExtensionToken(user.id, rotate) });
}
