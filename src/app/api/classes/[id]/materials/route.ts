import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { addMaterial, listMaterials, MATERIAL_MAX_BYTES } from '@/lib/materials-store';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Materials for a class. Any member may read. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  const materials = await listMaterials(user.id, id);
  if (materials === null) return NextResponse.json({ error: 'You are not in this class.' }, { status: 403 });
  return NextResponse.json({ materials });
}

/** Publish a file. Instructor only — enforced in the store. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;

  let file: File | null = null;
  let description = '';
  try {
    const form = await req.formData();
    const f = form.get('file');
    if (f instanceof File) file = f;
    description = String(form.get('description') ?? '');
  } catch {
    return NextResponse.json({ error: 'Invalid upload.' }, { status: 400 });
  }
  if (!file) return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
  if (file.size > MATERIAL_MAX_BYTES) {
    return NextResponse.json({ error: 'That file is too large (max 8 MB).' }, { status: 413 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || 'application/octet-stream';
  const dataUrl = `data:${mimeType};base64,${buf.toString('base64')}`;

  const materialId = await addMaterial(user.id, id, {
    name: file.name,
    description,
    mimeType,
    sizeBytes: file.size,
    dataUrl,
  });
  if (!materialId) {
    return NextResponse.json({ error: 'Only the class instructor can publish materials.' }, { status: 403 });
  }
  return NextResponse.json({ id: materialId });
}
