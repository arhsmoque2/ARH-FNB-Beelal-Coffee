# Handoff — ARH-FNB-Webapp Payment Feature
**For:** Next session agent  
**Date written:** 2026-06-10  
**Priority task:** Implement payment flow in Beelal Coffee webapp  
**Read journal first:** `journal.md` in this folder for full context and reasoning

---

## State of Play

### Done this session
| Repo | What | Status |
|---|---|---|
| `mission-hq` | Fix `errorMessage: undefined` Firebase crash | ✅ committed, deployed |
| `mission-hq` | AnyFlip URL fetch → AI metadata enrichment | ✅ committed, deployed |
| `mission-hq` | Glassbox context panel in AdminChat | ✅ committed, deployed |
| `mission-hq` | tsconfig test file exclusion (build fix) | ✅ committed, deployed |
| `ARH-FNB-Webapp` | Payment feature — design agreed | ✅ designed only |

### NOT yet started
- **ARH-FNB-Webapp payment implementation** — this is the task for next session

---

## Your Task: Implement Payment Flow

### Repo location
```
C:\00_ARH\_arhsmoque-github-repo-clones\ARH-FNB-Webapp
git checkout store/beelal   ← already on this branch
```

### Live URL (Beelal Coffee)
`https://fnb-pwa.arh-homelab.workers.dev` (check wrangler.jsonc to confirm)

### Firebase
- URL: `https://ash-2026-photobook-default-rtdb.asia-southeast1.firebasedatabase.app`
- Root: `beelal_coffee`
- Orders path: `beelal_coffee/orders`
- Config path: `beelal_coffee/config`

---

## Implementation Plan (do in this order)

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

**Needs secret:** `GEMINI_API_KEY` — retrieve from vault:
```
C:\00_ARH\vault\keys\arhg3-vault.json
```
Add to Cloudflare Worker secrets:
```
cd C:\00_ARH\_arhsmoque-github-repo-clones\ARH-FNB-Webapp
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

### Step 3 — `index-legacy.html`: Customer payment flow

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

Modify `loadOrders()` (around line 1966) to show for each order:

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
  (or upload via Imgur like logo/banner — existing upload infrastructure already in admin.html)
- Bank Name (text input)
- Account Name (text input)  
- Account Number (text input)
- Save button → writes to `config/payment_settings`

---

## Firebase Rules

Add to `database.rules.json` (or wherever rules are managed):
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

## Secrets Needed

| Secret | Where to get | How to set |
|---|---|---|
| `GEMINI_API_KEY` | `C:\00_ARH\vault\keys\arhg3-vault.json` → key under Gemini/Google AI | `npx wrangler secret put GEMINI_API_KEY` in `ARH-FNB-Webapp` dir |

The vault key name to look for: check under `"Gemini"`, `"Google AI"`, or `"arh-homelab Gemini"` entries.

---

## Testing Checklist

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

## Do NOT Touch

- `index-v2.html` — V2 preview, not the live order app
- `index.html` — just a redirect, leave as-is
- The existing `sendOrder()` WhatsApp flow for legacy orders — keep working for backward compat
- Firebase root path `beelal_coffee` — do not change
- The `UPLOAD_SECRET` pattern in worker.js — parse-receipt is customer-facing, no secret needed

---

## Related Context

- Session journal with full reasoning: `journal.md` (this folder)
- Beelal sales analysis: 529 orders, RM 14,547 revenue, RM 27.50 avg — see journal §5
- Payment gateway recommendation: HitPay (future), but this feature works without a gateway — store owner manually confirms. Gateway integration is a separate future phase.
- Live mission-hq (unrelated): `https://mission-hq.arh-homelab.workers.dev`
