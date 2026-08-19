# Lexigo

Lexigo is an instant, in-browser dictionary for Chrome and Edge.
Whenever you come across an unfamiliar word online, simply double-click it to see its definitions, pronunciation, and an
option to learn more, without having to leave the page.

## Installation

Until Lexigo is listed in the Chrome Web Store and Edge Add-ons, install it from source:

1. Build the package ([Development](#development)) with `npm run build`, or simply clone this repository
   ([GitHub](https://github.com/jortvanleenen/lexigo)) — the repository root is a loadable extension as-is.
2. Open `chrome://extensions` (Chrome) or `edge://extensions` (Edge) and enable **Developer mode**.
3. Choose **Load unpacked** and select the repository root, or drag the built zip from `web-ext-artifacts/` onto the
   page.

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

Settings live on the extension's options page: click the Lexigo toolbar icon, or open it from the extensions page
(Details → Extension options). It covers language, trigger key, and word history (including CSV download and clearing).

## How it works

Definitions come from the free [Dictionary API](https://dictionaryapi.dev/), with a DuckDuckGo fallback for words it
doesn't know. Lookups are sent only to those services and only when you trigger them; the extension collects no data
(word history is stored locally in your browser and never leaves it).

Lexigo is a Manifest V3 extension. Its background logic runs in a service worker, which has no DOM of its own, so the
HTML of the DuckDuckGo fallback is parsed in a short-lived
[offscreen document](https://developer.chrome.com/docs/extensions/reference/api/offscreen) that is closed again as soon
as the parse finishes.

## Development

Prerequisites: Node.js and Chrome or Edge.

```bash
npm install        # install dev tooling (ESLint, Prettier, web-ext)
npm run dev        # launch Chromium with the extension, auto-reloading on save
npm run build      # package the extension into web-ext-artifacts/
```

`npm run dev` picks up whichever Chromium-based browser it can find; point it at a specific one by setting
`CHROME_PATH`, for example `CHROME_PATH="/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" npm run dev`.

Quality checks:

```bash
npm run lint       # ESLint with auto-fix (lint:check to only report)
npm run format     # Prettier write (format:check to only report)
```

## Credits

Original work by meetDeveloper ([GitHub Repository](https://github.com/meetDeveloper/Dictionary-Anywhere)).
Lexigo is authored by Jort van Leenen.

## License

GPLv3 license. See LICENSE file for details.
