-- FNB Billing Ledger D1 schema
-- Run: wrangler d1 execute fnb-billing-ledger-db --file=schema.sql

CREATE TABLE IF NOT EXISTS stores (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  firebase_root TEXT UNIQUE NOT NULL,
  firebase_url TEXT NOT NULL,
  cf_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS order_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  submitted_at INTEGER NOT NULL,
  month TEXT NOT NULL,
  order_total_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'RM',
  item_count INTEGER NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('frontend_post','reconciliation_backfill')),
  raw_hash TEXT NOT NULL,
  reconciled_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(store_id, order_id)
);

CREATE INDEX IF NOT EXISTS idx_order_events_store_month ON order_events(store_id, month);
CREATE INDEX IF NOT EXISTS idx_order_events_store_submitted ON order_events(store_id, submitted_at);

CREATE TABLE IF NOT EXISTS monthly_usage (
  store_id TEXT NOT NULL,
  month TEXT NOT NULL,
  billable_orders INTEGER NOT NULL DEFAULT 0,
  submitted_sales_cents INTEGER NOT NULL DEFAULT 0,
  fee_cents INTEGER NOT NULL DEFAULT 0,
  generated_at INTEGER NOT NULL,
  PRIMARY KEY (store_id, month)
);

CREATE TABLE IF NOT EXISTS developer_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  store_id TEXT,
  details TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON developer_audit_log(created_at);
