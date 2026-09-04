import { z } from 'zod';

/**
 * Visualization specifications — a declarative contract between the model and
 * the renderer.
 *
 * The system this replaces asked the model to emit an HTML/JS fragment and ran
 * it in a sandboxed iframe. The sandbox held, but the design has three problems
 * that no amount of sandboxing fixes:
 *
 *  1. **It is unverifiable.** You cannot inspect arbitrary JavaScript and know
 *     whether the chart it draws is accurate, accessible, or even legible. A
 *     spec you can validate field by field, you can.
 *  2. **It cannot inherit the design system.** Every generated fragment
 *     reinvents its own colours and type, so nothing matches the app and
 *     nothing follows the theme into dark mode.
 *  3. **Interaction has to be rebuilt every time.** Hover, zoom, filter and reset
 *     are properties of the renderer, not of a one-off script — so in the old
 *     model most generated visuals simply had none.
 *
 * So the pipeline is: model emits a spec → this validates it → a trusted React
 * renderer draws it. The model never supplies code, only data and intent.
 *
 * Adding a chart type means adding a variant here and a branch in the renderer.
 * That is deliberately more work than "let the model write anything", and it is
 * the reason the output is dependable.
 */

/* ── Shared pieces ───────────────────────────────────────────────────────── */

const label = z.string().min(1).max(120);
const finite = z.number().finite();

/** Interactions a renderer can be asked to enable. */
export const INTERACTIONS = ['hover', 'zoom', 'pan', 'filter', 'select', 'animate', 'compare', 'reset'] as const;
export type Interaction = (typeof INTERACTIONS)[number];

const interactions = z.array(z.enum(INTERACTIONS)).max(8).default(['hover']);

const annotation = z.object({
  /** Which datum or category the note points at. */
  target: label,
  text: z.string().min(1).max(200),
});

const base = {
  title: label,
  /** One sentence on what the reader should take away. Never decorative. */
  caption: z.string().min(1).max(280),
  interactions,
  annotations: z.array(annotation).max(6).default([]),
};

/* ── Variants ────────────────────────────────────────────────────────────── */

/** Magnitude across categories. */
const barSpec = z.object({
  ...base,
  type: z.literal('bar'),
  xLabel: label.optional(),
  yLabel: label.optional(),
  /** Two or three series max; beyond that a bar chart stops being readable. */
  series: z.array(label).min(1).max(3),
  data: z
    .array(z.object({ category: label, values: z.array(finite).min(1).max(3) }))
    .min(2)
    .max(24),
});

/** Change over an ordered dimension. */
const lineSpec = z.object({
  ...base,
  type: z.literal('line'),
  xLabel: label.optional(),
  yLabel: label.optional(),
  series: z.array(label).min(1).max(3),
  data: z
    .array(z.object({ x: label, values: z.array(finite).min(1).max(3) }))
    .min(3)
    .max(120),
});

/** Parts of a whole. */
const partsSpec = z.object({
  ...base,
  type: z.literal('parts'),
  data: z.array(z.object({ label, value: z.number().nonnegative() })).min(2).max(8),
});

/** Two measures per entity, with an optional third as size. */
const scatterSpec = z.object({
  ...base,
  type: z.literal('scatter'),
  xLabel: label,
  yLabel: label,
  data: z
    .array(z.object({ label, x: finite, y: finite, size: z.number().nonnegative().optional() }))
    .min(3)
    .max(200),
});

/** Ordered steps — a process, an algorithm, a pipeline. */
const processSpec = z.object({
  ...base,
  type: z.literal('process'),
  steps: z
    .array(z.object({ label, detail: z.string().max(200).default('') }))
    .min(2)
    .max(10),
});

/** Events on a time axis. */
const timelineSpec = z.object({
  ...base,
  type: z.literal('timeline'),
  events: z
    .array(z.object({ when: label, label, detail: z.string().max(200).default('') }))
    .min(2)
    .max(16),
});

/** Concepts and how they relate — knowledge graphs, architectures, networks. */
const networkSpec = z.object({
  ...base,
  type: z.literal('network'),
  nodes: z.array(z.object({ id: label, label, group: z.string().max(40).optional() })).min(2).max(40),
  edges: z.array(z.object({ from: label, to: label, label: z.string().max(60).optional() })).min(1).max(80),
});

/** Side-by-side attributes of two or three things. */
const compareSpec = z.object({
  ...base,
  type: z.literal('compare'),
  items: z.array(label).min(2).max(3),
  rows: z.array(z.object({ attribute: label, values: z.array(z.string().max(160)).min(2).max(3) })).min(2).max(12),
});

export const visualizationSpecSchema = z.discriminatedUnion('type', [
  barSpec,
  lineSpec,
  partsSpec,
  scatterSpec,
  processSpec,
  timelineSpec,
  networkSpec,
  compareSpec,
]);

export type VisualizationSpec = z.infer<typeof visualizationSpecSchema>;
export type SpecType = VisualizationSpec['type'];

/* ── Validation ──────────────────────────────────────────────────────────── */

export type ValidationResult =
  | { ok: true; spec: VisualizationSpec }
  | { ok: false; errors: string[] };

/**
 * Validate a candidate spec.
 *
 * Zod covers shape. The checks after it cover *coherence* — the failures a
 * schema cannot see, and the ones that actually produce a broken or misleading
 * chart. Each returns a message written for the model, because the message is
 * fed back to it on a retry.
 */
export function validateSpec(candidate: unknown): ValidationResult {
  const parsed = visualizationSpecSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.slice(0, 6).map((i) => `${i.path.join('.') || 'spec'}: ${i.message}`),
    };
  }

  const spec = parsed.data;
  const errors: string[] = [];

  /* Series/value arity must agree, or the renderer silently drops columns and
     the chart quietly tells a different story than the data. */
  if (spec.type === 'bar' || spec.type === 'line') {
    const n = spec.series.length;
    const rows = spec.type === 'bar' ? spec.data : spec.data;
    const bad = rows.findIndex((d) => d.values.length !== n);
    if (bad !== -1) {
      errors.push(`data[${bad}].values has ${rows[bad].values.length} numbers but ${n} series are declared — they must match.`);
    }
  }

  if (spec.type === 'compare') {
    const n = spec.items.length;
    const bad = spec.rows.findIndex((r) => r.values.length !== n);
    if (bad !== -1) errors.push(`rows[${bad}].values must have exactly ${n} entries, one per compared item.`);
  }

  /* Edges pointing at nodes that do not exist render as lines to nowhere. */
  if (spec.type === 'network') {
    const ids = new Set(spec.nodes.map((n) => n.id));
    for (const e of spec.edges) {
      if (!ids.has(e.from)) errors.push(`edge references unknown node "${e.from}".`);
      if (!ids.has(e.to)) errors.push(`edge references unknown node "${e.to}".`);
    }
  }

  /* A parts-of-a-whole chart of all zeroes has no whole to be part of. */
  if (spec.type === 'parts' && spec.data.reduce((a, b) => a + b.value, 0) <= 0) {
    errors.push('parts values sum to zero — there is no whole to divide.');
  }

  /* Annotations that point at nothing are noise the reader has to resolve. */
  const targets = annotationTargets(spec);
  if (targets) {
    for (const a of spec.annotations) {
      if (!targets.has(a.target)) errors.push(`annotation target "${a.target}" does not match any datum.`);
    }
  }

  /* Interactions the renderer cannot honour for this type would be a promise
     the UI does not keep. */
  const allowed = supportedInteractions(spec.type);
  for (const i of spec.interactions) {
    if (!allowed.includes(i)) errors.push(`"${i}" is not supported for a ${spec.type} visualization.`);
  }

  return errors.length > 0 ? { ok: false, errors: errors.slice(0, 6) } : { ok: true, spec };
}

function annotationTargets(spec: VisualizationSpec): Set<string> | null {
  switch (spec.type) {
    case 'bar':
      return new Set(spec.data.map((d) => d.category));
    case 'line':
      return new Set(spec.data.map((d) => d.x));
    case 'parts':
      return new Set(spec.data.map((d) => d.label));
    case 'scatter':
      return new Set(spec.data.map((d) => d.label));
    case 'process':
      return new Set(spec.steps.map((s) => s.label));
    case 'timeline':
      return new Set(spec.events.map((e) => e.label));
    case 'network':
      return new Set(spec.nodes.map((n) => n.id));
    default:
      return null;
  }
}

/** What each renderer can actually do — the source of truth for the check above. */
export function supportedInteractions(type: SpecType): Interaction[] {
  switch (type) {
    case 'bar':
      return ['hover', 'filter', 'compare', 'reset', 'animate'];
    case 'line':
      return ['hover', 'zoom', 'pan', 'filter', 'compare', 'reset', 'animate'];
    case 'parts':
      return ['hover', 'select', 'reset'];
    case 'scatter':
      return ['hover', 'zoom', 'pan', 'select', 'reset'];
    case 'process':
      return ['hover', 'select', 'animate', 'reset'];
    case 'timeline':
      return ['hover', 'select', 'zoom', 'reset'];
    case 'network':
      return ['hover', 'select', 'zoom', 'pan', 'reset'];
    case 'compare':
      return ['hover', 'compare'];
  }
}

/**
 * The instruction block given to the model.
 *
 * Kept beside the schema on purpose: a prompt that describes a different shape
 * from the one the validator enforces is the most common way this kind of
 * pipeline rots.
 */
export const SPEC_INSTRUCTIONS = `You produce a VisualizationSpec: structured JSON describing a chart. You never write code.

Choose the type by the question the visual answers:
- bar       magnitude across categories (2-24 categories, 1-3 series)
- line      change over an ordered dimension (3-120 points, 1-3 series)
- parts     parts of a whole (2-8 slices, non-negative)
- scatter   two measures per entity, optional third as size (3-200 points)
- process   ordered steps in a procedure or algorithm (2-10 steps)
- timeline  events in time (2-16 events)
- network   concepts and their relationships (2-40 nodes; every edge must use existing node ids)
- compare   attributes of 2-3 things side by side

Rules:
- Only produce a visualization when it explains something better than a sentence would. Decoration is a failure.
- Every numeric array in a row must have exactly one entry per declared series.
- "caption" states what the reader should take away, not what the chart is.
- Annotations must target an existing category/label/node id.
- Request only interactions the type supports.
- Use real values from the lesson. If you do not have data, choose a type that does not need it (process, timeline, network, compare) rather than inventing numbers.`;
