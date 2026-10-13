# Privacy policy

_Last updated: 21 September 2026_

This policy covers the **Define Select Dictionary** browser extension.

## The short version

The extension has no servers and no analytics. Nothing is sent to its
developer, ever. The only data that leaves your browser is the text you select
to define, which is sent to the search engine you chose (Google by default) and,
if that finds no definition, to a dictionary service.

## What leaves your browser

When you double-click a word, or select several words with the mouse (while
holding your configured trigger key, if you set one), the extension sends **the
text you selected** to look up its definition. That is usually a single word,
but if you select a phrase or a longer passage, the whole selection is sent.

If you have not set a trigger key (the default), selecting two or more words for
any reason, such as to copy them, also triggers a lookup. Set a trigger key on
the options page to prevent that.

| Recipient                  | What is sent                                | When                                                                         |
| -------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------- |
| `translate.googleapis.com` | The selected text and your language setting | On every lookup, if Google is your search engine (the default)               |
| `noai.duckduckgo.com`      | The selected text                           | On every lookup, if DuckDuckGo is your search engine                         |
| `api.dictionaryapi.dev`    | The selected text and your language setting | Only when the search engine finds no definition and your language is covered |

If you click **Learn more**, your browser opens a search for the selected text on
your chosen search engine in a new tab. That is an ordinary visit to that site,
governed by its own policy, not something the extension does in the background.

Nothing else is transmitted. The page you are on, its URL, its contents, your
identity and your other selections are never sent anywhere. The extension does
not read the page except to take the text you have selected, and only at the
moment you trigger a lookup.

These services are operated by third parties and have their own privacy
practices, which this policy does not cover. Requests to them come from your
browser and carry your IP address, as any web request does. Their policies:
[Google](https://policies.google.com/privacy),
[DuckDuckGo](https://duckduckgo.com/privacy) and
[dictionaryapi.dev](https://dictionaryapi.dev/).

## What stays on your device

- **Your settings** — language, search engine, trigger key, and whether word
  history is on.
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
- `offscreen` (Chrome and Edge only) — to parse the DuckDuckGo results page's HTML, which the extension's
  background service worker cannot do on its own.
- Access to `translate.googleapis.com`, `noai.duckduckgo.com` and `api.dictionaryapi.dev`
  — to fetch definitions.
- Running on the pages you visit — so a double-click or selection can define
  text wherever you read. It acts only on the text you select, only when you
  trigger it.

## Contact

Questions or concerns: open an issue at
<https://github.com/eldon922/define-select-dictionary/issues>.
