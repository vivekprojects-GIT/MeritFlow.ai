/**
 * Matching an arriving email to the application that is waiting for it.
 *
 * ## The bug this replaces
 *
 * `latestOtp` took the most recent code in the mailbox and handed it to
 * whichever form was asking:
 *
 *     SELECT otp FROM inbound_mail WHERE user_id = $1 ORDER BY received_at DESC
 *
 * With one application in flight that is right almost by accident. With ten —
 * which is the entire point of a batch — three codes arrive within a minute of
 * each other and the form gets whichever landed last. Capital One's code goes
 * into JPMorgan's field. It fails, the run stalls, and nothing anywhere says
 * why, because from the engine's point of view an OTP was found and used.
 *
 * ## The rule
 *
 * A code is only used when the message it came from can be tied to the
 * application asking for it — by the sender's domain, by the employer's name,
 * and by arriving inside the window that application opened. Anything less is
 * refused, and a refusal parks the run for the candidate rather than typing a
 * guess into a verification field.
 *
 * Deterministic throughout. No model is consulted: sender domains and code
 * formats are exactly the kind of thing regular expressions are good at, and
 * the cost of being wrong is an application that silently fails verification.
 */

/** What an in-flight application is waiting for. */
export type OtpExpectation = {
  /** The posting this run is for. */
  jobId: string;
  company: string;
  /** The applicant tracking system, as `detectAts` reports it. */
  ats: string;
  /** When the application step that triggered the email began. */
  since: number;
  /** After this, the code is stale even if it matches. */
  expiresAt: number;
};

/** A message already in the mailbox, as the inbox stores it. */
export type MailCandidate = {
  id: string;
  fromAddr: string;
  subject: string;
  /** The employer the classifier attributed it to, when it could. */
  company: string;
  otp: string;
  receivedAt: number;
};

export type OtpMatch = {
  code: string;
  messageId: string;
  /** 0-1. Only a high score is ever used; reported for the receipt. */
  confidence: number;
  /** Why this message was accepted, in words a person can check. */
  why: string;
};

/**
 * Sender domains, per applicant tracking system.
 *
 * The strongest available signal: a code from `myworkday.com` cannot be for a
 * Greenhouse application no matter when it arrived.
 */
const ATS_DOMAINS: Record<string, RegExp> = {
  greenhouse: /(^|\.)greenhouse\.io$/i,
  lever: /(^|\.)lever\.co$/i,
  ashby: /(^|\.)ashbyhq\.com$/i,
  workday: /(^|\.)(myworkday|workday)\.com$/i,
  smartrecruiters: /(^|\.)smartrecruiters\.com$/i,
  icims: /(^|\.)icims\.com$/i,
  oracle: /(^|\.)oraclecloud\.com$/i,
  bamboohr: /(^|\.)bamboohr\.com$/i,
};

/** Words that carry no identifying weight in a company name. */
const NOISE = new Set(['inc', 'llc', 'ltd', 'corp', 'corporation', 'the', 'group', 'company', 'co', 'technologies']);

/** Distinctive lowercase tokens of a company name. */
export function companyTokens(company: string): string[] {
  return company
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !NOISE.has(t));
}

function domainOf(address: string): string {
  return address.split('@').pop()?.trim().toLowerCase() ?? '';
}

/**
 * How well one message answers one expectation.
 *
 * Additive, and every term is a fact about the message rather than an
 * impression of it. The timing term deliberately contributes nothing on its
 * own — "arrived recently" describes every message in a busy mailbox, and
 * treating it as evidence is how the original bug behaved.
 */
export function scoreCandidate(
  expect: OtpExpectation,
  mail: MailCandidate,
  now = Date.now(),
): { score: number; why: string } {
  const reasons: string[] = [];
  let score = 0;

  const domain = domainOf(mail.fromAddr);
  const atsPattern = ATS_DOMAINS[expect.ats];

  if (atsPattern && domain && atsPattern.test(domain)) {
    score += 0.5;
    reasons.push(`sent from ${domain}, which is ${expect.ats}`);
  }

  /*
   * Company tokens, matched on word boundaries rather than as substrings.
   *
   * A plain `includes` accepted "one" from "Capital One" inside the word
   * "Someone", so a message from an unrelated employer scored as a name match.
   * A short token is also required to be accompanied by a substantial one:
   * "one" alone identifies nobody, and treating it as evidence reintroduces
   * the same false positive by a different route.
   */
  const tokens = companyTokens(expect.company);
  const haystack = `${domain} ${mail.company} ${mail.subject}`.toLowerCase();
  /* No escaping needed: `companyTokens` splits on every non-alphanumeric, so
     a token can only ever be [a-z0-9]+. */
  const named = tokens.filter((t) => new RegExp(`\\b${t}\\b`).test(haystack));
  const substantial = named.some((t) => t.length >= 4) || (named.length > 0 && named.length === tokens.length);

  if (substantial) {
    score += 0.5;
    reasons.push(`names ${named.join(', ')}`);
  }

  /* Timing is a filter, not evidence. Outside the window nothing else can
     rescue the message; inside it, it adds nothing by itself. */
  const early = mail.receivedAt < expect.since - 60_000;
  const late = mail.receivedAt > expect.expiresAt || mail.receivedAt > now + 60_000;
  if (early || late) return { score: 0, why: 'outside the window this application opened' };

  return { score, why: reasons.join('; ') };
}

/** Below this, the message is not confidently for this application. */
const THRESHOLD = 0.5;

/**
 * Pick the code for one application, or null.
 *
 * Two ways to get nothing back, and both are correct outcomes: no message
 * scores high enough, or two score equally. A tie is genuinely ambiguous —
 * two employers on the same ATS verifying within the same minute — and
 * choosing between them is a coin flip whose losing side puts one employer's
 * code into another's form.
 */
export function matchOtp(
  expect: OtpExpectation,
  candidates: MailCandidate[],
  now = Date.now(),
): OtpMatch | null {
  const scored = candidates
    .filter((m) => m.otp.trim() !== '')
    .map((mail) => ({ mail, ...scoreCandidate(expect, mail, now) }))
    .filter((s) => s.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score || b.mail.receivedAt - a.mail.receivedAt);

  if (scored.length === 0) return null;

  const best = scored[0];
  const tied = scored.filter((s) => s.score === best.score);
  if (tied.length > 1) {
    /* Same score from two different messages. Only a tie between *different*
       codes is ambiguous — the same code delivered twice is just a duplicate. */
    const codes = new Set(tied.map((s) => s.mail.otp));
    if (codes.size > 1) return null;
  }

  return { code: best.mail.otp, messageId: best.mail.id, confidence: best.score, why: best.why };
}

/* ── Verification links ──────────────────────────────────────────────────── */

/**
 * May this link be opened for this application?
 *
 * A verification email is an instruction arriving from outside the system, and
 * the link in it is attacker-controllable in the general case — anyone who
 * knows the candidate's application address can send one. Opening it because
 * an email said to is the same mistake as following instructions found in a
 * web page.
 *
 * So the link is opened only when its host is the ATS the application is
 * actually on, or the employer's own domain. Anything else is handed to the
 * candidate.
 */
export function mayFollowLink(expect: OtpExpectation, link: string): boolean {
  let host = '';
  try {
    const url = new URL(link);
    if (url.protocol !== 'https:') return false;
    host = url.hostname.toLowerCase();
  } catch {
    return false;
  }

  const atsPattern = ATS_DOMAINS[expect.ats];
  if (atsPattern && atsPattern.test(host)) return true;

  /*
   * The employer's own domain, matched against a whole label.
   *
   * A substring test let `capital-one-verify.ru` through, because the host
   * contains "capital" — which is precisely the lookalike domain a phishing
   * mail to a known application address would use. The company's distinctive
   * tokens must instead make up an entire label of the host: "capitalone"
   * matches `careers.capitalone.com` and not `capital-one-verify.ru`.
   */
  const wanted = companyTokens(expect.company).join('');
  if (!wanted) return false;
  return host.split('.').some((label) => label.replace(/-/g, '') === wanted);
}
