import { NextResponse } from 'next/server';
import { createSession, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth';
import { completeSso, ssoConfigForSlug, upsertSsoUser } from '@/lib/sso';

export const runtime = 'nodejs';

/**
 * Handle the identity provider's callback.
 *
 * Every failure path lands back on /login with a short reason — never a stack
 * trace, and never a partially signed-in state.
 */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const url = new URL(req.url);

  /* The IdP reports its own failures this way (e.g. the user declined). */
  const idpError = url.searchParams.get('error');
  if (idpError) return NextResponse.redirect(new URL('/login?sso=denied', req.url));

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) return NextResponse.redirect(new URL('/login?sso=error', req.url));

  const config = await ssoConfigForSlug(slug);
  if (!config) return NextResponse.redirect(new URL('/login?sso=unavailable', req.url));

  try {
    const redirectUri = new URL(`/api/auth/sso/${slug}/callback`, req.url).toString();
    const identity = await completeSso(config, code, state, redirectUri);
    const user = await upsertSsoUser(identity);

    const { token, expiresAt } = await createSession(user.id);
    const res = NextResponse.redirect(new URL('/', req.url));
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
    return res;
  } catch (err) {
    console.error('[sso] callback failed:', err instanceof Error ? err.message : err);
    return NextResponse.redirect(new URL('/login?sso=failed', req.url));
  }
}
