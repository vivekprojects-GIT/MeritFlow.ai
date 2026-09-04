import { describe, expect, it } from 'vitest';
import { greenhouseAdapter, parseGreenhouseUrl } from './greenhouse';

/**
 * The Greenhouse adapter against a real board.
 *
 * It reads a structured API rather than a rendered page, which is why it is
 * preferred over the generic reader — the API states which questions exist and
 * which are required, where a DOM read has to infer both. That is only worth
 * anything if the API still answers the way the adapter expects, and nothing
 * here had ever been run against a live board.
 */

const BOARD = 'adapter';

const online = await fetch(`https://boards-api.greenhouse.io/v1/boards/${BOARD}/jobs`, {
  headers: { accept: 'application/json' },
})
  .then((r) => r.ok)
  .catch(() => false);

describe('parseGreenhouseUrl', () => {
  it('handles both board domains', () => {
    /* Greenhouse moved from boards.greenhouse.io to job-boards.greenhouse.io
       and still serves both. A parser that knows only the old one silently
       stops claiming every posting on the new one. */
    expect(parseGreenhouseUrl('https://boards.greenhouse.io/adapter/jobs/4415084008')).toEqual({
      board: 'adapter',
      id: '4415084008',
    });
    expect(parseGreenhouseUrl('https://job-boards.greenhouse.io/adapter/jobs/4415084008')).toEqual({
      board: 'adapter',
      id: '4415084008',
    });
  });

  it('declines a board listing, which is a page of jobs rather than a job', () => {
    expect(parseGreenhouseUrl('https://job-boards.greenhouse.io/adapter')).toBeNull();
    expect(greenhouseAdapter.detect('https://job-boards.greenhouse.io/adapter')).toBe(false);
  });
});

describe.runIf(online)('against the live board', () => {
  it('reads a real posting and its questions', async () => {
    const board = (await (
      await fetch(`https://boards-api.greenhouse.io/v1/boards/${BOARD}/jobs`)
    ).json()) as { jobs: { absolute_url: string; title: string }[] };

    expect(board.jobs.length).toBeGreaterThan(0);
    const posting = board.jobs[0];

    /* The URL Greenhouse itself publishes — the adapter has to claim it. */
    expect(greenhouseAdapter.detect(posting.absolute_url)).toBe(true);

    const inspected = await greenhouseAdapter.inspect(posting.absolute_url);

    expect(inspected.ats).toBe('greenhouse');
    expect(inspected.title).toBeTruthy();
    expect(inspected.company).toBeTruthy();

    /* Every real application asks for at least a name, an email and a résumé.
       A read that comes back with no questions means the API shape moved. */
    expect(inspected.questions.length).toBeGreaterThan(2);
    const labels = inspected.questions.map((q) => q.label.toLowerCase()).join(' | ');
    expect(labels).toMatch(/name/);
    expect(labels).toMatch(/email/);

    /* Required flags are the thing a DOM read cannot get right, and the reason
       this adapter is preferred over the generic one. */
    expect(inspected.questions.some((q) => q.required)).toBe(true);
    expect(inspected.questions.some((q) => q.kind === 'file')).toBe(true);
  }, 90_000);
});
