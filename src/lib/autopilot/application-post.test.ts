import { describe, it, expect } from 'vitest';
import { isApplicationPost } from './adapters/browser';

/**
 * The check that decides whether a network request carried the application.
 *
 * Written after a run was recorded as SUBMITTED because an analytics beacon
 * returned 200 during the click. The rule it encodes: a signal that is almost
 * always present is not evidence.
 */
const PAGE = 'https://job-boards.greenhouse.io/gitlab/jobs/8644569002';

describe('which POST carried the application', () => {
  it('accepts the board’s own application endpoint', () => {
    expect(isApplicationPost(PAGE, 'https://job-boards.greenhouse.io/gitlab/jobs/8644569002/applications')).toBe(true);
    expect(isApplicationPost(PAGE, 'https://job-boards.greenhouse.io/embed/job_application')).toBe(true);
  });

  /* The class that caused the false positive. */
  it('rejects third-party analytics, whatever it returns', () => {
    for (const url of [
      'https://api.segment.io/v1/track',
      'https://www.google-analytics.com/collect',
      'https://browser-intake-datadoghq.com/api/v2/rum',
      'https://stats.g.doubleclick.net/j/collect',
    ]) {
      expect(isApplicationPost(PAGE, url), url).toBe(false);
    }
  });

  it('rejects same-origin telemetry', () => {
    for (const url of [
      'https://job-boards.greenhouse.io/analytics',
      'https://job-boards.greenhouse.io/api/events',
      'https://job-boards.greenhouse.io/_/metrics',
      'https://job-boards.greenhouse.io/session/ping',
    ]) {
      expect(isApplicationPost(PAGE, url), url).toBe(false);
    }
  });

  it('rejects a same-origin path that is about nothing in particular', () => {
    expect(isApplicationPost(PAGE, 'https://job-boards.greenhouse.io/graphql')).toBe(false);
  });

  it('rejects malformed URLs rather than assuming', () => {
    expect(isApplicationPost(PAGE, 'not-a-url')).toBe(false);
    expect(isApplicationPost('not-a-url', PAGE)).toBe(false);
  });
});
