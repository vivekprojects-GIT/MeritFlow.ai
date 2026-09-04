import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createNotification, listNotifications, markNotificationsRead, type NotificationTone } from '@/lib/courses-store';

export const runtime = 'nodejs';

const TONES = new Set(['info', 'success', 'warning', 'error']);

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ notifications: await listNotifications(user.id) });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = (await req.json()) as { tone?: unknown; title?: unknown; message?: unknown; href?: unknown };
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) return NextResponse.json({ error: 'Title is required.' }, { status: 400 });
    const tone = typeof body.tone === 'string' && TONES.has(body.tone) ? (body.tone as NotificationTone) : 'info';
    const notification = await createNotification(user.id, {
      tone,
      title,
      message: typeof body.message === 'string' ? body.message : '',
      href: typeof body.href === 'string' ? body.href : '',
    });
    return NextResponse.json({ notification });
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let id: string | undefined;
  try {
    const body = (await req.json().catch(() => ({}))) as { id?: unknown };
    id = typeof body.id === 'string' ? body.id : undefined;
  } catch {
    id = undefined;
  }
  await markNotificationsRead(user.id, id);
  return NextResponse.json({ ok: true });
}
