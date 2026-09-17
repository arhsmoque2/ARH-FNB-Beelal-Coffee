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

# 2. Run unit & regression test suite (153 tests across 4 files)
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
| `POST` | `/api/chat`                      | Bearer Token          | Proxies AI theme assistance requests to OpenRouter                                  |
| `POST` | `/api/upload/receipt`            | Public (Rate-limited) | Stores customer transfer receipts in R2 for 30-day verification                     |
| `POST` | `/api/record-order`              | Server-to-server      | Relays order transaction metadata to D1 billing ledger                              |

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

## 4. Remaining Roadmap: Options C & D (Next Takeover Point)

Incoming agents should proceed with the following priorities:

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

### 🎯 Option D: Billing Ledger Automation & Transaction Rollups

#### Context & Objectives

The repository contains an edge microservice at [`billing-ledger/`](file:///D:/ARH-GITHUB/arhsmoque2/ARH-FNB-Beelal-Coffee/billing-ledger) backed by Cloudflare D1 (`fnb-billing-ledger-db`). Order submissions already dispatch fire-and-forget billing events via `fetch('/api/record-order')` (authenticated with `BILLING_SECRET`).
The goal of Option D is automating billing reconciliation and rollups:

1. **Scheduled Aggregate Cron:**
   - Implement `scheduled(controller, env, ctx)` handler in `billing-ledger/src/index.js` to compute daily, weekly, and monthly gross merchandise value (GMV), order counts, and fee rollups.
   - Store aggregate summaries in a new D1 table `billing_daily_rollups` (`rollup_date`, `store_slug`, `gross_revenue_cents`, `order_count`, `currency`, `created_at`).
2. **Admin Billing Dashboard Panel:**
   - Add a lightweight read-only "Billing & Settlement" tab or modal in [`admin.html`](file:///D:/ARH-GITHUB/arhsmoque2/ARH-FNB-Beelal-Coffee/admin.html) querying `/api/billing/summary` (protected by admin session token).
   - Display today's revenue, weekly total, and order volume without exposing raw customer records.
3. **Verification & Tests:**
   - Add unit tests in [`tests/billing-ledger.test.js`](file:///D:/ARH-GITHUB/arhsmoque2/ARH-FNB-Beelal-Coffee/tests/billing-ledger.test.js) covering aggregation maths, zero-order days, and currency isolation.

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
