// Chrome and Edge expose the extension APIs under `chrome`; alias them so the
// rest of the code reads as standard WebExtensions.
const browser = globalThis.browser ?? globalThis.chrome;

const DEFAULT_LANGUAGE = "en";
const DEFAULT_TRIGGER_KEY = "none";
const DEFAULT_SEARCH_ENGINE = "google";

// The background lookup gives up on its own after about 14 seconds; this is the
// content script's own safety net in case no reply ever arrives.
const LOOKUP_TIMEOUT_MS = 20000;

const RELOADED_MESSAGE =
  "Define Select Dictionary was reloaded or updated. Refresh this page to use it again.";
let LANGUAGE = DEFAULT_LANGUAGE;
let TRIGGER_KEY = DEFAULT_TRIGGER_KEY;
let SEARCH_ENGINE = DEFAULT_SEARCH_ENGINE;

let POPUP_ID = 0;
const POPUP_LINKS = new Map();

const { computePosition, offset, flip, shift, arrow, autoUpdate } =
  globalThis.FloatingUIDOM;

// Marker attribute identifying popup hosts created by this extension
const POPUP_HOST_ATTR = "data-define-select-dictionary-popup";

// Remove popups orphaned by a previous content-script context
for (const el of document.querySelectorAll(
  `[${POPUP_HOST_ATTR}="${browser.runtime.id}"]`,
)) {
  el.remove();
}

let POPUP_ASSETS = null;

/**
 * Load the popup template and stylesheet, memoized. A failed load resets the
 * memo so the next lookup retries instead of leaving the extension inert.
 *
 * @returns {Promise<{template: HTMLTemplateElement, css: string}>}
 */
function loadPopupAssets() {
  POPUP_ASSETS ??= Promise.all([
    fetch(browser.runtime.getURL("content/popup.html")).then((r) => r.text()),
    fetch(browser.runtime.getURL("content/popup.css")).then((r) => r.text()),
  ])
    .then(([html, css]) => {
      const doc = new DOMParser().parseFromString(html, "text/html");
      const template = document.createElement("template");
      template.content.append(...doc.body.children);
      return { template, css };
    })
    .catch((error) => {
      POPUP_ASSETS = null;
      console.error(
        "Define Select Dictionary: failed to load popup assets",
        error,
      );
      throw error;
    });
  return POPUP_ASSETS;
}

loadPopupAssets().catch(() => {});

/**
 * Register a popup element in the tree of popups.
 *
 * @param el {HTMLElement} The popup div to register.
 * @param parentId {string} The id of the parent popup, else '' for root popup.
 * @returns {string} The id assigned to this popup.
 */
function registerPopup(el, parentId = "") {
  const id = String(++POPUP_ID);
  el.dataset.id = id;
  el.dataset.parent = parentId;
  POPUP_LINKS.set(id, { el, parentId, children: new Set(), cleanup: null });
  if (parentId) {
    POPUP_LINKS.get(parentId)?.children.add(id);
  }
  return id;
}

/**
 * Unlink a popup from its parent in the tree of popups.
 *
 * @param id {string} The id of the popup to unlink.
 */
function unlinkFromParent(id) {
  const node = POPUP_LINKS.get(id);
  if (!node) {
    return;
  }
  if (node.parentId) {
    POPUP_LINKS.get(node.parentId)?.children.delete(id);
  }
}

/**
 * Prune a subtree of popups, optionally including the root of the subtree.
 *
 * @param id {string} The id of the root of the subtree to prune.
 * @param includeSelf {boolean} Whether to include the root of the subtree.
 */
function pruneSubtree(id, includeSelf = false) {
  const node = POPUP_LINKS.get(id);
  if (!node) {
    return;
  }

  for (const childId of Array.from(node.children)) {
    pruneSubtree(childId, true);
  }

  if (includeSelf) {
    unlinkFromParent(id);
    node.cleanup?.();
    node.el.remove();
    POPUP_LINKS.delete(id);
  } else {
    node.children.clear();
  }
}

/**
 * Check if an event originated from within a popup.
 *
 * @param e {Event} The event to check.
 * @returns {*|null} The popup element if found, else null.
 */
function eventFromPopup(e) {
  const path = e.composedPath ? e.composedPath() : [];
  return (
    path.find(
      (n) =>
        n instanceof HTMLElement &&
        n.dataset?.id &&
        POPUP_LINKS.get(n.dataset.id)?.el === n,
    ) || null
  );
}

/**
 * Remove all popups from the document.
 */
function removeAllPopups() {
  for (const id of Array.from(POPUP_LINKS.keys())) {
    pruneSubtree(id, true);
  }
}

// A drag-select ends with mouseup and then an immediate click. Without this
// flag that click would close the popup the mouseup handler just opened.
let SELECTION_JUST_MADE = false;

document.addEventListener("click", (e) => {
  if (SELECTION_JUST_MADE) {
    return;
  }
  if (!eventFromPopup(e)) {
    removeAllPopups();
  }
});

globalThis.addEventListener("pagehide", removeAllPopups);

/**
 * Retrieve the meaning of a word by sending a message to the background script.
 *
 * @param info {Object} The selection info containing the word and its position.
 * @returns {Promise<any>} A promise that resolves with the meaning data.
 */
function retrieveMeaning(info) {
  return browser.runtime.sendMessage({
    word: info.word,
    lang: LANGUAGE,
    searchEngine: SEARCH_ENGINE,
    time: Date.now(),
  });
}

/**
 * Replace a popup's "Please wait…" with an explanation of what went wrong.
 *
 * @param popupDiv {Object} The popup to update.
 * @param heading {string} The new heading.
 * @param message {string} The status line to show under it.
 */
function showFailure(popupDiv, heading, message) {
  popupDiv.heading.textContent = heading;
  popupDiv.status.textContent = message;
}

/**
 * Handle the case where no meaning is found for the selected word.
 *
 * @param popupDiv {Object} The popup to update.
 */
function noMeaningFound(popupDiv) {
  showFailure(popupDiv, "Sorry", "No definition was found.");
}

/**
 * Tell whether this script has been cut off from its extension. When the
 * extension is reloaded or updated, tabs that were already open keep running
 * the old content script, and every extension call from it throws.
 *
 * @returns {boolean}
 */
function extensionWasReloaded() {
  return !browser.runtime?.id;
}

/**
 * Ask the background for a definition and show the outcome in the popup. Every
 * path ends by replacing "Please wait…", including a dead extension context
 * and a reply that never arrives.
 *
 * @param info {Object} The selection info.
 * @param popupDiv {Object} The popup to update.
 */
function lookUp(info, popupDiv) {
  if (extensionWasReloaded()) {
    showFailure(popupDiv, "Extension reloaded", RELOADED_MESSAGE);
    return;
  }

  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("Lookup timed out")),
      LOOKUP_TIMEOUT_MS,
    );
  });

  Promise.race([Promise.resolve().then(() => retrieveMeaning(info)), timeout])
    .then((response) => {
      if (!response?.content) {
        return noMeaningFound(popupDiv);
      }
      appendToDiv(popupDiv, response.content);
    })
    .catch(() => {
      if (extensionWasReloaded()) {
        showFailure(popupDiv, "Extension reloaded", RELOADED_MESSAGE);
      } else {
        showFailure(
          popupDiv,
          "Sorry",
          "The lookup did not finish. Check your connection and try again.",
        );
      }
    })
    .finally(() => clearTimeout(timer));
}

/**
 * Build the "Learn more" URL based on the current search engine setting.
 *
 * @param word {string} The word to look up.
 * @returns {string} The URL for the search engine.
 */
function buildLearnMoreUrl(word) {
  if (SEARCH_ENGINE === "google") {
    return `https://www.google.com/search?q=define+${encodeURIComponent(word)}&hl=${LANGUAGE}`;
  }
  // DuckDuckGo
  const ddgLang = LANGUAGE === "en" ? "us-en" : LANGUAGE;
  return `https://noai.duckduckgo.com/search?kl=${ddgLang}&q=define+${encodeURIComponent(word)}`;
}

/**
 * Open a modal popup with the definition of the selected word.
 *
 * @param event {Event} The event that triggered the popup.
 */
function openModal(event) {
  const fromPopup = eventFromPopup(event);
  const info = getSelectionInfo(event, fromPopup);
  if (!info) {
    return;
  }

  if (fromPopup) {
    pruneSubtree(fromPopup.dataset.id);
  }
  const parentId = fromPopup ? fromPopup.dataset.id : "";

  loadPopupAssets()
    .then((assets) => {
      lookUp(info, createDiv(info, parentId, assets));
    })
    .catch(() => {});
}

/**
 * Check if the trigger key condition is met for a given mouse event.
 *
 * @param e {MouseEvent} The event to check.
 * @returns {boolean}
 */
function triggerKeyActive(e) {
  return (
    TRIGGER_KEY === "none" ||
    (typeof e[`${TRIGGER_KEY}Key`] === "boolean" && e[`${TRIGGER_KEY}Key`])
  );
}

document.addEventListener("dblclick", (e) => {
  if (triggerKeyActive(e)) {
    openModal(e);
  }
});

/**
 * Fire openModal when the user finishes drag-selecting multiple words.
 * Single-word selections are handled by dblclick; this covers multi-word spans.
 */
document.addEventListener("mouseup", (e) => {
  if (eventFromPopup(e)) return; // don't interfere with popup interactions
  if (!triggerKeyActive(e)) return;

  const selection = globalThis.getSelection?.();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return;
  const word = selection.toString().trim();
  // Only fire for multi-word selections (those containing a space); single
  // words are already handled by the dblclick listener above.
  if (word.length > 1 && word.includes(" ")) {
    removeAllPopups(); // a fresh selection replaces any earlier popup
    SELECTION_JUST_MADE = true;
    // The click fires in the same task as mouseup; clear the flag right after.
    setTimeout(() => (SELECTION_JUST_MADE = false), 0);
    openModal(e);
  }
});

/**
 * Read the selection a double-click produced.
 *
 * Chromium retargets a selection made inside a shadow root: the document's
 * selection still stringifies to the selected word, but it reports itself as
 * collapsed with both endpoints moved onto the host element, so the usual
 * checks reject it and no range is available to anchor to. The shadow root's
 * own getSelection() is the one that still knows the real range. Nested
 * lookups, where the user double-clicks a word inside a popup, depend on this.
 *
 * @param fromPopup {?HTMLElement} The popup the double-click landed in, if any.
 * @returns {?Selection} The selection to read, or null if there is none.
 */
function selectionFor(fromPopup) {
  const root = fromPopup?.shadowRoot;
  if (root && typeof root.getSelection === "function") {
    const selection = root.getSelection();
    if (selection?.rangeCount && !selection.isCollapsed) {
      return selection;
    }
  }
  return globalThis.getSelection?.() ?? null;
}

/**
 * Get information about the current text selection.
 *
 * @param event {Event} The event that triggered the selection.
 * @param fromPopup {?HTMLElement} The popup the event came from, if any.
 * @returns The selection info or null if no valid selection.
 */
function getSelectionInfo(event, fromPopup = null) {
  const selection = selectionFor(fromPopup);
  if (!selection || selection.isCollapsed || !selection.rangeCount) {
    return null;
  }

  const word = selection.toString().trim();
  if (word.length <= 1) {
    return null;
  }

  // Clone the range so the popup stays anchored to the selected text even
  // after the page selection itself is cleared.
  const range = selection.getRangeAt(0).cloneRange();
  const clientX = event?.clientX ?? 0;
  const clientY = event?.clientY ?? 0;

  return { word, range, clientX, clientY };
}

/**
 * Build a Floating UI virtual element anchored to the selection rectangle,
 * falling back to the mouse position for selections without a box.
 *
 * @param info {Object} The selection info.
 * @returns {Object} A virtual element usable as a Floating UI reference.
 */
function createAnchor(info) {
  return {
    getBoundingClientRect() {
      const rect = info.range.getBoundingClientRect();
      if (rect.width || rect.height) {
        return rect;
      }
      return {
        width: 0,
        height: 0,
        x: info.clientX,
        y: info.clientY,
        top: info.clientY,
        bottom: info.clientY,
        left: info.clientX,
        right: info.clientX,
      };
    },
    contextElement: info.range.startContainer?.parentElement ?? undefined,
  };
}

function createDiv(info, parentId, assets) {
  const hostDiv = document.createElement("div");
  hostDiv.setAttribute(POPUP_HOST_ATTR, browser.runtime.id);
  hostDiv.style.position = "fixed";
  hostDiv.style.top = "0";
  hostDiv.style.left = "0";
  hostDiv.style.width = "max-content";
  hostDiv.style.zIndex = "2147483647";

  const thisId = registerPopup(hostDiv, parentId);
  const shadow = hostDiv.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = assets.css;
  shadow.appendChild(style);
  shadow.appendChild(assets.template.content.cloneNode(true));

  const headingEl = shadow.querySelector(".heading");
  const pronunciationEl = shadow.querySelector(".pronunciation");
  const statusEl = shadow.querySelector(".status");
  const definitionsEl = shadow.querySelector(".definitions");
  const moreInfoEl = shadow.querySelector(".learn-more");
  const audioEl = shadow.querySelector(".audio");
  const closeBtn = shadow.querySelector(".close-btn");
  const arrowEl = shadow.querySelector(".arrow");

  // Set and immediately show the "Learn more" link — don't wait for the
  // definition to load so the user can follow it even while it's loading.
  moreInfoEl.href = buildLearnMoreUrl(info.word);
  moreInfoEl.hidden = false;

  closeBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    pruneSubtree(thisId, true);
  });

  document.body.appendChild(hostDiv);

  const anchor = createAnchor(info);
  const updatePosition = () => {
    computePosition(anchor, hostDiv, {
      strategy: "fixed",
      placement: "bottom",
      middleware: [
        offset(10),
        flip(),
        shift({ padding: 8 }),
        arrow({ element: arrowEl, padding: 12 }),
      ],
    }).then(({ x, y, placement, middlewareData }) => {
      hostDiv.style.left = `${x}px`;
      hostDiv.style.top = `${y}px`;

      const side = placement.split("-")[0];
      const staticSide = {
        top: "bottom",
        bottom: "top",
        left: "right",
        right: "left",
      }[side];
      const arrowData = middlewareData.arrow || {};
      Object.assign(arrowEl.style, {
        left: arrowData.x == null ? "" : `${arrowData.x}px`,
        top: arrowData.y == null ? "" : `${arrowData.y}px`,
        right: "",
        bottom: "",
        [staticSide]: "-6px",
      });
    });
  };

  POPUP_LINKS.get(thisId).cleanup = autoUpdate(anchor, hostDiv, updatePosition);

  return {
    heading: headingEl,
    pronunciation: pronunciationEl,
    status: statusEl,
    definitions: definitionsEl,
    moreInfo: moreInfoEl,
    audio: audioEl,
  };
}

/**
 * Play the pronunciation of a word: recorded audio when available, otherwise
 * the browser's built-in text-to-speech.
 *
 * @param word {string} The word to pronounce.
 * @param audioSrc {?string} URL of a recorded pronunciation, if any.
 */
function playPronunciation(word, audioSrc) {
  const speak = () => {
    if (!globalThis.speechSynthesis) {
      return;
    }
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = LANGUAGE;
    speechSynthesis.speak(utterance);
  };

  if (audioSrc) {
    new Audio(audioSrc).play().catch(speak);
  } else {
    speak();
  }
}

function appendToDiv(createdDiv, content) {
  createdDiv.heading.textContent = content.word;
  createdDiv.pronunciation.textContent = content.phoneticText || "";

  createdDiv.status.remove();
  for (const meaning of content.meanings) {
    const item = document.createElement("li");
    if (meaning.partOfSpeech) {
      const pos = document.createElement("span");
      pos.className = "pos";
      pos.textContent = meaning.partOfSpeech;
      item.appendChild(pos);
    }
    item.appendChild(document.createTextNode(meaning.definition));
    if (meaning.example) {
      const example = document.createElement("span");
      example.className = "example";
      example.textContent = meaning.example;
      item.appendChild(example);
    }
    createdDiv.definitions.appendChild(item);
  }
  createdDiv.definitions.hidden = false;

  createdDiv.audio.hidden = false;
  createdDiv.audio.addEventListener("click", () => {
    playPronunciation(content.word, content.audioSrc);
  });
}

/**
 * Apply user settings from storage to this script's state.
 *
 * @param results {Object} The storage contents.
 */
function applySettings(results) {
  const {
    language = DEFAULT_LANGUAGE,
    interaction = { dblClick: { key: DEFAULT_TRIGGER_KEY } },
    searchEngine = DEFAULT_SEARCH_ENGINE,
  } = results;

  LANGUAGE = language;
  TRIGGER_KEY = interaction.dblClick?.key ?? DEFAULT_TRIGGER_KEY;
  SEARCH_ENGINE = searchEngine;
}

browser.storage.local.get().then(applySettings);

browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") {
    return;
  }
  const updated = {};
  if (changes.language) {
    updated.language = changes.language.newValue;
  }
  if (changes.interaction) {
    updated.interaction = changes.interaction.newValue;
  }
  if (changes.searchEngine) {
    updated.searchEngine = changes.searchEngine.newValue;
  }
  if (Object.keys(updated).length) {
    applySettings({
      language: LANGUAGE,
      interaction: { dblClick: { key: TRIGGER_KEY } },
      searchEngine: SEARCH_ENGINE,
      ...updated,
    });
  }
});
