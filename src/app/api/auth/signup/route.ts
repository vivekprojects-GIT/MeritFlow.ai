import { NextResponse } from 'next/server';
import {
  createSession,
  createUser,
  deleteUser,
  findUserByEmail,
  isValidAdminCode,
  SESSION_COOKIE,
  sessionCookieOptions,
  setUserUniversity,
  type Role,
  type User,
} from '@/lib/auth';
import { consumeProfessorCode, getUniversityBySlug } from '@/lib/universities-store';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  let email = '';
  let password = '';
  let roleReq = 'student';
  let bodyAccountKind: unknown = '';
  let accessCode = '';
  let universitySlug = '';
  try {
    const body = (await req.json()) as {
      email?: unknown;
      password?: unknown;
      role?: unknown;
      accountKind?: unknown;
      accessCode?: unknown;
      universitySlug?: unknown;
    };
    email = String(body.email ?? '').trim().toLowerCase();
    password = String(body.password ?? '');
    roleReq = String(body.role ?? 'student');
    bodyAccountKind = body.accountKind;
    accessCode = String(body.accessCode ?? '');
    universitySlug = String(body.universitySlug ?? '').trim();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
  }

  // Admin needs the env admin code, validated up front (no DB write yet).
  if (roleReq === 'admin' && !isValidAdminCode(accessCode)) {
    return NextResponse.json({ error: 'That admin access code is not valid.' }, { status: 403 });
  }

  if (await findUserByEmail(email)) {
    return NextResponse.json({ error: 'An account with that email already exists.' }, { status: 409 });
  }

  // Student may belong to a university if they arrived via a branded link.
  let studentUniversityId: string | null = null;
  if (roleReq === 'student' && universitySlug) {
    const uni = await getUniversityBySlug(universitySlug);
    studentUniversityId = uni?.id ?? null;
  }

  const role: Role = roleReq === 'admin' ? 'admin' : roleReq === 'instructor' ? 'instructor' : 'student';

  let user: User;
  try {
    /* Only a student can be a personal account. A professor or admin is by
       definition institutional, so the flag is ignored for them rather than
       trusted from the request body. */
    const accountKind: 'personal' | 'institutional' =
      role === 'student' && String(bodyAccountKind) === 'personal' ? 'personal' : 'institutional';
    user = await createUser(email, password, role, role === 'student' ? studentUniversityId : null, accountKind);
  } catch (err) {
    /* Only a unique-constraint violation means the email is taken. Reporting
       every failure as "already exists" hid a missing-column error behind a
       409 and sent people off to reset a password for an account that was
       never created. */
    const message = err instanceof Error ? err.message : String(err);
    if (/duplicate key|unique constraint/i.test(message)) {
      return NextResponse.json({ error: 'An account with that email already exists.' }, { status: 409 });
    }
    console.error('[signup]', { email, role: roleReq, err });
    return NextResponse.json({ error: 'Could not create your account. Please try again.' }, { status: 500 });
  }

  // Professors must redeem a valid, unused admin-issued code; roll back if it fails.
  if (role === 'instructor') {
    const consumed = await consumeProfessorCode(accessCode, user.id);
    if ('error' in consumed) {
      await deleteUser(user.id);
      return NextResponse.json({ error: consumed.error }, { status: 403 });
    }
    await setUserUniversity(user.id, consumed.universityId);
    user.universityId = consumed.universityId;
  }

  const { token, expiresAt } = await createSession(user.id);
  const res = NextResponse.json({ user: { id: user.id, email: user.email, role: user.role } });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
  return res;
}
