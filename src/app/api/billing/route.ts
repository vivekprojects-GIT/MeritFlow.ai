import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getBillingState } from '@/lib/billing-store';

export const runtime = 'nodejs';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(await getBillingState(user.id));
}
