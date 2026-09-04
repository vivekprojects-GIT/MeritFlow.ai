'use client';

import { useMemo, useRef, useState, type KeyboardEvent, type UIEvent } from 'react';
import { CodeIcon, PlayIcon, RefreshIcon, TerminalIcon } from './icons';

/** Local languages run in the browser; everything else runs in the free Piston sandbox. */
export type RunLang = 'python' | 'javascript';
type Engine = 'pyodide' | 'jsworker' | 'remote';

const ENGINE: Record<string, Engine> = {
  python: 'pyodide',
  javascript: 'jsworker',
  typescript: 'remote',
  c: 'remote',
  cpp: 'remote',
  java: 'remote',
  csharp: 'remote',
  go: 'remote',
  rust: 'remote',
  ruby: 'remote',
  php: 'remote',
};

const LABEL: Record<string, string> = {
  python: 'Python',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  c: 'C',
  cpp: 'C++',
  java: 'Java',
  csharp: 'C#',
  go: 'Go',
  rust: 'Rust',
  ruby: 'Ruby',
  php: 'PHP',
};

function engineFor(id: string): Engine {
  return ENGINE[id] ?? 'remote';
}

/* ── Lightweight syntax highlighter (regex tokenizer, no deps) ───────────── */

const KEYWORDS = new Set(
  (
    'abstract as async await base bool boolean break byte case catch char class const continue ' +
    'def default defer do double elif else end enum export extends false final finally float fn for ' +
    'foreach from func function global goto if impl implements import in int interface is lambda let long ' +
    'match mod module mut namespace new nil none not null or override package pass private protected pub public ' +
    'raise readonly record ref return self short static str string struct super switch this throw trait true ' +
    'try type typeof union unsafe use using var virtual void volatile when where while with yield and'
  ).split(' '),
);

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Tokenize a snippet into safe, colorized HTML. Good enough for short editor content. */
function highlight(src: string, lang: string): string {
  const pyLike = lang === 'python' || lang === 'ruby';
  const n = src.length;
  let i = 0;
  let out = '';
  const push = (cls: string | null, txt: string) => {
    out += cls ? `<span class="${cls}">${esc(txt)}</span>` : esc(txt);
  };

  while (i < n) {
    const c = src[i];

    // comments
    if (!pyLike && c === '/' && src[i + 1] === '/') {
      let j = src.indexOf('\n', i);
      if (j < 0) j = n;
      push('tok-com', src.slice(i, j));
      i = j;
      continue;
    }
    if (!pyLike && c === '/' && src[i + 1] === '*') {
      let j = src.indexOf('*/', i + 2);
      j = j < 0 ? n : j + 2;
      push('tok-com', src.slice(i, j));
      i = j;
      continue;
    }
    if (pyLike && c === '#') {
      let j = src.indexOf('\n', i);
      if (j < 0) j = n;
      push('tok-com', src.slice(i, j));
      i = j;
      continue;
    }

    // strings
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < n) {
        if (src[j] === '\\') {
          j += 2;
          continue;
        }
        if (src[j] === c) {
          j++;
          break;
        }
        if (src[j] === '\n' && c !== '`') break;
        j++;
      }
      push('tok-str', src.slice(i, j));
      i = j;
      continue;
    }

    // numbers
    if (c >= '0' && c <= '9') {
      const m = /^(0[xX][0-9a-fA-F]+|\d[\d_]*\.?\d*(?:[eE][+-]?\d+)?)/.exec(src.slice(i));
      const t = m ? m[0] : c;
      push('tok-num', t);
      i += t.length;
      continue;
    }

    // identifiers / keywords / function calls
    if (/[A-Za-z_$]/.test(c)) {
      const id = /^[A-Za-z_$][\w$]*/.exec(src.slice(i))![0];
      let p = i + id.length;
      while (p < n && (src[p] === ' ' || src[p] === '\t')) p++;
      const cls = KEYWORDS.has(id) ? 'tok-key' : src[p] === '(' ? 'tok-bif' : null;
      push(cls, id);
      i += id.length;
      continue;
    }

    // punctuation
    if ('{}()[];:,.<>+-*/%=&|!?^~'.includes(c)) {
      push('tok-pun', c);
      i++;
      continue;
    }

    push(null, c);
    i++;
  }
  return out;
}

type OutLine = { kind: 'out' | 'err' | 'info'; text: string };

const PYODIDE_VERSION = 'v0.26.4';
const PYODIDE_BASE = `https://cdn.jsdelivr.net/pyodide/${PYODIDE_VERSION}/full/`;

/* ── Python runtime (Pyodide, loaded once, lazily, from CDN) ─────────────── */

type PyodideLike = {
  setStdout: (o: { batched: (s: string) => void }) => void;
  setStderr: (o: { batched: (s: string) => void }) => void;
  setStdin: (o: { stdin: () => string }) => void;
  runPythonAsync: (code: string) => Promise<unknown>;
};

declare global {
  interface Window {
    loadPyodide?: (opts: { indexURL: string }) => Promise<PyodideLike>;
    __courseaiPyodide?: Promise<PyodideLike>;
  }
}

function loadPyodideOnce(): Promise<PyodideLike> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (!window.__courseaiPyodide) {
    window.__courseaiPyodide = (async () => {
      if (!window.loadPyodide) {
        await new Promise<void>((resolve, reject) => {
          const s = document.createElement('script');
          s.src = `${PYODIDE_BASE}pyodide.js`;
          s.onload = () => resolve();
          s.onerror = () => reject(new Error('Failed to load the Python runtime.'));
          document.head.appendChild(s);
        });
      }
      if (!window.loadPyodide) throw new Error('Python runtime unavailable.');
      return window.loadPyodide({ indexURL: PYODIDE_BASE });
    })();
  }
  return window.__courseaiPyodide;
}

/* ── JavaScript runtime (sandboxed Web Worker with a hard timeout) ───────── */

function runJavaScript(code: string, onLine: (l: OutLine) => void): Promise<void> {
  return new Promise((resolve) => {
    const workerSrc = `
      self.onmessage = (e) => {
        const send = (kind, args) => self.postMessage({ kind, text: args.map(a => {
          try { return typeof a === 'object' ? JSON.stringify(a) : String(a); } catch { return String(a); }
        }).join(' ') });
        const log = (...a) => send('out', a);
        const err = (...a) => send('err', a);
        const console = { log, info: log, debug: log, warn: err, error: err };
        try {
          const fn = new Function('console', e.data);
          const r = fn(console);
          if (r !== undefined) send('out', [r]);
          self.postMessage({ kind: 'done' });
        } catch (ex) {
          self.postMessage({ kind: 'err', text: (ex && ex.stack) ? String(ex.stack) : String(ex) });
          self.postMessage({ kind: 'done' });
        }
      };
    `;
    let worker: Worker;
    try {
      const url = URL.createObjectURL(new Blob([workerSrc], { type: 'application/javascript' }));
      worker = new Worker(url);
    } catch {
      onLine({ kind: 'err', text: 'Could not start the JavaScript sandbox.' });
      resolve();
      return;
    }
    const timeout = setTimeout(() => {
      worker.terminate();
      onLine({ kind: 'err', text: 'Execution timed out after 5 seconds (possible infinite loop).' });
      resolve();
    }, 5000);
    worker.onmessage = (e: MessageEvent<{ kind: string; text?: string }>) => {
      const d = e.data;
      if (d.kind === 'done') {
        clearTimeout(timeout);
        worker.terminate();
        resolve();
      } else if (d.kind === 'out' || d.kind === 'err') {
        onLine({ kind: d.kind, text: d.text ?? '' });
      }
    };
    worker.postMessage(code);
  });
}

/* ── The editor + console ────────────────────────────────────────────────── */

export function CodePlayground({
  initialCode,
  language = 'python',
  heightClass = 'h-72',
}: {
  initialCode: string;
  language?: string;
  heightClass?: string;
}) {
  const engine = engineFor(language);
  const isRemote = engine === 'remote';

  const [code, setCode] = useState(initialCode);
  const [stdin, setStdin] = useState('');
  const [showStdin, setShowStdin] = useState(false);
  const [output, setOutput] = useState<OutLine[]>([]);
  const [running, setRunning] = useState(false);
  const [statusLabel, setStatusLabel] = useState('Run');
  const taRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const preRef = useRef<HTMLPreElement>(null);

  const lineCount = useMemo(() => Math.max(1, code.split('\n').length), [code]);
  const highlighted = useMemo(() => highlight(code, language), [code, language]);

  function syncScroll(e: UIEvent<HTMLTextAreaElement>) {
    const { scrollTop, scrollLeft } = e.currentTarget;
    if (gutterRef.current) gutterRef.current.scrollTop = scrollTop;
    if (preRef.current) {
      preRef.current.scrollTop = scrollTop;
      preRef.current.scrollLeft = scrollLeft;
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = e.currentTarget;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const next = code.slice(0, start) + '  ' + code.slice(end);
      setCode(next);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 2;
      });
    }
  }

  async function run() {
    if (running) return;
    setRunning(true);
    setOutput([]);
    const push = (l: OutLine) => setOutput((prev) => [...prev, l]);

    try {
      if (engine === 'jsworker') {
        setStatusLabel('Running…');
        await runJavaScript(code, push);
        return;
      }

      if (engine === 'pyodide') {
        setStatusLabel(window.__courseaiPyodide ? 'Running…' : 'Loading Python…');
        const py = await loadPyodideOnce();
        setStatusLabel('Running…');
        py.setStdout({ batched: (s) => push({ kind: 'out', text: s }) });
        py.setStderr({ batched: (s) => push({ kind: 'err', text: s }) });
        py.setStdin({ stdin: () => (stdin ? stdin : window.prompt('Program input (input()):') ?? '') });
        await py.runPythonAsync(code);
        return;
      }

      // Remote (Piston) via our API.
      setStatusLabel('Running in sandbox…');
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language, code, stdin }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        stdout?: string;
        stderr?: string;
        code?: number;
        error?: string;
      };
      if (!res.ok) {
        push({ kind: 'err', text: data.error ?? 'The sandbox is unavailable right now.' });
        return;
      }
      if (data.stdout) push({ kind: 'out', text: data.stdout.replace(/\n$/, '') });
      if (data.stderr) push({ kind: 'err', text: data.stderr.replace(/\n$/, '') });
      if (!data.stdout && !data.stderr) push({ kind: 'info', text: '(no output)' });
      if (typeof data.code === 'number' && data.code !== 0) {
        push({ kind: 'info', text: `exit code ${data.code}` });
      }
    } catch (err) {
      push({ kind: 'err', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setRunning(false);
      setStatusLabel('Run');
    }
  }

  function reset() {
    setCode(initialCode);
    setOutput([]);
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-[#0d0d13] shadow-soft">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2">
        <CodeIcon className="h-4 w-4 text-accent" />
        <span className="font-mono text-xs font-semibold text-zinc-200">{LABEL[language] ?? language}</span>
        <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
          {isRemote ? 'cloud sandbox' : 'in your browser'}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {isRemote && (
            <button
              onClick={() => setShowStdin((v) => !v)}
              className={[
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                showStdin ? 'bg-white/10 text-zinc-200' : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200',
              ].join(' ')}
            >
              Input
            </button>
          )}
          <button
            onClick={reset}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-200"
          >
            <RefreshIcon className="h-3.5 w-3.5" />
            Reset
          </button>
          <button
            onClick={run}
            disabled={running}
            className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1 text-xs font-semibold text-canvas transition-all hover:brightness-110 disabled:opacity-50"
          >
            <PlayIcon className="h-3 w-3" />
            {running ? statusLabel : 'Run'}
          </button>
        </div>
      </div>

      {/* Editor */}
      <div className={['flex', heightClass].join(' ')}>
        <div
          ref={gutterRef}
          aria-hidden
          className="thin-scroll select-none overflow-hidden bg-black/30 px-3 pt-3 text-right font-mono text-[13px] leading-6 text-zinc-600"
        >
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <div className="relative flex-1 overflow-hidden">
          {/* Highlighted layer (sits behind the transparent textarea, kept perfectly aligned) */}
          <pre
            ref={preRef}
            aria-hidden
            className="thin-scroll pointer-events-none absolute inset-0 m-0 overflow-auto whitespace-pre px-3 pb-3 pt-3 font-mono text-[13px] leading-6 text-zinc-100 [tab-size:2]"
          >
            <code dangerouslySetInnerHTML={{ __html: highlighted || '​' }} />
          </pre>
          <textarea
            ref={taRef}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onScroll={syncScroll}
            onKeyDown={onKeyDown}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            wrap="off"
            className="thin-scroll absolute inset-0 h-full w-full resize-none overflow-auto whitespace-pre bg-transparent px-3 pb-3 pt-3 font-mono text-[13px] leading-6 text-transparent caret-accent [tab-size:2] focus:outline-none"
          />
        </div>
      </div>

      {/* Optional stdin for sandbox languages */}
      {isRemote && showStdin && (
        <div className="border-t border-white/10 px-3 py-2">
          <label className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Input (stdin)</label>
          <textarea
            value={stdin}
            onChange={(e) => setStdin(e.target.value)}
            rows={2}
            placeholder="Lines here are fed to the program's standard input…"
            className="thin-scroll mt-1 w-full resize-none rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-[12.5px] text-zinc-200 placeholder:text-zinc-600 focus:border-accent/50 focus:outline-none"
          />
        </div>
      )}

      {/* Console */}
      <div className="border-t border-white/10">
        <div className="flex items-center gap-2 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
          <TerminalIcon className="h-3.5 w-3.5" />
          Output
          {output.length > 0 && (
            <button onClick={() => setOutput([])} className="ml-auto text-zinc-500 hover:text-zinc-300">
              Clear
            </button>
          )}
        </div>
        <div className="thin-scroll max-h-44 overflow-auto px-3 pb-3 font-mono text-[12.5px] leading-relaxed">
          {output.length === 0 ? (
            <p className="text-zinc-600">{running ? 'Working…' : 'Run your code to see the output here.'}</p>
          ) : (
            output.map((l, i) => (
              <pre
                key={i}
                className={[
                  'whitespace-pre-wrap',
                  l.kind === 'err' ? 'text-red-400' : l.kind === 'info' ? 'text-zinc-500' : 'text-zinc-200',
                ].join(' ')}
              >
                {l.text}
              </pre>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/** Map a code-example language label to a runnable in-browser language for lesson editors. */
export function toRunLang(label: string | undefined): RunLang {
  const l = (label ?? '').toLowerCase();
  if (l.includes('js') || l.includes('javascript') || l.includes('node') || l.includes('typescript') || l === 'ts') {
    return 'javascript';
  }
  return 'python';
}
