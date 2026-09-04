import { anthropic as defaultAnthropic, createAnthropic } from '@ai-sdk/anthropic';
import type { LanguageModel } from 'ai';

/**
 * The provider reads ANTHROPIC_BASE_URL from the environment, and a value
 * without the `/v1` segment silently produces `https://api.anthropic.com/messages`
 * — which 404s on every call. Shells and tooling set this var for their own
 * purposes, so normalise it here instead of depending on the ambient
 * environment being correct.
 */
function anthropicProvider() {
  const raw = process.env.ANTHROPIC_BASE_URL?.trim().replace(/\/+$/, '');
  if (!raw) return defaultAnthropic;
  const baseURL = /\/v\d+$/.test(raw) ? raw : `${raw}/v1`;
  return createAnthropic({ baseURL, apiKey: process.env.ANTHROPIC_API_KEY });
}

/**
 * Model routing — the heart of keeping cost low.
 *
 * Two tiers:
 *  - GENERATION  (courseModel): the expensive, high-quality model used ONCE to author a
 *    whole course. This is the paid "Pro" action, and the course is then reused by every
 *    learner forever, so its cost amortises to ~0 per learner.
 *  - FAST        (fastModel): a cheap model (Haiku) for the high-volume, per-learner calls —
 *    the AI tutor and any open-ended feedback. ~10–20× cheaper per token than the
 *    generation model, which is what makes an "unlimited tutor" plan economically viable.
 *
 * Each tier works either against Anthropic directly (ANTHROPIC_API_KEY) or via the Vercel
 * AI Gateway (a bare "provider/model" string, needs AI_GATEWAY_API_KEY / linked project).
 *
 * Override with COURSE_MODEL / FAST_MODEL.
 */

const DEFAULT_GENERATION = 'claude-sonnet-4-6';
const DEFAULT_FAST = 'claude-haiku-4-5-20251001';

/** Expensive, high-quality model — used once per course generation. */
export function courseModel(): LanguageModel {
  if (process.env.ANTHROPIC_API_KEY) {
    return anthropicProvider()(process.env.COURSE_MODEL ?? DEFAULT_GENERATION);
  }
  return process.env.COURSE_MODEL ?? `anthropic/${DEFAULT_GENERATION}`;
}

/** Cheap, fast model — used for the AI tutor and per-learner interactions. */
export function fastModel(): LanguageModel {
  if (process.env.ANTHROPIC_API_KEY) {
    return anthropicProvider()(process.env.FAST_MODEL ?? DEFAULT_FAST);
  }
  return process.env.FAST_MODEL ?? `anthropic/${DEFAULT_FAST}`;
}

/** Whether any AI provider key is configured. */
export function hasAiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.AI_GATEWAY_API_KEY);
}
