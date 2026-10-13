/**
 * Build one package per browser family into dist/ and zip each.
 *
 * manifest.json holds the keys of both: Chrome and Edge run the background as a
 * service worker and offer the offscreen API, Firefox runs it from
 * background.scripts and has its own settings key. Each package gets only the
 * keys its browser understands, because Firefox's store linter rejects the
 * Chrome ones and Chrome warns about the Firefox ones.
 *
 *   npm run build
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DIST = path.join(ROOT, "dist");
const SHARED = [
  "background",
  "content",
  "icons",
  "options",
  "shared",
  "LICENSE",
];

const TARGETS = {
  chromium: {
    extra: ["offscreen"],
    edit: (m) => {
      delete m.browser_specific_settings;
      delete m.background.scripts;
    },
  },
  firefox: {
    extra: [],
    edit: (m) => {
      delete m.minimum_chrome_version;
      delete m.background.service_worker;
      m.permissions = m.permissions.filter((p) => p !== "offscreen");
    },
  },
};

const base = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json")));
fs.rmSync(DIST, { recursive: true, force: true });

for (const [name, { extra, edit }] of Object.entries(TARGETS)) {
  const out = path.join(DIST, name);
  for (const entry of [...SHARED, ...extra]) {
    fs.cpSync(path.join(ROOT, entry), path.join(out, entry), {
      recursive: true,
    });
  }
  const manifest = structuredClone(base);
  edit(manifest);
  fs.writeFileSync(
    path.join(out, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );

  execFileSync(
    "npx",
    [
      "web-ext",
      "build",
      "--no-config-discovery",
      `--source-dir=${out}`,
      `--artifacts-dir=${DIST}`,
      `--filename=define-select-dictionary-${base.version}-${name}.zip`,
    ],
    { cwd: ROOT, stdio: "inherit" },
  );
}
