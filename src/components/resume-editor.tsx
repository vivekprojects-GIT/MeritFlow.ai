'use client';

import { Button } from './button';
import { TrashIcon, PlusIcon } from './icons';
import { SECTION_LABEL, type ResumeDoc, type SectionId } from '@/lib/jobs/resume-schema';

/**
 * The résumé editor.
 *
 * The page you edit is the page that gets sent — there is no separate preview
 * pane. A textarea beside a rendering makes you translate between two things
 * that should be one, and the earlier version of this screen did exactly that:
 * a monospace blob on the left and the same text reflowed on the right.
 *
 * Every field is edited in place at the size and weight it will print. What
 * looks like a heading here is a heading in the PDF.
 */

/**
 * Fit a textarea to its content.
 *
 * Height is cleared before it is read, because `scrollHeight` never reports
 * less than the element's current height — without the reset a field that
 * grew could never shrink again when text was deleted.
 */
function autoSize(el: HTMLTextAreaElement | null): void {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

const FONTS: Record<string, string> = {
  sans: 'ui-sans-serif, system-ui, sans-serif',
  serif: 'ui-serif, Georgia, serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
};

/** Contact fields, in the order they print. */
const CONTACT_FIELDS: { key: keyof ResumeDoc['contact']; label: string; placeholder: string }[] = [
  { key: 'location', label: 'Location', placeholder: 'City, State' },
  { key: 'phone', label: 'Phone', placeholder: '(555) 555-5555' },
  { key: 'email', label: 'Email', placeholder: 'you@example.com' },
  { key: 'linkedin', label: 'LinkedIn', placeholder: 'linkedin.com/in/username' },
  { key: 'github', label: 'GitHub', placeholder: 'github.com/username' },
  { key: 'website', label: 'Website', placeholder: 'yourwebsite.com' },
];

export function ResumeEditor({
  doc,
  font,
  fontSize,
  template = 'standard',
  onChange,
}: {
  doc: ResumeDoc;
  font: string;
  fontSize: number;
  template?: string;
  onChange: (next: ResumeDoc) => void;
}) {
  const set = (patch: Partial<ResumeDoc>) => onChange({ ...doc, ...patch });
  const stack = FONTS[font] ?? FONTS.sans;
  /* Jake's template runs tighter and drops the rule under each heading, which
     is what distinguishes it from the standard layout. */
  const jake = template === 'jake';
  const leading = doc.fitToOnePage ? 1.22 : jake ? 1.3 : 1.45;

  const toggleHidden = (key: string) =>
    set({ hidden: doc.hidden.includes(key) ? doc.hidden.filter((h) => h !== key) : [...doc.hidden, key] });

  const move = (id: SectionId, by: number) => {
    const order = [...doc.order];
    const i = order.indexOf(id);
    const j = i + by;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    set({ order });
  };

  /** Replace one extra section in place. */
  const setExtra = (index: number, value: ResumeDoc['extras'][number]) =>
    set({ extras: doc.extras.map((x, j) => (j === index ? value : x)) });

  return (
    <div
      className={`group/page w-full overflow-x-hidden bg-transparent text-ink ${
        doc.fitToOnePage ? 'px-7 py-7' : 'px-10 py-10'
      }`}
      style={{
        fontFamily: stack,
        fontSize: `${fontSize}pt`,
        lineHeight: leading,
        textAlign: doc.align === 'justified' ? 'justify' : 'left',
      }}
    >
      {/* Header */}
      <div className="text-center">
        <Plain
          value={doc.contact.name}
          onChange={(v) => set({ contact: { ...doc.contact, name: v } })}
          placeholder="Your name"
          className="w-full text-center font-bold"
          style={{ fontSize: `${fontSize * 1.7}pt` }}
        />
        <Plain
          value={doc.contact.headline}
          onChange={(v) => set({ contact: { ...doc.contact, headline: v } })}
          placeholder="Your title, e.g. Data Engineer"
          className="mt-0.5 w-full text-center text-muted"
          style={{ fontSize: `${fontSize * 0.95}pt` }}
        />

        {/* Each detail can be left off the page without being deleted, which
            is what the eye toggles in a résumé builder are for. */}
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1" style={{ fontSize: `${fontSize * 0.9}pt` }}>
          {CONTACT_FIELDS.map((f, i) => {
            const hidden = doc.hidden.includes(f.key);
            return (
              <span key={f.key} className="inline-flex items-center gap-1">
                {i > 0 && <span className="text-faint">|</span>}
                <Plain
                  value={doc.contact[f.key]}
                  onChange={(v) => set({ contact: { ...doc.contact, [f.key]: v } })}
                  placeholder={f.placeholder}
                  className={hidden ? 'text-faint line-through' : ''}
                />
                <button
                  type="button"
                  onClick={() => toggleHidden(f.key)}
                  aria-label={hidden ? `Show ${f.label}` : `Hide ${f.label}`}
                  title={hidden ? `Show ${f.label}` : `Hide ${f.label}`}
                  className="text-faint transition hover:text-ink"
                >
                  <EyeIcon off={hidden} />
                </button>
              </span>
            );
          })}
        </div>
      </div>

      {/* Sections, in the candidate's chosen order */}
      {doc.order.map((id, index) => (
        <Section
          key={id}
          label={SECTION_LABEL[id]}
          first={index === 0}
          last={index === doc.order.length - 1}
          onMove={(by) => move(id, by)}
          fontSize={fontSize}
          jake={jake}
        >
          {id === 'summary' && (
            <Plain
              value={doc.summary}
              onChange={(v) => set({ summary: v })}
              placeholder="A brief professional summary, one or two lines."
              multiline
              className="w-full"
            />
          )}

          {id === 'education' && (
            <List
              items={doc.education}
              onChange={(education) => set({ education })}
              blank={{ school: '', degree: '', field: '', location: '', start: '', end: '', gpa: '' }}
              addLabel="Add education"
              render={(e, update) => (
                <>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <Plain value={e.school} onChange={(v) => update({ ...e, school: v })} placeholder="School" width={34} className="font-semibold" />
                    <DateRange value={e} onChange={update} />
                  </div>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="inline-flex items-baseline gap-1">
                      <Plain value={e.degree} onChange={(v) => update({ ...e, degree: v })} placeholder="Degree" width={22} />
                      <span className="text-faint">,</span>
                      <Plain value={e.field} onChange={(v) => update({ ...e, field: v })} placeholder="Field" width={24} className="italic" />
                    </span>
                    <span className="inline-flex items-baseline gap-1 text-muted">
                      GPA
                      <Plain value={e.gpa} onChange={(v) => update({ ...e, gpa: v })} placeholder="—" width={5} />
                    </span>
                  </div>
                </>
              )}
            />
          )}

          {id === 'skills' && (
            <List
              items={doc.skills}
              onChange={(skills) => set({ skills })}
              blank={{ label: '', items: '' }}
              addLabel="Add skill group"
              render={(s, update) => (
                <div className="flex flex-wrap items-baseline gap-1.5">
                  <Plain
                    value={s.label}
                    onChange={(v) => update({ ...s, label: v })}
                    placeholder="Programming Languages"
                    width={22}
                    className="font-semibold"
                  />
                  <span className="text-faint">:</span>
                  <Plain
                    value={s.items}
                    onChange={(v) => update({ ...s, items: v })}
                    placeholder="Python, SQL, TypeScript"
                    multiline
                    className="min-w-[12rem] flex-1"
                  />
                </div>
              )}
            />
          )}

          {id === 'experience' && (
            <List
              items={doc.experience}
              onChange={(experience) => set({ experience })}
              blank={{ company: '', title: '', location: '', start: '', end: '', bullets: [] }}
              addLabel="Add role"
              render={(e, update) => (
                <>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="inline-flex items-baseline gap-1.5">
                      <Plain value={e.company} onChange={(v) => update({ ...e, company: v })} placeholder="Company" width={22} className="font-semibold" />
                      <span className="text-faint">|</span>
                      <Plain value={e.title} onChange={(v) => update({ ...e, title: v })} placeholder="Title" width={24} />
                      <span className="text-faint">|</span>
                      <Plain value={e.location} onChange={(v) => update({ ...e, location: v })} placeholder="Location" width={16} className="text-muted" />
                    </span>
                    <DateRange value={e} onChange={update} />
                  </div>
                  <Bullets value={e.bullets} onChange={(bullets) => update({ ...e, bullets })} />
                </>
              )}
            />
          )}

          {id === 'projects' && (
            <List
              items={doc.projects}
              onChange={(projects) => set({ projects })}
              blank={{ name: '', link: '', start: '', end: '', bullets: [] }}
              addLabel="Add project"
              render={(p, update) => (
                <>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="inline-flex items-baseline gap-1.5">
                      <Plain value={p.name} onChange={(v) => update({ ...p, name: v })} placeholder="Project" width={26} className="font-semibold" />
                      <span className="text-faint">|</span>
                      <Plain value={p.link} onChange={(v) => update({ ...p, link: v })} placeholder="Link" width={26} className="text-muted" />
                    </span>
                    <DateRange value={p} onChange={update} />
                  </div>
                  <Bullets value={p.bullets} onChange={(bullets) => update({ ...p, bullets })} />
                </>
              )}
            />
          )}
        </Section>
      ))}

      {/*
        Sections the schema does not name — certifications, awards,
        publications, anything the candidate adds. Edited exactly like the
        others, heading included: the whole point is that what was uploaded is
        what appears here, and that all of it can be changed.
      */}
      {doc.extras.map((extra, index) => (
        <Section
          key={index}
          label={extra.heading || 'Section'}
          first={false}
          last={index === doc.extras.length - 1}
          onMove={(by) => {
            const next = [...doc.extras];
            const j = index + by;
            if (j < 0 || j >= next.length) return;
            [next[index], next[j]] = [next[j], next[index]];
            set({ extras: next });
          }}
          onRemove={() => set({ extras: doc.extras.filter((_, j) => j !== index) })}
          fontSize={fontSize}
          jake={jake}
          heading={
            <Plain
              value={extra.heading}
              onChange={(v) => setExtra(index, { ...extra, heading: v })}
              placeholder="Section name"
              className="w-full font-bold uppercase tracking-wide"
              style={{ fontSize: `${fontSize * 1.05}pt` }}
            />
          }
        >
          <List
            items={extra.lines}
            onChange={(lines) => setExtra(index, { ...extra, lines })}
            blank=""
            addLabel="Add line"
            render={(line, update) => (
              <Plain value={line} onChange={update} placeholder="…" multiline className="w-full" />
            )}
          />
        </Section>
      ))}

      {/* Always visible, like every other add control on the page. Hiding it
          until hover made the one affordance for "my résumé has a section
          yours does not" the only one nobody could find. */}
      <div className="mt-4">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => set({ extras: [...doc.extras, { heading: '', lines: [''] }] })}
        >
          <PlusIcon className="h-3 w-3" />
          Add section
        </Button>
      </div>
    </div>
  );
}

/* ── Pieces ──────────────────────────────────────────────────────────────── */

function Section({
  label,
  heading,
  first,
  last,
  onMove,
  onRemove,
  fontSize,
  jake,
  children,
}: {
  /** What this section is called, for the controls' accessible names. */
  label: string;
  /**
   * The rendered heading. A string for the five named sections, whose titles
   * are fixed; a node for a section the candidate typed the name of.
   */
  heading?: React.ReactNode;
  first: boolean;
  last: boolean;
  onMove: (by: number) => void;
  /** Present only on sections the candidate added, which they may remove. */
  onRemove?: () => void;
  fontSize: number;
  jake: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="group/section mt-5">
      <div className={`flex items-center gap-2 pb-0.5 ${jake ? 'border-b border-line-strong' : 'border-b border-ink'}`}>
        <h3 className="min-w-0 flex-1 font-bold uppercase tracking-wide" style={{ fontSize: `${fontSize * 1.05}pt` }}>
          {heading ?? label}
        </h3>
        {/* Reordering lives with the heading it moves, and stays out of the
            way until the section is hovered. */}
        <span className="ml-auto flex shrink-0 gap-0.5 opacity-0 transition group-hover/section:opacity-100">
          <button type="button" onClick={() => onMove(-1)} disabled={first} aria-label={`Move ${label} up`} className="rounded px-1 text-xs text-faint hover:text-ink disabled:opacity-30">
            ↑
          </button>
          <button type="button" onClick={() => onMove(1)} disabled={last} aria-label={`Move ${label} down`} className="rounded px-1 text-xs text-faint hover:text-ink disabled:opacity-30">
            ↓
          </button>
          {onRemove && (
            <button type="button" onClick={onRemove} aria-label={`Remove ${label}`} className="rounded px-1 text-faint hover:text-danger">
              <TrashIcon className="h-3 w-3" />
            </button>
          )}
        </span>
      </div>
      <div className="mt-1.5 space-y-2">{children}</div>
    </section>
  );
}

/**
 * An editable run of text that looks like the text it replaces.
 *
 * ## Why it is not an auto-sized input
 *
 * The first version set the `size` attribute to the character count so each
 * field hugged its content. That is fine for a name and catastrophic for a
 * bullet: a 200-character achievement became a 200-character-wide input, which
 * pushed the page far past the paper edge and left the whole résumé scrolling
 * sideways with the dates stranded off-screen.
 *
 * Long text now wraps in a textarea that grows downward, and short fields get
 * a bounded width. Nothing is ever sized by its content alone.
 */
function Plain({
  value,
  onChange,
  placeholder,
  className = '',
  style,
  multiline,
  /** Roughly how wide this field should be, in characters. Bounded. */
  width,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  multiline?: boolean;
  width?: number;
}) {
  const shared =
    'bg-transparent outline-none placeholder:text-faint placeholder:italic focus:bg-mint/40 rounded-sm ' + className;

  if (multiline) {
    return (
      <textarea
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          autoSize(e.currentTarget);
        }}
        /*
         * Sized from the rendered height, not from the character count.
         *
         * Estimating rows as `length / 95` reserves two lines for a
         * 110-character bullet that in fact wraps to one, which left a ragged
         * blank gap under some bullets and not others. The element already
         * knows how tall its content is.
         */
        ref={autoSize}
        placeholder={placeholder}
        rows={1}
        className={`w-full resize-none overflow-hidden ${shared}`}
        style={style}
      />
    );
  }

  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`min-w-0 ${shared}`}
      /* A ceiling in `ch` rather than a character count: the field can shrink
         to fit its row, and can never demand more than its share of the page. */
      style={{ width: width ? `${width}ch` : undefined, maxWidth: '100%', ...style }}
    />
  );
}

function DateRange<T extends { start: string; end: string }>({
  value,
  onChange,
}: {
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <span className="inline-flex shrink-0 items-baseline gap-1 text-muted">
      <Plain value={value.start} onChange={(v) => onChange({ ...value, start: v })} placeholder="Start" width={9} className="text-right" />
      <span className="text-faint">–</span>
      <Plain value={value.end} onChange={(v) => onChange({ ...value, end: v })} placeholder="End" width={9} />
    </span>
  );
}

function Bullets({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <ul className="mt-1 space-y-0.5">
      {value.map((b, i) => (
        <li key={i} className="group/bullet flex items-baseline gap-2">
          <span aria-hidden className="text-faint">
            •
          </span>
          <Plain
            value={b}
            onChange={(v) => onChange(value.map((x, j) => (j === i ? v : x)))}
            placeholder="What you did and what it changed"
            multiline
            className="min-w-0 flex-1"
          />
          <button
            type="button"
            onClick={() => onChange(value.filter((_, j) => j !== i))}
            aria-label="Remove bullet"
            className="opacity-0 transition group-hover/bullet:opacity-100"
          >
            <TrashIcon className="h-3 w-3 text-faint hover:text-danger" />
          </button>
        </li>
      ))}
      <li>
        <button
          type="button"
          onClick={() => onChange([...value, ''])}
          className="text-xs text-accent underline underline-offset-2"
        >
          Add bullet
        </button>
      </li>
    </ul>
  );
}

function List<T>({
  items,
  onChange,
  blank,
  addLabel,
  render,
}: {
  items: T[];
  onChange: (v: T[]) => void;
  blank: T;
  addLabel: string;
  render: (item: T, update: (v: T) => void) => React.ReactNode;
}) {
  return (
    <>
      {items.map((item, i) => (
        <div key={i} className="group/entry relative">
          {render(item, (v) => onChange(items.map((x, j) => (j === i ? v : x))))}
          <button
            type="button"
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            aria-label="Remove entry"
            className="absolute -right-6 top-0 opacity-0 transition group-hover/entry:opacity-100"
          >
            <TrashIcon className="h-3.5 w-3.5 text-faint hover:text-danger" />
          </button>
        </div>
      ))}
      <Button size="sm" variant="ghost" onClick={() => onChange([...items, structuredClone(blank)])}>
        <PlusIcon className="h-3 w-3" />
        {addLabel}
      </Button>
    </>
  );
}

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {off && <path d="M3 3l18 18" />}
    </svg>
  );
}
