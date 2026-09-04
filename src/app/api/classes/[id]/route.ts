import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { deleteClass, getClassWithRoster, setExamOpen } from '@/lib/classes-store';

export const runtime = 'nodejs';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'instructor') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await ctx.params;
  const data = await getClassWithRoster(user.id, id);
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'instructor') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await ctx.params;

  let examOpen: boolean | undefined;
  try {
    const body = (await req.json()) as { examOpen?: unknown };
    if (typeof body.examOpen === 'boolean') examOpen = body.examOpen;
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  if (typeof examOpen !== 'boolean') {
    return NextResponse.json({ error: 'examOpen (boolean) required.' }, { status: 400 });
  }
  const ok = await setExamOpen(user.id, id, examOpen);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true, examOpen });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'instructor') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await ctx.params;
  const ok = await deleteClass(user.id, id);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
