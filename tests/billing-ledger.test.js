import { describe, it, expect, vi } from "vitest";
import ledgerWorker, {
  computeDailyRollup,
  dateFromTimestamp,
  formatCents
} from "../billing-ledger/src/index.js";

// ── Mock factory ──────────────────────────────────────────────────────────────

function makeDb(overrides = {}) {
  const base = {
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue(null),
      all: vi.fn().mockResolvedValue({ results: [] }),
      run: vi.fn().mockResolvedValue({ success: true })
    })
  };
  return { ...base, ...overrides };
}

function makeEnv(dbOverride = null, envOverride = {}) {
  return {
    DB: dbOverride || makeDb(),
    FNB_BILLING_SECRET: "valid-secret-token",
    FNB_DEV_ADMIN_TOKEN: "valid-admin-token",
    FEE_PER_ORDER_CENTS: "50",
    ...envOverride
  };
}

function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

// ── Router ────────────────────────────────────────────────────────────────────

describe("Router — OPTIONS preflight & unknown routes", () => {
  it("returns 204 for OPTIONS on any route", async () => {
    const req = new Request("https://ledger.example.com/record-order", { method: "OPTIONS" });
    const res = await ledgerWorker.fetch(req, makeEnv());
    expect(res.status).toBe(204);
  });

  it("returns 500 with not_found for unknown route", async () => {
    const req = new Request("https://ledger.example.com/unknown", { method: "GET" });
    const res = await ledgerWorker.fetch(req, makeEnv());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.errors[0].code).toBe("not_found");
  });
});

// ── Health Check ──────────────────────────────────────────────────────────────

describe("GET /health", () => {
  it("returns success when D1 SELECT 1 resolves", async () => {
    const res = await ledgerWorker.fetch(
      new Request("https://ledger.example.com/health"),
      makeEnv()
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("success");
    expect(body.data.d1_reachable).toBe(true);
  });

  it("returns failure when D1 prepare throws", async () => {
    const brokenDb = {
      prepare: vi.fn().mockReturnValue({
        run: vi.fn().mockRejectedValue(new Error("D1 unavailable"))
      })
    };
    const res = await ledgerWorker.fetch(
      new Request("https://ledger.example.com/health"),
      makeEnv(brokenDb)
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.status).toBe("failure");
    expect(body.data.d1_reachable).toBe(false);
  });
});

// ── POST /record-order ────────────────────────────────────────────────────────

describe("POST /record-order — billing event ingestion", () => {
  it("returns 403 blocked with auth_missing when secret is wrong", async () => {
    const req = new Request("https://ledger.example.com/record-order", {
      method: "POST",
      headers: authHeader("wrong-secret"),
      body: JSON.stringify({ store_slug: "woodfire-kulim" })
    });
    const res = await ledgerWorker.fetch(req, makeEnv());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.status).toBe("blocked");
    expect(body.errors[0].code).toBe("auth_missing");
  });

  it("returns 500 failure with invalid_json when body is malformed", async () => {
    const req = new Request("https://ledger.example.com/record-order", {
      method: "POST",
      headers: { ...authHeader("valid-secret-token"), "Content-Type": "text/plain" },
      body: "not json {{"
    });
    const res = await ledgerWorker.fetch(req, makeEnv());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.errors[0].code).toBe("invalid_json");
  });

  it("returns 500 failure with missing_fields when required keys absent", async () => {
    const req = new Request("https://ledger.example.com/record-order", {
      method: "POST",
      headers: { ...authHeader("valid-secret-token"), "Content-Type": "application/json" },
      body: JSON.stringify({ store_slug: "woodfire-kulim" }) // missing order_id, etc.
    });
    const res = await ledgerWorker.fetch(req, makeEnv());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.errors[0].code).toBe("missing_fields");
    expect(body.errors[0].message).toMatch(/order_id/);
  });

  it("returns 500 failure with unknown_store when store_slug not in D1", async () => {
    // default mockDb.first returns null — store not found
    const req = new Request("https://ledger.example.com/record-order", {
      method: "POST",
      headers: { ...authHeader("valid-secret-token"), "Content-Type": "application/json" },
      body: JSON.stringify({
        store_slug: "nonexistent-store",
        order_id: "ord-404",
        submitted_at: Date.now(),
        order_total_cents: 1000,
        item_count: 1
      })
    });
    const res = await ledgerWorker.fetch(req, makeEnv());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.errors[0].code).toBe("unknown_store");
  });

  it("returns 200 success and records order when store found and D1 write succeeds", async () => {
    const storeRow = { id: 42, slug: "woodfire-kulim" };
    // prepare() is called multiple times — stub sequence
    let callIndex = 0;
    const db = {
      prepare: vi.fn().mockImplementation(() => {
        callIndex++;
        return {
          bind: vi.fn().mockReturnThis(),
          // first() call 1 = getStoreBySlug → returns store
          // first() call 2 = regenerateMonthlyUsage SELECT → returns row
          first: vi.fn().mockImplementation(() => {
            if (callIndex === 1) return Promise.resolve(storeRow);
            return Promise.resolve({ billable_orders: 1, submitted_sales_cents: 1000 });
          }),
          run: vi.fn().mockResolvedValue({ success: true }),
          all: vi.fn().mockResolvedValue({ results: [] })
        };
      })
    };
    const req = new Request("https://ledger.example.com/record-order", {
      method: "POST",
      headers: { ...authHeader("valid-secret-token"), "Content-Type": "application/json" },
      body: JSON.stringify({
        store_slug: "woodfire-kulim",
        order_id: "ord-success-001",
        submitted_at: Date.now(),
        order_total_cents: 2800,
        currency: "RM",
        item_count: 3
      })
    });
    const res = await ledgerWorker.fetch(req, makeEnv(db));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("success");
    expect(body.data.order_id).toBe("ord-success-001");
    expect(typeof body.data.raw_hash).toBe("string");
    expect(body.data.raw_hash).toHaveLength(64); // SHA-256 hex
  });

  it("returns 500 db_error when D1 INSERT throws", async () => {
    const storeRow = { id: 1, slug: "woodfire-kulim" };
    let callCount = 0;
    const db = {
      prepare: vi.fn().mockImplementation(() => {
        callCount++;
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue(callCount === 1 ? storeRow : null),
          run: vi.fn().mockRejectedValue(new Error("D1 write error")),
          all: vi.fn().mockResolvedValue({ results: [] })
        };
      })
    };
    const req = new Request("https://ledger.example.com/record-order", {
      method: "POST",
      headers: { ...authHeader("valid-secret-token"), "Content-Type": "application/json" },
      body: JSON.stringify({
        store_slug: "woodfire-kulim",
        order_id: "ord-fail",
        submitted_at: Date.now(),
        order_total_cents: 500,
        item_count: 1
      })
    });
    const res = await ledgerWorker.fetch(req, makeEnv(db));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.errors[0].code).toBe("db_error");
  });
});

// ── GET /stores ───────────────────────────────────────────────────────────────

describe("GET /stores — admin stores list", () => {
  it("returns 403 blocked without valid admin token", async () => {
    const req = new Request("https://ledger.example.com/stores", {
      method: "GET",
      headers: authHeader("bad-admin")
    });
    const res = await ledgerWorker.fetch(req, makeEnv());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.status).toBe("blocked");
  });

  it("returns 200 with stores list for valid admin token", async () => {
    const req = new Request("https://ledger.example.com/stores", {
      method: "GET",
      headers: authHeader("valid-admin-token")
    });
    const res = await ledgerWorker.fetch(req, makeEnv());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.component).toBe("fnb-billing-ledger.stores");
    expect(Array.isArray(body.data.stores)).toBe(true);
  });
});

// ── GET /usage/:store_slug/:month ─────────────────────────────────────────────

describe("GET /usage/:store_slug/:month — usage data", () => {
  it("returns 403 blocked without valid admin token", async () => {
    const req = new Request("https://ledger.example.com/usage/woodfire-kulim/2026-06", {
      method: "GET",
      headers: authHeader("bad-token")
    });
    const res = await ledgerWorker.fetch(req, makeEnv());
    expect(res.status).toBe(403);
  });

  it("returns 500 failure with url_error when store_slug or month missing from URL", async () => {
    // /usage/ with no slug
    const req = new Request("https://ledger.example.com/usage/", {
      method: "GET",
      headers: authHeader("valid-admin-token")
    });
    const res = await ledgerWorker.fetch(req, makeEnv());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.errors[0].code).toBe("url_error");
  });

  it("returns 500 failure with unknown_store when slug not found", async () => {
    // default db.first returns null
    const req = new Request("https://ledger.example.com/usage/ghost-store/2026-06", {
      method: "GET",
      headers: authHeader("valid-admin-token")
    });
    const res = await ledgerWorker.fetch(req, makeEnv());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.errors[0].code).toBe("unknown_store");
  });

  it("returns 200 success with usage data when store exists", async () => {
    const storeRow = { id: 7, slug: "woodfire-kulim" };
    const usageRow = { billable_orders: 12, submitted_sales_cents: 36000, fee_cents: 600 };
    let callCount = 0;
    const db = {
      prepare: vi.fn().mockImplementation(() => {
        callCount++;
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockImplementation(() => {
            return Promise.resolve(callCount === 1 ? storeRow : usageRow);
          }),
          all: vi.fn().mockResolvedValue({ results: [] }),
          run: vi.fn().mockResolvedValue({})
        };
      })
    };
    const req = new Request("https://ledger.example.com/usage/woodfire-kulim/2026-08", {
      method: "GET",
      headers: authHeader("valid-admin-token")
    });
    const res = await ledgerWorker.fetch(req, makeEnv(db));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("success");
    expect(body.data.store_slug).toBe("woodfire-kulim");
    expect(body.data.month).toBe("2026-08");
  });
});

// ── GET /ledger/:store_slug ───────────────────────────────────────────────────

describe("GET /ledger/:store_slug — order ledger", () => {
  it("returns 403 blocked without valid admin token", async () => {
    const req = new Request("https://ledger.example.com/ledger/woodfire-kulim", {
      method: "GET",
      headers: authHeader("wrong")
    });
    const res = await ledgerWorker.fetch(req, makeEnv());
    expect(res.status).toBe(403);
  });

  it("returns 500 failure with url_error when store_slug missing", async () => {
    const req = new Request("https://ledger.example.com/ledger/", {
      method: "GET",
      headers: authHeader("valid-admin-token")
    });
    const res = await ledgerWorker.fetch(req, makeEnv());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.errors[0].code).toBe("url_error");
  });

  it("returns 500 failure with unknown_store when slug not found", async () => {
    const req = new Request("https://ledger.example.com/ledger/ghost-cafe", {
      method: "GET",
      headers: authHeader("valid-admin-token")
    });
    const res = await ledgerWorker.fetch(req, makeEnv());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.errors[0].code).toBe("unknown_store");
  });

  it("returns 200 success with events list for valid store, respects limit/offset params", async () => {
    const storeRow = { id: 3, slug: "woodfire-kulim" };
    const eventRows = [
      { order_id: "ord-1", order_total_cents: 1200 },
      { order_id: "ord-2", order_total_cents: 800 }
    ];
    let callCount = 0;
    const db = {
      prepare: vi.fn().mockImplementation(() => {
        callCount++;
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue(callCount === 1 ? storeRow : null),
          all: vi.fn().mockResolvedValue({ results: eventRows }),
          run: vi.fn().mockResolvedValue({})
        };
      })
    };
    const req = new Request("https://ledger.example.com/ledger/woodfire-kulim?limit=10&offset=0", {
      method: "GET",
      headers: authHeader("valid-admin-token")
    });
    const res = await ledgerWorker.fetch(req, makeEnv(db));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("success");
    expect(body.data.events).toHaveLength(2);
    expect(body.data.limit).toBe(10);
    expect(body.data.offset).toBe(0);
  });

  it("caps limit at 1000 regardless of query param value", async () => {
    const storeRow = { id: 3, slug: "woodfire-kulim" };
    let callCount = 0;
    const db = {
      prepare: vi.fn().mockImplementation(() => {
        callCount++;
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue(callCount === 1 ? storeRow : null),
          all: vi.fn().mockResolvedValue({ results: [] }),
          run: vi.fn().mockResolvedValue({})
        };
      })
    };
    const req = new Request("https://ledger.example.com/ledger/woodfire-kulim?limit=9999", {
      method: "GET",
      headers: authHeader("valid-admin-token")
    });
    const res = await ledgerWorker.fetch(req, makeEnv(db));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.limit).toBe(1000); // Math.min(9999, 1000)
  });
});

// ── Utility functions (pure / isolated) ─────────────────────────────────────

describe("Utility — envelope schema_version and trace_id shape", () => {
  it("every response includes schema_version and trace_id with correct format", async () => {
    const res = await ledgerWorker.fetch(
      new Request("https://ledger.example.com/health"),
      makeEnv()
    );
    const body = await res.json();
    expect(body.schema_version).toBe("fnb-billing-ledger@0.1.0");
    expect(body.trace_id).toMatch(/^fnb-billing-ledger_\d{8}_\d{6}_[a-f0-9]{8}$/);
  });
});

describe("FEE_PER_ORDER_CENTS — billing fee calculation", () => {
  it("applies custom fee-per-order when FEE_PER_ORDER_CENTS is overridden", async () => {
    const storeRow = { id: 1, slug: "woodfire-kulim" };
    // Route mock behaviour by SQL content rather than fragile call-count ordering
    const db = {
      prepare: vi.fn().mockImplementation((sql) => {
        if (sql.includes("SELECT * FROM stores")) {
          return {
            bind: vi.fn().mockReturnThis(),
            first: vi.fn().mockResolvedValue(storeRow)
          };
        }
        if (sql.includes("COUNT(*)")) {
          return {
            bind: vi.fn().mockReturnThis(),
            first: vi.fn().mockResolvedValue({ billable_orders: 3, submitted_sales_cents: 9000 })
          };
        }
        if (sql.includes("monthly_usage")) {
          return {
            bind: vi.fn().mockReturnThis(),
            run: vi.fn().mockResolvedValue({})
          };
        }
        // order_events INSERT and developer_audit_log INSERT
        return {
          bind: vi.fn().mockReturnThis(),
          run: vi.fn().mockResolvedValue({})
        };
      })
    };
    const env = makeEnv(db, { FEE_PER_ORDER_CENTS: "100" }); // 100 cents per order
    const req = new Request("https://ledger.example.com/record-order", {
      method: "POST",
      headers: { ...authHeader("valid-secret-token"), "Content-Type": "application/json" },
      body: JSON.stringify({
        store_slug: "woodfire-kulim",
        order_id: "ord-fee-test",
        submitted_at: Date.now(),
        order_total_cents: 3000,
        item_count: 3
      })
    });
    const res = await ledgerWorker.fetch(req, env);
    expect(res.status).toBe(200);
    // fee_cents: 3 orders × 100 cents = 300
    const body = await res.json();
    expect(body.status).toBe("success");
    expect(body.data.usage.fee_cents).toBe(300);
    expect(body.data.usage.billable_orders).toBe(3);
  });
});

// ── Daily Rollups & Summary (Option D) ────────────────────────────────────────

describe("Daily Rollups & Aggregation Maths", () => {
  it("formats dateFromTimestamp correctly across seconds and milliseconds", () => {
    expect(dateFromTimestamp(1718000000000)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(dateFromTimestamp(1718000000)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("formats cents to currency string cleanly", () => {
    expect(formatCents(1450, "RM")).toBe("RM 14.50");
    expect(formatCents(0, "RM")).toBe("RM 0.00");
  });

  it("computes daily rollup accurately when orders exist", async () => {
    const store = { id: "store-1", slug: "beelal_coffee", name: "Beelal Coffee" };
    const db = {
      prepare: vi.fn().mockImplementation((sql) => {
        if (sql.includes("FROM stores")) {
          return { bind: vi.fn().mockReturnThis(), first: vi.fn().mockResolvedValue(store) };
        }
        if (sql.includes("COUNT(*)")) {
          return {
            bind: vi.fn().mockReturnThis(),
            first: vi.fn().mockResolvedValue({
              order_count: 5,
              gross_revenue_cents: 7500,
              currency: "RM"
            })
          };
        }
        return { bind: vi.fn().mockReturnThis(), run: vi.fn().mockResolvedValue({}) };
      })
    };
    const env = makeEnv(db, { FEE_PER_ORDER_CENTS: "50" });
    const result = await computeDailyRollup(db, "beelal_coffee", "2026-09-17", env);

    expect(result.order_count).toBe(5);
    expect(result.gross_revenue_cents).toBe(7500);
    expect(result.fee_cents).toBe(250);
    expect(result.currency).toBe("RM");
  });

  it("handles zero-order days without NaN or null errors", async () => {
    const store = { id: "store-1", slug: "beelal_coffee", name: "Beelal Coffee" };
    const db = {
      prepare: vi.fn().mockImplementation((sql) => {
        if (sql.includes("FROM stores")) {
          return { bind: vi.fn().mockReturnThis(), first: vi.fn().mockResolvedValue(store) };
        }
        if (sql.includes("COUNT(*)")) {
          return {
            bind: vi.fn().mockReturnThis(),
            first: vi.fn().mockResolvedValue({
              order_count: 0,
              gross_revenue_cents: 0,
              currency: null
            })
          };
        }
        return { bind: vi.fn().mockReturnThis(), run: vi.fn().mockResolvedValue({}) };
      })
    };
    const env = makeEnv(db, { FEE_PER_ORDER_CENTS: "50" });
    const result = await computeDailyRollup(db, "beelal_coffee", "2026-09-17", env);

    expect(result.order_count).toBe(0);
    expect(result.gross_revenue_cents).toBe(0);
    expect(result.fee_cents).toBe(0);
    expect(result.currency).toBe("RM");
  });

  it("isolates currency per store defaults", async () => {
    const store = { id: "store-sgd", slug: "singapore-cafe", name: "SG Cafe" };
    const db = {
      prepare: vi.fn().mockImplementation((sql) => {
        if (sql.includes("FROM stores")) {
          return { bind: vi.fn().mockReturnThis(), first: vi.fn().mockResolvedValue(store) };
        }
        if (sql.includes("COUNT(*)")) {
          return {
            bind: vi.fn().mockReturnThis(),
            first: vi.fn().mockResolvedValue({
              order_count: 2,
              gross_revenue_cents: 4000,
              currency: "SGD"
            })
          };
        }
        return { bind: vi.fn().mockReturnThis(), run: vi.fn().mockResolvedValue({}) };
      })
    };
    const env = makeEnv(db, { CURRENCY_DEFAULT: "SGD" });
    const result = await computeDailyRollup(db, "singapore-cafe", "2026-09-17", env);

    expect(result.currency).toBe("SGD");
    expect(result.gross_revenue_cents).toBe(4000);
  });
});

describe("GET /summary/:store_slug — settlement dashboard endpoint", () => {
  it("blocks request with 403 when no auth token is provided", async () => {
    const req = new Request("https://ledger.example.com/summary/beelal_coffee", { method: "GET" });
    const res = await ledgerWorker.fetch(req, makeEnv());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.status).toBe("blocked");
  });

  it("returns failure when store is unknown", async () => {
    const req = new Request("https://ledger.example.com/summary/unknown_store", {
      method: "GET",
      headers: authHeader("valid-secret-token")
    });
    const res = await ledgerWorker.fetch(req, makeEnv());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.errors[0].code).toBe("unknown_store");
  });

  it("returns 200 with today, weekly, and monthly rollups for known store", async () => {
    const store = { id: "store-1", slug: "beelal_coffee", name: "Beelal Coffee" };
    const db = {
      prepare: vi.fn().mockImplementation((sql) => {
        if (sql.includes("FROM stores")) {
          return { bind: vi.fn().mockReturnThis(), first: vi.fn().mockResolvedValue(store) };
        }
        if (sql.includes("billing_daily_rollups WHERE store_slug")) {
          return {
            bind: vi.fn().mockReturnThis(),
            first: vi.fn().mockResolvedValue({
              rollup_date: "2026-09-17",
              order_count: 10,
              gross_revenue_cents: 15000,
              fee_cents: 500,
              currency: "RM"
            }),
            all: vi.fn().mockResolvedValue({ results: [] })
          };
        }
        if (sql.includes("monthly_usage")) {
          return {
            bind: vi.fn().mockReturnThis(),
            first: vi.fn().mockResolvedValue({
              billable_orders: 50,
              submitted_sales_cents: 80000,
              fee_cents: 2500
            })
          };
        }
        if (sql.includes("COUNT(*)")) {
          return {
            bind: vi.fn().mockReturnThis(),
            first: vi.fn().mockResolvedValue({ order_count: 25, gross_revenue_cents: 40000 })
          };
        }
        return {
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({ results: [] }),
          run: vi.fn().mockResolvedValue({})
        };
      })
    };
    const req = new Request("https://ledger.example.com/summary/beelal_coffee", {
      method: "GET",
      headers: authHeader("valid-secret-token")
    });
    const res = await ledgerWorker.fetch(req, makeEnv(db));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("success");
    expect(body.data.store_slug).toBe("beelal_coffee");
    expect(body.data.today.order_count).toBe(10);
    expect(body.data.today.gross_revenue_formatted).toBe("RM 150.00");
    expect(body.data.weekly.order_count).toBe(25);
    expect(body.data.monthly.order_count).toBe(50);
  });
});

describe("Scheduled Cron Automation — scheduled(controller, env, ctx)", () => {
  it("processes all active stores and logs to developer_audit_log", async () => {
    const activeStores = [
      { id: "store-1", slug: "beelal_coffee", name: "Beelal Coffee" },
      { id: "store-2", slug: "woodfire-kulim", name: "Woodfire Kulim" }
    ];
    let auditLogged = false;
    const db = {
      prepare: vi.fn().mockImplementation((sql) => {
        if (sql.includes("FROM stores WHERE status = 'active'")) {
          return { all: vi.fn().mockResolvedValue({ results: activeStores }) };
        }
        if (sql.includes("FROM stores WHERE slug = ?")) {
          return {
            bind: vi.fn().mockImplementation((slug) => ({
              first: vi.fn().mockResolvedValue(activeStores.find((s) => s.slug === slug))
            }))
          };
        }
        if (sql.includes("developer_audit_log")) {
          return {
            bind: vi.fn().mockImplementation(() => {
              auditLogged = true;
              return { run: vi.fn().mockResolvedValue({}) };
            })
          };
        }
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue({ order_count: 0, gross_revenue_cents: 0 }),
          run: vi.fn().mockResolvedValue({})
        };
      })
    };
    const env = makeEnv(db);
    const result = await ledgerWorker.scheduled({ cron: "0 0 * * *" }, env, {});
    expect(result.ok).toBe(true);
    expect(result.processed_count).toBe(2);
    expect(auditLogged).toBe(true);
  });
});
