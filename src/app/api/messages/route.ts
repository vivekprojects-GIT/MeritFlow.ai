import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { listConversations, sendMessage, unreadCount } from '@/lib/messages-store';

export const runtime = 'nodejs';

/** The signed-in user's conversations, newest first, plus their unread total. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [conversations, unread] = await Promise.all([listConversations(user.id), unreadCount(user.id)]);
  return NextResponse.json({ conversations, unread });
}

/**
 * Send a direct message.
 *
 * The store enforces that sender and recipient share a class; a rejection is
 * reported as 403 rather than 404 so we never reveal whether a user id exists.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { to?: unknown; body?: unknown; classId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const to = String(body.to ?? '').trim();
  const text = String(body.body ?? '').trim();
  if (!to || !text) return NextResponse.json({ error: 'A recipient and a message are required.' }, { status: 400 });

  const message = await sendMessage(user.id, to, text, typeof body.classId === 'string' ? body.classId : null);
  if (!message) {
    return NextResponse.json(
      { error: 'You can only message people you share a class with.' },
      { status: 403 },
    );
  }
  return NextResponse.json({ message });
}
