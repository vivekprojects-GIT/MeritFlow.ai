/**
 * Classifying application mail.
 *
 * Deterministic on purpose. Recruiting mail is templated — the same dozen
 * phrases recur across every ATS — so patterns beat a model here on cost,
 * latency and, most importantly, testability: every rule below is pinned by a
 * case, and a regression shows up as a failing test rather than as drift
 * nobody notices.
 *
 * Order matters. A rejection that opens "thank you for your interest" and an
 * interview invitation that opens the same way are separated by the presence
 * of a decision, so decisive categories are checked before polite ones.
 */

export const CATEGORIES = [
  'VERIFICATION',
  'REJECTION',
  'INTERVIEW',
  'ASSESSMENT',
  'OFFER',
  'REMINDER',
  'APPLIED',
  'OTHER',
] as const;

export type MailCategory = (typeof CATEGORIES)[number];

/** How each category reads to a person, and how it should be coloured. */
export const CATEGORY_META: Record<MailCategory, { label: string; tone: 'info' | 'bad' | 'good' | 'warn' | 'neutral' }> = {
  VERIFICATION: { label: 'Verification', tone: 'info' },
  REJECTION: { label: 'Rejection', tone: 'bad' },
  INTERVIEW: { label: 'Interview', tone: 'good' },
  ASSESSMENT: { label: 'Assessment', tone: 'warn' },
  OFFER: { label: 'Offer', tone: 'good' },
  REMINDER: { label: 'Reminder', tone: 'warn' },
  APPLIED: { label: 'Applied', tone: 'neutral' },
  OTHER: { label: 'Other', tone: 'neutral' },
};

type Rule = { category: MailCategory; patterns: RegExp[] };

/*
 * Checked top to bottom, first match wins.
 *
 * Rejection sits above interview because rejection letters routinely mention
 * interviews ("we have decided to move forward with other candidates we
 * interviewed"), while genuine invitations rarely mention a decision against
 * the candidate.
 */
const RULES: Rule[] = [
  {
    category: 'VERIFICATION',
    patterns: [
      /\bverif(y|ication)\s+(your\s+)?(email|address|account)\b/i,
      /\b(confirm|activate)\s+your\s+(email|account)\b/i,
      /\b(one[-\s]?time|verification|security)\s+code\b/i,
      /\breset\s+your\s+password\b/i,
    ],
  },
  {
    category: 'REJECTION',
    patterns: [
      /\b(not|unable to)\s+(be\s+)?(moving|move|proceed(ing)?)\s+forward\b/i,
      /\bmov(e|ing)\s+forward\s+with\s+other\s+candidates\b/i,
      /\bdecided\s+(not\s+to\s+proceed|to\s+pursue\s+other)\b/i,
      /\bwe\s+(will\s+not|won'?t)\s+be\s+(proceeding|continuing)\b/i,
      /\byour\s+application\s+(was\s+)?(unsuccessful|not\s+selected)\b/i,
      /\bnot\s+(been\s+)?selected\s+for\s+(this|the)\s+(role|position)\b/i,
      /\bpursu(e|ing)\s+other\s+applicants\b/i,
      /\bkeep\s+your\s+(resume|CV|details)\s+on\s+file\b/i,
    ],
  },
  {
    category: 'OFFER',
    patterns: [
      /\b(offer\s+of\s+employment|employment\s+offer|job\s+offer)\b/i,
      /\bpleased\s+to\s+offer\s+you\b/i,
      /\bwe'?d?\s+like\s+to\s+(extend|make)\s+(you\s+)?an\s+offer\b/i,
      /\boffer\s+letter\b/i,
    ],
  },
  {
    category: 'ASSESSMENT',
    patterns: [
      /\b(coding|technical|online|skills?)\s+(assessment|challenge|test|exercise)\b/i,
      /\btake[-\s]?home\b/i,
      /\b(hackerrank|codility|codesignal|karat|woven|coderbyte)\b/i,
      /\bcomplete\s+(the|this|a|an)\s+(assessment|test|challenge)\b/i,
    ],
  },
  {
    category: 'INTERVIEW',
    patterns: [
      /\b(schedule|book|arrange)\s+(a|an|your|the)?\s*(call|interview|chat|screen)\b/i,
      /\binvit(e|ing|ation)\s+(you\s+)?(to|for)\s+(an?\s+)?(interview|call|conversation)\b/i,
      /\b(phone|video|onsite|on[-\s]site|final|first[-\s]round)\s+interview\b/i,
      /\binterview\s+(invitation|request|confirmed|scheduled)\b/i,
      /\b(would|are)\s+you\s+available\s+(for|to)\b/i,
      /\bset\s+up\s+(a\s+)?time\s+to\s+(talk|chat|speak)\b/i,
      /\b(calendly|savvycal|cal\.com)\b/i,
    ],
  },
  {
    category: 'REMINDER',
    patterns: [
      /\b(reminder|don'?t\s+forget|following\s+up|friendly\s+nudge)\b/i,
      /\b(expires?|deadline|closing)\s+(soon|today|tomorrow|in\s+\d+)\b/i,
      /\bincomplete\s+application\b/i,
      /\bfinish\s+your\s+application\b/i,
    ],
  },
  {
    category: 'APPLIED',
    patterns: [
      /\breceiv(ed|ing)\s+your\s+application\b/i,
      /\byour\s+application\s+(has\s+been\s+)?(received|submitted)\b/i,
      /* "Thank you for applying" is the single most common acknowledgement
         wording, and an earlier version missed it by not allowing the "you"
         between the thanks and the "for". */
      /\bthanks?\s+(you\s+)?for\s+(applying|your\s+application)\b/i,
      /* Bare subject lines carry no pronoun at all: "Application received". */
      /\bapplication\s+(received|submitted|confirmation)\b/i,
    ],
  },
];

/**
 * Classify one message.
 *
 * Subject is weighted by being scanned first: recruiting subjects are
 * unusually informative ("Interview invitation — Acme"), while bodies carry
 * boilerplate footers that mention every stage of a hiring process.
 */
export function classifyMail(subject: string, body: string): MailCategory {
  const subj = subject ?? '';
  /* Signature blocks and unsubscribe footers generate most false positives, so
     only the top of a message is considered. */
  const head = (body ?? '').slice(0, 2500);

  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(subj))) return rule.category;
  }
  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(head))) return rule.category;
  }
  return 'OTHER';
}

/* ── Interview timing ────────────────────────────────────────────────────── */

export type DetectedEvent = { startsAt: number | null; location: string; scheduleUrl: string };

const MONTHS = [
  'january','february','march','april','may','june','july','august','september','october','november','december',
];

/**
 * Pull a date and time out of an invitation.
 *
 * Returns null for `startsAt` far more often than it returns a value, and that
 * is the intended behaviour: a wrong interview time in someone's calendar is
 * materially worse than an empty one, so anything ambiguous is left for the
 * person to fill in. Nothing here is treated as confirmed.
 */
export function detectEvent(text: string, now = Date.now()): DetectedEvent {
  const t = text ?? '';

  const scheduleUrl =
    t.match(/https?:\/\/(?:\w+\.)?(?:calendly\.com|savvycal\.com|cal\.com)\/[^\s<>"')]+/i)?.[0] ?? '';
  const location =
    t.match(/https?:\/\/(?:\w+\.)?(?:zoom\.us|meet\.google\.com|teams\.microsoft\.com)\/[^\s<>"')]+/i)?.[0] ?? '';

  /* "March 12, 2026 at 2:30 PM" and "12 March 2026, 14:30" are the two shapes
     that appear in practice. Both need an explicit year or an explicit month
     name — a bare "12/03" is ambiguous between two continents and is skipped. */
  const monthName = MONTHS.join('|');
  const md = t.match(
    new RegExp(
      `\\b(?:(${monthName})\\s+(\\d{1,2})|(\\d{1,2})\\s+(${monthName}))(?:st|nd|rd|th)?,?\\s*(\\d{4})?` +
        `(?:[^\\d]{0,12}?(\\d{1,2}):(\\d{2})\\s*(am|pm)?)?`,
      'i',
    ),
  );

  if (!md) return { startsAt: null, location, scheduleUrl };

  const monthText = (md[1] ?? md[4] ?? '').toLowerCase();
  const day = Number(md[2] ?? md[3]);
  const month = MONTHS.indexOf(monthText);
  if (month < 0 || !day) return { startsAt: null, location, scheduleUrl };

  const hh = md[6] ? Number(md[6]) : null;
  const mm = md[7] ? Number(md[7]) : 0;
  const ampm = md[8]?.toLowerCase();
  /* No time means no event: a date alone would put a placeholder at midnight,
     which looks like a real appointment in a calendar. */
  if (hh == null) return { startsAt: null, location, scheduleUrl };

  let hour = hh;
  if (ampm === 'pm' && hour < 12) hour += 12;
  if (ampm === 'am' && hour === 12) hour = 0;

  /* A message with no year almost always means the next occurrence, so an
     invitation received in December for "January 8" lands next year. */
  const year = md[5] ? Number(md[5]) : new Date(now).getFullYear();
  let when = new Date(year, month, day, hour, mm).getTime();
  if (!md[5] && when < now - 86_400_000) when = new Date(year + 1, month, day, hour, mm).getTime();

  if (Number.isNaN(when)) return { startsAt: null, location, scheduleUrl };
  return { startsAt: when, location, scheduleUrl };
}
