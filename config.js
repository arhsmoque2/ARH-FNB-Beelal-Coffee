/**
 * config.js — The Rizz Western Empire
 *
 * @role     adapter / rules-config
 * @risk     local_mutation
 * @contract APP_CONFIG → consumed by index.html + admin.html as DEFAULT_CONFIG and DEFAULT_MENU
 *
 * Store-specific adapter for The Rizz Western Empire.
 * This is the ONLY file you edit when deploying for a new entity.
 * The base engine (index.html, admin.html) never needs to change for branding,
 * fonts, menu, or theme — all of that flows through APP_CONFIG below.
 */

// ── Helper: used by systemPrompt to reference store name without circular ref ──
const _STORE_NAME = 'The Rizz Western Empire';

const APP_CONFIG = {

  // ── Firebase Realtime Database ──────────────────────────────────────────────
  firebase: {
    url:  'YOUR_FIREBASE_RTDB_URL',
    root: 'therizz',
  },

  // ── Store Defaults ──────────────────────────────────────────────────────────
  // Fallback values used when Firebase has no data yet.
  // Once saved via the Admin panel, Firebase values take over permanently.
  store: {
    name:     _STORE_NAME,
    slogan:   'Western Food · Pizza · Specialty Coffee',
    phone:    '60XXXXXXXXXX',
    hours:    '10:00 AM – 10:00 PM daily',
    currency: 'RM',

    sizeLegend: ['HOT', 'COLD ICE'],

    foodAddons: [
      { name: 'Extra Cheese', price: 2 },
      { name: 'Add-on Side',  price: 3 },
    ],
  },

  // ── App Branding ────────────────────────────────────────────────────────────
  brand: {
    appName:   _STORE_NAME,
    adminName: 'The Rizz Admin',
    locale:    'en-MY',
  },

  // ── AI Studio ───────────────────────────────────────────────────────────────
  ai: {
    model: 'google/gemma-4-26b-it:free',

    // systemPrompt is set after APP_CONFIG to reference store.name without circular ref.
    systemPrompt: null,

    quickChips: [
      { label: '🎉 Raya Theme',      prompt: 'Retheme for Hari Raya Aidilfitri — festive green and gold tones' },
      { label: '↩ Reset to Default', prompt: `Reset all theme colors and fonts back to original ${_STORE_NAME} dark red and white theme` },
      { label: '✏️ Change Slogan',   prompt: 'Change the slogan to: ' },
      { label: '🍕 Pizza Off',       prompt: 'Mark all pizza items as sold out for today' },
      { label: '🍝 Pasta Off',       prompt: 'Mark all pasta items as sold out for today' },
      { label: '✅ All Available',   prompt: 'Mark all menu items as available' },
    ],
  },

  // ── Default Theme ───────────────────────────────────────────────────────────
  defaultTheme: {
    bg:           '#FFF8F8',
    bg2:          '#FFE8E8',
    bg3:          '#FFCCCC',
    surface:      '#FFFFFF',
    primary:      '#8B0000',
    accent:       '#C41E3A',
    accent2:      '#E84C5A',
    text:         '#1A0A0A',
    text2:        '#6B3333',
    text3:        '#AA7777',
    font_display: "'Playfair Display', Georgia, serif",
    font_body:    "'DM Sans', sans-serif",
  },

  // ── Default Menu ────────────────────────────────────────────────────────────
  // Full The Rizz Western Empire menu — seeded to Firebase on first run if no data exists.
  //
  // Category fields:
  //   type: 'drinks'    → shows size legend chips (hot/cold) above items
  defaultMenu: {
    categories: [
      { id: 'coffee',    label: 'Coffee',      emoji: '☕',    type: 'drinks' },
      { id: 'noncoffee', label: 'Non-Coffee',  emoji: '🦹‍♂️',  type: 'drinks' },
      { id: 'drinks',    label: 'Traditional', emoji: '🥤' },
      { id: 'pizza',     label: 'Pizza',       emoji: '🍕' },
      { id: 'western',   label: 'Western',     emoji: '🍽️' },
      { id: 'pasta',     label: 'Pasta',       emoji: '🍝' },
    ],
    items: [
      // COFFEE (hot / cold ice)
      { id:'c1', cat:'coffee', name:'Americano',         desc:'', emoji:'☕', hot:5,  cold:7,  frappe:null, price:null, avail:true },
      { id:'c2', cat:'coffee', name:'Classic Latte',     desc:'', emoji:'☕', hot:6,  cold:7,  frappe:null, price:null, avail:true },
      { id:'c3', cat:'coffee', name:'Cappucino',         desc:'', emoji:'☕', hot:6,  cold:7,  frappe:null, price:null, avail:true },
      { id:'c4', cat:'coffee', name:'Hazelnut Latte',    desc:'', emoji:'☕', hot:7,  cold:8,  frappe:null, price:null, avail:true },
      { id:'c5', cat:'coffee', name:'Caramel Latte',     desc:'', emoji:'☕', hot:7,  cold:8,  frappe:null, price:null, avail:true },
      { id:'c6', cat:'coffee', name:'Buttercream Latte', desc:'', emoji:'☕', hot:7,  cold:8,  frappe:null, price:null, avail:true },
      { id:'c7', cat:'coffee', name:'Mocha',             desc:'', emoji:'☕', hot:8,  cold:9,  frappe:null, price:null, avail:true },
      // NON-COFFEE
      { id:'n1', cat:'noncoffee', name:'Chocobloc',        desc:'', emoji:'🍫', hot:8,   cold:6,  frappe:null, price:null, avail:true },
      { id:'n2', cat:'noncoffee', name:'Caramel Choco',    desc:'', emoji:'🍫', hot:8,   cold:8,  frappe:null, price:null, avail:true },
      { id:'n3', cat:'noncoffee', name:'Classic Matcha',   desc:'', emoji:'🍵', hot:8,   cold:9,  frappe:null, price:null, avail:true },
      { id:'n4', cat:'noncoffee', name:'Caramel Matcha',   desc:'', emoji:'🍵', hot:9,   cold:10, frappe:null, price:null, avail:true },
      { id:'n5', cat:'noncoffee', name:'Pop Peach Tea',    desc:'', emoji:'🍑', hot:null,cold:5,  frappe:null, price:null, avail:true },
      { id:'n6', cat:'noncoffee', name:'Ice Lemon Tea',    desc:'', emoji:'🍋', hot:null,cold:8,  frappe:null, price:null, avail:true },
      { id:'n7', cat:'noncoffee', name:'Boba Milk Tea',    desc:'', emoji:'🦹‍♂️', hot:null,cold:8,  frappe:null, price:null, avail:true },
      { id:'n8', cat:'noncoffee', name:'Diamond Milk Tea', desc:'', emoji:'🦹‍♂️', hot:null,cold:9,  frappe:null, price:null, avail:true },
      // TRADITIONAL DRINKS (Menu Air) — fixed price
      { id:'d1',  cat:'drinks', name:'Teh O Ais',                 desc:'', emoji:'🍵', hot:null,cold:null,frappe:null, price:3,  avail:true },
      { id:'d2',  cat:'drinks', name:'Teh Ais',                   desc:'', emoji:'🍵', hot:null,cold:null,frappe:null, price:3,  avail:true },
      { id:'d3',  cat:'drinks', name:'Sirap Ais',                 desc:'', emoji:'🥤', hot:null,cold:null,frappe:null, price:3,  avail:true },
      { id:'d4',  cat:'drinks', name:'Kopi O Ais',                desc:'', emoji:'☕', hot:null,cold:null,frappe:null, price:3,  avail:true },
      { id:'d5',  cat:'drinks', name:'Teh O (Limau/Lemon/Laici)', desc:'', emoji:'🍵', hot:null,cold:null,frappe:null, price:4,  avail:true },
      { id:'d6',  cat:'drinks', name:'Sirap (Limau/Lemon/Laici)', desc:'', emoji:'🥤', hot:null,cold:null,frappe:null, price:4,  avail:true },
      { id:'d7',  cat:'drinks', name:'Sirap Bandung',             desc:'', emoji:'🥤', hot:null,cold:null,frappe:null, price:4,  avail:true },
      { id:'d8',  cat:'drinks', name:'Nescafe Ais',               desc:'', emoji:'☕', hot:null,cold:null,frappe:null, price:4,  avail:true },
      { id:'d9',  cat:'drinks', name:'Kopi Ais',                  desc:'', emoji:'☕', hot:null,cold:null,frappe:null, price:4,  avail:true },
      { id:'d10', cat:'drinks', name:'Lemon Ais',                 desc:'', emoji:'🍋', hot:null,cold:null,frappe:null, price:5,  avail:true },
      { id:'d11', cat:'drinks', name:'Laici Ais',                 desc:'', emoji:'🥤', hot:null,cold:null,frappe:null, price:5,  avail:true },
      { id:'d12', cat:'drinks', name:'Limau Asam Boi',            desc:'', emoji:'🍋', hot:null,cold:null,frappe:null, price:5,  avail:true },
      { id:'d13', cat:'drinks', name:'Kopi Latte',                desc:'', emoji:'☕', hot:null,cold:null,frappe:null, price:6,  avail:true },
      { id:'d14', cat:'drinks', name:'Coklat Ais',                desc:'', emoji:'🍫', hot:null,cold:null,frappe:null, price:6,  avail:true },
      { id:'d15', cat:'drinks', name:'Green Tea Ais',             desc:'', emoji:'🍵', hot:null,cold:null,frappe:null, price:6,  avail:true },
      // PIZZA (all RM 20 — Seafood Pizza unavailable)
      { id:'pz1', cat:'pizza', name:'Beef/Chicken Pepperoni',    desc:'', emoji:'🍕', hot:null,cold:null,frappe:null, price:20, avail:true  },
      { id:'pz2', cat:'pizza', name:'Chicken Island Pizza',      desc:'', emoji:'🍕', hot:null,cold:null,frappe:null, price:20, avail:true  },
      { id:'pz3', cat:'pizza', name:'Carbonara Pizza',           desc:'', emoji:'🍕', hot:null,cold:null,frappe:null, price:20, avail:true  },
      { id:'pz4', cat:'pizza', name:'Pizza Tuna Supreme',        desc:'', emoji:'🍕', hot:null,cold:null,frappe:null, price:20, avail:true  },
      { id:'pz5', cat:'pizza', name:'Jalapeno Chicken Ham Pizza',desc:'', emoji:'🍕', hot:null,cold:null,frappe:null, price:20, avail:true  },
      { id:'pz6', cat:'pizza', name:'Barbecue Chicken Pizza',    desc:'', emoji:'🍕', hot:null,cold:null,frappe:null, price:20, avail:true  },
      { id:'pz7', cat:'pizza', name:'Aloha Hawaiian Pizza',      desc:'', emoji:'🍕', hot:null,cold:null,frappe:null, price:20, avail:true  },
      { id:'pz8', cat:'pizza', name:'Seafood Pizza',             desc:'', emoji:'🍕', hot:null,cold:null,frappe:null, price:20, avail:false },
      { id:'pz9', cat:'pizza', name:'Beef Sticky Pizza',         desc:'', emoji:'🍕', hot:null,cold:null,frappe:null, price:20, avail:true  },
      // WESTERN MAINS
      { id:'w1',  cat:'western', name:'Roasted Chicken',      desc:'', emoji:'🍗',  hot:null,cold:null,frappe:null, price:14, avail:true },
      { id:'w2',  cat:'western', name:'Lamb Chop',            desc:'', emoji:'🍖',  hot:null,cold:null,frappe:null, price:14, avail:true },
      { id:'w3',  cat:'western', name:'Chicken Chop Grill',   desc:'', emoji:'🍽️', hot:null,cold:null,frappe:null, price:14, avail:true },
      { id:'w4',  cat:'western', name:'Chicken Chop Crispy',  desc:'', emoji:'🍽️', hot:null,cold:null,frappe:null, price:18, avail:true },
      { id:'w5',  cat:'western', name:'Salmon Grill',         desc:'', emoji:'🐟',  hot:null,cold:null,frappe:null, price:25, avail:true },
      { id:'w6',  cat:'western', name:'Striploin Steak',      desc:'', emoji:'🥩',  hot:null,cold:null,frappe:null, price:25, avail:true },
      { id:'w7',  cat:'western', name:'Fish and Chip',        desc:'', emoji:'🐟',  hot:null,cold:null,frappe:null, price:18, avail:true },
      { id:'w8',  cat:'western', name:'Beef Burger',          desc:'', emoji:'🍔',  hot:null,cold:null,frappe:null, price:13, avail:true },
      { id:'w9',  cat:'western', name:'Mac and Cheese',       desc:'', emoji:'🧀',  hot:null,cold:null,frappe:null, price:12, avail:true },
      { id:'w10', cat:'western', name:'Lasagna Beef',         desc:'', emoji:'🍝',  hot:null,cold:null,frappe:null, price:13, avail:true },
      { id:'w11', cat:'western', name:'Nachos & Beef Sauce',  desc:'', emoji:'🌮',  hot:null,cold:null,frappe:null, price:8,  avail:true },
      { id:'w12', cat:'western', name:'Baked Potato',         desc:'', emoji:'🥔',  hot:null,cold:null,frappe:null, price:12, avail:true },
      { id:'w13', cat:'western', name:'Mushroom Soup',        desc:'', emoji:'🍄',  hot:null,cold:null,frappe:null, price:7,  avail:true },
      // PASTA
      { id:'pa1',  cat:'pasta', name:'Carbonara Salmon',         desc:'', emoji:'🍝', hot:null,cold:null,frappe:null, price:14, avail:true },
      { id:'pa2',  cat:'pasta', name:'Carbonara Seafood',        desc:'', emoji:'🍝', hot:null,cold:null,frappe:null, price:12, avail:true },
      { id:'pa3',  cat:'pasta', name:'Carbonara Beef Bacon',     desc:'', emoji:'🍝', hot:null,cold:null,frappe:null, price:12, avail:true },
      { id:'pa4',  cat:'pasta', name:'Alfredo',                  desc:'', emoji:'🍝', hot:null,cold:null,frappe:null, price:12, avail:true },
      { id:'pa5',  cat:'pasta', name:'Carbonara Pepperoni',      desc:'', emoji:'🍝', hot:null,cold:null,frappe:null, price:12, avail:true },
      { id:'pa6',  cat:'pasta', name:'Marinara Seafood',         desc:'', emoji:'🍝', hot:null,cold:null,frappe:null, price:12, avail:true },
      { id:'pa7',  cat:'pasta', name:'Marinara Meatball',        desc:'', emoji:'🍝', hot:null,cold:null,frappe:null, price:12, avail:true },
      { id:'pa8',  cat:'pasta', name:'Pamodoro',                 desc:'', emoji:'🍝', hot:null,cold:null,frappe:null, price:12, avail:true },
      { id:'pa9',  cat:'pasta', name:'Arabiata Beef',            desc:'', emoji:'🍝', hot:null,cold:null,frappe:null, price:12, avail:true },
      { id:'pa10', cat:'pasta', name:'Stufatto',                 desc:'', emoji:'🍝', hot:null,cold:null,frappe:null, price:14, avail:true },
      { id:'pa11', cat:'pasta', name:'Oglio Chicken',            desc:'', emoji:'🍝', hot:null,cold:null,frappe:null, price:12, avail:true },
      { id:'pa12', cat:'pasta', name:'Oglio Beef Pepperoni',     desc:'', emoji:'🍝', hot:null,cold:null,frappe:null, price:12, avail:true },
      { id:'pa13', cat:'pasta', name:'Oglio Seafood',            desc:'', emoji:'🍝', hot:null,cold:null,frappe:null, price:12, avail:true },
      { id:'pa14', cat:'pasta', name:'Oglio Salmon',             desc:'', emoji:'🍝', hot:null,cold:null,frappe:null, price:14, avail:true },
      { id:'pa15', cat:'pasta', name:'Bolognese',                desc:'', emoji:'🍝', hot:null,cold:null,frappe:null, price:12, avail:true },
      { id:'pa16', cat:'pasta', name:'Spaghetti Vongole',        desc:'', emoji:'🍝', hot:null,cold:null,frappe:null, price:12, avail:true },
      { id:'pa17', cat:'pasta', name:'Volcano Cheesy Pie Pasta', desc:'', emoji:'🍝', hot:null,cold:null,frappe:null, price:14, avail:true },
    ],
  },
};

// ── AI system prompt — defined after APP_CONFIG to reference store name ────────
APP_CONFIG.ai.systemPrompt = `You are a calm, precise assistant for a Malaysian western food restaurant called ${APP_CONFIG.store.name}.

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

OUTPUT FORMAT for theme/CSS changes:
Return a JSON object only, no explanation outside the JSON:
{
  "understood": "brief restatement",
  "action": "what you did",
  "changes": { "theme": {...}, "store": {...}, "menu_availability": {...} },
  "suggestion": "one optional tip"
}

CONTEXT: You receive full store state as YAML before each request. Use it to understand current values before making changes.

LANGUAGE: Match user's language. If Malay, respond in warm standard Malay. If English, respond in English. If mixed, match the mix.`;
