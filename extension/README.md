# MeritFlow Autofill

Fills job applications in your own browser, where you are already signed in.

## Why this exists alongside Auto Apply

Server-side automation works where a form is public — Greenhouse, Lever, Ashby.
It stops everywhere else, and measurement on a real feed says how often: of 38
runs, 11 stopped at "this application needs an account first", 6 at a CAPTCHA,
and 14 found no form at all because the link went to an aggregator.

None of those are engineering problems. They are consequences of being a
headless browser with no session, arriving from a datacenter. In your own
browser they do not arise: you are logged in, the fingerprint is real, and you
opened the page yourself.

So the two halves split by where the wall is:

| | |
|---|---|
| **Auto Apply** (server) | Greenhouse, Lever, Ashby — public forms, no account |
| **Extension** (this) | LinkedIn, Workday, iCIMS — anything behind a login |
| **Shared** | The same answer vault, résumé, verifier and tracker |

## What it will not do

**It never submits.** There is no code in `content.js` that clicks a button.
You review what was filled and press send. That is what keeps this a tool
rather than something operating an employer's form on its own.

**It never invents an answer.** The extension holds no answers and no vault —
it sends the fields it found to MeritFlow and types back what returns. Anything
the server declines is left empty and outlined in amber, with the reason in the
popup. A question nobody has answered stays unanswered.

**It carries no session cookie.** Authentication is a separate bearer token,
issued from Settings and revocable there. A script running on employer pages
should not be holding something that authenticates as your whole account.

## Install

1. `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → select this `extension/` folder
3. In MeritFlow: **Settings → Application email → Browser extension → Show connection token**
4. Click the extension icon, paste the token, press **Connect**

## Use

Open any job application, click the icon, press **Fill this application**.

- Green outline — filled
- Amber outline — needs you, with the reason listed

Then check it and submit yourself.

## Files

| | |
|---|---|
| `manifest.json` | MV3. `host_permissions` covers only the MeritFlow origin. |
| `content.js` | Reads fields, types values, marks what it could not answer. Injected on demand, not declared for every site. |
| `background.js` | Holds the token and is the only thing that talks to MeritFlow. |
| `popup.html` / `popup.js` | Connect, fill, and the report afterwards. |

## Notes

`host_permissions` points at `http://localhost:3000`. Change it — and the origin
in the popup — when the app is hosted somewhere else.

There is no `icon.png` in the repo; Chrome will use a default. Drop one in when
there is a real mark to use.
