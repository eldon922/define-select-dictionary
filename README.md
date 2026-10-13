# Define Select Dictionary

Define Select Dictionary is an instant, in-browser dictionary for Edge and Chrome.
Whenever you come across an unfamiliar word or phrase online, simply double-click it (or select it with the mouse) to
see its definitions, pronunciation, and an option to learn more, without having to leave the page.

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

- **Instant lookups**: double-click any word to get a popup with up to five definitions. When the Dictionary API
  supplies them, definitions are grouped by part of speech and come with example sentences.
- **Phrase lookups**: drag to select two or more words and the popup defines the whole phrase. Words are recognised by
  ordinary spaces, so text without them (such as Chinese or Japanese) is looked up by double-click only.
- **Pronunciation**: a speaker icon that reads the word aloud with your browser's text-to-speech. When the Dictionary
  API supplies them, a phonetic transcription and a recorded pronunciation are used too.
- **Search engine**: choose Google (the default) or DuckDuckGo. It is used for lookups and for the Learn more link.
- **Nested lookups**: double-click a word _inside_ a popup to look that up too.
- **Trigger key**: optionally require holding Ctrl, Alt, or Shift (Command on macOS) while double-clicking or
  selecting, so popups only appear when you want them.
- **Word history**: optionally store every word you look up, view the count in the options page, and export it as CSV.
- **Learn more**: every popup links to a full web search for the text in your chosen search engine.
- **Dark mode**: the popup and options page follow your system color scheme.

## Usage

1. Double-click a word on any page, or drag to select several words (holding your configured trigger key, if set).
2. Click the speaker icon to hear the word, or "Learn more »" for a full search.
3. Click anywhere outside the popup, or its × button, to dismiss it.

With no trigger key set (the default), selecting two or more words to copy them also opens a popup and sends the
selection off for lookup. Pick a trigger key in the options if you would rather it did not.

Settings live on the extension's options page: click the toolbar icon, or open it from the extensions page
(Details → Extension options). It covers language, search engine, trigger key, and word history (including CSV download
and clearing).

## How it works

Definitions come from the search engine you choose in the options: Google (the default; its translate service is asked
for the definition) or a DuckDuckGo search. If that search returns no definition, the free
[Dictionary API](https://dictionaryapi.dev/) is tried as a fallback for the languages it supports. Lookups are sent only
to those services and only when you trigger them; the extension collects no data (word history is stored locally in
your browser and never leaves it). Full details in [PRIVACY.md](PRIVACY.md).

This is a Manifest V3 extension. Its background logic runs in a service worker, which has no DOM of its own, so the
HTML of the DuckDuckGo results page is parsed in a short-lived
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
  manifest keys, and host permissions for the lookup sources.
- Moved the search results' HTML parsing into an offscreen document, since a service worker has no DOM.
- Added a toolbar button that shows the options in a popup.
- Added lookups for multi-word selections made by dragging.
- Added a search-engine option (Google or DuckDuckGo). The chosen engine is tried first for lookups and drives the Learn
  more link; the Dictionary API is the fallback.
- Gave every lookup step a deadline, so a stalled request falls back or reports a failure instead of leaving the popup on
  "Please wait…" forever, and made tabs left open across an extension reload say so instead of hanging.
- Fixed nested lookups, which Chromium broke: it retargets a selection made inside a shadow root, reporting it as
  collapsed, so double-clicking a word inside a popup did nothing.
- Renamed the extension to Define Select Dictionary.

## License

GPLv3 license. See LICENSE file for details.
