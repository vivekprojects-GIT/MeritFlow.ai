/**
 * MeritFlow Autofill — the page half.
 *
 * Hands and eyes only. This script reads the fields on the page and types what
 * the server sends back. It holds no answers, no résumé and no vault, and it
 * has no opinion about whether a question is close enough to one it knows.
 *
 * ## What it will not do
 *
 * **It never submits.** Not a configuration, a property: there is no code here
 * that clicks a button. The candidate reviews what was filled and presses send
 * themselves. That is what keeps this a tool rather than something operating an
 * employer's form on its own, and it is why running in someone's own browser is
 * defensible where a headless session is not.
 *
 * **It never invents.** A field the server declined comes back with a reason
 * and is left empty and marked, rather than filled with a plausible guess.
 *
 * Injected on demand by the popup, not declared for every site — it has no
 * business running on pages nobody asked it to touch.
 */

(() => {
  /** Fields worth offering to fill. */
  const SELECTOR =
    'input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=image]), textarea, select';

  /** Page furniture that is not an application question. */
  const CHROME = 'nav, header, footer, [role=search], [role=navigation], [role=banner], [role=contentinfo]';

  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
  };

  const labelFor = (el, fallback) => {
    const id = el.getAttribute('id');
    if (id) {
      const lab = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (lab?.textContent) return lab.textContent.trim();
    }
    const wrap = el.closest('label');
    if (wrap?.textContent) return wrap.textContent.trim();
    const by = el.getAttribute('aria-labelledby');
    if (by) {
      const node = document.getElementById(by);
      if (node?.textContent) return node.textContent.trim();
    }
    return (el.getAttribute('aria-label') || el.getAttribute('placeholder') || fallback || '').trim();
  };

  const kindOf = (el) => {
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute('type') || '').toLowerCase();
    if (tag === 'textarea') return 'textarea';
    if (tag === 'select') return 'select';
    if (type === 'file') return 'file';
    if (type === 'checkbox' || type === 'radio') return 'boolean';
    return 'text';
  };

  /** Every candidate field, keyed by the name the server will answer against. */
  function collect() {
    const out = [];
    const seen = new Set();

    for (const el of document.querySelectorAll(SELECTOR)) {
      if (el.closest(CHROME) || !visible(el) || el.disabled || el.readOnly) continue;
      const name = el.getAttribute('name') || el.getAttribute('id') || '';
      if (!name || seen.has(name)) continue;
      /* A site search box is not an application question. */
      if (/^(q|s|search|keyword)$/i.test(name) || el.getAttribute('type') === 'search') continue;
      seen.add(name);

      out.push({
        el,
        id: name,
        label: labelFor(el, name).slice(0, 300),
        required: el.hasAttribute('required') || el.getAttribute('aria-required') === 'true',
        kind: kindOf(el),
      });
    }
    return out;
  }

  /**
   * Set a value the way the page's own framework will notice.
   *
   * React and Vue track the input's value through a property setter and ignore
   * a plain assignment, so a naively filled field looks right and submits
   * empty. Setting through the native setter and then dispatching the events
   * the framework listens for is what makes the value real.
   */
  function setNative(el, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /** Pick the option matching an answer, or null when it is ambiguous. */
  function chooseOption(answer, select) {
    const norm = (s) => s.trim().toLowerCase().replace(/\s+/g, ' ');
    const head = norm(answer.split(/[(—–\-,;:]/)[0]);
    const options = [...select.options].filter((o) => o.value.trim() && (o.textContent || '').trim());

    const exact = (want) => {
      const hits = options.filter((o) => norm(o.textContent || '') === want || norm(o.value) === want);
      return hits.length === 1 ? hits[0] : null;
    };

    /* Same order and the same refusal as the server-side matcher: the vault
       stores "Yes (United States)" and a form offers "Yes". */
    const whole = exact(norm(answer));
    if (whole) return whole;
    const lead = exact(head);
    if (lead) return lead;

    const starts = options.filter((o) => norm(o.textContent || '').startsWith(head) || norm(o.value).startsWith(head));
    return starts.length === 1 ? starts[0] : null;
  }

  function fillOne(field, value) {
    const el = field.el;
    if (field.kind === 'select') {
      const option = chooseOption(value, el);
      if (!option) return false;
      el.value = option.value;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    if (field.kind === 'boolean') {
      if (!/^(yes|true|1|on)$/i.test(value)) return false;
      if (!el.checked) el.click();
      return true;
    }
    if (field.kind === 'file') return false;
    setNative(el, value);
    return true;
  }

  /** A ring so the candidate can see exactly what was touched, and what was not. */
  function mark(el, state) {
    el.style.outline = state === 'filled' ? '2px solid #3f7d4e' : '2px dashed #b25000';
    el.style.outlineOffset = '1px';
    if (state === 'blocked') el.title = 'MeritFlow could not answer this one — it needs you.';
  }

  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg?.type !== 'MF_FILL') return false;

    const fields = collect();
    if (fields.length === 0) {
      reply({ ok: true, filled: [], blocked: [], found: 0 });
      return true;
    }

    chrome.runtime.sendMessage(
      { type: 'MF_RESOLVE', url: location.href, fields: fields.map(({ el, ...f }) => f) },
      (res) => {
        if (!res?.ok) {
          reply({ ok: false, error: res?.error ?? 'MeritFlow is not reachable.' });
          return;
        }

        const byId = new Map(fields.map((f) => [f.id, f]));
        const filled = [];
        const skipped = [];

        for (const answer of res.answers ?? []) {
          const field = byId.get(answer.field);
          if (!field) continue;
          if (fillOne(field, answer.value)) {
            mark(field.el, 'filled');
            filled.push(field.label || field.id);
          } else {
            /* Offered a value the control would not take — a dropdown whose
               options do not include it. Marked, never forced. */
            mark(field.el, 'blocked');
            skipped.push({ label: field.label || field.id, reason: 'This control would not accept the stored answer.' });
          }
        }

        for (const block of res.blocked ?? []) {
          const field = byId.get(block.field);
          if (field) mark(field.el, 'blocked');
          skipped.push({ label: block.label || block.field, reason: block.reason });
        }

        reply({ ok: true, filled, blocked: skipped, found: fields.length, resume: res.resume ?? null });
      },
    );

    /* Asynchronous reply. */
    return true;
  });
})();
