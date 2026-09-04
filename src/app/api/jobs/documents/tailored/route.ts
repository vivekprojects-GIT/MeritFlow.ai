import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { readRunJson } from '@/lib/autopilot/state-machine';
import { resumeToDocx } from '@/lib/jobs/docx-template';
import type { ApplicationReceipt } from '@/lib/autopilot/adapters/types';

export const runtime = 'nodejs';

/**
 * The tailored documents, one per application.
 *
 * ## Why these were invisible
 *
 * The Documents tab listed what the candidate uploaded — one master résumé —
 * while forty-one applications had each gone out with a document written for
 * that specific posting. The only way to see what an employer actually
 * received was to know the receipt viewer existed. For "what did I send
 * Cohere?", this is the tab anyone would open first, so this is where those
 * documents belong.
 *
 * GET without an id lists them; GET with ?jobId= downloads that application's
 * résumé as the same .docx the employer received, rebuilt from the receipt's
 * verbatim document text.
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const jobId = new URL(req.url).searchParams.get('jobId');

  if (jobId) {
    const receipt = await readRunJson<ApplicationReceipt>(user.id, jobId, 'receipt');
    const text = receipt?.tailoring?.document;
    if (!text) return NextResponse.json({ error: 'No tailored document is stored for that application.' }, { status: 404 });
    const name = (receipt.resumeFileName ?? 'tailored-resume.docx').replace(/\.(pdf|docx?)$/i, '') + '.docx';
    return new NextResponse(new Uint8Array(resumeToDocx(text)), {
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'content-disposition': `attachment; filename="${name}"`,
      },
    });
  }

  const db = await getDb();
  const rows = await db.query<{
    job_id: string;
    company: string;
    title: string;
    ats: string;
    mode: string;
    submitted_at: number;
  }>(
    `SELECT job_id, company, title, ats, mode, submitted_at
       FROM application_archive
      WHERE user_id = $1 AND mode = 'SUBMITTED'
      ORDER BY submitted_at DESC LIMIT 100`,
    [user.id],
  );

  /* One row per job: re-runs archive again, and the newest snapshot is the
     one that matches what was last sent. */
  const seen = new Set<string>();
  const tailored = rows.rows.filter((r) => {
    if (seen.has(r.job_id)) return false;
    seen.add(r.job_id);
    return true;
  });

  return NextResponse.json({
    tailored: tailored.map((r) => ({
      jobId: r.job_id,
      company: r.company,
      title: r.title,
      ats: r.ats,
      mode: r.mode,
      submittedAt: r.submitted_at,
    })),
  });
}
