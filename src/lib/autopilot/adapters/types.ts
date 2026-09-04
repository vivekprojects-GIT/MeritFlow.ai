import type { FormQuestion, ResolvedAnswer } from '../answer-vault';
import type { AtsVendor } from '../execution-policy';
import type { FieldResolver } from '../navigator/types';

/**
 * The ATS adapter interface.
 *
 * One shape for every applicant tracking system, so the workflow above it never
 * learns which vendor it is talking to. That is what makes the execution policy
 * enforceable: the decision about whether to submit is made once, in the
 * workflow, against policy data — not scattered through nine vendor-specific
 * code paths where one could quietly forget to check.
 *
 * `submit` is deliberately absent from the dry-run contract. An adapter that
 * cannot submit cannot accidentally submit, and adding the capability later is
 * a visible, reviewable change rather than a flag someone flips.
 */

export type FieldMapping = {
  field: string;
  /** Where the value came from: a profile path, the vault, or a file. */
  source: 'profile' | 'vault' | 'file' | 'generated';
  value: string;
};

/**
 * What an adapter may be given beyond the URL.
 *
 * Optional throughout, so an adapter that reads a structured API — Greenhouse —
 * ignores all of it, while one driving a live multi-page form can resolve each
 * page's questions as that page appears. A wizard does not show step four until
 * step three is finished, so the answers cannot all be looked up in advance.
 */
export type AdapterContext = {
  resolve?: FieldResolver;
  /** A real file on disk to attach when a form asks for a CV. */
  resumePath?: string | null;
};

export type InspectResult = {
  ats: AtsVendor;
  /** The application URL that was inspected, so submission targets the same page. */
  url: string;
  /** The posting as the ATS describes it — used to confirm we have the right one. */
  title: string;
  company: string;
  /** Every question the form asks, including the ones we will not answer. */
  questions: FormQuestion[];
  /** True when the application requires an account before it can be started. */
  requiresAccount: boolean;
  /** True when a CAPTCHA or similar human challenge is present. */
  requiresHumanChallenge: boolean;
  /**
   * The application continues past the page we were able to read.
   *
   * Set by the navigator when it stops at the first step of a wizard. The
   * questions listed above are therefore step one's, not the whole
   * application's — which the receipt has to say, or a candidate reads "3
   * questions" and gets a surprise on step four.
   */
  multiStep?: boolean;
};

export type FillResult = {
  mappings: FieldMapping[];
  answers: ResolvedAnswer[];
  resumeFileName: string | null;
  /** Fields the adapter could not fill, with the reason. */
  unfilled: { field: string; reason: string }[];
};

export type ValidationResult = {
  valid: boolean;
  /** Required fields still empty after filling. */
  missing: string[];
  /** Anything the ATS itself would reject. */
  errors: string[];
};

export type ApplicationReceipt = {
  company: string;
  role: string;
  ats: AtsVendor;
  /** DRY_RUN until an execution path is approved and used. */
  mode: 'DRY_RUN' | 'SUBMITTED';
  preparedAt: number;
  resumeFileName: string | null;
  /** What was tailored for this posting, and what was dropped for lacking evidence. */
  tailoring?: {
    summary: string;
    bullets: string[];
    emphasised: string[];
    gaps: string[];
    dropped: string[];
    coverLetter: string;
    coverLetterFileName: string;
    /**
     * The résumé the employer actually receives, as text.
     *
     * Carried on the receipt because a candidate is entitled to read the
     * document being sent in their name before it goes. Showing a list of
     * emphasised skills is a description of the document; this is the document.
     */
    document: string;
    /** The original résumé's fit, and the tailored one's, on the same scorer. */
    fitBefore: number;
    fitAfter: number;
    /**
     * True when tailoring scored worse than the original and was discarded.
     *
     * Worth surfacing rather than hiding: a posting where optimisation makes
     * the résumé fit less well is usually one where the candidate's own résumé
     * was already the better match.
     */
    usedOriginal?: boolean;
  };
  /**
   * The application continues past what was read.
   *
   * Carried onto the receipt so "4 questions answered" is not read as the whole
   * application when it is step one of five.
   */
  multiStep?: boolean;
  fields: FieldMapping[];
  answers: { question: string; intent: string | null; value: string | null; provenance: string | null }[];
  /**
   * What still needs the candidate.
   *
   * `kind` and `required` travel with it so the interface can ask properly —
   * a dropdown rendered as a free-text box invites an answer the form will
   * reject, and asking about an optional field with the same urgency as a
   * required one is how a candidate learns to ignore the list.
   */
  unresolved: { question: string; reason: string; kind: FormQuestion['kind']; required: boolean }[];
  validation: ValidationResult;
  executionPolicy: { status: string; rationale: string };
  /** Set only on a real submission. Absent on every dry run. */
  /**
   * Proof the employer received it, and what that proof was.
   *
   * `evidence` is optional only because receipts written before it existed do
   * not have it. A new submission without it would mean the send was recorded
   * on nothing checkable, which is the failure this field was added for.
   */
  confirmation?: { reference: string; capturedAt: number; evidence?: string[] };
};

/**
 * What every adapter must implement.
 *
 * Note the absence of `submit()`. The live interface will extend this one; the
 * dry-run contract stops at `validate` and `receipt` by construction.
 */
export interface AtsAdapter {
  readonly vendor: AtsVendor;
  /** Can this adapter handle the URL? */
  detect(url: string): boolean;
  /** Read the real application: its fields, its questions, its gates. */
  inspect(url: string, ctx?: AdapterContext): Promise<InspectResult>;
  /** Map profile and vault data onto the form. Never submits. */
  fill(input: { inspect: InspectResult; answers: ResolvedAnswer[]; profile: Record<string, string>; resumeFileName: string | null }): FillResult;
  /** Would the ATS accept this? Structural check only. */
  validate(input: { inspect: InspectResult; fill: FillResult }): ValidationResult;

  /**
   * Send the application for real.
   *
   * Optional, and absent on any adapter whose submission path has not been
   * built. The workflow additionally requires the execution policy to permit
   * this vendor, so an implemented `submit` is necessary but never sufficient.
   *
   * `requestOtp` is provided so an adapter can wait on a code sent to the
   * candidate's application address. Returning `needsUser` parks the run
   * instead of failing it: a CAPTCHA or an account wall is a handoff, not an
   * error, and nothing here may attempt to defeat either.
   */
  submit?(input: {
    inspect: InspectResult;
    fill: FillResult;
    resumeFileName: string | null;
    /** A real file on disk to attach. Null means no CV goes with this. */
    resumePath: string | null;
    requestOtp: () => Promise<string | null>;
    /**
     * Answer questions that only appear partway through a multi-page form.
     *
     * Absent for adapters whose whole form is known up front. Where it is
     * supplied it never invents anything — a question it cannot answer comes
     * back as a refusal, and the run parks on it.
     */
    resolve?: FieldResolver;
  }): Promise<SubmitResult>;
}

export type SubmitResult =
  | { outcome: 'submitted'; reference: string; evidence: string[] }
  /**
   * The control was clicked and nothing proved the employer received it.
   *
   * Deliberately not `submitted` and deliberately not `failed`. It may well
   * have gone through — an ATS that renders its confirmation into a frame, or
   * behind a redirect we did not follow, looks exactly like one that silently
   * rejected the post. Calling it either way states something unknown as fact,
   * and the tracker is built on the difference.
   */
  | { outcome: 'unconfirmed'; reason: string; evidence: string[] }
  | { outcome: 'needsUser'; reason: string }
  | { outcome: 'failed'; reason: string };
