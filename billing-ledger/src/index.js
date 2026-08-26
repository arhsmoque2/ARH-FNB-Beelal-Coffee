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

const SCHEMA_VERSION = 'fnb-billing-ledger@0.1.0';

function newTraceId() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const hms = `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(4)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `fnb-billing-ledger_${ymd}_${hms}_${hex}`;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

function envelope({ status, component, summary, data = {}, warnings = [], errors = [], cors = false }) {
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
      errors,
    },
    { status: status === 'success' ? 200 : status === 'blocked' ? 403 : 500, headers }
  );
}

async function sha256Hex(text) {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function monthFromTimestamp(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

function requireSecret(request, env) {
  const header = request.headers.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  return token && token === env.FNB_BILLING_SECRET;
}

function requireAdmin(request, env) {
  const header = request.headers.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  return token && token === env.FNB_DEV_ADMIN_TOKEN;
}

async function getStoreBySlug(db, slug) {
  return db.prepare('SELECT * FROM stores WHERE slug = ?').bind(slug).first();
}

async function recordOrderEvent(db, store, payload, source, actor) {
  const {
    order_id,
    submitted_at,
    order_total_cents,
    currency,
    item_count,
  } = payload;

  const rawHashInput = [
    store.slug,
    order_id,
    String(submitted_at),
    String(order_total_cents),
    currency || 'RM',
    String(item_count || 0),
  ].join('|');
  const raw_hash = await sha256Hex(rawHashInput);

  const now = Math.floor(Date.now() / 1000);
  const month = monthFromTimestamp(submitted_at);

  const stmt = db.prepare(
    `INSERT INTO order_events (store_id, order_id, submitted_at, month, order_total_cents, currency, item_count, source, raw_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(store_id, order_id) DO UPDATE SET reconciled_at = excluded.submitted_at`
  );
  await stmt.bind(
    store.id,
    order_id,
    submitted_at,
    month,
    order_total_cents,
    currency || 'RM',
    item_count || 0,
    source,
    raw_hash,
    now
  ).run();

  await db.prepare(
    'INSERT INTO developer_audit_log (actor, action, store_id, details, created_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(actor, `record_order_${source}`, store.id, JSON.stringify({ order_id, submitted_at }), now).run();

  return raw_hash;
}

async function regenerateMonthlyUsage(db, storeId, month, env) {
  const row = await db.prepare(
    `SELECT COUNT(*) AS billable_orders,
            COALESCE(SUM(order_total_cents), 0) AS submitted_sales_cents
     FROM order_events
     WHERE store_id = ? AND month = ?`
  ).bind(storeId, month).first();

  const feePerOrder = parseInt(env.FEE_PER_ORDER_CENTS || '50', 10);
  const billableOrders = row?.billable_orders || 0;
  const submittedSales = row?.submitted_sales_cents || 0;
  const feeCents = billableOrders * feePerOrder;

  await db.prepare(
    `INSERT INTO monthly_usage (store_id, month, billable_orders, submitted_sales_cents, fee_cents, generated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(store_id, month) DO UPDATE SET
       billable_orders = excluded.billable_orders,
       submitted_sales_cents = excluded.submitted_sales_cents,
       fee_cents = excluded.fee_cents,
       generated_at = excluded.generated_at`
  ).bind(storeId, month, billableOrders, submittedSales, feeCents, Math.floor(Date.now() / 1000)).run();

  return { billable_orders: billableOrders, submitted_sales_cents: submittedSales, fee_cents: feeCents };
}

async function handleRecordOrder(request, env) {
  if (!requireSecret(request, env)) {
    return envelope({
      status: 'blocked',
      component: 'fnb-billing-ledger.record_order',
      summary: 'Missing or invalid billing secret.',
      errors: [{ message: 'Authorization header must match FNB_BILLING_SECRET.', code: 'auth_missing', remediation: 'Set Authorization: Bearer <FNB_BILLING_SECRET>.' }],
      cors: true,
    });
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return envelope({
      status: 'failure',
      component: 'fnb-billing-ledger.record_order',
      summary: 'Could not parse JSON body.',
      errors: [{ message: e.message, code: 'invalid_json', remediation: 'Send a valid JSON payload.' }],
      cors: true,
    });
  }

  const required = ['store_slug', 'order_id', 'submitted_at', 'order_total_cents', 'item_count'];
  const missing = required.filter((k) => body[k] === undefined);
  if (missing.length) {
    return envelope({
      status: 'failure',
      component: 'fnb-billing-ledger.record_order',
      summary: 'Missing required fields.',
      errors: [{ message: `Missing: ${missing.join(', ')}`, code: 'missing_fields', remediation: 'Include all required fields in the request body.' }],
      cors: true,
    });
  }

  const store = await getStoreBySlug(env.DB, body.store_slug);
  if (!store) {
    return envelope({
      status: 'failure',
      component: 'fnb-billing-ledger.record_order',
      summary: `Unknown store slug: ${body.store_slug}`,
      errors: [{ message: 'Store not registered.', code: 'unknown_store', remediation: 'Register the store in the billing ledger before recording orders.' }],
      cors: true,
    });
  }

  try {
    const rawHash = await recordOrderEvent(env.DB, store, body, 'frontend_post', 'frontend');
    const month = monthFromTimestamp(body.submitted_at);
    const usage = await regenerateMonthlyUsage(env.DB, store.id, month, env);

    return envelope({
      status: 'success',
      component: 'fnb-billing-ledger.record_order',
      summary: `Recorded order ${body.order_id} for ${body.store_slug}.`,
      data: { store_id: store.id, order_id: body.order_id, raw_hash: rawHash, usage },
      cors: true,
    });
  } catch (e) {
    return envelope({
      status: 'failure',
      component: 'fnb-billing-ledger.record_order',
      summary: 'Failed to write order event.',
      errors: [{ message: e.message, code: 'db_error', remediation: 'Check D1 binding and Worker logs.' }],
      cors: true,
    });
  }
}

async function handleUsage(request, env, url) {
  if (!requireAdmin(request, env)) {
    return envelope({
      status: 'blocked',
      component: 'fnb-billing-ledger.usage',
      summary: 'Missing or invalid admin token.',
      errors: [{ message: 'Authorization header must match FNB_DEV_ADMIN_TOKEN.', code: 'auth_missing', remediation: 'Set Authorization: Bearer <FNB_DEV_ADMIN_TOKEN>.' }],
    });
  }

  const parts = url.pathname.split('/').filter(Boolean);
  const storeSlug = parts[1];
  const month = parts[2];
  if (!storeSlug || !month) {
    return envelope({
      status: 'failure',
      component: 'fnb-billing-ledger.usage',
      summary: 'URL must be /usage/:store_slug/:month.',
      errors: [{ message: 'Missing store_slug or month.', code: 'url_error', remediation: 'Use /usage/woodfire-kulim/2026-06.' }],
    });
  }

  const store = await getStoreBySlug(env.DB, storeSlug);
  if (!store) {
    return envelope({
      status: 'failure',
      component: 'fnb-billing-ledger.usage',
      summary: `Unknown store slug: ${storeSlug}`,
      errors: [{ message: 'Store not registered.', code: 'unknown_store', remediation: 'Register the store first.' }],
    });
  }

  const usage = await env.DB.prepare(
    'SELECT * FROM monthly_usage WHERE store_id = ? AND month = ?'
  ).bind(store.id, month).first();

  return envelope({
    status: 'success',
    component: 'fnb-billing-ledger.usage',
    summary: `Monthly usage for ${storeSlug} in ${month}.`,
    data: {
      store_slug: storeSlug,
      month,
      usage: usage || { billable_orders: 0, submitted_sales_cents: 0, fee_cents: 0 },
    },
  });
}

async function handleLedger(request, env, url) {
  if (!requireAdmin(request, env)) {
    return envelope({
      status: 'blocked',
      component: 'fnb-billing-ledger.ledger',
      summary: 'Missing or invalid admin token.',
      errors: [{ message: 'Authorization header must match FNB_DEV_ADMIN_TOKEN.', code: 'auth_missing', remediation: 'Set Authorization: Bearer <FNB_DEV_ADMIN_TOKEN>.' }],
    });
  }

  const parts = url.pathname.split('/').filter(Boolean);
  const storeSlug = parts[1];
  if (!storeSlug) {
    return envelope({
      status: 'failure',
      component: 'fnb-billing-ledger.ledger',
      summary: 'URL must be /ledger/:store_slug.',
      errors: [{ message: 'Missing store_slug.', code: 'url_error', remediation: 'Use /ledger/woodfire-kulim.' }],
    });
  }

  const store = await getStoreBySlug(env.DB, storeSlug);
  if (!store) {
    return envelope({
      status: 'failure',
      component: 'fnb-billing-ledger.ledger',
      summary: `Unknown store slug: ${storeSlug}`,
      errors: [{ message: 'Store not registered.', code: 'unknown_store', remediation: 'Register the store first.' }],
    });
  }

  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 1000);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);

  const rows = await env.DB.prepare(
    'SELECT * FROM order_events WHERE store_id = ? ORDER BY submitted_at DESC LIMIT ? OFFSET ?'
  ).bind(store.id, limit, offset).all();

  return envelope({
    status: 'success',
    component: 'fnb-billing-ledger.ledger',
    summary: `Order ledger for ${storeSlug}.`,
    data: { store_slug: storeSlug, limit, offset, events: rows.results || [] },
  });
}

async function handleStores(request, env) {
  if (!requireAdmin(request, env)) {
    return envelope({
      status: 'blocked',
      component: 'fnb-billing-ledger.stores',
      summary: 'Missing or invalid admin token.',
      errors: [{ message: 'Authorization header must match FNB_DEV_ADMIN_TOKEN.', code: 'auth_missing', remediation: 'Set Authorization: Bearer <FNB_DEV_ADMIN_TOKEN>.' }],
    });
  }

  const rows = await env.DB.prepare('SELECT * FROM stores ORDER BY slug').all();
  return envelope({
    status: 'success',
    component: 'fnb-billing-ledger.stores',
    summary: 'List of registered stores.',
    data: { stores: rows.results || [] },
  });
}

async function handleHealth(env) {
  let ok = false;
  try {
    await env.DB.prepare('SELECT 1').run();
    ok = true;
  } catch (e) {
    // D1 not reachable
  }
  return envelope({
    status: ok ? 'success' : 'failure',
    component: 'fnb-billing-ledger.health',
    summary: ok ? 'Worker and D1 are reachable.' : 'D1 health check failed.',
    data: { d1_reachable: ok },
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (url.pathname === '/health') {
      return handleHealth(env);
    }

    if (url.pathname === '/record-order' && request.method === 'POST') {
      return handleRecordOrder(request, env);
    }

    if (url.pathname.startsWith('/usage/') && request.method === 'GET') {
      return handleUsage(request, env, url);
    }

    if (url.pathname.startsWith('/ledger/') && request.method === 'GET') {
      return handleLedger(request, env, url);
    }

    if (url.pathname === '/stores' && request.method === 'GET') {
      return handleStores(request, env);
    }

    return envelope({
      status: 'failure',
      component: 'fnb-billing-ledger.route',
      summary: 'Unknown route.',
      errors: [{ message: `No handler for ${request.method} ${url.pathname}`, code: 'not_found', remediation: 'See design brief for valid endpoints.' }],
    });
  },
};
