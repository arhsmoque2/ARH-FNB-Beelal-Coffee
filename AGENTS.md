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

## Agent Rules

1. **Edit `config.js` only.** `index.html` and `admin.html` are the shared engine — never edit them for store-specific changes.
2. **Firebase is the live source of truth.** `defaultMenu` in `config.js` is a seed used only if Firebase has no data yet. Editing it does not change what live customers see — the owner must do a Dev tab → Master Snapshot to re-seed.
3. **Never change `firebase.root`.** Changing it would orphan all live data.
4. **Never change `firebase.url`.** Shared DB — no new Firebase project needed.
5. **`wrangler.jsonc` is already correct** (`fnb-pwa`). Do not touch it.
6. **This branch is never merged to `main`.** It is a deployment artifact. Do not open PRs against main.
7. **Phone number is real.** Do not replace `60122203743` with a placeholder.
8. When adding new menu items, continue the ID sequence (`c13`, `n10`, `f14`, etc.).
