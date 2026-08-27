# Session Journal — 2026-06-10

**Agent:** claude-sonnet-4-6  
**Session date:** 2026-06-10  
**Repos touched:** `mission-hq`, `ARH-FNB-Webapp` (branch `store/beelal`)

---

## Chronological Log

### 1. mission-hq — Deployed URL

User could not find the live URL. Confirmed via Cloudflare API:

> https://mission-hq.arh-homelab.workers.dev

Worker name `mission-hq`, account subdomain `arh-homelab`. Confirmed via `GET /accounts/{id}/workers/subdomain`.

---

### 2. mission-hq — `errorMessage: undefined` Bug (FIXED, committed)

**Symptom:** Error banner in Admin → Directory tab on Extract button:

> `update failed: values argument contains undefined in property 'mission_hq.resources.-Ouka1tgc5OxOl2whjMT.errorMessage'`

**Root cause:** `src/lib/resourceExtractor.ts` line 75–78 passed `errorMessage: undefined` to `resourceDirectory.updateResource()` when resetting status to `extracting`. Firebase RTDB's `update()` rejects `undefined` values entirely.

**Fix:** Removed `errorMessage: undefined` from the initial status-reset update. The error-path write at line 123 is fine (always a real string). One-line removal.

**Why not set to `null`?** The `extracting` state already signals a fresh attempt; explicitly clearing `errorMessage` is unnecessary. If we needed to clear it, `null` would work but adds noise.

---

### 3. mission-hq — AdminChat URL Fetch for Book Metadata (FIXED, committed)

**Problem:** When pasting an AnyFlip URL in Dir mode, Gemini replied:

> "I cannot directly open or view the cover of the AnyFlip link to infer the details."

**Two-part solution:**

**Part A — Worker endpoint** (`src/worker.ts`):  
Added `GET /api/resource/fetch-page?url=...` — fetches HTML from AnyFlip/FlipHTML5 (same domain allowlist as `proxy-image`), extracts `og:title`, `og:description`, `<title>` tag, meta description. Returns `{ title, description }`.

**Part B — AdminChat auto-enrichment** (`src/features/toolbelt/AdminChat.tsx`):  
When Dir mode is on and user message contains an AnyFlip/FlipHTML5 URL, silently calls `/api/resource/fetch-page` before sending. Appends fetched metadata as `[Fetched from URL]\nPage title: ...\nDescription: ...` to the message. Gemini then has the data it needs.

**Part C — System prompt update** (`src/lib/resourceDirectoryActions.ts`):  
Added to `DIRECTORY_SYSTEM_PROMPT`:

- Explicit instruction: "The app already fetched the URL for you — don't say you can't browse"
- Malaysian primary school inference table (KAFA→kafa, Tahun 3→yearLevel 3, Pendidikan Islam→islamic, etc.)
- Rule: generate `resource-action` block immediately if all 4 fields inferrable; only ask if genuinely ambiguous

**Part D — Glassbox context panel** (`src/features/toolbelt/AdminChat.tsx`):  
Added `fetchedContext?: string` to `Message` type. When fetch returns data, stores it separately. Rendered as a muted monospace panel above the user bubble labelled `⬡ context injected`. User bubble shows clean original text only (injected suffix stripped from display). Gives operator visibility into exactly what was sent to the AI.

**Also fixed:** Pre-existing TypeScript build failure — `src/lib/safety.test.ts` and `src/lib/validators.test.ts` imported `vitest` which wasn't installed. Fixed by adding `"exclude": ["src/**/*.test.ts", "src/**/*.test.tsx"]` to `tsconfig.json`.

All four files committed and pushed to `master`. Auto-deploy via GitHub Actions → Cloudflare Workers.

---

### 4. Payment Gateway Research for Beelal Coffee

User asked to vet a payment gateway proposal (HitPay, toyyibPay, Billplz, Xendit) and research real charges. Key findings:

**Confirmed accurate:**

- HitPay: RM 0 setup/monthly, FPX flat, 1.4% card, TNG+GrabPay+Visa/MC all included, T+1 settlement
- Billplz: RM 0.70–1.10 FPX flat, NO Visa/Mastercard (proposal omitted this)
- toyyibPay: RM 1 flat per tx, FPX + Visa/MC only, NO TNG/GrabPay (proposal overstated)
- Xendit: BNM licensed (via Payex PLT acquired 2025), RM 1.20 FPX B2C, Alipay/WeChat for cross-border

**Hidden charges identified:**

1. Original transaction fee never refunded on refunds
2. E-wallet MDR ~3% — higher than FPX flat
3. **SST 8%** on all gateway fees — never shown upfront
4. Chargebacks only on cards (FPX/DuitNow are dispute-proof)
5. Rolling reserve possible at Xendit for new accounts

---

### 5. Beelal Coffee — Real Sales Data Analysis

Pulled live order data from Firebase RTDB (`beelal_coffee/orders`):

- **529 orders** over ~2 months (Apr–Jun 2026)
- **RM 14,547.80** total revenue
- **RM 27.50** average order
- Peak day: 15 Apr — 112 orders (likely launch event)
- Top items: Mac & Cheese (105×), Americano (104×), Spanish Latte (64×)

**Fee calc on real data (realistic mix: 50% FPX / 40% eWallet / 10% Card, incl. 8% SST):**

| Gateway   | Total fees | Per month | % revenue | Catch                               |
| --------- | ---------- | --------- | --------- | ----------------------------------- |
| HitPay    | RM 495.66  | RM 248    | 3.41%     | Full coverage                       |
| Billplz   | RM 199.58  | RM 100    | 1.37%     | No card — 10% customers blocked     |
| toyyibPay | RM 342.36  | RM 171    | 2.35%     | No TNG/Grab — 40% customers blocked |
| Xendit    | RM 562.11  | RM 281    | 3.86%     | Priciest, BNM licensed              |

**Decision:** HitPay recommended. RM 248/mo for full coverage. toyyibPay cheapest on paper but 40% ewallet customers can't pay = lost RM 27.50/order. Billplz no-card is a smaller but real gap.

FPX-push strategy (nudge customers to online banking): shifts mix to 70% FPX → drops HitPay fees to ~RM 395/mo.

---

### 6. ARH-FNB-Webapp — Payment Feature Design (NOT YET IMPLEMENTED)

**Context:** Beelal Coffee is a home F&B business (condo delivery/pickup). Current flow ends at WhatsApp — customer sees menu, builds cart, clicks "Send Order" which opens WhatsApp. Payment happens off-app (manual QR screenshot, bank transfer, cash).

**User's goal:** Extend the webapp to cover payment end. WhatsApp becomes optional/notification-only, not the order mechanism.

**Agreed flow:**

```
Cart → "Place Order" → Choose payment method
  Cash      → order saved (payment_status: "cash_pending") → confirmation screen
  QR Pay    → show store QR image → "I've Paid" → order "awaiting_confirmation"
  Bank Xfer → show bank details → upload receipt → parse → confirm → "awaiting_confirmation"
              (image NOT stored — Gemini extracts text fields only)
```

**Key design decision — receipt storage:**
User proposed storing only parsed text, not base64 image. Confirmed correct:

- base64 receipt ≈ 150–300 KB each; text record ≈ 400 bytes
- Parsed fields: `transaction_ref`, `amount`, `date`, `time`, `bank_or_wallet`, `to_account`, `from_account`
- Auto flags: `amount_match: true/false` (compare `proof.amount` vs `order.total`)
- Duplicate detection: same `transaction_ref` on two orders → alert
- Image processed client→worker→Gemini Vision, discarded after parsing

**Files to modify:**

1. `worker.js` — add `POST /api/parse-receipt` (Gemini Vision call; needs `GEMINI_API_KEY` secret)
2. `index-legacy.html` — extend cart sheet with payment step (method picker → QR/bank/cash screens → awaiting screen)
3. `admin.html` — Orders tab: payment status, proof details, amount-match alert, Confirm/Reject; new Payment Settings section
4. `config.js` — add `payment: { methods, bank_name, account_name, account_number, qr_image_url }`

**Firebase schema additions (no migration; additive to existing order records):**

```
orders/ord_xxx/payment_method    "cash" | "qr" | "bank_transfer"
orders/ord_xxx/payment_status    "cash_pending" | "awaiting_confirmation" | "confirmed" | "rejected"
orders/ord_xxx/payment_proof     { transaction_ref, amount, date, time, bank_or_wallet, to_account, from_account, amount_match, parsed_at }
config/payment_settings          { bank_name, account_name, account_number, qr_image_url }
```

**Status:** Design agreed. Implementation NOT started. Next session picks up here.

---

## Decisions Log

| Decision                                                | Reason                                                                                                           |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Remove `errorMessage: undefined` vs set `null`          | `extracting` status already signals fresh attempt; no need to clear previous error explicitly                    |
| Fetch AnyFlip HTML server-side (Worker) not client-side | CORS blocks direct fetch from browser; Worker already has domain allowlist pattern from proxy-image              |
| Store only parsed receipt text, not image               | Space (400B vs 300KB), queryability, duplicate detection, amount verification — image adds nothing after parsing |
| HitPay over Billplz/toyyibPay                           | Billplz has no card support; toyyibPay has no TNG/GrabPay — both block real customer segments despite lower fees |
| Build on `index-legacy.html` not `index-v2.html`        | Legacy is the live order-writing app (529 real orders); v2 is a preview that opens WhatsApp only                 |
