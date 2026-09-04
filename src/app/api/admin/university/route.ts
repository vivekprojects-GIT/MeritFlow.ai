import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  createUniversity,
  getUniversityForAdmin,
  updateUniversity,
  LOGO_MAX_CHARS,
} from '@/lib/universities-store';

export const runtime = 'nodejs';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const university = await getUniversityForAdmin(user.id);
  return NextResponse.json({ university });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (await getUniversityForAdmin(user.id)) {
    return NextResponse.json({ error: 'Your university is already set up.' }, { status: 409 });
  }

  let name = '';
  let logoUrl: string | null = null;
  try {
    const body = (await req.json()) as { name?: unknown; logoUrl?: unknown };
    name = String(body.name ?? '').trim();
    if (typeof body.logoUrl === 'string' && body.logoUrl) logoUrl = body.logoUrl;
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  if (!name) return NextResponse.json({ error: 'University name is required.' }, { status: 400 });
  if (logoUrl && logoUrl.length > LOGO_MAX_CHARS) {
    return NextResponse.json({ error: 'Logo image is too large (max ~600 KB).' }, { status: 400 });
  }

  const university = await createUniversity(user.id, name, logoUrl);
  return NextResponse.json({ university });
}

export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const patch: { name?: string; logoUrl?: string | null } = {};
  try {
    const body = (await req.json()) as { name?: unknown; logoUrl?: unknown };
    if (typeof body.name === 'string') patch.name = body.name.trim();
    if ('logoUrl' in body) patch.logoUrl = body.logoUrl == null ? null : String(body.logoUrl);
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  if (patch.logoUrl && patch.logoUrl.length > LOGO_MAX_CHARS) {
    return NextResponse.json({ error: 'Logo image is too large (max ~600 KB).' }, { status: 400 });
  }

  const university = await updateUniversity(user.id, patch);
  if (!university) return NextResponse.json({ error: 'No university to update.' }, { status: 404 });
  return NextResponse.json({ university });
}
