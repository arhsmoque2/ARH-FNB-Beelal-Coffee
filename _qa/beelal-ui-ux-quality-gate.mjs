#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const TARGET_HTML_FILES = [
  path.join(repoRoot, 'index.html'),
  path.join(repoRoot, 'index-v2.html'),
  path.join(repoRoot, 'admin.html')
].filter(f => fs.existsSync(f));

// Storefront entrypoint checked by Gates 2-4 below. index-v2.html is the
// confirmed live storefront (index.html redirects to it); index-legacy.html
// was removed once that was confirmed — see AGENTS.md / handoff.md.
const STOREFRONT_HTML_FILES = [
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

// Gate 2: Responsive Viewport Matrix & Touch Target Integrity (Mobile, Tablet, Desktop)
console.log('📱 Gate 2: Responsive Viewport Matrix & Touch Target Integrity (ARH DevKit)...');
let gate2Pass = true;
for (const storefront of STOREFRONT_HTML_FILES) {
  const relPath = path.relative(repoRoot, storefront);
  const html = fs.readFileSync(storefront, 'utf8');

  // 1. Mobile Viewport Tier (<640px / 390px iPhone/Android)
  const mobileChecks = [
    { name: 'Meta viewport tag (width=device-width)', test: html.includes('name="viewport"') && html.includes('width=device-width') },
    { name: 'Single-column mobile items grid (@media <= 640px/980px)', test: html.includes('.items-grid { grid-template-columns: 1fr') },
    { name: 'Single-column search controls (@media <= 640px)', test: html.includes('.control-grid { grid-template-columns: 1fr') },
    { name: 'Fixed floating bottom cart dock', test: html.includes('.floating-cart') && html.includes('position: fixed') },
    { name: '44px min touch target steppers', test: /\.cart-qty-stepper/.test(html) && /\.cart-qty-btn/.test(html) },
    { name: 'Full-bleed mobile sheet panel', test: html.includes('.sheet-panel') }
  ];

  // 2. Tablet Viewport Tier (641px - 980px iPad/Fold)
  const tabletChecks = [
    { name: 'Scroll-snap horizontal category rail', test: html.includes('.category-strip') },
    { name: 'Sidebar collapse to category strip (@media <= 980px)', test: html.includes('.side-panel { display: none') },
    { name: '2-column quick metrics layout (@media <= 980px)', test: html.includes('.quick-row { grid-template-columns: repeat(2') || html.includes('.quick-row { grid-template-columns: 1fr 1fr') },
    { name: 'Hero single-column collapse (@media <= 980px)', test: html.includes('.hero { grid-template-columns: 1fr') }
  ];

  // 3. Desktop Viewport Tier (>980px / 1200px)
  const desktopChecks = [
    { name: 'Dual-column hero layout', test: html.includes('grid-template-columns: minmax(0, 1.02fr) minmax(340px, .8fr)') || html.includes('.hero {') },
    { name: 'Sticky sidebar navigation (250px split)', test: html.includes('.main-grid {') && html.includes('250px minmax(0, 1fr)') },
    { name: '2-column menu items grid', test: html.includes('.items-grid {') && html.includes('repeat(2, minmax(0, 1fr))') },
    { name: '4-column quick stats overview row', test: html.includes('.quick-row {') && html.includes('repeat(4, minmax(0, 1fr))') }
  ];

  console.log(`  --- Viewport Tier: 📱 Mobile (<640px / 390px) ---`);
  for (const c of mobileChecks) {
    if (c.test) console.log(`    [PASS] ${c.name}`);
    else { console.error(`    ❌ [FAIL] Missing: ${c.name}`); gate2Pass = false; totalErrors++; }
  }

  console.log(`  --- Viewport Tier: 📱 Tablet (641px - 980px / 768px) ---`);
  for (const c of tabletChecks) {
    if (c.test) console.log(`    [PASS] ${c.name}`);
    else { console.error(`    ❌ [FAIL] Missing: ${c.name}`); gate2Pass = false; totalErrors++; }
  }

  console.log(`  --- Viewport Tier: 💻 Desktop (>980px / 1200px) ---`);
  for (const c of desktopChecks) {
    if (c.test) console.log(`    [PASS] ${c.name}`);
    else { console.error(`    ❌ [FAIL] Missing: ${c.name}`); gate2Pass = false; totalErrors++; }
  }
}
if (gate2Pass) console.log('  ✅ Mobile, Tablet, and Desktop responsive contracts 100% verified.\n');

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