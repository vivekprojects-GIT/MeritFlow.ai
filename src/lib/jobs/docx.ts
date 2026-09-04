import { deflateRawSync } from 'node:zlib';

/**
 * A résumé as a Word document rather than a PDF.
 *
 * ## Why this exists
 *
 * Applicant tracking systems parse an attachment to populate their own fields,
 * and they are markedly better at Word than at PDF. A PDF is a page-description
 * format: its text is a sequence of positioned glyph runs with no reading
 * order, no paragraphs, and no guarantee that adjacent words are adjacent in
 * the file. Extractors recover that structure by heuristic, and when the
 * heuristic misses, the candidate's résumé arrives as jumbled fragments or as
 * nothing at all — which the candidate never sees, because the upload
 * succeeded.
 *
 * A `.docx` has the text as text. `word/document.xml` holds paragraphs in
 * order, so extraction is a read rather than a reconstruction.
 *
 * ## Writing one without a library
 *
 * A `.docx` is a ZIP holding three parts: the content-type map, the root
 * relationship, and the document body. Nothing here needs styles, fonts or
 * numbering — those are optional, and Word supplies defaults. So the whole
 * format reduces to a small ZIP writer, which is `deflateRawSync` plus the
 * header layout below.
 */

/** CRC-32, as the ZIP central directory requires it. */
function crc32(buf: Buffer): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

/** XML text nodes cannot carry raw markup characters. */
function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

type Entry = { name: string; body: Buffer };

function zip(entries: Entry[]): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8');
    const deflated = deflateRawSync(e.body, { level: 9 });
    const sum = crc32(e.body);

    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(0, 10); // time
    local.writeUInt16LE(0x21, 12); // date — a fixed, valid 1980-01-01
    local.writeUInt32LE(sum, 14);
    local.writeUInt32LE(deflated.length, 18);
    local.writeUInt32LE(e.body.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);
    locals.push(local, deflated);

    const dir = Buffer.alloc(46 + name.length);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4); // version made by
    dir.writeUInt16LE(20, 6); // version needed
    dir.writeUInt16LE(0, 8);
    dir.writeUInt16LE(8, 10);
    dir.writeUInt16LE(0, 12);
    dir.writeUInt16LE(0x21, 14);
    dir.writeUInt32LE(sum, 16);
    dir.writeUInt32LE(deflated.length, 20);
    dir.writeUInt32LE(e.body.length, 24);
    dir.writeUInt16LE(name.length, 28);
    dir.writeUInt16LE(0, 30);
    dir.writeUInt16LE(0, 32);
    dir.writeUInt16LE(0, 34);
    dir.writeUInt16LE(0, 36);
    dir.writeUInt32LE(0, 38);
    dir.writeUInt32LE(offset, 42);
    name.copy(dir, 46);
    central.push(dir);

    offset += local.length + deflated.length;
  }

  const dirBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(dirBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, dirBuf, end]);
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

/**
 * Render plain text as a `.docx`.
 *
 * One paragraph per line, blank lines preserved as empty paragraphs so the
 * résumé's sections stay visually separated. Bold and headings are deliberately
 * absent: an ATS reads the text, a human reads the layout, and a document that
 * parses cleanly is worth more here than one that looks designed.
 */
export function textToDocx(text: string): Buffer {
  const paragraphs = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => {
      const t = line.trim();
      if (!t) return '<w:p/>';
      /* `xml:space="preserve"` keeps leading indentation, which carries meaning
         in a résumé's bullet nesting. */
      return `<w:p><w:r><w:t xml:space="preserve">${esc(line)}</w:t></w:r></w:p>`;
    })
    .join('');

  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>${paragraphs}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080"/></w:sectPr></w:body>
</w:document>`;

  return zip([
    { name: '[Content_Types].xml', body: Buffer.from(CONTENT_TYPES, 'utf8') },
    { name: '_rels/.rels', body: Buffer.from(RELS, 'utf8') },
    { name: 'word/document.xml', body: Buffer.from(document, 'utf8') },
  ]);
}
