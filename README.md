# Beelal Coffee — Standalone Storefront

A zero-dependency menu PWA for Beelal Coffee (Malaysian specialty coffee + light food).
Vanilla HTML/CSS/JS + Firebase Realtime Database + Cloudflare Workers. No build step, no
package manager, no CI.

> Forked from the shared `ARH-FNB-Webapp` multi-store template (`store/beelal` branch) into
> this standalone repo on 2026-08-22. It is **not** governed by the shared fleet sync anymore
> — see `AGENTS.md` for the store-specific contract agents must follow.

## Live Deployment

| | |
|---|---|
| CF project | `beelal-coffee` |
| Live URL | `https://store-beelal-fnb-pwa.arh-homelab.workers.dev` |
| Deploy trigger | Push to `main` — Cloudflare Workers builds automatically (Workers Assets, see `wrangler.jsonc`) |

## Live Storefront

`index.html` redirects to **`index-v2.html`**, which is the confirmed live, customer-facing
storefront (confirmed 2026-08-22). An older parallel build, `index-legacy.html`, has been
removed from the repo — `journal.md` predates that confirmation and still refers to it as the
live app; treat this README and `AGENTS.md` as current over that older note.

## Files

| File | Purpose |
|---|---|
| `config.js` | The only file store owners edit — all business/branding settings (menu, theme, contact, Firebase namespace) |
| `index.html` | Redirect shim → `index-v2.html` |
| `index-v2.html` | **Live storefront** — customer-facing menu, cart, checkout |
| `admin.html` | Owner/developer admin panel |
| `dev-console.html` | Developer diagnostics console |
| `observatory.html` | Client-side error log viewer |
| `guide.html` | Owner reference guide (Malay) |
| `worker.js` | Cloudflare Worker — R2-backed media upload/serve routes, falls through to static assets otherwise |
| `wrangler.jsonc` | Cloudflare Workers project config for this deployment |
| `migrate-photos.js` | One-off Firebase photo migration script |
| `_qa/beelal-ui-ux-quality-gate.mjs` | Static HTML quality gate — run with `node _qa/beelal-ui-ux-quality-gate.mjs` before pushing UI changes |

## Infrastructure

### Cloudflare Workers
- **Project:** `beelal-coffee`, serves static assets from repo root plus the upload/media
  routes in `worker.js`.
- **Required secret:** `UPLOAD_SECRET` (set via `wrangler secret put UPLOAD_SECRET`) — gates
  `/api/upload/video` and `/api/upload/image`.
- **Required R2 binding:** `MEDIA_BUCKET`, expected by `worker.js` for `/api/upload/*` and
  `/media/*`. **Not currently declared in `wrangler.jsonc`** — those routes will fail until
  the binding is added there (or confirmed to already exist via the CF dashboard).

### Firebase Realtime Database
- **URL:** `https://ash-2026-photobook-default-rtdb.asia-southeast1.firebasedatabase.app`
  (shared instance — do not create a new project)
- **Root:** `beelal_coffee` — never change this; it would orphan all live order/menu data.
- `defaultMenu` in `config.js` is only a seed used if Firebase has no data yet; editing it
  does not change what live customers see.

### Billing
- `config.js` → `billing.workerUrl` points at `fnb-billing-ledger.arh-homelab.workers.dev`.
- ⚠️ `billing.secret` in `config.js` is currently a plaintext shared secret shipped in the
  public client bundle. This needs to move server-side (checked inside a Worker via
  `wrangler secret put`, the same pattern `worker.js` already uses for `UPLOAD_SECRET`) and
  be rotated. See `handoff.md`.

## config.js Schema

`config.js` is the sole adapter between the shared engine (`index.html`/`admin.html`) and
this store. See the inline comments in the file itself — every field is documented there.

## Quality Gate

```bash
node _qa/beelal-ui-ux-quality-gate.mjs
```

Checks (against `index-v2.html`, plus `index.html`/`admin.html` for syntax balance):
1. `<script>`/`<style>` tag balance across all HTML entrypoints
2. Mobile viewport, floating-cart positioning, touch-target CSS
3. Basic a11y (Escape handlers, aria-labels, accessible form inputs, reduced-motion)
4. F&B UX contract (UEQ 6-dimension smoke checks: efficiency, attractiveness, dependability,
   perspicuity, stimulation, novelty)
5. Required cart JS functions present + cart math invariants

This is a static string/regex check on the HTML source, not an execution/DOM test — it will
not catch logic regressions that don't change a function's presence. There is no CI wired up
to run it automatically; run it manually before pushing UI changes.

## Recovery

| Problem | Fix |
|---|---|
| Owner forgot PIN | Dev PIN → Security tab → reset Owner PIN |
| Theme broken | Dev PIN → AI Studio → Factory Reset |
| Redeploy needed | Push any commit to `main` |
| Debug errors | Dev PIN → Dev tab → Error Log, or `observatory.html` |

## Architecture

- **No build system** — vanilla HTML/CSS/JS, static files served directly, no `package.json`.
- **Firebase Realtime Database** — menu, theme, config, orders, PINs; namespaced under
  `beelal_coffee`.
- **Cloudflare Workers** — serves static files + the upload/media API in `worker.js`.
- **WhatsApp** — order delivery via `wa.me` deep link, no payment integration yet (see
  `journal.md` §6 / `handoff.md` for the designed-but-unimplemented payment flow).
