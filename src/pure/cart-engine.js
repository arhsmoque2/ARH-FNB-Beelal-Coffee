/**
 * @file cart-engine.js
 * Pure mathematical, state transition, and formatting invariants for the Beelal Coffee cart & checkout.
 * Pure logic — completely decoupled from DOM and network APIs.
 * Usable in Node/Vitest via standard ES modules, and in browser via window.CartEngine.
 */

/**
 * Normalizes and extracts available size/variant options from a menu item.
 * Supports hot, cold, frappe, or single price. Filters out non-finite and negative prices.
 *
 * @param {object} item - Menu item configuration
 * @returns {Array<{label: string, price: number}>}
 */
export function calcItemOptions(item) {
  if (!item || typeof item !== "object") return [];
  const opts = [];
  if (item.hot != null) opts.push({ label: "Hot", price: Number(item.hot) });
  if (item.cold != null) opts.push({ label: "Cold", price: Number(item.cold) });
  if (item.frappe != null) opts.push({ label: "Frappe", price: Number(item.frappe) });
  if (!opts.length && item.price != null) opts.push({ label: "", price: Number(item.price) });
  return opts.filter((o) => Number.isFinite(o.price) && o.price >= 0);
}

/**
 * Computes unit price and addon total for an item given an option price and selected addons.
 *
 * @param {number} optionPrice - Base price for selected variant
 * @param {Array<{name: string, value?: string, price?: number}>} [addons=[]] - Selected addons
 * @returns {{basePrice: number, addonTotal: number, unitPrice: number}}
 */
export function calcItemPrice(optionPrice, addons = []) {
  const base = Number(optionPrice);
  const safeBase = Number.isFinite(base) && base >= 0 ? base : 0;
  let addonTotal = 0;
  if (Array.isArray(addons)) {
    for (const addon of addons) {
      if (!addon) continue;
      const p = Number(addon.price);
      if (Number.isFinite(p) && p > 0) {
        addonTotal += p;
      }
    }
  }
  const safeAddonTotal = Math.round(addonTotal * 100) / 100;
  const unitPrice = Math.round((safeBase + safeAddonTotal) * 100) / 100;
  return {
    basePrice: safeBase,
    addonTotal: safeAddonTotal,
    unitPrice
  };
}

/**
 * Checks structural equality of two addon arrays (name, value, price).
 *
 * @param {Array} a
 * @param {Array} b
 * @returns {boolean}
 */
export function areAddonsEqual(a = [], b = []) {
  const listA = Array.isArray(a) ? a : [];
  const listB = Array.isArray(b) ? b : [];
  if (listA.length !== listB.length) return false;
  const normA = listA
    .map((x) => `${x?.name || ""}:${x?.value || ""}:${Number(x?.price) || 0}`)
    .sort();
  const normB = listB
    .map((x) => `${x?.name || ""}:${x?.value || ""}:${Number(x?.price) || 0}`)
    .sort();
  return JSON.stringify(normA) === JSON.stringify(normB);
}

/**
 * Calculates cart total quantity and total price, rounding to 2 decimal places.
 * Guarantees non-negative outputs.
 *
 * @param {Array<object>} cart
 * @returns {{totalCount: number, total: number}}
 */
export function calcCartTotals(cart = []) {
  if (!Array.isArray(cart)) return { totalCount: 0, total: 0 };
  let totalCount = 0;
  let rawTotal = 0;
  for (const item of cart) {
    if (!item) continue;
    const qty = Math.max(0, parseInt(item.qty, 10) || 0);
    const linePrice = Number(item.price);
    const unitPrice = Number(item.unitPrice);

    totalCount += qty;
    if (Number.isFinite(linePrice) && linePrice >= 0) {
      rawTotal += linePrice;
    } else if (Number.isFinite(unitPrice) && unitPrice >= 0) {
      rawTotal += unitPrice * qty;
    }
  }
  return {
    totalCount,
    total: Math.round(rawTotal * 100) / 100
  };
}

/**
 * Adds an item to the cart or increments existing quantity if identical option and addons match.
 * Returns an immutable, newly updated cart array.
 *
 * @param {Array<object>} cart
 * @param {object} item
 * @param {{label: string, price: number}} option
 * @param {Array<object>} [selectedAddons=[]]
 * @param {string} [customUid]
 * @returns {Array<object>}
 */
export function addItemToCart(cart = [], item, option, selectedAddons = [], customUid = null) {
  if (!item || !option) return Array.isArray(cart) ? [...cart] : [];
  const nextCart = Array.isArray(cart)
    ? cart.map((i) => ({ ...i, addons: Array.isArray(i.addons) ? [...i.addons] : [] }))
    : [];
  const optLabel = option.label || "";
  const optPrice = Number(option.price) || 0;
  const { unitPrice } = calcItemPrice(optPrice, selectedAddons);

  const existing = nextCart.find(
    (c) =>
      c.id === item.id && (c.option || "") === optLabel && areAddonsEqual(c.addons, selectedAddons)
  );

  if (existing) {
    const nextQty = (parseInt(existing.qty, 10) || 1) + 1;
    existing.qty = nextQty;
    existing.price = Math.round((existing.unitPrice || unitPrice) * nextQty * 100) / 100;
  } else {
    const uid = customUid || `c_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    nextCart.push({
      uid,
      id: item.id,
      name: item.name || "Item",
      option: optLabel,
      unitPrice,
      price: unitPrice,
      qty: 1,
      addons: Array.isArray(selectedAddons) ? [...selectedAddons] : []
    });
  }
  return nextCart;
}

/**
 * Adjusts quantity for a cart item identified by its uid.
 * Invariant: If next quantity is <= 0, the item is purged from the cart.
 * If > 0, price is updated to unitPrice * nextQty.
 *
 * @param {Array<object>} cart
 * @param {string} uid
 * @param {number} delta
 * @returns {Array<object>}
 */
export function changeCartItemQty(cart = [], uid, delta) {
  if (!Array.isArray(cart) || !uid) return [];
  const nextCart = [];
  for (const item of cart) {
    if (!item) continue;
    if (item.uid === uid) {
      const currentQty = parseInt(item.qty, 10) || 1;
      const nextQty = currentQty + delta;
      if (nextQty > 0) {
        const unit = Number.isFinite(Number(item.unitPrice))
          ? Number(item.unitPrice)
          : Number(item.price) / currentQty || 0;
        nextCart.push({
          ...item,
          qty: nextQty,
          unitPrice: unit,
          price: Math.round(unit * nextQty * 100) / 100
        });
      }
    } else {
      nextCart.push({ ...item });
    }
  }
  return nextCart;
}

/**
 * Removes an item from the cart by its uid.
 *
 * @param {Array<object>} cart
 * @param {string} uid
 * @returns {Array<object>}
 */
export function removeCartItem(cart = [], uid) {
  if (!Array.isArray(cart)) return [];
  return cart.filter((item) => item && item.uid !== uid);
}

/**
 * Formats a monetary amount into a clean currency string.
 *
 * @param {number} value
 * @param {string} [currency="RM"]
 * @returns {string}
 */
export function formatMoney(value, currency = "RM") {
  const n = Number(value);
  const num = Number.isFinite(n) ? n : 0;
  return `${currency} ${num.toFixed(2)}`;
}

/**
 * Builds the canonical WhatsApp order message text for cash or QR orders.
 *
 * @param {object} params
 * @param {Array<object>} params.cart
 * @param {string} [params.storeName="Beelal Coffee"]
 * @param {string} [params.customerName="Customer"]
 * @param {string} [params.note=""]
 * @param {boolean} [params.isQr=false]
 * @param {string} [params.qrRef=""]
 * @param {string} [params.appName="Beelal Coffee"]
 * @param {string} [params.currency="RM"]
 * @returns {string}
 */
export function formatWhatsAppOrder({
  cart = [],
  storeName = "Beelal Coffee",
  customerName = "Customer",
  note = "",
  isQr = false,
  qrRef = "",
  appName = "Beelal Coffee",
  currency = "RM"
} = {}) {
  const safeCustomer = (customerName || "").trim() || "Customer";
  const { total } = calcCartTotals(cart);
  const moneyStr = (val) => `${currency} ${Number(val || 0).toFixed(2)}`;

  let msg = "";
  if (isQr) {
    msg += `🍵 *QR Order – ${storeName}*\n`;
    msg += `👤 ${safeCustomer}\n💳 Paid via QR · Ref *${qrRef || "N/A"}*\n\n*Items:*\n`;
  } else {
    msg += `🍵 *Order – ${storeName}*\n`;
    msg += `👤 ${safeCustomer}\n\n*Items:*\n`;
  }

  (cart || []).forEach((item, index) => {
    if (!item) return;
    const addonsStr = (item.addons || [])
      .map(
        (a) =>
          `${a.name}: ${a.value}${a.price ? ` (+${currency}${Number(a.price).toFixed(2)})` : ""}`
      )
      .join(", ");
    const optionAndAddons = [item.option, addonsStr].filter(Boolean).join("; ");
    const qtyPrefix = item.qty && item.qty > 1 ? `${item.qty}x ` : "";
    const linePrice = moneyStr(item.price);
    msg += `${index + 1}. ${qtyPrefix}${item.name}${optionAndAddons ? ` (${optionAndAddons})` : ""} — ${linePrice}\n`;
  });

  msg += `\n💰 *Total: ${moneyStr(total)}*`;

  const trimmedNote = (note || "").trim();
  if (trimmedNote) {
    msg += `\n\n📝 ${trimmedNote}`;
  }

  if (isQr) {
    msg += `\n\n_via ${appName} menu — please confirm payment in admin_`;
  } else {
    msg += `\n\n_via ${appName} menu_`;
  }

  return msg;
}

/**
 * Validates an order payload before dispatching to the Worker / database.
 * Returns an object with `valid: boolean` and an array of descriptive error messages.
 *
 * @param {object} payload
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateOrderPayload(payload) {
  const errors = [];
  if (!payload || typeof payload !== "object") {
    return { valid: false, errors: ["Order payload must be an object."] };
  }

  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  if (!name || name.length > 100) {
    errors.push("Customer name is required and must be 100 characters or fewer.");
  }

  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    errors.push("Order must contain at least one item.");
  } else {
    payload.items.forEach((item, index) => {
      if (!item || typeof item !== "object" || !item.name) {
        errors.push(`Item at index ${index} must specify a valid name.`);
        return;
      }
      const price = Number(item.price);
      if (!Number.isFinite(price) || price < 0) {
        errors.push(`Item "${item.name}" must have a non-negative price.`);
      }
      const qty = item.qty != null ? Number(item.qty) : 1;
      if (!Number.isInteger(qty) || qty < 1) {
        errors.push(`Item "${item.name}" must have a positive integer quantity.`);
      }
    });
  }

  const total = Number(payload.total);
  if (!Number.isFinite(total) || total < 0) {
    errors.push("Total must be a non-negative number.");
  }

  const allowedMethods = ["cash", "qr"];
  if (!allowedMethods.includes(payload.payment_method)) {
    errors.push(`Payment method must be one of: ${allowedMethods.join(", ")}`);
  }

  if (payload.payment_method === "qr" && !payload.payment_ref) {
    errors.push("QR payment requires a payment_ref.");
  }

  if (!payload.consent || payload.consent.privacy_agreed !== true) {
    errors.push("Customer privacy consent must be agreed.");
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Constructs a normalized, validated order payload object ready for submission.
 *
 * @param {object} params
 * @returns {object}
 */
export function buildOrderPayload({
  cart = [],
  customerName = "Customer",
  note = "",
  paymentMethod = "cash",
  qrRef = "",
  privacyVersion = "2026-06-11-community-order-v2",
  timestamp = Date.now(),
  orderId = null,
  receiptUrl = null
} = {}) {
  const { total } = calcCartTotals(cart);
  const cleanName = (customerName || "").trim() || "Customer";
  const id = orderId || `ord_${timestamp}`;
  const isQr = paymentMethod === "qr";

  const payload = {
    order_id: id,
    name: cleanName,
    items: (cart || []).map((i) => ({
      name: String(i.name || "Item"),
      size: String(i.option || "Regular"),
      qty: Number(i.qty || 1),
      price: Number(i.price || 0),
      unitPrice: Number(i.unitPrice ?? i.price ?? 0),
      addons: Array.isArray(i.addons) ? i.addons : []
    })),
    total,
    note: typeof note === "string" ? note.trim() : "",
    payment_method: isQr ? "qr" : "cash",
    payment_status: isQr ? "awaiting_confirmation" : "cash_pending",
    consent: {
      privacy_agreed: true,
      privacy_notice_version: privacyVersion,
      signed: true,
      consented_at: timestamp
    },
    ts: timestamp
  };

  if (isQr && qrRef) {
    payload.payment_ref = qrRef;
  }
  if (receiptUrl) {
    payload.receipt_url = receiptUrl;
  }

  return payload;
}

const CartEngine = {
  calcItemOptions,
  calcItemPrice,
  areAddonsEqual,
  calcCartTotals,
  addItemToCart,
  changeCartItemQty,
  removeCartItem,
  formatMoney,
  formatWhatsAppOrder,
  validateOrderPayload,
  buildOrderPayload
};

if (typeof window !== "undefined") {
  window.CartEngine = CartEngine;
}

export default CartEngine;
