/** @type {import('knip').KnipConfig} */
export default {
  entry: [
    "config.js",
    "worker.js",
    "migrate-photos.js",
    "billing-ledger/src/index.js",
    "_qa/**/*.mjs",
    "scripts/**/*.js"
  ],
  project: ["**/*.{js,mjs,cjs}"],
  ignore: ["coverage/**"],
  ignoreDependencies: ["@commitlint/cli", "lint-staged"]
};
