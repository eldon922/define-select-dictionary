# Publishing to Microsoft Edge Add-ons

Everything Partner Center asks for, ready to paste. Nothing here ships inside
the package — `web-ext.config.mjs` keeps these files out of the zip.

## 1. Build the package

```bash
npm run build
```

This writes `web-ext-artifacts/define-select-dictionary-<version>.zip`. That
single file is the upload. Load it unpacked once more before submitting
(`edge://extensions` → Developer mode → Load unpacked) and confirm a
double-click still defines a word.

**Every submission needs a higher `version` in `manifest.json` than the last
one.** Bump it before building or the upload is rejected.

## 2. Register

[Partner Center → Microsoft Edge program](https://partner.microsoft.com/dashboard/microsoftedge).
Registration is free. Create the developer account first; verification can take
a little time, so do it before you need it.

## 3. Create the submission

**Extension package** — upload the zip from step 1.

**Availability** — pick your markets and whether the listing is public or
hidden. A hidden listing is a good way to smoke-test the store build first.

**Properties**

- Category: `Productivity` (or `Search tools` if offered)
- Privacy policy URL: **required** — see step 4
- This extension does **not** use remote code. Everything it runs is in the
  package; `content/vendor/` holds a vendored copy of floating-ui rather than a
  CDN reference.

## 4. Host the privacy policy

Partner Center wants a URL, not a file. `PRIVACY.md` in this repo is the text.
Either enable GitHub Pages and link the rendered page, or link the file
directly:

```
https://github.com/eldon922/define-select-dictionary/blob/main/PRIVACY.md
```

Update the URL if you rename the repository or default branch.

## 5. Store listing copy

**Name**

```
define-select-dictionary
```

**Short description** (keep under ~132 characters)

```
Double-click any word on any page to see its definition, pronunciation and examples, without leaving what you are reading.
```

**Detailed description**

```
Look up a word without losing your place.

Double-click any word on any web page and a small popup appears with its
definition, right where you are reading. Press on and the popup disappears
when you click away.

FEATURES

- Instant lookups: up to five definitions, grouped by part of speech, with
  example sentences where available.
- Pronunciation: a phonetic transcription plus a speaker button that plays a
  recorded pronunciation, falling back to your browser's text-to-speech when
  no recording exists.
- Nested lookups: met another word you do not know inside a definition?
  Double-click that one too.
- Trigger key: optionally require holding Ctrl, Alt or Shift (Command on
  macOS) while double-clicking, so popups only appear when you want them.
- Word history: optionally keep the words you look up, see the count on the
  options page, and export the lot as CSV. It stays on your device.
- Dark mode: the popup follows your system colour scheme.

PRIVACY

No accounts, no analytics, no tracking, and no data sent to the developer.
The only thing that leaves your browser is the single word you ask to define,
sent to the dictionary services that answer the lookup. Your word history is
stored locally and never transmitted. Full policy: <PRIVACY POLICY URL>

Definitions come from the free Dictionary API (dictionaryapi.dev), with a
DuckDuckGo fallback for words it does not know.

Open source under the GPLv3. Originally based on Lexigo by Jort van Leenen,
itself based on Dictionary Anywhere by meetDeveloper.
```

Replace `<PRIVACY POLICY URL>` with the URL from step 4.

## 6. Screenshots

At least one is required; **1280×800** is the safe size. Capture them against
the real dictionary API so the listing shows what users actually get:

```bash
npm run screenshots
```

This writes PNGs to `store/screenshots/`. It drives whichever Chromium-based
browser it can find — set `EDGE_PATH` or `CHROME_PATH` to choose one. The
directory is gitignored; upload the files straight to Partner Center.

## 7. Permission justifications

Partner Center asks why the extension needs what it declares. These match the
code:

| Declared                                         | Justification                                                                                                                                                                                                                        |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `storage`                                        | Stores the user's own settings (language, trigger key, whether to keep history) and, when they opt in, the local word history shown on the options page. Nothing is transmitted.                                                     |
| `offscreen`                                      | The Manifest V3 service worker has no DOM. When the dictionary API has no entry for a word, the extension parses the fallback lookup's HTML with `DOMParser` in a short-lived offscreen document, which it closes again immediately. |
| `https://api.dictionaryapi.dev/*`                | The dictionary source. Fetches definitions, phonetics and pronunciation audio for the word the user double-clicked.                                                                                                                  |
| `https://noai.duckduckgo.com/*`                  | Fallback definition source, used only when the dictionary API has no entry for the word.                                                                                                                                             |
| Content script on `http://*/*` and `https://*/*` | The extension's entire purpose is to define a word wherever the user double-clicks one, so it must run on the pages they read. It reads only the current text selection, and only when the user triggers a lookup.                   |

**Single purpose:** show the dictionary definition of a word the user
double-clicks on a web page.

## 8. Data-handling disclosure

Answer this honestly; understating transmission is a common rejection and a
worse problem after publication.

- Does it collect personal data? **No.**
- Does it transmit any data off the device? **Yes** — the single selected word
  goes to `api.dictionaryapi.dev`, and to `noai.duckduckgo.com` when the first
  service has no entry. Nothing else: not the page, its URL, its contents, nor
  any identifier.
- Is data sold or used for advertising? **No.**
- Is data stored remotely? **No.** Settings and word history stay in local
  extension storage on the user's device.

## 9. Submit

Certification usually takes a few days. If it is rejected, the report names the
specific policy — fix it, bump `version`, rebuild, and resubmit.

## Note on the name and licence

This is a fork of [Lexigo](https://github.com/jortvanleenen/lexigo) by Jort van
Leenen, published under a different name to avoid being confused with the
original, which is on Firefox Add-ons. The GPLv3 requires that the licence stay
with the code, that source remains available, and that changes are stated —
`README.md` records them. Keep `LICENSE` in the package.
