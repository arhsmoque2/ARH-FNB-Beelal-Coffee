/**
 * fnb-billing-ledger Worker
 *
 * Owns:
 *   - Recording submitted-order events from customer PWAs.
 *   - Serving read-only billing/usage data to the developer console.
 *   - Reconciling store Firebase orders against D1 (backfill path).
 *
 * Does NOT own:
 *   - Payment collection, invoicing, tax.
 *   - Store menu/theme/owner settings.
 *   - Customer-facing order flow.
 */

const SCHEMA_VERSION = "fnb-billing-ledger@0.1.0";

function newTraceId() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const hms = `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(4)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `fnb-billing-ledger_${ymd}_${hms}_${hex}`;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type"
};

function envelope({
  status,
  component,
  summary,
  data = {},
  warnings = [],
  errors = [],
  cors = false
}) {
  const headers = cors ? CORS_HEADERS : {};
  return Response.json(
    {
      status,
      component,
      trace_id: newTraceId(),
      schema_version: SCHEMA_VERSION,
      summary,
      data,
      warnings,
      errors
    },
    { status: status === "success" ? 200 : status === "blocked" ? 403 : 500, headers }
  );
}

async function sha256Hex(text) {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function monthFromTimestamp(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

function requireSecret(request, env) {
  const header = request.headers.get("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return token && token === env.FNB_BILLING_SECRET;
}

function requireAdmin(request, env) {
  const header = request.headers.get("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return token && token === env.FNB_DEV_ADMIN_TOKEN;
}

async function getStoreBySlug(db, slug) {
  return db.prepare("SELECT * FROM stores WHERE slug = ?").bind(slug).first();
}

async function recordOrderEvent(db, store, payload, source, actor) {
  const { order_id, submitted_at, order_total_cents, currency, item_count } = payload;

  const rawHashInput = [
    store.slug,
    order_id,
    String(submitted_at),
    String(order_total_cents),
    currency || "RM",
    String(item_count || 0)
  ].join("|");
  const raw_hash = await sha256Hex(rawHashInput);

  const now = Math.floor(Date.now() / 1000);
  const month = monthFromTimestamp(submitted_at);

  const stmt = db.prepare(
    `INSERT INTO order_events (store_id, order_id, submitted_at, month, order_total_cents, currency, item_count, source, raw_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(store_id, order_id) DO UPDATE SET
       reconciled_at = CASE WHEN excluded.source = 'reconciliation_backfill' THEN excluded.submitted_at ELSE order_events.reconciled_at END`
  );
  await stmt
    .bind(
      store.id,
      order_id,
      submitted_at,
      month,
      order_total_cents,
      currency || "RM",
      item_count || 0,
      source,
      raw_hash,
      now
    )
    .run();

  await db
    .prepare(
      "INSERT INTO developer_audit_log (actor, action, store_id, details, created_at) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(
      actor,
      `record_order_${source}`,
      store.id,
      JSON.stringify({ order_id, submitted_at }),
      now
    )
    .run();

  return raw_hash;
}

async function regenerateMonthlyUsage(db, storeId, month, env) {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS billable_orders,
            COALESCE(SUM(order_total_cents), 0) AS submitted_sales_cents
     FROM order_events
     WHERE store_id = ? AND month = ?`
    )
    .bind(storeId, month)
    .first();

  const feePerOrder = parseInt(env.FEE_PER_ORDER_CENTS || "50", 10);
  const billableOrders = row?.billable_orders || 0;
  const submittedSales = row?.submitted_sales_cents || 0;
  const feeCents = billableOrders * feePerOrder;

  await db
    .prepare(
      `INSERT INTO monthly_usage (store_id, month, billable_orders, submitted_sales_cents, fee_cents, generated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(store_id, month) DO UPDATE SET
       billable_orders = excluded.billable_orders,
       submitted_sales_cents = excluded.submitted_sales_cents,
       fee_cents = excluded.fee_cents,
       generated_at = excluded.generated_at`
    )
    .bind(storeId, month, billableOrders, submittedSales, feeCents, Math.floor(Date.now() / 1000))
    .run();

  return {
    billable_orders: billableOrders,
    submitted_sales_cents: submittedSales,
    fee_cents: feeCents
  };
}

async function handleRecordOrder(request, env) {
  if (!requireSecret(request, env)) {
    return envelope({
      status: "blocked",
      component: "fnb-billing-ledger.record_order",
      summary: "Missing or invalid billing secret.",
      errors: [
        {
          message: "Authorization header must match FNB_BILLING_SECRET.",
          code: "auth_missing",
          remediation: "Set Authorization: Bearer <FNB_BILLING_SECRET>."
        }
      ],
      cors: true
    });
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return envelope({
      status: "failure",
      component: "fnb-billing-ledger.record_order",
      summary: "Could not parse JSON body.",
      errors: [
        { message: e.message, code: "invalid_json", remediation: "Send a valid JSON payload." }
      ],
      cors: true
    });
  }

  const required = ["store_slug", "order_id", "submitted_at", "order_total_cents", "item_count"];
  const missing = required.filter((k) => body[k] === undefined);
  if (missing.length) {
    return envelope({
      status: "failure",
      component: "fnb-billing-ledger.record_order",
      summary: "Missing required fields.",
      errors: [
        {
          message: `Missing: ${missing.join(", ")}`,
          code: "missing_fields",
          remediation: "Include all required fields in the request body."
        }
      ],
      cors: true
    });
  }

  const store = await getStoreBySlug(env.DB, body.store_slug);
  if (!store) {
    return envelope({
      status: "failure",
      component: "fnb-billing-ledger.record_order",
      summary: `Unknown store slug: ${body.store_slug}`,
      errors: [
        {
          message: "Store not registered.",
          code: "unknown_store",
          remediation: "Register the store in the billing ledger before recording orders."
        }
      ],
      cors: true
    });
  }

  try {
    const rawHash = await recordOrderEvent(env.DB, store, body, "frontend_post", "frontend");
    const month = monthFromTimestamp(body.submitted_at);
    const usage = await regenerateMonthlyUsage(env.DB, store.id, month, env);

    return envelope({
      status: "success",
      component: "fnb-billing-ledger.record_order",
      summary: `Recorded order ${body.order_id} for ${body.store_slug}.`,
      data: { store_id: store.id, order_id: body.order_id, raw_hash: rawHash, usage },
      cors: true
    });
  } catch (e) {
    return envelope({
      status: "failure",
      component: "fnb-billing-ledger.record_order",
      summary: "Failed to write order event.",
      errors: [
        { message: e.message, code: "db_error", remediation: "Check D1 binding and Worker logs." }
      ],
      cors: true
    });
  }
}

async function handleUsage(request, env, url) {
  if (!requireAdmin(request, env)) {
    return envelope({
      status: "blocked",
      component: "fnb-billing-ledger.usage",
      summary: "Missing or invalid admin token.",
      errors: [
        {
          message: "Authorization header must match FNB_DEV_ADMIN_TOKEN.",
          code: "auth_missing",
          remediation: "Set Authorization: Bearer <FNB_DEV_ADMIN_TOKEN>."
        }
      ]
    });
  }

  const parts = url.pathname.split("/").filter(Boolean);
  const storeSlug = parts[1];
  const month = parts[2];
  if (!storeSlug || !month) {
    return envelope({
      status: "failure",
      component: "fnb-billing-ledger.usage",
      summary: "URL must be /usage/:store_slug/:month.",
      errors: [
        {
          message: "Missing store_slug or month.",
          code: "url_error",
          remediation: "Use /usage/woodfire-kulim/2026-06."
        }
      ]
    });
  }

  const store = await getStoreBySlug(env.DB, storeSlug);
  if (!store) {
    return envelope({
      status: "failure",
      component: "fnb-billing-ledger.usage",
      summary: `Unknown store slug: ${storeSlug}`,
      errors: [
        {
          message: "Store not registered.",
          code: "unknown_store",
          remediation: "Register the store first."
        }
      ]
    });
  }

  const usage = await env.DB.prepare("SELECT * FROM monthly_usage WHERE store_id = ? AND month = ?")
    .bind(store.id, month)
    .first();

  return envelope({
    status: "success",
    component: "fnb-billing-ledger.usage",
    summary: `Monthly usage for ${storeSlug} in ${month}.`,
    data: {
      store_slug: storeSlug,
      month,
      usage: usage || { billable_orders: 0, submitted_sales_cents: 0, fee_cents: 0 }
    }
  });
}

async function handleLedger(request, env, url) {
  if (!requireAdmin(request, env)) {
    return envelope({
      status: "blocked",
      component: "fnb-billing-ledger.ledger",
      summary: "Missing or invalid admin token.",
      errors: [
        {
          message: "Authorization header must match FNB_DEV_ADMIN_TOKEN.",
          code: "auth_missing",
          remediation: "Set Authorization: Bearer <FNB_DEV_ADMIN_TOKEN>."
        }
      ]
    });
  }

  const parts = url.pathname.split("/").filter(Boolean);
  const storeSlug = parts[1];
  if (!storeSlug) {
    return envelope({
      status: "failure",
      component: "fnb-billing-ledger.ledger",
      summary: "URL must be /ledger/:store_slug.",
      errors: [
        {
          message: "Missing store_slug.",
          code: "url_error",
          remediation: "Use /ledger/woodfire-kulim."
        }
      ]
    });
  }

  const store = await getStoreBySlug(env.DB, storeSlug);
  if (!store) {
    return envelope({
      status: "failure",
      component: "fnb-billing-ledger.ledger",
      summary: `Unknown store slug: ${storeSlug}`,
      errors: [
        {
          message: "Store not registered.",
          code: "unknown_store",
          remediation: "Register the store first."
        }
      ]
    });
  }

  const limit = Math.min(parseInt(url.searchParams.get("limit") || "100", 10), 1000);
  const offset = parseInt(url.searchParams.get("offset") || "0", 10);

  const rows = await env.DB.prepare(
    "SELECT * FROM order_events WHERE store_id = ? ORDER BY submitted_at DESC LIMIT ? OFFSET ?"
  )
    .bind(store.id, limit, offset)
    .all();

  return envelope({
    status: "success",
    component: "fnb-billing-ledger.ledger",
    summary: `Order ledger for ${storeSlug}.`,
    data: { store_slug: storeSlug, limit, offset, events: rows.results || [] }
  });
}

async function handleStores(request, env) {
  if (!requireAdmin(request, env)) {
    return envelope({
      status: "blocked",
      component: "fnb-billing-ledger.stores",
      summary: "Missing or invalid admin token.",
      errors: [
        {
          message: "Authorization header must match FNB_DEV_ADMIN_TOKEN.",
          code: "auth_missing",
          remediation: "Set Authorization: Bearer <FNB_DEV_ADMIN_TOKEN>."
        }
      ]
    });
  }

  const rows = await env.DB.prepare("SELECT * FROM stores ORDER BY slug").all();
  return envelope({
    status: "success",
    component: "fnb-billing-ledger.stores",
    summary: "List of registered stores.",
    data: { stores: rows.results || [] }
  });
}

async function handleHealth(env) {
  let ok = false;
  try {
    await env.DB.prepare("SELECT 1").run();
    ok = true;
  } catch {
    // D1 not reachable
  }
  return envelope({
    status: ok ? "success" : "failure",
    component: "fnb-billing-ledger.health",
    summary: ok ? "Worker and D1 are reachable." : "D1 health check failed.",
    data: { d1_reachable: ok }
  });
}

function dateFromTimestamp(ts) {
  const ms = Number(ts) < 10000000000 ? Number(ts) * 1000 : Number(ts);
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function formatCents(cents, currency = "RM") {
  const n = (Number(cents) || 0) / 100;
  return `${currency} ${n.toFixed(2)}`;
}

function requireSecretOrAdmin(request, env) {
  return requireSecret(request, env) || requireAdmin(request, env);
}

async function computeDailyRollup(db, storeSlug, dateStr, env) {
  const store = await getStoreBySlug(db, storeSlug);
  if (!store) throw new Error(`Unknown store slug: ${storeSlug}`);

  const startMs = new Date(`${dateStr}T00:00:00.000Z`).getTime();
  const endMs = startMs + 86400000 - 1;

  const row = await db
    .prepare(
      `SELECT COUNT(*) AS order_count,
              COALESCE(SUM(order_total_cents), 0) AS gross_revenue_cents,
              COALESCE(MAX(currency), 'RM') AS currency
       FROM order_events
       WHERE store_id = ? AND submitted_at >= ? AND submitted_at <= ?`
    )
    .bind(store.id, startMs, endMs)
    .first();

  const orderCount = row?.order_count || 0;
  const grossRevenueCents = row?.gross_revenue_cents || 0;
  const currency = row?.currency || env?.CURRENCY_DEFAULT || "RM";
  const feePerOrder = parseInt(env?.FEE_PER_ORDER_CENTS || "50", 10);
  const feeCents = orderCount * feePerOrder;
  const now = Math.floor(Date.now() / 1000);

  await db
    .prepare(
      `INSERT INTO billing_daily_rollups (rollup_date, store_slug, gross_revenue_cents, order_count, fee_cents, currency, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(store_slug, rollup_date) DO UPDATE SET
         gross_revenue_cents = excluded.gross_revenue_cents,
         order_count = excluded.order_count,
         fee_cents = excluded.fee_cents,
         currency = excluded.currency,
         created_at = excluded.created_at`
    )
    .bind(dateStr, storeSlug, grossRevenueCents, orderCount, feeCents, currency, now)
    .run();

  return {
    rollup_date: dateStr,
    store_slug: storeSlug,
    gross_revenue_cents: grossRevenueCents,
    order_count: orderCount,
    fee_cents: feeCents,
    currency
  };
}

async function handleSummary(request, env, url) {
  if (!requireSecretOrAdmin(request, env)) {
    return envelope({
      status: "blocked",
      component: "fnb-billing-ledger.summary",
      summary: "Missing or invalid billing secret or admin token.",
      errors: [
        {
          message: "Authorization header must match FNB_BILLING_SECRET or FNB_DEV_ADMIN_TOKEN.",
          code: "auth_missing",
          remediation: "Set Authorization: Bearer <FNB_BILLING_SECRET>."
        }
      ],
      cors: true
    });
  }

  const parts = url.pathname.split("/").filter(Boolean);
  const storeSlug = parts[1];
  if (!storeSlug) {
    return envelope({
      status: "failure",
      component: "fnb-billing-ledger.summary",
      summary: "URL must be /summary/:store_slug.",
      errors: [
        {
          message: "Missing store_slug.",
          code: "url_error",
          remediation: "Use /summary/beelal_coffee."
        }
      ],
      cors: true
    });
  }

  const store = await getStoreBySlug(env.DB, storeSlug);
  if (!store) {
    return envelope({
      status: "failure",
      component: "fnb-billing-ledger.summary",
      summary: `Unknown store slug: ${storeSlug}`,
      errors: [
        {
          message: "Store not registered.",
          code: "unknown_store",
          remediation: "Register the store first."
        }
      ],
      cors: true
    });
  }

  const now = Date.now();
  const todayStr = dateFromTimestamp(now);
  const currency = env.CURRENCY_DEFAULT || "RM";

  let todayRollup = await env.DB.prepare(
    "SELECT * FROM billing_daily_rollups WHERE store_slug = ? AND rollup_date = ?"
  )
    .bind(storeSlug, todayStr)
    .first();

  if (!todayRollup) {
    try {
      todayRollup = await computeDailyRollup(env.DB, storeSlug, todayStr, env);
    } catch {
      todayRollup = {
        rollup_date: todayStr,
        gross_revenue_cents: 0,
        order_count: 0,
        fee_cents: 0,
        currency
      };
    }
  }

  const sevenDaysAgoMs = now - 7 * 86400000;
  const weeklyRow = await env.DB.prepare(
    `SELECT COUNT(*) AS order_count,
              COALESCE(SUM(order_total_cents), 0) AS gross_revenue_cents
       FROM order_events
       WHERE store_id = ? AND submitted_at >= ?`
  )
    .bind(store.id, sevenDaysAgoMs)
    .first();

  const weeklyOrders = weeklyRow?.order_count || 0;
  const weeklyRevenue = weeklyRow?.gross_revenue_cents || 0;
  const feePerOrder = parseInt(env.FEE_PER_ORDER_CENTS || "50", 10);
  const weeklyFee = weeklyOrders * feePerOrder;

  const currentMonth = monthFromTimestamp(now);
  const monthlyRow = await env.DB.prepare(
    "SELECT * FROM monthly_usage WHERE store_id = ? AND month = ?"
  )
    .bind(store.id, currentMonth)
    .first();

  const monthlyOrders = monthlyRow?.billable_orders || 0;
  const monthlyRevenue = monthlyRow?.submitted_sales_cents || 0;
  const monthlyFee = monthlyRow?.fee_cents || monthlyOrders * feePerOrder;

  const recentRollups = await env.DB.prepare(
    "SELECT * FROM billing_daily_rollups WHERE store_slug = ? ORDER BY rollup_date DESC LIMIT 14"
  )
    .bind(storeSlug)
    .all();

  return envelope({
    status: "success",
    component: "fnb-billing-ledger.summary",
    summary: `Billing summary for ${storeSlug}.`,
    data: {
      store_slug: storeSlug,
      store_name: store.name,
      currency,
      today: {
        date: todayStr,
        gross_revenue_cents: todayRollup.gross_revenue_cents || 0,
        gross_revenue_formatted: formatCents(todayRollup.gross_revenue_cents || 0, currency),
        order_count: todayRollup.order_count || 0,
        fee_cents: todayRollup.fee_cents || 0,
        fee_formatted: formatCents(todayRollup.fee_cents || 0, currency)
      },
      weekly: {
        start_date: dateFromTimestamp(sevenDaysAgoMs),
        end_date: todayStr,
        gross_revenue_cents: weeklyRevenue,
        gross_revenue_formatted: formatCents(weeklyRevenue, currency),
        order_count: weeklyOrders,
        fee_cents: weeklyFee,
        fee_formatted: formatCents(weeklyFee, currency)
      },
      monthly: {
        month: currentMonth,
        gross_revenue_cents: monthlyRevenue,
        gross_revenue_formatted: formatCents(monthlyRevenue, currency),
        order_count: monthlyOrders,
        fee_cents: monthlyFee,
        fee_formatted: formatCents(monthlyFee, currency)
      },
      recent_rollups: (recentRollups.results || []).map((r) => ({
        ...r,
        gross_revenue_formatted: formatCents(r.gross_revenue_cents, r.currency || currency),
        fee_formatted: formatCents(r.fee_cents, r.currency || currency)
      }))
    },
    cors: true
  });
}

export { computeDailyRollup, dateFromTimestamp, formatCents, requireSecretOrAdmin };

export default {
  async fetch(request, env, _ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (url.pathname === "/health") {
      return handleHealth(env);
    }

    if (url.pathname === "/record-order" && request.method === "POST") {
      return handleRecordOrder(request, env);
    }

    if (url.pathname.startsWith("/summary/") && request.method === "GET") {
      return handleSummary(request, env, url);
    }

    if (url.pathname.startsWith("/usage/") && request.method === "GET") {
      return handleUsage(request, env, url);
    }

    if (url.pathname.startsWith("/ledger/") && request.method === "GET") {
      return handleLedger(request, env, url);
    }

    if (url.pathname === "/stores" && request.method === "GET") {
      return handleStores(request, env);
    }

    return envelope({
      status: "failure",
      component: "fnb-billing-ledger.route",
      summary: "Unknown route.",
      errors: [
        {
          message: `No handler for ${request.method} ${url.pathname}`,
          code: "not_found",
          remediation: "See design brief for valid endpoints."
        }
      ]
    });
  },

  async scheduled(controller, env, _ctx) {
    const now = Date.now();
    const todayStr = dateFromTimestamp(now);
    const yesterdayStr = dateFromTimestamp(now - 86400000);
    const currentMonth = monthFromTimestamp(now);

    let stores = [];
    try {
      const rows = await env.DB.prepare("SELECT * FROM stores WHERE status = 'active'").all();
      stores = rows.results || [];
    } catch (e) {
      console.error("Scheduled cron: Failed to fetch stores", e);
      return { ok: false, error: e.message };
    }

    const processed = [];
    for (const store of stores) {
      try {
        const yRollup = await computeDailyRollup(env.DB, store.slug, yesterdayStr, env);
        const tRollup = await computeDailyRollup(env.DB, store.slug, todayStr, env);
        const usage = await regenerateMonthlyUsage(env.DB, store.id, currentMonth, env);
        processed.push({ store_slug: store.slug, yRollup, tRollup, usage });
      } catch (err) {
        console.error(`Scheduled cron error for ${store.slug}:`, err);
      }
    }

    try {
      await env.DB.prepare(
        "INSERT INTO developer_audit_log (actor, action, store_id, details, created_at) VALUES (?, ?, ?, ?, ?)"
      )
        .bind(
          "system_cron",
          "scheduled_rollup_cron",
          null,
          JSON.stringify({
            cron: controller?.cron || "scheduled",
            processed_count: processed.length,
            target_dates: [yesterdayStr, todayStr]
          }),
          Math.floor(Date.now() / 1000)
        )
        .run();
    } catch {}

    return { ok: true, processed_count: processed.length };
  }
};
