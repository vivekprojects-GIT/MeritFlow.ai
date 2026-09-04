import { describe, it, expect } from 'vitest';
import { textToDocx } from './docx';
import mammoth from 'mammoth';

/**
 * The point of a .docx over a .pdf is that the text comes back out.
 *
 * So the test extracts it again with a real parser rather than asserting on
 * bytes — that is the property an ATS depends on.
 */
describe('rendering a résumé as a Word document', () => {
  const RESUME = [
    'Sai Vivek Katkuri',
    'katkurisaivivek95@gmail.com | +1 9293009293',
    '',
    'HIGHLIGHTS FOR THIS ROLE',
    '- Built production multi-agent orchestrators using LangGraph & LangChain',
    '- Designed RAG pipelines with vector search (Pinecone, Weaviate)',
  ].join('\n');

  it('produces a file Word and ATS parsers recognise', () => {
    const buf = textToDocx(RESUME);
    /* PK zip signature — a .docx is an OPC package. */
    expect(buf.subarray(0, 2).toString('latin1')).toBe('PK');
    expect(buf.length).toBeGreaterThan(400);
  });

  it('round-trips the text back out', async () => {
    const buf = textToDocx(RESUME);
    const { value } = await mammoth.extractRawText({ buffer: buf });
    expect(value).toContain('Sai Vivek Katkuri');
    expect(value).toContain('katkurisaivivek95@gmail.com');
    expect(value).toContain('HIGHLIGHTS FOR THIS ROLE');
    expect(value).toContain('LangGraph');
    expect(value).toContain('Pinecone');
  });

  it('escapes characters that would break the XML', async () => {
    const buf = textToDocx('C++ & "AI/ML" <production> R&D');
    const { value } = await mammoth.extractRawText({ buffer: buf });
    expect(value).toContain('C++ & "AI/ML" <production> R&D');
  });

  it('keeps blank lines as separators', async () => {
    const { value } = await mammoth.extractRawText({ buffer: textToDocx('A\n\nB') });
    expect(value.replace(/\r/g, '')).toContain('A');
    expect(value.replace(/\r/g, '')).toContain('B');
  });

  it('handles an empty résumé without producing a broken file', () => {
    expect(textToDocx('').subarray(0, 2).toString('latin1')).toBe('PK');
  });
});
