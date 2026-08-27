# Handoff — Port the QR Payment Feature to the Live Deployment

**Date written:** 2026-08-26
**Written by:** Claude Code cloud/sandbox session
**Read `AGENTS.md` and `handoff.md` first** — this file assumes both, especially
`handoff.md` §0 ("URGENT, DO FIRST — Repo/Infra migration").

---

## Why this file exists

The QR payment feature (in-app "Pay by QR" for customers, Payment Settings +
Orders confirm/reject for the owner) is **merged into `main` of this repo**
(`arhsmoque2/ARH-FNB-Beelal-Coffee`), in PR #4:

- Merge commit: `c435cd2`
- Feature commit: `e10e36f` ("Add in-app QR payment flow (ported from
  ARH-MAKAN's DuitNow design)")
- Parent (pre-feature) commit: `148a46f`

**But this repo may not be what's actually serving
`https://store-beelal-fnb-pwa.arh-homelab.workers.dev`.** Per `handoff.md`
§0, that URL follows the _old_ fleet's naming convention
(`store-<name>-fnb-pwa`), which is what the old `fnb-pwa` Cloudflare project
generates for the `store/beelal` branch of the old repo
(`arhsmoque/arh-fnb-webapp` — note: different GitHub owner, `arhsmoque`, not
`arhsmoque2`). This cloud sandbox session has **no access to that old
repo/owner and no Cloudflare credentials**, so it cannot verify which
project is actually live, and cannot apply this diff to the old repo itself
even if that turns out to be necessary.

This file gives a local agent (or the owner, working locally) everything
needed to finish the job in one pass, without needing to re-derive any of
the above.

---

## Step 0 — Confirm which repo is actually live

Do this before anything else — it decides which of Path A or Path B below
applies.

1. Open the Cloudflare dashboard → Workers & Pages.
2. Find whichever project currently owns/routes
   `store-beelal-fnb-pwa.arh-homelab.workers.dev` (check custom domains /
   routes, not just project names — a `beelal-coffee` project could have a
   custom route mapped to that exact hostname).
3. Check that project's **Git integration** settings: which GitHub
   repo + branch does it build from?

- If it builds from **`arhsmoque/arh-fnb-webapp` branch `store/beelal`**
  (the old fleet repo) → **Path A** below.
- If it builds from **`arhsmoque2/ARH-FNB-Beelal-Coffee` branch `main`**
  (this repo, already has the merged PR) → **Path B** below — you're
  already done, just verify the deploy actually ran.

If you can't tell from the dashboard alone, `wrangler pages deployment list`
or `wrangler deployments list` (depending on Workers vs Pages) against each
candidate project name will show recent deploy sources.

---

## Path A — Old repo (`arhsmoque/arh-fnb-webapp`) is still live

The merge into `arhsmoque2/ARH-FNB-Beelal-Coffee` has **not** reached
production. Port the same change into the old repo so the live URL picks it
up on its next auto-deploy, with no Cloudflare reconfiguration needed (the
whole point of doing it this way — the URL doesn't move).

### A1. Get the old repo locally

```bash
git clone https://github.com/arhsmoque/arh-fnb-webapp.git
cd arh-fnb-webapp
git checkout store/beelal
git checkout -b feature/qr-payment-flow   # or whatever branch convention this repo uses
```

### A2. Check the file layout matches

The old repo is a **shared multi-store fleet template** (branch-per-store),
so its file layout may differ from this standalone repo's flat structure.
Before applying anything, confirm:

- Does it have `config.js`, `index-v2.html` (or `v2/index.html`?),
  `admin.html` at the same relative paths?
- Does its `index-v2.html` have the same `sendOrder()` / `cartSheet` /
  `fbGet`/`fbSet`/`fbPut` structure as described below? (It should — this
  standalone repo was forked from `store/beelal` on 2026-08-22, so unless
  the old branch has since diverged, the structure should match closely.)

If the paths differ, the diff below (Step A3) may need adjusting by hand —
it's written against this repo's flat layout (`config.js`, `index-v2.html`,
`admin.html` all at repo root).

### A3. Apply the diff

The full diff is saved in this repo at
**`/tmp/claude-0/-home-user/7e71b9ac-342c-59b5-928c-44667716d71d/scratchpad/qr-payment.diff`**
in the sandbox that produced this handoff (won't survive the sandbox — see
"Getting the diff" below for a durable source). It touches exactly three
files:

- `config.js` — adds a `payment` config block (methods, bank fields,
  `qr_image_url`) as a fallback default.
- `index-v2.html` — customer-facing: replaces the single "Send WhatsApp
  order" button with a Cash/QR method picker, adds a new QR Pay sheet
  (shows store QR + amount + ref, "I've Paid" writes the order and polls
  Firebase for confirmation).
- `admin.html` — owner-facing: adds a Payment Settings card (QR upload +
  bank fields) to the Store tab, and payment-status badges +
  Confirm/Reject buttons to the Orders tab.

**Getting the diff, durably:** don't rely on the sandbox scratch path above
— instead pull it straight from GitHub, which is permanent:

```bash
# From inside the old repo, on your new branch:
curl -sL https://github.com/arhsmoque2/ARH-FNB-Beelal-Coffee/commit/e10e36fe1785d1c1245ff5e61b9423c6c45ea005.diff \
  -o /tmp/qr-payment.diff
git apply --3way /tmp/qr-payment.diff
```

If `git apply` fails because the old repo's files have diverged (different
line numbers/content since the 2026-08-22 fork), don't force it — open both
files side by side and port the _logic_ by hand instead:

- The full before/after is also viewable directly at
  https://github.com/arhsmoque2/ARH-FNB-Beelal-Coffee/commit/e10e36fe1785d1c1245ff5e61b9423c6c45ea005
  (or `git show e10e36f` against a clone of the new repo, which will always
  work since that repo isn't going anywhere).
- Every function added is new (`openQrPay`, `closeQrPay`,
  `confirmQrPayment`, `startQrPayStatusPoll`, `handleQrPaySheetBackdrop` in
  `index-v2.html`; `loadPaymentSettings`, `savePaymentSettings`,
  `handleQrImageUpload`, `confirmOrderPayment`, `rejectOrderPayment` in
  `admin.html`) — none of it modifies existing logic except:
  - `sendOrder()` gained two new fields on `orderPayload`
    (`payment_method: 'cash'`, `payment_status: 'cash_pending'`) — safe to
    add even if surrounding code differs.
  - `updateCart()`'s old line
    `document.getElementById("sendBtn").disabled = ...` is replaced with
    two lines disabling `payCashBtn`/`payQrBtn` instead — **only relevant
    if the old repo also renames/removes the `sendBtn` id** as part of
    porting the new button markup. If you keep `sendBtn` for some other
    reason, don't blindly delete that line.
  - `loadOrders()` in `admin.html` changed `Object.values(snap)` to
    `Object.entries(snap).map(([id, o]) => ({ id, ...o }))` — needed so
    each order carries its Firebase key for the new Confirm/Reject
    buttons. If the old repo's `loadOrders()` already does this
    differently, adapt rather than overwrite.

### A4. Validate before pushing

```bash
node -e "
const fs = require('fs');
['index-v2.html','admin.html'].forEach(f => {
  const html = fs.readFileSync(f,'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
  scripts.forEach((s,i) => { try { new Function(s); } catch(e) { console.log(f, i, e.message); } });
});
console.log('done');
"
```

If the old repo has its own quality-gate script (check for something like
`_qa/*.mjs` or a `package.json` test script), run that too.

### A5. Push and verify the live deploy

```bash
git push -u origin feature/qr-payment-flow
# open a PR against store/beelal in the old repo, or push directly to
# store/beelal if that's this repo's convention — follow whatever the old
# repo's own contributing norms are, this handoff doesn't know them.
```

Once merged/pushed to whatever branch that CF project auto-deploys from,
the live URL updates **with zero Cloudflare reconfiguration** — that's the
whole point of porting into the existing deploy path instead of cutting
over.

Then run the testing checklist in Step B below.

---

## Path B — New repo (`arhsmoque2/ARH-FNB-Beelal-Coffee`) is already live

Nothing to port — PR #4 is already merged into the branch that's live.
Just confirm the deploy actually happened:

1. Check Cloudflare dashboard → the `beelal-coffee` (or whatever it's
   named) project's deployment history — is there a deploy for commit
   `c435cd2` (or later)?
2. If Git-integration auto-deploy is set up, it should already be there.
   If not (manual deploys only), run `wrangler deploy` from a checkout of
   this repo's `main`.
3. Run the testing checklist below against the live URL.

---

## Testing checklist (either path)

Once the feature is live at the real customer-facing URL:

- [ ] Open the storefront, add an item to cart, open the cart sheet — see
      two buttons: "Pay Cash" and "Pay by QR" (not the old single "Send
      WhatsApp order" button).
- [ ] **Pay Cash** still opens WhatsApp with the order text as before
      (unchanged behavior) — and the order lands in Firebase
      `orders/{id}` with `payment_method: "cash"`,
      `payment_status: "cash_pending"`.
- [ ] **Pay by QR** with no QR image configured yet → shows the "QR not
      set up yet — message us on WhatsApp" fallback (not a broken/blank
      box).
- [ ] In `admin.html` → Store tab → Payment Settings: upload a QR image,
      fill bank fields, Save. Confirm it round-trips (reload the admin
      page, the QR preview and fields should still be populated).
- [ ] Back on the storefront (hard refresh), **Pay by QR** now shows the
      uploaded QR image, the order total, and a reference code.
- [ ] Tap "I've Paid" → order lands in Firebase with
      `payment_method: "qr"`, `payment_status: "awaiting_confirmation"`,
      `payment_ref` set — and the screen switches to an "Awaiting
      confirmation" view.
- [ ] In `admin.html` → Orders tab: the new order shows an orange "QR ·
      Awaiting" badge, the ref, and Confirm/Reject buttons.
- [ ] Tap **Confirm** in admin → within ~10s the customer's still-open
      "Awaiting confirmation" screen flips to "✅ Order Confirmed!"
      (live poll, no page reload needed).
- [ ] Repeat with **Reject** on a fresh test order → customer screen
      flips to "⚠️ Payment Not Verified".
- [ ] Confirm the Cloudflare Firebase security rules actually allow these
      writes in production (per `handoff.md` §3 item 6 — rules were never
      confirmed/audited; if `config/payment_settings` or the new
      `orders/*/payment_status` writes are blocked by rules, this whole
      feature silently no-ops on the live site even though it works from
      an unauthenticated read/write test).

---

## What this sandbox session could not do

Same constraints as `handoff.md` §4 — no Cloudflare API token, no Firebase
service-account access, no access to the `arhsmoque/arh-fnb-webapp` GitHub
owner/repo. Everything above is written from reading this repo's own
`AGENTS.md`/`handoff.md` plus the merged diff — it has not been verified
against the actual live deployment. Treat Step 0 as mandatory, not
optional, before doing anything else.
