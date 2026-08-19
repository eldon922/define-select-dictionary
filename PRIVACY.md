# Privacy policy

_Last updated: 19 August 2026_

This policy covers the **define-select-dictionary** browser extension.

## The short version

The extension has no servers and no analytics. Nothing is sent to its
developer, ever. The only data that leaves your browser is the single word you
ask to define, which is sent to the dictionary services that answer the lookup.

## What leaves your browser

When you double-click a word (while holding your configured trigger key, if you
set one), the extension sends **that word alone** to look up its definition:

| Recipient               | What is sent                 | When                                            |
| ----------------------- | ---------------------------- | ----------------------------------------------- |
| `api.dictionaryapi.dev` | The single word you selected | On every lookup, for English                    |
| `noai.duckduckgo.com`   | The single word you selected | Only when the first service has no entry for it |

Nothing else is transmitted. The page you are on, its URL, its contents, your
identity and your other selections are never sent anywhere. The extension does
not read the page except to take the text you have selected, and only at the
moment you trigger a lookup.

Those two services are operated by third parties and have their own privacy
practices, which this policy does not cover. Requests to them come from your
browser and carry your IP address, as any web request does. Their policies:
[dictionaryapi.dev](https://dictionaryapi.dev/) and
[DuckDuckGo](https://duckduckgo.com/privacy).

## What stays on your device

- **Your settings** — language, trigger key, and whether word history is on.
- **Word history** — if enabled, each word you look up and its definition, so
  the options page can show a count and export it as CSV. This is stored with
  the browser's local extension storage and never transmitted.

You can turn history off, or clear it, at any time from the options page.
Removing the extension deletes all of it.

## What is never collected

No personal information, no account, no browsing history, no page contents, no
location, no analytics, no telemetry, no advertising identifiers. The extension
contains no tracking code and no remote code: everything it runs ships inside
the package.

## Permissions and why they exist

- `storage` — to keep your settings and, if you opt in, your word history.
- `offscreen` — to parse the fallback lookup's HTML, which the extension's
  background service worker cannot do on its own.
- Access to `api.dictionaryapi.dev` and `noai.duckduckgo.com` — to fetch
  definitions.
- Running on the pages you visit — so a double-click can define a word wherever
  you read. It acts only on the text you select, only when you trigger it.

## Contact

Questions or concerns: open an issue at
<https://github.com/eldon922/define-select-dictionary/issues>.
