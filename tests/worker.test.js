import { describe, it, expect, vi, beforeEach } from "vitest";
import worker from "../worker.js";

// ── Shared mock factory ───────────────────────────────────────────────────────

function makeEnv(overrides = {}) {
  return {
    UPLOAD_SECRET: "test-admin-secret",
    BILLING_SECRET: "test-billing-secret",
    ADMIN_SESSION_SECRET: "test-admin-session-secret",
    ASSETS: {
      fetch: vi
        .fn()
        .mockImplementation(() => Promise.resolve(new Response("Static asset", { status: 200 })))
    },
    MEDIA_BUCKET: {
      get: vi.fn(),
      put: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue({ objects: [], truncated: false }),
      delete: vi.fn().mockResolvedValue(undefined)
    },
    ...overrides
  };
}

function makeCtx() {
  return { waitUntil: vi.fn() };
}

// Minimal File-like blob for multipart uploads
function makeFile(content, type, name = "file") {
  return new File([content], name, { type });
}

// ── Router & Middleware ───────────────────────────────────────────────────────

describe("Router — security & middleware", () => {
  it("returns 404 for .git and .wrangler control paths", async () => {
    const env = makeEnv();
    const ctx = makeCtx();
    for (const path of ["/.git", "/.git/config", "/.wrangler", "/.wrangler/state"]) {
      const res = await worker.fetch(new Request(`https://example.com${path}`), env, ctx);
      expect(res.status, path).toBe(404);
    }
  });

  it("handles OPTIONS CORS preflight on any route", async () => {
    const res = await worker.fetch(
      new Request("https://example.com/api/upload/video", { method: "OPTIONS" }),
      makeEnv(),
      makeCtx()
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("returns 405 when POST-only routes are hit with GET", async () => {
    const env = makeEnv();
    for (const path of [
      "/api/record-order",
      "/api/parse-receipt",
      "/api/upload/receipt",
      "/api/upload/video",
      "/api/upload/image",
      "/api/chat"
    ]) {
      const res = await worker.fetch(
        new Request(`https://example.com${path}`, { method: "GET" }),
        env,
        makeCtx()
      );
      expect(res.status, path).toBe(405);
    }
  });

  it("forwards unrecognised paths to static ASSETS", async () => {
    const env = makeEnv();
    const res = await worker.fetch(
      new Request("https://example.com/custom-file.css"),
      env,
      makeCtx()
    );
    expect(res.status).toBe(200);
    expect(env.ASSETS.fetch).toHaveBeenCalled();
  });

  it("rewrites root and legacy aliases to /index-v2.html on static ASSETS", async () => {
    const paths = ["/", "/index", "/index.html", "/index-v2"];
    for (const p of paths) {
      const env = makeEnv();
      const res = await worker.fetch(new Request(`https://example.com${p}`), env, makeCtx());
      expect(res.status).toBe(200);
      expect(env.ASSETS.fetch).toHaveBeenCalled();
      const calledArg = env.ASSETS.fetch.mock.calls[0][0];
      const calledUrl = calledArg instanceof URL ? calledArg : new URL(calledArg.url || calledArg);
      expect(calledUrl.pathname, `Path ${p} should rewrite to /index-v2.html`).toBe(
        "/index-v2.html"
      );
    }
  });

  it("preserves query params when rewriting root to /index-v2.html", async () => {
    const env = makeEnv();
    const res = await worker.fetch(
      new Request("https://example.com/?table=5&ref=qr"),
      env,
      makeCtx()
    );
    expect(res.status).toBe(200);
    expect(env.ASSETS.fetch).toHaveBeenCalled();
    const calledArg = env.ASSETS.fetch.mock.calls[0][0];
    const calledUrl = calledArg instanceof URL ? calledArg : new URL(calledArg.url || calledArg);
    expect(calledUrl.pathname).toBe("/index-v2.html");
    expect(calledUrl.search).toBe("?table=5&ref=qr");
  });

  it("rewrites /admin and /admin/ to /admin.html on static ASSETS", async () => {
    for (const p of ["/admin", "/admin/"]) {
      const env = makeEnv();
      const res = await worker.fetch(new Request(`https://example.com${p}`), env, makeCtx());
      expect(res.status).toBe(200);
      expect(env.ASSETS.fetch).toHaveBeenCalled();
      const calledArg = env.ASSETS.fetch.mock.calls[0][0];
      const calledUrl = calledArg instanceof URL ? calledArg : new URL(calledArg.url || calledArg);
      expect(calledUrl.pathname, `Path ${p} should rewrite to /admin.html`).toBe("/admin.html");
    }
  });

  it("rewrites /devcon and /devcon/ to /devcon.html on static ASSETS", async () => {
    for (const p of ["/devcon", "/devcon/"]) {
      const env = makeEnv();
      const res = await worker.fetch(new Request(`https://example.com${p}`), env, makeCtx());
      expect(res.status).toBe(200);
      expect(env.ASSETS.fetch).toHaveBeenCalled();
      const calledArg = env.ASSETS.fetch.mock.calls[0][0];
      const calledUrl = calledArg instanceof URL ? calledArg : new URL(calledArg.url || calledArg);
      expect(calledUrl.pathname, `Path ${p} should rewrite to /devcon.html`).toBe("/devcon.html");
    }
  });

  it("serves /sw.js with correct MIME, no-cache, and Service-Worker-Allowed headers", async () => {
    const env = makeEnv({
      ASSETS: {
        fetch: vi.fn().mockResolvedValue(new Response("console.log('sw');", { status: 200 }))
      }
    });
    const res = await worker.fetch(new Request("https://example.com/sw.js"), env, makeCtx());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/javascript");
    expect(res.headers.get("Cache-Control")).toContain("no-cache");
    expect(res.headers.get("Service-Worker-Allowed")).toBe("/");
  });

  it("serves /manifest.webmanifest with correct MIME and caching headers", async () => {
    const env = makeEnv({
      ASSETS: {
        fetch: vi
          .fn()
          .mockResolvedValue(
            new Response(JSON.stringify({ name: "Beelal Coffee" }), { status: 200 })
          )
      }
    });
    const res = await worker.fetch(
      new Request("https://example.com/manifest.webmanifest"),
      env,
      makeCtx()
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/manifest+json");
    expect(res.headers.get("Cache-Control")).toContain("public");
  });
});

// ── Disabled Gemini Parser ────────────────────────────────────────────────────

describe("GET /api/parse-receipt — deliberately disabled", () => {
  it("returns 410 Gone regardless of body", async () => {
    const res = await worker.fetch(
      new Request("https://example.com/api/parse-receipt", { method: "POST" }),
      makeEnv(),
      makeCtx()
    );
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.error).toMatch(/deliberately disabled/i);
  });
});

// ── Billing Proxy ─────────────────────────────────────────────────────────────

describe("POST /api/record-order — billing proxy", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 503 when BILLING_SECRET env var is absent", async () => {
    const res = await worker.fetch(
      new Request("https://example.com/api/record-order", { method: "POST" }),
      makeEnv({ BILLING_SECRET: undefined }),
      makeCtx()
    );
    expect(res.status).toBe(503);
  });

  it("returns 400 for non-JSON body", async () => {
    const res = await worker.fetch(
      new Request("https://example.com/api/record-order", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "not json {{"
      }),
      makeEnv(),
      makeCtx()
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when required billing fields are missing", async () => {
    const res = await worker.fetch(
      new Request("https://example.com/api/record-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store_slug: "woodfire-kulim" }) // missing others
      }),
      makeEnv(),
      makeCtx()
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/incomplete billing event/i);
  });

  it("returns 502 when billing ledger fetch throws a network error", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network failure"));
    const res = await worker.fetch(
      new Request("https://example.com/api/record-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_slug: "woodfire-kulim",
          order_id: "ord-101",
          submitted_at: Date.now(),
          order_total_cents: 2500,
          currency: "RM",
          item_count: 2
        })
      }),
      makeEnv(),
      makeCtx()
    );
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/billing ledger request failed/i);
  });

  it("returns 502 when billing ledger responds with a non-OK status", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response("Forbidden", { status: 403 }));
    const res = await worker.fetch(
      new Request("https://example.com/api/record-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_slug: "woodfire-kulim",
          order_id: "ord-202",
          submitted_at: Date.now(),
          order_total_cents: 1800,
          currency: "RM",
          item_count: 1
        })
      }),
      makeEnv(),
      makeCtx()
    );
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/billing ledger rejected/i);
  });

  it("returns 200 ok:true when billing ledger responds successfully", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const res = await worker.fetch(
      new Request("https://example.com/api/record-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_slug: "woodfire-kulim",
          order_id: "ord-303",
          submitted_at: Date.now(),
          order_total_cents: 3200,
          currency: "RM",
          item_count: 3
        })
      }),
      makeEnv(),
      makeCtx()
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});

// ── Receipt Upload ────────────────────────────────────────────────────────────

describe("POST /api/upload/receipt — receipt upload", () => {
  it("returns 400 for non-JSON body that cannot be parsed", async () => {
    const res = await worker.fetch(
      new Request("https://example.com/api/upload/receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: "not a form" })
      }),
      makeEnv(),
      makeCtx()
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when receipt file or order_id is missing", async () => {
    const form = new FormData();
    form.append("order_id", "ord-missing-file");
    // no 'receipt' field
    const res = await worker.fetch(
      new Request("https://example.com/api/upload/receipt", { method: "POST", body: form }),
      makeEnv(),
      makeCtx()
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/required/i);
  });

  it("returns 415 for disallowed MIME types (e.g. text/plain)", async () => {
    const form = new FormData();
    form.append("receipt", makeFile("receipt content", "text/plain", "receipt.txt"));
    form.append("order_id", "ord-bad-mime");
    const res = await worker.fetch(
      new Request("https://example.com/api/upload/receipt", { method: "POST", body: form }),
      makeEnv(),
      makeCtx()
    );
    expect(res.status).toBe(415);
    const body = await res.json();
    expect(body.error).toMatch(/JPG|PNG|WebP|PDF/i);
  });

  it("stores a valid JPEG receipt and returns url + key + expires_at", async () => {
    const form = new FormData();
    form.append("receipt", makeFile("fake-jpeg-bytes", "image/jpeg", "receipt.jpg"));
    form.append("order_id", "ord-receipt-001");
    const env = makeEnv();
    const res = await worker.fetch(
      new Request("https://example.com/api/upload/receipt", { method: "POST", body: form }),
      env,
      makeCtx()
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toMatch(/\/media\/receipts\//);
    expect(body.key).toMatch(/^receipts\//);
    expect(typeof body.expires_at).toBe("number");
    expect(env.MEDIA_BUCKET.put).toHaveBeenCalled();
  });

  it("stores a valid PDF receipt and generates .pdf extension", async () => {
    const form = new FormData();
    form.append("receipt", makeFile("%PDF-1.4", "application/pdf", "receipt.pdf"));
    form.append("order_id", "ord-pdf-001");
    const env = makeEnv();
    const res = await worker.fetch(
      new Request("https://example.com/api/upload/receipt", { method: "POST", body: form }),
      env,
      makeCtx()
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.key).toMatch(/\.pdf$/);
  });
});

// ── Video Upload ──────────────────────────────────────────────────────────────

describe("POST /api/upload/video — video upload", () => {
  it("returns 401 without X-Admin-Secret header", async () => {
    const res = await worker.fetch(
      new Request("https://example.com/api/upload/video", { method: "POST" }),
      makeEnv(),
      makeCtx()
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 with wrong X-Admin-Secret", async () => {
    const res = await worker.fetch(
      new Request("https://example.com/api/upload/video", {
        method: "POST",
        headers: { "X-Admin-Secret": "wrong-secret" }
      }),
      makeEnv(),
      makeCtx()
    );
    expect(res.status).toBe(401);
  });

  it("returns 413 when Content-Length pre-check exceeds 5 MB", async () => {
    const res = await worker.fetch(
      new Request("https://example.com/api/upload/video", {
        method: "POST",
        headers: {
          "X-Admin-Secret": "test-admin-secret",
          "Content-Length": String(6 * 1024 * 1024)
        }
      }),
      makeEnv(),
      makeCtx()
    );
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error).toMatch(/too large/i);
  });

  it("returns 400 when no video field in multipart body", async () => {
    const form = new FormData();
    form.append("item_id", "burger");
    const res = await worker.fetch(
      new Request("https://example.com/api/upload/video", {
        method: "POST",
        headers: { "X-Admin-Secret": "test-admin-secret" },
        body: form
      }),
      makeEnv(),
      makeCtx()
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/no video file/i);
  });

  it("returns 415 for unsupported video MIME type", async () => {
    const form = new FormData();
    form.append("video", makeFile("video-bytes", "video/avi", "clip.avi"));
    form.append("item_id", "burger");
    const res = await worker.fetch(
      new Request("https://example.com/api/upload/video", {
        method: "POST",
        headers: { "X-Admin-Secret": "test-admin-secret" },
        body: form
      }),
      makeEnv(),
      makeCtx()
    );
    expect(res.status).toBe(415);
    const body = await res.json();
    expect(body.error).toMatch(/MP4|WebM/i);
  });

  it("uploads MP4 successfully and returns url, filename, size_bytes", async () => {
    const form = new FormData();
    form.append("video", makeFile("fake-mp4-bytes", "video/mp4", "clip.mp4"));
    form.append("item_id", "burger-promo");
    const env = makeEnv();
    const res = await worker.fetch(
      new Request("https://example.com/api/upload/video", {
        method: "POST",
        headers: { "X-Admin-Secret": "test-admin-secret" },
        body: form
      }),
      env,
      makeCtx()
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toMatch(/\/media\/clips\//);
    expect(body.filename).toMatch(/^clips\//);
    expect(body.filename).toMatch(/\.mp4$/);
    expect(typeof body.size_bytes).toBe("number");
    expect(env.MEDIA_BUCKET.put).toHaveBeenCalled();
  });

  it("uploads WebM and generates .webm extension", async () => {
    const form = new FormData();
    form.append("video", makeFile("fake-webm-bytes", "video/webm", "clip.webm"));
    form.append("item_id", "latte-art");
    const env = makeEnv();
    const res = await worker.fetch(
      new Request("https://example.com/api/upload/video", {
        method: "POST",
        headers: { "X-Admin-Secret": "test-admin-secret" },
        body: form
      }),
      env,
      makeCtx()
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.filename).toMatch(/\.webm$/);
  });

  it("uploads video with Authorization: Bearer <adminToken> without X-Admin-Secret", async () => {
    const pinRes = await worker.fetch(
      new Request("https://example.com/api/admin/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: "0405" })
      }),
      makeEnv(),
      makeCtx()
    );
    const pinData = await pinRes.json();
    const token = pinData.token;

    const form = new FormData();
    form.append("video", makeFile("fake-webm-bytes", "video/webm", "clip.webm"));
    form.append("item_id", "roast-clip");
    const env = makeEnv();
    const res = await worker.fetch(
      new Request("https://example.com/api/upload/video", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form
      }),
      env,
      makeCtx()
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toMatch(/\/media\/clips\/roast-clip_/);
    expect(body.filename).toMatch(/\.webm$/);
  });
});

// ── Image Upload ──────────────────────────────────────────────────────────────

describe("POST /api/upload/image — image upload", () => {
  it("returns 401 without X-Admin-Secret", async () => {
    const res = await worker.fetch(
      new Request("https://example.com/api/upload/image", { method: "POST" }),
      makeEnv(),
      makeCtx()
    );
    expect(res.status).toBe(401);
  });

  it("returns 413 when Content-Length pre-check exceeds 2 MB", async () => {
    const res = await worker.fetch(
      new Request("https://example.com/api/upload/image", {
        method: "POST",
        headers: {
          "X-Admin-Secret": "test-admin-secret",
          "Content-Length": String(3 * 1024 * 1024)
        }
      }),
      makeEnv(),
      makeCtx()
    );
    expect(res.status).toBe(413);
  });

  it("returns 400 when no image field in multipart body", async () => {
    const form = new FormData();
    form.append("item_id", "latte");
    const res = await worker.fetch(
      new Request("https://example.com/api/upload/image", {
        method: "POST",
        headers: { "X-Admin-Secret": "test-admin-secret" },
        body: form
      }),
      makeEnv(),
      makeCtx()
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/no image file/i);
  });

  it("returns 415 for disallowed image type (video/mp4)", async () => {
    const form = new FormData();
    form.append("image", makeFile("bytes", "video/mp4", "clip.mp4"));
    form.append("item_id", "latte");
    const res = await worker.fetch(
      new Request("https://example.com/api/upload/image", {
        method: "POST",
        headers: { "X-Admin-Secret": "test-admin-secret" },
        body: form
      }),
      makeEnv(),
      makeCtx()
    );
    expect(res.status).toBe(415);
  });

  it("uploads PNG and returns url with .png extension", async () => {
    const form = new FormData();
    form.append("image", makeFile("fake-png-bytes", "image/png", "menu.png"));
    form.append("item_id", "beelal-burger");
    const env = makeEnv();
    const res = await worker.fetch(
      new Request("https://example.com/api/upload/image", {
        method: "POST",
        headers: { "X-Admin-Secret": "test-admin-secret" },
        body: form
      }),
      env,
      makeCtx()
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toMatch(/\/media\/images\//);
    expect(body.filename).toMatch(/\.png$/);
    expect(env.MEDIA_BUCKET.put).toHaveBeenCalled();
  });

  it("uploads JPEG and returns .jpg extension (extMap fallback)", async () => {
    const form = new FormData();
    form.append("image", makeFile("fake-jpeg-bytes", "image/jpeg", "menu.jpg"));
    form.append("item_id", "espresso");
    const env = makeEnv();
    const res = await worker.fetch(
      new Request("https://example.com/api/upload/image", {
        method: "POST",
        headers: { "X-Admin-Secret": "test-admin-secret" },
        body: form
      }),
      env,
      makeCtx()
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.filename).toMatch(/\.jpg$/);
  });

  it("uploads image with Authorization: Bearer <adminToken> without X-Admin-Secret", async () => {
    const pinRes = await worker.fetch(
      new Request("https://example.com/api/admin/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: "0405" })
      }),
      makeEnv(),
      makeCtx()
    );
    const pinData = await pinRes.json();
    const token = pinData.token;

    const form = new FormData();
    form.append("image", makeFile("fake-webp-bytes", "image/webp", "store-logo.webp"));
    form.append("item_id", "store-logo");
    const env = makeEnv();
    const res = await worker.fetch(
      new Request("https://example.com/api/upload/image", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form
      }),
      env,
      makeCtx()
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toMatch(/\/media\/images\/store-logo_/);
    expect(body.filename).toMatch(/\.webp$/);
    expect(env.MEDIA_BUCKET.put).toHaveBeenCalled();
  });
});

// ── Media Serving ─────────────────────────────────────────────────────────────

describe("GET /media/* — media serving", () => {
  beforeEach(() => {
    global.caches = {
      default: {
        match: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined)
      }
    };
  });

  it("returns 404 for empty key (/media/)", async () => {
    const env = makeEnv();
    env.MEDIA_BUCKET.get.mockResolvedValue(null);
    const res = await worker.fetch(new Request("https://example.com/media/"), env, makeCtx());
    expect(res.status).toBe(404);
  });

  it("returns 404 when R2 object does not exist", async () => {
    const env = makeEnv();
    env.MEDIA_BUCKET.get.mockResolvedValue(null);
    const res = await worker.fetch(
      new Request("https://example.com/media/images/burger.png"),
      env,
      makeCtx()
    );
    expect(res.status).toBe(404);
  });

  it("returns cached response on cache HIT (no R2 call)", async () => {
    const cachedResponse = new Response("cached-image-bytes", {
      status: 200,
      headers: { "Content-Type": "image/png" }
    });
    global.caches.default.match.mockResolvedValue(cachedResponse);
    const env = makeEnv();
    const res = await worker.fetch(
      new Request("https://example.com/media/images/burger.png"),
      env,
      makeCtx()
    );
    expect(res.status).toBe(200);
    expect(env.MEDIA_BUCKET.get).not.toHaveBeenCalled(); // pure cache hit
  });

  it("serves R2 object on cache MISS with correct Cache-Control for public media", async () => {
    const mockR2Object = {
      body: new ReadableStream(),
      writeHttpMetadata: vi.fn(),
      customMetadata: {}
    };
    const env = makeEnv();
    env.MEDIA_BUCKET.get.mockResolvedValue(mockR2Object);
    const ctx = makeCtx();
    const res = await worker.fetch(
      new Request("https://example.com/media/images/burger.png"),
      env,
      ctx
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toMatch(/public/);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(ctx.waitUntil).toHaveBeenCalled(); // async cache.put triggered
  });

  it("returns 410 for expired receipt media and triggers async deletion", async () => {
    const expiredTs = Date.now() - 1000; // already expired
    const mockR2Object = {
      body: new ReadableStream(),
      writeHttpMetadata: vi.fn(),
      customMetadata: { expires_at: String(expiredTs) }
    };
    const env = makeEnv();
    env.MEDIA_BUCKET.get.mockResolvedValue(mockR2Object);
    const ctx = makeCtx();
    const res = await worker.fetch(
      new Request("https://example.com/media/receipts/ord-receipt-001/1234567890.jpg"),
      env,
      ctx
    );
    expect(res.status).toBe(410);
    expect(await res.text()).toMatch(/expired/i);
    expect(ctx.waitUntil).toHaveBeenCalled();
  });

  it("serves valid non-expired receipt with private Cache-Control", async () => {
    const futureTs = Date.now() + 1_000_000;
    const mockR2Object = {
      body: new ReadableStream(),
      writeHttpMetadata: vi.fn(),
      customMetadata: { expires_at: String(futureTs) }
    };
    const env = makeEnv();
    env.MEDIA_BUCKET.get.mockResolvedValue(mockR2Object);
    const ctx = makeCtx();
    const res = await worker.fetch(
      new Request("https://example.com/media/receipts/ord-valid/9999999999.jpg"),
      env,
      ctx
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toMatch(/private/);
  });
});

// ── Scheduled Cron — deleteExpiredReceipts ────────────────────────────────────

describe("scheduled() — deleteExpiredReceipts", () => {
  it("calls waitUntil with deletion promise even if bucket is empty", async () => {
    const env = makeEnv();
    env.MEDIA_BUCKET.list.mockResolvedValue({ objects: [], truncated: false });
    const ctx = makeCtx();
    await worker.scheduled({}, env, ctx);
    expect(ctx.waitUntil).toHaveBeenCalled();
  });

  it("deletes expired receipt objects and skips non-expired ones", async () => {
    const now = Date.now();
    const env = makeEnv();
    env.MEDIA_BUCKET.list.mockResolvedValue({
      objects: [
        {
          key: "receipts/ord-expired/111.jpg",
          customMetadata: { expires_at: String(now - 5000) }
        },
        {
          key: "receipts/ord-valid/222.jpg",
          customMetadata: { expires_at: String(now + 999_999) }
        }
      ],
      truncated: false
    });
    const ctx = makeCtx();
    await worker.scheduled({}, env, ctx);
    // waitUntil wraps the whole cleanup; trigger the inner promise
    const cleanupPromise = ctx.waitUntil.mock.calls[0][0];
    await cleanupPromise;
    expect(env.MEDIA_BUCKET.delete).toHaveBeenCalledWith("receipts/ord-expired/111.jpg");
    expect(env.MEDIA_BUCKET.delete).not.toHaveBeenCalledWith("receipts/ord-valid/222.jpg");
  });

  it("handles paginated listing via cursor until truncated=false", async () => {
    const now = Date.now();
    const env = makeEnv();
    // Page 1: truncated, returns cursor
    env.MEDIA_BUCKET.list
      .mockResolvedValueOnce({
        objects: [{ key: "receipts/a.jpg", customMetadata: { expires_at: String(now - 1) } }],
        truncated: true,
        cursor: "page-2-cursor"
      })
      // Page 2: final page
      .mockResolvedValueOnce({
        objects: [{ key: "receipts/b.jpg", customMetadata: { expires_at: String(now - 1) } }],
        truncated: false
      });
    const ctx = makeCtx();
    await worker.scheduled({}, env, ctx);
    const cleanupPromise = ctx.waitUntil.mock.calls[0][0];
    await cleanupPromise;
    expect(env.MEDIA_BUCKET.list).toHaveBeenCalledTimes(2);
    expect(env.MEDIA_BUCKET.delete).toHaveBeenCalledWith("receipts/a.jpg");
    expect(env.MEDIA_BUCKET.delete).toHaveBeenCalledWith("receipts/b.jpg");
  });
});

// ── AI Chat Proxy ─────────────────────────────────────────────────────────────

describe("POST /api/chat — AI chat proxy", () => {
  async function getChatToken() {
    const res = await worker.fetch(
      new Request("https://example.com/api/admin/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: "0405" })
      }),
      makeEnv(),
      makeCtx()
    );
    const data = await res.json();
    return data.token;
  }

  it("rejects unauthenticated requests without admin token with 401", async () => {
    const res = await worker.fetch(
      new Request("https://example.com/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] })
      }),
      makeEnv({ OPENROUTER_API_KEY: "test-key" }),
      makeCtx()
    );
    expect(res.status).toBe(401);
  });

  it("rejects requests with forged or invalid admin token with 401", async () => {
    const res = await worker.fetch(
      new Request("https://example.com/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer invalid.signature.token"
        },
        body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] })
      }),
      makeEnv({ OPENROUTER_API_KEY: "test-key" }),
      makeCtx()
    );
    expect(res.status).toBe(401);
  });

  it("returns 503 when OPENROUTER_API_KEY is not set", async () => {
    const token = await getChatToken();
    const res = await worker.fetch(
      new Request("https://example.com/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] })
      }),
      makeEnv({ OPENROUTER_API_KEY: undefined }),
      makeCtx()
    );
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toContain("not configured");
  });

  it("returns 400 when request body is not valid JSON", async () => {
    const token = await getChatToken();
    const res = await worker.fetch(
      new Request("https://example.com/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: "invalid json string"
      }),
      makeEnv({ OPENROUTER_API_KEY: "test-key" }),
      makeCtx()
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("JSON");
  });

  it("returns 400 when messages array is missing or empty", async () => {
    const token = await getChatToken();
    const env = makeEnv({ OPENROUTER_API_KEY: "test-key" });
    const ctx = makeCtx();

    const res1 = await worker.fetch(
      new Request("https://example.com/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({})
      }),
      env,
      ctx
    );
    expect(res1.status).toBe(400);

    const res2 = await worker.fetch(
      new Request("https://example.com/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ messages: [] })
      }),
      env,
      ctx
    );
    expect(res2.status).toBe(400);
  });

  it("returns 413 when messages payload exceeds size limit", async () => {
    const token = await getChatToken();
    const largeContent = "x".repeat(130 * 1024);
    const res = await worker.fetch(
      new Request("https://example.com/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ messages: [{ role: "user", content: largeContent }] })
      }),
      makeEnv({ OPENROUTER_API_KEY: "test-key" }),
      makeCtx()
    );
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error).toContain("limit");
  });

  it("proxies request to OpenRouter upstream and returns response", async () => {
    const token = await getChatToken();
    const mockOpenRouterResponse = {
      id: "gen-123",
      choices: [{ message: { role: "assistant", content: "Hello from OpenRouter" } }]
    };

    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockOpenRouterResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    globalThis.fetch = fetchMock;

    try {
      const res = await worker.fetch(
        new Request("https://example.com/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            messages: [{ role: "user", content: "hello" }],
            model: "deepseek/deepseek-v4-flash:free",
            temperature: 0.5,
            max_tokens: 500
          })
        }),
        makeEnv({ OPENROUTER_API_KEY: "sk-or-test" }),
        makeCtx()
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.choices[0].message.content).toBe("Hello from OpenRouter");

      // Verify upstream call
      expect(fetchMock).toHaveBeenCalled();
      const callArgs = fetchMock.mock.calls[0];
      expect(callArgs[0]).toBe("https://openrouter.ai/api/v1/chat/completions");
      expect(callArgs[1].headers.Authorization).toBe("Bearer sk-or-test");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns 502 when upstream fetch throws", async () => {
    const token = await getChatToken();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network connection dropped"));

    try {
      const res = await worker.fetch(
        new Request("https://example.com/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ messages: [{ role: "user", content: "hello" }] })
        }),
        makeEnv({ OPENROUTER_API_KEY: "sk-or-test" }),
        makeCtx()
      );
      expect(res.status).toBe(502);
      const body = await res.json();
      expect(body.error).toContain("failed");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns 502 when upstream returns HTTP error", async () => {
    const token = await getChatToken();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response("Rate limit exceeded", { status: 429 }));

    try {
      const res = await worker.fetch(
        new Request("https://example.com/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ messages: [{ role: "user", content: "hello" }] })
        }),
        makeEnv({ OPENROUTER_API_KEY: "sk-or-test" }),
        makeCtx()
      );
      expect(res.status).toBe(502);
      const body = await res.json();
      expect(body.error).toContain("429");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns 502 when upstream returns non-JSON payload", async () => {
    const token = await getChatToken();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("<html>Bad Gateway</html>", {
        status: 200,
        headers: { "Content-Type": "text/html" }
      })
    );

    try {
      const res = await worker.fetch(
        new Request("https://example.com/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ messages: [{ role: "user", content: "hello" }] })
        }),
        makeEnv({ OPENROUTER_API_KEY: "sk-or-test" }),
        makeCtx()
      );
      expect(res.status).toBe(502);
      const body = await res.json();
      expect(body.error).toContain("Invalid JSON");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("rejects unauthorized cross-origin requests with 403", async () => {
    const token = await getChatToken();
    const res = await worker.fetch(
      new Request("https://example.com/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          Origin: "https://evil-attacker.com"
        },
        body: JSON.stringify({ messages: [{ role: "user", content: "hello" }] })
      }),
      makeEnv({ OPENROUTER_API_KEY: "sk-or-test" }),
      makeCtx()
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("Unauthorized origin");
  });

  it("allows trusted worker/local origins", async () => {
    const token = await getChatToken();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "OK" } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );

    try {
      const res = await worker.fetch(
        new Request("https://example.com/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            Origin: "https://store-beelal-fnb-pwa.arh-homelab.workers.dev"
          },
          body: JSON.stringify({ messages: [{ role: "user", content: "hello" }] })
        }),
        makeEnv({ OPENROUTER_API_KEY: "sk-or-test" }),
        makeCtx()
      );
      expect(res.status).toBe(200);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// ── Phase 1: Admin Auth & PIN Security ───────────────────────────────────────

describe("Admin PIN Authentication — POST /api/admin/verify-pin", () => {
  it("rejects non-POST methods with 405", async () => {
    const res = await worker.fetch(
      new Request("https://example.com/api/admin/verify-pin", { method: "GET" }),
      makeEnv(),
      makeCtx()
    );
    expect(res.status).toBe(405);
  });

  it("rejects invalid JSON with 400", async () => {
    const res = await worker.fetch(
      new Request("https://example.com/api/admin/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json"
      }),
      makeEnv(),
      makeCtx()
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Request body must be JSON");
  });

  it("rejects non-4-digit PIN with 400", async () => {
    for (const badPin of ["", "12", "12345", "abcd", null]) {
      const res = await worker.fetch(
        new Request("https://example.com/api/admin/verify-pin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pin: badPin })
        }),
        makeEnv(),
        makeCtx()
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("PIN must be 4 digits");
    }
  });

  it("returns 401 on incorrect PIN", async () => {
    const res = await worker.fetch(
      new Request("https://example.com/api/admin/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: "9999" })
      }),
      makeEnv(),
      makeCtx()
    );
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toContain("Incorrect PIN");
  });

  it("authenticates dev role with default dev PIN (0405) and returns HMAC session token", async () => {
    const res = await worker.fetch(
      new Request("https://example.com/api/admin/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: "0405" })
      }),
      makeEnv(),
      makeCtx()
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.role).toBe("dev");
    expect(typeof data.token).toBe("string");
    expect(data.token).toContain(".");
    expect(data.expires_at).toBeGreaterThan(Date.now());
  });

  it("authenticates owner role with default owner PIN (1234)", async () => {
    const res = await worker.fetch(
      new Request("https://example.com/api/admin/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: "1234" })
      }),
      makeEnv(),
      makeCtx()
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.role).toBe("owner");
    expect(typeof data.token).toBe("string");
  });

  it("honors custom PINs configured via environment secrets", async () => {
    const env = makeEnv({
      ADMIN_DEV_PIN: "7777",
      ADMIN_OWNER_PIN: "8888"
    });

    const resDev = await worker.fetch(
      new Request("https://example.com/api/admin/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: "7777" })
      }),
      env,
      makeCtx()
    );
    expect(resDev.status).toBe(200);
    const devData = await resDev.json();
    expect(devData.role).toBe("dev");

    const resOwner = await worker.fetch(
      new Request("https://example.com/api/admin/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: "8888" })
      }),
      env,
      makeCtx()
    );
    expect(resOwner.status).toBe(200);
    const ownerData = await resOwner.json();
    expect(ownerData.role).toBe("owner");
  });
});

// ── Phase 1: Protected Admin Orders API ──────────────────────────────────────

describe("Protected Admin Orders API — GET /api/admin/orders & POST /api/admin/order/update-status", () => {
  async function getValidToken(role = "dev") {
    const pin = role === "dev" ? "0405" : "1234";
    const res = await worker.fetch(
      new Request("https://example.com/api/admin/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin })
      }),
      makeEnv(),
      makeCtx()
    );
    const data = await res.json();
    return data.token;
  }

  it("rejects unauthorized calls to GET /api/admin/orders without token", async () => {
    const res = await worker.fetch(
      new Request("https://example.com/api/admin/orders", { method: "GET" }),
      makeEnv(),
      makeCtx()
    );
    expect(res.status).toBe(401);
  });

  it("rejects forged or tampered admin tokens", async () => {
    const validToken = await getValidToken();
    const tampered = validToken.slice(0, -4) + "0000";
    const res = await worker.fetch(
      new Request("https://example.com/api/admin/orders", {
        method: "GET",
        headers: { Authorization: `Bearer ${tampered}` }
      }),
      makeEnv(),
      makeCtx()
    );
    expect(res.status).toBe(401);
  });

  it("retrieves orders for authorized admin session via Bearer header", async () => {
    const token = await getValidToken();
    const originalFetch = globalThis.fetch;
    const mockOrders = {
      ord_123: { name: "Ahmad", total: 15.5, payment_status: "awaiting_confirmation" }
    };
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockOrders), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );

    try {
      const res = await worker.fetch(
        new Request("https://example.com/api/admin/orders", {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` }
        }),
        makeEnv(),
        makeCtx()
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.orders.ord_123.name).toBe("Ahmad");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("updates order payment status to confirmed with confirmation audit", async () => {
    const token = await getValidToken("owner");
    const originalFetch = globalThis.fetch;
    let capturedBody = null;
    globalThis.fetch = vi.fn().mockImplementation((_url, options) => {
      capturedBody = JSON.parse(options.body);
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    });

    try {
      const res = await worker.fetch(
        new Request("https://example.com/api/admin/order/update-status", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            order_id: "ord_12345",
            payment_status: "confirmed"
          })
        }),
        makeEnv(),
        makeCtx()
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.payment_status).toBe("confirmed");
      expect(capturedBody.payment_status).toBe("confirmed");
      expect(capturedBody.payment_confirmed_by).toBe("owner");
      expect(capturedBody.payment_confirmed_at).toBeTypeOf("number");
      expect(capturedBody.fulfillment_status).toBe("preparing");
      expect(capturedBody.preparing_at).toBeTypeOf("number");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("updates order payment status to rejected with reject reason", async () => {
    const token = await getValidToken("dev");
    const originalFetch = globalThis.fetch;
    let capturedBody = null;
    globalThis.fetch = vi.fn().mockImplementation((_url, options) => {
      capturedBody = JSON.parse(options.body);
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    });

    try {
      const res = await worker.fetch(
        new Request("https://example.com/api/admin/order/update-status", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-admin-token": token
          },
          body: JSON.stringify({
            order_id: "ord_12345",
            payment_status: "rejected",
            reject_reason: "Payment receipt unreadable"
          })
        }),
        makeEnv(),
        makeCtx()
      );
      expect(res.status).toBe(200);
      expect(capturedBody.payment_status).toBe("rejected");
      expect(capturedBody.payment_reject_reason).toBe("Payment receipt unreadable");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("updates order fulfillment status and records lifecycle timestamps", async () => {
    const token = await getValidToken("dev");
    const originalFetch = globalThis.fetch;
    let capturedBody = null;
    globalThis.fetch = vi.fn().mockImplementation((_url, options) => {
      capturedBody = JSON.parse(options.body);
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    });

    try {
      // Test ready
      const resReady = await worker.fetch(
        new Request("https://example.com/api/admin/order/update-status", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            order_id: "ord_12345",
            fulfillment_status: "ready"
          })
        }),
        makeEnv(),
        makeCtx()
      );
      expect(resReady.status).toBe(200);
      expect(capturedBody.fulfillment_status).toBe("ready");
      expect(capturedBody.ready_at).toBeTypeOf("number");

      // Test completed
      const resCompleted = await worker.fetch(
        new Request("https://example.com/api/admin/order/update-status", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            order_id: "ord_12345",
            fulfillment_status: "completed"
          })
        }),
        makeEnv(),
        makeCtx()
      );
      expect(resCompleted.status).toBe(200);
      expect(capturedBody.fulfillment_status).toBe("completed");
      expect(capturedBody.completed_at).toBeTypeOf("number");

      // Test cancelled
      const resCancelled = await worker.fetch(
        new Request("https://example.com/api/admin/order/update-status", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            order_id: "ord_12345",
            fulfillment_status: "cancelled"
          })
        }),
        makeEnv(),
        makeCtx()
      );
      expect(resCancelled.status).toBe(200);
      expect(capturedBody.fulfillment_status).toBe("cancelled");
      expect(capturedBody.cancelled_at).toBeTypeOf("number");

      // Test rejection when neither payment_status nor fulfillment_status is provided
      const resEmpty = await worker.fetch(
        new Request("https://example.com/api/admin/order/update-status", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            order_id: "ord_12345"
          })
        }),
        makeEnv(),
        makeCtx()
      );
      expect(resEmpty.status).toBe(400);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// ── Phase 1: Customer Order Dispatch ─────────────────────────────────────────

describe("Customer Order Dispatch — POST /api/order", () => {
  it("rejects non-POST methods with 405", async () => {
    const res = await worker.fetch(
      new Request("https://example.com/api/order", { method: "GET" }),
      makeEnv(),
      makeCtx()
    );
    expect(res.status).toBe(405);
  });

  it("rejects missing customer name with 400", async () => {
    const res = await worker.fetch(
      new Request("https://example.com/api/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "  ",
          items: [{ name: "Latte", price: 10, qty: 1 }],
          total: 10
        })
      }),
      makeEnv(),
      makeCtx()
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Valid customer name");
  });

  it("rejects empty items array with 400", async () => {
    const res = await worker.fetch(
      new Request("https://example.com/api/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Ahmad",
          items: [],
          total: 0
        })
      }),
      makeEnv(),
      makeCtx()
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("at least one item");
  });

  it("rejects negative item prices or invalid quantities", async () => {
    const res = await worker.fetch(
      new Request("https://example.com/api/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Ahmad",
          items: [{ name: "Latte", price: -5, qty: 1 }],
          total: -5
        })
      }),
      makeEnv(),
      makeCtx()
    );
    expect(res.status).toBe(400);
  });

  it("successfully creates valid cash order, writes to RTDB, and returns order_id", async () => {
    const originalFetch = globalThis.fetch;
    let writtenBody = null;
    globalThis.fetch = vi.fn().mockImplementation((url, options) => {
      if (options?.method === "PUT") {
        writtenBody = JSON.parse(options.body);
        return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    });

    try {
      const res = await worker.fetch(
        new Request("https://example.com/api/order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: " Siti ",
            items: [
              { name: "Iced Latte", size: "12oz", qty: 2, price: 24, unitPrice: 12 },
              { name: "Butter Croissant", size: "Standard", qty: 1, price: 8, unitPrice: 8 }
            ],
            total: 32,
            note: "Less ice please",
            payment_method: "cash"
          })
        }),
        makeEnv({ BILLING_SECRET: "test-billing" }),
        makeCtx()
      );
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.order_id).toMatch(/^ord_/);
      expect(writtenBody.name).toBe("Siti");
      expect(writtenBody.payment_method).toBe("cash");
      expect(writtenBody.payment_status).toBe("cash_pending");
      expect(writtenBody.fulfillment_status).toBe("placed");
      expect(writtenBody.items.length).toBe(2);
      expect(writtenBody.total).toBe(32);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("successfully creates valid QR order with receipt_url and awaiting_confirmation", async () => {
    const originalFetch = globalThis.fetch;
    let writtenBody = null;
    globalThis.fetch = vi.fn().mockImplementation((url, options) => {
      if (options?.method === "PUT") {
        writtenBody = JSON.parse(options.body);
      }
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    });

    try {
      const res = await worker.fetch(
        new Request("https://example.com/api/order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            order_id: "ord_1789000000000",
            name: "Hafiz",
            items: [{ name: "Espresso", price: 7, qty: 1 }],
            total: 7,
            payment_method: "qr",
            payment_ref: "REF-9999",
            receipt_url: "https://example.com/media/receipts/test.webp"
          })
        }),
        makeEnv(),
        makeCtx()
      );
      expect(res.status).toBe(201);
      expect(writtenBody.payment_method).toBe("qr");
      expect(writtenBody.payment_status).toBe("awaiting_confirmation");
      expect(writtenBody.fulfillment_status).toBe("placed");
      expect(writtenBody.payment_ref).toBe("REF-9999");
      expect(writtenBody.receipt_url).toBe("https://example.com/media/receipts/test.webp");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// ── Phase 1: Customer Order Status Polling ───────────────────────────────────

describe("Customer Order Status Polling — GET /api/order/status/:id", () => {
  it("rejects invalid order ID with 400", async () => {
    const res = await worker.fetch(
      new Request("https://example.com/api/order/status/$$bad??id", { method: "GET" }),
      makeEnv(),
      makeCtx()
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when order status not found", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(null), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );

    try {
      const res = await worker.fetch(
        new Request("https://example.com/api/order/status/ord_not_found", { method: "GET" }),
        makeEnv(),
        makeCtx()
      );
      expect(res.status).toBe(404);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns 200 with payment_status when found", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify("confirmed"), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );

    try {
      const res = await worker.fetch(
        new Request("https://example.com/api/order/status/ord_12345", { method: "GET" }),
        makeEnv(),
        makeCtx()
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.order_id).toBe("ord_12345");
      expect(data.payment_status).toBe("confirmed");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns full order fulfillment metadata and lifecycle timestamps", async () => {
    const originalFetch = globalThis.fetch;
    const mockOrder = {
      name: "Siti",
      payment_status: "confirmed",
      fulfillment_status: "preparing",
      total: 18.5,
      ts: 1718000000000,
      payment_ref: "REF999",
      preparing_at: 1718000060000,
      ready_at: null,
      completed_at: null
    };
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockOrder), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );

    try {
      const res = await worker.fetch(
        new Request("https://example.com/api/order/status/ord_67890", { method: "GET" }),
        makeEnv(),
        makeCtx()
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.order_id).toBe("ord_67890");
      expect(data.payment_status).toBe("confirmed");
      expect(data.fulfillment_status).toBe("preparing");
      expect(data.total).toBe(18.5);
      expect(data.payment_ref).toBe("REF999");
      expect(data.preparing_at).toBe(1718000060000);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// ── Admin Billing Summary Proxy ──────────────────────────────────────────────

describe("GET /api/billing/summary — admin billing ledger summary proxy", () => {
  async function getAdminToken() {
    const res = await worker.fetch(
      new Request("https://example.com/api/admin/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: "0405" })
      }),
      makeEnv(),
      makeCtx()
    );
    const data = await res.json();
    return data.token;
  }

  it("rejects unauthenticated calls without admin token with 401", async () => {
    const res = await worker.fetch(
      new Request("https://example.com/api/billing/summary", { method: "GET" }),
      makeEnv(),
      makeCtx()
    );
    expect(res.status).toBe(401);
  });

  it("returns 503 when BILLING_SECRET is not configured", async () => {
    const token = await getAdminToken();
    const env = makeEnv({ BILLING_SECRET: "" });
    const res = await worker.fetch(
      new Request("https://example.com/api/billing/summary", {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` }
      }),
      env,
      makeCtx()
    );
    expect(res.status).toBe(503);
  });

  it("proxies request to billing ledger and returns summary data", async () => {
    const token = await getAdminToken();
    const originalFetch = globalThis.fetch;
    const mockSummary = {
      status: "success",
      data: {
        store_slug: "beelal_coffee",
        currency: "RM",
        today: { gross_revenue_formatted: "RM 145.00", order_count: 8 },
        weekly: { gross_revenue_formatted: "RM 950.00", order_count: 52 },
        monthly: { gross_revenue_formatted: "RM 3,800.00", order_count: 210 }
      }
    };
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockSummary), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );

    try {
      const res = await worker.fetch(
        new Request("https://example.com/api/billing/summary", {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` }
        }),
        makeEnv(),
        makeCtx()
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.store_slug).toBe("beelal_coffee");
      expect(json.today.order_count).toBe(8);
      expect(json.today.gross_revenue_formatted).toBe("RM 145.00");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns 502 when billing ledger upstream fails", async () => {
    const token = await getAdminToken();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Upstream connection refused"));

    try {
      const res = await worker.fetch(
        new Request("https://example.com/api/billing/summary", {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` }
        }),
        makeEnv(),
        makeCtx()
      );
      expect(res.status).toBe(502);
      const json = await res.json();
      expect(json.error).toMatch(/communication failure/i);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
