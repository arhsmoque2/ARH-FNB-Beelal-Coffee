import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const iconsDir = path.join(repoRoot, "icons");

await fs.mkdir(iconsDir, { recursive: true });

function getSvg(maskable = false) {
  // Maskable icons require safe zone (inner 80% of 512px = ~410px, 51px margin on all sides)
  const scale = maskable ? 0.76 : 0.88;
  const translate = (512 * (1 - scale)) / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e120a" />
      <stop offset="50%" stop-color="#140a05" />
      <stop offset="100%" stop-color="#090402" />
    </linearGradient>
    <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fde68a" />
      <stop offset="35%" stop-color="#f59e0b" />
      <stop offset="100%" stop-color="#b45309" />
    </linearGradient>
    <linearGradient id="steamGrad" x1="0%" y1="100%" x2="0%" y2="0%">
      <stop offset="0%" stop-color="#f59e0b" stop-opacity="0.85" />
      <stop offset="100%" stop-color="#fbbf24" stop-opacity="0" />
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="8" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>

  <!-- Background container -->
  <rect width="512" height="512" rx="${maskable ? 0 : 108}" fill="url(#bgGrad)" />

  ${
    maskable
      ? ""
      : `<rect x="12" y="12" width="488" height="488" rx="98" fill="none" stroke="url(#goldGrad)" stroke-width="3" stroke-opacity="0.28" />`
  }

  <!-- Graphic group -->
  <g transform="translate(${translate}, ${translate}) scale(${scale})">
    <!-- Steam waves -->
    <path d="M 216 110 C 206 140 226 160 216 190" fill="none" stroke="url(#steamGrad)" stroke-width="10" stroke-linecap="round" />
    <path d="M 256 90 C 242 125 270 150 256 185" fill="none" stroke="url(#steamGrad)" stroke-width="12" stroke-linecap="round" />
    <path d="M 296 110 C 286 140 306 160 296 190" fill="none" stroke="url(#steamGrad)" stroke-width="10" stroke-linecap="round" />

    <!-- Coffee Saucer -->
    <ellipse cx="256" cy="405" rx="145" ry="24" fill="#0d0603" stroke="url(#goldGrad)" stroke-width="6" />

    <!-- Cup Shadow -->
    <ellipse cx="256" cy="385" rx="110" ry="16" fill="rgba(0,0,0,0.5)" />

    <!-- Cup Body -->
    <path d="M 160 215 L 352 215 C 348 335 320 375 256 375 C 192 375 164 335 160 215 Z" fill="#1b1008" stroke="url(#goldGrad)" stroke-width="8" stroke-linejoin="round" />

    <!-- Cup Rim Ellipse -->
    <ellipse cx="256" cy="215" rx="96" ry="22" fill="#2d1a0d" stroke="url(#goldGrad)" stroke-width="7" />

    <!-- Crema / Coffee Surface -->
    <ellipse cx="256" cy="215" rx="86" ry="16" fill="#78350f" />
    <ellipse cx="252" cy="214" rx="72" ry="12" fill="#92400e" opacity="0.8" />
    <ellipse cx="248" cy="213" rx="50" ry="8" fill="#d97706" opacity="0.6" />

    <!-- Cup Handle -->
    <path d="M 345 240 C 410 240 415 330 338 340" fill="none" stroke="url(#goldGrad)" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" />

    <!-- Monogram "B" on Cup -->
    <text x="256" y="322" font-family="'Playfair Display', Georgia, serif" font-size="64" font-weight="900" fill="url(#goldGrad)" text-anchor="middle" letter-spacing="1">B</text>
  </g>
</svg>`;
}

async function main() {
  const standardSvg = getSvg(false);
  const maskableSvg = getSvg(true);

  // Write SVGs
  const svgPath = path.join(iconsDir, "icon.svg");
  const faviconSvgPath = path.join(repoRoot, "favicon.svg");
  await fs.writeFile(svgPath, standardSvg, "utf8");
  await fs.writeFile(faviconSvgPath, standardSvg, "utf8");
  console.log("✅ Wrote icons/icon.svg and favicon.svg");

  // Launch Playwright to render pixel-perfect PNGs
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // 1. Render 512x512 standard
  await page.setContent(standardSvg);
  await page.setViewportSize({ width: 512, height: 512 });
  const icon512Path = path.join(iconsDir, "icon-512.png");
  await page.screenshot({ path: icon512Path, omitBackground: false });
  console.log("✅ Rendered icons/icon-512.png (512x512)");

  // 2. Render 192x192 standard
  await page.setViewportSize({ width: 192, height: 192 });
  const icon192Path = path.join(iconsDir, "icon-192.png");
  await page.screenshot({ path: icon192Path, omitBackground: false });
  console.log("✅ Rendered icons/icon-192.png (192x192)");

  // 3. Render 512x512 maskable
  await page.setContent(maskableSvg);
  await page.setViewportSize({ width: 512, height: 512 });
  const maskablePath = path.join(iconsDir, "icon-maskable.png");
  await page.screenshot({ path: maskablePath, omitBackground: false });
  console.log("✅ Rendered icons/icon-maskable.png (512x512 maskable)");

  // 4. Also copy 192 icon as root favicon.png for browsers looking for it
  const faviconPngPath = path.join(repoRoot, "favicon.png");
  await fs.copyFile(icon192Path, faviconPngPath);
  console.log("✅ Copied favicon.png to root");

  await browser.close();
  console.log("🎉 All PWA icon assets generated successfully.");
}

main().catch((err) => {
  console.error("❌ Error generating icons:", err);
  process.exit(1);
});
