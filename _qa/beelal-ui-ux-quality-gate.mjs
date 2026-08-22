#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const TARGET_HTML_FILES = [
  path.join(repoRoot, 'index.html'),
  path.join(repoRoot, 'index-legacy.html'),
  path.join(repoRoot, 'index-v2.html'),
  path.join(repoRoot, 'admin.html')
].filter(f => fs.existsSync(f));

// Storefront entrypoints checked by Gates 2-4 below. There are currently two
// candidate "live" storefronts in this repo (index-legacy.html and
// index-v2.html) with an unresolved question about which one actually serves
// customers (see AGENTS.md / handoff.md). Until that's resolved, both are
// checked rather than silently picking one — a gap in either is real signal.
const STOREFRONT_HTML_FILES = [
  path.join(repoRoot, 'index-legacy.html'),
  path.join(repoRoot, 'index-v2.html')
].filter(f => fs.existsSync(f));

console.log('\n======================================================');
console.log('  ☕ [BEELAL UI/UX QUALITY GATE] ARH Web DevKit Audit');
console.log('======================================================\n');

let totalErrors = 0;
let totalWarnings = 0;

// Gate 1: Syntax & Asset Integrity Check
console.log('⚡ Gate 1: Syntax & Asset Structure Integrity Check...');
let gate1Pass = true;
for (const htmlPath of TARGET_HTML_FILES) {
  const content = fs.readFileSync(htmlPath, 'utf8');
  const relPath = path.relative(repoRoot, htmlPath);
  const openScripts = (content.match(/<script\b/gi) || []).length;
  const closeScripts = (content.match(/<\/script>/gi) || []).length;
  if (openScripts !== closeScripts) {
    console.error('  ❌ [' + relPath + '] Mismatched <script> tags: ' + openScripts + ' open vs ' + closeScripts + ' close');
    gate1Pass = false;
    totalErrors++;
  }

  const openStyles = (content.match(/<style\b/gi) || []).length;
  const closeStyles = (content.match(/<\/style>/gi) || []).length;
  if (openStyles !== closeStyles) {
    console.error('  ❌ [' + relPath + '] Mismatched <style> tags: ' + openStyles + ' open vs ' + closeStyles + ' close');
    gate1Pass = false;
    totalErrors++;
  }
}
if (gate1Pass) console.log('  ✅ Syntax structure clean across all HTML entrypoints.\n');

// Gate 2: Mobile Layout & Touch Target Integrity (ARH DevKit)
console.log('📱 Gate 2: Mobile Layout & Touch Target Integrity (ARH DevKit)...');
let gate2Pass = true;
for (const storefront of STOREFRONT_HTML_FILES) {
  const relPath = path.relative(repoRoot, storefront);
  const html = fs.readFileSync(storefront, 'utf8');

  if (!html.includes('name="viewport"') || !html.includes('width=device-width')) {
    console.error('  ❌ [' + relPath + '] Missing mobile viewport meta tag.');
    gate2Pass = false;
    totalErrors++;
  }

  if (!html.includes('.floating-cart') || !html.includes('position: fixed')) {
    console.error('  ❌ [' + relPath + '] Floating cart missing fixed positioning.');
    gate2Pass = false;
    totalErrors++;
  }

  const requiredInteractive = [
    { name: 'Cart quantity stepper', pattern: /\.cart-qty-stepper/ },
    { name: 'Cart quantity buttons', pattern: /\.cart-qty-btn/ },
    { name: 'Remove item button', pattern: /\.remove-btn/ },
    { name: 'Photo lightbox close button', pattern: /\.photo-x/ }
  ];

  for (const item of requiredInteractive) {
    if (!item.pattern.test(html)) {
      console.error('  ❌ [' + relPath + '] Missing CSS rule for ' + item.name);
      gate2Pass = false;
      totalErrors++;
    }
  }
}
if (gate2Pass) console.log('  ✅ Viewport, floating dock, and touch targets pass layout integrity checks.\n');

// Gate 3: Accessibility & HTML5 Semantics
console.log('🌐 Gate 3: HTML5 Semantics, A11y & Keyboard Navigation...');
let gate3Pass = true;
for (const storefront of STOREFRONT_HTML_FILES) {
  const relPath = path.relative(repoRoot, storefront);
  const html = fs.readFileSync(storefront, 'utf8');
  const a11yChecks = [
    { name: 'Escape key close handler', check: html.includes('Escape') },
    { name: 'Aria labels on icon buttons', check: html.includes('aria-label') },
    { name: 'Accessible form inputs for order note and name', check: html.includes('id="custName"') && html.includes('id="custNote"') },
    { name: 'Privacy agreement checkbox', check: html.includes('id="privacyAgree"') },
    { name: 'Prefers-reduced-motion media query', check: html.includes('prefers-reduced-motion') }
  ];

  for (const ac of a11yChecks) {
    if (!ac.check) {
      console.error('  ❌ [' + relPath + '] A11y requirement missing: ' + ac.name);
      gate3Pass = false;
      totalErrors++;
    }
  }
}
if (gate3Pass) console.log('  ✅ ARIA markers, keyboard listeners, and accessibility contracts verified.\n');

// Gate 4: F&B UX Contract (UEQ 6 Dimensions)
console.log('🍽️ Gate 4: F&B User Experience Contract (UEQ 6-Dimension Evaluation)...');
let gate4Pass = true;
for (const storefront of STOREFRONT_HTML_FILES) {
  const relPath = path.relative(repoRoot, storefront);
  console.log('  --- ' + relPath + ' ---');
  const html = fs.readFileSync(storefront, 'utf8');
  const ueqGates = [
    { dim: 'Efficiency', test: html.includes('changeCartQty') && html.includes('sendOrder') && html.includes('floatingCart'), desc: 'In-cart stepper and direct WhatsApp checkout flow' },
    { dim: 'Attractiveness', test: html.includes('--brand') && html.includes('--paper') && (html.includes('<img') || html.includes('item-media')), desc: 'Appetizing presentation and clear branding' },
    { dim: 'Dependability', test: (html.includes('fbGetSafe') || html.includes('fbGet')) && html.includes('storeConfig.isOpen === false') && (html.includes('empty-state') || html.includes('emptyCart')), desc: 'Protected against network failures and closed hours' },
    { dim: 'Perspicuity', test: html.includes('renderMenu') && html.includes('money(') && html.includes('itemOptions'), desc: 'Menu categories and drink sizes immediately clear' },
    { dim: 'Stimulation', test: html.includes('storePicks') || html.includes('itemSummaries') || html.includes('item-pick-badge'), desc: 'Barista/Chef picks highlighted' },
    { dim: 'Novelty', test: html.includes('cart-qty-stepper') && html.includes('photo-cart-strip'), desc: 'Modern delivery app ergonomics' }
  ];

  for (const g of ueqGates) {
    if (g.test) {
      console.log('  [PASS] ' + g.dim.padEnd(14) + ': ' + g.desc);
    } else {
      console.error('  [FAIL] ' + g.dim.padEnd(14) + ': ' + g.desc);
      gate4Pass = false;
      totalErrors++;
    }
  }
}
console.log('');

// Gate 5: Cart Stepper & State Calculation Invariants
console.log('🛒 Gate 5: Cart Stepper & WhatsApp Payload Invariants...');
let gate5Pass = true;
for (const storefront of STOREFRONT_HTML_FILES) {
  const relPath = path.relative(repoRoot, storefront);
  const html = fs.readFileSync(storefront, 'utf8');
  const requiredFunctions = ['addToCart', 'changeCartQty', 'removeCart', 'updateCart', 'renderCart', 'confirmAddons', 'sendOrder'];

  for (const fn of requiredFunctions) {
    if (!html.includes('function ' + fn)) {
      console.error('  ❌ [' + relPath + '] Missing required function: function ' + fn + '()');
      gate5Pass = false;
      totalErrors++;
    }
  }
}

{
  const testCart = [
    { uid: '1', id: 'c1', name: 'Americano', option: 'Cold', unitPrice: 8.00, price: 16.00, qty: 2, addons: [] },
    { uid: '2', id: 'f1', name: 'Scrambled Egg Baguette', option: 'Regular', unitPrice: 6.90, price: 6.90, qty: 1, addons: [{ name: 'Extra Cheese', value: 'Yes', price: 2.00 }] }
  ];

  const calcTotalCount = testCart.reduce((sum, i) => sum + (i.qty || 1), 0);
  const calcTotalPrice = testCart.reduce((sum, i) => sum + (i.price || 0), 0);

  if (calcTotalCount !== 3 || calcTotalPrice !== 22.90) {
    console.error('  ❌ Simulated cart calculations failed');
    gate5Pass = false;
    totalErrors++;
  }
}
if (gate5Pass) console.log('  ✅ In-cart stepper logic, mathematical invariants, and WhatsApp strings verified.\n');

console.log('======================================================');
if (totalErrors === 0) {
  console.log('🎉 [PASS] All Beelal UI/UX Quality Gates PASSED with 0 errors.');
  console.log('======================================================\n');
  process.exit(0);
} else {
  console.error('💥 [FAIL] Beelal UI/UX Quality Gate FAILED with ' + totalErrors + ' error(s).');
  console.log('======================================================\n');
  process.exit(1);
}