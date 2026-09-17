/** @type {import('knip').KnipConfig} */
export default {
  entry: [
    "config.js",
    "worker.js",
    "sw.js",
    "migrate-photos.js",
    "billing-ledger/src/index.js",
    "src/pure/**/*.js",
    "_qa/**/*.mjs",
    "scripts/**/*.{js,mjs}"
  ],
  project: ["**/*.{js,mjs,cjs}"],
  ignoreDependencies: ["@commitlint/cli", "lint-staged"]
};
