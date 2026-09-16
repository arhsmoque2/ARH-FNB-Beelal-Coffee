import { describe, it, expect } from "vitest";
import {
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
} from "../src/pure/cart-engine.js";

describe("CartEngine Pure Invariants & Logic", () => {
  describe("calcItemOptions", () => {
    it("extracts hot, cold, and frappe options when configured", () => {
      const item = { hot: 8.0, cold: 9.0, frappe: 11.5 };
      const options = calcItemOptions(item);
      expect(options).toEqual([
        { label: "Hot", price: 8.0 },
        { label: "Cold", price: 9.0 },
        { label: "Frappe", price: 11.5 }
      ]);
    });

    it("falls back to single price option when specific variants are absent", () => {
      const item = { price: 6.5 };
      const options = calcItemOptions(item);
      expect(options).toEqual([{ label: "", price: 6.5 }]);
    });

    it("supports RM 0 complimentary items without dropping them", () => {
      const item = { price: 0 };
      const options = calcItemOptions(item);
      expect(options).toEqual([{ label: "", price: 0 }]);
    });

    it("filters out negative prices and non-finite values", () => {
      const item = { hot: -5, cold: "invalid", frappe: 10 };
      const options = calcItemOptions(item);
      expect(options).toEqual([{ label: "Frappe", price: 10 }]);
    });

    it("returns empty array on null, undefined, or non-object item", () => {
      expect(calcItemOptions(null)).toEqual([]);
      expect(calcItemOptions(undefined)).toEqual([]);
      expect(calcItemOptions("invalid")).toEqual([]);
    });
  });

  describe("calcItemPrice", () => {
    it("returns base price when no addons are provided", () => {
      const res = calcItemPrice(8.5);
      expect(res).toEqual({
        basePrice: 8.5,
        addonTotal: 0,
        unitPrice: 8.5
      });
    });

    it("sums positive addon prices accurately with decimal precision", () => {
      const addons = [
        { name: "Extra Espresso Shot", price: 2.0 },
        { name: "Oat Milk", price: 1.5 }
      ];
      const res = calcItemPrice(9.0, addons);
      expect(res.basePrice).toBe(9.0);
      expect(res.addonTotal).toBe(3.5);
      expect(res.unitPrice).toBe(12.5);
    });

    it("ignores zero or negative addon prices", () => {
      const addons = [
        { name: "No Sugar", price: 0 },
        { name: "Bad Addon", price: -1.0 },
        { name: "Vanilla Syrup", price: 1.5 }
      ];
      const res = calcItemPrice(8.0, addons);
      expect(res.addonTotal).toBe(1.5);
      expect(res.unitPrice).toBe(9.5);
    });

    it("handles floating point precision safely (e.g. 0.1 + 0.2)", () => {
      const addons = [
        { name: "A", price: 0.1 },
        { name: "B", price: 0.2 }
      ];
      const res = calcItemPrice(0, addons);
      expect(res.addonTotal).toBe(0.3);
      expect(res.unitPrice).toBe(0.3);
    });
  });

  describe("areAddonsEqual", () => {
    it("identifies identical addons arrays regardless of item order", () => {
      const a = [
        { name: "Syrup", value: "Caramel", price: 1.5 },
        { name: "Milk", value: "Oat", price: 2.0 }
      ];
      const b = [
        { name: "Milk", value: "Oat", price: 2.0 },
        { name: "Syrup", value: "Caramel", price: 1.5 }
      ];
      expect(areAddonsEqual(a, b)).toBe(true);
    });

    it("identifies different addons", () => {
      const a = [{ name: "Milk", value: "Oat", price: 2.0 }];
      const b = [{ name: "Milk", value: "Soy", price: 2.0 }];
      expect(areAddonsEqual(a, b)).toBe(false);
    });

    it("returns true for two empty arrays", () => {
      expect(areAddonsEqual([], [])).toBe(true);
    });
  });

  describe("calcCartTotals", () => {
    it("returns zero counts and total for an empty cart", () => {
      const res = calcCartTotals([]);
      expect(res).toEqual({ totalCount: 0, total: 0 });
    });

    it("accurately sums total item count and line prices", () => {
      const cart = [
        { id: "1", qty: 2, price: 16.0 },
        { id: "2", qty: 1, price: 6.9 }
      ];
      const res = calcCartTotals(cart);
      expect(res.totalCount).toBe(3);
      expect(res.total).toBe(22.9);
    });

    it("calculates price from unitPrice * qty if line price is not set", () => {
      const cart = [{ id: "1", qty: 3, unitPrice: 5.5 }];
      const res = calcCartTotals(cart);
      expect(res.totalCount).toBe(3);
      expect(res.total).toBe(16.5);
    });

    it("handles non-array inputs safely", () => {
      expect(calcCartTotals(null)).toEqual({ totalCount: 0, total: 0 });
      expect(calcCartTotals(undefined)).toEqual({ totalCount: 0, total: 0 });
    });
  });

  describe("addItemToCart", () => {
    const mockItem = { id: "coffee_1", name: "Americano" };
    const mockOption = { label: "Hot", price: 7.0 };

    it("appends a new item to an empty cart", () => {
      const cart = addItemToCart([], mockItem, mockOption, [], "item_1");
      expect(cart).toHaveLength(1);
      expect(cart[0]).toMatchObject({
        uid: "item_1",
        id: "coffee_1",
        name: "Americano",
        option: "Hot",
        unitPrice: 7.0,
        price: 7.0,
        qty: 1,
        addons: []
      });
    });

    it("auto-generates a uid if customUid is omitted", () => {
      const cart = addItemToCart([], mockItem, mockOption);
      expect(cart).toHaveLength(1);
      expect(typeof cart[0].uid).toBe("string");
      expect(cart[0].uid.length).toBeGreaterThan(5);
    });

    it("increments quantity and updates line price when adding an identical item", () => {
      const initialCart = [
        {
          uid: "item_1",
          id: "coffee_1",
          name: "Americano",
          option: "Hot",
          unitPrice: 7.0,
          price: 7.0,
          qty: 1,
          addons: []
        }
      ];
      const updatedCart = addItemToCart(initialCart, mockItem, mockOption, []);
      expect(updatedCart).toHaveLength(1);
      expect(updatedCart[0].qty).toBe(2);
      expect(updatedCart[0].price).toBe(14.0);
    });

    it("creates a separate entry when the variant option differs", () => {
      const initialCart = [
        {
          uid: "item_1",
          id: "coffee_1",
          name: "Americano",
          option: "Hot",
          unitPrice: 7.0,
          price: 7.0,
          qty: 1,
          addons: []
        }
      ];
      const coldOption = { label: "Cold", price: 8.0 };
      const updatedCart = addItemToCart(initialCart, mockItem, coldOption, [], "item_2");
      expect(updatedCart).toHaveLength(2);
      expect(updatedCart[1].option).toBe("Cold");
      expect(updatedCart[1].price).toBe(8.0);
    });

    it("creates a separate entry when addons differ", () => {
      const initialCart = [
        {
          uid: "item_1",
          id: "coffee_1",
          name: "Americano",
          option: "Hot",
          unitPrice: 7.0,
          price: 7.0,
          qty: 1,
          addons: []
        }
      ];
      const addons = [{ name: "Extra Shot", price: 2.0 }];
      const updatedCart = addItemToCart(initialCart, mockItem, mockOption, addons, "item_2");
      expect(updatedCart).toHaveLength(2);
      expect(updatedCart[1].unitPrice).toBe(9.0);
      expect(updatedCart[1].price).toBe(9.0);
    });

    it("returns a copy of cart if item or option is missing", () => {
      const cart = [{ uid: "1" }];
      expect(addItemToCart(cart, null, mockOption)).toEqual(cart);
      expect(addItemToCart(cart, mockItem, null)).toEqual(cart);
    });
  });

  describe("changeCartItemQty", () => {
    it("increments quantity and updates price accordingly", () => {
      const cart = [{ uid: "u1", name: "Latte", qty: 1, unitPrice: 10.0, price: 10.0 }];
      const next = changeCartItemQty(cart, "u1", 1);
      expect(next[0].qty).toBe(2);
      expect(next[0].price).toBe(20.0);
    });

    it("decrements quantity and updates price accordingly", () => {
      const cart = [{ uid: "u1", name: "Latte", qty: 3, unitPrice: 10.0, price: 30.0 }];
      const next = changeCartItemQty(cart, "u1", -1);
      expect(next[0].qty).toBe(2);
      expect(next[0].price).toBe(20.0);
    });

    it("removes item from cart when quantity drops to 0", () => {
      const cart = [{ uid: "u1", name: "Latte", qty: 1, unitPrice: 10.0, price: 10.0 }];
      const next = changeCartItemQty(cart, "u1", -1);
      expect(next).toHaveLength(0);
    });

    it("removes item without setting negative qty when decrement exceeds current qty", () => {
      const cart = [{ uid: "u1", name: "Latte", qty: 2, unitPrice: 10.0, price: 20.0 }];
      const next = changeCartItemQty(cart, "u1", -5);
      expect(next).toHaveLength(0);
    });

    it("returns unchanged items if uid is not found", () => {
      const cart = [{ uid: "u1", name: "Latte", qty: 1, unitPrice: 10.0, price: 10.0 }];
      const next = changeCartItemQty(cart, "unknown", 1);
      expect(next).toEqual(cart);
    });
  });

  describe("removeCartItem", () => {
    it("removes the specific item by uid", () => {
      const cart = [
        { uid: "u1", name: "Latte" },
        { uid: "u2", name: "Americano" }
      ];
      const next = removeCartItem(cart, "u1");
      expect(next).toHaveLength(1);
      expect(next[0].uid).toBe("u2");
    });

    it("returns original array copy when uid does not match", () => {
      const cart = [{ uid: "u1", name: "Latte" }];
      const next = removeCartItem(cart, "u99");
      expect(next).toHaveLength(1);
    });

    it("handles non-array safely", () => {
      expect(removeCartItem(null, "u1")).toEqual([]);
    });
  });

  describe("formatMoney", () => {
    it("formats standard amounts in RM", () => {
      expect(formatMoney(15.5)).toBe("RM 15.50");
      expect(formatMoney(0)).toBe("RM 0.00");
      expect(formatMoney("24")).toBe("RM 24.00");
    });

    it("handles non-finite or invalid input by defaulting to 0.00", () => {
      expect(formatMoney(NaN)).toBe("RM 0.00");
      expect(formatMoney(null)).toBe("RM 0.00");
    });
  });

  describe("formatWhatsAppOrder", () => {
    const mockCart = [
      {
        name: "Americano",
        option: "Cold",
        qty: 2,
        price: 16.0,
        addons: []
      },
      {
        name: "Croissant",
        option: "Butter",
        qty: 1,
        price: 7.5,
        addons: [{ name: "Extra Jam", value: "Strawberry", price: 1.0 }]
      }
    ];

    it("formats standard cash WhatsApp order text correctly", () => {
      const msg = formatWhatsAppOrder({
        cart: mockCart,
        storeName: "Beelal Coffee",
        customerName: "Ahmad",
        note: "Less sugar please",
        isQr: false,
        appName: "Beelal Coffee"
      });

      expect(msg).toContain("🍵 *Order – Beelal Coffee*");
      expect(msg).toContain("👤 Ahmad");
      expect(msg).toContain("1. 2x Americano (Cold) — RM 16.00");
      expect(msg).toContain("2. Croissant (Butter; Extra Jam: Strawberry (+RM1.00)) — RM 7.50");
      expect(msg).toContain("💰 *Total: RM 23.50*");
      expect(msg).toContain("📝 Less sugar please");
      expect(msg).toContain("_via Beelal Coffee menu_");
    });

    it("formats QR WhatsApp order with payment ref and confirmation prompt", () => {
      const msg = formatWhatsAppOrder({
        cart: mockCart,
        storeName: "Beelal Coffee",
        customerName: "Sarah",
        note: "",
        isQr: true,
        qrRef: "BC-TEST1234",
        appName: "Beelal Coffee"
      });

      expect(msg).toContain("🍵 *QR Order – Beelal Coffee*");
      expect(msg).toContain("👤 Sarah");
      expect(msg).toContain("💳 Paid via QR · Ref *BC-TEST1234*");
      expect(msg).toContain("💰 *Total: RM 23.50*");
      expect(msg).not.toContain("📝");
      expect(msg).toContain("_via Beelal Coffee menu — please confirm payment in admin_");
    });

    it("uses default Customer name when customerName is blank", () => {
      const msg = formatWhatsAppOrder({ cart: mockCart, customerName: "   " });
      expect(msg).toContain("👤 Customer");
    });
  });

  describe("validateOrderPayload", () => {
    const validCashPayload = {
      name: "Siti",
      items: [{ name: "Cappuccino", price: 10.0, qty: 1 }],
      total: 10.0,
      payment_method: "cash",
      consent: { privacy_agreed: true }
    };

    it("validates a healthy cash order successfully", () => {
      const res = validateOrderPayload(validCashPayload);
      expect(res.valid).toBe(true);
      expect(res.errors).toHaveLength(0);
    });

    it("validates a healthy QR order successfully", () => {
      const qrPayload = {
        ...validCashPayload,
        payment_method: "qr",
        payment_ref: "BC-XYZ"
      };
      const res = validateOrderPayload(qrPayload);
      expect(res.valid).toBe(true);
      expect(res.errors).toHaveLength(0);
    });

    it("rejects payload missing customer name", () => {
      const res = validateOrderPayload({ ...validCashPayload, name: "" });
      expect(res.valid).toBe(false);
      expect(res.errors).toContain(
        "Customer name is required and must be 100 characters or fewer."
      );
    });

    it("rejects payload with empty items array", () => {
      const res = validateOrderPayload({ ...validCashPayload, items: [] });
      expect(res.valid).toBe(false);
      expect(res.errors).toContain("Order must contain at least one item.");
    });

    it("rejects payload with negative item price or non-positive qty", () => {
      const badItems = [{ name: "Coffee", price: -5, qty: 0 }];
      const res = validateOrderPayload({ ...validCashPayload, items: badItems });
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("non-negative price"))).toBe(true);
      expect(res.errors.some((e) => e.includes("positive integer quantity"))).toBe(true);
    });

    it("rejects QR payment without payment_ref", () => {
      const res = validateOrderPayload({
        ...validCashPayload,
        payment_method: "qr",
        payment_ref: ""
      });
      expect(res.valid).toBe(false);
      expect(res.errors).toContain("QR payment requires a payment_ref.");
    });

    it("rejects payload with negative total", () => {
      const res = validateOrderPayload({ ...validCashPayload, total: -1 });
      expect(res.valid).toBe(false);
      expect(res.errors).toContain("Total must be a non-negative number.");
    });

    it("rejects payload with invalid payment method", () => {
      const res = validateOrderPayload({ ...validCashPayload, payment_method: "crypto" });
      expect(res.valid).toBe(false);
      expect(res.errors).toContain("Payment method must be one of: cash, qr");
    });

    it("rejects payload when item missing name", () => {
      const res = validateOrderPayload({ ...validCashPayload, items: [{ price: 10, qty: 1 }] });
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("must specify a valid name"))).toBe(true);
    });

    it("rejects order without privacy consent", () => {
      const res = validateOrderPayload({
        ...validCashPayload,
        consent: { privacy_agreed: false }
      });
      expect(res.valid).toBe(false);
      expect(res.errors).toContain("Customer privacy consent must be agreed.");
    });

    it("rejects non-object payload", () => {
      expect(validateOrderPayload(null).valid).toBe(false);
      expect(validateOrderPayload("bad").valid).toBe(false);
    });
  });

  describe("buildOrderPayload", () => {
    const mockCart = [
      {
        id: "c1",
        name: "Flat White",
        option: "Hot",
        unitPrice: 9.0,
        price: 18.0,
        qty: 2,
        addons: []
      }
    ];

    it("constructs canonical cash order payload with calculated totals and timestamps", () => {
      const fixedTs = 1773705600000;
      const payload = buildOrderPayload({
        cart: mockCart,
        customerName: "Hakim",
        note: "Extra hot",
        paymentMethod: "cash",
        timestamp: fixedTs
      });

      expect(payload).toEqual({
        order_id: "ord_1773705600000",
        name: "Hakim",
        items: [
          {
            name: "Flat White",
            size: "Hot",
            qty: 2,
            price: 18.0,
            unitPrice: 9.0,
            addons: []
          }
        ],
        total: 18.0,
        note: "Extra hot",
        payment_method: "cash",
        payment_status: "cash_pending",
        consent: {
          privacy_agreed: true,
          privacy_notice_version: "2026-06-11-community-order-v2",
          signed: true,
          consented_at: fixedTs
        },
        ts: fixedTs
      });
    });

    it("constructs canonical QR order payload with payment_ref and receipt_url", () => {
      const fixedTs = 1773705600000;
      const payload = buildOrderPayload({
        cart: mockCart,
        customerName: "Hakim",
        paymentMethod: "qr",
        qrRef: "BC-QR123",
        receiptUrl: "https://example.com/receipt.jpg",
        timestamp: fixedTs
      });

      expect(payload.payment_method).toBe("qr");
      expect(payload.payment_status).toBe("awaiting_confirmation");
      expect(payload.payment_ref).toBe("BC-QR123");
      expect(payload.receipt_url).toBe("https://example.com/receipt.jpg");
    });
  });
});
