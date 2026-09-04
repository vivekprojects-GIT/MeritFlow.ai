import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { announceToClass } from '@/lib/messages-store';

export const runtime = 'nodejs';

/**
 * Announce to a whole class. The store only fans out when the caller is that
 * class's instructor, so ownership is enforced in the same query that reads the
 * roster rather than in a separate check that could drift.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  let body: { body?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const text = String(body.body ?? '').trim();
  if (!text) return NextResponse.json({ error: 'Write something to announce.' }, { status: 400 });

  const sent = await announceToClass(user.id, id, text);
  if (sent === 0) {
    return NextResponse.json(
      { error: 'Nothing was sent — either you do not own this class, or nobody is enrolled yet.' },
      { status: 403 },
    );
  }
  return NextResponse.json({ ok: true, sent });
}
