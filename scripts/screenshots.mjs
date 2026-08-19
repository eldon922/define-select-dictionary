/**
 * Capture store screenshots at the size Microsoft Edge Add-ons expects.
 *
 * Drives a real browser with the extension loaded and photographs a genuine
 * lookup, so the listing shows what users actually get rather than a mockup.
 * Requires network access: the definitions come from the live dictionary API.
 *
 *   npm run screenshots
 *   EDGE_PATH="/path/to/msedge" npm run screenshots
 */
import { chromium } from "playwright-core";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, "store", "screenshots");

// Edge Add-ons accepts 1280x800; it is also the safe size for other stores.
const SIZE = { width: 1280, height: 800 };

// Chosen to show the popup at its best: several parts of speech, a phonetic
// transcription, and an example sentence.
const WORD = "serendipity";

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Reading</title>
<style>
  body { margin:0; font:18px/1.75 -apple-system,Segoe UI,Roboto,sans-serif;
         color:#1a1a1a; background:#fff; }
  main { max-width:640px; margin:0 auto; padding:72px 32px; }
  h1 { font-size:30px; line-height:1.25; margin:0 0 24px; }
  p { margin:0 0 20px; }
  mark { background:none; color:inherit; }
</style></head><body><main>
  <h1>On the reading of difficult books</h1>
  <p>Every reader meets a word that stops them. The honest response is to look
     it up, but the cost of leaving the page is that you rarely come back to
     the sentence with the same attention you left it with.</p>
  <p>What one wants is a definition that arrives without ceremony: a small
     window, close to the word, gone the moment it is no longer needed. A
     little <mark id="w0">serendipity</mark> in the margins of a page, if you
     like, rather than an errand across the internet.</p>
  <p>The pleasure of such a tool is that it is <mark id="w1">ephemeral</mark>.
     It does its work and then it gets out of the way, which is more than can
     be said for most software.</p>
  <p>None of this is new. Marginalia, glossaries and interlinear notes are all
     older than print, and all of them answer the same complaint: that meaning
     ought to sit near the sentence that needed it, not three rooms away in a
     reference book.</p>
  <p>What is new is only the speed. A definition that arrives in the moment you
     falter is a different thing from one you go and fetch afterwards, because
     by then the sentence has cooled and you are reading it as a stranger.</p>
</main></body></html>`;

function browserPath() {
  for (const key of ["EDGE_PATH", "CHROME_PATH"]) {
    if (process.env[key]) return { executablePath: process.env[key] };
  }
  return { channel: "msedge" };
}

async function launch() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "dsd-shots-"));
  const args = [
    `--disable-extensions-except=${ROOT}`,
    `--load-extension=${ROOT}`,
    `--window-size=${SIZE.width},${SIZE.height}`,
  ];
  const attempts = [
    browserPath(),
    { channel: "chrome" },
    { channel: "chromium" },
  ];
  let lastError;
  for (const how of attempts) {
    try {
      const ctx = await chromium.launchPersistentContext(profile, {
        ...how,
        headless: false,
        viewport: SIZE,
        args,
      });
      return { ctx, profile };
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(
    `Could not start a Chromium-based browser. Set EDGE_PATH or CHROME_PATH.\n${lastError}`,
  );
}

/**
 * Serve the sample page over http. The extension's content script only matches
 * http and https, so setContent (which leaves the page on about:blank) would
 * give a page the extension never touches.
 */
function serveSamplePage() {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(PAGE);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () =>
      resolve({ server, url: `http://127.0.0.1:${server.address().port}/` }),
    );
  });
}

const { server, url } = await serveSamplePage();
const { ctx, profile } = await launch();
fs.mkdirSync(OUT, { recursive: true });

try {
  const page = await ctx.newPage();
  await page.setViewportSize(SIZE);
  await page.goto(url);
  // Give the content script time to pick up its settings and popup assets.
  await page.waitForTimeout(1500);

  // Wait for real definitions rather than the "Please wait…" placeholder.
  const waitForDefinitions = (count) =>
    page
      .waitForFunction(
        (n) =>
          [...document.querySelectorAll("[data-define-select-popup]")].filter(
            (host) => host.shadowRoot?.querySelector(".definitions li"),
          ).length >= n,
        count,
        { timeout: 15000 },
      )
      .catch(() => {
        throw new Error(
          `Expected ${count} popup(s) with definitions for "${WORD}". Check that the dictionary API is reachable.`,
        );
      });

  await page.dblclick("#w0");
  await waitForDefinitions(1);
  await page.screenshot({ path: path.join(OUT, "01-definition.png") });
  console.log("wrote store/screenshots/01-definition.png");

  // A nested lookup: double-click a word inside the popup to define that too.
  const target = await page.evaluate(() => {
    const root = document.querySelector(
      "[data-define-select-popup]",
    ).shadowRoot;
    const walker = document.createTreeWalker(
      root.querySelector(".definitions li"),
      NodeFilter.SHOW_TEXT,
    );
    let node;
    while ((node = walker.nextNode())) {
      const match = /\b[A-Za-z]{7,}\b/.exec(node.textContent);
      if (!match) continue;
      const range = document.createRange();
      range.setStart(node, match.index);
      range.setEnd(node, match.index + match[0].length);
      const rect = range.getBoundingClientRect();
      if (rect.width) {
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      }
    }
    return null;
  });

  if (target) {
    await page.mouse.dblclick(target.x, target.y);
    await waitForDefinitions(2);
    await page.screenshot({ path: path.join(OUT, "02-nested-lookup.png") });
    console.log("wrote store/screenshots/02-nested-lookup.png");
  } else {
    console.warn("skipped the nested-lookup shot: no long word in the popup");
  }

  // The options page, shown at the same size for a consistent listing.
  const worker =
    ctx.serviceWorkers()[0] ??
    (await ctx.waitForEvent("serviceworker", { timeout: 15000 }));
  const options = await ctx.newPage();
  await options.setViewportSize(SIZE);
  await options.goto(
    `${worker.url().split("/").slice(0, 3).join("/")}/options/options.html`,
  );
  await options.waitForSelector("#num-words-in-history");
  await options.screenshot({ path: path.join(OUT, "03-options.png") });
  console.log("wrote store/screenshots/03-options.png");
} finally {
  await ctx.close();
  server.close();
  fs.rmSync(profile, { recursive: true, force: true });
}
