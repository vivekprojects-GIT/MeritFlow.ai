/**
 * What kind of question an application is asking.
 *
 * ## Why the kind decides the handling
 *
 * "How many years of Python?" and "I certify the above is true" are both text
 * on a form, and treating them the same is how software ends up agreeing to
 * things on someone's behalf. The class is what routes a question to the rule
 * that may answer it:
 *
 *   FACTUAL             a verified answer, or a deterministic derivation
 *   PREFERENCE          a stated preference, or deterministic provenance
 *   CONSENT_ATTESTATION an explicit stored authorization, and nothing else
 *   OPEN_ENDED          evidence-checked prose, or the candidate
 *   UNKNOWN             the candidate
 *
 * ## Classification is conservative by construction
 *
 * Ambiguity resolves toward the class that requires more of us, never less. A
 * question that reads as both factual and consent-shaped is consent, because
 * misclassifying an attestation as a fact means agreeing to it automatically,
 * while misclassifying a fact as an attestation means asking the candidate an
 * unnecessary question. Those errors are not the same size.
 */

export type QuestionClassKind = 'FACTUAL' | 'PREFERENCE' | 'CONSENT_ATTESTATION' | 'OPEN_ENDED' | 'UNKNOWN';

export type Classification = {
  kind: QuestionClassKind;
  /** Which pattern decided, so a misclassification is traceable to one place. */
  rule: string;
};

/**
 * Consent shapes, tested first and deliberately broad.
 *
 * Everything here is checked before anything else, because a false positive
 * costs one unnecessary question and a false negative is software consenting on
 * a person's behalf.
 */
const CONSENT: [string, RegExp][] = [
  /*
   * POLICY first, and deliberately so.
   *
   * Reddit words its privacy acknowledgement as "By selecting 'I agree,' I
   * understand that the information I have provided ... in accordance with
   * Reddit's Candidate Privacy Policy." In the old order that matched
   * AGREEMENT, so a candidate who had authorised privacy acknowledgements
   * had this one typed as a generic agreement, and the authorisation they
   * had given did not cover it.
   *
   * The most specific reading of a consent question is the right one, and
   * "this is about a privacy policy" is more specific than "this contains
   * the words I agree".
   */
  ['POLICY', /\bprivacy\s+(policy|notice|statement)\b|\bcandidate\s+privacy\b|\bdata\s+protection\b/i],
  /*
   * Being kept on file for future roles.
   *
   * Its own class, ahead of the generic readings, because it is the one consent
   * on this list that costs a candidate nothing and is asked constantly. It was
   * classifying as UNKNOWN — an unanswerable question rather than a permission
   * — so applications were skipped over a checkbox the candidate would happily
   * have ticked and had no way to pre-authorise.
   *
   * Still a consent: it is never answered from the vault, and it needs an
   * explicit grant like any other.
   */
  ['FUTURE_CONTACT', /\bfuture\s+(job\s+)?(opening|opportunit|role|position|vacanc)|\btalent\s+(community|network|pool)\b|\bjob\s+alert|keep\s+(me\s+|my\s+details\s+)?(on\s+file|informed)|contact(ing)?\s+(me\s+)?about\s+(future|other)\s/i],
  ['MARKETING', /\bmarketing\s+(communication|email|material)|\bnewsletter\b|promotional\s+(email|communication)/i],
  /*
   * An attestation verb, used as a verb.
   *
   * The pattern was a bare stem list, and one of the stems is "affirm" -- which
   * is also a company. Every question on Affirm's board came back classified as
   * a legal attestation needing authorisation, including "How did you first
   * learn about Affirm as an employer?", and the whole employer was unreachable.
   *
   * A real attestation has a subject doing the attesting, or the verb takes a
   * "that" clause. A bare company name has neither.
   */
  ['ATTESTATION', /\b(i|we|you|applicant)\s+(hereby\s+)?(certif|attest|declare|affirm|swear)|\b(certify|attest|declare|affirm|swear)(y|s|ing)?\s+that\b|\bunder\s+penalty\s+of\s+perjury\b/i],
  ['ACKNOWLEDGEMENT', /\backnowledg/i],
  ['AGREEMENT', /\bi\s+(agree|consent|accept)\b|\bterms\s+(and|&)\s+conditions\b|\byou\s+agree\b/i],
  ['CONSENT', /\bconsent\s+to\b|\bgive\s+(my\s+)?(permission|consent)\b|\bauthorize\s+(us|the\s+company)\b/i],
  ['BACKGROUND_CHECK', /\bbackground\s+(check|screening|investigation)\b|\bcriminal\s+(record|history)\s+check\b/i],
  ['ARBITRATION', /\barbitration\b|\bwaive\s+.{0,30}\bright\b|\bclass\s+action\b/i],
  ['RELEASE', /\brelease\s+.{0,20}\bliability\b|\bhold\s+harmless\b|\bindemnif/i],
  ['IP_ASSIGNMENT', /\bintellectual\s+property\b.{0,40}\bassign|\bassign\b.{0,30}\binvention/i],
  ['NON_COMPETE', /\bnon[-\s]?compete\b|\bnon[-\s]?solicit/i],
  ['SIGNATURE', /\belectronic\s+signature\b|\be-?sign\b|\bdigital\s+signature\b|\btype\s+your\s+(full\s+)?name\s+to\b/i],
  ['LEGALLY_BOUND', /\blegally\s+bound\b|\bunder\s+penalty\s+of\s+perjury\b/i],
];

/** Preferences: things the candidate wants, not things that are true. */
const PREFERENCE: [string, RegExp][] = [
  ['REFERRAL_SOURCE', /how\s+did\s+you\s+(first\s+)?(hear|learn|find\s+out)\s+about|where\s+did\s+you\s+(hear|learn)\s+about|referral\s+source|referred\s+by/i],
  ['RELOCATION', /willing\s+to\s+relocate|open\s+to\s+relocat/i],
  ['SALARY', /salary\s+(expectation|requirement|range)|expected\s+(salary|compensation)|desired\s+(salary|pay)/i],
  ['START_DATE', /when\s+can\s+you\s+start|available\s+start\s+date|notice\s+period|earliest\s+start/i],
  ['WORK_MODE', /willing\s+to\s+work\s+(onsite|on-site|in\s+office|hybrid)|open\s+to\s+(remote|hybrid|onsite)/i],
  ['TRAVEL', /willing\s+to\s+travel|comfortable\s+with\s+travel/i],
];

/** Facts: things that are true or false about the candidate. */
const FACTUAL: [string, RegExp][] = [
  /*
   * Immigration splits into two families, and getting them backwards is the
   * worst routing error this system can make: both answers are a stored,
   * verified Yes or No, and they have opposite polarity.
   *
   * Sponsorship is tested first because it is the more specific claim — a
   * question mentioning sponsorship is about sponsorship even when it also
   * says "authorized".
   */
  [
    'WORK_AUTH_SPONSORSHIP',
    /spons(or|orship)|\bh-?1-?b\b|\bvisa\s+(sponsor|petition|filing)|require\s+.{0,24}(visa|work\s+permit)\s+(now|in\s+the\s+future)/i,
  ],
  [
    'WORK_AUTH_AUTHORIZED',
    /authoriz(ed|ation)\s+to\s+work|legally\s+(authorized|entitled|eligible)\s+to\s+work|\bright\s+to\s+work\b|work\s+authoriz(ed|ation)|eligible\s+to\s+work|\b(current\s+)?work\s+status\b|\bwork\s+eligibility\b|\bemployment\s+eligibility\b/i,
  ],
  ['LOCATION', /(currently\s+)?(located|residing|reside|live|living|based)\s+in\b|what\s+(city|state|country)/i],
  ['EXPERIENCE_YEARS', /how\s+many\s+years|years\s+of\s+experience|years'?\s+experience/i],
  ['EDUCATION', /highest\s+(level\s+of\s+)?education|degree|graduat|university|college\b/i],
  /* "Who is your current employer?" is a different question from "have you
     worked here before?", and only one of them is a claim about the past. */
  ['CURRENT_ROLE', /(current|most\s+recent|present)[^?]{0,24}(employer|company|organi[sz]ation|title|role|position)/i],
  ['PRIOR_EMPLOYMENT', /(previously|ever)\s+(worked|been\s+employed)|consulted\s+for|former\s+employee/i],
  ['ACCOMMODATION', /accommodation|reasonable\s+adjustment/i],
  ['BACKGROUND', /foreign\s+(government|military)|family\s+ties/i],
  ['TRANSPORT', /reliable\s+transport|own\s+vehicle|driver'?s\s+licen[cs]e/i],
  ['CONTACT', /email|phone|address|postal\s+code|zip\b|linkedin|github|portfolio|website/i],
  ['NAME', /(first|last|given|family|preferred|full)\s+name|pronouns/i],
  ['CLEARANCE', /security\s+clearance|clearance\s+level/i],
  ['DEMOGRAPHIC', /gender|race|ethnicity|veteran\s+status|disability\s+status/i],
];

/** Prose. Long, and answerable only from evidence. */
function looksOpenEnded(question: string, kind: string): boolean {
  if (kind === 'textarea') return true;
  return /\bwhy\s+(do|are|would|might)\s+you\b|tell\s+us\s+about|describe\s+|in\s+your\s+own\s+words|what\s+(interests|excites|motivates|draws)\s+you|\bgood\s+fit\b|\b\d+\s*[-\sto]{1,4}\s*\d+\s+sentences?\b|\bin\s+\d+\s+sentences?\b|what\s+(makes|would\s+make)\s+you/i.test(
    question,
  );
}

export function classifyQuestion(question: string, kind = 'text'): Classification {
  const q = question.trim();
  if (!q) return { kind: 'UNKNOWN', rule: 'EMPTY' };

  /* Consent first, always. The cost of the two mistakes is not symmetric. */
  for (const [rule, pattern] of CONSENT) {
    if (pattern.test(q)) return { kind: 'CONSENT_ATTESTATION', rule };
  }

  for (const [rule, pattern] of PREFERENCE) {
    if (pattern.test(q)) return { kind: 'PREFERENCE', rule };
  }

  for (const [rule, pattern] of FACTUAL) {
    if (pattern.test(q)) return { kind: 'FACTUAL', rule };
  }

  if (looksOpenEnded(q, kind)) return { kind: 'OPEN_ENDED', rule: 'PROSE' };

  /* Unrecognised. Goes to the candidate, and stays there until they answer it
     once — at which point the answer book has it and this never fires again for
     that wording. */
  return { kind: 'UNKNOWN', rule: 'UNRECOGNISED' };
}

/**
 * Consent types that may never be pre-authorized in bulk.
 *
 * A candidate can authorize "acknowledge a candidate privacy policy" as a class
 * because its legal effect is confined to processing this application. They
 * cannot pre-authorize arbitration, a background check, an IP assignment or a
 * non-compete as a class, because those bind them beyond the application and to
 * terms nobody has read yet. Each of those needs the exact item authorized.
 */
export const NEVER_BLANKET_AUTHORIZED: ReadonlySet<string> = new Set([
  'ARBITRATION',
  'RELEASE',
  'IP_ASSIGNMENT',
  'NON_COMPETE',
  'BACKGROUND_CHECK',
  'LEGALLY_BOUND',
  'SIGNATURE',
]);
