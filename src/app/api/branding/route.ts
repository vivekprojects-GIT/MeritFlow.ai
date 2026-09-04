import { NextResponse } from 'next/server';
import { getUniversityBySlug } from '@/lib/universities-store';

export const runtime = 'nodejs';

/** Public: resolve a university's display branding from its slug (for the login page). */
export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get('slug')?.trim();
  if (!slug) return NextResponse.json({ brand: null });
  const uni = await getUniversityBySlug(slug);
  return NextResponse.json({ brand: uni ? { name: uni.name, logoUrl: uni.logoUrl, slug: uni.slug } : null });
}
