/**
 * config.js — Beelal Coffee
 *
 * @role     adapter / rules-config
 * @risk     local_mutation
 * @contract APP_CONFIG → consumed by index.html + admin.html as DEFAULT_CONFIG and DEFAULT_MENU
 *
 * Store-specific adapter for Beelal Coffee.
 * This is the ONLY file you edit when deploying for a new entity.
 * The base engine (index.html, admin.html) never needs to change for branding,
 * fonts, menu, or theme — all of that flows through APP_CONFIG below.
 */

// ── Helper: used by systemPrompt to reference store name without circular ref ──
const _STORE_NAME = 'Beelal Coffee';

const APP_CONFIG = {

  // ── Firebase Realtime Database ──────────────────────────────────────────────
  firebase: {
    url:  'https://ash-2026-photobook-default-rtdb.asia-southeast1.firebasedatabase.app',
    root: 'beelal_coffee',
  },

  billing: {
    workerUrl: 'https://fnb-billing-ledger.arh-homelab.workers.dev',
  },

  // ── Store Defaults ──────────────────────────────────────────────────────────
  // Fallback values used when Firebase has no data yet.
  // Once saved via the Admin panel, Firebase values take over permanently.
  store: {
    name:     _STORE_NAME,
    slogan:   'Medium Dark Roast · 100% Arabica',
    phone:    '60122203743',
    hours:    '8:00 AM – 10:00 PM daily',
    currency: 'RM',

    sizeLegend: ['HOT 8oz', 'COLD 12oz', 'FRAPPÉ 16oz', 'LARGE +RM4'],

    foodAddons: [
      { name: 'Extra Double Shot', price: 4 },
      { name: 'Extra Cheese',      price: 2 },
    ],
  },

  // ── Payment ─────────────────────────────────────────────────────────────────
  // Fallback values used until the owner sets real ones via Admin → Payment
  // Settings (saved to Firebase at config/payment_settings, which always wins
  // once present). QR is in-app: customer scans the store's real bank/e-wallet
  // QR image, marks "I've Paid", and the owner confirms from the Orders tab.
  payment: {
    methods:        ['cash', 'qr'],
    bank_name:      '',
    account_name:   '',
    account_number: '',
    qr_image_url:   '',
  },

  // ── App Branding ────────────────────────────────────────────────────────────
  brand: {
    appName:   _STORE_NAME,
    adminName: 'Beelal Admin',
    locale:    'en-MY',
  },

  // ── AI Studio ───────────────────────────────────────────────────────────────
  ai: {
    model: 'deepseek/deepseek-v4-flash:free',

    storeType: 'specialty coffee shop',
    storeHint: 'Single-origin Arabica, artisan warm atmosphere. Regulars are coffee enthusiasts and young KL professionals.',
    quickChips: [
      { label: '🌙 Raya Theme',      prompt: 'Retheme for Hari Raya Aidilfitri — festive green and gold tones' },
      { label: '🎒 School Holidays', prompt: 'Retheme for school holidays — brighter, more cheerful and welcoming' },
      { label: '↩ Reset to Default', prompt: 'Reset all theme colors and fonts back to original Beelal Coffee slate and indigo light theme' },
      { label: '✏️ Change Slogan',   prompt: 'Change the slogan to: ' },
      { label: '🍝 Pasta Off',       prompt: 'Mark all pasta items as sold out for today' },
      { label: '✅ All Available',   prompt: 'Mark all menu items as available' },
    ],
  },

  // ── Default Theme ───────────────────────────────────────────────────────────
  defaultTheme: {
    bg:           '#F8FAFC',
    bg2:          '#F1F5F9',
    bg3:          '#E2E8F0',
    surface:      '#FFFFFF',
    primary:      '#4F46E5',
    accent:       '#EC4899',
    accent2:      '#F59E0B',
    text:         '#0F172A',
    text2:        '#475569',
    text3:        '#94A3B8',
    font_display: "'Outfit', system-ui, sans-serif",
    font_body:    "'Outfit', system-ui, sans-serif",
  },

  // ── Default Menu ────────────────────────────────────────────────────────────
  // Full Beelal Coffee menu — seeded to Firebase on first run if no data exists.
  //
  // Category fields:
  //   type: 'drinks'    → shows size legend chips (HOT/COLD/FRAPPÉ) above items
  //   showAddons: true  → shows foodAddons rows at the bottom of the section
  defaultMenu: {
    categories: [
      { id: 'coffee',    label: 'Coffee',     emoji: '☕', type: 'drinks' },
      { id: 'noncoffee', label: 'Non-Coffee', emoji: '🥤', type: 'drinks' },
      { id: 'food',      label: 'Food',       emoji: '🥪', showAddons: true },
      { id: 'pasta',     label: 'Pasta',      emoji: '🍝' },
      { id: 'special',   label: 'Special',    emoji: '⭐' },
      { id: 'friday',    label: 'Friday',     emoji: '🌟' },
    ],
    items: [
      // COFFEE (HOT 8oz / COLD 12oz / FRAPPÉ 16oz / LARGE +RM4)
      { id:'c1',  cat:'coffee',    name:'Americano',             desc:'', emoji:'☕', hot:6,   cold:8,   frappe:10,  price:null, avail:true },
      { id:'c2',  cat:'coffee',    name:'Cafe Latte',            desc:'', emoji:'☕', hot:7,   cold:9,   frappe:12,  price:null, avail:true },
      { id:'c3',  cat:'coffee',    name:'Cappuccino',            desc:'', emoji:'☕', hot:7,   cold:9,   frappe:null,price:null, avail:true },
      { id:'c4',  cat:'coffee',    name:'Cafe Mocha',            desc:'', emoji:'☕', hot:9,   cold:11,  frappe:14,  price:null, avail:true },
      { id:'c5',  cat:'coffee',    name:'Spanish Latte',         desc:'', emoji:'☕', hot:8,   cold:10,  frappe:13,  price:null, avail:true },
      { id:'c6',  cat:'coffee',    name:'Hazelnut Latte',        desc:'', emoji:'☕', hot:8,   cold:10,  frappe:13,  price:null, avail:true },
      { id:'c7',  cat:'coffee',    name:'Vanilla Latte',         desc:'', emoji:'☕', hot:8,   cold:10,  frappe:13,  price:null, avail:true },
      { id:'c8',  cat:'coffee',    name:'Butterscotch Latte',    desc:'', emoji:'☕', hot:8,   cold:10,  frappe:13,  price:null, avail:true },
      { id:'c9',  cat:'coffee',    name:'Brown Sugar Latte',     desc:'', emoji:'☕', hot:8,   cold:10,  frappe:13,  price:null, avail:true },
      { id:'c10', cat:'coffee',    name:'Caramel Latte',         desc:'', emoji:'☕', hot:8,   cold:10,  frappe:13,  price:null, avail:true },
      { id:'c11', cat:'coffee',    name:'Caramel Macchiato',     desc:'', emoji:'☕', hot:9,   cold:11,  frappe:14,  price:null, avail:true },
      { id:'c12', cat:'coffee',    name:'Matcha Espresso',       desc:'', emoji:'🍵', hot:11,  cold:13,  frappe:16,  price:null, avail:true },
      // NON-COFFEE
      { id:'n1',  cat:'noncoffee', name:'Dark Chocolate',        desc:'', emoji:'🍫', hot:6,   cold:8,   frappe:11,  price:null, avail:true },
      { id:'n2',  cat:'noncoffee', name:'Dark Choc Hazelnut',    desc:'', emoji:'🍫', hot:8,   cold:10,  frappe:12,  price:null, avail:true },
      { id:'n3',  cat:'noncoffee', name:'Double Choco Chips',    desc:'', emoji:'🍫', hot:null,cold:null,frappe:13,  price:null, avail:true },
      { id:'n4',  cat:'noncoffee', name:'Matcha Latte',          desc:'', emoji:'🍵', hot:8,   cold:10,  frappe:13,  price:null, avail:true },
      { id:'n5',  cat:'noncoffee', name:'Matcha Hazelnut',       desc:'', emoji:'🍵', hot:9,   cold:11,  frappe:14,  price:null, avail:true },
      { id:'n6',  cat:'noncoffee', name:'Oreo Cookies',          desc:'', emoji:'🍪', hot:null,cold:null,frappe:13,  price:null, avail:true },
      { id:'n7',  cat:'noncoffee', name:'Sparkling Strawberry',  desc:'', emoji:'🍓', hot:null,cold:10,  frappe:null,price:null, avail:true },
      { id:'n8',  cat:'noncoffee', name:'Milky Strawberry',      desc:'', emoji:'🍓', hot:null,cold:12,  frappe:14,  price:null, avail:true },
      { id:'n9',  cat:'noncoffee', name:'Matcha Strawberry',     desc:'', emoji:'🍵', hot:null,cold:16,  frappe:18,  price:null, avail:true },
      // FOOD — baguette
      { id:'f1',  cat:'food', name:'Scrambled Egg Baguette',  desc:'Baguette sandwich', emoji:'🥖', hot:null,cold:null,frappe:null,price:6.90,  avail:true },
      { id:'f2',  cat:'food', name:'Herb Eggs Mayo Baguette', desc:'Baguette sandwich', emoji:'🥖', hot:null,cold:null,frappe:null,price:8.90,  avail:true },
      { id:'f3',  cat:'food', name:'Tuna Mayo Baguette',      desc:'Baguette sandwich', emoji:'🥖', hot:null,cold:null,frappe:null,price:8.90,  avail:true },
      { id:'f4',  cat:'food', name:'Creamy Chicken Mushroom', desc:'Baguette sandwich', emoji:'🥖', hot:null,cold:null,frappe:null,price:9.90,  avail:true },
      { id:'f5',  cat:'food', name:'Chicken Slices Baguette', desc:'Baguette sandwich', emoji:'🥖', hot:null,cold:null,frappe:null,price:9.90,  avail:true },
      // FOOD — club
      { id:'f6',  cat:'food', name:'Scrambled Egg Club',      desc:'Club sandwich', emoji:'🥪', hot:null,cold:null,frappe:null,price:6.90,  avail:true },
      { id:'f7',  cat:'food', name:'Herb Eggs Mayo Club',     desc:'Club sandwich', emoji:'🥪', hot:null,cold:null,frappe:null,price:8.90,  avail:true },
      { id:'f8',  cat:'food', name:'Tuna Mayo Club',          desc:'Club sandwich', emoji:'🥪', hot:null,cold:null,frappe:null,price:8.90,  avail:true },
      { id:'f9',  cat:'food', name:'Chicken Slices Club',     desc:'Club sandwich', emoji:'🥪', hot:null,cold:null,frappe:null,price:9.90,  avail:true },
      // FOOD — appetizers
      { id:'f10', cat:'food', name:'Toast Cheesy Sausage',    desc:'3 pcs', emoji:'🌭', hot:null,cold:null,frappe:null,price:11.00, avail:true },
      { id:'f11', cat:'food', name:'Cheesy Fries',            desc:'',      emoji:'🍟', hot:null,cold:null,frappe:null,price:8.90,  avail:true },
      { id:'f12', cat:'food', name:'Cheesy Wedges',           desc:'',      emoji:'🥔', hot:null,cold:null,frappe:null,price:8.90,  avail:true },
      { id:'f13', cat:'food', name:'Tempura Chicken Nuggets', desc:'9 pcs', emoji:'🍗', hot:null,cold:null,frappe:null,price:9.90,  avail:true },
      // PASTA
      { id:'p1',  cat:'pasta', name:'Mac & Cheese',      desc:'',                   emoji:'🍝', hot:null,cold:null,frappe:null,price:10.00, avail:true },
      { id:'p2',  cat:'pasta', name:'Creamy Chicken',    desc:'',                   emoji:'🍝', hot:null,cold:null,frappe:null,price:10.00, avail:true },
      { id:'p3',  cat:'pasta', name:'Creamy Alfredo',    desc:'Spicy black pepper', emoji:'🍝', hot:null,cold:null,frappe:null,price:13.00, avail:true },
      { id:'p4',  cat:'pasta', name:'Buttermilk Pasta',  desc:'Spicy',              emoji:'🍝', hot:null,cold:null,frappe:null,price:13.00, avail:true },
      { id:'p5',  cat:'pasta', name:'Beef Bolognese',    desc:'',                   emoji:'🍝', hot:null,cold:null,frappe:null,price:13.00, avail:true },
      { id:'p6',  cat:'pasta', name:'Creamy Mushroom',   desc:'',                   emoji:'🍄', hot:null,cold:null,frappe:null,price:13.00, avail:true },
      { id:'p7',  cat:'pasta', name:'Carbonara',         desc:'',                   emoji:'🍝', hot:null,cold:null,frappe:null,price:12.00, avail:true },
      { id:'p8',  cat:'pasta', name:'Swedish Meatballs', desc:'',                   emoji:'🍝', hot:null,cold:null,frappe:null,price:15.00, avail:true },
      { id:'p9',  cat:'pasta', name:'Aglio Olio',        desc:'',                   emoji:'🍝', hot:null,cold:null,frappe:null,price:15.00, avail:true },
      // SPECIAL
      { id:'s1',  cat:'special', name:'Hainanese Chicken Chop',   desc:'', emoji:'🍽️', hot:null,cold:null,frappe:null,price:14.00, avail:true },
      { id:'s2',  cat:'special', name:'Buttermilk Chicken Chop',  desc:'', emoji:'🍽️', hot:null,cold:null,frappe:null,price:15.00, avail:true },
      { id:'s3',  cat:'special', name:'Black Pepper Chicken Chop',desc:'', emoji:'🍽️', hot:null,cold:null,frappe:null,price:15.00, avail:true },
      { id:'s4',  cat:'special', name:'Fish & Chips',             desc:'', emoji:'🐟',  hot:null,cold:null,frappe:null,price:19.90, avail:true },
      { id:'s5',  cat:'special', name:'BC Chicken Tenders Ori',   desc:'Original', emoji:'🍗', hot:null,cold:null,frappe:null,price:15.00, avail:true },
      { id:'s6',  cat:'special', name:'BC Chicken Tenders Spicy', desc:'Spicy',    emoji:'🌶️', hot:null,cold:null,frappe:null,price:16.00, avail:true },
      // FRIDAY SPECIAL
      { id:'fr1', cat:'friday', name:'Chicken Buttermilk Basmati', desc:'Friday only', emoji:'🍛', hot:null,cold:null,frappe:null,price:14.00, avail:true },
      { id:'fr2', cat:'friday', name:'Chicken Chop Basmati',       desc:'Friday only', emoji:'🍛', hot:null,cold:null,frappe:null,price:15.00, avail:true },
    ],
  },
};
