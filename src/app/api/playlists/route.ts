import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createPlaylist, listPlaylists } from '@/lib/courses-store';

export const runtime = 'nodejs';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ playlists: await listPlaylists(user.id) });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let name = '';
  try {
    const body = (await req.json()) as { name?: unknown };
    name = typeof body.name === 'string' ? body.name.trim() : '';
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (!name) return NextResponse.json({ error: 'Playlist name is required.' }, { status: 400 });
  const playlist = await createPlaylist(user.id, name);
  return NextResponse.json({ playlist });
}
