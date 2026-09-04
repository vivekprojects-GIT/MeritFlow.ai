/**
 * Remote code execution via Wandbox (https://wandbox.org) — a free, key-less online
 * compiler/runtime that runs untrusted code server-side in isolation. We use it for the
 * compiled / less-common languages. Python & JavaScript stay in the browser (instant, no
 * quota); everything here routes to Wandbox.
 *
 * (We originally targeted the public Piston instance, but its /execute endpoint now
 *  requires auth — only /runtimes stays open — so Wandbox is the better free option.)
 */

const WANDBOX = 'https://wandbox.org/api';

/**
 * Languages we expose remotely.
 * - `language` matches Wandbox's compiler "language" field; we resolve the newest compiler.
 * - `transform` lets us massage source before sending (e.g. Java's single-file constraint).
 */
export const REMOTE_LANGS: Record<string, { language: string; label: string; transform?: (c: string) => string }> = {
  typescript: { language: 'TypeScript', label: 'TypeScript' },
  c: { language: 'C', label: 'C' },
  cpp: { language: 'C++', label: 'C++' },
  // Wandbox compiles Java in prog.java, so a top-level `public class` is rejected.
  // Dropping `public` keeps any beginner snippet runnable without changing behaviour.
  java: { language: 'Java', label: 'Java', transform: (c) => c.replace(/\bpublic\s+class\b/, 'class') },
  csharp: { language: 'C#', label: 'C#' },
  go: { language: 'Go', label: 'Go' },
  rust: { language: 'Rust', label: 'Rust' },
  ruby: { language: 'Ruby', label: 'Ruby' },
  php: { language: 'PHP', label: 'PHP' },
};

export type RunResult = { stdout: string; stderr: string; code: number };

type Compiler = { name: string; language: string };

let compilersCache: Promise<Compiler[]> | null = null;

function getCompilers(): Promise<Compiler[]> {
  if (!compilersCache) {
    compilersCache = fetch(`${WANDBOX}/list.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`Wandbox list ${r.status}`);
        return r.json() as Promise<Compiler[]>;
      })
      .catch((e) => {
        compilersCache = null; // allow retry
        throw e;
      });
  }
  return compilersCache;
}

/** Newest compiler name for a Wandbox language (the list is ordered newest-first). */
async function resolveCompiler(language: string): Promise<string | null> {
  const list = await getCompilers();
  const match = list.find((c) => c.language === language);
  return match ? match.name : null;
}

export function isRemoteLang(id: string): boolean {
  return id in REMOTE_LANGS;
}

export function remoteLanguageIds(): string[] {
  return Object.keys(REMOTE_LANGS);
}

/** Compile + run code on Wandbox. Throws on transport errors. */
export async function runRemote(id: string, code: string, stdin = ''): Promise<RunResult> {
  const def = REMOTE_LANGS[id];
  if (!def) throw new Error(`Unsupported language: ${id}`);

  const compiler = await resolveCompiler(def.language);
  if (!compiler) throw new Error(`No runtime available for ${def.label}.`);

  const source = def.transform ? def.transform(code) : code;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  let res: Response;
  try {
    res = await fetch(`${WANDBOX}/compile.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({ compiler, code: source, stdin }),
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) throw new Error(`Sandbox error (${res.status}).`);

  const data = (await res.json()) as {
    status?: string;
    compiler_error?: string;
    program_output?: string;
    program_error?: string;
  };

  const stderrParts: string[] = [];
  if (data.compiler_error && data.compiler_error.trim()) stderrParts.push(data.compiler_error);
  if (data.program_error && data.program_error.trim()) stderrParts.push(data.program_error);

  return {
    stdout: data.program_output ?? '',
    stderr: stderrParts.join('\n'),
    code: Number.parseInt(data.status ?? '0', 10) || 0,
  };
}
