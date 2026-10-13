// Chrome and Edge expose the extension APIs under `chrome`; alias them so the
// rest of the code reads as standard WebExtensions.
const browser = globalThis.browser ?? globalThis.chrome;

/**
 * Pull the definitions module out of a DuckDuckGo results page.
 *
 * The document produced by DOMParser is inert: it has no browsing context, so
 * scripts do not run and no subresources are loaded. Its nodes are only ever
 * read here, never inserted into this (privileged) document.
 *
 * @param html {string} The raw HTML of a DuckDuckGo results page.
 * @returns {?{word: string, definitions: string[]}} The word as DuckDuckGo
 *   spells it plus its definitions, or null if the page has no definitions.
 */
function parseDefinitions(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const module = doc.querySelector(".module.ia-module--definitions");
  if (!module) {
    return null;
  }

  const title = module.querySelector(".module__title");
  const word = title?.childNodes[0]?.textContent?.trim() || "";

  const definitions = [];
  for (const element of module.querySelectorAll(
    ".module--definitions__definition",
  )) {
    const definition = element.textContent.trim();
    if (definition) {
      definitions.push(definition);
    }
  }

  return { word, definitions };
}

// Registered synchronously during document load, so the message the service
// worker sends right after createDocument() resolves cannot be missed.
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // runtime.sendMessage reaches every extension context, so ignore anything
  // not addressed to this document (such as content script lookups).
  if (message?.target !== "offscreen") {
    return;
  }

  if (message.type === "parse-ddg-definitions") {
    sendResponse(parseDefinitions(message.html));
  }
});
