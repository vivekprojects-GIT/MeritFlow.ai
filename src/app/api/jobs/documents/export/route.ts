import { getCurrentUser } from '@/lib/auth';
import { getDocument } from '@/lib/jobs/documents';
import { getProfile } from '@/lib/profile-store';
import { textToPdf, type PdfFont } from '@/lib/jobs/pdf';
import { toLatex } from '@/lib/jobs/latex';
import { resumeToText } from '@/lib/jobs/resume-schema';

export const runtime = 'nodejs';

/**
 * Download a document as PDF, LaTeX source, or plain text.
 *
 * PDF is generated server-side rather than in the browser so the file an
 * employer receives is byte-identical to the one attached by Autopilot — two
 * renderers would eventually disagree, and the candidate would have no way to
 * tell which version was sent.
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const url = new URL(req.url);
  const id = url.searchParams.get('id') ?? '';
  const format = url.searchParams.get('format') ?? 'pdf';

  const doc = await getDocument(user.id, id);
  if (!doc) return new Response('Not found', { status: 404 });

  /* Rendered from the structured document when there is one, so what an
     employer opens matches what the editor showed — the flattened text is a
     derived copy and would drift the moment either changed. */
  const content = doc.structured ? resumeToText(doc.structured) : doc.body;

  const base = doc.name.replace(/[^\w\s-]/g, '').trim() || 'document';
  const disposition = (ext: string) => `attachment; filename="${base}.${ext}"`;

  if (format === 'tex') {
    const profile = await getProfile(user.id);
    const tex = toLatex(content, {
      name: doc.structured?.contact.name || profile?.name || '',
      email: doc.structured?.contact.email || profile?.email || '',
      phone: doc.structured?.contact.phone || profile?.phone || '',
      website: doc.structured?.contact.website || profile?.website || '',
      fontSize: doc.fontSize,
    });
    return new Response(tex, {
      headers: { 'Content-Type': 'application/x-tex; charset=utf-8', 'Content-Disposition': disposition('tex') },
    });
  }

  if (format === 'txt') {
    return new Response(content, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': disposition('txt') },
    });
  }

  const font: PdfFont = doc.font === 'serif' ? 'serif' : doc.font === 'mono' ? 'mono' : 'sans';
  const pdf = textToPdf(content, {
    font,
    fontSize: doc.fontSize,
    /* The compact template is tighter leading, which is the only thing that
       distinguishes it in the preview too. */
    lineHeight: doc.template === 'compact' ? 1.18 : 1.35,
  });

  return new Response(new Uint8Array(pdf), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': disposition('pdf') },
  });
}
