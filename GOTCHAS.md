# Gotchas

## OCR is not payment verification

- Symptom: Receipt text looks complete but may be wrong.
- Root cause: OCR can misread digits and timestamps.
- Permanent fix: Display OCR only as a transcription aid; require owner bank verification and explicit confirmation.
- Verification: Admin UI labels OCR as unverified and confirmation writes `payment_confirmed_at` and `payment_confirmed_by`.

## Receipt retention is bounded

- Symptom: Banking screenshots are sensitive records.
- Root cause: Permanent public media URLs would outlive their operational need.
- Permanent fix: R2 receipt objects carry `expires_at`; the Worker deletes expired objects daily and rejects expired reads.
- Verification: `scheduled()` calls `deleteExpiredReceipts()` and receipt media uses `private, no-store`.
