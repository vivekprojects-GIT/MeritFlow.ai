/**
 * The popup.
 *
 * Two states: connect, or fill. After a fill it reports both halves — what
 * went in and what it refused — because the refusals are the actionable part.
 * A candidate who is told "4 filled" and nothing else does not know that the
 * work-authorisation question is still blank.
 */

const $ = (id) => document.getElementById(id);

async function render() {
  const { token = '' } = await chrome.storage.local.get(['token']);
  $('setup').classList.toggle('hidden', Boolean(token));
  $('main').classList.toggle('hidden', !token);
}

$('save').addEventListener('click', async () => {
  const token = $('token').value.trim();
  const origin = $('origin').value.trim().replace(/\/+$/, '') || 'http://localhost:3000';
  if (!token) return;
  await chrome.storage.local.set({ token, origin });
  await render();
});

$('forget').addEventListener('click', async () => {
  await chrome.storage.local.remove(['token']);
  $('result').classList.add('hidden');
  await render();
});

$('fill').addEventListener('click', async () => {
  const result = $('result');
  result.classList.remove('hidden');
  result.textContent = 'Reading the page…';

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    result.textContent = 'No page to fill.';
    return;
  }

  try {
    /* Injected on demand rather than declared for every site: this has no
       business running on pages nobody asked it to touch. */
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
  } catch {
    result.textContent = 'This page does not allow extensions to run.';
    return;
  }

  chrome.tabs.sendMessage(tab.id, { type: 'MF_FILL' }, (res) => {
    if (chrome.runtime.lastError || !res) {
      result.textContent = 'Could not read this page.';
      return;
    }
    if (!res.ok) {
      result.textContent = res.error ?? 'Something went wrong.';
      return;
    }
    if (res.found === 0) {
      result.textContent = 'No application fields on this page.';
      return;
    }

    result.replaceChildren();

    const summary = document.createElement('div');
    const filled = document.createElement('span');
    filled.className = 'ok';
    filled.textContent = `${res.filled.length} filled`;
    summary.append(filled);

    if (res.blocked.length > 0) {
      summary.append(document.createTextNode(' · '));
      const left = document.createElement('span');
      left.className = 'warn';
      left.textContent = `${res.blocked.length} need you`;
      summary.append(left);
    }
    result.append(summary);

    if (res.blocked.length > 0) {
      const list = document.createElement('ul');
      /* Capped: a form with thirty unanswerable questions is a form to fill by
         hand, and thirty lines in a popup helps nobody. */
      for (const item of res.blocked.slice(0, 6)) {
        const li = document.createElement('li');
        const label = document.createElement('b');
        label.textContent = item.label;
        li.append(label, document.createTextNode(` — ${item.reason}`));
        list.append(li);
      }
      if (res.blocked.length > 6) {
        const more = document.createElement('li');
        more.textContent = `and ${res.blocked.length - 6} more`;
        list.append(more);
      }
      result.append(list);
    }

    if (res.resume) {
      const note = document.createElement('p');
      note.className = 'hint';
      note.style.margin = '8px 0 0';
      note.textContent = `Attach ${res.resume} yourself — a file cannot be filled in.`;
      result.append(note);
    }
  });
});

void render();
