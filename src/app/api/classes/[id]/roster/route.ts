import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { applyRoster, parseRosterCsv } from '@/lib/roster-sync';

export const runtime = 'nodejs';
export const maxDuration = 120;

/** 5 MB of CSV is on the order of 50,000 students — far beyond one class. */
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Import a roster from a SIS export.
 *
 * Instructor-only, and additive unless `reconcile=true` is passed — a
 * mis-exported file should not silently unenrol a class.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;

  let csv = '';
  let reconcile = false;
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (file instanceof File) {
      if (file.size > MAX_BYTES) {
        return NextResponse.json({ error: 'That file is too large (max 5 MB).' }, { status: 413 });
      }
      csv = await file.text();
    }
    reconcile = String(form.get('reconcile') ?? '') === 'true';
  } catch {
    return NextResponse.json({ error: 'Invalid upload.' }, { status: 400 });
  }

  if (!csv.trim()) return NextResponse.json({ error: 'No CSV file provided.' }, { status: 400 });

  const { rows, skipped } = parseRosterCsv(csv);
  if (rows.length === 0) {
    return NextResponse.json(
      { error: 'No usable rows found. The file needs a header row with an email column.', skipped },
      { status: 400 },
    );
  }

  const result = await applyRoster(user.id, id, rows, {
    reconcile,
    universityId: user.universityId ?? null,
  });
  if (!result) return NextResponse.json({ error: 'You do not own this class.' }, { status: 403 });

  return NextResponse.json({ ...result, skipped: [...skipped, ...result.skipped] });
}
