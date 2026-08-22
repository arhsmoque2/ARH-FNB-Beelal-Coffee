# Handoff — Beelal Coffee Standalone Repo

**Date written:** 2026-08-22
**Written by:** Claude Code cloud/sandbox session (devtool readiness assessment + fixes)
**Read `journal.md` and `AGENTS.md` too** — this file assumes both.

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
| 1 | Rotate & relocate `config.js` → `billing.secret` | It's a live shared secret (`fnb-billing-ledger` worker auth). I can restructure the client code, but rotating the actual secret and updating the billing Worker's expected value requires CF account access I don't have. Also don't know the billing Worker's source/contract (it's not in this repo) so I can't safely design the server-side proxy without guessing its API. | CF dashboard/`wrangler` access to `fnb-billing-ledger`; that Worker's source or API contract |
| 2 | Wire up `MEDIA_BUCKET` R2 binding | `worker.js` expects it; `wrangler.jsonc` doesn't declare it. Adding a binding block is easy, but if the R2 bucket doesn't already exist in the CF account, a blind add breaks deploy instead of fixing anything. | Confirmation the `fnb-pwa-media` R2 bucket exists (or create it), then add the binding + redeploy to verify |
| 3 | ~~Resolve live storefront file~~ | ✅ Done — see §2 | — |
| 4 | Implement payment flow | Fully designed, not started (see `journal.md` §6 and the preserved plan below) — build it in `index-v2.html`, now confirmed live | `GEMINI_API_KEY` secret |
| 5 | Wire CI to the quality gate | Now safe to add — the gate passes cleanly against the confirmed live file (§2). A GitHub Actions workflow running `node _qa/beelal-ui-ux-quality-gate.mjs` on PRs is a ~10-minute add whenever wanted. | Nothing blocking |
| 6 | Firebase security rules review | `config.js`/`worker.js` reference read/write patterns but the actual `database.rules.json` (or console-configured rules) isn't in this repo, so I can't audit what's actually enforced server-side. | Export of current Firebase RTDB rules, or console access |

## 4. What I'd need supplied directly to this repo for full sandbox independence

Right now, everything I did this session was source-only (static analysis + text edits) — I
have **no way to verify anything against the real deployed system**: no CF account, no
Firebase access, no way to run `wrangler deploy` or `wrangler tail`, no way to see the billing
Worker's source. To go from "plausible fix based on reading code" to "verified against the
live system" from the sandbox, without needing a local machine in the loop, I'd need:

1. **A scoped Cloudflare API token** (env var/secret, e.g. `CLOUDFLARE_API_TOKEN` +
   `CLOUDFLARE_ACCOUNT_ID`) with permissions limited to the `beelal-coffee` Worker + its R2/KV
   bindings — so I can run `wrangler deploy --dry-run`, `wrangler r2 bucket list`,
   `wrangler tail`, and actually confirm bindings/deploys instead of reading `wrangler.jsonc`
   and hoping.
2. **Firebase read access** — either a service-account JSON scoped to the
   `ash-2026-photobook` project (ideally read-only, ideally restricted to the `beelal_coffee`
   node) or, at minimum, the exported `database.rules.json` committed to this repo so rules
   are reviewable/versioned like the rest of the code. Without this I can't verify Firebase
   rules match what `worker.js`/`config.js` assume, and can't test payment-flow writes once
   built. (§2, the storefront-file question, is now resolved by owner confirmation rather
   than needing this — but this access would have let me confirm it myself.)
3. **The `fnb-billing-ledger` Worker's source** (as a repo, or vendored into this one, or at
   least its API contract documented) — I can't safely redesign the billing-secret handling
   (§3.1) while treating that Worker as a black box; I could break billing for the store.
4. **A `GEMINI_API_KEY`** (Cloudflare Worker secret, or supplied to this session as an env var
   for local testing before pushing) once payment-flow work (§3.4) actually starts.
5. **A committed `.dev.vars.example`** (referenced by `.gitignore` but doesn't exist) listing
   every secret name a fresh clone needs (`UPLOAD_SECRET`, the billing secret once relocated,
   `GEMINI_API_KEY` when added) with placeholder values — so secret requirements are
   self-documenting instead of living in Worker comments and this handoff file.
6. **A CI workflow secret set** (GitHub Actions repo secrets mirroring #1) if/when the quality
   gate gets wired into CI (§3.5) and later a `wrangler deploy` step is added — otherwise CI
   can only ever run the static gate, never verify an actual deploy.
None of the above lets me bypass asking before destructive/production actions (secret
rotation, etc.) — I'd still confirm those — but it would let me *verify* my work against the
real system instead of reasoning from source code alone, and get from "plausible" to "tested"
without a round-trip through a local machine.

---

## Preserved: Payment Feature Plan (originally written 2026-06-10, still not implemented)

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
