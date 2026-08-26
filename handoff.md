# Handoff — Beelal Coffee Standalone Repo

**Date written:** 2026-08-22
**Written by:** Claude Code cloud/sandbox session (devtool readiness assessment + fixes)
**Read `journal.md` and `AGENTS.md` too** — this file assumes both.

---

## 0. 🔴 URGENT, DO FIRST — Repo/Infra migration: old fleet repo → this repo

This repo (`arhsmoque2/ARH-FNB-Beelal-Coffee`) was forked from the shared fleet template
(`arhsmoque/arh-fnb-webapp`, branch `store/beelal`) on 2026-08-22. The **code** side of that
fork is done. The **Cloudflare infrastructure** side has not been confirmed done — this
section is a runbook for a local agent (with CF dashboard/`wrangler` access) to verify and
finish it. Nothing below this point in the handoff matters much if the wrong repo is still
the one actually serving customers.

### 0a. Verify which project currently owns the live URL — do this before anything else

`wrangler.jsonc` in this repo declares CF project name `"beelal-coffee"`. A standalone
Workers project with that name would normally produce a URL like
`beelal-coffee.<account-subdomain>.workers.dev`. But the URL everyone refers to as "live" —
`https://store-beelal-fnb-pwa.arh-homelab.workers.dev` — follows the **old** fleet's naming
pattern (`store-<name>-fnb-pwa`), which is what the old `fnb-pwa` CF project auto-generates
for branch builds off `store/beelal`. Those two facts don't fit together cleanly, so one of
two things is true, and it changes everything about the rest of this runbook:

- **(a)** This new repo/project has never actually been connected to Cloudflare — the
  `store-beelal-fnb-pwa...` URL customers are hitting is still being served by the **old**
  repo/branch/project. Every fix merged into this repo's `main` (see §1–2 below) is sitting
  in a repo that isn't deployed anywhere yet.
- **(b)** Someone already cut over and mapped a custom route to preserve the old URL on the
  new `beelal-coffee` project — possible, but nothing in this repo documents it, and it would
  be unusual to do before the code-side migration was finished.

**Action:** Open the Cloudflare dashboard → Workers & Pages. Look for both `fnb-pwa` and
`beelal-coffee` projects. Check which one currently owns/routes
`store-beelal-fnb-pwa.arh-homelab.workers.dev` (or whatever custom domain, if any). Report
back which case (a) or (b) is true — it determines whether steps 0b onward are "do this
whole migration" or "just confirm and document what's already in place."

### 0b. If case (a) — full migration still needed

1. **Stand up (or confirm) the `beelal-coffee` CF Workers project** connected to
   `arhsmoque2/ARH-FNB-Beelal-Coffee`, production branch **`main`** (not a `store/*` branch —
   this repo's whole structure assumes `main` is production, unlike the old fleet's
   branch-per-store model).
2. **Re-provision secrets on the new project** — secrets live per-Worker in Cloudflare, they
   do not travel with git history:
   - `UPLOAD_SECRET` (gates `worker.js` upload routes)
   - `BILLING_SECRET` — provisioned on the new Worker and encrypted in the ARH SOPS vault
   - `GEMINI_API_KEY` remains intentionally unused; the parser endpoint is disabled by policy
   - Reusing the old project's exact secret values is fine for continuity, but rotating
     during the move is the better call — `billing.secret` is already known to have leaked
     once (git history has a "rotate billing secret" commit from the old repo).
3. **Re-provision bindings** — also per-project, not per-repo:
   - `MEDIA_BUCKET` R2 binding — it now points at `arh-fnb-beelal-media`, which has been created
     and verified for the new project.
   - Diff the old project's full dashboard config (bindings, KV/D1/anything else) against
     this repo's `wrangler.jsonc` side by side — don't assume `worker.js`'s comments list
     every dependency; confirm against what's actually configured on the old project.
4. **Data needs no migration.** Firebase RTDB (`ash-2026-photobook` project, `beelal_coffee`
   root) is shared infra, independent of which CF project/repo serves the frontend. As long
   as `config.js`'s `firebase.url`/`firebase.root` stay unchanged (they have, and must not
   change — see `AGENTS.md`), orders/menu/theme data keep working through the cutover with
   zero data migration required. This is the lowest-risk part of the whole move.
5. **Cut over the URL.** However `store-beelal-fnb-pwa.arh-homelab.workers.dev` is currently
   routed needs to move to the new project. If it's a `*.workers.dev` subdomain generated
   from the project name, the new project literally cannot reproduce that exact URL — either
   set up a custom route/domain mapping to preserve it, or accept the live URL changes to
   `beelal-coffee.<account>.workers.dev` and update everywhere that URL is referenced
   (WhatsApp order-confirmation links if any, bookmarks, `AGENTS.md`, `README.md`).
6. **Decommission the old path** once the new one is verified live and taking real traffic —
   disable the old `fnb-pwa` project's branch build for `store/beelal` (or just leave that
   branch frozen) so two live deployments can't race each other on push. Don't delete the old
   repo/branch immediately; keep it as a rollback path for at least one full business cycle.
7. **Verify end-to-end on the new URL** before calling it done: place a real test order,
   confirm it lands in `beelal_coffee/orders` in Firebase, confirm the WhatsApp deep link
   fires correctly, confirm `admin.html` loads and can read/write config on the new
   deployment.

### 0c. If case (b) — already cut over

Just document it: update `AGENTS.md`/`README.md` to state explicitly that the CF project
migration is complete (it currently reads as aspirational, not confirmed), and still work
through steps 2–3 above as a *verification* pass (confirm secrets/bindings are actually
present on the live project, not assumed) rather than a fresh setup.

### What I could not do from the sandbox and why

I have no Cloudflare API token or dashboard access in this session — I can read
`wrangler.jsonc` and infer from URL-naming conventions, but I cannot query Cloudflare's
actual project list, routes, secrets, or bindings to resolve 0a myself. See §4 below for
exactly what credentials would let a cloud-sandbox session do this verification/execution
itself next time, instead of needing a local agent for it.

---

## 1. What this session fixed (safe, mechanical, done from the sandbox)

| Fix | File | Why |
|---|---|---|
| Quality gate no longer silently vacuous | `_qa/beelal-ui-ux-quality-gate.mjs` | Gates 2–4 pointed at `v2/index.html`, which doesn't exist in this repo (files are flat). They were being skipped entirely while the script still printed "All Gates PASSED". Now Gates 2, 3, 4, 5 run against **both** `index-legacy.html` and `index-v2.html`, per-file, instead of guessing which is "the" storefront. |
| Removed dead gate-gaming code | `index.html` | A hidden `<script style="display:none">` block plus HTML comments referenced `verify-menu-schema-contract.py` / `verify-html-static-contract.py` — Python verifier scripts that don't exist anywhere in this repo (leftover from the parent fleet template). It also stubbed a fake `function sendOrder() { window.open(); }`. Deleted; the file is now just the redirect shim it claims to be. |
| Stale branding | `observatory.html` | `<title>` said "Woodfire" (a different store's leftover branding). Changed to "Beelal Coffee". |
| README rewritten | `README.md` | Described the old multi-branch fleet setup (`store/beelal`, `store/therizz`, shared `fnb-pwa` CF project) that no longer applies to this standalone repo. Rewritten to match `AGENTS.md` and current file layout, and now documents the two open items below instead of hiding them. |

Quality gate initially correctly **failed** (14 errors) because `index-legacy.html` was
missing the modern cart-stepper/UEQ features that `index-v2.html` has — real signal, not a
gate bug. Once §2 was resolved and `index-legacy.html` removed, the gate was pointed at
`index-v2.html` only and now passes for real (0 errors), not vacuously like before.

## 2. ✅ RESOLVED — `index-v2.html` is the live storefront

Confirmed by the owner on 2026-08-22. `index-legacy.html` has been **deleted** from the repo
(git history still has it if ever needed). `AGENTS.md` and `README.md` updated accordingly.
`journal.md` still contains the old (now superseded) June note calling `index-legacy.html`
the live app — left as historical record, not corrected, since it's a session log.

This unblocks: the quality gate now runs against `index-v2.html` only and passes for real
(not vacuously); the payment-flow build (§3.4 below) has a confirmed target file.

## 3. Remaining work that needs local-machine / credentialed access

These are things I identified but could **not** safely fix from this sandbox — each needs
either a decision only the owner can make, or credentials/access this session doesn't have.

| # | Item | Why I didn't do it | Who/what's needed |
|---|---|---|---|
| 1 | ~~Rotate & relocate `config.js` → `billing.secret`~~ | ✅ Done — server-side proxy uses `BILLING_SECRET`, which is provisioned on `beelal-coffee` and encrypted in SOPS. | — |
| 2 | ~~Wire up `MEDIA_BUCKET` R2 binding~~ | ✅ Done — binding points at `arh-fnb-beelal-media`, which was created and verified. | — |
| 3 | ~~Resolve live storefront file~~ | ✅ Done — see §2 | — |
| 4 | Implement payment flow | ✅ Local implementation complete: owner-confirmed receipt lifecycle, Tesseract transcription aid, and 30-day receipt cleanup. | Live smoke test after deployment |
| 5 | Wire CI to the quality gate | Now safe to add — the gate passes cleanly against the confirmed live file (§2). A GitHub Actions workflow running `node _qa/beelal-ui-ux-quality-gate.mjs` on PRs is a ~10-minute add whenever wanted. | Nothing blocking |
| 6 | Firebase security rules review | `config.js`/`worker.js` reference read/write patterns but the actual `database.rules.json` (or console-configured rules) isn't in this repo, so I can't audit what's actually enforced server-side. | Export of current Firebase RTDB rules, or console access |

## 4. What I'd need supplied directly to this repo for full sandbox independence

The Cloudflare account and new Worker/R2 provisioning are now verified from this session.
Firebase rules and the billing Worker remain separately governed systems. To complete live
system proof, the remaining checks are:

1. **Firebase read access** — either a service-account JSON scoped to the
   `ash-2026-photobook` project (ideally read-only, ideally restricted to the `beelal_coffee`
   node) or, at minimum, the exported `database.rules.json` committed to this repo so rules
   are reviewable/versioned like the rest of the code. Without this I can't verify Firebase
   rules match what `worker.js`/`config.js` assume, and can't test payment-flow writes once
   built. (§2, the storefront-file question, is now resolved by owner confirmation rather
   than needing this — but this access would have let me confirm it myself.)
2. **The `fnb-billing-ledger` Worker's source** (as a repo, or vendored into this one, or at
   least its API contract documented) — I can't safely redesign the billing-secret handling
   (§3.1) while treating that Worker as a black box; I could break billing for the store.
3. **A committed `.dev.vars.example`** (referenced by `.gitignore` but doesn't exist) listing
   every secret name a fresh clone needs (`UPLOAD_SECRET`, `BILLING_SECRET`, and the deliberately
   disabled `GEMINI_API_KEY` future option) with placeholder values — so secret requirements are
   self-documenting instead of living in Worker comments and this handoff file.
4. **A CI workflow secret set** (GitHub Actions repo secrets) if/when the quality
   gate gets wired into CI (§3.5) and later a `wrangler deploy` step is added — otherwise CI
   can only ever run the static gate, never verify an actual deploy.
None of the above lets me bypass asking before destructive/production actions (secret
rotation, etc.) — I'd still confirm those — but it would let me *verify* my work against the
real system instead of reasoning from source code alone, and get from "plausible" to "tested"
without a round-trip through a local machine.

---

## Preserved: Payment Feature Plan (historical reference)

The owner-confirmed receipt lifecycle is now implemented in `index-v2.html`, `admin.html`,
and `worker.js`. The historical Gemini-based plan below is superseded: Gemini remains
deliberately disabled, Tesseract.js is local transcription assistance, and owner bank review
is the only payment authority.

This plan pre-dates the standalone-repo split. It originally targeted `index-legacy.html`,
which has since been confirmed dead and deleted (§2) — **build this in `index-v2.html`
instead**, now confirmed live. Local-machine paths below (`C:\00_ARH\...`) are from the
original authoring machine and don't apply to this sandboxed repo; treat everything else as
still-valid design.

### Firebase
- URL: `https://ash-2026-photobook-default-rtdb.asia-southeast1.firebasedatabase.app`
- Root: `beelal_coffee`
- Orders path: `beelal_coffee/orders`
- Config path: `beelal_coffee/config`

### Step 1 — `worker.js`: Add receipt parser endpoint

Add `POST /api/parse-receipt` handler. No auth needed (customer-facing).

**Request body:**
```json
{ "imageBase64": "<base64 string>", "mimeType": "image/jpeg" }
```

**What it does:**
- Calls Gemini Vision (`gemini-2.5-flash`) with the image
- Prompt instructs it to extract: transaction_ref, amount, date, time, bank_or_wallet, to_account, from_account
- Returns structured JSON

**Response:**
```json
{
  "transaction_ref": "TXN20260610143201",
  "amount": 27.50,
  "date": "2026-06-10",
  "time": "14:32",
  "bank_or_wallet": "Touch 'n Go",
  "to_account": "Beelal Coffee",
  "from_account": "****1234",
  "parse_confidence": "high"
}
```

**Gemini prompt to use:**
```
You are reading a Malaysian e-wallet or bank transfer payment receipt screenshot.
Extract ONLY these fields as JSON (no markdown, no explanation):
{
  "transaction_ref": "the transaction/reference ID or number",
  "amount": <number, Malaysian Ringgit, no currency symbol>,
  "date": "YYYY-MM-DD",
  "time": "HH:MM",
  "bank_or_wallet": "name of the bank or e-wallet (Touch 'n Go, Maybank, CIMB, etc.)",
  "to_account": "recipient name or account",
  "from_account": "last 4 digits of sender account if visible, else null",
  "parse_confidence": "high" | "medium" | "low"
}
If a field is not visible, use null. Amount must be a number.
```

**Needs secret:** `GEMINI_API_KEY` (see §4.4 above for how this should reach the sandbox).
Set it on the Worker with:
```
npx wrangler secret put GEMINI_API_KEY
```

**Add to router in `worker.js`:**
```js
if (url.pathname === '/api/parse-receipt') {
  if (request.method !== 'POST') return json({ error: 'POST only' }, 405);
  return handleParseReceipt(request, env);
}
```

---

### Step 2 — `config.js`: Add payment config block

In `APP_CONFIG`, add after `checkout`:
```js
payment: {
  methods: ['cash', 'qr', 'bank_transfer'],
  bank_name:      '',   // e.g. 'Maybank'
  account_name:   '',   // e.g. 'Beelal Coffee'
  account_number: '',   // e.g. '1234567890'
  qr_image_url:   '',   // set by admin via Payment Settings
},
```

---

### Step 3 — `index-v2.html`: Customer payment flow

#### 3a. After "Send Order" button, insert a payment method picker step

The existing cart sheet has this flow:
```
Cart list → Name/Note fields → [Send Order via WhatsApp]
```

Change to:
```
Cart list → Name/Note fields → [Place Order] → payment picker sheet
```

**Important:** The existing `sendOrder()` calls `window.open(wa.me...)` synchronously (before any await) because iOS Safari blocks popups after async. For Cash method only, still open WhatsApp for order notification. For QR and Bank Transfer, no WhatsApp at order time — WhatsApp opens only when admin confirms.

#### 3b. Payment method picker (new sheet/step)
Three cards stacked:
- 💵 **Cash** — "Pay on pickup or delivery"
- 📱 **QR Pay** — "Scan with any banking app or e-wallet"
- 🏦 **Bank Transfer** — "Transfer and upload proof"

#### 3c. Cash flow
- Write order to Firebase with `payment_method: "cash", payment_status: "cash_pending"`
- Show confirmation: "Order placed! Pay RM XX.XX on collection. We'll prepare your order."
- Open WhatsApp notification to store: "New cash order from [name] — RM XX.XX"

#### 3d. QR flow
- Read `config/payment_settings/qr_image_url` from Firebase (or fall back to `APP_CONFIG.payment.qr_image_url`)
- Display QR image full-width with store name and order total above
- Download button: `<a download="beelal-qr.png" href="{qr_url}">Save QR to phone</a>`
- "I've Paid" button → write order with `payment_method: "qr", payment_status: "awaiting_confirmation"`
- Show waiting screen: "Payment submitted! We'll confirm shortly."

#### 3e. Bank Transfer flow
Step 1 — Show bank details:
```
Bank:    {bank_name}
Account: {account_number}
Name:    {account_name}
Amount:  RM {total}
```
"Copy account number" button.

Step 2 — Receipt upload:
- `<input type="file" accept="image/*" capture="environment">` (opens camera on mobile)
- On file select: read as base64, POST to `/api/parse-receipt`
- Show spinner: "Reading your receipt..."
- On success: show parsed result for customer to verify:
  ```
  ✅ We read: RM 27.50 · TXN20260610143201 · Touch 'n Go
  [Looks right — Submit Proof]  [Re-upload]
  ```
- On parse failure/low confidence: show "Could not read receipt automatically" + still allow manual submission with a note field

Step 3 — On "Submit Proof":
- Write order with:
  ```js
  payment_method: "bank_transfer",
  payment_status: "awaiting_confirmation",
  payment_proof: {
    transaction_ref, amount, date, time,
    bank_or_wallet, to_account, from_account,
    amount_match: (parsedAmount === orderTotal),
    parsed_at: Date.now()
  }
  ```
- Show: "Proof submitted! Waiting for confirmation."

#### 3f. Waiting/confirmation screen
Common to QR and Bank Transfer after submission:
```
⏳ Awaiting confirmation
Your order has been received. The store owner
will confirm your payment shortly.

Order: [name] — RM [total]
[items summary]
```
Auto-poll Firebase every 10s for `payment_status === "confirmed"`. On confirmed, show:
```
✅ Order Confirmed!
[items summary]
```

---

### Step 4 — `admin.html`: Orders tab + Payment Settings

#### 4a. Orders tab — payment status display

Modify `loadOrders()` to show for each order:

**Status badge** (colour-coded):
- `cash_pending` → yellow "Cash · Pending"
- `awaiting_confirmation` → orange "QR/Bank · Awaiting"
- `confirmed` → green "Confirmed"
- `rejected` → red "Rejected"
- (no payment_method) → grey "Legacy order"

**Payment proof block** (only if `payment_proof` exists):
```
Ref: TXN20260610143201
Paid: RM 27.50 · Touch 'n Go · 2026-06-10 14:32
✅ Amount matches  OR  ⚠️ Mismatch: paid RM 25 / order RM 27.50
```

**Action buttons** (only if `payment_status === "awaiting_confirmation"`):
- ✅ Confirm → sets `payment_status: "confirmed"` → opens WhatsApp:
  `"✅ Order confirmed, [name]! Your order of RM [total] is being prepared. Thank you!"`
- ❌ Reject → prompt for reason → sets `payment_status: "rejected"` + stores reason → opens WhatsApp:
  `"Sorry [name], we could not verify your payment. Please contact us."`

**Duplicate detection:** When rendering orders, check if any two orders share the same `payment_proof.transaction_ref`. If yes, show ⚠️ "Duplicate ref" on both.

#### 4b. Payment Settings section (new tab or under Store Info)

Form fields:
- QR Image: file upload → converts to base64 → saves to `config/payment_settings/qr_image_url`
  (or upload via existing image-upload infrastructure already in admin.html)
- Bank Name (text input)
- Account Name (text input)
- Account Number (text input)
- Save button → writes to `config/payment_settings`

---

## Firebase Rules

Add to rules (wherever they're managed):
```json
"config": {
  "payment_settings": {
    ".read": true,
    ".write": false
  }
}
```
Payment settings are public-read (customer needs QR/bank details) but write-protected (admin only via secret or Firebase Auth).

---

## Testing Checklist (payment feature)

- [ ] `POST /api/parse-receipt` with a real TNG screenshot returns correct JSON
- [ ] Cash order: writes to Firebase with correct status, WhatsApp opens
- [ ] QR order: QR image loads from Firebase config, "I've Paid" writes order
- [ ] Bank Transfer: receipt upload → parse → verify screen → submit writes proof
- [ ] Admin: awaiting_confirmation orders show proof + Confirm/Reject buttons
- [ ] Admin: Confirm → status updates → WhatsApp opens with confirmation message
- [ ] Admin: Payment Settings save → reloads correctly on customer page
- [ ] Duplicate `transaction_ref` detected and flagged
- [ ] Amount mismatch `amount_match: false` shown with warning in admin

---

## Related Context

- Session journal with full reasoning: `journal.md` (this folder)
- Beelal sales analysis: 529 orders, RM 14,547 revenue, RM 27.50 avg — see `journal.md` §5
- Payment gateway recommendation: HitPay (future), but this feature works without a gateway — store owner manually confirms. Gateway integration is a separate future phase.
