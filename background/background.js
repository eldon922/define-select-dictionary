// Chrome and Edge expose the extension APIs under `chrome`; alias them so the
// rest of the code reads as standard WebExtensions.
const browser = globalThis.browser ?? globalThis.chrome;

const DEFAULT_HISTORY_SETTING = { enabled: true };
const MAX_DEFINITIONS = 5;
const OFFSCREEN_DOCUMENT = "offscreen/offscreen.html";

// Chrome and Edge have no per-extension preferences button as prominent as the
// one in Firefox's Add-ons Manager, so the toolbar icon opens the options page.
browser.action.onClicked.addListener(() => browser.runtime.openOptionsPage());

browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Messages this worker sends to the offscreen document come back to every
  // extension context, this listener included; leave those to their addressee.
  if (request?.target === "offscreen") {
    return;
  }

  const { word, lang } = request || {};
  const term = (word || "").trim();
  if (!term) {
    sendResponse({ content: null });
    return true;
  }

  const langNorm = (lang || "en").toLowerCase();

  const primary = () => {
    if (!langNorm.startsWith("en")) return Promise.resolve(null);
    const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(term)}`;
    return fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.resolve(null)))
      .then((json) => parseDictionaryApiResponse(json, term))
      .catch(() => null);
  };

  const fallback = () => {
    console.log("Falling back to DDG lookup");
    const url = `https://noai.duckduckgo.com/?t=h_&q=define+${encodeURIComponent(term)}&ia=web`;
    return fetch(url)
      .then((r) => r.text())
      .then((html) => parseDuckDuckGoHtml(html))
      .then((parsed) => buildFallbackContent(parsed, term))
      .catch(() => null);
  };

  primary()
    .then((content) => content ?? fallback())
    // Write the history entry before answering: once sendResponse has run, the
    // service worker is free to be suspended and a pending write would be lost.
    .then((content) => (content ? rememberWord(content) : null))
    .then((content) => sendResponse({ content }))
    .catch(() => sendResponse({ content: null }));

  return true;
});

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Shape the DuckDuckGo fallback result like a dictionaryapi.dev one, or return
 * null when it carries no usable definitions.
 *
 * @param parsed {?{word: string, definitions: string[]}} The parsed page.
 * @param term {string} The looked-up word, used when DuckDuckGo names none.
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
 * Parse a DuckDuckGo results page in an offscreen document. A service worker
 * has no DOM, so DOMParser lives in a document created just for this.
 *
 * @param html {string} The raw HTML of a DuckDuckGo results page.
 * @returns {Promise<?{word: string, definitions: string[]}>}
 */
function parseDuckDuckGoHtml(html) {
  const run = () =>
    browser.offscreen
      .createDocument({
        url: OFFSCREEN_DOCUMENT,
        reasons: ["DOM_PARSER"],
        justification:
          "Parse the HTML of the DuckDuckGo definitions fallback page.",
      })
      .catch((error) => {
        // A document left behind by an earlier worker generation is exactly
        // what this call would have created, so only real failures propagate.
        if (!/single offscreen document/i.test(error?.message ?? "")) {
          throw error;
        }
      })
      .then(() =>
        browser.runtime.sendMessage({
          target: "offscreen",
          type: "parse-ddg-definitions",
          html,
        }),
      )
      .finally(() => browser.offscreen.closeDocument().catch(() => {}));

  offscreenQueue = offscreenQueue.then(run, run);
  return offscreenQueue;
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
