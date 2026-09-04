import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getGradebook, gradebookToCsv, gradebookFilename } from '@/lib/gradebook-store';

export const runtime = 'nodejs';

/** Class gradebook for the owning instructor. `?format=csv` downloads a CSV. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'instructor') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await ctx.params;
  const gradebook = await getGradebook(user.id, id);
  if (!gradebook) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const format = new URL(req.url).searchParams.get('format');
  if (format === 'csv') {
    const csv = gradebookToCsv(gradebook);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${gradebookFilename(gradebook)}"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  return NextResponse.json({ gradebook });
}
