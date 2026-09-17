# Handoff & Continuity Guide — Beelal Coffee F&B PWA

> **Authoritative Context Document for Incoming / Cold-Start Agents**  
> **Last Updated:** 2026-09-17  
> **Target Repository:** [`arhsmoque2/ARH-FNB-Beelal-Coffee`](file:///D:/ARH-GITHUB/arhsmoque2/ARH-FNB-Beelal-Coffee)  
> **Live Production Storefront:** [`https://store-beelal-fnb-pwa.arh-homelab.workers.dev`](https://store-beelal-fnb-pwa.arh-homelab.workers.dev)  
> **Governing Rules:** Read [`AGENTS.md`](file:///D:/ARH-GITHUB/arhsmoque2/ARH-FNB-Beelal-Coffee/AGENTS.md), [`ARCHITECTURE.md`](file:///D:/ARH-GITHUB/arhsmoque2/ARH-FNB-Beelal-Coffee/ARCHITECTURE.md), and [`journal.md`](file:///D:/ARH-GITHUB/arhsmoque2/ARH-FNB-Beelal-Coffee/journal.md) before making modifications.

---

## 1. Executive Summary & Cold-Start Quick Reference

This repository is a production-grade, progressive web app (PWA) and edge-backed storefront for **Beelal Coffee**, serving specialty Arabica roasts and cafe food with 1-tap WhatsApp checkout and instant QR payment verification.

### Core Stack

- **Edge Compute & Routing:** Cloudflare Workers ([`worker.js`](file:///D:/ARH-GITHUB/arhsmoque2/ARH-FNB-Beelal-Coffee/worker.js)) with R2 object storage binding (`MEDIA_BUCKET` -> `arh-fnb-beelal-media`).
- **Realtime Database:** Firebase Realtime Database (`ash-2026-photobook-default-rtdb.asia-southeast1.firebasedatabase.app`, root: `beelal_coffee`).
- **Storefront Client:** Standalone, hyper-optimized HTML5/CSS3/Vanilla JS PWA ([`index-v2.html`](file:///D:/ARH-GITHUB/arhsmoque2/ARH-FNB-Beelal-Coffee/index-v2.html)) with Web App Manifest ([`manifest.webmanifest`](file:///D:/ARH-GITHUB/arhsmoque2/ARH-FNB-Beelal-Coffee/manifest.webmanifest)) and Service Worker ([`sw.js`](file:///D:/ARH-GITHUB/arhsmoque2/ARH-FNB-Beelal-Coffee/sw.js)).
- **Admin Studio:** Full management console ([`admin.html`](file:///D:/ARH-GITHUB/arhsmoque2/ARH-FNB-Beelal-Coffee/admin.html)) for menu items, pricing, visual themes, AI palette studio, and barista order fulfillment.
- **Billing Ledger:** Cloudflare Workers + D1 database microservice ([`billing-ledger/`](file:///D:/ARH-GITHUB/arhsmoque2/ARH-FNB-Beelal-Coffee/billing-ledger)) for immutable transaction accounting.

### Cold-Start Command Checklist

Run these commands from the repository root:

```bash
# 1. Verify environment health & bindings
node _qa/infra-doctor.mjs

# 2. Run unit & regression test suite (166 tests across 4 files)
npm run test:unit

# 3. Run full quality gate (lint, cspell, markdownlint, knip, prettier, UI gates, layout audit, infra doctor, unit tests)
npm run check
```

> [!IMPORTANT]
> **Zero Tolerance for Regressions:** `npm run check` executes 9 automated verification gates. Every pull request must have all 9 gates 100% green before merging into `main`.

---

## 2. Completed Milestones (Options A & B)

In the current development cycle (PR `feat/admin-auth-and-order-fulfillment`), two critical Phase 1 initiatives were fully implemented, tested, and verified:

### Option A: Server-Side Admin Authentication & Token Security

- **HMAC-SHA256 Session Tokens:** Implemented cryptographic signing in [`worker.js`](file:///D:/ARH-GITHUB/arhsmoque2/ARH-FNB-Beelal-Coffee/worker.js) via `crypto.subtle`. Valid tokens are issued upon entering dev/owner PINs via `POST /api/admin/verify-pin` and expire after 24 hours.
- **Protected Endpoints:**
  - `GET /api/admin/orders` — Requires Bearer token in `Authorization` header or `x-admin-token`. Rejects unauthorized calls with HTTP 401.
  - `POST /api/admin/order/update-status` — Requires valid admin token; logs the updating role (`dev` or `owner`) in order audit metadata.
  - `POST /api/chat` — Secured behind admin token verification. Prevents unauthorized third parties from exhausting the OpenRouter AI quota.
- **Admin Client Integration:** [`admin.html`](file:///D:/ARH-GITHUB/arhsmoque2/ARH-FNB-Beelal-Coffee/admin.html) now persists `admin_token` in `sessionStorage` and attaches `Authorization: Bearer ${adminToken}` to all administrative API requests, including OpenRouter chat calls and receipt OCR vision queries.

### Option B: Full Order Fulfillment Lifecycle & Live Status Bar

- **Expanded Order Lifecycle:** Transitioned from binary payment tracking to a dual-dimension status model:
  1. `payment_status`: `cash_pending` | `awaiting_confirmation` | `confirmed` | `rejected`
  2. `fulfillment_status`: `placed` | `preparing` (brewing) | `ready` (pickup) | `completed` | `cancelled`
- **Auto-Advancement Logic:** When an admin confirms a payment via `POST /api/admin/order/update-status`, `worker.js` automatically advances `fulfillment_status` to `"preparing"` and records `preparing_at: Date.now()` unless explicitly specified otherwise.
- **Lifecycle Timestamps:** `worker.js` logs `preparing_at`, `ready_at`, `completed_at`, and `cancelled_at` timestamps directly in Firebase RTDB for SLA analysis.
- **Admin Barista Stepper:** [`admin.html`](file:///D:/ARH-GITHUB/arhsmoque2/ARH-FNB-Beelal-Coffee/admin.html) Orders tab displays dual badges (`PAYMENT_STATUS_BADGE` and `FULFILLMENT_STATUS_BADGE`) and contextual action buttons:
  - `☕ Start Brewing` (moves `placed` -> `preparing`)
  - `🔔 Mark Ready` (moves `preparing` -> `ready`)
  - `✅ Complete Order` (moves `ready` -> `completed`)
  - `Cancel` (cancels an active order)
- **Storefront Live Progress Stepper:** [`index-v2.html`](file:///D:/ARH-GITHUB/arhsmoque2/ARH-FNB-Beelal-Coffee/index-v2.html) now features a live 4-step animated progress tracker (`#orderFulfillmentTracker`):
  - **Step 1 (Placed 📝):** Initial order submission (0% progress).
  - **Step 2 (Brewing ☕):** Payment confirmed, barista handcrafting drinks (33% progress).
  - **Step 3 (Ready 🔔):** Order packed and waiting at counter (66% progress).
  - **Step 4 (Picked Up ✅):** Completed order (100% progress). Polling automatically ceases upon completion.

### Option D: Billing Ledger Automation & Transaction Rollups

- **Scheduled Aggregate Cron:** Implemented `scheduled(controller, env, ctx)` in [`billing-ledger/src/index.js`](file:///D:/ARH-GITHUB/arhsmoque2/ARH-FNB-Beelal-Coffee/billing-ledger/src/index.js) running daily midnight cron triggers configured in [`billing-ledger/wrangler.jsonc`](file:///D:/ARH-GITHUB/arhsmoque2/ARH-FNB-Beelal-Coffee/billing-ledger/wrangler.jsonc).
- **D1 Daily Rollups Table:** Added `billing_daily_rollups` table (`rollup_date`, `store_slug`, `gross_revenue_cents`, `order_count`, `fee_cents`, `currency`, `created_at`) with index `idx_rollups_store_date` in [`billing-ledger/schema.sql`](file:///D:/ARH-GITHUB/arhsmoque2/ARH-FNB-Beelal-Coffee/billing-ledger/schema.sql).
- **Summary Edge Endpoint:** Implemented `GET /summary/:store_slug` computing live daily totals, 7-day rolling volume, monthly billable usage, and formatted recent rollups.
- **Admin Worker Proxy:** Added protected endpoint `GET /api/billing/summary` in [`worker.js`](file:///D:/ARH-GITHUB/arhsmoque2/ARH-FNB-Beelal-Coffee/worker.js) requiring admin Bearer token verification before proxying to D1 billing ledger.
- **Admin Settlement Dashboard Panel:** Added "Penyelesaian & Bil" tab in [`admin.html`](file:///D:/ARH-GITHUB/arhsmoque2/ARH-FNB-Beelal-Coffee/admin.html) rendering live GMV cards and transaction rollups table without exposing customer PII.
- **Automated Verification:** Added 9 unit tests in [`tests/billing-ledger.test.js`](file:///D:/ARH-GITHUB/arhsmoque2/ARH-FNB-Beelal-Coffee/tests/billing-ledger.test.js) and 4 tests in [`tests/worker.test.js`](file:///D:/ARH-GITHUB/arhsmoque2/ARH-FNB-Beelal-Coffee/tests/worker.test.js) (bringing total test suite to 166 green tests).

### Visual Brand Integrity, Blue Theme Flash Elimination & Animated Coffee Loader

- **Root Cause Identified:** `:root` variables in [`index-v2.html`](file:///D:/ARH-GITHUB/arhsmoque2/ARH-FNB-Beelal-Coffee/index-v2.html) and `defaultTheme` in [`config.js`](file:///D:/ARH-GITHUB/arhsmoque2/ARH-FNB-Beelal-Coffee/config.js) contained generic Tailwind indigo/violet defaults (`#4f46e5`, `#ec4899`, `rgba(99, 102, 241, 0.08)`). Prior to Firebase network resolution, visitors experienced a flash of blue layout.
- **Canonical Palette Alignment:** Aligned `:root` CSS custom properties and `defaultTheme` with Beelal Coffee's warm espresso and amber identity (`--brand: #2c1a0e`, `--brand2: #c8962a`, `--bg: #fef7ee`).
- **Zero-Flash Local Theme Cache:** Injected an immediate synchronous `<script>` in `<head>` restoring cached theme properties from `localStorage` before the first DOM paint.
- **Playwright Gate Enforced:** Added CHECK 0 in [`_qa/beelal-layout-audit.mjs`](file:///D:/ARH-GITHUB/arhsmoque2/ARH-FNB-Beelal-Coffee/_qa/beelal-layout-audit.mjs) verifying that computed `--brand`, `--brand2`, and `--bg` never contain off-brand indigo or blue hues across Mobile, Tablet, and Desktop matrices.
- **Animated Coffee Icon Loading Screen:** Added an on-brand loading screen (`#loader`) in [`index-v2.html`](file:///D:/ARH-GITHUB/arhsmoque2/ARH-FNB-Beelal-Coffee/index-v2.html) displaying the official Beelal Coffee monogram logo surrounded by a spinning dual-ring motion, gentle breathing pulse, animated brew subtitle, and smooth transition on initialization.

### PWA Install Prompt Non-Collision & Translucent Glassmorphism

- **Root Cause of Element Overlap:** When `beforeinstallprompt` fired, both the topbar install button (`#pwaInstallBtn`) and the floating bottom banner (`#pwaInstallBanner`) became active simultaneously. On screens <= 430px, the header button took up 86px, squeezing `.brand-title` ("Beelal Coffee") into collision. Furthermore, the bottom banner title (`Install Beelal Coffee App`) was 24 characters wide, wrapping and colliding with `#pwaBannerInstallBtn` on 360px mobile viewports.
- **Translucent Glassmorphic Styling:** Converted the opaque 100% solid background of `#pwaInstallBanner` and `#floatingCart` into refined, translucent frosted glass using `color-mix(in srgb, var(--paper) 86%, transparent)` and `backdrop-filter: blur(16px);` with night mode dark glass support.
- **Zero-Collision Responsive Rules:**
  - On viewports `<= 640px`: Topbar `#pwaInstallBtn` is cleanly suppressed (`display: none !important;`) because mobile visitors already have the thumb-friendly floating `#pwaInstallBanner`.
  - On viewports `> 640px`: Topbar button renders with ample room while `.brand` and `.brand-title` flex safely with `min-width: 0; text-overflow: ellipsis; white-space: nowrap; max-width: 100%;`.
  - Simplified `#pwaInstallBanner` title to concise `"Beelal Coffee"` with `flex: 1 1 auto; min-width: 0; text-overflow: ellipsis; white-space: nowrap;` eliminating horizontal squeeze against the action button.

### Capability Rehearsal vs Clean Code Architecture (`npm run rehearse`)

- **The Distinction:** Clean code (linters, formatters, typechecks, Vitest mock tests) verifies that code syntax is valid and mock functions return expected shapes in Node.js. It does not prove that components render without overlap or that real state transitions succeed at runtime.
- **Automated Lifecycle Rehearsal Runner:** Built [`_qa/beelal-lifecycle-rehearsal.mjs`](file:///D:/ARH-GITHUB/arhsmoque2/ARH-FNB-Beelal-Coffee/_qa/beelal-lifecycle-rehearsal.mjs) (`npm run rehearse`) which executes 21 end-to-end rehearsal checks:
  1. **Act 1 (Playwright Geometry Rehearsal):** Simulates active install prompts across 5 viewports (360px, 390px, 412px, 768px, 1280px) and mathematically asserts `AABB_overlap === 0` between buttons and store titles, and validates `backdropFilter: blur(16px)` and translucent backgrounds in both light and night modes.
  2. **Act 2 (Live Fulfillment State Machine Rehearsal):** Places an actual test order (`POST /api/order`), verifies customer tracking (`GET /api/order/status/:id`), asserts security rejection without Bearer token (401), issues HMAC token (`POST /api/admin/verify-pin`), progresses fulfillment through `placed` -> `preparing` -> `ready` -> `completed`, asserts customer sync at each step, validates rejection of invalid states (400), and deletes the rehearsal order from RTDB for zero residual test noise.
  3. **Act 3 (Billing Ledger Rehearsal):** Validates D1 ledger tables (`order_events`, `billing_daily_rollups`) and daily calculation integrity.
  4. **Act 4 (Zero-FOUC Theme Rehearsal):** Validates pre-render theme script execution and coffee loader affordance.
- **Continuous Gate Integration:** Added Check 1.5 directly into [`_qa/beelal-layout-audit.mjs`](file:///D:/ARH-GITHUB/arhsmoque2/ARH-FNB-Beelal-Coffee/_qa/beelal-layout-audit.mjs) so `npm run check:layout` guards against layout collisions on every commit.

### Production Resilience: Billing Ledger RTDB Fallback, Dynamic AI Models Cascade & WebAuthn Platform Biometrics

- **Defensive Billing Ledger Fallback:**
  - Root cause: Upstream Cloudflare Worker `fnb-billing-ledger` returned HTTP 500 when cold or during deployment shifts, causing `handleAdminBillingSummary` to return HTTP 502 to admin and devcon.
  - Solution: Implemented `computeRtdbBillingSummary` in [`worker.js`](file:///D:/ARH-GITHUB/arhsmoque2/ARH-FNB-Beelal-Coffee/worker.js). When upstream D1 returns an error, it falls back to computing daily, weekly, and monthly settlement totals and 14-day daily rollups directly from Firebase RTDB (`orders.json`).
  - Added sub-worker deployment step in [`.github/workflows/deploy.yml`](file:///D:/ARH-GITHUB/arhsmoque2/ARH-FNB-Beelal-Coffee/.github/workflows/deploy.yml) for `billing-ledger/`.
- **OpenRouter Dynamic AI Model Selector & 429 Cascade:**
  - Root cause: Static fallback models caused HTTP 429 rate limit errors when free provider quotas were reached.
  - Solution: Replaced hardcoded fallback in `handleChatProxy` with dynamic sequential cascade supporting `model` and `fallback_models`. When a model returns 429, 503, or 404, requests automatically cascade to the next candidate model.
  - Added cached `GET /api/models` endpoint on the Edge Worker.
  - Built interactive model browser with tier filters, live search, primary model selector, and fallback cascade manager in [`devcon.html`](file:///D:/ARH-GITHUB/arhsmoque2/ARH-FNB-Beelal-Coffee/devcon.html), persisting to `config/dev/or_model` and `config/dev/or_fallback_models`.
- **WebAuthn Platform Biometric Authentication (`devcon.html` adopting `Cryptoistaken/BioAuth`):**
  - Standardized W3C platform authenticator credentials (`authenticatorAttachment: "platform"`, `userVerification: "required"`) for Touch ID, Windows Hello, and Face ID.
  - Console fast-unlock via biometric assertion with automatic fallback to 4-digit PIN.
  - Hardware session vaulting validating 24-hour token longevity.
  - Biometric key management (enrollment, prompt test, unenrollment) in [`devcon.html`](file:///D:/ARH-GITHUB/arhsmoque2/ARH-FNB-Beelal-Coffee/devcon.html).

---

## 3. Architecture & API Contract Reference

### API Boundary Summary

| Method | Path                             | Auth Required         | Description                                                                         |
| :----- | :------------------------------- | :-------------------- | :---------------------------------------------------------------------------------- |
| `POST` | `/api/admin/verify-pin`          | None (PIN in body)    | Validates 4-digit PIN; returns `{ ok: true, role, token, expires_at }`              |
| `GET`  | `/api/admin/orders`              | Bearer Token          | Fetches all active and historical orders from Firebase RTDB                         |
| `POST` | `/api/admin/order/update-status` | Bearer Token          | Updates `payment_status` and/or `fulfillment_status`; sets timestamps               |
| `POST` | `/api/order`                     | Public                | Submits a new customer order; sets `fulfillment_status: "placed"`                   |
| `GET`  | `/api/order/status/:id`          | Public                | Returns `{ ok: true, order_id, payment_status, fulfillment_status, timestamps... }` |
| `POST` | `/api/chat`                      | Bearer Token          | Proxies AI completions with automatic 429 fallback cascade                          |
| `GET`  | `/api/models`                    | Public / Cached       | Proxies live OpenRouter model catalog with edge caching                             |
| `POST` | `/api/upload/receipt`            | Public (Rate-limited) | Stores customer transfer receipts in R2 for 30-day verification                     |
| `POST` | `/api/record-order`              | Server-to-server      | Relays order transaction metadata to D1 billing ledger                              |
| `GET`  | `/api/billing/summary`           | Bearer Token          | Proxies settlement metrics with defensive RTDB calculation fallback                 |

### Firebase RTDB Schema: `/beelal_coffee/orders/{orderId}`

```json
{
  "name": "Ahmad",
  "items": [
    {
      "name": "Spanish Latte",
      "size": "12oz",
      "qty": 1,
      "price": 14.0,
      "unitPrice": 14.0,
      "addons": []
    }
  ],
  "total": 14.0,
  "payment_method": "qr",
  "payment_status": "confirmed",
  "payment_ref": "REF-9921",
  "payment_confirmed_at": 1718000020000,
  "payment_confirmed_by": "owner",
  "fulfillment_status": "preparing",
  "preparing_at": 1718000020000,
  "ready_at": null,
  "completed_at": null,
  "cancelled_at": null,
  "ts": 1718000000000
}
```

### Gate 6 Brand Integrity Rule

Gate 6 in [`_qa/beelal-ui-ux-quality-gate.mjs`](file:///D:/ARH-GITHUB/arhsmoque2/ARH-FNB-Beelal-Coffee/_qa/beelal-ui-ux-quality-gate.mjs) enforces strict brand color palette matching.  
**DO NOT USE** Tailwind default indigo/violet/pink swatches in stylesheet blocks:

- Forbidden hex regex: `/#(4f46e5|6366f1|818cf8|a5b4fc|c7d2fe|e0e7ff|312e81|1e1b4b|3730a3|4338ca|ec4899|f472b6|db2777|fbcfe8)\b/i`
- Always use CSS variables: `var(--brand)`, `var(--brand2)`, `var(--paper)`, `var(--ink)`, `var(--muted)`, `var(--line)`.

---

## 4. Remaining Roadmap: Option C (Next Takeover Point)

Incoming agents should proceed with the following priority:

### 🎯 Option C: Multi-Tenant Architecture & Store Registry Isolation

#### Context & Objectives

While this repository is the dedicated standalone instance for Beelal Coffee, the codebase contains foundations for multi-tenant registry resolution (`window.__registryReady` in [`admin.html`](file:///D:/ARH-GITHUB/arhsmoque2/ARH-FNB-Beelal-Coffee/admin.html)). The goal of Option C is complete multi-tenant store isolation:

1. **Dynamic Database Namespace Routing:**
   - Allow Worker routes (`/api/order`, `/api/admin/*`, `/api/order/status/*`) to resolve tenant namespace dynamically from custom hostnames or path prefixes (e.g. `X-Store-Slug` header or `/store/:slug/`).
   - Default to `beelal_coffee` if no store slug is passed (100% backward compatible).
2. **Registry Protection:**
   - Isolate Firebase RTDB nodes per store: `/${store_slug}/orders`, `/${store_slug}/menu`, `/${store_slug}/config`.
   - Prevent cross-tenant data leakage by enforcing tenant-scoped HMAC session tokens (embed `store_slug` inside token payload and verify during request handling).
3. **Verification & Tests:**
   - Add unit tests in [`tests/worker.test.js`](file:///D:/ARH-GITHUB/arhsmoque2/ARH-FNB-Beelal-Coffee/tests/worker.test.js) validating that tokens issued for Store A cannot access Store B orders.

---

## 5. Phase 2 Roadmap & Future Features

1. **Inventory Depletion Engine:**
   - Real-time stock counts in Firebase RTDB (`/beelal_coffee/inventory/{itemId}`).
   - Automatically decrement stock when order transitions to `confirmed` or `completed`.
   - Mark items as "Sold Out" on the storefront when quantity reaches 0.
2. **Delayed Customer Feedback Loop:**
   - [`index-v2.html`](file:///D:/ARH-GITHUB/arhsmoque2/ARH-FNB-Beelal-Coffee/index-v2.html) already has the UI structure for `#reviewPromptBanner` and `#feedbackSheet`.
   - Wire up submission to `/beelal_coffee/reviews/{orderId}` and display average ratings in admin.
3. **Customer Phone Profiles & Repeat Orders:**
   - Cache customer name, phone, and favorite drink in `localStorage`.
   - Pre-fill fields on subsequent visits for frictionless checkout.

---

## 6. Secrets & Environment Configuration

| Variable Name          | Environment         | Purpose                                                        |
| :--------------------- | :------------------ | :------------------------------------------------------------- |
| `OPENROUTER_API_KEY`   | Worker Secret       | API key for OpenRouter AI completions proxy (`POST /api/chat`) |
| `UPLOAD_SECRET`        | Worker Secret       | Shared secret gating media uploads                             |
| `BILLING_SECRET`       | Worker Secret       | Bearer token authenticating order records with billing ledger  |
| `ADMIN_DEV_PIN`        | Worker Secret / Var | 4-digit PIN for developer admin role (defaults to `0405`)      |
| `ADMIN_OWNER_PIN`      | Worker Secret / Var | 4-digit PIN for owner admin role (defaults to `1234`)          |
| `ADMIN_SESSION_SECRET` | Worker Secret / Var | Secret key for signing admin HMAC session tokens               |
| `FIREBASE_URL`         | Worker Var          | Base URL for Firebase Realtime Database                        |
| `FIREBASE_AUTH_SECRET` | Worker Secret       | Private database secret for RTDB REST calls                    |

Secrets are managed via `wrangler secret put <NAME>` and canonical ARH SOPS encryption.

---

## 7. Operational Safety Rules for Incoming Agents

1. **Run `npm run check` Before Every Commit:** Ensure all 9 gates (oxlint, cspell, markdownlint, knip, prettier, UI gates, layout audit, infra doctor, vitest) pass with 0 errors.
2. **Never Edit Files in Parallel with Multiple Calls to Single Chunks:** Use clean, targeted diff replacements.
3. **Always Preserve File URLs with Forward Slashes:** Format all references as `[path](file:///D:/path/to/file)`.
4. **Deploy via Pull Request Workflow:** Work on feature branches (`feat/...`), run QA, push, verify GitHub Actions CI, and merge cleanly into `main`.
