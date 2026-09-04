import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { enrollByEmailAndCode } from '@/lib/classes-store';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let email = '';
  let code = '';
  try {
    const body = (await req.json()) as { email?: unknown; code?: unknown };
    email = String(body.email ?? '').trim();
    code = String(body.code ?? '').trim();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  if (!email || !code) {
    return NextResponse.json({ error: 'Enter the professor’s email and the class code.' }, { status: 400 });
  }

  const result = await enrollByEmailAndCode(user.id, email, code);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 404 });
  return NextResponse.json(result);
}
