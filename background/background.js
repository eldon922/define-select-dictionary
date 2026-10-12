// Chrome and Edge expose the extension APIs under `chrome`; alias them so the
// rest of the code reads as standard WebExtensions.
const browser = globalThis.browser ?? globalThis.chrome;

const DEFAULT_HISTORY_SETTING = { enabled: false };
const MAX_DEFINITIONS = 5;
const OFFSCREEN_DOCUMENT = "offscreen/offscreen.html";

// Every step of a lookup has a deadline, so a stalled request falls through to
// the next source (or an error) instead of leaving the popup on "Please wait…".
// The steps run one after another, so the worst case is 5 + 4 + 5 = 14 seconds;
// LOOKUP_TIMEOUT_MS is a safety net just above that.
const SEARCH_TIMEOUT_MS = 5000;
const OFFSCREEN_TIMEOUT_MS = 4000;
const DICTIONARY_TIMEOUT_MS = 5000;
const LOOKUP_TIMEOUT_MS = 15000;

// Maps lowercase language codes (as stored in settings) to the exact path
// segment expected by dictionaryapi.dev. Languages not in this map are looked
// up on the search engine only.
const DICTIONARYAPI_LANG_MAP = {
  en: "en",
  es: "es",
  fr: "fr",
  de: "de",
  it: "it",
  "pt-br": "pt-BR",
  ru: "ru",
  ja: "ja",
  ko: "ko",
  ar: "ar",
  hi: "hi",
  zh: "zh",
  tr: "tr",
};

// Chrome and Edge have no per-extension preferences button as prominent as the
// one in Firefox's Add-ons Manager, so the toolbar icon opens the options page.
browser.action.onClicked.addListener(() => browser.runtime.openOptionsPage());

browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Messages this worker sends to the offscreen document come back to every
  // extension context, this listener included; leave those to their addressee.
  if (request?.target === "offscreen") {
    return;
  }

  const { word, lang, searchEngine = "google" } = request || {};
  const term = (word || "").trim();
  if (!term) {
    sendResponse({ content: null });
    return true;
  }

  const langNorm = (lang || "en").toLowerCase();
  const apiLang = DICTIONARYAPI_LANG_MAP[langNorm];

  // dictionaryapi.dev: used as the structured fallback when the selected
  // search engine returns no result. Always tried last, regardless of engine.
  const dictionaryApiFallback = () => {
    if (!apiLang) return Promise.resolve(null);
    const url = `https://api.dictionaryapi.dev/api/v2/entries/${apiLang}/${encodeURIComponent(term)}`;
    return withTimeout(
      (signal) => fetch(url, { signal }).then((r) => (r.ok ? r.json() : null)),
      DICTIONARY_TIMEOUT_MS,
    )
      .then((json) => parseDictionaryApiResponse(json, term))
      .catch(() => null);
  };

  // primary: the selected search engine is the first source tried.
  const primary = () => {
    if (searchEngine === "google") {
      const url = `https://www.google.com/search?q=define+${encodeURIComponent(term)}&hl=${langNorm}`;
      return fetchText(url, SEARCH_TIMEOUT_MS, {
        headers: {
          // A browser-like UA avoids the stripped-down bot response.
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept-Language": `${langNorm},en;q=0.9`,
        },
      })
        .then((html) => parseGoogleHtml(html))
        .then((parsed) => buildFallbackContent(parsed, term))
        .catch(() => null);
    }
    // DuckDuckGo
    const url = `https://noai.duckduckgo.com/?t=h_&q=define+${encodeURIComponent(term)}&ia=web`;
    return fetchText(url, SEARCH_TIMEOUT_MS)
      .then((html) => parseDuckDuckGoHtml(html))
      .then((parsed) => buildFallbackContent(parsed, term))
      .catch(() => null);
  };

  withTimeout(
    () =>
      primary()
        .then((content) => content ?? dictionaryApiFallback())
        // Write the history entry before answering: once sendResponse has run,
        // the service worker is free to be suspended and a pending write would
        // be lost.
        .then((content) => (content ? rememberWord(content) : null)),
    LOOKUP_TIMEOUT_MS,
  )
    .then((content) => sendResponse({ content }))
    .catch(() => sendResponse({ content: null }));

  return true;
});

/**
 * Run an async step, rejecting if it takes longer than `ms`. The step receives
 * an AbortSignal so a real network request is cancelled too; the race means a
 * step that ignores the signal still cannot hang the caller.
 *
 * @param start {function(AbortSignal): Promise<any>} Starts the step.
 * @param ms {number} The deadline in milliseconds.
 * @returns {Promise<any>} The step's result, or a rejection on timeout.
 */
function withTimeout(start, ms) {
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`Timed out after ${ms} ms`));
    }, ms);
  });
  return Promise.race([
    Promise.resolve().then(() => start(controller.signal)),
    deadline,
  ]).finally(() => clearTimeout(timer));
}

/**
 * Fetch a URL and read its body as text, all within one deadline.
 *
 * @param url {string} The URL to fetch.
 * @param ms {number} The deadline in milliseconds.
 * @param options {Object} Extra fetch options, such as headers.
 * @returns {Promise<string>}
 */
function fetchText(url, ms, options = {}) {
  return withTimeout(
    (signal) => fetch(url, { ...options, signal }).then((r) => r.text()),
    ms,
  );
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Shape a search-engine result (Google or DuckDuckGo) like a dictionaryapi.dev
 * one, or return null when it carries no usable definitions.
 *
 * @param parsed {?{word: string, definitions: string[]}} The parsed page.
 * @param term {string} The looked-up text, used when the engine names none.
 */
function buildFallbackContent(parsed, term) {
  if (!parsed?.definitions?.length) {
    return null;
  }

  return {
    word: parsed.word || term,
    phoneticText: null,
    audioSrc: null,
    meanings: parsed.definitions
      .slice(0, MAX_DEFINITIONS)
      .map((definition) => ({
        partOfSpeech: "",
        definition: capitalize(definition),
        example: null,
      })),
  };
}

/**
 * Collect up to MAX_DEFINITIONS definitions across all entries of a
 * dictionaryapi.dev response, preserving part of speech and example.
 */
function collectMeanings(entries) {
  return entries
    .flatMap((entry) =>
      (entry.meanings ?? []).flatMap((meaning) =>
        (meaning.definitions ?? [])
          .filter((definition) => definition.definition)
          .map((definition) => ({
            partOfSpeech: meaning.partOfSpeech || "",
            definition: capitalize(definition.definition),
            example: definition.example || null,
          })),
      ),
    )
    .slice(0, MAX_DEFINITIONS);
}

/**
 * Find the first phonetic transcription and audio recording in the entries
 * of a dictionaryapi.dev response.
 */
function findPhonetics(entries) {
  let phoneticText = null;
  let audioSrc = null;
  for (const entry of entries) {
    const phon = (entry.phonetics || []).find((p) => p.audio || p.text) || {};
    phoneticText ||= phon.text || entry.phonetic || null;
    audioSrc ||= phon.audio || null;
    if (phoneticText && audioSrc) {
      break;
    }
  }
  return { phoneticText, audioSrc };
}

/**
 * Convert a dictionaryapi.dev response into the popup content shape,
 * or null if it contains no usable definitions.
 */
function parseDictionaryApiResponse(json, term) {
  if (!Array.isArray(json) || !json.length) {
    return null;
  }

  const meanings = collectMeanings(json);
  if (!meanings.length) {
    return null;
  }

  return {
    word: json[0].word || term,
    ...findPhonetics(json),
    meanings,
  };
}

// Chrome allows a single offscreen document at a time, so lookups take turns
// on this chain rather than racing each other to create one.
let offscreenQueue = Promise.resolve();

/**
 * Parse a results page in an offscreen document. A service worker has no DOM,
 * so DOMParser lives in a document created just for this. The whole exchange
 * has a deadline, and the document is always closed afterwards, so one stuck
 * parse cannot block the lookups queued behind it.
 *
 * @param type {string} The message type the offscreen document understands.
 * @param html {string} The raw HTML of a results page.
 * @param justification {string} Why the offscreen document is needed.
 * @returns {Promise<?{word: string, definitions: string[]}>}
 */
function parseInOffscreen(type, html, justification) {
  const run = () =>
    withTimeout(
      () =>
        browser.offscreen
          .createDocument({
            url: OFFSCREEN_DOCUMENT,
            reasons: ["DOM_PARSER"],
            justification,
          })
          .catch((error) => {
            // A document left behind by an earlier worker generation is
            // exactly what this call would have created, so only real
            // failures propagate.
            if (!/single offscreen document/i.test(error?.message ?? "")) {
              throw error;
            }
          })
          .then(() =>
            browser.runtime.sendMessage({ target: "offscreen", type, html }),
          ),
      OFFSCREEN_TIMEOUT_MS,
    ).finally(() => browser.offscreen.closeDocument().catch(() => {}));

  offscreenQueue = offscreenQueue.then(run, run);
  return offscreenQueue;
}

/**
 * @param html {string} The raw HTML of a Google results page.
 * @returns {Promise<?{word: string, definitions: string[]}>}
 */
function parseGoogleHtml(html) {
  return parseInOffscreen(
    "parse-google-definitions",
    html,
    "Parse the HTML of the Google search results page.",
  );
}

/**
 * @param html {string} The raw HTML of a DuckDuckGo results page.
 * @returns {Promise<?{word: string, definitions: string[]}>}
 */
function parseDuckDuckGoHtml(html) {
  return parseInOffscreen(
    "parse-ddg-definitions",
    html,
    "Parse the HTML of the DuckDuckGo search results page.",
  );
}

/**
 * Store a looked-up word in the local history, unless the user turned history
 * off. Never rejects: a failed write must not cost the user their definition.
 *
 * @param content {Object} The popup content to record.
 * @returns {Promise<Object>} The same content, once any write has settled.
 */
function rememberWord(content) {
  return browser.storage.local
    .get("history")
    .then((results) => {
      const history = results.history || DEFAULT_HISTORY_SETTING;
      return history.enabled ? saveWord(content) : undefined;
    })
    .catch(() => {})
    .then(() => content);
}

function saveWord(content) {
  return browser.storage.local.get("definitions").then((results) => {
    const definitions = results.definitions || {};
    definitions[content.word] = content.meanings
      .map((m) => (m.partOfSpeech ? `(${m.partOfSpeech}) ` : "") + m.definition)
      .join("\n");
    return browser.storage.local.set({ definitions });
  });
}
