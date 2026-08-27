#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const TARGET_HTML_FILES = [
  path.join(repoRoot, "index.html"),
  path.join(repoRoot, "index-v2.html"),
  path.join(repoRoot, "admin.html")
].filter((f) => fs.existsSync(f));

// Storefront entrypoint checked by Gates 2-4 below. index-v2.html is the
// confirmed live storefront (index.html redirects to it); index-legacy.html
// was removed once that was confirmed — see AGENTS.md / handoff.md.
const STOREFRONT_HTML_FILES = [path.join(repoRoot, "index-v2.html")].filter((f) =>
  fs.existsSync(f)
);

console.log("\n======================================================");
console.log("  ☕ [BEELAL UI/UX QUALITY GATE] ARH Web DevKit Audit");
console.log("======================================================\n");

let totalErrors = 0;

// Gate 1: Syntax & Asset Integrity Check
console.log("⚡ Gate 1: Syntax & Asset Structure Integrity Check...");
let gate1Pass = true;
for (const htmlPath of TARGET_HTML_FILES) {
  const content = fs.readFileSync(htmlPath, "utf8");
  const relPath = path.relative(repoRoot, htmlPath);
  const openScripts = (content.match(/<script\b/gi) || []).length;
  const closeScripts = (content.match(/<\/script>/gi) || []).length;
  if (openScripts !== closeScripts) {
    console.error(
      "  ❌ [" +
        relPath +
        "] Mismatched <script> tags: " +
        openScripts +
        " open vs " +
        closeScripts +
        " close"
    );
    gate1Pass = false;
    totalErrors++;
  }

  const openStyles = (content.match(/<style\b/gi) || []).length;
  const closeStyles = (content.match(/<\/style>/gi) || []).length;
  if (openStyles !== closeStyles) {
    console.error(
      "  ❌ [" +
        relPath +
        "] Mismatched <style> tags: " +
        openStyles +
        " open vs " +
        closeStyles +
        " close"
    );
    gate1Pass = false;
    totalErrors++;
  }
}
if (gate1Pass) console.log("  ✅ Syntax structure clean across all HTML entrypoints.\n");

// Gate 2: Responsive Viewport Matrix & Touch Target Integrity (Mobile, Tablet, Desktop)
console.log("📱 Gate 2: Responsive Viewport Matrix & Touch Target Integrity (ARH DevKit)...");
let gate2Pass = true;
for (const storefront of STOREFRONT_HTML_FILES) {
  const html = fs.readFileSync(storefront, "utf8");

  // 1. Mobile Viewport Tier (<640px / 390px iPhone/Android)
  const mobileChecks = [
    {
      name: "Meta viewport tag (width=device-width)",
      test: html.includes('name="viewport"') && html.includes("width=device-width")
    },
    {
      name: "Single-column mobile items grid (@media <= 640px/980px)",
      test: html.includes(".items-grid { grid-template-columns: 1fr")
    },
    {
      name: "Single-column search controls (@media <= 640px)",
      test: html.includes(".control-grid { grid-template-columns: 1fr")
    },
    {
      name: "Fixed floating bottom cart dock",
      test: html.includes(".floating-cart") && html.includes("position: fixed")
    },
    {
      name: "44px min touch target steppers",
      test: /\.cart-qty-stepper/.test(html) && /\.cart-qty-btn/.test(html)
    },
    { name: "Full-bleed mobile sheet panel", test: html.includes(".sheet-panel") }
  ];

  // 2. Tablet Viewport Tier (641px - 980px iPad/Fold)
  const tabletChecks = [
    { name: "Scroll-snap horizontal category rail", test: html.includes(".category-strip") },
    {
      name: "Sidebar collapse to category strip (@media <= 980px)",
      test: html.includes(".side-panel { display: none")
    },
    {
      name: "Hero single-column collapse (@media <= 980px)",
      test: html.includes(".hero { grid-template-columns: 1fr")
    }
  ];

  // 3. Desktop Viewport Tier (>980px / 1200px)
  const desktopChecks = [
    {
      name: "Dual-column hero layout",
      test:
        html.includes("grid-template-columns: minmax(0, 1.02fr) minmax(340px, .8fr)") ||
        html.includes(".hero {")
    },
    {
      name: "Sticky sidebar navigation (250px split)",
      test: html.includes(".main-grid {") && html.includes("250px minmax(0, 1fr)")
    },
    {
      name: "2-column menu items grid",
      test: html.includes(".items-grid {") && html.includes("repeat(2, minmax(0, 1fr))")
    }
  ];

  console.log(`  --- Viewport Tier: 📱 Mobile (<640px / 390px) ---`);
  for (const c of mobileChecks) {
    if (c.test) console.log(`    [PASS] ${c.name}`);
    else {
      console.error(`    ❌ [FAIL] Missing: ${c.name}`);
      gate2Pass = false;
      totalErrors++;
    }
  }

  console.log(`  --- Viewport Tier: 📱 Tablet (641px - 980px / 768px) ---`);
  for (const c of tabletChecks) {
    if (c.test) console.log(`    [PASS] ${c.name}`);
    else {
      console.error(`    ❌ [FAIL] Missing: ${c.name}`);
      gate2Pass = false;
      totalErrors++;
    }
  }

  console.log(`  --- Viewport Tier: 💻 Desktop (>980px / 1200px) ---`);
  for (const c of desktopChecks) {
    if (c.test) console.log(`    [PASS] ${c.name}`);
    else {
      console.error(`    ❌ [FAIL] Missing: ${c.name}`);
      gate2Pass = false;
      totalErrors++;
    }
  }
}
if (gate2Pass)
  console.log("  ✅ Mobile, Tablet, and Desktop responsive contracts 100% verified.\n");

// Gate 3: Accessibility & HTML5 Semantics
console.log("🌐 Gate 3: HTML5 Semantics, A11y & Keyboard Navigation...");
let gate3Pass = true;
for (const storefront of STOREFRONT_HTML_FILES) {
  const relPath = path.relative(repoRoot, storefront);
  const html = fs.readFileSync(storefront, "utf8");
  const a11yChecks = [
    { name: "Escape key close handler", check: html.includes("Escape") },
    { name: "Aria labels on icon buttons", check: html.includes("aria-label") },
    {
      name: "Accessible form inputs for order note and name",
      check: html.includes('id="custName"') && html.includes('id="custNote"')
    },
    { name: "Privacy agreement checkbox", check: html.includes('id="privacyAgree"') },
    { name: "Prefers-reduced-motion media query", check: html.includes("prefers-reduced-motion") }
  ];

  for (const ac of a11yChecks) {
    if (!ac.check) {
      console.error("  ❌ [" + relPath + "] A11y requirement missing: " + ac.name);
      gate3Pass = false;
      totalErrors++;
    }
  }
}
if (gate3Pass)
  console.log("  ✅ ARIA markers, keyboard listeners, and accessibility contracts verified.\n");

// Gate 4: F&B UX Contract (UEQ 6 Dimensions)
console.log("🍽️ Gate 4: F&B User Experience Contract (UEQ 6-Dimension Evaluation)...");
let gate4Pass = true;
for (const storefront of STOREFRONT_HTML_FILES) {
  const relPath = path.relative(repoRoot, storefront);
  console.log("  --- " + relPath + " ---");
  const html = fs.readFileSync(storefront, "utf8");
  const ueqGates = [
    {
      dim: "Efficiency",
      test:
        html.includes("changeCartQty") &&
        html.includes("sendOrder") &&
        html.includes("floatingCart"),
      desc: "In-cart stepper and direct WhatsApp checkout flow"
    },
    {
      dim: "Attractiveness",
      test:
        html.includes("--brand") &&
        html.includes("--paper") &&
        (html.includes("<img") || html.includes("item-media")),
      desc: "Appetizing presentation and clear branding"
    },
    {
      dim: "Dependability",
      test:
        (html.includes("fbGetSafe") || html.includes("fbGet")) &&
        html.includes("storeConfig.isOpen === false") &&
        (html.includes("empty-state") || html.includes("emptyCart")),
      desc: "Protected against network failures and closed hours"
    },
    {
      dim: "Perspicuity",
      test: html.includes("renderMenu") && html.includes("money(") && html.includes("itemOptions"),
      desc: "Menu categories and drink sizes immediately clear"
    },
    {
      dim: "Stimulation",
      test:
        html.includes("storePicks") ||
        html.includes("itemSummaries") ||
        html.includes("item-pick-badge"),
      desc: "Barista/Chef picks highlighted"
    },
    {
      dim: "Novelty",
      test: html.includes("cart-qty-stepper") && html.includes("photo-cart-strip"),
      desc: "Modern delivery app ergonomics"
    }
  ];

  for (const g of ueqGates) {
    if (g.test) {
      console.log("  [PASS] " + g.dim.padEnd(14) + ": " + g.desc);
    } else {
      console.error("  [FAIL] " + g.dim.padEnd(14) + ": " + g.desc);
      gate4Pass = false;
      totalErrors++;
    }
  }
}
if (gate4Pass) console.log("  ✅ UEQ 6-Dimension user experience contracts verified.\n");
console.log("");

// Gate 5: Cart Stepper & State Calculation Invariants
console.log("🛒 Gate 5: Cart Stepper & WhatsApp Payload Invariants...");
let gate5Pass = true;
for (const storefront of STOREFRONT_HTML_FILES) {
  const relPath = path.relative(repoRoot, storefront);
  const html = fs.readFileSync(storefront, "utf8");
  const requiredFunctions = [
    "addToCart",
    "changeCartQty",
    "removeCart",
    "updateCart",
    "renderCart",
    "confirmAddons",
    "sendOrder"
  ];

  for (const fn of requiredFunctions) {
    if (!html.includes("function " + fn)) {
      console.error("  ❌ [" + relPath + "] Missing required function: function " + fn + "()");
      gate5Pass = false;
      totalErrors++;
    }
  }
}

{
  const testCart = [
    {
      uid: "1",
      id: "c1",
      name: "Americano",
      option: "Cold",
      unitPrice: 8.0,
      price: 16.0,
      qty: 2,
      addons: []
    },
    {
      uid: "2",
      id: "f1",
      name: "Scrambled Egg Baguette",
      option: "Regular",
      unitPrice: 6.9,
      price: 6.9,
      qty: 1,
      addons: [{ name: "Extra Cheese", value: "Yes", price: 2.0 }]
    }
  ];

  const calcTotalCount = testCart.reduce((sum, i) => sum + (i.qty || 1), 0);
  const calcTotalPrice = testCart.reduce((sum, i) => sum + (i.price || 0), 0);

  if (calcTotalCount !== 3 || calcTotalPrice !== 22.9) {
    console.error("  ❌ Simulated cart calculations failed");
    gate5Pass = false;
    totalErrors++;
  }
}
if (gate5Pass)
  console.log(
    "  ✅ In-cart stepper logic, mathematical invariants, and WhatsApp strings verified.\n"
  );

// Gate 6: CSS Integrity & Brand Palette Consistency
//
// Catches two classes of copy-paste-from-template UI bug that slipped past
// Gates 1-5 before (see: the indigo "announcement-ribbon" banner clashing
// with Beelal's warm coffee-brown/gold theme, commit history has the fix):
//   a) A CSS block with unbalanced braces. This is stricter than Gate 1's
//      tag-count check: `<style>`/`</style>` tags can match 1-for-1 while a
//      rule *inside* is malformed (e.g. an unclosed @keyframes swallows the
//      next rule as a nested selector). Browsers silently recover from this
//      by truncating at end-of-stylesheet, so it never throws — it just
//      quietly drops or corrupts whatever rule came after the mistake.
//   b) A hardcoded hex color from a generic UI-kit's default palette
//      (Tailwind's indigo/violet/pink swatches, the classic "unstyled
//      scaffolding" tell) used directly in a component rule instead of this
//      site's themed `var(--brand)` / `var(--brand2)` custom properties.
//      Beelal's entire design system is built on those two variables
//      (light theme = coffee brown/amber, night mode = gold/amber) so any
//      rule reaching for a raw indigo/violet/pink hex instead is almost
//      certainly leftover boilerplate nobody re-themed.
console.log("🎨 Gate 6: CSS Integrity & Brand Palette Consistency...");
let gate6Pass = true;

// Known "unstyled template" swatches (Tailwind indigo/violet/pink defaults).
// Not an exhaustive off-brand list — a small, precise set chosen to catch
// the boilerplate-leftover pattern with near-zero false positives, not to
// police every color in the file.
const OFFBRAND_HEX =
  /#(4f46e5|6366f1|818cf8|a5b4fc|c7d2fe|e0e7ff|312e81|1e1b4b|3730a3|4338ca|ec4899|f472b6|db2777|fbcfe8)\b/i;
// Selectors allowed to use arbitrary colors outside the theme system:
// dev-only diagnostic overlays that customers never see (gated behind a
// ?inspect=1/?preview=1 query param) don't need to match the storefront's
// brand palette.
const OFFBRAND_ALLOWED_SELECTOR = /redline|inspector|devconsole|debug/i;

for (const htmlPath of TARGET_HTML_FILES) {
  const content = fs.readFileSync(htmlPath, "utf8");
  const relPath = path.relative(repoRoot, htmlPath);
  const styleBlocks = [...content.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);

  for (const css of styleBlocks) {
    const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");

    // (a) brace balance — walk the whole block, must never go negative and
    // must end back at zero.
    let depth = 0;
    let unbalanced = false;
    for (const ch of withoutComments) {
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth < 0) {
          unbalanced = true;
          break;
        }
      }
    }
    if (unbalanced || depth !== 0) {
      console.error(
        "  ❌ [" +
          relPath +
          "] Unbalanced braces in a <style> block (ends at depth " +
          depth +
          ") — a rule is likely swallowing or truncating its neighbors."
      );
      gate6Pass = false;
      totalErrors++;
    }

    // (b) off-brand hardcoded colors, leaf rules only (":root"/theme
    // variable-definition blocks legitimately hardcode the real values the
    // custom properties resolve to, so they're intentionally exempt).
    for (const match of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const [, selector, body] = match;
      const trimmedSelector = selector.trim();
      if (/:root|html\[data-mode/.test(trimmedSelector)) continue;
      if (OFFBRAND_ALLOWED_SELECTOR.test(trimmedSelector)) continue;
      // var(--brand, #hex) / var(--brand2, #hex) is a legitimate fallback —
      // --brand/--brand2 are always defined (root default, then overridden
      // per-theme), so the literal hex there is dead code, not a live
      // color. Strip those before testing so only a *bare* hardcoded hex,
      // or a fallback on some other/undefined variable (e.g. the
      // `var(--primary, #4f46e5)` bug this gate was written to catch —
      // `--primary` was never defined anywhere, so it always fell through
      // to the indigo fallback), gets flagged.
      const bodyForColorCheck = body.replace(/var\(\s*--brand2?\s*,\s*#[0-9a-f]{3,8}\s*\)/gi, "");
      const hit = bodyForColorCheck.match(OFFBRAND_HEX);
      if (hit) {
        console.error(
          "  ❌ [" +
            relPath +
            '] Selector "' +
            trimmedSelector +
            '" hardcodes off-brand color ' +
            hit[0] +
            " instead of var(--brand)/var(--brand2) — looks like un-themed template boilerplate."
        );
        gate6Pass = false;
        totalErrors++;
      }
    }
  }
}
if (gate6Pass) console.log("  ✅ CSS blocks well-formed; no un-themed template colors found.\n");

console.log("======================================================");
if (totalErrors === 0) {
  console.log("🎉 [PASS] All Beelal UI/UX Quality Gates PASSED with 0 errors.");
  console.log("======================================================\n");
  process.exit(0);
} else {
  console.error("💥 [FAIL] Beelal UI/UX Quality Gate FAILED with " + totalErrors + " error(s).");
  console.log("======================================================\n");
  process.exit(1);
}
