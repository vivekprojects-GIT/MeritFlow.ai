import { getCurrentUser } from '@/lib/auth';
import { getGradebook } from '@/lib/gradebook-store';
import { gradesToCsv } from '@/lib/roster-sync';

export const runtime = 'nodejs';

/**
 * Grade passback file for the registrar.
 *
 * Returns CSV rather than JSON because the consumer is a SIS import, not a
 * browser fetch — every SIS ingests CSV, while their write APIs are all
 * different.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  /* Instructor-scoped: returns null for anyone else's class. */
  const gradebook = await getGradebook(user.id, id);
  if (!gradebook) return Response.json({ error: 'Not found' }, { status: 404 });

  const csv = gradesToCsv(
    gradebook.rows.map((row) => ({
      email: row.email,
      overallPct: row.overallPct,
      examPct: row.examPct,
      progressPct: row.progressPct,
    })),
  );

  const safeName = gradebook.title.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'class';
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${safeName}-grades.csv"`,
    },
  });
}
