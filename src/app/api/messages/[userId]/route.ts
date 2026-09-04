import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { canMessage, readThread } from '@/lib/messages-store';

export const runtime = 'nodejs';

/**
 * The full exchange with one person. Reading marks their messages to you as
 * read. Gated on sharing a class, so a stranger's id reveals nothing.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ userId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { userId } = await ctx.params;
  if (!(await canMessage(user.id, userId))) {
    return NextResponse.json({ error: 'You can only message people you share a class with.' }, { status: 403 });
  }

  return NextResponse.json({ messages: await readThread(user.id, userId) });
}
