#!/usr/bin/env node
/**
 * migrate-photos.js — one-shot migration of base64 menu item photos → Cloudflare R2
 *
 * What it does:
 *   1. Reads all menu items from Firebase RTDB
 *   2. Finds items where img_url is a base64 data URL (starts with "data:")
 *   3. Uploads each image to R2 via the Worker's /api/upload/image endpoint
 *   4. Patches the Firebase record with the new /media/... URL
 *   5. Reports progress + summary
 *
 * Safe to re-run: items already migrated (img_url is a URL, not base64) are skipped.
 *
 * Prerequisites:
 *   - Node.js 18+ (uses native fetch + FormData + Blob)
 *   - Worker deployed with /api/upload/image endpoint
 *   - UPLOAD_SECRET set: wrangler secret put UPLOAD_SECRET
 *
 * Setup:
 *   export WORKER_URL=https://fnb-pwa.workers.dev   # your deployed Worker URL
 *   export UPLOAD_SECRET=your_secret_here
 *
 * Dry run (preview changes, no writes):
 *   node migrate-photos.js --dry-run
 *
 * Live run:
 *   node migrate-photos.js
 */

const FIREBASE_URL  = 'https://ash-2026-photobook-default-rtdb.asia-southeast1.firebasedatabase.app';
const FIREBASE_ROOT = 'beelal_coffee';
const DELAY_MS      = 300; // ms between uploads — avoids hammering the Worker

const isDryRun = process.argv.includes('--dry-run');

// ── Firebase helpers ───────────────────────────────────────────────────

async function fbGet(path) {
  const res = await fetch(`${FIREBASE_URL}/${FIREBASE_ROOT}/${path}.json`);
  if (!res.ok) throw new Error(`Firebase GET /${path} → ${res.status}`);
  return res.json();
}

async function fbPatch(path, data) {
  const res = await fetch(`${FIREBASE_URL}/${FIREBASE_ROOT}/${path}.json`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Firebase PATCH /${path} → ${res.status}`);
  return res.json();
}

// ── Upload helper ──────────────────────────────────────────────────────

async function uploadToR2(workerUrl, uploadSecret, itemId, dataUrl) {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) throw new Error('Unrecognised data URL format');

  const mimeType = match[1];
  const buffer   = Buffer.from(match[2], 'base64');
  const extMap   = { 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
  const ext      = extMap[mimeType] || 'jpg';

  const formData = new FormData();
  formData.append('image',   new Blob([buffer], { type: mimeType }), `${itemId}.${ext}`);
  formData.append('item_id', String(itemId));

  const res = await fetch(`${workerUrl}/api/upload/image`, {
    method:  'POST',
    headers: { 'X-Admin-Secret': uploadSecret },
    body:    formData,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Worker ${res.status}: ${body}`);
  }

  return res.json(); // { url, filename, size_bytes }
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  const workerUrl    = process.env.WORKER_URL;
  const uploadSecret = process.env.UPLOAD_SECRET;

  if (!workerUrl || !uploadSecret) {
    console.error('Error: missing environment variables.\n');
    console.error('  export WORKER_URL=https://fnb-pwa.workers.dev');
    console.error('  export UPLOAD_SECRET=your_secret_here');
    process.exit(1);
  }

  if (isDryRun) {
    console.log('╔══════════════════════════════════════╗');
    console.log('║  DRY RUN — no changes will be made   ║');
    console.log('╚══════════════════════════════════════╝\n');
  }

  console.log('Fetching menu items from Firebase…');
  const itemsData = await fbGet('menu/items');

  if (!itemsData) {
    console.log('No menu/items node found in Firebase. Nothing to do.');
    return;
  }

  const entries     = Object.entries(itemsData);
  const toMigrate   = entries.filter(([, item]) => item?.img_url?.startsWith('data:'));
  const alreadyGood = entries.filter(([, item]) => item?.img_url && !item.img_url.startsWith('data:'));
  const noPhoto     = entries.filter(([, item]) => !item?.img_url);

  console.log(`\nScan results:`);
  console.log(`  Total items    : ${entries.length}`);
  console.log(`  Need migration : ${toMigrate.length}  (base64 data URL → R2)`);
  console.log(`  Already clean  : ${alreadyGood.length}  (URL, will skip)`);
  console.log(`  No photo       : ${noPhoto.length}  (no img_url, will skip)`);
  console.log('');

  if (toMigrate.length === 0) {
    console.log('Everything is already clean. No migration needed.');
    return;
  }

  let succeeded = 0;
  let failed    = 0;
  const failures = [];

  for (const [key, item] of toMigrate) {
    const id      = item.id || key;
    const name    = item.name || '(unnamed)';
    const sizeKb  = Math.round(item.img_url.length * 0.75 / 1024); // approx decoded KB
    const label   = `[${id}] ${name}`;

    process.stdout.write(`  ${label.padEnd(40)} ~${sizeKb} KB  `);

    if (isDryRun) {
      console.log('→ WOULD MIGRATE');
      continue;
    }

    try {
      const { url, size_bytes } = await uploadToR2(workerUrl, uploadSecret, id, item.img_url);
      await fbPatch(`menu/items/${key}`, { img_url: url });
      console.log(`→ OK  (${Math.round(size_bytes / 1024)} KB)  ${url}`);
      succeeded++;
    } catch (err) {
      console.log(`→ FAIL  ${err.message}`);
      failed++;
      failures.push({ id, name, error: err.message });
    }

    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  console.log('\n' + '─'.repeat(60));

  if (isDryRun) {
    console.log(`Dry run complete. ${toMigrate.length} items would be migrated.`);
    console.log('Run without --dry-run to apply changes.');
    return;
  }

  console.log(`Migration complete.`);
  console.log(`  Succeeded : ${succeeded}`);
  console.log(`  Failed    : ${failed}`);

  if (failures.length > 0) {
    console.log('\nFailed items:');
    for (const f of failures) {
      console.log(`  [${f.id}] ${f.name} — ${f.error}`);
    }
    console.log('\nRe-run the script to retry. Already-migrated items are skipped automatically.');
    process.exit(1);
  }

  console.log('\nAll base64 photos have been removed from Firebase RTDB.');
  console.log('Images are now served from Cloudflare R2 via /media/images/…');
}

main().catch(err => {
  console.error('\nFatal:', err.message);
  process.exit(1);
});
