'use client';

import { CodeIcon } from './icons';

/**
 * Lesson body rendering, with code kept as code.
 *
 * The bug this fixes: section bodies were split on blank lines and every chunk
 * rendered as a `<p>`. HTML collapses single newlines into spaces, so a Python
 * function stored correctly in the database arrived on screen as one run-on
 * sentence — `def llm_node(state: AgentState) -> dict: messages =
 * state["messages"] response = client.chat.completions.create(...)`. The
 * newlines were never lost; they were rendered away.
 *
 * So the body is parsed into blocks first, and code blocks render inside a
 * `<pre>` where whitespace is significant.
 *
 * Detection handles two cases, because the model produces both:
 *
 *  1. **Fenced** — ```python … ``` — unambiguous, handled first.
 *  2. **Unfenced** — a bare block that is plainly source. This is the case in
 *     the reported bug, and ignoring it would leave the exact symptom in place.
 *     The heuristic is deliberately conservative: prose misread as code is a
 *     visible, ugly failure, so a block must look like code on more than one
 *     signal before it is treated as such.
 */

type Block = { kind: 'prose'; text: string } | { kind: 'code'; lang: string; text: string };

/** Signals that a line is source rather than a sentence. */
const CODE_LINE = [
  /^\s*(async\s+)?def\s+\w+\s*\(/,
  /^\s*class\s+\w+/,
  /^\s*(import|from)\s+[\w.]+/,
  /^\s*(const|let|var|function|export|return)\s/,
  /^\s*(if|for|while|elif|else|try|except|finally|with)\b.*:\s*$/,
  /^\s*[\w.]+\s*=\s*[^=]/,
  /^\s*(await|yield)\s/,
  /^\s*[)\]}]\s*$/,
  /^\s*@\w+/,
  /^\s*#include|^\s*package\s|^\s*public\s+(class|static)/,
];

function looksLikeCode(block: string): boolean {
  const lines = block.split('\n').map((l) => l.trimEnd()).filter((l) => l.trim());
  if (lines.length === 0) return false;

  const hits = lines.filter((l) => CODE_LINE.some((re) => re.test(l))).length;

  /* A single line only counts when it is unmistakable — a lone "x = 1" inside
     a paragraph of prose is not a code block. */
  if (lines.length === 1) {
    return /^\s*(async\s+)?(def|class|function|import|from|export)\s/.test(lines[0]);
  }

  /* Otherwise: most of the block has to read as code, and it must contain at
     least one structural line. Indentation on its own is not enough — quoted
     prose is indented too. */
  const indented = lines.filter((l) => /^\s{2,}/.test(l)).length;
  return hits >= 2 && (hits / lines.length >= 0.4 || indented / lines.length >= 0.5);
}

/** Guess the language for the label. Only from unambiguous markers. */
function guessLang(code: string): string {
  /* `async def` has to match too: the first version anchored on `def` at line
     start, so every async Python snippet was mislabelled as generic code. */
  if (/(^|\n)\s*(async\s+)?def\s+\w+\s*\(|(^|\n)\s*(from|import)\s+\w+|\bself\b|asyncio\./.test(code)) return 'python';
  if (/\b(const|let|=>|function)\b|console\.log/.test(code)) return 'javascript';
  if (/\bpublic\s+static\s+void\b|System\.out/.test(code)) return 'java';
  if (/^\s*(SELECT|INSERT|UPDATE|DELETE)\b/i.test(code)) return 'sql';
  return 'code';
}

/**
 * Parse a lesson body into prose and code blocks.
 *
 * Exported so it can be tested directly — the heuristic above is the part most
 * likely to need tuning as course content changes.
 */
export function parseBlocks(body: string): Block[] {
  const out: Block[] = [];
  const fence = /```(\w+)?\n?([\s\S]*?)```/g;
  let cursor = 0;

  for (const m of body.matchAll(fence)) {
    const start = m.index ?? 0;
    if (start > cursor) pushProse(out, body.slice(cursor, start));
    out.push({ kind: 'code', lang: m[1] || guessLang(m[2]), text: m[2].replace(/\s+$/, '') });
    cursor = start + m[0].length;
  }
  if (cursor < body.length) pushProse(out, body.slice(cursor));
  return out;
}

/** Split unfenced text on blank lines, promoting the parts that read as code. */
function pushProse(out: Block[], text: string): void {
  for (const chunk of text.split(/\n{2,}/)) {
    const t = chunk.trim();
    if (!t) continue;
    if (looksLikeCode(t)) out.push({ kind: 'code', lang: guessLang(t), text: dedent(t) });
    else out.push({ kind: 'prose', text: t });
  }
}

/** Remove the common leading indent so a nested snippet is not double-indented. */
function dedent(code: string): string {
  const lines = code.split('\n');
  const indents = lines.filter((l) => l.trim()).map((l) => l.match(/^\s*/)?.[0].length ?? 0);
  const min = indents.length ? Math.min(...indents) : 0;
  return min > 0 ? lines.map((l) => l.slice(min)).join('\n') : code;
}

/**
 * Render one lesson section body.
 *
 * `proseClass` carries the reader's typography settings so prose still follows
 * the book styling; code deliberately opts out of it, because a serif face at
 * a reading measure is the wrong container for source.
 */
export function LessonProse({ body, proseClass = '' }: { body: string; proseClass?: string }) {
  const blocks = parseBlocks(body);

  return (
    <>
      {blocks.map((b, i) =>
        b.kind === 'prose' ? (
          <div key={i} className={proseClass}>
            <p>{b.text}</p>
          </div>
        ) : (
          <CodeBlock key={i} lang={b.lang} code={b.text} />
        ),
      )}
    </>
  );
}

/**
 * A code block.
 *
 * `whitespace-pre` and a monospace face are the entire fix: the newlines were
 * always in the data. `overflow-x-auto` keeps a long line from widening the
 * page — a lesson that scrolls sideways because of one import statement is
 * worse than one that scrolls a snippet.
 */
export function CodeBlock({ lang, code }: { lang: string; code: string }) {
  return (
    <figure className="my-4 overflow-hidden rounded-xl border border-white/10 bg-[#0d0d13]">
      <figcaption className="flex items-center gap-2 border-b border-white/10 px-4 py-2">
        <CodeIcon className="h-3.5 w-3.5 text-accent" />
        <span className="text-[11px] font-medium uppercase tracking-wider text-white/50">{lang}</span>
      </figcaption>
      <pre className="overflow-x-auto px-4 py-3">
        <code className="block whitespace-pre font-mono text-[13px] leading-relaxed text-white/90">{code}</code>
      </pre>
    </figure>
  );
}
