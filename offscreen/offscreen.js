/* global parseDefinitions */
// Chrome and Edge expose the extension APIs under `chrome`; alias them so the
// rest of the code reads as standard WebExtensions.
const browser = globalThis.browser ?? globalThis.chrome;

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
