/**
 * The service worker.
 *
 * Holds the connection token and is the only thing that talks to MeritFlow.
 * The content script asks it for values and never sees the credential — a
 * script injected into an employer's page should not be carrying something
 * that reads the candidate's profile.
 */

const DEFAULT_ORIGIN = 'http://localhost:3000';

async function settings() {
  const { token = '', origin = DEFAULT_ORIGIN } = await chrome.storage.local.get(['token', 'origin']);
  return { token, origin: origin || DEFAULT_ORIGIN };
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type !== 'MF_RESOLVE') return false;

  (async () => {
    const { token, origin } = await settings();
    if (!token) {
      reply({ ok: false, error: 'Paste your connection token first.' });
      return;
    }

    try {
      const res = await fetch(`${origin}/api/extension/fill`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ url: msg.url, fields: msg.fields }),
      });

      if (res.status === 401) {
        reply({ ok: false, error: 'That token is not recognised. Reconnect from Settings.' });
        return;
      }
      if (!res.ok) {
        reply({ ok: false, error: `MeritFlow returned ${res.status}.` });
        return;
      }

      const body = await res.json();
      reply({ ok: true, ...body });
    } catch {
      /* The app not running is the common case, and it is not an error worth
         a stack trace in someone's job application tab. */
      reply({ ok: false, error: 'Could not reach MeritFlow. Is it running?' });
    }
  })();

  return true;
});
