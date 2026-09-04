import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { listReplies, reply, setPinned } from '@/lib/discussions-store';

export const runtime = 'nodejs';

export async function GET(_req: Request, ctx: { params: Promise<{ topicId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { topicId } = await ctx.params;
  return NextResponse.json({ replies: await listReplies(topicId, user.id) });
}

/** Reply to a topic, or (instructor) pin it. */
export async function POST(req: Request, ctx: { params: Promise<{ topicId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { topicId } = await ctx.params;
  let body: { body?: unknown; pinned?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (typeof body.pinned === 'boolean') {
    const ok = await setPinned(user.id, topicId, body.pinned);
    if (!ok) return NextResponse.json({ error: 'Only the instructor can pin topics.' }, { status: 403 });
    return NextResponse.json({ ok: true });
  }

  const ok = await reply(user.id, topicId, String(body.body ?? ''));
  if (!ok) return NextResponse.json({ error: 'Could not post that reply.' }, { status: 403 });
  return NextResponse.json({ ok: true });
}
