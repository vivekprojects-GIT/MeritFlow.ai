import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  generateProfessorCode,
  getUniversityForAdmin,
  listProfessorCodes,
  revokeProfessorCode,
} from '@/lib/universities-store';

export const runtime = 'nodejs';

async function adminUniversityId(): Promise<{ id: string } | { res: NextResponse }> {
  const user = await getCurrentUser();
  if (!user) return { res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (user.role !== 'admin') return { res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  const uni = await getUniversityForAdmin(user.id);
  if (!uni) return { res: NextResponse.json({ error: 'Set up your university first.' }, { status: 409 }) };
  return { id: uni.id };
}

export async function GET() {
  const a = await adminUniversityId();
  if ('res' in a) return a.res;
  const codes = await listProfessorCodes(a.id);
  return NextResponse.json({ codes });
}

export async function POST(req: Request) {
  const a = await adminUniversityId();
  if ('res' in a) return a.res;
  let label = '';
  try {
    const body = (await req.json().catch(() => ({}))) as { label?: unknown };
    label = String(body.label ?? '');
  } catch {
    /* label optional */
  }
  const code = await generateProfessorCode(a.id, label);
  return NextResponse.json({ code });
}

export async function DELETE(req: Request) {
  const a = await adminUniversityId();
  if ('res' in a) return a.res;
  let code = '';
  try {
    const body = (await req.json()) as { code?: unknown };
    code = String(body.code ?? '');
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const ok = await revokeProfessorCode(a.id, code);
  if (!ok) return NextResponse.json({ error: 'Code not found or already used.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
