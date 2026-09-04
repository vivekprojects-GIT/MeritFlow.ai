'use client';

import { useCallback, useRef, useState } from 'react';
import { Button } from './button';
import { CheckIcon } from './icons';

/**
 * JobPilot onboarding.
 *
 * Six steps, and every answer lands somewhere that already exists: the Answer
 * Vault (keyed by canonical intent) or the Autopilot policy. That is the point
 * of the flow — a candidate answers "will you require sponsorship" once here,
 * and every application that asks it in any wording fills automatically.
 *
 * The résumé parses in the background while the user works through the rest.
 * Blocking on a 30-60 second parse before showing the second question is how a
 * setup flow loses people at step one.
 *
 * Work eligibility is asked **per country**, not once. "Are you authorized to
 * work?" has no answer without a country attached, and storing one global
 * yes/no is how a candidate ends up asserting US authorisation on a Berlin
 * posting.
 */

type Yes = 'yes' | 'no' | 'prefer_not';

type CountryEligibility = { country: string; authorized: Yes | null; sponsorship: Yes | null; basis: string };

type Draft = {
  address: string;
  city: string;
  zip: string;
  county: string;
  country: string;
  state: string;
  phone: string;
  linkedin: string;
  citizenships: string[];
  eligibility: CountryEligibility[];
  inPerson: Yes;
  relocate: Yes;
  startNow: Yes;
  transport: Yes;
  accommodation: Yes;
  clearance: Yes;
  foreignTies: Yes;
  gender: string;
  ethnicity: string;
  veteran: Yes;
  disability: Yes;
  notes: string;
  optimization: 'off' | 'honest' | 'aggressive';
  autoApproveEdits: boolean;
  reviewBeforeSubmit: boolean;
};

const EMPTY: Draft = {
  address: '', city: '', zip: '', county: '', country: '', state: '',
  phone: '', linkedin: '',
  citizenships: [], eligibility: [],
  /* Defaults chosen to be safe rather than permissive: the ones that could
     misrepresent a candidate start at "prefer not" or "no". */
  inPerson: 'yes', relocate: 'no', startNow: 'yes', transport: 'yes',
  accommodation: 'prefer_not', clearance: 'no', foreignTies: 'no',
  gender: '', ethnicity: '', veteran: 'prefer_not', disability: 'prefer_not',
  notes: '',
  optimization: 'honest',
  autoApproveEdits: false,
  /* On by default. The opposite means an application is sent before the
     candidate has seen it, and that should be a deliberate choice. */
  reviewBeforeSubmit: true,
};

const STEPS = ['Location', 'Contact', 'Work eligibility', 'Quick checklist', 'Application password', 'How we apply'] as const;

export function JobOnboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [resume, setResume] = useState<{ name: string; state: 'idle' | 'parsing' | 'done' | 'error' }>({ name: '', state: 'idle' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = useCallback(<K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v })), []);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="overflow-hidden rounded-[var(--mf-radius-2xl)] border border-line bg-canvas shadow-[var(--mf-shadow-sm)]">
        {/* Progress */}
        <div className="border-b border-line px-6 py-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">
              Step {step + 1} of {STEPS.length}
            </span>
            {step > 0 && (
              <button type="button" onClick={() => setStep((s) => s - 1)} className="text-muted hover:text-ink">
                ← Back
              </button>
            )}
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-elevated">
            <div
              className="h-full rounded-full bg-ink transition-[width] duration-300"
              style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
            />
          </div>
        </div>

        <div className="grid lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
          {/* Rail: résumé status plus why we ask. */}
          <aside className="border-b border-line p-6 lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-faint">Résumé</p>
              <span className="flex items-center gap-1.5 text-xs text-muted">
                <span
                  aria-hidden
                  className={`h-1.5 w-1.5 rounded-full ${resume.state === 'done' ? 'bg-success' : resume.state === 'error' ? 'bg-danger' : 'bg-accent'}`}
                />
                {resume.state === 'done' ? 'done' : resume.state === 'parsing' ? 'in progress' : resume.state === 'error' ? 'failed' : 'not uploaded'}
              </span>
            </div>
            <p className="mt-2 text-sm text-muted">
              {resume.state === 'done'
                ? 'Parsed. We are matching jobs while you finish setup.'
                : resume.state === 'parsing'
                  ? 'Takes 30 to 60 seconds. We are pulling your work history and skills while you finish these.'
                  : 'Upload it any time. Everything else still works without it.'}
            </p>

            <p className="mt-6 text-sm font-semibold text-ink">Why we ask</p>
            <p className="mt-1 text-sm text-muted">Every application asks these. Answer once here, we fill the forms.</p>

            <ResumeField resume={resume} setResume={setResume} />
          </aside>

          {/* The step */}
          <div className="p-6 sm:p-8">
            {error && (
              <p role="alert" className="mb-4 rounded-xl border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-ink">
                {error}
              </p>
            )}

            {step === 0 && <LocationStep draft={draft} set={set} />}
            {step === 1 && <ContactStep draft={draft} set={set} />}
            {step === 2 && <EligibilityStep draft={draft} set={set} />}
            {step === 3 && <ChecklistStep draft={draft} set={set} />}
            {step === 4 && <PasswordStep />}
            {step === 5 && <ApplySettingsStep draft={draft} set={set} />}

            <div className="mt-8 flex items-center gap-3">
              <Button
                variant="primary"
                size="lg"
                loading={saving}
                onClick={async () => {
                  if (step < STEPS.length - 1) {
                    setStep((s) => s + 1);
                    return;
                  }
                  setSaving(true);
                  setError(null);
                  try {
                    const res = await fetch('/api/jobs/onboarding', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(draft),
                    });
                    const d = (await res.json()) as { error?: string };
                    if (!res.ok) {
                      setError(d.error ?? 'Could not save your setup.');
                      return;
                    }
                    onDone();
                  } catch {
                    setError('Could not save your setup.');
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                {step === STEPS.length - 1 ? 'Finish setup' : 'Continue'}
              </Button>
              {step < STEPS.length - 1 && (
                <button type="button" onClick={() => setStep((s) => s + 1)} className="text-sm text-muted hover:text-ink">
                  Skip for now
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Steps ───────────────────────────────────────────────────────────────── */

type Setter = <K extends keyof Draft>(k: K, v: Draft[K]) => void;

function Head({ eyebrow, title, sub }: { eyebrow: string; title: string; sub: string }) {
  return (
    <div className="mb-6">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-faint">{eyebrow}</p>
      <h2 className="mt-1.5 text-[28px] font-bold tracking-[-0.02em] text-ink">{title}</h2>
      <p className="mt-1.5 max-w-md text-[15px] text-muted">{sub}</p>
    </div>
  );
}

const input =
  'mt-1.5 w-full border-0 border-b border-line bg-transparent px-0 py-2 text-[15px] text-ink placeholder:text-faint focus:border-accent focus:outline-none';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-faint">{label}</span>
      {children}
    </label>
  );
}

function LocationStep({ draft, set }: { draft: Draft; set: Setter }) {
  return (
    <>
      <Head eyebrow="Location" title="Where do you live?" sub="Most job sites need a full address. We fill it in from here." />
      <div className="space-y-5">
        <Field label="Address">
          <input value={draft.address} onChange={(e) => set('address', e.target.value)} placeholder="Start typing your address…" autoComplete="street-address" name="street-address" className={input} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="City">
            <input value={draft.city} onChange={(e) => set('city', e.target.value)} placeholder="San Francisco" autoComplete="address-level2" name="address-level2" className={input} />
          </Field>
          <Field label="ZIP">
            <input value={draft.zip} onChange={(e) => set('zip', e.target.value)} placeholder="94103" autoComplete="postal-code" name="postal-code" inputMode="numeric" className={input} />
          </Field>
          <Field label="Country">
            <input value={draft.country} onChange={(e) => set('country', e.target.value)} placeholder="United States" autoComplete="country-name" name="country-name" className={input} />
          </Field>
          <Field label="State">
            <input value={draft.state} onChange={(e) => set('state', e.target.value)} placeholder="California" autoComplete="address-level1" name="address-level1" className={input} />
          </Field>
        </div>
      </div>
    </>
  );
}

function ContactStep({ draft, set }: { draft: Draft; set: Setter }) {
  return (
    <>
      <Head
        eyebrow="Contact"
        title="How should we reach out?"
        sub="Phone and LinkedIn show up on most applications. Skip and we use whatever the résumé parser finds."
      />
      <div className="space-y-5">
        <Field label="Phone">
          <input
            type="tel"
            value={draft.phone}
            autoComplete="tel"
            name="tel"
            onChange={(e) => set('phone', e.target.value)}
            placeholder="Start with + and your country code"
            className={input}
          />
          <span className="mt-1 block text-xs text-faint">Example: +1 for US/Canada, +91 for India.</span>
        </Field>
        <Field label="LinkedIn">
          <input value={draft.linkedin} onChange={(e) => set('linkedin', e.target.value)} placeholder="https://linkedin.com/in/yourhandle" autoComplete="url" type="url" className={input} />
          <span className="mt-1 block text-xs text-faint">Asked on nearly every Workday and Greenhouse application.</span>
        </Field>
      </div>
    </>
  );
}

function EligibilityStep({ draft, set }: { draft: Draft; set: Setter }) {
  const [pending, setPending] = useState('');

  return (
    <>
      <Head
        eyebrow="Work eligibility"
        title="Where can you work?"
        sub="Add each country you would take a job in, then answer two questions for each. We use this to filter out jobs you cannot apply to."
      />

      <Field label="Countries where you want to work">
        <div className="mt-1.5 flex gap-2">
          <input
            value={pending}
            onChange={(e) => setPending(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && pending.trim()) {
                e.preventDefault();
                set('eligibility', [...draft.eligibility, { country: pending.trim(), authorized: null, sponsorship: null, basis: '' }]);
                setPending('');
              }
            }}
            placeholder="Search and add a country"
            className="flex-1 rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none"
          />
          <Button
            size="md"
            onClick={() => {
              if (!pending.trim()) return;
              set('eligibility', [...draft.eligibility, { country: pending.trim(), authorized: null, sponsorship: null, basis: '' }]);
              setPending('');
            }}
          >
            Add
          </Button>
        </div>
      </Field>

      <div className="mt-5 space-y-3">
        {draft.eligibility.map((c, i) => (
          <div key={c.country} className="rounded-xl border border-line p-4">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-ink">{c.country}</p>
              <button
                type="button"
                onClick={() => set('eligibility', draft.eligibility.filter((_, j) => j !== i))}
                className="text-xs text-muted hover:text-danger"
              >
                Remove
              </button>
            </div>
            {/* Asked per country on purpose: a global yes/no would assert US
                authorisation on a posting in Berlin. */}
            <YesNo
              label={`Are you legally authorized to work in ${c.country}?`}
              value={c.authorized}
              onChange={(v) =>
                set('eligibility', draft.eligibility.map((x, j) => (j === i ? { ...x, authorized: v } : x)))
              }
            />
            <YesNo
              label={`Will you now or in the future require employer sponsorship in ${c.country}?`}
              value={c.sponsorship}
              onChange={(v) =>
                set('eligibility', draft.eligibility.map((x, j) => (j === i ? { ...x, sponsorship: v } : x)))
              }
            />
          </div>
        ))}
        {draft.eligibility.length === 0 && (
          <p className="rounded-xl border border-dashed border-line-strong p-5 text-center text-sm text-muted">
            Add at least one country so we can filter out jobs you cannot apply to.
          </p>
        )}
      </div>
    </>
  );
}

function ChecklistStep({ draft, set }: { draft: Draft; set: Setter }) {
  return (
    <>
      <Head eyebrow="Quick checklist" title="A few last questions." sub="Defaults work for most people. Only change what applies." />

      <Group title="Preferences">
        <YesNo label="Open to in-person work?" value={draft.inPerson} onChange={(v) => set('inPerson', v)} />
        <YesNo label="Willing to relocate?" value={draft.relocate} onChange={(v) => set('relocate', v)} />
        <YesNo label="Can start immediately?" value={draft.startNow} onChange={(v) => set('startNow', v)} />
        <YesNo label="Reliable transportation?" value={draft.transport} onChange={(v) => set('transport', v)} />
        <YesNo
          label="Need workplace accommodations?"
          hint="Disability, religious, or other."
          value={draft.accommodation}
          onChange={(v) => set('accommodation', v)}
          allowPreferNot
        />
      </Group>

      <Group title="Background">
        <YesNo label="Active government clearance?" value={draft.clearance} onChange={(v) => set('clearance', v)} />
        <YesNo
          label="Family ties to foreign governments?"
          hint="Employers are required to ask."
          value={draft.foreignTies}
          onChange={(v) => set('foreignTies', v)}
        />
      </Group>

      {/* Optional and defaulted to "prefer not". These are protected
          characteristics; a default of yes or no would put an answer in the
          candidate's mouth. */}
      <Group title="Diversity & inclusion (optional)">
        <YesNo label="Veteran status" value={draft.veteran} onChange={(v) => set('veteran', v)} allowPreferNot />
        <YesNo
          label="Disability status"
          hint="Employers must report this in aggregate."
          value={draft.disability}
          onChange={(v) => set('disability', v)}
          allowPreferNot
        />
      </Group>

      <Group title="Additional info (optional)">
        <div className="px-4 py-3">
          <p className="text-sm text-ink">Anything else we should know when filling applications?</p>
          <p className="mt-0.5 text-xs text-faint">e.g. &ldquo;Notice period 15 days&rdquo;, &ldquo;Willing to travel up to 50%&rdquo;</p>
          <textarea
            value={draft.notes}
            onChange={(e) => set('notes', e.target.value)}
            rows={3}
            placeholder="Optional notes…"
            className="mt-2 w-full rounded-lg border border-line bg-canvas p-3 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none"
          />
        </div>
      </Group>
    </>
  );
}

/**
 * The application-password step.
 *
 * Deliberately does not collect a password.
 *
 * The reference flow stores one and uses it to create accounts on Workday,
 * iCIMS and Oracle on the candidate's behalf. Creating accounts and
 * authenticating as someone on third-party sites is exactly the class of action
 * that stays behind the execution-policy gate — and today no ATS path is
 * approved for it, so a stored password would sit there unused while being the
 * most sensitive thing in the database.
 *
 * When an execution path is approved, this becomes a real field backed by
 * proper secret storage (KMS or equivalent), not a column.
 */
function PasswordStep() {
  return (
    <>
      <Head
        eyebrow="Application accounts"
        title="Sites that need an account"
        sub="Some applications (Workday, iCIMS, Oracle) make you create an account partway through."
      />
      <div className="rounded-xl border border-line bg-elevated/50 p-5">
        <p className="text-sm text-ink">
          We prepare everything for these and hand off to you at the account step. We do not store a password or create
          accounts on your behalf.
        </p>
        <p className="mt-3 text-sm text-muted">
          Automatic submission is enabled one applicant tracking system at a time, and only after that path has been
          reviewed. Where it is not enabled, Autopilot still fills and validates the application and hands it to you
          finished.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {['Workday', 'iCIMS', 'Oracle'].map((n) => (
            <span key={n} className="rounded-full bg-canvas px-3 py-1 text-xs font-medium text-muted">
              {n}
            </span>
          ))}
        </div>
      </div>
    </>
  );
}

function ApplySettingsStep({ draft, set }: { draft: Draft; set: Setter }) {
  return (
    <>
      <Head eyebrow="Application settings" title="How should we apply?" sub="You can change these any time from settings." />

      <Group title="Résumé optimization">
        {(
          [
            ['off', 'Off', 'Send your résumé exactly as uploaded.'],
            ['honest', 'Honest', 'Reorder and emphasise experience that is relevant to each job.'],
            ['aggressive', 'Aggressive', 'Rewrite content to match the job description closely.'],
          ] as const
        ).map(([value, label, sub]) => (
          <label
            key={value}
            className={`flex cursor-pointer items-start gap-3 px-4 py-3 ${draft.optimization === value ? 'bg-elevated' : ''}`}
          >
            <input
              type="radio"
              checked={draft.optimization === value}
              onChange={() => set('optimization', value)}
              className="mt-1 accent-[var(--color-accent)]"
            />
            <span>
              <span className="block text-sm font-semibold text-ink">{label}</span>
              <span className="block text-xs text-muted">{sub}</span>
              {/* Named honestly. "Aggressive" rewriting is where a résumé starts
                  claiming things the candidate cannot back up, and the verifier
                  blocks exactly that — so the label should warn, not sell. */}
              {value === 'aggressive' && (
                <span className="mt-1 block text-xs text-warn">
                  Claims we cannot trace to your résumé are blocked before sending.
                </span>
              )}
            </span>
          </label>
        ))}
      </Group>

      <Group title="Review before submit">
        {(
          [
            [true, 'On', 'Pause on a review screen so you can check and edit each application before it is submitted.'],
            [false, 'Off', 'Submit applications automatically once they are filled.'],
          ] as const
        ).map(([value, label, sub]) => (
          <label
            key={String(value)}
            className={`flex cursor-pointer items-start gap-3 px-4 py-3 ${draft.reviewBeforeSubmit === value ? 'bg-elevated' : ''}`}
          >
            <input
              type="radio"
              checked={draft.reviewBeforeSubmit === value}
              onChange={() => set('reviewBeforeSubmit', value)}
              className="mt-1 accent-[var(--color-accent)]"
            />
            <span>
              <span className="block text-sm font-semibold text-ink">{label}</span>
              <span className="block text-xs text-muted">{sub}</span>
              {value === false && (
                <span className="mt-1 block text-xs text-muted">
                  Takes effect on application paths that have been approved for automatic submission. Auto Apply shows you which ones those are.
                </span>
              )}
            </span>
          </label>
        ))}
      </Group>
    </>
  );
}

/* ── Pieces ──────────────────────────────────────────────────────────────── */

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-4 overflow-hidden rounded-xl border border-line">
      <p className="border-b border-line bg-elevated/60 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-faint">
        {title}
      </p>
      <div className="divide-y divide-line">{children}</div>
    </section>
  );
}

function YesNo({
  label,
  hint,
  value,
  onChange,
  allowPreferNot = false,
}: {
  label: string;
  hint?: string;
  value: Yes | null;
  onChange: (v: Yes) => void;
  allowPreferNot?: boolean;
}) {
  const options: Yes[] = allowPreferNot ? ['yes', 'no', 'prefer_not'] : ['yes', 'no'];
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <span>
        <span className="block text-sm text-ink">{label}</span>
        {hint && <span className="block text-xs text-faint">{hint}</span>}
      </span>
      <span className="inline-flex overflow-hidden rounded-lg border border-line">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            aria-pressed={value === o}
            className={`px-3 py-1.5 text-xs font-semibold transition ${
              value === o ? 'bg-ink text-canvas' : 'bg-canvas text-muted hover:bg-elevated'
            }`}
          >
            {o === 'prefer_not' ? 'Prefer not' : o === 'yes' ? 'Yes' : 'No'}
          </button>
        ))}
      </span>
    </div>
  );
}

function ResumeField({
  resume,
  setResume,
}: {
  resume: { name: string; state: 'idle' | 'parsing' | 'done' | 'error' };
  setResume: (r: { name: string; state: 'idle' | 'parsing' | 'done' | 'error' }) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);

  return (
    <div className="mt-6">
      <Button size="sm" variant="secondary" onClick={() => ref.current?.click()}>
        {resume.name ? 'Replace résumé' : 'Upload résumé'}
      </Button>
      {resume.name && <p className="mt-1.5 truncate text-xs text-muted">{resume.name}</p>}
      {resume.state === 'done' && (
        <p className="mt-1 flex items-center gap-1 text-xs text-success">
          <CheckIcon className="h-3 w-3" /> Parsed
        </p>
      )}
      <input
        ref={ref}
        type="file"
        accept=".pdf,.docx,.txt"
        className="sr-only"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setResume({ name: f.name, state: 'parsing' });
          try {
            const form = new FormData();
            form.append('resume', f);
            form.append('json', '{}');
            const res = await fetch('/api/jobs/profile', { method: 'POST', body: form });
            setResume({ name: f.name, state: res.ok ? 'done' : 'error' });
          } catch {
            setResume({ name: f.name, state: 'error' });
          }
        }}
      />
    </div>
  );
}

export type { Draft as OnboardingDraft };
