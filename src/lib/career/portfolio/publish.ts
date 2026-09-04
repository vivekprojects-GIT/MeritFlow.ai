import type { BuiltPortfolio } from './build';

/**
 * Getting a built portfolio onto the web.
 *
 * ## Why this hands over rather than pushing
 *
 * Publishing to `username.github.io` means creating a public repository on the
 * candidate's account and pushing a site to it under their name. That is an
 * irreversible, outward-facing act on somebody else's identity: the URL gets
 * indexed, the repository shows in their contribution graph, and "delete it
 * later" does not undo either.
 *
 * It also needs a write-scoped token, which is a credential this product has
 * gone out of its way not to need — the privacy gate means GitHub is read
 * anonymously, and asking for `repo` write access would hand it the ability to
 * modify every repository the candidate owns in exchange for creating one.
 *
 * So this produces the files and the exact steps, and the candidate publishes.
 * It takes them about two minutes and they keep control of their own account.
 *
 * When the product later grows a proper GitHub App with a narrow scope and a
 * consent screen, the automated path belongs behind that — not behind a
 * personal access token pasted into a settings field.
 */

export type PublishFile = {
  path: string;
  contents: string;
};

/**
 * The site as files, ready to commit.
 *
 * `.nojekyll` matters: GitHub Pages runs Jekyll by default, which ignores
 * directories beginning with an underscore and can silently drop files. The
 * site is plain HTML and does not want processing.
 */
export function publishFiles(built: BuiltPortfolio[]): PublishFile[] {
  const files: PublishFile[] = [{ path: '.nojekyll', contents: '' }];

  for (const page of built) {
    /* The canonical page is the site root; variants become directories so the
       URL reads /ai/ rather than /ai.html. */
    files.push({ path: page.slug ? `${page.slug}/index.html` : 'index.html', contents: page.html });
  }
  return files;
}

export type PublishPlan = {
  /** The repository the candidate needs, e.g. "saivivek.github.io". */
  repo: string;
  /** Where the site will answer once published. */
  url: string;
  files: PublishFile[];
  /** What the candidate does, in order. */
  steps: string[];
};

export function publishPlan(username: string, built: BuiltPortfolio[]): PublishPlan {
  const user = username.trim();
  const repo = `${user}.github.io`;
  const url = `https://${repo}`;

  return {
    repo,
    url,
    files: publishFiles(built),
    steps: [
      `Create a public repository called exactly ${repo} on your GitHub account.`,
      'Download the files below and commit them to the default branch.',
      `In Settings → Pages, set the source to "Deploy from a branch" and pick that branch.`,
      `Wait a minute, then open ${url} to check it.`,
      'Paste that URL back into MeritFlow so applications start linking to it.',
    ],
  };
}

/**
 * A GitHub Actions workflow, for candidates who would rather it rebuild itself.
 *
 * Offered as a file to commit rather than something written to their account.
 * It does nothing on its own — it publishes whatever is in the repository —
 * so committing it is not a grant of any access to this product.
 */
export function pagesWorkflow(): PublishFile {
  const contents = [
    'name: Deploy portfolio',
    'on:',
    '  push:',
    '    branches: [main]',
    '  workflow_dispatch:',
    'permissions:',
    '  contents: read',
    '  pages: write',
    '  id-token: write',
    'concurrency:',
    '  group: pages',
    '  cancel-in-progress: true',
    'jobs:',
    '  deploy:',
    '    environment:',
    '      name: github-pages',
    '      url: ${{ steps.deployment.outputs.page_url }}',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - uses: actions/checkout@v4',
    '      - uses: actions/configure-pages@v5',
    '      - uses: actions/upload-pages-artifact@v3',
    '        with:',
    '          path: .',
    '      - id: deployment',
    '        uses: actions/deploy-pages@v4',
    '',
  ].join('\n');

  return { path: '.github/workflows/pages.yml', contents };
}
