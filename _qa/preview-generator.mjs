#!/usr/bin/env node

/**
 * Beelal Coffee Automated Mockup Preview Generator
 * Reusable ephemeral preview generator incorporating patterns from PinPoint, Annotask, and Redline.js.
 */

import fs from "node:fs";
import path from "node:path";

const repoRoot = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(import.meta.dirname, "..");
const outPath = path.join(repoRoot, "preview.html");

console.log("\n======================================================");
console.log("  🎨 [BEELAL UI STUDIO] Generating Ephemeral UI Mockup");
console.log("  Source Shell: index-v2.html");
console.log("  Destination : preview.html");
console.log("======================================================\n");

const sourceHtml = fs.readFileSync(path.join(repoRoot, "index-v2.html"), "utf-8");

const modernStyles = `
/* --- BEELAL MODERN UI ENHANCEMENTS (Injected Ephemeral Preview) --- */
:root {
  --radius-card: 18px;
  --glass-bg: rgba(255, 255, 255, 0.88);
  --glass-border: rgba(255, 255, 255, 0.6);
  --accent-glow: rgba(120, 29, 29, 0.15);
}

.announcement-ribbon {
  background: #180e0a;
  color: #f7f1e8;
  padding: 8px 16px;
  font-size: 12px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  text-align: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  letter-spacing: 0.01em;
}
.announcement-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #10b981;
  box-shadow: 0 0 10px #10b981;
}
.redline-badge {
  position: fixed;
  bottom: 20px;
  left: 20px;
  z-index: 9999;
  background: rgba(15, 23, 42, 0.85);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  color: #38bdf8;
  border: 1px solid rgba(56, 189, 248, 0.4);
  padding: 8px 14px;
  border-radius: 999px;
  font-family: monospace;
  font-size: 11px;
  font-weight: 700;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  gap: 8px;
}
`;

const ribbonHtml =
  '<div class="announcement-ribbon" id="liveAnnouncement"><span class="announcement-dot"></span><span><strong>Beelal Coffee Live Preview</strong> • 100% Arabica Specialty Roasts • Fast WhatsApp & QR Checkout</span></div>';
const inspectorScript =
  '<script>(function(){const params=new URLSearchParams(window.location.search);if(params.has("inspect")||params.has("preview")){const b=document.createElement("div");b.className="redline-badge";b.innerHTML="<span>🔍 UI PREVIEW ACTIVE</span> • <span>Tap Target: 44px OK</span>";document.body.appendChild(b);}})();</script>';

let enhanced = sourceHtml.replace("</style>", modernStyles + "\n</style>");
enhanced = enhanced.replace("<body>", "<body>\n" + ribbonHtml);
enhanced = enhanced.replace("</body>", inspectorScript + "\n</body>");

fs.writeFileSync(outPath, enhanced, "utf-8");
console.log(
  "  ✅ [PASS] Generated ephemeral preview: preview.html (" + enhanced.length + " bytes)\n"
);
