# Firebase RTDB Security Architecture & Worker Data Boundary

## 1. Context & Multi-Tenant Instance Sharing

The Firebase Realtime Database instance `ash-2026-photobook-default-rtdb` is a shared infrastructure component hosting multiple applications across the ARH ecosystem:

- `beelal_coffee` (Production PWA Storefront & Admin Portal)
- `beelal_testing`
- `chef_luq`
- `kedai_nina`
- `escape_bayview_homestay`
- `duit_raya_2026`
- `mission_hq`
- `therizz`

Because multiple apps share the same root database instance, **security rules must never apply generic wildcard rules at the database root (`/`)**. Doing so would break sibling services or cause security regressions across unrelated projects.

---

## 2. Worker Data Boundary Architecture

To safeguard customer personal data (phone numbers, names, addresses) and privileged credentials (admin PINs, developer configuration), all privileged read and write operations are isolated behind the Cloudflare Worker boundary:

```mermaid
flowchart TD
    subgraph Clients["Client Tier (Storefront & Admin)"]
        Customer["Customer (index-v2.html)"]
        Admin["Admin Portal (admin.html)"]
    end

    subgraph Edge["Cloudflare Worker (store-beelal-fnb-pwa)"]
        AuthVerify["POST /api/admin/verify-pin (HMAC Session Token)"]
        OrderDispatch["POST /api/order (Validation & Billing Ingestion)"]
        OrderStatus["GET /api/order/status/:id (Edge Status Polling)"]
        AdminOrders["GET /api/admin/orders (Bearer Protected)"]
        AdminStatus["POST /api/admin/order/update-status (Status Mutation)"]
    end

    subgraph Storage["Shared State Tier"]
        RTDB["Firebase RTDB (Scoped beelal_coffee Node)"]
        Billing["D1 Billing Ledger"]
    end

    Customer -->|POST /api/order| OrderDispatch
    Customer -->|GET /api/order/status/:id| OrderStatus
    Admin -->|POST /api/admin/verify-pin| AuthVerify
    Admin -->|Bearer Token Requests| AdminOrders
    Admin -->|Status Update| AdminStatus

    OrderDispatch -->|Persist Order| RTDB
    OrderDispatch -->|Record Event| Billing
    AdminOrders -->|Fetch Orders| RTDB
    AdminStatus -->|Update Status & Confirmation Audit| RTDB
    OrderStatus -->|Read Order Status| RTDB

    Customer -.->|Public Read Only (menu, theme, config/store)| RTDB
```

---

## 3. Scoped Security Rules (`firebase.rules.json`)

The rules scoped under `beelal_coffee` enforce strict zero-trust boundaries:

1. **Public Read Nodes**:
   - `menu`: Menu categories and items.
   - `config/store`: Store hours, phone, address, slogans.
   - `config/theme` & `config/theme_master`: Active CSS custom property tokens.
   - `config/payment_settings`: Bank and QR metadata (publicly required for customer checkout).
   - `meta`: Application metadata and version release tracking.

2. **Locked Nodes (`.read: false, .write: false`)**:
   - `orders`: Contains customer personal data, phone numbers, and order histories. Accessible exclusively via the Worker API.
   - `feedback`: Customer feedback and internal owner-to-developer messages.
   - `config/pins`: Permanent lockdown. PIN authentication is handled server-side.
   - `config/dev`: Privileged developer prompts and runtime model preferences.

3. **Telemetry & Error Logging**:
   - `error_log` and `telemetry`: Client error reporting allows write (`.write: true`) for diagnostics but forbids anonymous reads (`.read: false`).

---

## 4. Admin Authentication & Session Management

- **Endpoint**: `POST /api/admin/verify-pin`
- **Mechanism**: The Worker validates 4-digit PINs against server-side environment secrets (`ADMIN_DEV_PIN` and `ADMIN_OWNER_PIN`).
- **Token Generation**: Upon successful verification, the Worker issues a cryptographic HMAC-SHA256 signed session token (`payload.sig`) valid for 24 hours.
- **Session Protection**: Subsequent admin requests (`GET /api/admin/orders`, `POST /api/admin/order/update-status`) validate the session token via `Authorization: Bearer <token>` or `x-admin-token`.
