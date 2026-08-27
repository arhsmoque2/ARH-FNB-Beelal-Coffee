# ARH-FNB-Beelal-Coffee — Debugging & Fixes Index

A consolidated reference catalog of bugs, root causes, conflict resolutions, and CI/CD fixes in `ARH-FNB-Beelal-Coffee`, indexed by Pull Request and commit for fast retrieval.

---

## Quick Navigation Index

- [Post-Merge Main: Cloudflare Deploy & Quality Gate CI Fix (`8d4a1e4`)](#post-merge-main-cloudflare-deploy--quality-gate-ci-fix-8d4a1e4)
- [PR #7: Pre-Merge Quality Gate & Playwright Layout Auditor](#pr-7-featci-add-pre-merge-quality-gate-and-on-demand-playwright-layout-auditor)
  - [Incident 1: Merge Conflict with `main` (`index-v2.html`)](#pr-7--incident-1-merge-conflict-with-main-index-v2html)
  - [Incident 2: CI Failure — Missing `playwright` in `node_modules`](#pr-7--incident-2-ci-failure--missing-playwright-in-node_modules)
- [PR #8 / PR #9: Mobile Header Overlap, Broken Keyframes & Dead Billing Proxy](#pr-8--pr-9-mobile-header-overlap-broken-keyframes--dead-billing-proxy)
  - [Fix 1: Mobile Header Collisions on <= 430px Viewports](#fix-1-mobile-header-collisions-on--430px-viewports)
  - [Fix 2: Malformed `@keyframes pulse-dot` Swallowing CSS](#fix-2-malformed-keyframes-pulse-dot-swallowing-css)
  - [Fix 3: Dead Billing Proxy Requiring Private Client Secret](#fix-3-dead-billing-proxy-requiring-private-client-secret)
  - [Fix 4: Upsert Stamping `reconciled_at` on Duplicate Posts](#fix-4-upsert-stamping-reconciled_at-on-duplicate-posts)
- [PR #6: Takeaway UI Leftovers, Off-Brand Colors & CSS Gate 6](#pr-6-takeaway-ui-leftovers-off-brand-colors--css-gate-6)
- [PR #4: QR Payment Flow Integration & Fallback State](#pr-4-qr-payment-flow-integration--fallback-state)
- [PR #2: Storefront Consolidation & Legacy File Cleanup](#pr-2-storefront-consolidation--legacy-file-cleanup)
- [PR #1: Devtool Readiness & Quality Gate Harness Fix](#pr-1-devtool-readiness--quality-gate-harness-fix)

---

## Post-Merge Main: Cloudflare Deploy & Quality Gate CI Fix (`8d4a1e4`)

### Issue / Symptom

After PR #7 was merged into `main`, the post-merge push workflow **Quality Gate & Cloudflare Deploy** ([Run #33090385546](https://github.com/arhsmoque2/ARH-FNB-Beelal-Coffee/actions/runs/33090385546)) failed at step `Run Full Quality Gate Suite (Oxlint, UI/UX, Infra Doctor)`:

```text
> npm run check
> npm run lint && npm run check:ui && npm run check:layout && npm run check:infra

Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'playwright' imported from
/home/runner/work/ARH-FNB-Beelal-Coffee/ARH-FNB-Beelal-Coffee/_qa/beelal-layout-audit.mjs
```

### Root Cause

1. PR #7 expanded the canonical `npm run check` script in `package.json` to include `check:layout`:

   ```json
   "check": "npm run lint && npm run check:ui && npm run check:layout && npm run check:infra"
   ```

2. While `.github/workflows/ci.yml` had been patched with `npm ci` and Playwright browser installation, `.github/workflows/deploy.yml` on `main` was left unchanged. It directly ran `npm run check` without:
   - Running `npm ci` to install `devDependencies` (including `playwright`).
   - Installing Playwright Chromium browser binaries via `npx playwright install --with-deps chromium`.
   - Running an ephemeral local server to audit the local checkout before pushing live to Cloudflare Workers.

### Fix

Updated [.github/workflows/deploy.yml](.github/workflows/deploy.yml) in commit [`8d4a1e4`](https://github.com/arhsmoque2/ARH-FNB-Beelal-Coffee/commit/8d4a1e44293b20d1aca5bba8252c6b9b895a23a9):

```yaml
- name: Setup Node.js
  uses: actions/setup-node@v4
  with:
    node-version: 22
    cache: "npm"

- name: Install dependencies
  run: npm ci

- name: Install Playwright Chromium (for layout auditor)
  run: npx playwright install --with-deps chromium

- name: Serve checkout locally for pre-deploy check
  run: |
    python3 -m http.server 8080 --directory . &
    echo $! > /tmp/static-server.pid
    npx -y wait-on http://localhost:8080/index-v2.html

- name: Run Full Quality Gate Suite (Oxlint, UI/UX, Layout Auditor, Infra Doctor)
  env:
    TARGET_URL: http://localhost:8080/index-v2.html
  run: npm run check

- name: Stop local static server
  if: always()
  run: kill "$(cat /tmp/static-server.pid)" 2>/dev/null || true
```

### Verification

- GitHub Actions [Run #33090623419](https://github.com/arhsmoque2/ARH-FNB-Beelal-Coffee/actions/runs/33090623419) on `main`: **Passed (`✓`)** in 1m 27s.
- Cloudflare Worker deployment succeeded via Wrangler, followed by green post-deploy live health checks (`check:live`).

---

## PR #7: feat(ci): add pre-merge quality gate and on-demand Playwright layout auditor

- **PR URL**: [arhsmoque2/ARH-FNB-Beelal-Coffee#7](https://github.com/arhsmoque2/ARH-FNB-Beelal-Coffee/pull/7)
- **Branch**: `feat/pre-merge-ci-and-playwright-layout-auditor`

### PR #7 / Incident 1: Merge Conflict with `main` (`index-v2.html`)

#### Issue / Symptom

When merging `origin/main` into PR #7, git threw a conflict on `index-v2.html`:

```text
Auto-merging index-v2.html
CONFLICT (content): Merge conflict in index-v2.html
Auto-merging package.json
Automatic merge failed; fix conflicts and then commit the result.
```

#### Root Cause

Two parallel streams had edited surrounding lines:

- **`main`** (via PR #6, commit `61cb826`): Removed generic template colors from the announcement ribbon, replaced indigo hex values with `var(--brand)` / `var(--brand2)` / `var(--paper)` for Gate 6 compliance, and tuned `@keyframes pulse-dot` (`50% { opacity: .55; transform: scale(1.35); }`).
- **PR #7 / PR #8**: Added the critical `@media (max-width: 430px)` rule to prevent mobile header items from overlapping, but retained the legacy comment `/* ── MODERN UI ENHANCEMENTS (FWDTools Patterns) ── */` and pulse-dot keyframes.

#### Resolution

In [index-v2.html](index-v2.html):

1. **Header Query**: Preserved the mobile `@media (max-width: 430px)` block:

   ```css
   @media (max-width: 430px) {
     .top-actions #statusChip {
       display: none;
     }
     .brand-sub {
       display: none;
     }
     .brand-title {
       max-width: calc(100vw - 262px);
     }
     .ambience-toggle {
       min-width: 60px;
       padding: 0 8px;
     }
     .lang-toggle {
       min-width: 48px !important;
       font-size: 11px;
     }
     .cart-top {
       min-width: 82px;
       font-size: 13px;
     }
   }
   /* ── MODERN UI ENHANCEMENTS ── */
   ```

2. **Animation Keyframe**: Adopted `main`'s Gate-6 compliant pulse-dot animation:

   ```css
   @keyframes pulse-dot {
     0%,
     100% {
       opacity: 1;
       transform: scale(1);
     }
     50% {
       opacity: 0.55;
       transform: scale(1.35);
     }
   }
   ```

3. Auto-merged `package.json` to preserve both the `"prepare"` git hook script and `"check"` layout script.

---

### PR #7 / Incident 2: CI Failure — Missing `playwright` in `node_modules`

#### Issue / Symptom

GitHub Actions [Run #33088506316](https://github.com/arhsmoque2/ARH-FNB-Beelal-Coffee/actions/runs/33088506316) failed:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'playwright' imported from
/home/runner/work/ARH-FNB-Beelal-Coffee/ARH-FNB-Beelal-Coffee/_qa/beelal-layout-audit.mjs
```

#### Root Cause

`.github/workflows/ci.yml` ran:

```yaml
run: npx -y playwright install --with-deps chromium
```

`npx playwright install` downloads the Chromium browser engine into `~/.cache/ms-playwright`, but does not run `npm install` in the workspace. Because `npm ci` was absent, `node_modules/playwright` did not exist when Node executed `_qa/beelal-layout-audit.mjs`.

#### Fix

Added `npm ci` with caching in [.github/workflows/ci.yml](.github/workflows/ci.yml) and [.github/workflows/playwright-ondemand.yml](.github/workflows/playwright-ondemand.yml) (commit `878ffa7`):

```yaml
- name: Setup Node.js
  uses: actions/setup-node@v4
  with:
    node-version: 22
    cache: "npm"

- name: Install dependencies
  run: npm ci

- name: Install Playwright Chromium (for layout auditor)
  run: npx playwright install --with-deps chromium
```

#### Verification

- GitHub Actions [Run #33088739585](https://github.com/arhsmoque2/ARH-FNB-Beelal-Coffee/actions/runs/33088739585): **Passed (`✓`)** in 58s.
- Result: 0 errors across Oxlint, UI/UX Gate, Playwright Layout Auditor, and Infra Doctor.

---

## PR #8 & PR #9: Mobile Header Overlap, Broken Keyframes & Dead Billing Proxy

- **PR #8 URL**: [arhsmoque2/ARH-FNB-Beelal-Coffee#8](https://github.com/arhsmoque2/ARH-FNB-Beelal-Coffee/pull/8)
- **PR #9 URL**: [arhsmoque2/ARH-FNB-Beelal-Coffee#9](https://github.com/arhsmoque2/ARH-FNB-Beelal-Coffee/pull/9)

### Fix 1: Mobile Header Collisions on <= 430px Viewports

- **Symptom**: On mobile devices (<= 430px viewport width, e.g. iPhone 14/15, Pixel), the top navigation elements (`brand-title`, `statusChip`, `ambience-toggle`, `lang-toggle`, `cart-top`) wrapped and collided.
- **Root Cause**: An earlier commit (`02f3df5`) deleted the `@media (max-width: 430px)` header rule while inserting the announcement ribbon.
- **Fix**: Reintroduced defensive styles in `index-v2.html`:
  - Hide `.top-actions #statusChip` and `.brand-sub` on <= 430px.
  - Constrain `.brand-title` to `max-width: calc(100vw - 262px)`.
  - Tightly size `.ambience-toggle` (60px), `.lang-toggle` (48px), and `.cart-top` (82px).

### Fix 2: Malformed `@keyframes pulse-dot` Swallowing CSS

- **Symptom**: CSS rules following `@keyframes pulse-dot` (specifically `.redline-badge`) were silently discarded by the browser.
- **Root Cause**: CSS block missing the closing brace for `@keyframes pulse-dot`. CSS parsers recover from unbalanced braces by swallowing until the next block, terminating rules prematurely.
- **Fix**: Restructured keyframe with balanced braces and valid percentage steps.

### Fix 3: Dead Billing Proxy Requiring Private Client Secret

- **Symptom**: Frontend orders never recorded to the billing ledger D1 database.
- **Root Cause**: `recordBillingEvent()` in `index-v2.html` checked `if (!billing || !billing.workerUrl || !billing.secret) return;`. However, `config.js` does not expose `billing.secret` to the browser for security.
- **Fix**: Routed `recordBillingEvent()` through the same-origin `/api/record-order` Worker proxy, which injects `BILLING_SECRET` server-side:

  ```javascript
  fetch("/api/record-order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true
  }).catch(() => {});
  ```

### Fix 4: Upsert Stamping `reconciled_at` on Duplicate Posts

- **Symptom**: Repeated order submissions caused `reconciled_at` to be prematurely timestamped.
- **Root Cause**: SQL query had `ON CONFLICT(store_id, order_id) DO UPDATE SET reconciled_at = excluded.submitted_at`.
- **Fix**: In [billing-ledger/src/index.js](billing-ledger/src/index.js), restricted `reconciled_at` updates strictly to reconciliation runs:

  ```sql
  ON CONFLICT(store_id, order_id) DO UPDATE SET
    reconciled_at = CASE
      WHEN excluded.source = 'reconciliation_backfill' THEN excluded.submitted_at
      ELSE order_events.reconciled_at
    END
  ```

---

## PR #6: Takeaway UI Leftovers, Off-Brand Colors & CSS Gate 6

- **PR URL**: [arhsmoque2/ARH-FNB-Beelal-Coffee#6](https://github.com/arhsmoque2/ARH-FNB-Beelal-Coffee/pull/6)

### Issues & Root Causes

1. **Dine-In Copy in Takeaway Flow**: Cart notes and inputs had leftover placeholders asking for "table number" when Beelal operates purely as a takeaway/pickup counter.
2. **Off-Brand Colors**: Banner and buttons used template Tailwind indigo/violet (`#1e1b4b`, `#312e81`, `#4338ca`) that clashed with Beelal's warm amber/coffee palette.
3. **Dead Features**: "Quick stats" (categories count, items count) and leftover homestay booking calendar cards in `admin.html`.

### Fixes

- Replaced hardcoded indigo colors with `var(--brand)`, `var(--brand2)`, and `var(--paper)`.
- Purged dead admin cards and quick stats cards.
- **Engineered Gate 6 (CSS Integrity & Brand Palette Consistency)** in [_qa/beelal-ui-ux-quality-gate.mjs](_qa/beelal-ui-ux-quality-gate.mjs):
  - Enforces brace balance inside all `<style>` blocks.
  - Detects un-themed boilerplate hex colors (`OFFBRAND_HEX`) unless exempt under developer overlay scopes.

---

## PR #4: QR Payment Flow Integration & Fallback State

- **PR URL**: [arhsmoque2/ARH-FNB-Beelal-Coffee#4](https://github.com/arhsmoque2/ARH-FNB-Beelal-Coffee/pull/4)

### Issues & Root Causes

1. **Payment Options**: Customer orders could only be completed via WhatsApp with manual offline coordination.
2. **Missing In-App Verification**: Baristas lacked an admin view to mark incoming QR orders as confirmed or rejected.

### Fixes

- Added customer-side payment method picker: **Pay Cash** (standard WhatsApp) vs **QR Pay** (DuitNow QR sheet).
- Submitting QR Pay creates an order record in Firebase with status `awaiting_confirmation`.
- In [admin.html](admin.html), added an Orders view with confirmation/rejection action buttons and color-coded status pills.

---

## PR #2: Storefront Consolidation & Legacy File Cleanup

- **PR URL**: [arhsmoque2/ARH-FNB-Beelal-Coffee#2](https://github.com/arhsmoque2/ARH-FNB-Beelal-Coffee/pull/2)

### Issues & Root Causes

- Existence of two concurrent storefront files: `index-legacy.html` and `index-v2.html`. Quality gates were failing or evaluating obsolete files.

### Fixes

- Removed `index-legacy.html` entirely (-2,303 lines).
- Pinned `index-v2.html` as the authoritative customer-facing storefront across all quality gates and workers.

---

## PR #1: Devtool Readiness & Quality Gate Harness Fix

- **PR URL**: [arhsmoque2/ARH-FNB-Beelal-Coffee#1](https://github.com/arhsmoque2/ARH-FNB-Beelal-Coffee/pull/1)

### Issues & Root Causes

1. **Broken Quality Gate Paths**: `_qa/beelal-ui-ux-quality-gate.mjs` pointed to non-existent `v2/index.html`, causing tests to silently skip.
2. **Gate-Gaming / Dead Script Tags**: Hidden `<script style="display:none">` in `index.html` designed to pass assertions without functional code.
3. **Mismatched `<script>` Tags**: Gate 1 caught mismatched script tags between open and close tokens.

### Fixes

- Fixed file path references in `TARGET_HTML_FILES`.
- Cleaned up obsolete comments and dummy scripts.
- Aligned documentation (`README.md`, `AGENTS.md`) to the standalone repository structure.
