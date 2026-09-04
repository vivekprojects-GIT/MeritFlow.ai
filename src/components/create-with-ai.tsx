'use client';

import { useRef, useState, type ChangeEvent } from 'react';
import { Modal } from './modal';
import { Button } from './button';

type Tab = 'document' | 'prompt';
type Level = 'Beginner' | 'Intermediate' | 'Advanced';

export type GeneratedClass = { id: string; joinCode: string; expiresAt?: number; title: string };

const inputCls =
  'ring-focus mt-1.5 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none';

function LevelPicker({ level, setLevel }: { level: Level; setLevel: (l: Level) => void }) {
  return (
    <div>
      <span className="text-xs font-semibold uppercase tracking-wider text-faint">Level</span>
      <div className="mt-1.5 flex gap-1.5">
        {(['Beginner', 'Intermediate', 'Advanced'] as const).map((lv) => (
          <button
            key={lv}
            type="button"
            onClick={() => setLevel(lv)}
            aria-pressed={level === lv}
            className={[
              'press ring-focus rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
              level === lv ? 'bg-accent text-canvas' : 'border border-line text-muted hover:border-accent/40 hover:text-ink',
            ].join(' ')}
          >
            {lv}
          </button>
        ))}
      </div>
    </div>
  );
}

function LanguageField({ language, setLanguage }: { language: string; setLanguage: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wider text-faint">Course language</span>
      <input
        value={language}
        onChange={(e) => setLanguage(e.target.value)}
        placeholder="English, Spanish, Hindi, Tamil..."
        className={inputCls}
      />
    </label>
  );
}

/**
 * Two AI ways for a professor to create a course — from an uploaded document, or by
 * describing it — both published as a class students can join. Generation activates
 * once a real AI key is configured (handled gracefully until then).
 */
export function CreateWithAI({ onClose, onCreated }: { onClose: () => void; onCreated: (c: GeneratedClass) => void }) {
  const [tab, setTab] = useState<Tab>('document');
  const [docText, setDocText] = useState('');
  const [docName, setDocName] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [level, setLevel] = useState<Level>('Beginner');
  const [language, setLanguage] = useState('English');
  const [busy, setBusy] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsKey, setNeedsKey] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setError(null);
    if (f.size > 12_000_000) {
      setError('That file is too large (max 12 MB).');
      return;
    }
    setParsing(true);
    try {
      const fd = new FormData();
      fd.append('file', f);
      const res = await fetch('/api/parse-document', { method: 'POST', body: fd });
      const data = (await res.json()) as { text?: string; error?: string };
      if (!res.ok || !data.text) throw new Error(data.error ?? 'Could not read that file.');
      setDocText(data.text);
      setDocName(f.name);
      if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that file.');
    } finally {
      setParsing(false);
    }
  }

  async function generate() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNeedsKey(false);
    try {
      const body =
        tab === 'document'
          ? { mode: 'document', documentText: docText, title, level, language: language.trim() }
          : { mode: 'prompt', prompt, level, language: language.trim() };
      const res = await fetch('/api/classes/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { id?: string; joinCode?: string; expiresAt?: number; title?: string; error?: string; needsKey?: boolean };
      if (res.status === 503 && data.needsKey) {
        setNeedsKey(true);
        setError(data.error ?? 'AI generation needs an API key.');
        return;
      }
      if (!res.ok || !data.id) throw new Error(data.error ?? 'Could not generate the course.');
      onCreated({ id: data.id, joinCode: data.joinCode ?? '', expiresAt: data.expiresAt, title: data.title ?? 'New course' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate the course.');
    } finally {
      setBusy(false);
    }
  }

  const canGenerate = tab === 'document' ? docText.trim().length >= 40 : prompt.trim().length > 3;

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      eyebrow="Create with AI"
      title="Generate a course"
      subtitle="Turn a document or a sentence into a full course, published to your class for students to join."
      footer={
        <div className="flex items-center justify-between gap-2">
          <span className="hidden text-xs text-faint sm:inline">AI builds the modules, lessons, quizzes &amp; videos.</span>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={generate} disabled={busy || !canGenerate}>
              {busy ? 'Generating…' : 'Generate course'}
            </Button>
          </div>
        </div>
      }
    >
      {/* Two options */}
      <div className="grid grid-cols-2 gap-1.5 rounded-2xl border border-line bg-canvas p-1.5">
        {(['document', 'prompt'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setTab(t);
              setError(null);
              setNeedsKey(false);
            }}
            aria-pressed={tab === t}
            className={[
              'press ring-focus rounded-xl px-3 py-2 text-sm font-semibold transition-colors',
              tab === t ? 'bg-accent-fill text-canvas' : 'text-muted hover:bg-mint hover:text-ink',
            ].join(' ')}
          >
            {t === 'document' ? 'From a document' : 'Describe it'}
          </button>
        ))}
      </div>

      {tab === 'document' ? (
        <div className="mt-5 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx,.txt,.md,.markdown,.csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
              onChange={onFile}
              className="hidden"
            />
            <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} disabled={parsing}>
              {parsing ? 'Reading…' : 'Upload PDF, Word, or text'}
            </Button>
            {docName && !parsing && (
              <span className="text-xs text-muted">
                {docName} · {docText.length.toLocaleString()} chars
              </span>
            )}
          </div>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wider text-faint">Document text</span>
            <textarea
              value={docText}
              onChange={(e) => setDocText(e.target.value)}
              rows={8}
              placeholder="Paste your syllabus, lecture notes, or any document text here, the AI turns it into a structured course."
              className={[inputCls, 'resize-y leading-relaxed'].join(' ')}
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wider text-faint">Course title (optional)</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Intro to Thermodynamics" className={inputCls} />
          </label>
          <LevelPicker level={level} setLevel={setLevel} />
          <LanguageField language={language} setLanguage={setLanguage} />
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wider text-faint">What should the course teach?</span>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              placeholder="e.g. A beginner course on the basics of macroeconomics for first-year students"
              className={[inputCls, 'resize-y leading-relaxed'].join(' ')}
            />
          </label>
          <LevelPicker level={level} setLevel={setLevel} />
          <LanguageField language={language} setLanguage={setLanguage} />
        </div>
      )}

      {needsKey ? (
        <div className="mt-4 rounded-xl border border-accent/30 bg-accent/[0.05] px-4 py-3 text-sm text-ink/80">
          <p className="font-semibold text-accent">AI generation needs an API key</p>
          <p className="mt-1">{error}</p>
        </div>
      ) : error ? (
        <p className="mt-4 text-sm text-red-500">{error}</p>
      ) : (
        <p className="mt-4 text-[11px] leading-relaxed text-faint">
          You&rsquo;ll land in the editor to review, tweak, and lock sections before students see it. Everything you change
          is reflected to joined students live.
        </p>
      )}
    </Modal>
  );
}
