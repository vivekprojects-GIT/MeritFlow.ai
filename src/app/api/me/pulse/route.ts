import { NextResponse } from 'next/server';
import { learnerPulse } from '@/lib/analytics';
import { getCurrentUser } from '@/lib/auth';

export const runtime = 'nodejs';

/** The signed-in learner's own study pattern. Never anyone else's. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(await learnerPulse(user.id));
}
