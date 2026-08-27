# ADR-002: Modern F&B UI Architecture, Ephemeral Preview Studio, and Redline Inspector

**Date**: 2026-08-27  
**Status**: Accepted  
**Repository**: rhsmoque2/ARH-FNB-Beelal-Coffee

---

## Context & Problem Statement

The Beelal Coffee storefront (index-v2.html) is a high-volume production PWA serving live coffee orders directly to baristas via WhatsApp and Firebase RTDB. While functionally robust, the storefront required visual modernization, improved mobile ergonomics, and automated developer tooling for AI agents.

Specifically:

1. **UI Ergonomics & Information Hierarchy**:
   - Mobile users need rapid category filtering without excessive vertical scrolling.
   - Customers ordering specialty drinks need fast size/temperature variant selection directly on cards.
   - Search required instant feedback and recommendation chips for new customers.
2. **Safe Agent Iteration**:
   - AI and cloud sandbox agents should not rebuild the 3,700-line shell from scratch for UI experiments.
   - Developers need an ephemeral mockup generation mechanism (preview.html) with in-browser visual inspection (Redline mode) before applying changes to production.

---

## Architectural Decisions

### 1. Modern Mobile-First UI Components (FWDTools Patterns)

- **Glassmorphic Announcement Ribbon**: Ambient gradient top bar with live status indicator pulse.
- **Scroll-Snap Category Filter Rail**: Horizontal swipeable category rail with live item counters (☕ Coffee (12)) and IntersectionObserver scroll-spy active state tracking.
- **Enhanced Search Bar**: Instant live debounced filtering across titles and tags with suggestion chips (Spanish Latte, Mac & Cheese, Americano).
- **Direct-in-Card Steppers & Variant Matrix**: In-card temperature/size toggles and direct [- 1 +] quantity steppers with micro-interactions.
- **Streamlined 2-Step Checkout**: Slide-up bottom sheet with instant WhatsApp order generation and high-contrast DuitNow QR Pay integration.

### 2. Ephemeral Preview Studio (_qa/preview-generator.mjs)

- Implemented a zero-boilerplate preview compiler that reads index-v2.html, layers enhanced design tokens and experimental components, and emits an ephemeral preview.html.
- preview.html is git-ignored, allowing sandbox agents to validate mockups, capture headless screenshots, or test UI deltas without touching the production deployment branch.

### 3. In-Browser Redline & Quality Inspector (PinPoint / Redline.js Patterns)

- Integrated a diagnostic inspector active when URL contains ?inspect=1 or ?preview=1.
- Audits 44px minimum tap targets, layout bounding boxes, and contrast ratios directly in the browser viewport.

---

## Consequences & Verification

- **Pre-Deploy Assurance**:
  pm run check runs Oxlint (<200ms), the ARH UI/UX DevKit gate, and the Cloud Infrastructure Doctor.
- **Fast Prototyping**: Sandbox agents can run
  pm run preview:generate to spin up full mockups instantaneously.
- **Production Integrity**: index-v2.html remains the singular source of truth while benefiting from modern design tokens and fluid animations.
