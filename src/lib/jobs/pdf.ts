/**
 * A minimal text PDF writer.
 *
 * Employers want a PDF. The product had none: the editor downloaded `.txt`,
 * and — worse — the submission path passed `resumePath: null`, so the file
 * input on every application form was left empty while `validate()` counted
 * the résumé as attached. Applications reported success with no CV on them.
 *
 * Written by hand rather than pulled in as a dependency. A text-only PDF is a
 * few hundred bytes of well-specified structure, and the alternatives are
 * multi-megabyte libraries that render HTML in a headless browser — which is
 * a lot of machinery for laying out plain text, on a path that already has a
 * browser doing something more important.
 *
 * Deliberately plain: one column, one font, no images. A résumé that renders
 * identically everywhere beats one that is prettier in some readers and
 * broken in others.
 */

/** Base-14 fonts every reader has, so nothing is embedded. */
const FONTS = {
  sans: { regular: 'Helvetica', bold: 'Helvetica-Bold' },
  serif: { regular: 'Times-Roman', bold: 'Times-Bold' },
  mono: { regular: 'Courier', bold: 'Courier-Bold' },
} as const;

export type PdfFont = keyof typeof FONTS;

export type PdfOptions = {
  font?: PdfFont;
  /** Points. Résumés live between 9 and 12. */
  fontSize?: number;
  /** Multiplier on font size. Compact templates run tighter. */
  lineHeight?: number;
};

const PAGE_W = 612; // US Letter, the format every ATS expects
const PAGE_H = 792;
const MARGIN = 54; // 0.75in

/**
 * Escape for a PDF literal string.
 *
 * Backslash first — escaping it after the parens would double-escape the
 * backslashes those introduced.
 */
function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/\r/g, '');
}

/**
 * Wrap to the page width.
 *
 * Character-count based rather than measured: without font metrics an exact
 * fit is not available, and the average advance width of the base-14 faces is
 * close enough that a conservative estimate never overflows the margin.
 */
function wrap(text: string, fontSize: number, mono: boolean): string[] {
  const usable = PAGE_W - MARGIN * 2;
  /* Courier is exactly 0.6em; the proportional faces average nearer 0.5. */
  const perChar = fontSize * (mono ? 0.6 : 0.5);
  const max = Math.max(20, Math.floor(usable / perChar));

  const out: string[] = [];
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (raw.length <= max) {
      out.push(raw);
      continue;
    }
    let line = '';
    for (const word of raw.split(' ')) {
      if (!line) {
        line = word;
      } else if ((line + ' ' + word).length <= max) {
        line += ' ' + word;
      } else {
        out.push(line);
        line = word;
      }
      /* A single word longer than the line — a URL, usually — is broken
         rather than allowed to run off the page. */
      while (line.length > max) {
        out.push(line.slice(0, max));
        line = line.slice(max);
      }
    }
    out.push(line);
  }
  return out;
}

/** Render plain text as a PDF. Returns the file bytes. */
export function textToPdf(text: string, options: PdfOptions = {}): Buffer {
  const fontKey: PdfFont = options.font ?? 'sans';
  const fontName = FONTS[fontKey].regular;
  const size = options.fontSize ?? 10.5;
  const leading = size * (options.lineHeight ?? 1.35);

  const lines = wrap(text, size, fontKey === 'mono');
  const perPage = Math.max(1, Math.floor((PAGE_H - MARGIN * 2) / leading));

  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += perPage) pages.push(lines.slice(i, i + perPage));
  if (pages.length === 0) pages.push(['']);

  /* Objects are assembled in order and their byte offsets recorded, because
     the xref table at the end has to point at each one exactly. */
  const objects: string[] = [];
  const pageIds: number[] = [];
  const contentIds: number[] = [];

  /* 1 catalog, 2 pages, 3 font, then a content + page object per page. */
  let nextId = 4;
  for (let i = 0; i < pages.length; i += 1) {
    contentIds.push(nextId++);
    pageIds.push(nextId++);
  }

  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  objects[3] = `<< /Type /Font /Subtype /Type1 /BaseFont /${fontName} /Encoding /WinAnsiEncoding >>`;

  pages.forEach((pageLines, i) => {
    const top = PAGE_H - MARGIN;
    const body = pageLines.map((l) => `(${esc(l)}) Tj T*`).join('\n');
    const stream = `BT /F1 ${size} Tf ${leading} TL 1 0 0 1 ${MARGIN} ${top} Tm\n${body}\nET`;
    objects[contentIds[i]] = `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`;
    objects[pageIds[i]] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentIds[i]} 0 R >>`;
  });

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = Buffer.byteLength(pdf, 'latin1');
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }

  const xrefAt = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) {
    pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;

  /* latin1 so each byte in the string is one byte in the file — the offsets
     recorded above are byte offsets, and utf8 would shift every one of them. */
  return Buffer.from(pdf, 'latin1');
}
