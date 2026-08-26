# Beelal Architecture

## Order and payment boundary

`index-v2.html` creates the order ID before opening WhatsApp. WhatsApp is a notification/fallback channel. The customer receipt is uploaded against that order ID and OCR runs locally with Tesseract.js as transcription assistance only.

The owner reviews the original receipt image, checks the bank notification, optionally corrects the OCR fields, and taps `Payment received`. That action writes the permanent sales fields and releases the order to the kitchen. The Gemini parser is retained as a deliberately disabled future option and is not in the approval path.

## Storage

- Firebase RTDB: order, payment state, corrected sales fields, timestamps, and audit fields.
- Cloudflare R2: private receipt photo under `receipts/{order_id}/...`.
- Receipt objects carry an expiry timestamp and are deleted by the daily Worker scheduled cleanup. Expired receipt requests return `410`.

## Invariants

- No customer-editable OCR fields.
- OCR never changes payment state.
- Only owner confirmation changes `payment_status` to `paid`.
- Receipt photos are retained for no more than 30 days.
