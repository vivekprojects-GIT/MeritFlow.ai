import { NextResponse } from 'next/server';
import { beginSso, ssoConfigForSlug } from '@/lib/sso';

export const runtime = 'nodejs';

/** Redirect to the university's identity provider. */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const config = await ssoConfigForSlug(slug);
  if (!config) {
    return NextResponse.redirect(new URL(`/login?sso=unavailable`, req.url));
  }

  try {
    /* Built from the incoming request so it matches whatever origin the app is
       actually served on — it must equal the redirect_uri sent at token exchange. */
    const redirectUri = new URL(`/api/auth/sso/${slug}/callback`, req.url).toString();
    return NextResponse.redirect(await beginSso(config, redirectUri));
  } catch (err) {
    console.error('[sso] start failed:', err);
    return NextResponse.redirect(new URL('/login?sso=error', req.url));
  }
}
