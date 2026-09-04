import { deflateRawSync } from 'node:zlib';

/**
 * A résumé rendered as a properly styled Word document.
 *
 * ## The template, and why exactly one
 *
 * This is the classic single-column ATS layout: name large at the top,
 * contact line under it, all-caps section headings ruled underneath, real
 * bulleted lists, one readable serif-free face. It is the format every
 * parser vendor tests against, which is the whole reason to have *a*
 * template rather than a choice of them — décor is where parsing goes to
 * die, so there is nothing here a parser has ever choked on: no tables, no
 * columns, no text boxes, no images.
 *
 * ## Real styles, not styled text
 *
 * Headings are Word paragraph styles (`MFName`, `MFHeading`) and bullets are
 * a Word numbering definition, not hyphens in a plain paragraph. That is
 * what makes the document behave like a document: heading navigation works,
 * bullets reflow as bullets, and an ATS that reads structure gets structure.
 *
 * ## Input
 *
 * Plain text, parsed by shape: the first non-empty line is the name, the
 * second the contact line; a short line in capitals (or ending with a colon)
 * is a heading; a line starting with a dash or bullet glyph is a list item;
 * everything else is a body paragraph.
 */

function crc32(buf: Buffer): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x21, 12);
    local.writeUInt32LE(sum, 14);
    local.writeUInt32LE(deflated.length, 18);
    local.writeUInt32LE(e.body.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);
    locals.push(local, deflated);

    const dir = Buffer.alloc(46 + name.length);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
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
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
</Relationships>`;

/*
 * Calibri throughout: shipped with Word since 2007, mapped cleanly by every
 * substitute renderer, and unremarkable — which for an ATS document is a
 * virtue. Sizes are half-points (28 = 14pt).
 */
/*
 * Sizes and faces measured from the reference CV (SAIVIVEK_CV.pdf), not
 * chosen: name 26pt Calibri Light, contact and section headings 12pt with
 * the headings bold in capitals, body 10pt, bullets from the symbol face.
 * Half-points below (52 = 26pt).
 */
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="20"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="40" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:styleId="MFName">
  <w:name w:val="MF Name"/>
  <w:pPr><w:spacing w:after="40"/></w:pPr>
  <w:rPr><w:rFonts w:ascii="Calibri Light" w:hAnsi="Calibri Light"/><w:sz w:val="52"/></w:rPr>
</w:style>
<w:style w:type="paragraph" w:styleId="MFContact">
  <w:name w:val="MF Contact"/>
  <w:pPr><w:spacing w:after="200"/></w:pPr>
  <w:rPr><w:sz w:val="24"/></w:rPr>
</w:style>
<w:style w:type="paragraph" w:styleId="MFHeading">
  <w:name w:val="MF Heading"/>
  <w:pPr><w:keepNext/><w:spacing w:before="200" w:after="60"/></w:pPr>
  <w:rPr><w:b/><w:caps/><w:sz w:val="24"/></w:rPr>
</w:style>
<w:style w:type="paragraph" w:styleId="MFBullet">
  <w:name w:val="MF Bullet"/>
  <w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr><w:spacing w:after="30"/><w:ind w:left="288" w:hanging="144"/></w:pPr>
</w:style>
</w:styles>`;

const NUMBERING = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:abstractNum w:abstractNumId="0">
  <w:lvl w:ilvl="0">
    <w:numFmt w:val="bullet"/>
    <w:lvlText w:val="•"/>
    <w:lvlJc w:val="left"/>
    <w:pPr><w:ind w:left="288" w:hanging="144"/></w:pPr>
  </w:lvl>
</w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
</w:numbering>`;

/** A short line in capitals, or ending with a colon, reads as a heading. */
function isHeading(line: string): boolean {
  const t = line.trim();
  if (t.length < 3 || t.length > 60) return false;
  if (/:$/.test(t) && !/^-|^•/.test(t) && t.split(' ').length <= 6) return true;
  const letters = t.replace(/[^A-Za-z]/g, '');
  if (letters.length < 3) return false;
  const upper = letters.replace(/[^A-Z]/g, '');
  return upper.length / letters.length > 0.85;
}

function para(style: string, text: string): string {
  return `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr><w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;
}

/** Render résumé text into the template. */
export function resumeToDocx(text: string): Buffer {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const paragraphs: string[] = [];
  let headerDone = 0; // 0 = expecting name, 1 = expecting contact, 2 = body

  for (const raw of lines) {
    const line = raw.replace(/\s+$/g, '');
    const t = line.trim();

    if (headerDone < 2) {
      if (!t) continue;
      paragraphs.push(para(headerDone === 0 ? 'MFName' : 'MFContact', t));
      headerDone += 1;
      continue;
    }

    if (!t) {
      /* Blank lines between sections are handled by heading spacing; keeping
         them all would double every gap. One thin spacer only after body. */
      continue;
    }

    if (isHeading(t)) {
      paragraphs.push(para('MFHeading', t.replace(/:$/, '')));
      continue;
    }

    if (/^[-•·*]\s+/.test(t)) {
      paragraphs.push(para('MFBullet', t.replace(/^[-•·*]\s+/, '')));
      continue;
    }

    /* The CV bolds a short lead-in up to a colon on its skill lines --
       "Programming & Scripting: Python, Bash..." -- and the template keeps
       that as a real bold run rather than flattening it. */
    const lead = t.match(/^([A-Z][^:]{2,48}):\s+(.+)$/);
    if (lead) {
      paragraphs.push(
        `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${esc(lead[1])}: </w:t></w:r>` +
          `<w:r><w:t xml:space="preserve">${esc(lead[2])}</w:t></w:r></w:p>`,
      );
      continue;
    }

    paragraphs.push(`<w:p><w:r><w:t xml:space="preserve">${esc(t)}</w:t></w:r></w:p>`);
  }

  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>${paragraphs.join('')}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1008" w:right="1080" w:bottom="1008" w:left="1080"/></w:sectPr></w:body>
</w:document>`;

  return zip([
    { name: '[Content_Types].xml', body: Buffer.from(CONTENT_TYPES, 'utf8') },
    { name: '_rels/.rels', body: Buffer.from(RELS, 'utf8') },
    { name: 'word/_rels/document.xml.rels', body: Buffer.from(DOC_RELS, 'utf8') },
    { name: 'word/styles.xml', body: Buffer.from(STYLES, 'utf8') },
    { name: 'word/numbering.xml', body: Buffer.from(NUMBERING, 'utf8') },
    { name: 'word/document.xml', body: Buffer.from(document, 'utf8') },
  ]);
}
