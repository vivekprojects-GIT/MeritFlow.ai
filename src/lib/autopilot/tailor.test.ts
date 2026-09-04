import { describe, it, expect } from 'vitest';
import { isSupported } from './tailor';

/**
 * The evidence check is the only thing standing between tailoring and
 * fabrication, so it is tested against the three things that actually get
 * invented: tools the candidate never used, employers they never worked for,
 * and metrics nobody measured.
 */

const RESUME =
  'Built a React dashboard for 12000 users at Acme Corp. Used TypeScript and PostgreSQL. Reduced page load from 4s to 1.2s.';

describe('isSupported', () => {
  it('keeps a claim drawn from the résumé', () => {
    expect(isSupported('Built a React dashboard serving 12000 users at Acme Corp', RESUME)).toBe(true);
  });

  it('keeps a rephrasing that introduces no new facts', () => {
    /* The whole point of tailoring. An earlier version required a fraction of
       *all* words to overlap and rejected this, because "shipped", "backed"
       and "features" were new words even though every named thing was real. */
    expect(isSupported('Shipped PostgreSQL backed features in TypeScript', RESUME)).toBe(true);
  });

  it('keeps connective prose that names nothing', () => {
    expect(isSupported('Delivered performance improvements across the product', RESUME)).toBe(true);
  });

  it('rejects an invented technology', () => {
    expect(isSupported('Led a Kubernetes migration', RESUME)).toBe(false);
  });

  it('rejects an invented employer', () => {
    expect(isSupported('Managed a team at Globex', RESUME)).toBe(false);
  });

  it('rejects an invented metric', () => {
    /* The most damaging kind: it reads well and is unfalsifiable until an
       interviewer asks about it. */
    expect(isSupported('Improved conversion by 87 percent', RESUME)).toBe(false);
  });

  it('rejects a real tool paired with an invented number', () => {
    expect(isSupported('Scaled PostgreSQL to 40 nodes', RESUME)).toBe(false);
  });

  it('accepts numbers that appear in the source', () => {
    expect(isSupported('Cut page load from 4s to 1.2s', RESUME)).toBe(true);
  });

  it('matches a tool written with punctuation in the source', () => {
    expect(isSupported('Wrote React components', 'Built with React.js and Node.js.')).toBe(true);
  });
});

/**
 * The two ways this check rejected the résumé it was quoting.
 *
 * Both were found by tailoring one real CV against one real posting: every
 * generated summary was dropped, and two of five bullets went with it. Smart
 * mode then refused to send the application on the grounds that claims had been
 * dropped — so the safety property was firing on its own faithful output, and
 * the account could not submit anything at all.
 */
describe('isSupported — restatements of the source', () => {
  const CV =
    'Built Go and Python services handling 12k requests per second. ' +
    'Introduced automated integration testing, cutting escaped defects by half. ' +
    'Platform engineer with 8 years of experience. Reduced AWS spend 31%.';

  it('accepts the expansion of a figure the résumé abbreviated', () => {
    /* "12k" and "12,000" are the same number. Compared as digit strings they
       are not, and the honest bullet was dropped as a fabricated metric. */
    expect(isSupported('Built Go services handling 12,000 requests per second', CV)).toBe(true);
  });

  it('accepts a fraction the résumé wrote as a word', () => {
    expect(isSupported('Cut escaped defects by 50%', CV)).toBe(true);
  });

  it('still rejects a number that appears in no form', () => {
    /* The widening must not become an excuse. 40,000 is nowhere in the CV, in
       any notation, and that is exactly the claim worth stopping. */
    expect(isSupported('Handled 40,000 requests per second', CV)).toBe(false);
    expect(isSupported('Cut escaped defects by 90%', CV)).toBe(false);
  });

  it('does not treat the start of a second sentence as a proper noun', () => {
    /*
     * The generated summary is specified as two sentences. The second one's
     * first word is capitalised by grammar, and was being required to appear
     * verbatim in the résumé — which no ordinary verb ever does. Every summary
     * was therefore dropped, and tailored résumés went out with none.
     */
    expect(
      isSupported('Platform engineer with 8 years of experience. Demonstrates depth across delivery.', CV),
    ).toBe(true);
  });

  it('still catches an invented name in a later sentence', () => {
    expect(
      isSupported('Platform engineer with 8 years of experience. Led delivery at Globex.', CV),
    ).toBe(false);
  });
});
