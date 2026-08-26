#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(import.meta.dirname, '..');
console.log('\n======================================================');
console.log('  🩺 [ARH-INFRA-DEVKIT] Beelal Coffee Infrastructure Doctor');
console.log('  Target:', repoRoot);
console.log('======================================================\n');

let failed = 0;
let passes = 0;

console.log('--- 1. Cloudflare Workers and Bindings ---');
const mainWrangler = path.join(repoRoot, 'wrangler.jsonc');
if (fs.existsSync(mainWrangler)) {
  try {
    const raw = fs.readFileSync(mainWrangler, 'utf-8');
    const stripped = raw.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const cfg = JSON.parse(stripped);

    if (cfg.name === 'store-beelal-fnb-pwa') {
      console.log('  ✅ [PASS] Main Worker Name: ' + cfg.name);
      passes++;
    } else {
      console.error('  ❌ [FAIL] Expected worker name store-beelal-fnb-pwa, found: ' + cfg.name);
      failed++;
    }

    const r2List = cfg.r2_buckets || [];
    const hasR2 = r2List.some(b => b.binding === 'MEDIA_BUCKET' && b.bucket_name === 'arh-fnb-beelal-media');
    if (hasR2) {
      console.log('  ✅ [PASS] R2 Bucket Binding: MEDIA_BUCKET -> arh-fnb-beelal-media');
      passes++;
    } else {
      console.error('  ❌ [FAIL] Missing or invalid MEDIA_BUCKET binding');
      failed++;
    }

    if (cfg.assets && cfg.assets.directory) {
      console.log('  ✅ [PASS] Static Assets Directory: ' + cfg.assets.directory);
      passes++;
    }
  } catch (err) {
    console.error('  ❌ [FAIL] wrangler.jsonc error: ' + err.message);
    failed++;
  }
} else {
  console.error('  ❌ [FAIL] Missing wrangler.jsonc');
  failed++;
}

console.log('\n--- 2. Billing Ledger Service ---');
const billingWrangler = path.join(repoRoot, 'billing-ledger', 'wrangler.jsonc');
const billingSchema = path.join(repoRoot, 'billing-ledger', 'schema.sql');

if (fs.existsSync(billingWrangler) && fs.existsSync(billingSchema)) {
  try {
    const raw = fs.readFileSync(billingWrangler, 'utf-8');
    const stripped = raw.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const cfg = JSON.parse(stripped);

    const d1List = cfg.d1_databases || [];
    const hasD1 = d1List.some(db => db.binding === 'DB' && db.database_name === 'fnb-billing-ledger-db');
    if (hasD1) {
      console.log('  ✅ [PASS] Billing Ledger D1 Binding: DB -> fnb-billing-ledger-db');
      passes++;
    } else {
      console.error('  ❌ [FAIL] Missing D1 binding in billing-ledger/wrangler.jsonc');
      failed++;
    }

    const schema = fs.readFileSync(billingSchema, 'utf-8');
    if (schema.includes('CREATE TABLE IF NOT EXISTS order_events')) {
      console.log('  ✅ [PASS] Billing Ledger D1 Schema verified');
      passes++;
    } else {
      console.error('  ❌ [FAIL] Invalid schema.sql');
      failed++;
    }
  } catch (err) {
    console.error('  ❌ [FAIL] billing-ledger config error: ' + err.message);
    failed++;
  }
} else {
  console.error('  ❌ [FAIL] billing-ledger files missing');
  failed++;
}

console.log('\n--- 3. Database and RTDB Health Probe ---');
const rtdbUrl = process.env.FIREBASE_DATABASE_URL || 'https://ash-2026-photobook-default-rtdb.asia-southeast1.firebasedatabase.app';
const rtdbRoot = process.env.FIREBASE_ROOT || 'beelal_coffee';

try {
  const probeUrl = rtdbUrl.replace(/\/+$/, '') + '/' + rtdbRoot + '.json?shallow=true';
  const t0 = performance.now();
  const res = await fetch(probeUrl, { headers: { Accept: 'application/json' } });
  const latency = Math.round(performance.now() - t0);

  if (res.ok) {
    console.log('  ✅ [PASS] Firebase RTDB online and healthy (' + latency + 'ms latency)');
    passes++;
  } else {
    console.error('  ❌ [FAIL] Firebase RTDB HTTP ' + res.status);
    failed++;
  }
} catch (err) {
  console.error('  ❌ [FAIL] Firebase RTDB error: ' + err.message);
  failed++;
}

console.log('\n======================================================');
if (failed === 0) {
  console.log('🎉 [PASS] Infrastructure Doctor: All ' + passes + ' checks PASSED.\n');
  process.exit(0);
} else {
  console.error('💥 [FAIL] Infrastructure Doctor: ' + failed + ' error(s) detected.\n');
  process.exit(1);
}
