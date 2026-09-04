import { NextResponse } from 'next/server';
import { createSession, findUserByEmail, SESSION_COOKIE, sessionCookieOptions, verifyPassword } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  let email = '';
  let password = '';
  try {
    const body = (await req.json()) as { email?: unknown; password?: unknown };
    email = String(body.email ?? '').trim().toLowerCase();
    password = String(body.password ?? '');
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const user = await findUserByEmail(email);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return NextResponse.json({ error: 'Incorrect email or password.' }, { status: 401 });
  }

  const { token, expiresAt } = await createSession(user.id);
  const res = NextResponse.json({ user: { id: user.id, email: user.email } });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
  return res;
}
