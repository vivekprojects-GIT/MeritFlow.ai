'use client';

import { useEffect, useRef, useState } from 'react';
import type { Material } from '@/lib/materials-store';
import { DownloadIcon, PlusIcon, TrashIcon } from './icons';

/**
 * Files a professor shares with a class — slides, readings, the source PDF.
 *
 * Students see and download; only the instructor uploads or removes, which the
 * server enforces regardless of what this component renders.
 */

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ClassMaterials({ classId, canManage = false }: { classId: string; canManage?: boolean }) {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function fetchMaterials(): Promise<Material[] | null> {
    try {
      const res = await fetch(`/api/classes/${classId}/materials`);
      if (!res.ok) return null;
      const data = (await res.json()) as { materials: Material[] };
      return data.materials ?? [];
    } catch {
      return null;
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await fetchMaterials();
      if (!cancelled && list) setMaterials(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [classId]);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/classes/${classId}/materials`, { method: 'POST', body: fd });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? 'Could not upload that file.');
        return;
      }
      const list = await fetchMaterials();
      if (list) setMaterials(list);
    } catch {
      setError('Could not upload that file.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function remove(id: string) {
    await fetch(`/api/materials/${id}`, { method: 'DELETE' });
    const list = await fetchMaterials();
    if (list) setMaterials(list);
  }

  return (
    <div className="space-y-3">
      {canManage && (
        <div>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="press ring-focus inline-flex items-center gap-2 rounded-full bg-accent-fill px-4 py-2 text-sm font-semibold text-canvas disabled:opacity-50"
          >
            <PlusIcon className="h-4 w-4" />
            {busy ? 'Uploading…' : 'Add material'}
          </button>
          <p className="mt-1.5 text-xs text-faint">PDF, slides, docs or images, up to 8 MB each.</p>
        </div>
      )}

      {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

      {materials.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-surface/60 px-4 py-8 text-center text-sm text-muted">
          {canManage
            ? 'No materials yet. Add the slides or readings your students need alongside the course.'
            : 'Your professor has not shared any files for this class yet.'}
        </p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
          {materials.map((m) => (
            <li key={m.id} className="flex items-center gap-3 bg-canvas px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">{m.name}</span>
                <span className="block text-xs text-muted">
                  {humanSize(m.sizeBytes)} · {new Date(m.createdAt).toLocaleDateString()} · {m.uploaderEmail}
                </span>
              </span>
              <a
                href={`/api/materials/${m.id}`}
                className="press ring-focus inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-accent hover:border-accent/40"
              >
                <DownloadIcon className="h-3.5 w-3.5" />
                Download
              </a>
              {canManage && (
                <button
                  onClick={() => void remove(m.id)}
                  className="ring-focus shrink-0 rounded-full border border-line p-1.5 text-faint hover:border-danger/40 hover:text-danger"
                  aria-label={`Remove ${m.name}`}
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
