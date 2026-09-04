'use client';

import { useEffect, useState } from 'react';

/**
 * Where a learner puts their own API keys.
 *
 * ## Why this screen exists
 *
 * Generation runs on the operator's Anthropic key and video search on their
 * SerpAPI key, so everyone spends one shared quota. When that quota ran out
 * here, courses kept generating but arrived with no videos and no cover art,
 * and no individual could do anything about it. A key of your own turns a
 * shared ceiling into one you control.
 *
 * ## Why the field is always empty
 *
 * A saved key is never sent back to the browser — the server keeps it
 * encrypted and returns only the last four characters, which is enough to
 * recognise which key is in the box and not enough to be worth stealing. So
 * the input starts blank even when a key is saved, and leaving it blank while
 * changing the model leaves the key alone. Replacing a key means typing a new
 * one; forgetting it is its own button.
 */

type KeyRow = { provider: 'anthropic' | 'serpapi'; present: boolean; hint: string; model: string; updatedAt: number };
type ModelRow = { id: string; label: string; note: string };
type Payload = {
  keys: KeyRow[];
  models: ModelRow[];
  fallback: { anthropic: boolean; serpapi: boolean; youtube: boolean };
};

const inputCls =
  'w-full rounded-xl border border-line bg-canvas px-3 py-2 font-mono text-sm text-ink outline-none transition placeholder:text-faint placeholder:font-sans focus:border-accent focus:ring-2 focus:ring-accent/20';

export function ApiKeySettings() {
  const [data, setData] = useState<Payload | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [model, setModel] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/settings/keys')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Payload | null) => {
        if (!alive || !d) return;
        setData(d);
        setModel(d.keys.find((k) => k.provider === 'anthropic')?.model ?? '');
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  if (!data) return null;

  const rowFor = (provider: KeyRow['provider']) => data.keys.find((k) => k.provider === provider);

  async function send(method: 'PUT' | 'DELETE', body: Record<string, unknown>, label: string) {
    setBusy(label);
    setNote(null);
    const res = await fetch('/api/settings/keys', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => null);
    setBusy(null);

    if (!res) return setNote({ kind: 'bad', text: 'Could not reach the server.' });

    const d = (await res.json().catch(() => ({}))) as { keys?: KeyRow[]; error?: string };
    if (!res.ok || d.error) return setNote({ kind: 'bad', text: d.error ?? 'That did not save.' });

    setData((prev) => (prev ? { ...prev, keys: d.keys ?? prev.keys } : prev));
    setDrafts({});
    setNote({ kind: 'ok', text: method === 'DELETE' ? 'Key removed.' : 'Saved.' });
  }

  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-base font-bold text-ink">Your API keys</h3>
        <p className="mt-1 text-sm text-muted">
          Optional. Supply your own and this app spends your quota instead of the shared one — which also means it
          keeps working when the shared quota runs out. Keys are encrypted before they are stored and are never sent
          back to your browser.
        </p>
      </div>

      {/* ── Anthropic: the key and what it is spent on ─────────────────── */}
      <div className="rounded-2xl border border-line bg-canvas p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h4 className="text-sm font-bold text-ink">Anthropic</h4>
          <span className="text-xs text-muted">
            {rowFor('anthropic')?.present
              ? `Saved · ${rowFor('anthropic')?.hint}`
              : data.fallback.anthropic
                ? 'Using the shared key'
                : 'Not configured — courses cannot be generated'}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted">Writes your courses. Get one at console.anthropic.com.</p>

        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={drafts.anthropic ?? ''}
          onChange={(e) => setDrafts((d) => ({ ...d, anthropic: e.target.value }))}
          placeholder={rowFor('anthropic')?.present ? 'Enter a new key to replace it' : 'sk-ant-...'}
          className={`mt-3 ${inputCls}`}
        />

        <label className="mt-3 block">
          <span className="text-xs font-semibold text-ink">Model</span>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="mt-1 w-full rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          >
            <option value="">Default ({data.models[0]?.label ?? 'Haiku 4.5'})</option>
            {data.models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} — {m.note}
              </option>
            ))}
          </select>
          {/* Said plainly, because the bill is theirs now. */}
          <span className="mt-1 block text-xs text-muted">
            A larger model writes better courses and costs more per course. Applies only to your own key.
          </span>
        </label>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void send('PUT', { provider: 'anthropic', secret: drafts.anthropic ?? '', model }, 'anthropic')}
            className="inline-flex h-9 items-center rounded-full bg-accent-fill px-4 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-40"
          >
            {busy === 'anthropic' ? 'Saving…' : 'Save'}
          </button>
          {rowFor('anthropic')?.present && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void send('DELETE', { provider: 'anthropic' }, 'anthropic-del')}
              className="inline-flex h-9 items-center rounded-full border border-line px-4 text-sm font-semibold text-muted transition hover:border-danger hover:text-danger disabled:opacity-40"
            >
              Forget this key
            </button>
          )}
        </div>
      </div>

      {/* ── SerpAPI ────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-line bg-canvas p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h4 className="text-sm font-bold text-ink">SerpAPI</h4>
          <span className="text-xs text-muted">
            {rowFor('serpapi')?.present
              ? `Saved · ${rowFor('serpapi')?.hint}`
              : data.fallback.serpapi
                ? 'Using the shared key'
                : 'Not configured — no videos or cover art'}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted">
          Finds lesson videos and course cover photos.
          {data.fallback.youtube
            ? ' Videos use the YouTube API here, so this key only affects cover art.'
            : ' With no YouTube key configured, video search falls back to this one.'}
        </p>

        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={drafts.serpapi ?? ''}
          onChange={(e) => setDrafts((d) => ({ ...d, serpapi: e.target.value }))}
          placeholder={rowFor('serpapi')?.present ? 'Enter a new key to replace it' : 'Your SerpAPI key'}
          className={`mt-3 ${inputCls}`}
        />

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void send('PUT', { provider: 'serpapi', secret: drafts.serpapi ?? '' }, 'serpapi')}
            className="inline-flex h-9 items-center rounded-full bg-accent-fill px-4 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-40"
          >
            {busy === 'serpapi' ? 'Saving…' : 'Save'}
          </button>
          {rowFor('serpapi')?.present && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void send('DELETE', { provider: 'serpapi' }, 'serpapi-del')}
              className="inline-flex h-9 items-center rounded-full border border-line px-4 text-sm font-semibold text-muted transition hover:border-danger hover:text-danger disabled:opacity-40"
            >
              Forget this key
            </button>
          )}
        </div>
      </div>

      {note && (
        <p role="status" className={`text-sm font-semibold ${note.kind === 'ok' ? 'text-accent' : 'text-danger'}`}>
          {note.text}
        </p>
      )}
    </section>
  );
}
