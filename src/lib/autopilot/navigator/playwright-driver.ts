import { createHash } from 'node:crypto';
import type { Page } from 'playwright';
import type { DiscoveredField } from '../adapters/browser';
import { locate, setValue } from '../adapters/browser';
import { labelControls } from './labels';
import type { ArtifactWriter } from '../artifacts';
import { classifyControl, readConfirmation } from './plan';
import type { FieldResolver, NavigatorDriver, PageControl, PageObservation } from './types';

/**
 * The real driver: a live Chromium page behind the navigator's interface.
 *
 * Everything model-facing stops at the boundary above this file. What happens
 * here is DOM reading and four kinds of physical act — type, attach, click,
 * wait. There is no `evaluate(userSuppliedCode)` and no selector that comes
 * from anywhere but this module's own extraction, so a careers page cannot talk
 * the navigator into doing something by putting instructions in its markup.
 */

/* ── Extraction ──────────────────────────────────────────────────────────── */

/**
 * Read the page in one round trip.
 *
 * A string rather than a closure, for the same reason the single-page extractor
 * is: esbuild's `keepNames` wraps every named function in a `__name(...)`
 * helper that exists in the bundle and not in the browser, and a closure passed
 * to `evaluate` arrives rewritten and throws "__name is not defined" on the
 * first call. A string is handed over verbatim.
 *
 * Deliberately broader than the single-page version, which only looked inside
 * `<form>`. Workday, Ashby and most React-rendered applications never emit a
 * `<form>` element at all — that one selector is why those postings read as
 * "no application form was found".
 */
const OBSERVE_JS = `(() => {
  var CHROME = 'nav, header, footer, [role=search], [role=navigation], [role=banner], [role=contentinfo]';

  var visible = function (el) {
    var r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    var s = window.getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
  };

  /*
   * A file input, which is a special case on every ATS.
   *
   * Every one of them hides the real input behind a styled "Attach resume"
   * button by setting opacity to zero while leaving it laid out and clickable.
   * The ordinary visibility test therefore skipped it, and a run reported an
   * application complete with no CV on it -- measured across six Lever tenants,
   * five of them.
   *
   * Laid out and not display:none is the right bar here. Opacity is exactly
   * what these are styled with, so it cannot be part of the test.
   */
  var attachable = function (el) {
    var r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    var s = window.getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none';
  };

  /*
   * Is a human actually being challenged?
   *
   * Nearly every modern application form loads hCaptcha or reCAPTCHA in
   * invisible mode, which scores the session in the background and shows
   * nothing. Treating the widget's presence as a challenge marked eleven of
   * thirteen Lever and Ashby tenants as needing a person, which is a product
   * that stops on almost every application for no reason.
   *
   * The honest test is whether the thing is on screen. An invisible widget has
   * no offsetParent and a hidden ancestor; a real reCAPTCHA v2 checkbox or a
   * challenge that has actually fired does not. If one fires later -- they
   * commonly appear only once a form looks complete -- the navigator checks
   * again before it submits.
   */
  var onScreen = function (el) {
    if (el.offsetParent === null) return false;
    var n = el;
    while (n && n.nodeType === 1) {
      var s = window.getComputedStyle(n);
      if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
      n = n.parentElement;
    }
    return true;
  };

  var labelFor = function (el, fallback) {
    var id = el.getAttribute('id');
    if (id) {
      var lab = document.querySelector('label[for="' + id.replace(/"/g, '\\\\"') + '"]');
      if (lab && lab.textContent) return lab.textContent.trim();
    }
    var wrap = el.closest('label');
    if (wrap && wrap.textContent) return wrap.textContent.trim();
    var aria = el.getAttribute('aria-labelledby');
    if (aria) {
      var by = document.getElementById(aria);
      if (by && by.textContent) return by.textContent.trim();
    }

    /*
     * The label as a sibling, not an ancestor or a 'for' target.
     *
     * Lever writes each question as a wrapper holding a label element and the
     * control, with no 'for' attribute joining them. None of the strategies
     * above see that, so the field fell through to its own name and the
     * candidate was shown "opportunityLocationId" and
     * "cards[be1cd079-...][field0]" as questions they had failed to answer.
     * The real labels — "Current location", "How did you hear about our job
     * opening?" — were in the DOM the whole time, one element away.
     *
     * Walking up is bounded and each ancestor is checked for how many controls
     * it holds: a wrapper around one control labels that control, while a
     * wrapper around six is a section heading and would label all six wrongly.
     */
    var node = el.parentElement;
    for (var up = 0; up < 4 && node; up += 1) {
      var controls = node.querySelectorAll('input, textarea, select');
      if (controls.length <= 2) {
        var lab = node.querySelector('label, legend, [class*="label" i], [class*="question" i] > span');
        if (lab && lab.textContent) {
          var text = lab.textContent.replace(/\\s+/g, ' ').trim();
          /* A label is a question, not a paragraph. Anything long is prose that
             happens to sit nearby. */
          if (text.length > 1 && text.length < 160) return text;
        }
      }
      node = node.parentElement;
    }

    return (el.getAttribute('aria-label') || el.getAttribute('placeholder') || fallback || '').trim();
  };

  /* ── fields ── */
  var fields = [];
  var filled = [];
  var seen = {};
  var inputs = document.querySelectorAll(
    'input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=image]), textarea, select'
  );
  for (var i = 0; i < inputs.length; i++) {
    var el = inputs[i];
    if (el.closest(CHROME)) continue;
    var isFile = (el.getAttribute('type') || '').toLowerCase() === 'file';
    /*
     * A custom-styled radio hides the real input behind a painted circle, so
     * the input itself fails the visibility test while the control is plainly
     * on screen. The visible thing is its label -- standard pattern -- so a
     * radio or checkbox counts as visible when its label is. Ashby's required
     * "technical domain" radio group was invisible to discovery for exactly
     * this reason.
     */
    var vtype = (el.getAttribute('type') || '').toLowerCase();
    var elVisible = isFile ? attachable(el) : visible(el);
    if (!elVisible && (vtype === 'radio' || vtype === 'checkbox') && el.id) {
      var vlab = document.querySelector('label[for="' + el.id.replace(/"/g, '') + '"]');
      if (vlab && visible(vlab)) elVisible = true;
    }
    if (!elVisible) continue;
    var name = el.getAttribute('name') || el.getAttribute('id') || '';
    /*
     * A control with no name is still a question.
     *
     * Ashby's location combobox and date picker carry neither name nor id, so
     * they were skipped here -- two *required* fields invisible to the whole
     * pipeline, discovered only when a submitted form's screenshot showed them
     * empty. They get a synthetic id stamped onto the element, which locate()
     * resolves via [data-mf-field].
     */
    if (!name) {
      name = el.getAttribute('data-mf-field') || '';
      if (!name) {
        name = 'mf-field-' + i;
        el.setAttribute('data-mf-field', name);
      }
    }
    if (!name || seen[name]) continue;
    /* A site search box is not an application question. */
    if (/^(q|s|search|keyword)$/i.test(name) || el.getAttribute('type') === 'search') continue;
    seen[name] = 1;

    var tag = el.tagName.toLowerCase();
    var type = (el.getAttribute('type') || '').toLowerCase();
    var kind = tag === 'textarea' ? 'textarea'
      : tag === 'select' ? 'select'
      : type === 'file' ? 'file'
      : (type === 'checkbox' || type === 'radio') ? 'boolean'
      : 'text';

    var options = [];
    if (tag === 'select') {
      var opts = el.querySelectorAll('option');
      for (var j = 0; j < opts.length && options.length < 40; j++) {
        var t = (opts[j].textContent || '').trim();
        if (t) options.push(t);
      }
    }

    /*
     * A radio group is one question with choices, not several questions.
     *
     * Each radio sits inside its own label, so labelFor returned the *option*
     * text and every choice arrived as a separate unanswered question. A real
     * Lever questionnaire came back asking the candidate to answer three
     * questions called "I don't have direct experience", "I don't have
     * experience" and "Yes" -- which are answers, and to questions nobody had
     * been shown.
     *
     * Radios sharing a name are collected into one field: the choices become
     * options, and the question is read from the smallest ancestor that holds
     * the whole group, with the option text removed so only the stem is left.
     */
    var groupLabel = '';
    if (type === 'radio' || type === 'checkbox') {
      var peers = name ? document.getElementsByName(name) : [];
      if (peers && peers.length > 1) {
        for (var g = 0; g < peers.length && options.length < 30; g++) {
          var ol = labelFor(peers[g], '');
          if (ol) options.push(ol.slice(0, 120));
        }

        /* The stem: an ancestor containing every peer, minus the choices. */
        var box = el.parentElement;
        for (var up = 0; up < 8 && box; up++) {
          /* getElementsByName is document-only; scope by attribute instead,
             escaping the quotes Lever puts in names like cards[uuid][field0]. */
          var q = '[name=\\"' + name.split('"').join('') + '\\"]';
          if (box.querySelectorAll(q).length === peers.length) break;
          box = box.parentElement;
        }
        /*
         * The smallest ancestor holding every option is usually the <ul> of
         * choices and nothing else -- the question sits in a sibling above it.
         * So keep climbing until some text survives removing the options, which
         * is the stem, and stop before the climb reaches the whole form.
         */
        for (var up2 = 0; up2 < 5 && box; up2++) {
          var whole = (box.innerText || '').replace(/\\s+/g, ' ').trim();
          for (var o = 0; o < options.length; o++) {
            whole = whole.split(options[o]).join(' ');
          }
          whole = whole.replace(/\\s+/g, ' ').replace(/[\\u2731*\\u00d7]+/g, '').trim();
          if (whole.length > 8 && whole.length < 300) { groupLabel = whole; break; }
          box = box.parentElement;
        }
      }
    }

    var has = false;
    if (kind === 'boolean') has = !!el.checked;
    else if (kind === 'file') has = !!(el.files && el.files.length > 0);
    else if (tag === 'select') has = el.selectedIndex > 0 && !!el.value;
    else has = !!(el.value && el.value.trim());
    if (has) filled.push(name);

    var fLabel = (groupLabel || labelFor(el, name));
    /*
     * Required, as the page actually communicates it.
     *
     * Ashby's nameless location combobox carries no required attribute at all;
     * the only signal is the asterisk its label paints. Missing that meant the
     * one field blocking submission was modelled as optional, so the run
     * pressed submit and the board answered with a red "missing required
     * field" banner. The asterisk is part of the label's text, so it is read
     * from there -- and stripped, because it is punctuation, not wording.
     */
    var fRequired = el.hasAttribute('required') || el.getAttribute('aria-required') === 'true' || /[*✱✳]\s*$/.test(fLabel.trim());
    fLabel = fLabel.replace(/\s*[*✱✳]+\s*$/, '').trim();
    fields.push({
      id: name,
      /* The group's question when there is one, the control's own label
         otherwise. */
      label: fLabel.slice(0, 200),
      required: fRequired,
      /* A group with choices is answered by picking one, like a select. */
      kind: options.length > 0 && kind === 'boolean' ? 'select' : kind,
      options: options
    });
  }

  /*
   * Yes/No button groups, which are questions wearing button clothes.
   *
   * Ashby renders "Do you have the authorization to work in the country you
   * are applying to?" as two <button aria-pressed> elements. The discovery
   * above reads inputs, textareas and selects, so this question was invisible:
   * every text field around it filled, the required button group stayed
   * untouched, and the submit click bounced off validation with the form still
   * on screen -- exactly what the final screenshot showed.
   *
   * Each group becomes one field whose options are the button labels. The id
   * is synthetic ("mf-btngroup-N"); setValue matches on it below.
   */
  var groupSeen = [];
  var pressables = document.querySelectorAll('button[aria-pressed]');
  var gidx = 0;
  for (var pb = 0; pb < pressables.length; pb++) {
    var btn = pressables[pb];
    if (btn.closest(CHROME)) continue;
    if (!visible(btn)) continue;
    var holder = btn.parentElement;
    if (!holder || groupSeen.indexOf(holder) !== -1) continue;
    groupSeen.push(holder);

    var siblings = holder.querySelectorAll('button[aria-pressed]');
    if (siblings.length < 2) continue;

    var opts = [];
    var chosen = '';
    for (var sb = 0; sb < siblings.length; sb++) {
      var t = (siblings[sb].innerText || '').replace(/\\s+/g, ' ').trim();
      if (t) opts.push(t.slice(0, 80));
      if (siblings[sb].getAttribute('aria-pressed') === 'true') chosen = t;
    }
    if (opts.length < 2) continue;

    /* The question: nearest ancestor whose text adds words beyond the
       options. Same approach as radio groups. */
    var qbox = holder.parentElement;
    var qlabel = '';
    for (var qu = 0; qu < 6 && qbox; qu++) {
      var wtext = (qbox.innerText || '').replace(/\\s+/g, ' ').trim();
      for (var oo = 0; oo < opts.length; oo++) wtext = wtext.split(opts[oo]).join(' ');
      wtext = wtext.replace(/\\s+/g, ' ').replace(/[\\u2731*]+/g, '').trim();
      if (wtext.length > 8 && wtext.length < 300) { qlabel = wtext; break; }
      qbox = qbox.parentElement;
    }
    if (!qlabel) continue;

    var gid = 'mf-btngroup-' + gidx++;
    holder.setAttribute('data-mf-group', gid);
    if (chosen) filled.push(gid);
    fields.push({
      id: gid,
      label: qlabel.slice(0, 200),
      /* Required is not readable from a button, and a group an employer went
         to the trouble of building is nearly always required. Marking it so
         means an unanswered one blocks rather than slips through. */
      required: true,
      kind: 'select',
      options: opts
    });
  }

  /* ── controls ── */
  var controls = [];
  var n = 0;
  var buttons = document.querySelectorAll('button, input[type=submit], input[type=button], a[role=button], [role=button]');
  for (var k = 0; k < buttons.length && controls.length < 40; k++) {
    var b = buttons[k];
    if (b.closest(CHROME)) continue;
    if (!visible(b)) continue;
    var text = (b.innerText || b.value || b.getAttribute('aria-label') || b.title || '').trim().replace(/\\s+/g, ' ');
    if (!text) continue;
    var ref = 'mf-' + n++;
    b.setAttribute('data-mf-ref', ref);
    controls.push({
      ref: ref,
      text: text.slice(0, 80),
      enabled: !b.disabled && b.getAttribute('aria-disabled') !== 'true'
    });
  }

  /* ── page identity ── */
  var heading = '';
  var h = document.querySelector('h1, h2, legend, [role=heading]');
  if (h && h.textContent) heading = h.textContent.trim().slice(0, 120);

  var body = (document.body ? document.body.innerText : '') || '';

  return {
    url: location.href,
    title: (document.title || '').slice(0, 200),
    heading: heading,
    fields: fields,
    filled: filled,
    controls: controls,
    hasCaptcha: Array.prototype.some.call(
      document.querySelectorAll(
        'iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[title*="challenge" i], [class*="cf-turnstile"], #px-captcha, [data-testid*="captcha" i]'
      ),
      onScreen
    ),
    hasPassword: !!document.querySelector('input[type=password]'),
    body: body.slice(0, 6000)
  };
})()`;

type RawObservation = {
  url: string;
  title: string;
  heading: string;
  fields: DiscoveredField[];
  filled: string[];
  controls: { ref: string; text: string; enabled: boolean }[];
  hasCaptcha: boolean;
  hasPassword: boolean;
  body: string;
};

/** "Step 2 of 5", when the page bothers to say. Display only. */
function readStep(body: string): string {
  const m = body.match(/\bstep\s+(\d+)\s*(?:of|\/)\s*(\d+)/i);
  return m ? `Step ${m[1]} of ${m[2]}` : '';
}

/**
 * What the page is, hashed.
 *
 * Built from structure — url, heading, field ids, control labels — and not from
 * body text, which carries timestamps, countdowns and session ids that would
 * make every page look new and defeat the no-progress check entirely.
 */
function fingerprint(raw: RawObservation): string {
  const parts = [
    raw.url.split('#')[0],
    raw.heading,
    raw.fields.map((f) => f.id).sort().join(','),
    raw.controls.map((c) => c.text).sort().join(','),
  ];
  return createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 16);
}

/* ── The driver ──────────────────────────────────────────────────────────── */

export class PlaywrightDriver implements NavigatorDriver {
  private readonly values = new Map<string, string>();

  constructor(
    private readonly page: Page,
    private readonly resolver: FieldResolver,
    private readonly resumePath: string | null,
    /* Off unless an operator asked for it. See artifacts.ts. */
    private readonly artifacts?: ArtifactWriter,
  ) {}

  async observe(): Promise<PageObservation> {
    const raw = (await this.page.evaluate(OBSERVE_JS)) as RawObservation;

    const controls: PageControl[] = raw.controls.map((c) => ({
      ref: c.ref,
      text: c.text,
      enabled: c.enabled,
      kind: classifyControl(c.text),
    }));

    return {
      url: raw.url,
      title: raw.title,
      fingerprint: fingerprint(raw),
      step: readStep(raw.body),
      fields: raw.fields,
      /* Plus what this driver already attached: the page clears a consumed
         file input, and forgetting that meant declaring the résumé field
         unfillable right after filling it. */
      filled: [...new Set([...raw.filled, ...this.uploaded])],
      /* Only wording the rules did not recognise reaches a model, and it can
         never come back as `submit`. See labels.ts. */
      controls: await labelControls(controls),
      challenge: raw.hasCaptcha ? 'captcha' : raw.hasPassword ? 'account' : 'none',
      confirmation: readConfirmation(raw.body),
      validationError:
        raw.body.match(/(?:your form needs corrections|missing entry for required field)[^\n]{0,160}/i)?.[0]?.trim() ?? '',
    };
  }

  async resolve(fields: DiscoveredField[]) {
    const out = await this.resolver(fields);
    for (const a of out.answers) this.values.set(a.field, a.value);
    return { answerable: out.answers.map((a) => a.field), blocked: out.blocked };
  }

  async fill(fields: string[]) {
    const filled: string[] = [];
    const skipped: string[] = [];
    for (const id of fields) {
      const value = this.values.get(id);
      /* No stored value means no typing. The navigator asked for a field it was
         told was answerable, so this is a bug rather than a licence to invent
         something — it is recorded and skipped, never filled with a guess. */
      if (value === undefined) {
        skipped.push(id);
        continue;
      }
      /* A synthetic button-group id is answered by pressing the button whose
         label matches the value; there is no input to type into. */
      if (id.startsWith('mf-btngroup-')) {
        /*
         * Clicked through Playwright, not through page.evaluate.
         *
         * A JavaScript .click() inside evaluate() runs the handler but React
         * ignores it: on Ashby the button's aria-pressed stayed "false" after
         * every synthetic click, so three required questions were reported
         * unfillable on a form where the buttons were right there. Playwright
         * dispatches the real pointer sequence, which React accepts.
         *
         * The stored answer carries context the button does not -- the vault
         * says "Yes (United States)" where the button says "Yes" -- so the
         * label is matched as a prefix of the value, not the reverse.
         */
        const want = value.trim().toLowerCase();
        const buttons = this.page.locator(`[data-mf-group="${id}"] button[aria-pressed]`);
        const total = await buttons.count().catch(() => 0);

        let ok = false;
        for (let i = 0; i < total; i += 1) {
          const btn = buttons.nth(i);
          const label = ((await btn.innerText().catch(() => '')) || '').trim().toLowerCase();
          if (!label) continue;
          const matches = label === want || (label.length >= 2 && want.startsWith(label)) || (label.length >= 3 && want.includes(label));
          if (!matches) continue;
          await btn.click({ timeout: 8_000 }).catch(() => {});
          /* Read the widget's own state back rather than trusting the click. */
          ok = (await btn.getAttribute('aria-pressed').catch(() => null)) === 'true';
          break;
        }
        (ok ? filled : skipped).push(id);
        continue;
      }

      const ok = await setValue(this.page, id, value).catch(() => false);
      (ok ? filled : skipped).push(id);
    }
    return { filled, skipped };
  }

  /**
   * File fields this run has already attached.
   *
   * Boards consume the file and clear `input.files` immediately, so the next
   * observation reads the field as empty, the no-progress check declares it
   * unfillable, and a run that had successfully attached the résumé stops over
   * the very field it completed. What the page forgets, the driver remembers.
   */
  private readonly uploaded = new Set<string>();

  async upload(ref: string): Promise<boolean> {
    if (!this.resumePath) return false;
    const control = (await locate(this.page, ref)) ?? this.page.locator('input[type="file"]').first();
    if ((await control.count()) === 0) return false;
    const ok = await control
      .setInputFiles(this.resumePath)
      .then(() => true)
      .catch(() => false);
    if (ok) this.uploaded.add(ref);

    /*
     * Let the board's own parser finish before anything else happens.
     *
     * Ashby throws up "Parsing your resume. Autofilling key fields..." after
     * an upload and rewrites the form under it. Filling or submitting through
     * that overlay races the rewrite: a final screenshot showed the overlay
     * still spinning at submit time, with a location field it had blanked. The
     * overlay disappearing is the board saying the form is stable again.
     */
    await this.page
      .locator('text=/parsing your resume/i')
      .first()
      .waitFor({ state: 'hidden', timeout: 45_000 })
      .catch(() => {});
    await this.page.waitForTimeout(800);
    return ok;
  }

  async pause(ms: number): Promise<void> {
    await this.page.waitForTimeout(ms);
  }

  async click(ref: string): Promise<void> {
    /* Captured before the click, not after: the page that explains a failure is
       the one the decision was made on, and after the click it is gone. */
    await this.artifacts?.step('before-click', this.page);

    const control = this.page.locator(`[data-mf-ref="${ref}"]`).first();
    await control.click({ timeout: 15_000 });
    /* Settle before the next observation. `networkidle` alone hangs forever on
       pages holding a websocket or a polling analytics beacon, so it is raced
       against a fixed wait rather than awaited on its own. */
    await Promise.race([
      this.page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => {}),
      this.page.waitForTimeout(2500),
    ]);
  }
}
