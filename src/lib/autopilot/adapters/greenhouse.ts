import type { AtsAdapter, FillResult, InspectResult, SubmitResult, ValidationResult, FieldMapping } from './types';
import type { FormQuestion, ResolvedAnswer } from '../answer-vault';

/**
 * Greenhouse adapter.
 *
 * Reads the application through Greenhouse's **public job-board API** rather
 * than by driving a browser. That is a deliberate architectural choice, not a
 * convenience: the instruction is to prefer official interfaces where they
 * exist, and this one returns the questions, their types, and their required
 * flags as structured data. Scraping the same page would be slower, more
 * fragile, and would tell us less.
 *
 *   https://boards-api.greenhouse.io/v1/boards/{board}/jobs/{id}?questions=true
 *
 * Reading and submitting use different mechanisms on purpose. Inspection goes
 * through the API because it is structured and stable. Submission has to drive
 * a browser, because Greenhouse offers candidates no submission API.
 *
 * `submit` exists but is unreachable unless the operator has named greenhouse
 * in AUTOPILOT_SUBMIT_ENABLED *and* the run cleared the verifier and
 * validation. Defining the method does not turn the path on.
 */

const API = 'https://boards-api.greenhouse.io/v1/boards';

/** Greenhouse's field types, mapped to ours. */
function kindOf(type: string): FormQuestion['kind'] {
  switch (type) {
    case 'input_file':
      return 'file';
    case 'textarea':
      return 'textarea';
    case 'multi_value_single_select':
    case 'multi_value_multi_select':
      return 'select';
    case 'boolean':
      return 'boolean';
    default:
      return 'text';
  }
}

type GhField = { name: string; type: string; values?: { label: string; value: string | number }[] };
type GhQuestion = { label: string; required: boolean; fields: GhField[] };
type GhJob = { title?: string; company_name?: string; questions?: GhQuestion[]; location?: { name: string } };

/** `https://boards.greenhouse.io/acme/jobs/12345` → `{ board: 'acme', id: '12345' }` */
export function parseGreenhouseUrl(url: string): { board: string; id: string } | null {
  try {
    const u = new URL(url);
    if (!u.hostname.includes('greenhouse.io')) return null;
    /* Two shapes in the wild: /{board}/jobs/{id} and ?gh_jid={id} on an
       embedded board. Both resolve to the same API call. */
    const parts = u.pathname.split('/').filter(Boolean);
    const jobsAt = parts.indexOf('jobs');
    if (jobsAt > 0 && parts[jobsAt + 1]) return { board: parts[jobsAt - 1], id: parts[jobsAt + 1] };
    const jid = u.searchParams.get('gh_jid');
    if (jid && parts[0]) return { board: parts[0], id: jid };
    return null;
  } catch {
    return null;
  }
}

export class GreenhouseAdapter implements AtsAdapter {
  readonly vendor = 'greenhouse' as const;

  detect(url: string): boolean {
    return parseGreenhouseUrl(url) !== null;
  }

  async inspect(url: string): Promise<InspectResult> {
    const parsed = parseGreenhouseUrl(url);
    if (!parsed) throw new Error('Not a Greenhouse application URL.');

    const res = await fetch(`${API}/${parsed.board}/jobs/${parsed.id}?questions=true`, {
      headers: { accept: 'application/json' },
      /* A hung ATS must not hold a worker open indefinitely. */
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Greenhouse returned ${res.status} for ${parsed.board}/${parsed.id}.`);

    const job = (await res.json()) as GhJob;
    const questions: FormQuestion[] = [];

    for (const q of job.questions ?? []) {
      /* One Greenhouse "question" can carry several fields (a file upload
         exposes three). The first field carries the semantics; the rest are
         alternate input methods for the same answer. */
      const field = q.fields?.[0];
      if (!field) continue;
      questions.push({
        id: field.name,
        label: q.label,
        required: Boolean(q.required),
        kind: kindOf(field.type),
      });
    }

    return {
      ats: 'greenhouse',
      url,
      title: job.title ?? '',
      company: job.company_name ?? parsed.board,
      questions,
      /* Greenhouse's own boards do not require a candidate account. */
      requiresAccount: false,
      /* The board API does not expose one; a browser path would need to check. */
      requiresHumanChallenge: false,
    };
  }

  fill(input: {
    inspect: InspectResult;
    answers: ResolvedAnswer[];
    profile: Record<string, string>;
    resumeFileName: string | null;
  }): FillResult {
    const { inspect, answers, profile, resumeFileName } = input;
    const mappings: FieldMapping[] = [];
    const unfilled: { field: string; reason: string }[] = [];

    /* Greenhouse's standard identity fields have stable names across boards. */
    const PROFILE_FIELDS: Record<string, string> = {
      first_name: 'firstName',
      last_name: 'lastName',
      email: 'email',
      phone: 'phone',
    };

    const byId = new Map(answers.map((a) => [a.question.id, a]));

    for (const q of inspect.questions) {
      /* 1. Identity from the candidate profile. */
      /* A blank profile slot falls through to the vault below, for the same
         reason as the generic adapter: the two stores hold the same facts and
         only one of them being filled is not a missing answer. */
      const profileKey = PROFILE_FIELDS[q.id];
      if (profileKey && profile[profileKey]) {
        mappings.push({ field: q.id, source: 'profile', value: profile[profileKey] });
        continue;
      }

      /* 2. The résumé file. */
      if (q.kind === 'file') {
        if (resumeFileName) mappings.push({ field: q.id, source: 'file', value: resumeFileName });
        else if (q.required) unfilled.push({ field: q.label, reason: 'No tailored résumé prepared.' });
        continue;
      }

      /* 3. Everything else from the Answer Vault, and only when the stored
            answer is cleared for unattended use. */
      const resolved = byId.get(q.id);
      if (resolved?.value && !resolved.blockedReason) {
        mappings.push({ field: q.id, source: 'vault', value: resolved.value });
      } else if (q.required) {
        unfilled.push({ field: q.label, reason: resolved?.blockedReason ?? 'No verified answer.' });
      }
    }

    return { mappings, answers, resumeFileName, unfilled };
  }

  validate(input: { inspect: InspectResult; fill: FillResult }): ValidationResult {
    const { inspect, fill } = input;
    const filled = new Set(fill.mappings.map((m) => m.field));
    const missing = inspect.questions.filter((q) => q.required && !filled.has(q.id)).map((q) => q.label);

    const errors: string[] = [];
    const email = fill.mappings.find((m) => m.field === 'email')?.value;
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.push('Email address is not valid.');

    return { valid: missing.length === 0 && errors.length === 0, missing, errors };
  }

  /**
   * Send the application through a headless browser.
   *
   * Present, but only reachable when the execution policy permits Greenhouse —
   * which requires the operator to have set AUTOPILOT_SUBMIT_ENABLED. Having
   * the method does not enable the path; the workflow checks four separate
   * conditions before it is ever called.
   */
  async submit(input: {
    inspect: InspectResult;
    fill: FillResult;
    resumeFileName: string | null;
    resumePath: string | null;
    requestOtp: () => Promise<string | null>;
  }): Promise<SubmitResult> {
    const { browserSubmit } = await import('./browser');
    const result = await browserSubmit({
      url: input.inspect.url,
      vendor: 'greenhouse',
      inspect: input.inspect,
      fill: input.fill,
      resumePath: input.resumePath,
      requestOtp: input.requestOtp,
      reallySubmit: true,
    });
    return result;
  }
}

export const greenhouseAdapter = new GreenhouseAdapter();
