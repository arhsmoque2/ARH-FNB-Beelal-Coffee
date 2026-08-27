#!/usr/bin/env node

/**
 * Beelal Coffee Live Deployment Health Check
 * Probes all live endpoints, validates Firebase binding, and verifies RTDB connectivity.
 *
 * Usage:
 *   node _qa/beelal-live-healthcheck.mjs [targetUrl]
 *   TARGET_URL=https://store-beelal-fnb-pwa.arh-homelab.workers.dev node _qa/beelal-live-healthcheck.mjs
 */

const targetUrl = (
  process.argv[2] ||
  process.env.TARGET_URL ||
  "https://store-beelal-fnb-pwa.arh-homelab.workers.dev"
).replace(/\/+$/, "");

console.log("\n======================================================");
console.log("  🔍 [BEELAL LIVE HEALTHCHECK] Probing Deployed Site");
console.log("  Target:", targetUrl);
console.log("======================================================\n");

let failed = 0;

async function checkRoute(path, expectedStatuses = [200], validateFn = null) {
  const url = targetUrl + path;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Beelal-HealthCheck/1.0" } });
    const text = await res.text();
    const statusOk = expectedStatuses.includes(res.status);
    let customOk = true;
    let customMsg = "";

    if (validateFn && statusOk) {
      const v = validateFn(text, res);
      if (typeof v === "string") {
        customOk = false;
        customMsg = " [Assert Failed: " + v + "]";
      }
    }

    if (statusOk && customOk) {
      console.log(
        "  ✅ [PASS] " + path.padEnd(20) + " HTTP " + res.status + " (" + text.length + " bytes)"
      );
    } else {
      failed++;
      console.error("  ❌ [FAIL] " + path.padEnd(20) + " HTTP " + res.status + customMsg);
    }
  } catch (err) {
    failed++;
    console.error("  ❌ [FAIL] " + path.padEnd(20) + " Network Error: " + err.message);
  }
}

async function run() {
  console.log("--- 1. Live Web Entrypoints ---");
  await checkRoute("/", [200], (text) => {
    if (!text.includes("index-v2.html")) return "Expected redirect shim pointing to index-v2.html";
  });

  await checkRoute("/index-v2.html", [200], (text) => {
    if (!text.includes("cartList") || !text.includes("APP_CONFIG"))
      return "Missing storefront markup/config";
  });

  await checkRoute("/admin.html", [200], (text) => {
    if (!text.includes("loadOrders") || !text.includes("Admin"))
      return "Missing admin panel components";
  });

  await checkRoute("/config.js", [200], (text) => {
    if (!text.includes("ash-2026-photobook")) return "Missing Firebase URL binding";
    if (!text.includes("beelal_coffee")) return "Missing Firebase root namespace";
  });

  await checkRoute("/observatory.html", [200], (text) => {
    if (!text.includes("Beelal Coffee")) return "Observatory missing Beelal Coffee branding";
  });

  await checkRoute("/guide.html", [200]);
  await checkRoute("/dev-console.html", [200]);

  console.log("\n--- 2. Database & State Authority (Firebase RTDB) ---");
  const fbUrl =
    "https://ash-2026-photobook-default-rtdb.asia-southeast1.firebasedatabase.app/beelal_coffee/config.json";
  try {
    const fbRes = await fetch(fbUrl, { headers: { "User-Agent": "Beelal-HealthCheck/1.0" } });
    if (fbRes.ok) {
      const fbData = await fbRes.json();
      console.log(
        "  ✅ [PASS] Firebase RTDB read HTTP " +
          fbRes.status +
          " (Store: " +
          (fbData?.store_info?.name || "beelal_coffee") +
          ")"
      );
    } else {
      failed++;
      console.error("  ❌ [FAIL] Firebase RTDB read HTTP " + fbRes.status);
    }
  } catch (err) {
    failed++;
    console.error("  ❌ [FAIL] Firebase RTDB network error: " + err.message);
  }

  console.log("\n======================================================");
  if (failed === 0) {
    console.log("🎉 [PASS] Live deployment is 100% HEALTHY.");
    console.log("======================================================\n");
    process.exit(0);
  } else {
    console.error("💥 [FAIL] Health check failed with " + failed + " error(s).");
    console.log("======================================================\n");
    process.exit(1);
  }
}

run();
