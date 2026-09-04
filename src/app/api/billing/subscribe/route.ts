import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { activateSubscription, getBillingState, type Plan } from '@/lib/billing-store';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let plan: Plan = 'pro_monthly';
  try {
    const body = (await req.json()) as { plan?: unknown };
    if (body.plan === 'pro_yearly' || body.plan === 'pro_monthly') plan = body.plan;
  } catch {
    /* default monthly */
  }

  // Simulated checkout — in production this would follow a Stripe Checkout success webhook.
  await activateSubscription(user.id, plan);
  return NextResponse.json(await getBillingState(user.id));
}
