import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { saveCandidateProfile, type Track } from '@/lib/jobs-store';
import { isLearner } from '../route';

export const runtime = 'nodejs';
export const maxDuration = 60;

const TRACKS: Track[] = ['internship', 'co_op', 'new_grad', 'entry_level', 'full_time', 'contract'];

/** Save the Candidate Digital Twin. Accepts JSON, or multipart with a résumé. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isLearner(user.role)) return NextResponse.json({ error: 'Not available for this account type.' }, { status: 403 });

  const contentType = req.headers.get('content-type') ?? '';
  let body: Record<string, unknown> = {};
  let resumeText = '';
  let resumeName = '';

  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData();
    const file = form.get('resume');
    const json = form.get('json');
    if (typeof json === 'string') {
      try {
        body = JSON.parse(json) as Record<string, unknown>;
      } catch {
        return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
      }
    }
    if (file instanceof File) {
      if (file.size > 4 * 1024 * 1024) {
        return NextResponse.json({ error: 'That résumé is too large (max 4 MB).' }, { status: 413 });
      }
      resumeName = file.name;
      try {
        resumeText = await extractText(file);
      } catch {
        return NextResponse.json({ error: 'Could not read that file. PDF, DOCX or TXT please.' }, { status: 400 });
      }
      if (!resumeText.trim()) {
        return NextResponse.json({ error: 'No text found in that file — is it a scanned image?' }, { status: 400 });
      }
    }
  } else {
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
    }
  }

  const strings = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map((s) => s.trim()).filter(Boolean) : [];

  const patch: Parameters<typeof saveCandidateProfile>[1] = {};
  if (typeof body.careerStage === 'string') patch.careerStage = body.careerStage;
  if (Array.isArray(body.targetRoles)) patch.targetRoles = strings(body.targetRoles);
  if (Array.isArray(body.locations)) patch.locations = strings(body.locations);
  if (Array.isArray(body.skills)) patch.skills = strings(body.skills);
  if (body.minComp === null) patch.minComp = null;
  else if (typeof body.minComp === 'number' && Number.isFinite(body.minComp)) patch.minComp = Math.max(0, Math.round(body.minComp));
  if (Array.isArray(body.tracks)) {
    patch.tracks = body.tracks
      .filter((t): t is { type: Track; weight: number } => typeof t === 'object' && t !== null)
      .filter((t) => TRACKS.includes(t.type))
      .map((t) => ({ type: t.type, weight: Math.max(0, Math.min(1, Number(t.weight) || 0)) }));
  }
  if (resumeText) {
    patch.resumeText = resumeText;
    patch.resumeName = resumeName;
  }

  const profile = await saveCandidateProfile(user.id, patch);
  /* The extracted text is the evidence base for every score, but it is also the
     user's whole CV — returned as a length, not a body, so it is never echoed
     back through a log or a browser cache. */
  return NextResponse.json({ profile: { ...profile, resumeText: '' }, resumeChars: profile.resumeText.length });
}

/** Reuses the same extractors the course builder already uses for uploads. */
async function extractText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const buf = Buffer.from(await file.arrayBuffer());

  if (name.endsWith('.pdf')) {
    const { extractText: pdfText, getDocumentProxy } = await import('unpdf');
    const doc = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await pdfText(doc, { mergePages: true });
    return String(text);
  }
  if (name.endsWith('.docx')) {
    const mammoth = await import('mammoth');
    /*
     * Converted to HTML rather than raw text.
     *
     * `extractRawText` drops soft line breaks, so a résumé whose name and
     * headline sit on two lines of one paragraph — which is how almost every
     * template sets a header — comes back as "SAI VIVEK KATKURIPL/SQL
     * DEVELOPER", with the words run together and no separator to recover.
     * The HTML keeps `<br>` and `<p>`, which is exactly the information that
     * was being lost.
     */
    const { value: html } = await mammoth.convertToHtml({ buffer: buf });
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
      .replace(/<li[^>]*>/gi, '- ')
      .replace(/<[^>]+>/g, '')
      /* Entities, in this order: ampersand last, or the others double-decode. */
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
  return buf.toString('utf8');
}
