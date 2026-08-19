export default {
  ignoreFiles: [
    "package.json",
    "package-lock.json",
    "README.md",
    "web-ext.config.mjs",
    "eslint.config.mjs",
    "PRIVACY.md",
    "PUBLISHING.md",
    "scripts",
    "store",
  ],
  run: {
    // Chrome and Edge are both Chromium; web-ext launches whichever it finds,
    // or the one named by the CHROME_PATH environment variable.
    target: ["chromium"],
  },
};
