import { getDb } from '../db';
import {
  autopilotEligible,
  canonicalize,
  getVault,
  isLearned,
  learnedKey,
  saveAnswer,
  type Provenance,
  type QuestionClass,
} from './answer-vault';

/**
 * The answer book.
 *
 * ## What it is for
 *
 * An application stops on a question nobody can answer for the candidate —
 * "How many years with Kubernetes?", "What is your notice period?". Before this
 * existed, that question stopped the next application too, and the one after
 * that, because nothing remembered the answer. The candidate typed it every
 * time and the system learned nothing.
 *
 * So: the résumé answers what it can, the account answers what it holds, and
 * whatever is left is asked **once**. The answer is written here, and every
 * future form asking that same question is filled without stopping.
 *
 * ## Why it is a document, not a hidden table
 *
 * Everything in here goes onto real job applications in the candidate's name.
 * They are entitled to read the whole set, correct anything wrong, and delete
 * anything they would rather be asked about again — which is why this renders
 * to a plain Markdown file they can edit and paste back. A store of statements
 * made on someone's behalf that they cannot inspect is not a feature.
 *
 * ## What it deliberately will not do
 *
 * Infer. An entry exists because the candidate wrote it or because it is a
 * verbatim copy from their own résumé. Nothing here is derived, averaged, or
 * filled in by a model, and an entry that reads as a legal attestation is kept
 * but never used unattended — see `ATTESTATION_SHAPE` in the vault.
 */

export type BookEntry = {
  /** The vault key. `LEARNED.*` for questions no intent registry covers. */
  intent: string;
  /** The question as a human reads it. */
  question: string;
  value: string;
  provenance: Provenance;
  sensitivity: QuestionClass;
  /** Whether Autopilot may use this without stopping to ask. */
  auto: boolean;
  updatedAt: number;
  /** `learned` came from a form; `standard` is a question the system knows. */
  source: 'learned' | 'standard';
};

/**
 * Readable names for the canonical intents.
 *
 * The key is a routing identifier, not language — showing someone
 * `LOGISTICS.ONSITE` and asking them to confirm it is right is not showing them
 * anything. Any intent missing here falls back to its key, which is a visible
 * prompt to add it rather than a silent gap.
 */
const NAMES: Record<string, string> = {
  'PROFILE.FIRST_NAME': 'First name',
  'PROFILE.LAST_NAME': 'Last name',
  'PROFILE.FULL_NAME': 'Full name',
  'PROFILE.EMAIL': 'Email address',
  'PROFILE.PHONE': 'Phone number',
  'PROFILE.ADDRESS': 'Street address',
  'PROFILE.CITY': 'City',
  'PROFILE.STATE': 'State or province',
  'PROFILE.ZIP': 'Postal code',
  'PROFILE.COUNTRY': 'Country',
  'PROFILE.LINKEDIN': 'LinkedIn profile',
  'PROFILE.GITHUB': 'GitHub profile',
  'PROFILE.PORTFOLIO': 'Portfolio',
  'PROFILE.WEBSITE': 'Personal website',
  'PROFILE.RESUME': 'Résumé',
  'PROFILE.COVER_LETTER': 'Cover letter',
  'WORK_AUTH.AUTHORIZED': 'Are you authorised to work in this country?',
  'WORK_AUTH.SPONSORSHIP': 'Will you need visa sponsorship?',
  'LOGISTICS.RELOCATION': 'Are you willing to relocate?',
  'LOGISTICS.ONSITE': 'Can you work onsite or hybrid?',
  'LOGISTICS.START_DATE': 'When can you start?',
  'LOGISTICS.TRANSPORT': 'Do you have reliable transport?',
  'COMPENSATION.EXPECTED': 'Expected compensation',
  'EDUCATION.SCHOOL': 'School or university',
  'EDUCATION.DEGREE': 'Degree',
  'EDUCATION.GRADUATION': 'Graduation date',
  'HISTORY.CURRENT_EMPLOYER': 'Current employer',
  'HISTORY.CURRENT_TITLE': 'Current job title',
  'HISTORY.PREVIOUS_EMPLOYMENT': 'Have you worked here before?',
  'HISTORY.REFERRAL': 'How did you hear about this role?',
  'CLEARANCE.SECURITY': 'Do you hold a security clearance?',
  'ACCOMMODATION.NEEDED': 'Do you need an accommodation to apply?',
  'BACKGROUND.FOREIGN_TIES': 'Foreign government or military ties',
  'DEMOGRAPHIC.VOLUNTARY': 'Voluntary demographic information',
  'ATTESTATION.CERTIFY': 'Certification that your answers are true',
  'ESSAY.WHY_COMPANY': 'Why do you want to work here?',
};

/** A question's display name: the employer's wording where we captured it. */
export function nameFor(intent: string, label: string): string {
  if (label.trim()) return label.trim();
  return NAMES[intent] ?? intent;
}

export async function listBook(userId: string): Promise<BookEntry[]> {
  const vault = await getVault(userId);
  return [...vault.values()]
    .map((a) => ({
      intent: a.intent,
      question: nameFor(a.intent, a.label ?? ''),
      value: a.value,
      provenance: a.provenance,
      sensitivity: a.sensitivity,
      auto: a.autopilotOk,
      updatedAt: a.updatedAt,
      source: (isLearned(a.intent) ? 'learned' : 'standard') as BookEntry['source'],
    }))
    .sort((a, b) => a.question.localeCompare(b.question));
}

/**
 * Record the candidate's answer to a question an application stopped on.
 *
 * The question's own wording decides where it is filed. If the registry
 * recognises it, the answer lands on the canonical intent and every phrasing of
 * that question is now covered. If it does not, the answer is filed under the
 * exact wording, and only that wording will match — see `learnedKey` for why
 * the matching is deliberately literal.
 */
export async function learnAnswer(
  userId: string,
  input: { question: string; value: string },
): Promise<BookEntry | null> {
  const question = input.question.trim();
  const value = input.value.trim();
  if (!question || !value) return null;

  const canon = canonicalize(question);
  const intent = canon?.intent ?? learnedKey(question);
  if (!intent) return null;

  const sensitivity = canon?.sensitivity ?? 'NORMAL_FACT';

  const saved = await saveAnswer(userId, {
    intent,
    /* Stored for canonical intents too, so the book shows the candidate the
       question they actually answered rather than the one we filed it under. */
    label: canon ? '' : question,
    value,
    /* The candidate typed this, looking at the form that asked for it. There is
       no stronger provenance available anywhere in this system. */
    provenance: 'USER_VERIFIED',
    verified: true,
    sensitivity,
  });

  return {
    intent,
    question: nameFor(intent, canon ? '' : question),
    value: saved.value,
    provenance: saved.provenance,
    sensitivity: saved.sensitivity,
    auto: saved.autopilotOk,
    updatedAt: saved.updatedAt,
    source: isLearned(intent) ? 'learned' : 'standard',
  };
}

/** Forget one answer, so the next application asks about it again. */
export async function forgetAnswer(userId: string, intent: string): Promise<void> {
  const db = await getDb();
  await db.query('DELETE FROM answer_vault WHERE user_id = $1 AND intent = $2', [userId, intent]);
}

/* ── The editable file ───────────────────────────────────────────────────── */

/**
 * Render the book as Markdown.
 *
 * The intent key travels in a fenced tag on its own line so a round trip is
 * lossless: an answer edited in a text editor lands back on the same question
 * rather than becoming a second, near-duplicate entry.
 */
export function toMarkdown(entries: BookEntry[]): string {
  const out: string[] = [
    '# My application answers',
    '',
    'Autopilot fills job applications from this file.',
    '',
    '- Edit an answer and every future application uses the new one.',
    '- Delete an entry and the next application that asks will stop and ask you.',
    '- Keep the `key:` line — it is how an edited answer finds its way back.',
    '',
  ];

  const groups: [BookEntry['source'], string][] = [
    ['standard', 'Standard questions'],
    ['learned', 'Learned from forms you filled'],
  ];

  for (const [source, heading] of groups) {
    const rows = entries.filter((e) => e.source === source);
    if (rows.length === 0) continue;
    out.push(`## ${heading}`, '');
    for (const e of rows) {
      out.push(`### ${e.question}`, '', `key: \`${e.intent}\``, '', e.value, '');
      if (!e.auto) {
        out.push(
          e.sensitivity === 'LEGAL_ATTESTATION'
            ? '> Kept for reference. Only you can agree to this, so Autopilot will always hand it back to you.'
            : '> Stored, but Autopilot will still check with you before using it.',
          '',
        );
      }
    }
  }

  return out.join('\n');
}

/**
 * Read an edited file back.
 *
 * Anything that does not parse is skipped rather than guessed at — a mangled
 * entry becoming a wrong answer on a real application is a far worse outcome
 * than that entry going missing and the next form asking about it.
 */
export function fromMarkdown(text: string): { question: string; intent: string; value: string }[] {
  const out: { question: string; intent: string; value: string }[] = [];
  const blocks = text.split(/^###\s+/m).slice(1);

  for (const block of blocks) {
    const lines = block.split(/\r?\n/);
    const question = (lines.shift() ?? '').trim();
    if (!question) continue;

    const keyLine = lines.findIndex((l) => /^key:\s*`?[A-Z][A-Z0-9_.-]*`?\s*$/i.test(l.trim()));
    if (keyLine === -1) continue;
    const intent = lines[keyLine].replace(/^key:\s*/i, '').replace(/`/g, '').trim();

    /* An answer ends where the next section begins. Splitting on `###` alone
       let the last entry in a group swallow the `## Learned from...` heading
       that followed it, so a round trip through the file corrupted one answer
       per group -- always the last, which is the one least likely to be read. */
    const body = lines.slice(keyLine + 1);
    const nextHeading = body.findIndex((l) => /^#{1,3}\s/.test(l));
    const value = (nextHeading === -1 ? body : body.slice(0, nextHeading))
      /* Callout lines are ours, not the candidate's answer. */
      .filter((l) => !l.trim().startsWith('>'))
      .join('\n')
      .trim();

    if (intent && value) out.push({ question, intent, value });
  }

  return out;
}

/**
 * Replace the book with an edited file.
 *
 * Entries the file no longer mentions are left alone rather than deleted: a
 * partial paste is a likelier explanation than an intent to forget everything,
 * and deleting an answer is available on its own.
 */
export async function applyMarkdown(userId: string, text: string): Promise<number> {
  const parsed = fromMarkdown(text);
  let written = 0;

  for (const row of parsed) {
    const canon = canonicalize(row.question);
    /* The key in the file wins over what the wording would canonicalise to.
       The candidate may have reworded a question while editing, and moving
       their answer to a different intent because of a typo would be silent. */
    const intent = row.intent;
    const sensitivity = canon?.sensitivity ?? 'NORMAL_FACT';

    await saveAnswer(userId, {
      intent,
      label: isLearned(intent) ? row.question : '',
      value: row.value,
      provenance: 'USER_VERIFIED',
      verified: true,
      sensitivity,
    });
    written += 1;
  }

  return written;
}

/** Exported for the API's own sanity check. */
export { autopilotEligible };
