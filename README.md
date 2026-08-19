# define-select-dictionary

define-select-dictionary is an instant, in-browser dictionary for Edge and Chrome.
Whenever you come across an unfamiliar word online, simply double-click it to see its definitions, pronunciation, and an
option to learn more, without having to leave the page.

## Installation

Until it is listed in Edge Add-ons, install it from source:

1. Build the package ([Development](#development)) with `npm run build`, or simply clone
   [this repository](https://github.com/eldon922/define-select-dictionary) — the repository root is a loadable
   extension as-is.
2. Open `edge://extensions` (Edge) or `chrome://extensions` (Chrome) and enable **Developer mode**.
3. Choose **Load unpacked** and select the repository root, or drag the built zip from `web-ext-artifacts/` onto the
   page.

See [PUBLISHING.md](PUBLISHING.md) for submitting to Edge Add-ons.

Alternatively, run straight from this repository with `npm run dev`, which launches a fresh Chromium profile with the
extension already loaded and reloads it on save.

## Features

- **Instant lookups**: double-click any word to get a popup with up to five definitions, grouped by part of speech,
  with example sentences where available.
- **Pronunciation**: phonetic transcription plus a speaker icon that plays a recorded pronunciation, falling back to
  your browser's text-to-speech when no recording exists.
- **Nested lookups**: double-click a word _inside_ a popup to look that up too.
- **Trigger key**: optionally require holding Ctrl, Alt, or Shift (Command on macOS) while double-clicking, so popups
  only appear when you want them.
- **Word history**: optionally store every word you look up, view the count in the options page, and export it as CSV.
- **Learn more**: every popup links to a full web search for the word.
- **Dark mode**: the popup and options page follow your system color scheme.

## Usage

1. Double-click a word on any page (holding your configured trigger key, if set).
2. Click the speaker icon to hear the word, or "Learn more »" for a full search.
3. Click anywhere outside the popup, or its × button, to dismiss it.

Settings live on the extension's options page: click the toolbar icon, or open it from the extensions page
(Details → Extension options). It covers language, trigger key, and word history (including CSV download and clearing).

## How it works

Definitions come from the free [Dictionary API](https://dictionaryapi.dev/), with a DuckDuckGo fallback for words it
doesn't know. Lookups are sent only to those services and only when you trigger them; the extension collects no data
(word history is stored locally in your browser and never leaves it). Full details in
[PRIVACY.md](PRIVACY.md).

This is a Manifest V3 extension. Its background logic runs in a service worker, which has no DOM of its own, so the
HTML of the DuckDuckGo fallback is parsed in a short-lived
[offscreen document](https://developer.chrome.com/docs/extensions/reference/api/offscreen) that is closed again as soon
as the parse finishes.

## Development

Prerequisites: Node.js and Chrome or Edge.

```bash
npm install        # install dev tooling (ESLint, Prettier, web-ext)
npm run dev        # launch Chromium with the extension, auto-reloading on save
npm run build      # package the extension into web-ext-artifacts/
npm run screenshots # capture store screenshots into store/screenshots/
```

`npm run dev` picks up whichever Chromium-based browser it can find; point it at a specific one by setting
`CHROME_PATH`, for example `CHROME_PATH="/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" npm run dev`.

Quality checks:

```bash
npm run lint       # ESLint with auto-fix (lint:check to only report)
npm run format     # Prettier write (format:check to only report)
```

## Credits

This is a fork of [Lexigo](https://github.com/jortvanleenen/lexigo) by Jort van Leenen, which is itself based on
Dictionary Anywhere by meetDeveloper ([GitHub Repository](https://github.com/meetDeveloper/Dictionary-Anywhere)).
It is published under a different name so it is not confused with the original, which is on Firefox Add-ons.

Changes made in this fork, as the GPLv3 asks be stated:

- Ported from Firefox to Chromium (Edge and Chrome): Manifest V3 service worker background, Chromium-specific
  manifest keys, and host permissions for the two dictionary sources.
- Moved the fallback's HTML parsing into an offscreen document, since a service worker has no DOM.
- Added a toolbar button that opens the options page.
- Fixed nested lookups, which Chromium broke: it retargets a selection made inside a shadow root, reporting it as
  collapsed, so double-clicking a word inside a popup did nothing.
- Renamed the extension to define-select-dictionary.

## License

GPLv3 license. See LICENSE file for details.
