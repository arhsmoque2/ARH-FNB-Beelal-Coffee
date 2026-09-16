# Acceptance Test Plan — ARH F&B Beelal Coffee

## 1. Scope & Acceptance Criteria Mapping

| Acceptance Criterion                                                            | Test Level       | Target File                   | Verification Method                                       |
| ------------------------------------------------------------------------------- | ---------------- | ----------------------------- | --------------------------------------------------------- |
| Order total calculation accurately applies item price, add-ons, and promo codes | **Unit**         | `worker.js`                   | Vitest spec testing pricing formulas against test vectors |
| D1 SQL order insertion records valid JSON metadata and timestamp                | **Integration**  | `worker.js`                   | Miniflare D1 SQLite mock                                  |
| Admin authentication header enforces valid Sanctum/Bearer token                 | **Integration**  | `worker.js`                   | HTTP request mock (200 OK vs 401/403)                     |
| Store billing ledger transactions balance credit/debit totals                   | **Unit**         | `billing-ledger/src/index.js` | Vitest spec testing ledger balance formulas               |
| Store settlement logic rejects unauthorized store_id queries                    | **Integration**  | `billing-ledger/src/index.js` | Tenant isolation test                                     |
| Customer checkout UI renders responsive layout across 375px / 768px / 1280px    | **E2E / Layout** | `index-v2.html`               | Playwright & `_qa/beelal-layout-audit.mjs`                |
| Zero unapproved hex codes or non-standard Tailwind classes                      | **Static Gate**  | All HTML/JS                   | `_qa/beelal-ui-ux-quality-gate.mjs`                       |
