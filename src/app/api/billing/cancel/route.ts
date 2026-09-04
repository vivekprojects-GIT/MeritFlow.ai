import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { cancelSubscription, getBillingState } from '@/lib/billing-store';

export const runtime = 'nodejs';

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await cancelSubscription(user.id);
  return NextResponse.json(await getBillingState(user.id));
}
