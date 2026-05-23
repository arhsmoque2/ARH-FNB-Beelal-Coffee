# arh-fnb-webapp — Multi-Store FnB Menu PWA

A zero-dependency menu PWA for small food & beverage businesses.
Vanilla HTML/CSS/JS + Firebase Realtime Database + Cloudflare Workers. No build step.

## Live Deployments

| Store | Branch | Preview URL |
|---|---|---|
| Beelal Coffee | `store/beelal` | `https://store-beelal-fnb-pwa.arh-homelab.workers.dev` |
| The Rizz Western Empire | `store/therizz` | `https://store-therizz-fnb-pwa.arh-homelab.workers.dev` |
| Template (production) | `main` | `https://fnb-pwa.arh-homelab.workers.dev` |

All deployments are automatic — push to a branch, CF builds within ~30 seconds.

---

## Repository Architecture

```
main              ← clean reusable template (no real store data)
store/beelal      ← Beelal Coffee — own config, own Firebase namespace
store/therizz     ← The Rizz Western Empire — own config, own Firebase namespace
```

`main` is the template base. Each store lives on its own branch and is **never merged back into main**. The branches are the deployment artifacts — Cloudflare Workers builds each one as a permanent branch preview.

**Adding a new store:**
```bash
git checkout main
git checkout -b store/<newstore>
# edit config.js with the new store's details
git push -u origin store/<newstore>
# CF auto-builds a preview URL: store-<newstore>-fnb-pwa.arh-homelab.workers.dev
```

---

## Files

| File | Purpose |
|---|---|
| `config.js` | **The only file you edit per store** — all business settings |
| `index.html` | Customer-facing menu PWA (engine — never edit for branding) |
| `admin.html` | Owner/developer admin panel (engine — never edit for branding) |
| `guide.html` | Owner reference guide |
| `wrangler.jsonc` | Cloudflare Workers project name for this branch |

---

## Infrastructure

### Cloudflare Workers
- **Project name:** `fnb-pwa`
- **Connected repo:** `arhsmoque/arh-fnb-webapp`
- **Production branch:** `main`
- **Branch builds:** enabled — every branch gets a preview URL automatically
- **API token:** `arh-fnb-webapp` (scoped to this project only)

### Firebase Realtime Database
- **Project:** `ash-2026-photobook` (shared — one DB for all stores, forever)
- **URL:** `https://ash-2026-photobook-default-rtdb.asia-southeast1.firebasedatabase.app`
- **Isolation:** each store writes under its own `firebase.root` key — data never overlaps, no cross-store reads possible

**Never create a new Firebase project for a new store.** Just pick a new `firebase.root` key.

| Store | `firebase.root` |
|---|---|
| Beelal Coffee | `beelal_coffee` |
| The Rizz | `therizz` |
| New store | any unique key, lowercase, underscores ok, no slashes |

---

## config.js Schema

`config.js` is the sole adapter between the engine and a specific store. Every field:

```js
const _STORE_NAME = 'My Store Name';  // defined first — used in systemPrompt

const APP_CONFIG = {
  firebase: {
    url:  'https://...',   // Firebase RTDB URL
    root: 'my_store',      // unique namespace key — no slashes, no spaces
  },

  store: {
    name:     _STORE_NAME,
    slogan:   '...',
    phone:    '601XXXXXXXX',   // WhatsApp number, digits only, country code first
    hours:    '...',
    currency: 'RM',

    sizeLegend: ['HOT 8oz', 'COLD 12oz', 'FRAPPÉ 16oz', 'LARGE +RM4'],
    // ^ shown above drink categories. Omit sizes not offered by the store.

    foodAddons: [              // optional — shown at bottom of showAddons: true categories
      { name: 'Extra Cheese', price: 2 },
    ],
  },

  brand: {
    appName:   _STORE_NAME,    // page title, PWA name, WhatsApp order footer
    adminName: 'My Admin',     // shown in admin panel header
    locale:    'en-MY',        // date/time locale
  },

  ai: {
    model:        'google/gemma-4-26b-it:free',
    systemPrompt: `...`,       // inline — uses _STORE_NAME helper
    quickChips:   [...],       // shortcut prompts shown in AI Studio
  },

  defaultTheme: {
    bg, bg2, bg3,              // page background layers
    surface,                   // card background
    primary, accent, accent2,  // brand colours
    text, text2, text3,        // text hierarchy
    font_display, font_body,   // Google Fonts strings
  },

  defaultMenu: {
    categories: [
      // type: 'drinks'   → shows sizeLegend chips above items
      // showAddons: true → shows foodAddons rows at bottom of section
      { id: 'coffee', label: 'Coffee', emoji: '☕', type: 'drinks' },
    ],
    items: [
      // hot/cold/frappe → drink prices per size (null = not offered)
      // price           → fixed price for food items
      // avail: false    → shown as crossed out / sold out
      { id:'c1', cat:'coffee', name:'Americano', desc:'', emoji:'☕',
        hot:6, cold:8, frappe:10, price:null, avail:true },
    ],
  },
};
```

---

## Setting Up a New Store (step by step)

1. **Branch from main**
   ```bash
   git checkout main && git pull origin main
   git checkout -b store/<newstore>
   ```

2. **Edit `config.js`** — fill in every field. Key things:
   - `firebase.url` — **always use the shared URL above**, never create a new Firebase project
   - `firebase.root` — pick a new unique key (e.g. `newstore_kl`); this is the only Firebase change needed
   - `store.sizeLegend` — only include sizes the store actually offers
   - `store.foodAddons` — omit the field entirely if the store has no add-ons
   - `defaultMenu` — replace with real items before first deploy

3. **`wrangler.jsonc`** — already set to `fnb-pwa`, no change needed

4. **Push**
   ```bash
   git add config.js
   git commit -m "feat: <Store Name> store configuration"
   git push -u origin store/<newstore>
   ```
   CF builds automatically. Preview URL appears within ~30 seconds.

5. **First-time admin setup** — open `<preview-url>/admin.html`:
   - Set 4-digit Developer PIN
   - Dev tab → paste OpenRouter API key → Test → Save *(free at openrouter.ai)*
   - Dev tab → **Take Master Snapshot**
   - Security tab → set Owner PIN (default: `1234`)

---

## Recovery

| Problem | Fix |
|---|---|
| Owner forgot PIN | Dev PIN → Security tab → reset Owner PIN |
| Theme broken | Dev PIN → AI Studio → Factory Reset |
| Redeploy needed | Push any commit to the store branch |
| Debug errors | Dev PIN → Dev tab → Error Log |

---

## Architecture

- **No build system** — vanilla HTML/CSS/JS, static files served directly
- **Firebase Realtime Database** — stores menu, theme, config, orders, PINs; namespaced per store via `firebase.root`
- **Cloudflare Workers** — serves static files globally; one CF project (`fnb-pwa`) covers all stores via branch builds
- **OpenRouter** — AI gateway for the theme studio (optional, free tier available)
- **WhatsApp** — order delivery via `wa.me` deep link, no integration needed
