import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getBillingState, purchaseItem } from '@/lib/billing-store';
import { isLibraryId } from '@/lib/library';

export const runtime = 'nodejs';

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  if (!isLibraryId(id)) return NextResponse.json({ error: 'Unknown course' }, { status: 404 });

  // Simulated one-time purchase.
  await purchaseItem(user.id, id);
  return NextResponse.json(await getBillingState(user.id));
}
