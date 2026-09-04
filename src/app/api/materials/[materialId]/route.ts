import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { deleteMaterial, getMaterialData } from '@/lib/materials-store';

export const runtime = 'nodejs';

/**
 * Download a material. Decoded server-side so the browser gets real bytes with
 * a filename, rather than the client having to handle a data URL.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ materialId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { materialId } = await ctx.params;
  const material = await getMaterialData(user.id, materialId);
  if (!material) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const base64 = material.dataUrl.split(',')[1] ?? '';
  const bytes = Buffer.from(base64, 'base64');
  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': material.mimeType || 'application/octet-stream',
      /* Quote the filename: unquoted names break on spaces. */
      'Content-Disposition': `attachment; filename="${material.name.replace(/"/g, '')}"`,
      'Content-Length': String(bytes.length),
    },
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ materialId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { materialId } = await ctx.params;
  const ok = await deleteMaterial(user.id, materialId);
  if (!ok) return NextResponse.json({ error: 'Only the class instructor can remove materials.' }, { status: 403 });
  return NextResponse.json({ ok: true });
}
