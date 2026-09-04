import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { gradeSubmission } from '@/lib/assignments-store';

export const runtime = 'nodejs';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'instructor') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await ctx.params;

  let studentId = '';
  let grade = 0;
  let feedback = '';
  try {
    const body = (await req.json()) as { studentId?: unknown; grade?: unknown; feedback?: unknown };
    studentId = String(body.studentId ?? '');
    grade = Math.max(0, Math.round(Number(body.grade ?? 0)));
    feedback = String(body.feedback ?? '');
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  if (!studentId) return NextResponse.json({ error: 'Missing student.' }, { status: 400 });

  const ok = await gradeSubmission(user.id, id, studentId, grade, feedback);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
