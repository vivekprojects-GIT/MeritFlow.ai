import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { itemAnalysis } from '@/lib/item-analysis';
import { classPacing, classDigest } from '@/lib/pacing';

export const runtime = 'nodejs';

/**
 * Assessment quality, pacing, and the digest for one class.
 *
 * Instructor-only: these expose named learners and per-question answer
 * patterns, neither of which a student should see for their classmates.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  const db = await getDb();
  const owns = await db.query('SELECT 1 FROM classes WHERE id = $1 AND instructor_id = $2', [id, user.id]);
  if (owns.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [items, pacing, digest] = await Promise.all([itemAnalysis(id), classPacing(id), classDigest(id)]);
  return NextResponse.json({ items, pacing, digest });
}
