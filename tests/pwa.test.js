import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

describe("PWA Web App Manifest & Service Worker Invariants", () => {
  const manifestPath = path.join(repoRoot, "manifest.webmanifest");
  const swPath = path.join(repoRoot, "sw.js");

  it("manifest.webmanifest exists and is valid JSON", () => {
    expect(fs.existsSync(manifestPath)).toBe(true);
    const raw = fs.readFileSync(manifestPath, "utf8");
    const manifest = JSON.parse(raw);

    expect(manifest.name).toBe("Beelal Coffee");
    expect(manifest.short_name).toBe("Beelal");
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.theme_color).toBe("#f8fafc");
    expect(manifest.background_color).toBe("#f8fafc");
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons.length).toBeGreaterThanOrEqual(3);
  });

  it("manifest icon files exist on disk with non-zero size", () => {
    const raw = fs.readFileSync(manifestPath, "utf8");
    const manifest = JSON.parse(raw);

    for (const icon of manifest.icons) {
      const relIconPath = icon.src.replace(/^\//, "");
      const iconDiskPath = path.join(repoRoot, relIconPath);
      expect(
        fs.existsSync(iconDiskPath),
        `Icon file ${icon.src} must exist at ${iconDiskPath}`
      ).toBe(true);
      const stat = fs.statSync(iconDiskPath);
      expect(stat.size, `Icon file ${icon.src} must not be empty`).toBeGreaterThan(100);
    }
  });

  it("contains maskable icon for adaptive Android launchers", () => {
    const raw = fs.readFileSync(manifestPath, "utf8");
    const manifest = JSON.parse(raw);
    const hasMaskable = manifest.icons.some(
      (icon) => icon.purpose && icon.purpose.includes("maskable")
    );
    expect(hasMaskable, "Manifest must declare at least one maskable icon").toBe(true);
  });

  it("sw.js exists and implements all three caching strategies", () => {
    expect(fs.existsSync(swPath)).toBe(true);
    const swContent = fs.readFileSync(swPath, "utf8");

    // SWR for shell
    expect(swContent).toContain("SHELL_CACHE");
    expect(swContent).toContain("isAppShell");

    // CacheFirst for media/fonts
    expect(swContent).toContain("MEDIA_CACHE");
    expect(swContent).toContain("isMediaOrFont");

    // NetworkOnly for API/RTDB
    expect(swContent).toContain("/api/");
    expect(swContent).toContain("firebasedatabase.app");

    // Precache critical assets
    expect(swContent).toContain("/config.js");
    expect(swContent).toContain("/src/pure/cart-engine.js");
    expect(swContent).toContain("/manifest.webmanifest");

    // Lifecycle
    expect(swContent).toContain("skipWaiting");
    expect(swContent).toContain("clients.claim");
  });

  it("index-v2.html links manifest and registers service worker", () => {
    const indexPath = path.join(repoRoot, "index-v2.html");
    const indexHtml = fs.readFileSync(indexPath, "utf8");

    expect(indexHtml).toContain('rel="manifest"');
    expect(indexHtml).toContain("/manifest.webmanifest");
    expect(indexHtml).toContain("serviceWorker.register");
    expect(indexHtml).toContain("/sw.js");
  });
});
