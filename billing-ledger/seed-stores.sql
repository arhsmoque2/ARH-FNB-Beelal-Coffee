-- Seed stores for billing ledger
-- Add more stores as needed.

INSERT OR IGNORE INTO stores (id, slug, name, firebase_root, firebase_url, cf_url, status, created_at) VALUES
('wf-001', 'woodfire-kulim', 'Woodfire Kulim', 'woodfire_kulim', 'https://arh-firebase-db-default-rtdb.asia-southeast1.firebasedatabase.app', 'https://store-woodfire-kulim-fnb-pwa.arh-homelab.workers.dev', 'active', unixepoch());
