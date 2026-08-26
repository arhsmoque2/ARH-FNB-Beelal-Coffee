# ADR-001: Standalone Repository Migration, Single-Worker Cutover, and On-Demand Live Healthcheckª**Status**: Accepted  
**Date**: 2026-08-27  
**Deciders**: System Operator, Antigravity AI  
**Repository**: [arhsmoque2/ARH-FNB-Beelal-Coffee](https://github.com/arhsmoque2/ARH-FNB-Beelal-Coffee)  

---

## 1. Context & Problem Statement

Beelal Coffee originated as a branch (`store/beelal`) within the multi-tenant shared fleet repository (`arhsmoque/ARH-FNB-Webapp`). Under the legacy fleet setup:
1. Deployments relied on multi-branch preview builds of a shared Cloudflare Worker (`fnb-pwa`), producing the URL` https://store-beelal-fnb-pwa.arh-homelab.workers.dev`.
2. Shared secrets (`BILLING_SECRET`) and configuration leaked into client-side JS bundles.
3. Quality gates were coupled to fleet-wide schemas that did not reflect Beelal's standalone evolution.
4. Live verification required manual browser probing without an automated CI/CD safety net.

We required a complete migration to a decoupled single-tenant repository (`arhsmoque2/ARH-FNB-Beelal-Coffee`) on the `arhsmoque2` account while preserving the exact customer-facing URL, preventing duplicate branch builds, and providing on-demand post-deployment verification for autonomous cloud agents.

---

## 2. Decision & Architecture

### 2.1. Standalone Single-Tenant Deployment
* Set project name in `wrangler.jsonc` to `"name": "store-beelal-fnb-pwa"`.
* Configure Cloudflare Workers to deploy the `main` branch of `arhsmoque2/ARH-FNB-Beelal-Coffee` directly to `https://store-beelal-fnb-pwa.arh-homelab.workers.dev`.
* Bound dedicated R2 bucket `arh-fnb-beelal-media` to `MEDIA_BUCKET`.

### 2.2. Secrets Management & Decoupling
* Extracted all production secrets from the canonical ARH SOPS vault (`sops/cloudflare.enc.yaml` and `sops/beelal.enc.yaml`+).
* Provisioned repository secrets onto GitHub Actions: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_API_KEY`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_ACCOUNT_EMAIL`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `BILLING_SECRET`, and `UPLOAD_SECRET`.
* Set server-side worker sectets (`BILLING_SECRET`, `UPLOAD_SECRET`) on Cloudflare Worker `store-beelal-fnb-pwa`.
* Client-side `config.js` no longer stores secrets in plain text.

### 2.3. Legacy Fleet Retirement & Tooling Preservation
* Deleted `store/beelal` local and remote branches on `arhsmoque/ARH-FNB-Webapp` to prevent race conditions or duplicate deployments.
* Deleted the legacy `beelal-coffee` worker project on Cloudflare.
* Migrated the shared `billing-ledger/` service into `arhsmoque2/ARH-FNB-Beelal-Coffee` and removed it from legacy `main`.

### 2.4. Two-Tier Automated Quality Gate & On-Demand CI
1. **Pre-Deploy UI/UX Quality Gate** (`_qa/beelal-ui-ux-quality-gate.mjs`):
   * Validates syntax, mobile touch target sizes (44px min), HTML5 accessibility, cart steppers, and UEQ 6-dimension UX invariants.
2. **Post-Deploy Live Healthcheck** (`_qa/beelal-live-healthcheck.mjs`):
   * Probes all deployed routes (`/`, `/index-v2.html`, `/admin.html`, `/config.js`, `/observatory.html`, `/guide.html`, `/dev-console.html`).
   * Verifies Firebase RTDB connectivity directly (`ash-2026-photobook`, `beelal_coffee`).
3. **On-Demand Workflow** (`.github/workflows/live-healthcheck.yml`):
   * Enables cloud agents and operators to trigger live audits via `gh workflow run live-healthcheck.yml`.

---

## 3. Consequences & Verification

### Positive
* Zero downtime cutover with continuous customer URL preservation.
* Automated CI/CD deployment on push to `main` with static + live health verification.
* Full autonomy for cloud agents to trigger and verify health checks on demand.
* Complete isolation from legacy fleet drift.

### Verification Receipts
* `_qa/beelal-ui-ux-quality-gate.mjs` passed with 0 errors.
* `_qa/beelal-live-healthcheck.mjs` passed against `https://store-beelal-fnb-pwa.arh-homelab.workers.dev` with all 200 OK responses.
* GitHub Actions workflow run `32988122269` completed in 7s with Green status.
