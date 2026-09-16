# ARH F&B Beelal Coffee — Test Coverage Gap Audit

**Generated**: 2026-08-28  
**Advisor**: `arh-test-coverage-advisor` v1.0.0  
**Run**: Second pass — event flow & business logic deep audit

---

## Coverage Achieved (After Gap Implementation)

| File                          | Statements | Branches   | Functions  | Lines      |
| ----------------------------- | ---------- | ---------- | ---------- | ---------- |
| `worker.js`                   | 80.41%     | 80.92%     | 83.33%     | 81.60%     |
| `billing-ledger/src/index.js` | **100%**   | 85.86%     | **100%**   | **100%**   |
| **Combined**                  | **87.50%** | **82.78%** | **93.75%** | **88.61%** |

**Enforced thresholds** (locked into `vitest.config.js`):

- Lines: ≥ 80% | Functions: ≥ 85% | Branches: ≥ 75% | Statements: ≥ 80%

---

## Risk Tier Classification

### Tier 1 — Mission Critical

| File                          | Function                         | Fan-In                      | Status              |
| ----------------------------- | -------------------------------- | --------------------------- | ------------------- |
| `billing-ledger/src/index.js` | `handleRecordOrder`              | High (PWA → billing → D1)   | ✅ **100% covered** |
| `billing-ledger/src/index.js` | `recordOrderEvent` + `sha256Hex` | Core audit trail            | ✅ **100% covered** |
| `billing-ledger/src/index.js` | `regenerateMonthlyUsage`         | Financial aggregation       | ✅ **100% covered** |
| `worker.js`                   | `handleBillingProxy`             | All order event entry point | ✅ **100% covered** |

### Tier 2 — Core Business Logic

| File                          | Function                | Gaps Filled This Pass                                   |
| ----------------------------- | ----------------------- | ------------------------------------------------------- |
| `worker.js`                   | `handleReceiptUpload`   | ✅ JPEG/PDF success, MIME 415, missing field 400        |
| `worker.js`                   | `handleVideoUpload`     | ✅ MP4/WebM success, wrong MIME 415, size 413, auth 401 |
| `worker.js`                   | `handleImageUpload`     | ✅ PNG/JPEG success, disallowed type 415, size 413      |
| `worker.js`                   | `serveMedia`            | ✅ Cache HIT, cache MISS+R2 found, receipt expiry 410   |
| `worker.js`                   | `deleteExpiredReceipts` | ✅ Skip valid, delete expired, paginated cursor         |
| `billing-ledger/src/index.js` | `handleUsage`           | ✅ Auth, URL validation, unknown store, success         |
| `billing-ledger/src/index.js` | `handleLedger`          | ✅ Auth, URL validation, limit cap, pagination          |

### Tier 4 — Remaining Gaps (Acceptable)

| File                          | Lines              | Reason                                                                                                                                                          |
| ----------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `worker.js`                   | 301, 316, 361, 376 | `formData()` parse-error throw paths — only reachable with a broken multipart stream, not constructable in Node's WHATWG FormData. Runtime-only edge behaviour. |
| `billing-ledger/src/index.js` | 131, 385, 398, 423 | Branch arms inside the `envelope()` 403-path conditional (CORS-off variant) — exercised indirectly but V8 branch tracking splits on the ternary.                |

---

## Event Flow Tests Added (Second Pass — 44 new tests)

### `worker.js` — 38 tests total (was 10)

| Describe Block                 | Tests                                                                                     |
| ------------------------------ | ----------------------------------------------------------------------------------------- |
| Router — security & middleware | 4                                                                                         |
| Disabled Gemini Parser         | 1                                                                                         |
| Billing Proxy                  | 5 (added: upstream 502 non-OK, success 200)                                               |
| Receipt Upload                 | 5 (new: success JPEG, success PDF, MIME 415, missing field)                               |
| Video Upload                   | 7 (new: valid secret, content-length 413, missing field, MIME 415, MP4 success, WebM ext) |
| Image Upload                   | 5 (new: PNG success, JPEG ext fallback, MIME 415, content-length 413, missing field)      |
| Media Serving                  | 6 (new: cache HIT, cache MISS+R2, receipt expiry 410, private cache-control)              |
| Scheduled cron                 | 3 (new: expired deletion, valid skip, paginated cursor)                                   |

### `billing-ledger/src/index.js` — 23 tests total (was 7)

| Describe Block          | Tests                                                                      |
| ----------------------- | -------------------------------------------------------------------------- |
| Router & OPTIONS        | 2                                                                          |
| GET /health             | 2 (new: D1 failure path)                                                   |
| POST /record-order      | 6 (new: JSON error, missing fields, unknown store, success+hash, DB error) |
| GET /stores             | 2                                                                          |
| GET /usage/:slug/:month | 4 (new: URL error, unknown store, success with data)                       |
| GET /ledger/:slug       | 4 (new: URL error, unknown store, success, limit cap)                      |
| Utility — envelope      | 1 (trace_id format + schema_version)                                       |
| FEE_PER_ORDER_CENTS     | 1 (fee math: 3 × 100 = 300)                                                |
