# Changelog

## [Unreleased]

### Added

- Order-bound receipt upload and local Tesseract.js transcription aid.
- Owner receipt review, correction, confirmation, and kitchen-release states.
- Cloudflare R2 receipt expiry metadata and scheduled 30-day cleanup.

### Security

- Gemini receipt parsing is deliberately disabled and cannot approve payment.
- Receipt media is marked private and non-cacheable.
