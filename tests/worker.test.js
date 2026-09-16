import { describe, it, expect, vi, beforeEach } from "vitest";
import worker from "../worker.js";

// ── Shared mock factory ───────────────────────────────────────────────────────

function makeEnv(overrides = {}) {
  return {
    UPLOAD_SECRET: "test-admin-secret",
    BILLING_SECRET: "test-billing-secret",
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
      new Request("https://example.com/index-v2.html"),
      env,
      makeCtx()
    );
    expect(res.status).toBe(200);
    expect(env.ASSETS.fetch).toHaveBeenCalled();
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
  it("returns 503 when OPENROUTER_API_KEY is not set", async () => {
    const res = await worker.fetch(
      new Request("https://example.com/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
    const res = await worker.fetch(
      new Request("https://example.com/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
    const env = makeEnv({ OPENROUTER_API_KEY: "test-key" });
    const ctx = makeCtx();

    const res1 = await worker.fetch(
      new Request("https://example.com/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      }),
      env,
      ctx
    );
    expect(res1.status).toBe(400);

    const res2 = await worker.fetch(
      new Request("https://example.com/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [] })
      }),
      env,
      ctx
    );
    expect(res2.status).toBe(400);
  });

  it("returns 413 when messages payload exceeds size limit", async () => {
    const largeContent = "x".repeat(130 * 1024);
    const res = await worker.fetch(
      new Request("https://example.com/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
          headers: { "Content-Type": "application/json" },
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
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network connection dropped"));

    try {
      const res = await worker.fetch(
        new Request("https://example.com/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response("Rate limit exceeded", { status: 429 }));

    try {
      const res = await worker.fetch(
        new Request("https://example.com/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
          headers: { "Content-Type": "application/json" },
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
    const res = await worker.fetch(
      new Request("https://example.com/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
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
