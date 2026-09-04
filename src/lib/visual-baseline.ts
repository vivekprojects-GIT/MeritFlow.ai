/**
 * Baseline visual generation.
 *
 * The model writes real HTML/CSS/JS for a lesson visual — no component
 * registry, no fixed block types. That freedom is the whole point of the
 * baseline path, and it is also why the output is treated as hostile:
 *
 *  - It is never rendered as markup in our own document. It only ever goes into
 *    an iframe with `sandbox="allow-scripts"` and NO `allow-same-origin`, which
 *    puts it on an opaque origin: it cannot reach our DOM, cookies, or storage.
 *  - The document shell below carries `default-src 'none'`, so the generated
 *    code cannot call out to the network — nothing to exfiltrate to, no remote
 *    script to pull in.
 *  - The code itself is never shown to the learner, and neither is the frame.
 *    A visual that fails to render simply doesn't appear.
 */

export const VISUAL_SYSTEM = `You write a single self-contained visual explanation for one lesson.

Output rules
- Return ONLY an HTML fragment: markup, plus at most one <style> and one <script>. No markdown fences, no commentary, no <html>/<head>/<body> wrapper.
- Everything must be self-contained. No external URLs, no <img src="http...">, no fetch, no CDN scripts, no web fonts, no iframes.
- Use inline SVG, CSS, and vanilla JS only. No libraries.
- The visual must fit a container about 640px wide and no more than 520px tall, and be responsive down to 320px.

Design rules
- Teach ONE idea from the lesson: a process, a contrast, a structure, or a relationship. Not a summary of the whole lesson.
- Prefer a diagram over a paragraph. Label everything. Text inside the visual should be short.
- Use a restrained palette on a white background: #2563eb (primary), #7c3aed, #0d9488, #d97706, ink #0f172a, muted #475569, hairlines #e4e8f0. System sans-serif.
- Do not invent statistics. Only use numbers that appear in the lesson.
- Interactivity is optional; if used, keep it to hover or a single toggle, and make the visual fully understandable without it.`;

export function buildVisualPrompt(lesson: {
  lessonTitle: string;
  objective: string;
  intro: string;
  sections: { heading: string; body: string }[];
  keyPoints: string[];
}): string {
  const sections = lesson.sections
    .slice(0, 5)
    .map((section) => `- ${section.heading}: ${section.body.slice(0, 320)}`)
    .join('\n');

  return [
    `Lesson: ${lesson.lessonTitle}`,
    `Goal: ${lesson.objective}`,
    '',
    'Sections:',
    sections,
    '',
    lesson.keyPoints.length ? `Key points:\n${lesson.keyPoints.map((k) => `- ${k}`).join('\n')}` : '',
    '',
    'Produce the single most useful visual for understanding this lesson.',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Strip markdown fences and anything outside the fragment the model was asked for. */
export function cleanFragment(raw: string): string {
  let out = raw.trim();
  /* Strip the opening and closing fences independently: a response cut off at
     the token limit has an opening fence and no closing one, and a paired
     regex would leave the ```html sitting in the markup. */
  out = out.replace(/^```[a-zA-Z]*\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
  // A stray full document still works if we take what's inside <body>.
  const body = out.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (body) out = body[1].trim();
  return out;
}

/**
 * Reject output that tries to reach the network or escape the frame. The CSP
 * would block these anyway — this is the belt to the CSP's braces, and it also
 * means we fail fast rather than rendering a visual with dead holes in it.
 */
export function isSafeFragment(fragment: string): boolean {
  if (!fragment || fragment.length < 40) return false;
  const banned = [
    /<iframe/i,
    /<object/i,
    /<embed/i,
    /<link[^>]+href/i,
    /src\s*=\s*["']?https?:/i,
    /url\(\s*["']?https?:/i,
    /\bfetch\s*\(/i,
    /XMLHttpRequest/i,
    /import\s*\(/i,
    /\bwindow\.parent\b/i,
    /\bwindow\.top\b/i,
    /document\.cookie/i,
    /localStorage/i,
  ];
  return !banned.some((pattern) => pattern.test(fragment));
}

/**
 * Wrap the fragment in the document actually loaded by the iframe.
 *
 * The CSP is the security boundary: `default-src 'none'` means no network of
 * any kind. The bootstrap script reports success (with a measured height) or
 * failure back to the parent, which is how "only successful visuals render"
 * is enforced — silence counts as failure.
 */
export function buildVisualDocument(fragment: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; font-src data:;">
<style>
  html,body{margin:0;padding:0;background:#fff;color:#0f172a;
    font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;}
  body{padding:16px;overflow-x:hidden;}
  *{box-sizing:border-box;max-width:100%;}
</style>
</head>
<body>
${fragment}
<script>
(function () {
  function report(ok) {
    try {
      var h = Math.min(560, Math.max(120, document.body.scrollHeight));
      parent.postMessage({ __visual: true, ok: ok, height: h }, '*');
    } catch (e) {}
  }
  window.onerror = function () { report(false); return true; };
  window.addEventListener('DOMContentLoaded', function () {
    // A visual that drew nothing is a failure, not an empty success.
    setTimeout(function () {
      var painted = document.body.scrollHeight > 40 && document.body.children.length > 1;
      report(painted);
    }, 60);
  });
})();
</script>
</body>
</html>`;
}
