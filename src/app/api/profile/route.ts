import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getProfile, updateProfile, AVATAR_MAX_CHARS, type ProfilePatch } from '@/lib/profile-store';

export const runtime = 'nodejs';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const profile = await getProfile(user.id);
  if (!profile) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ profile });
}

export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const fields: ProfilePatch = {};
  /* Allowlisted rather than spread: `role` and `email` live on the same table,
     and a blind copy would let anyone PATCH themselves to admin. */
  const TEXT_FIELDS = [
    'name',
    'headline',
    'bio',
    'phone',
    'birthDate',
    'pronouns',
    'location',
    'timezone',
    'website',
    'department',
    'studentId',
  ] as const;
  for (const key of TEXT_FIELDS) {
    if (typeof body[key] === 'string') (fields as Record<string, string>)[key] = body[key] as string;
  }
  if (body.avatarUrl === null) {
    fields.avatarUrl = null;
  } else if (typeof body.avatarUrl === 'string') {
    if (!body.avatarUrl.startsWith('data:image/')) {
      return NextResponse.json({ error: 'Avatar must be an image.' }, { status: 400 });
    }
    if (body.avatarUrl.length > AVATAR_MAX_CHARS) {
      return NextResponse.json({ error: 'Image is too large.' }, { status: 413 });
    }
    fields.avatarUrl = body.avatarUrl;
  }

  const profile = await updateProfile(user.id, fields);
  return NextResponse.json({ profile });
}
