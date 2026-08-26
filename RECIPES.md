# Recipes

## Local verification

```powershell
node worker.js
node _qa/beelal-ui-ux-quality-gate.mjs
node D:/_ARH-AGENT-OS/_AGENT-CAPABILITIES/arh-js-devkit/bin/arh-js-doctor.mjs .
```

`node worker.js` is a syntax check entry point; use `node --check worker.js` when running it directly.

## Receipt lifecycle smoke test

1. Open the customer menu and add an item.
2. Send the order; confirm the WhatsApp message includes the generated order ID.
3. Upload a JPG/PNG/WebP receipt.
4. Confirm Firebase contains `orders/{order_id}/receipt` with OCR text and an expiry timestamp.
5. Open Admin > Orders, compare the image and OCR text with the bank notification.
6. Correct fields if needed, then tap `Payment received`.
7. Confirm `payment_status=paid`, `order_status=confirmed_for_kitchen`, and confirmation audit fields.
