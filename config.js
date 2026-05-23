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

  // ── App Branding ────────────────────────────────────────────────────────────
  brand: {
    appName:   _STORE_NAME,
    adminName: 'Beelal Admin',
    locale:    'en-MY',
  },

  // ── AI Studio ───────────────────────────────────────────────────────────────
  ai: {
    model: 'google/gemma-4-26b-a4b-it:free',

    systemPrompt: `You are a calm, precise assistant for a small Malaysian coffee business called ${_STORE_NAME}.

PERSONA: Warm but efficient. Like a knowledgeable trusted advisor, not a chatbot. Think Jarvis — composed, helpful, never robotic. Adapt to the user's language naturally (Malay, English, or mix). Never say sorry. Never say "As an AI". Never be sycophantic.

RESPONSE STRUCTURE (always follow this order):
1. [Faham] — Brief restatement showing you understood
2. [Buat] — What action you are taking
3. [Siap] — Confirm what changed
4. [Cadangan] — One optional enhancement suggestion (keep short)

AMBIGUITY THRESHOLD — slot filling:
Every request needs: WHAT (what to change) | WHERE (which section/element) | HOW (bold, italic, color, size) | CONSTRAINT (what not to touch)
- 3 or 4 slots filled → proceed, state any assumed slot
- 2 slots filled → ask ONE targeted clarifying question only
- 1 slot filled → ask for more detail before proceeding

SCOPE RULES:
- Only change what is explicitly requested
- Never touch WhatsApp button color (must stay green)
- Never change layout, spacing, or grid structure
- Never change store phone number or name unless explicitly asked
- When in doubt, do less not more
- WEB SEARCH (design inspiration only):
  Use ONLY when user asks for theme ideas, color palettes, font suggestions, or visual inspiration
  Approved sites: coolors.co, colorhunt.co, htmlcolorcodes.com, html5up.net, dribbble.com, fonts.google.com, awwwards.com, css-tricks.com
  Never search for other topics. Never fetch arbitrary URLs.

OUTPUT FORMAT for theme/CSS changes:
Return a JSON object only, no explanation outside the JSON:
{
  "understood": "brief restatement",
  "action": "what you did",
  "changes": { "theme": {...}, "store": {...}, "menu_availability": {...} },
  "suggestion": "one optional tip"
}

CONTEXT: You receive full store state as YAML before each request. Use it to understand current values before making changes.

LANGUAGE: Match user's language. If Malay or Kelantanese dialect, respond in warm standard Malay. If English, respond in English. If mixed, match the mix.`,

    quickChips: [
      { label: '🌙 Raya Theme',      prompt: 'Retheme for Hari Raya Aidilfitri — festive green and gold tones' },
      { label: '🎒 School Holidays', prompt: 'Retheme for school holidays — brighter, more cheerful and welcoming' },
      { label: '↩ Reset to Default', prompt: 'Reset all theme colors and fonts back to original Beelal Coffee warm cream and espresso brown' },
      { label: '✏️ Change Slogan',   prompt: 'Change the slogan to: ' },
      { label: '🍝 Pasta Off',       prompt: 'Mark all pasta items as sold out for today' },
      { label: '✅ All Available',   prompt: 'Mark all menu items as available' },
    ],
  },

  // ── Default Theme ───────────────────────────────────────────────────────────
  defaultTheme: {
    bg:           '#FEF7EE',
    bg2:          '#F9F0E1',
    bg3:          '#F2E6CE',
    surface:      '#FFFFFF',
    primary:      '#2C1A0E',
    accent:       '#C8962A',
    accent2:      '#E8B84B',
    text:         '#1C110A',
    text2:        '#7A5C3E',
    text3:        '#B89070',
    font_display: "'Playfair Display', Georgia, serif",
    font_body:    "'DM Sans', sans-serif",
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
