# AGENTS.md — Beelal Coffee Standalone Storefront

Context file for AI agents. Read this before making any changes to this repo.

> **Standalone Repo** — `ARH-FNB-Beelal-Coffee` on `arhsmoque2`. Forked from
> `ARH-FNB-Webapp:store/beelal` on 2026-08-22. Not governed by the shared fleet sync.

---

## Store Identity

**Beelal Coffee** is a small Malaysian coffee shop specialising in medium dark roast 100% Arabica espresso-based drinks, baguette and club sandwiches, pasta, and western-style mains.

| Field | Value |
|---|---|
| Store name | Beelal Coffee |
| Concept | Specialty coffee + light food + pasta |
| Phone (WhatsApp) | 60122203743 |
| Hours | 8:00 AM – 10:00 PM daily |
| Currency | RM |
| Language | en-MY (Malay / English mix) |

---

## Infrastructure

| Field | Value |
|---|---|
| Repo | `https://github.com/arhsmoque2/ARH-FNB-Beelal-Coffee` |
| Branch | `main` (was `store/beelal` in `ARH-FNB-Webapp`) |
| Live URL | `https://store-beelal-fnb-pwa.arh-homelab.workers.dev` |
| CF project | `beelal-coffee` (standalone, previously `fnb-pwa`) |
| Firebase root | `beelal_coffee` |
| Firebase URL | `https://ash-2026-photobook-default-rtdb.asia-southeast1.firebasedatabase.app` |

---

## Menu Structure

| Category | ID | Items | Notes |
|---|---|---|---|
| Coffee | `coffee` | 12 | HOT / COLD / FRAPPÉ, type: drinks |
| Non-Coffee | `noncoffee` | 9 | HOT / COLD / FRAPPÉ, type: drinks |
| Food | `food` | 13 | Baguettes, club sandwiches, appetizers; showAddons: true |
| Pasta | `pasta` | 9 | Fixed price |
| Special | `special` | 6 | Chicken chop, fish & chips, tenders |
| Friday | `friday` | 2 | Basmati rice specials, Friday only |

**Size legend:** `['HOT 8oz', 'COLD 12oz', 'FRAPPÉ 16oz', 'LARGE +RM4']`

**Food add-ons:**
- Extra Double Shot — RM 4
- Extra Cheese — RM 2

---

## Live Storefront

**`index-v2.html` is the confirmed live, customer-facing storefront** (`index.html` is only a
redirect shim to it). Confirmed 2026-08-22. `index-legacy.html` was an older, superseded build
and has been deleted from the repo — do not recreate it or resurrect its logic without asking.

## Agent Rules

1. **Edit `config.js` only** for store-specific/branding changes. `index-v2.html`, `index.html`,
   and `admin.html` are the shared engine — never edit them for branding, only for actual
   engine bugfixes or features (with care — `index-v2.html` is production, writes real orders).
2. **Firebase is the live source of truth.** `defaultMenu` in `config.js` is a seed used only if Firebase has no data yet. Editing it does not change what live customers see — the owner must do a Dev tab → Master Snapshot to re-seed.
3. **Never change `firebase.root`.** Changing it would orphan all live data.
4. **Never change `firebase.url`.** Shared DB — no new Firebase project needed.
5. **`wrangler.jsonc`'s CF project name is `beelal-coffee`** (standalone; the old `fnb-pwa`
   shared-fleet project no longer applies here). Note: `worker.js` expects an `MEDIA_BUCKET` R2
   binding that isn't currently declared in `wrangler.jsonc` — see `handoff.md`.
6. **`main` is the live deploy branch.** This is a standalone repo, not a branch of the shared
   fleet template — push feature branches and open PRs against `main` as normal.
7. **Phone number is real.** Do not replace `60122203743` with a placeholder.
8. When adding new menu items, continue the ID sequence (`c13`, `n10`, `f14`, etc.).
9. **`config.js`'s `billing.secret` is a known issue**, not a pattern to copy — it's a live
   secret shipped client-side and needs rotating server-side. See `handoff.md`.
