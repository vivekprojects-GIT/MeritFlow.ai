import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  createAssignment,
  listAssignmentsForInstructor,
  listAssignmentsForStudent,
} from '@/lib/assignments-store';

export const runtime = 'nodejs';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;

  if (user.role === 'instructor') {
    const assignments = await listAssignmentsForInstructor(user.id, id);
    if (assignments) return NextResponse.json({ view: 'instructor', assignments });
  }
  const assignments = await listAssignmentsForStudent(user.id, id);
  if (assignments) return NextResponse.json({ view: 'student', assignments });
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'instructor') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await ctx.params;

  let title = '';
  let instructions = '';
  let rubric = '';
  let points = 100;
  let dueAt: number | null = null;
  try {
    const body = (await req.json()) as {
      title?: unknown;
      instructions?: unknown;
      rubric?: unknown;
      points?: unknown;
      dueAt?: unknown;
    };
    title = String(body.title ?? '').trim();
    instructions = String(body.instructions ?? '');
    rubric = String(body.rubric ?? '');
    points = Number.isFinite(Number(body.points)) ? Math.max(0, Math.round(Number(body.points))) : 100;
    if (body.dueAt != null && Number.isFinite(Number(body.dueAt))) dueAt = Number(body.dueAt);
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  if (!title) return NextResponse.json({ error: 'A title is required.' }, { status: 400 });

  const assignment = await createAssignment(user.id, id, { title, instructions, rubric, points, dueAt });
  if (!assignment) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ assignment });
}
