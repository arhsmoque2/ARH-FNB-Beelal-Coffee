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
| Branch | `main` (production deployment branch) |
| Live URL | `https://store-beelal-fnb-pwa.arh-homelab.workers.dev` |
| CF project | `store-beelal-fnb-pwa` (standalone Cloudflare Workers project) |
| R2 Bucket | `arh-fnb-beelal-media` (`MEDIA_BUCKET` binding) |
| Firebase root | `beelal_coffee` |
| Firebase URL | `https://ash-2026-photobook-default-rtdb.asia-southeast1.firebasedatabase.app` |
| ADR | [`adr/ADR-001`](file:///D:/ARH-GITHUB/arhsmoque2/ARH-FNB-Beelal-Coffee/adr/ADR-001-standalone-repo-cutover-and-live-healthcheck.md), [`adr/ADR-002`](file:///D:/ARH-GITHUB/arhsmoque2/ARH-FNB-Beelal-Coffee/adr/ADR-002-modern-ui-architecture-and-agent-preview-studio.md) |

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

## Quality Gates & Verification Commands

Always run these commands to verify code changes before committing and after deploying:

### 1. Unified Quality Gate Suite (Oxlint + UI/UX Gate + Playwright Layout Auditor + Infrastructure Doctor)
```powershell
npm run check
```
* Runs automatically in GitHub Actions on all Pull Requests targeting `main` (`.github/workflows/ci.yml`), which
  serves the PR's own checkout on `localhost` and points the layout auditor at it via `TARGET_URL` — so it audits
  what the PR is about to ship, not whatever is already live in production.

Or run individual sub-gates:
* **High-Speed Linting (Oxlint)**: `npm run lint` (or `npx oxlint`)
* **Mobile & UX Invariants (ARH DevKit)**: `npm run check:ui` (or `node _qa/beelal-ui-ux-quality-gate.mjs`)
* **Playwright Layout & Overlap Auditor**: `npm run check:layout` (or `node _qa/beelal-layout-audit.mjs`)
* **Infrastructure Doctor (Cloudflare, D1 & RTDB)**: `npm run check:infra` (or `node _qa/infra-doctor.mjs`)
* **Ephemeral Preview Studio Generator**: `npm run preview:generate` (or `node _qa/preview-generator.mjs`)

### 2. Post-Deploy Live Healthcheck (Live Web & Firebase RTDB)
Probes all deployed endpoints (`/`, `/index-v2.html`, `/admin.html`, `/config.js`, `/observatory.html`, `/guide.html`, `/dev-console.html`) and validates direct Firebase RTDB connectivity:
```powershell
# Run against default live site
npm run check:live

# Or pass a custom preview URL
node _qa/beelal-live-healthcheck.mjs "https://store-beelal-fnb-pwa.arh-homelab.workers.dev"
```

### 3. Trigger On-Demand CI / Remote Workflows
Cloud agents and operators can trigger GitHub Actions workflows via `gh`:
```powershell
# Trigger pre-merge quality gate manually
gh workflow run ci.yml --repo arhsmoque2/ARH-FNB-Beelal-Coffee

# Trigger on-demand Playwright visual/layout audit in GitHub Actions
gh workflow run playwright-ondemand.yml --repo arhsmoque2/ARH-FNB-Beelal-Coffee

# Trigger live healthcheck probe manually
gh workflow run live-healthcheck.yml --repo arhsmoque2/ARH-FNB-Beelal-Coffee

# Watch run status
gh run list --repo arhsmoque2/ARH-FNB-Beelal-Coffee --limit 5
```

---

## Agent Rules

1. **Edit `config.js` only** for store-specific/branding changes. `index-v2.html`, `index.html`,
   and `admin.html` are the shared engine — never edit them for branding, only for actual
   engine bugfixes or features (with care — `index-v2.html` is production, writes real orders).
2. **Firebase is the live source of truth.** `defaultMenu` in `config.js` is a seed used only if Firebase has no data yet. Editing it does not change what live customers see — the owner must do a Dev tab → Master Snapshot to re-seed.
3. **Never change `firebase.root`.** Changing it would orphan all live data.
4. **Never change `firebase.url`.** Shared DB — no new Firebase project needed.
5. **`wrangler.jsonc`'s CF project name is `store-beelal-fnb-pwa`** (standalone project serving `https://store-beelal-fnb-pwa.arh-homelab.workers.dev`).
6. **`main` is the live deploy branch.** Push feature branches and open PRs against `main`. Pushing to `main` auto-triggers the deployment pipeline (`.github/workflows/deploy.yml`).
7. **Phone number is real.** Do not replace `60122203743` with a placeholder.
8. When adding new menu items, continue the ID sequence (`c13`, `n10`, `f14`, etc.).
9. **Secrets are managed server-side**: `BILLING_SECRET` and `UPLOAD_SECRET` are provisioned as Cloudflare Worker secrets and GitHub repository secrets via the ARH SOPS vault (`sops/cloudflare.enc.yaml` & `sops/beelal.enc.yaml`). Never commit plain text secrets into `config.js`.
10. **Run Quality Gates**: Always run `node _qa/beelal-ui-ux-quality-gate.mjs` before pushing and `node _qa/beelal-live-healthcheck.mjs` after deploying.
