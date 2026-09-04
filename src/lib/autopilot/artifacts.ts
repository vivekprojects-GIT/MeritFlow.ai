import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Page } from 'playwright';

/**
 * What an application left behind.
 *
 * ## Why this is the piece that makes more adapters possible
 *
 * Supporting one ATS is a coding problem. Supporting nineteen is a *reliability*
 * problem, and reliability work needs evidence: the same Workday tenant renders
 * differently for two employers, a field that was optional last month is
 * required this month, and a run that failed at 2am is a sentence in a log
 * unless something captured the page.
 *
 * "The form is not complete: Are you legally authorized to work in the US?" is
 * a true statement that explains nothing. A screenshot of that page, the DOM as
 * it stood, and the decisions the engine made getting there is the difference
 * between guessing at an adapter and fixing one.
 *
 * Written per application, under a directory named for the run, so a failure
 * can be opened rather than reconstructed.
 *
 * ## What is deliberately not captured
 *
 * Nothing is written unless `AUTOPILOT_ARTIFACTS` names a directory. These
 * files contain a candidate's name, address, phone number and answers on a real
 * employer's page — that is personal data, and turning it on should be a
 * decision rather than a default that quietly fills a disk.
 */

export type ArtifactWriter = {
  /** A numbered screenshot and DOM snapshot for one step. */
  step: (name: string, page: Page) => Promise<void>;
  /** Structured facts about the run, written at the end. */
  finish: (summary: unknown) => Promise<void>;
  /** Where this run's files went, for the receipt. Empty when disabled. */
  dir: string;
};

/** Off unless an operator names a directory. */
export function artifactsEnabled(): boolean {
  return Boolean(process.env.AUTOPILOT_ARTIFACTS?.trim());
}

const NOOP: ArtifactWriter = {
  step: async () => {},
  finish: async () => {},
  dir: '',
};

/** Filesystem-safe, and stable for the same run so steps land together. */
function safe(value: string): string {
  return value.replace(/[^\w.-]+/g, '_').slice(0, 60) || 'run';
}

/**
 * Open a writer for one application.
 *
 * Every method swallows its own errors. A disk that is full, or a page that
 * closed mid-screenshot, must not fail an application that was otherwise going
 * to succeed — the artifacts exist to explain failures, not to cause them.
 */
export function openArtifacts(runId: string, company: string): ArtifactWriter {
  const root = process.env.AUTOPILOT_ARTIFACTS?.trim();
  if (!root) return NOOP;

  const dir = join(root, `${safe(company)}-${safe(runId)}`);
  let n = 0;
  let ready: Promise<void> | null = null;

  const ensure = () => {
    ready ??= mkdir(dir, { recursive: true }).then(
      () => {},
      () => {},
    );
    return ready;
  };

  return {
    dir,

    async step(name, page) {
      try {
        await ensure();
        const label = `${String(++n).padStart(2, '0')}-${safe(name)}`;
        /* Full page, not the viewport: the field that failed validation is
           usually below the fold, which is why it was missed. */
        await page.screenshot({ path: join(dir, `${label}.png`), fullPage: true });
        await writeFile(join(dir, `${label}.html`), await page.content());
      } catch {
        /* Never fatal. */
      }
    },

    async finish(summary) {
      try {
        await ensure();
        await writeFile(join(dir, 'application.json'), JSON.stringify(summary, null, 2));
      } catch {
        /* Never fatal. */
      }
    },
  };
}

/* ── Development ergonomics ──────────────────────────────────────────────── */

/**
 * Watch the browser work.
 *
 * `AUTOPILOT_HEADED=1` opens a real window and slows each action down, which is
 * the fastest way to find out what an adapter is actually doing to a form.
 * Reading "could not type into this field" tells you less in ten minutes than
 * watching the cursor land in the wrong box tells you in ten seconds.
 *
 * Never on by default: a server that opens windows is a server that fails on a
 * machine with no display.
 */
export function headedOptions(): { headless: boolean; slowMo: number } {
  const headed = /^(1|true|yes)$/i.test(process.env.AUTOPILOT_HEADED?.trim() ?? '');
  const slowMo = Number(process.env.AUTOPILOT_SLOWMO ?? (headed ? 250 : 0));
  return { headless: !headed, slowMo: Number.isFinite(slowMo) ? slowMo : 0 };
}
