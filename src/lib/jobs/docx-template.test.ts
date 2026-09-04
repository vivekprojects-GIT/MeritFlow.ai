import { describe, it, expect } from 'vitest';
import { resumeToDocx } from './docx-template';
import mammoth from 'mammoth';
import { inflateRawSync } from 'node:zlib';

/** Pull one part's XML back out of the package the writer produced. */
function partOf(buf: Buffer, name: string): string {
  const sig = Buffer.from(name, 'utf8');
  const at = buf.indexOf(sig);
  if (at < 0) throw new Error('part not found: ' + name);
  const header = at - 30;
  const compressed = buf.readUInt32LE(header + 18);
  const start = at + sig.length;
  return inflateRawSync(buf.subarray(start, start + compressed)).toString('utf8');
}

const RESUME = [
  'Sai Vivek Katkuri',
  'katkurisaivivek95@gmail.com | +1 9293009293 | linkedin.com/in/saivivekkatkuri',
  '',
  'HIGHLIGHTS FOR THIS ROLE',
  '- Built production multi-agent orchestrators using LangGraph & LangChain',
  '- Designed RAG pipelines with vector search',
  '',
  'PROFESSIONAL SUMMARY:',
  'AI Engineer specializing in generative AI on AWS.',
  '',
  'WORK EXPERIENCE:',
  'Capgemini America Inc. — AI Engineer',
  '- Reduced hallucination by 22% via QLoRA fine-tuning',
].join('\n');

describe('the ATS résumé template', () => {
  it('produces a valid docx that round-trips its text', async () => {
    const buf = resumeToDocx(RESUME);
    expect(buf.subarray(0, 2).toString('latin1')).toBe('PK');
    const { value } = await mammoth.extractRawText({ buffer: buf });
    expect(value).toContain('Sai Vivek Katkuri');
    expect(value).toContain('HIGHLIGHTS FOR THIS ROLE');
    expect(value).toContain('Reduced hallucination by 22%');
  });

  it('renders bullets as Word list items, not hyphen text', async () => {
    const buf = resumeToDocx(RESUME);
    /* The bullet paragraphs reference the numbering definition; the hyphen
       itself must be gone from the text. */
    const { value } = await mammoth.extractRawText({ buffer: buf });
    expect(value).not.toMatch(/^- Built/m);
    const doc = partOf(buf, 'word/document.xml');
    expect(doc).toContain('MFBullet');
    /* The style carries the numbering reference (numId 1 -> the bullet
       definition), which is what makes Word render these as a real list.
       Mammoth needs a style map to reflect custom styles into HTML, so the
       assertion is on the document structure itself. */
    const styles = partOf(buf, 'word/styles.xml');
    expect(styles).toMatch(/MFBullet[\s\S]*?numId w:val="1"/);
    const numbering = partOf(buf, 'word/numbering.xml');
    expect(numbering).toContain('w:numFmt w:val="bullet"');
  });

  it('styles the name and section headings', () => {
    const doc = partOf(resumeToDocx(RESUME), 'word/document.xml');
    expect(doc).toContain('MFName');
    expect(doc).toContain('MFHeading');
    /* Headings lose their trailing colon — punctuation, not wording. */
    expect(doc).not.toContain('PROFESSIONAL SUMMARY:');
  });

  it('handles an empty document without corrupting the package', () => {
    expect(resumeToDocx('').subarray(0, 2).toString('latin1')).toBe('PK');
  });
});
