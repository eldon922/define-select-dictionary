// Loaded by the offscreen document (Chrome, Edge) and by the background page
// (Firefox), which is where the DuckDuckGo page gets parsed in each.

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
// eslint-disable-next-line no-unused-vars -- used by the files that load this one
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
