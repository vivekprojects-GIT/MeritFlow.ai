import { describe, it, expect } from 'vitest';
import { textToPdf } from './pdf';

/**
 * Structural checks rather than visual ones. A PDF that a reader refuses to
 * open is the failure mode that matters here — an employer who cannot read the
 * attachment is indistinguishable from no attachment at all, which is the bug
 * this file exists to fix.
 */
describe('textToPdf', () => {
  const pdf = textToPdf('Sai Vivek Katkuri\nMachine learning engineer.\nPyTorch, Python, SQL.');
  const text = pdf.toString('latin1');

  it('starts with a PDF header', () => {
    expect(text.startsWith('%PDF-1.4')).toBe(true);
  });

  it('ends with the end-of-file marker', () => {
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
  });

  it('declares a catalog, a page tree and a font', () => {
    expect(text).toContain('/Type /Catalog');
    expect(text).toContain('/Type /Pages');
    expect(text).toContain('/BaseFont /Helvetica');
  });

  it('carries the actual text', () => {
    expect(text).toContain('Sai Vivek Katkuri');
    expect(text).toContain('PyTorch, Python, SQL.');
  });

  it('writes an xref table whose offsets land on object headers', () => {
    /* The offsets are the part most easily broken — a utf8 encoding slip
       shifts every one and the file opens as corrupt. */
    const xrefAt = Number(text.slice(text.lastIndexOf('startxref') + 9).trim().split('\n')[0]);
    expect(text.slice(xrefAt, xrefAt + 4)).toBe('xref');

    const entries = text.slice(xrefAt).split('\n').filter((l) => /^\d{10} \d{5} n\s*$/.test(l));
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      const offset = Number(entry.slice(0, 10));
      expect(text.slice(offset)).toMatch(/^\d+ 0 obj/);
    }
  });

  it('escapes parentheses so a string cannot terminate early', () => {
    const t = textToPdf('Built (React) dashboards').toString('latin1');
    expect(t).toContain('\\(React\\)');
  });

  it('escapes backslashes without double-escaping the parens', () => {
    const t = textToPdf('path\\to (thing)').toString('latin1');
    expect(t).toContain('path\\\\to \\(thing\\)');
  });

  it('paginates long documents', () => {
    const long = Array.from({ length: 200 }, (_, i) => `Line ${i}`).join('\n');
    const t = textToPdf(long).toString('latin1');
    const count = Number(t.match(/\/Count (\d+)/)?.[1] ?? 0);
    expect(count).toBeGreaterThan(1);
  });

  it('breaks a word too long for the line rather than overflowing', () => {
    const t = textToPdf(`https://example.com/${'a'.repeat(400)}`).toString('latin1');
    expect(t.split('Tj').length).toBeGreaterThan(2);
  });

  it('honours the font choice', () => {
    expect(textToPdf('x', { font: 'mono' }).toString('latin1')).toContain('/Courier');
    expect(textToPdf('x', { font: 'serif' }).toString('latin1')).toContain('/Times-Roman');
  });

  it('produces something for empty input rather than throwing', () => {
    expect(textToPdf('').length).toBeGreaterThan(200);
  });
});
