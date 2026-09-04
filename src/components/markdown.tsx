'use client';

import { Fragment, type ReactNode } from 'react';

/**
 * A small, safe markdown renderer for chat replies.
 *
 * Deliberately not a library and deliberately not `dangerouslySetInnerHTML`:
 * this output comes from a model, so it is never turned into raw HTML. Every
 * token becomes a React element, which makes injection impossible by
 * construction.
 *
 * Covers what models actually emit in chat: headings, bullet and numbered
 * lists, fenced and inline code, bold, italic, links, and blockquotes.
 */

export function Markdown({ text, className = '' }: { text: string; className?: string }) {
  return <div className={className}>{renderBlocks(text)}</div>;
}

function renderBlocks(source: string): ReactNode[] {
  const lines = (source ?? '').replace(/\r\n/g, '\n').split('\n');
  const out: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    /* Fenced code block */
    const fence = line.match(/^```(\w+)?\s*$/);
    if (fence) {
      const language = fence[1] ?? '';
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1; // closing fence
      out.push(
        <pre
          key={key++}
          className="thin-scroll my-2 overflow-x-auto rounded-lg border border-line bg-[#0d0d13] px-3 py-2.5"
        >
          {language && (
            <span className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-zinc-500">{language}</span>
          )}
          <code className="font-mono text-[12.5px] leading-relaxed text-zinc-100">{body.join('\n')}</code>
        </pre>,
      );
      continue;
    }

    /* Heading */
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      out.push(
        <p
          key={key++}
          className={[
            'mt-3 mb-1 font-semibold text-ink first:mt-0',
            level <= 2 ? 'text-[15px]' : 'text-[14px]',
          ].join(' ')}
        >
          {renderInline(heading[2])}
        </p>,
      );
      i += 1;
      continue;
    }

    /* Blockquote */
    if (/^>\s?/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        body.push(lines[i].replace(/^>\s?/, ''));
        i += 1;
      }
      out.push(
        <blockquote key={key++} className="my-2 border-l-2 border-accent/40 pl-3 text-ink/75">
          {renderInline(body.join(' '))}
        </blockquote>,
      );
      continue;
    }

    /* Bullet list */
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ''));
        i += 1;
      }
      out.push(
        <ul key={key++} className="my-2 space-y-1">
          {items.map((item, index) => (
            <li key={index} className="flex gap-2">
              <span className="mt-[0.55em] h-1 w-1 shrink-0 rounded-full bg-accent" />
              <span>{renderInline(item)}</span>
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    /* Numbered list */
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ''));
        i += 1;
      }
      out.push(
        <ol key={key++} className="my-2 space-y-1">
          {items.map((item, index) => (
            <li key={index} className="flex gap-2">
              <span className="shrink-0 font-semibold text-accent">{index + 1}.</span>
              <span>{renderInline(item)}</span>
            </li>
          ))}
        </ol>,
      );
      continue;
    }

    /* Blank line */
    if (line.trim() === '') {
      i += 1;
      continue;
    }

    /* Paragraph — consume until a blank line or the start of another block */
    const body: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^```/.test(lines[i]) &&
      !/^#{1,4}\s/.test(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+[.)]\s+/.test(lines[i]) &&
      !/^>\s?/.test(lines[i])
    ) {
      body.push(lines[i]);
      i += 1;
    }
    out.push(
      <p key={key++} className="my-1.5 first:mt-0 last:mb-0">
        {renderInline(body.join(' '))}
      </p>,
    );
  }

  return out;
}

/** Inline spans: `code`, **bold**, *italic*, and [links](url). */
function renderInline(text: string): ReactNode[] {
  const pattern =
    /(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*\n]+\*)|(_[^_\n]+_)|(\[[^\]]+\]\((https?:\/\/[^\s)]+)\))/g;
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) out.push(<Fragment key={key++}>{text.slice(last, match.index)}</Fragment>);
    const token = match[0];

    if (token.startsWith('`')) {
      out.push(
        <code key={key++} className="rounded bg-black/[0.06] px-1 py-0.5 font-mono text-[0.88em] text-ink">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith('**') || token.startsWith('__')) {
      out.push(
        <strong key={key++} className="font-semibold text-ink">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith('[')) {
      const link = token.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
      if (link) {
        out.push(
          <a
            key={key++}
            href={link[2]}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="u-link font-medium text-accent"
          >
            {link[1]}
          </a>,
        );
      } else {
        out.push(<Fragment key={key++}>{token}</Fragment>);
      }
    } else {
      out.push(
        <em key={key++} className="italic">
          {token.slice(1, -1)}
        </em>,
      );
    }
    last = match.index + token.length;
  }

  if (last < text.length) out.push(<Fragment key={key++}>{text.slice(last)}</Fragment>);
  return out;
}
