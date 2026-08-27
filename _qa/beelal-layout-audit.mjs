#!/usr/bin/env node

/**
 * ARH Beelal Coffee Layout & Visual Integrity Auditor (Playwright)
 * 
 * Audits:
 * 1. Element Collisions & Bounding Box Overlaps (AABB)
 * 2. Click Target Obstruction (elementFromPoint Hit-Testing)
 * 3. Abnormal Dead Space & Excessive Whitespace Gaps
 * Across Mobile (390px), Tablet (768px), and Desktop (1280px) viewports.
 * 
 * Usage:
 *   node _qa/beelal-layout-audit.mjs
 *   node _qa/beelal-layout-audit.mjs "https://store-beelal-fnb-pwa.arh-homelab.workers.dev/index-v2.html"
 */

import { chromium } from 'playwright';

const VIEWPORTS = [
  { name: 'Mobile (iPhone 14 / Android)', width: 390, height: 844, maxBlankGap: 120 },
  { name: 'Tablet (iPad / Fold)', width: 768, height: 1024, maxBlankGap: 180 },
  { name: 'Desktop (HD / Laptop)', width: 1280, height: 800, maxBlankGap: 240 }
];

const TARGET_URL = (process.argv[2] || process.env.TARGET_URL || 'https://store-beelal-fnb-pwa.arh-homelab.workers.dev/index-v2.html').replace(/\/+$/, '');

console.log('\n======================================================');
console.log('  🎭 [ARH PLAYWRIGHT LAYOUT AUDITOR] Beelal Coffee UI');
console.log('  Target URL:', TARGET_URL);
console.log('======================================================\n');

async function runAudit() {
  let totalErrors = 0;
  let totalWarnings = 0;
  let browser;

  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  } catch (err) {
    console.error('❌ Failed to launch Chromium:', err.message);
    process.exit(1);
  }

  for (const vp of VIEWPORTS) {
    console.log(`📱 [Viewport Matrix] Testing ${vp.name} (${vp.width}x${vp.height})...`);
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      userAgent: 'Mozilla/5.0 (ARH-Playwright-Layout-Auditor/1.0)'
    });

    const page = await context.newPage();

    try {
      const response = await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 20000 });
      if (!response || !response.ok()) {
        console.warn(`  ⚠️ Page returned HTTP ${response ? response.status() : 'null'}, retrying with domcontentloaded...`);
        await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 10000 });
      }

      // Wait 1.5s for initial client render & image layout settling
      await page.waitForTimeout(1500);

      // --- CHECK 1: Interactive Element Overlap Detection (AABB Collision) ---
      const overlaps = await page.evaluate(() => {
        const selector = 'button, input, select, .item-card, .menu-card, .quick-card, .brand, .topbar-inner > *, .category-strip button, .category-chip, .floating-cart';
        const elements = Array.from(document.querySelectorAll(selector)).filter(el => {
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });

        const collisionList = [];

        for (let i = 0; i < elements.length; i++) {
          for (let j = i + 1; j < elements.length; j++) {
            const a = elements[i];
            const b = elements[j];

            // Ignore nested parent-child elements
            if (a.contains(b) || b.contains(a)) continue;

            const rA = a.getBoundingClientRect();
            const rB = b.getBoundingClientRect();

            // Check AABB intersection
            const hasIntersection = !(
              rA.right <= rB.left ||
              rA.left >= rB.right ||
              rA.bottom <= rB.top ||
              rA.top >= rB.bottom
            );

            if (hasIntersection) {
              const overlapW = Math.max(0, Math.min(rA.right, rB.right) - Math.max(rA.left, rB.left));
              const overlapH = Math.max(0, Math.min(rA.bottom, rB.bottom) - Math.max(rA.top, rB.top));
              const overlapArea = overlapW * overlapH;

              // Only flag substantial collisions (> 32px overlap area to ignore 1px border subpixel antialiasing)
              if (overlapArea > 32) {
                const getLabel = (el) => {
                  const tag = el.tagName.toLowerCase();
                  const id = el.id ? `#${el.id}` : '';
                  const cls = el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : '';
                  const text = (el.innerText || el.getAttribute('aria-label') || '').slice(0, 24).trim();
                  return `${tag}${id}${cls}${text ? ` ("${text}")` : ''}`;
                };

                collisionList.push({
                  elementA: getLabel(a),
                  elementB: getLabel(b),
                  overlapPixels: Math.round(overlapArea),
                  rectA: { left: Math.round(rA.left), top: Math.round(rA.top), width: Math.round(rA.width), height: Math.round(rA.height) },
                  rectB: { left: Math.round(rB.left), top: Math.round(rB.top), width: Math.round(rB.width), height: Math.round(rB.height) }
                });
              }
            }
          }
        }
        return collisionList;
      });

      if (overlaps.length === 0) {
        console.log('  ✅ [Overlap Check] 0 unintended element collisions detected.');
      } else {
        console.error(`  ❌ [Overlap Check] Found ${overlaps.length} element collision(s):`);
        for (const o of overlaps.slice(0, 5)) {
          console.error(`     - Collision: ${o.elementA} overlaps with ${o.elementB} (${o.overlapPixels}px²)`);
        }
        totalErrors += overlaps.length;
      }

      // --- CHECK 2: Hit-Testing (Click Obstruction via elementFromPoint) ---
      const hitTestResults = await page.evaluate(() => {
        const interactiveButtons = Array.from(document.querySelectorAll('button:not([disabled]), a[href], .floating-cart, input[type="search"]'))
          .filter(el => {
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
            const r = el.getBoundingClientRect();
            // Element must be inside current viewport scroll to hit-test
            return r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth;
          });

        const blockedElements = [];

        for (const btn of interactiveButtons) {
          const r = btn.getBoundingClientRect();
          const cx = r.left + r.width / 2;
          const cy = r.top + r.height / 2;

          const topElement = document.elementFromPoint(cx, cy);
          if (!topElement) continue;

          // Check if top element is the button, a child of the button, or contains the button
          const isAccessible = btn === topElement || btn.contains(topElement) || topElement.contains(btn);
          if (!isAccessible) {
            const getLabel = (el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${el.className ? `.${el.className.split(' ')[0]}` : ''}`;
            blockedElements.push({
              target: getLabel(btn),
              blockedBy: getLabel(topElement),
              coords: { x: Math.round(cx), y: Math.round(cy) }
            });
          }
        }
        return blockedElements;
      });

      if (hitTestResults.length === 0) {
        console.log('  ✅ [Hit-Testing] 0 click obstructions. All interactive targets hit-tested cleanly.');
      } else {
        console.error(`  ❌ [Hit-Testing] Found ${hitTestResults.length} obstructed click target(s):`);
        for (const h of hitTestResults) {
          console.error(`     - Target ${h.target} is obstructed by ${h.blockedBy} at (${h.coords.x}, ${h.coords.y})`);
        }
        totalErrors += hitTestResults.length;
      }

      // --- CHECK 3: Dead Space & Excessive Whitespace Gaps ---
      const whitespaceResults = await page.evaluate((maxGap) => {
        // Collect visible major structural vertical blocks
        const blocks = Array.from(document.querySelectorAll('.topbar, .hero, .quick-row, .category-strip, .items-grid, .side-panel, footer, .footer'))
          .map(el => {
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') return null;
            const r = el.getBoundingClientRect();
            if (r.height < 10) return null;
            return {
              tag: el.tagName.toLowerCase(),
              cls: el.className ? `.${el.className.split(' ')[0]}` : '',
              top: r.top + window.scrollY,
              bottom: r.bottom + window.scrollY,
              height: r.height
            };
          })
          .filter(Boolean)
          .sort((a, b) => a.top - b.top);

        const abnormalGaps = [];

        for (let i = 0; i < blocks.length - 1; i++) {
          const current = blocks[i];
          const next = blocks[i + 1];

          // Gap between bottom of current block and top of next block
          const gap = next.top - current.bottom;

          if (gap > maxGap) {
            abnormalGaps.push({
              between: `${current.tag}${current.cls} and ${next.tag}${next.cls}`,
              gapPixels: Math.round(gap),
              maxAllowed: maxGap
            });
          }
        }

        // Also check if page height is abnormally tall without content
        const docHeight = document.documentElement.scrollHeight;
        const bodyHeight = document.body.scrollHeight;

        return { abnormalGaps, docHeight, bodyHeight };
      }, vp.maxBlankGap);

      if (whitespaceResults.abnormalGaps.length === 0) {
        console.log(`  ✅ [Whitespace Check] 0 abnormal dead spaces (Threshold: <= ${vp.maxBlankGap}px).`);
      } else {
        console.warn(`  ⚠️ [Whitespace Check] Detected ${whitespaceResults.abnormalGaps.length} large blank space gap(s):`);
        for (const g of whitespaceResults.abnormalGaps) {
          console.warn(`     - Dead Space: ${g.gapPixels}px gap between ${g.between} (max: ${g.maxAllowed}px)`);
        }
        totalWarnings += whitespaceResults.abnormalGaps.length;
      }

      console.log(`  ✨ ${vp.name} audit completed.\n`);

    } catch (err) {
      console.error(`  ❌ Error during ${vp.name} audit:`, err.message);
      totalErrors++;
    } finally {
      await page.close();
      await context.close();
    }
  }

  await browser.close();

  console.log('======================================================');
  if (totalErrors === 0) {
    console.log(`🎉 [PASS] Playwright Layout Audit PASSED (0 errors, ${totalWarnings} warnings).`);
    console.log('======================================================\n');
    process.exit(0);
  } else {
    console.error(`💥 [FAIL] Playwright Layout Audit FAILED with ${totalErrors} error(s).`);
    console.log('======================================================\n');
    process.exit(1);
  }
}

runAudit();
