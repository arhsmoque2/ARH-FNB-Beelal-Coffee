/**
 * Cloudflare Worker — fnb-pwa
 *
 * Routes:
 *   POST /api/upload/video   — validate & store video to R2, return URL
 *   POST /api/upload/image   — validate & store image to R2, return URL
 *   POST /api/parse-receipt  — deliberately disabled Gemini receipt parser
 *   POST /api/upload/receipt — store customer receipt for a 30-day review window
 *   GET  /media/*            — serve media files from R2 (edge-cached)
 *   *                        — pass through to static assets (Pages)
 *
 * Limits:
 *   Video — 5 MB max, MP4/WebM only (duration enforced client-side: max 5s, 720p)
 *   Image — 2 MB max, JPEG/PNG/WebP only
 *   Per store — 150 MB soft cap tracked in Firebase by admin; Worker enforces per-file only
 *
 * Required Worker secrets (wrangler secret put):
 *   UPLOAD_SECRET   — random string used only by protected admin upload routes
 *   BILLING_SECRET  — private bearer token for the billing ledger proxy
 *   GEMINI_API_KEY  — reserved for the deliberately disabled parser path
 *
 * Required R2 binding (wrangler.jsonc):
 *   MEDIA_BUCKET    — R2 bucket (arh-fnb-beelal-media)
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Admin-Secret"
};

const MAX_VIDEO_BYTES = 5 * 1024 * 1024; // 5 MB — ~5s 720p at good quality
const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB — more than enough for a resized menu photo
const MAX_RECEIPT_BYTES = 6 * 1024 * 1024;
const RECEIPT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
// Deliberately false: owner review of the bank receipt is the payment authority.
// Keep the Gemini implementation below as a quarantined future option only.
const ENABLE_GEMINI_RECEIPT_PARSER = false;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Never allow repository/build control files to fall through to static assets.
    if (
      url.pathname === "/.git" ||
      url.pathname.startsWith("/.git/") ||
      url.pathname === "/.wrangler" ||
      url.pathname.startsWith("/.wrangler/")
    ) {
      return new Response("Not found", { status: 404 });
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (url.pathname === "/api/record-order") {
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
      return handleBillingProxy(request, env);
    }

    if (url.pathname === "/api/parse-receipt") {
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
      if (!ENABLE_GEMINI_RECEIPT_PARSER) {
        return json({ error: "Gemini receipt parsing is deliberately disabled." }, 410);
      }
      return handleParseReceipt(request, env);
    }

    if (url.pathname === "/api/upload/receipt") {
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
      return handleReceiptUpload(request, env);
    }

    if (url.pathname === "/api/upload/video") {
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
      return handleVideoUpload(request, env);
    }

    if (url.pathname === "/api/upload/image") {
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
      return handleImageUpload(request, env);
    }

    if (url.pathname.startsWith("/media/")) {
      const key = url.pathname.slice("/media/".length);
      return serveMedia(key, request, env, ctx);
    }

    return env.ASSETS.fetch(request);
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(deleteExpiredReceipts(env));
  }
};

// ── Helpers ───────────────────────────────────────────────────────────

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" }
  });
}

async function handleBillingProxy(request, env) {
  if (!env.BILLING_SECRET) return json({ error: "Billing proxy is not configured." }, 503);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Request body must be JSON." }, 400);
  }

  const required = [
    "store_slug",
    "order_id",
    "submitted_at",
    "order_total_cents",
    "currency",
    "item_count"
  ];
  if (required.some((key) => body?.[key] === undefined || body?.[key] === null)) {
    return json({ error: "Incomplete billing event." }, 400);
  }

  const billingUrl = env.BILLING_WORKER_URL || "https://fnb-billing-ledger.arh-homelab.workers.dev";
  let upstream;
  try {
    upstream = await fetch(`${billingUrl.replace(/\/$/, "")}/record-order`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.BILLING_SECRET}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
  } catch {
    return json({ error: "Billing ledger request failed." }, 502);
  }

  if (!upstream.ok) return json({ error: "Billing ledger rejected the event." }, 502);
  return json({ ok: true });
}

// FUTURE OPTION ONLY — deliberately unreachable while owner-confirmed payment is the policy.
async function handleParseReceipt(request, env) {
  if (!env.GEMINI_API_KEY) return json({ error: "Receipt parser is not configured." }, 503);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Request body must be JSON." }, 400);
  }

  const imageBase64 = typeof body?.imageBase64 === "string" ? body.imageBase64 : "";
  const mimeType = typeof body?.mimeType === "string" ? body.mimeType : "image/jpeg";
  const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
  if (!imageBase64 || !allowedMimeTypes.includes(mimeType)) {
    return json({ error: "Provide imageBase64 and a supported mimeType." }, 400);
  }
  if (imageBase64.length > 8 * 1024 * 1024) {
    return json({ error: "Receipt is too large. Use an image under 6 MB." }, 413);
  }

  const prompt = `You are reading a Malaysian e-wallet or bank transfer payment receipt.
Extract ONLY these fields as JSON (no markdown, no explanation):
{
  "transaction_ref": "the transaction/reference ID or number",
  "amount": <number, Malaysian Ringgit, no currency symbol>,
  "date": "YYYY-MM-DD",
  "time": "HH:MM",
  "bank_or_wallet": "name of the bank or e-wallet",
  "to_account": "recipient name or account",
  "from_account": "last 4 digits of sender account if visible, else null",
  "parse_confidence": "high" | "medium" | "low"
}

If a field is not visible, use null. Amount must be a number.`;

  let upstream;
  try {
    upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: imageBase64 } }]
            }
          ],
          generationConfig: { responseMimeType: "application/json", temperature: 0 }
        })
      }
    );
  } catch {
    return json({ error: "Receipt parser upstream request failed." }, 502);
  }

  if (!upstream.ok) return json({ error: "Receipt parser upstream rejected the receipt." }, 502);

  let payload;
  try {
    payload = await upstream.json();
  } catch {
    return json({ error: "Receipt parser returned invalid JSON." }, 502);
  }

  const text = payload?.candidates?.[0]?.content?.parts?.find((part) => part.text)?.text;
  if (!text) return json({ error: "No readable receipt data was found." }, 422);
  try {
    const parsed = JSON.parse(text.replace(/^```json\s*|\s*```$/g, "").trim());
    return json(parsed);
  } catch {
    return json({ error: "Receipt parser returned an invalid result." }, 422);
  }
}

async function handleReceiptUpload(request, env) {
  if (!env.MEDIA_BUCKET) return json({ error: "Receipt storage is not configured." }, 503);
  const contentLength = parseInt(request.headers.get("Content-Length") || "0", 10);
  if (contentLength > MAX_RECEIPT_BYTES)
    return json({ error: "Receipt is too large. Limit is 6 MB." }, 413);

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return json({ error: "Could not parse receipt upload." }, 400);
  }
  const file = formData.get("receipt");
  const orderId = String(formData.get("order_id") || "")
    .replace(/[^a-z0-9_-]/gi, "")
    .slice(0, 80);
  if (!file || typeof file === "string" || !orderId)
    return json({ error: "Receipt and order_id are required." }, 400);
  const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
  if (!allowed.includes(file.type))
    return json({ error: "Use a JPG, PNG, WebP, or PDF receipt." }, 415);
  const buffer = await file.arrayBuffer();
  if (buffer.byteLength > MAX_RECEIPT_BYTES)
    return json({ error: "Receipt is too large. Limit is 6 MB." }, 413);

  const now = Date.now();
  const expiresAt = now + RECEIPT_RETENTION_MS;
  let ext = file.type.split("/")[1];
  if (file.type === "application/pdf") ext = "pdf";
  if (ext === "jpeg") ext = "jpg";
  const key = "receipts/" + orderId + "/" + now + "." + ext;
  await env.MEDIA_BUCKET.put(key, buffer, {
    httpMetadata: { contentType: file.type, cacheControl: "private, max-age=0, no-store" },
    customMetadata: { order_id: orderId, uploaded_at: String(now), expires_at: String(expiresAt) }
  });
  const origin = new URL(request.url).origin;
  return json({ url: origin + "/media/" + key, key: key, expires_at: expiresAt });
}

async function deleteExpiredReceipts(env) {
  if (!env.MEDIA_BUCKET) return;
  const now = Date.now();
  let cursor;
  do {
    const page = await env.MEDIA_BUCKET.list({ prefix: "receipts/", cursor });
    for (const object of page.objects || []) {
      const expiresAt = Number(object.customMetadata?.expires_at || 0);
      if (expiresAt && expiresAt <= now) await env.MEDIA_BUCKET.delete(object.key);
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}

// ── Upload handler ─────────────────────────────────────────────────────

async function handleVideoUpload(request, env) {
  const provided = request.headers.get("X-Admin-Secret") || "";
  if (!env.UPLOAD_SECRET || provided !== env.UPLOAD_SECRET) {
    return json({ error: "Unauthorized. Set UPLOAD_SECRET via wrangler secret put." }, 401);
  }

  // Fast pre-check on Content-Length before reading body
  const contentLength = parseInt(request.headers.get("Content-Length") || "0", 10);
  if (contentLength > MAX_VIDEO_BYTES) {
    return json(
      {
        error: `File too large: ${(contentLength / 1024 / 1024).toFixed(1)} MB sent. Limit is 5 MB (≈ 5s 720p).`
      },
      413
    );
  }

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return json({ error: "Could not parse multipart upload." }, 400);
  }

  const file = formData.get("video");
  if (!file || typeof file === "string") {
    return json({ error: 'No video file attached. Use field name "video".' }, 400);
  }

  const allowed = ["video/mp4", "video/webm", "video/quicktime"];
  if (!allowed.includes(file.type)) {
    return json({ error: `Unsupported format: ${file.type}. Use MP4 or WebM.` }, 415);
  }

  const buffer = await file.arrayBuffer();
  if (buffer.byteLength > MAX_VIDEO_BYTES) {
    return json(
      {
        error: `File too large: ${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB. Limit is 5 MB (≈ 5s 720p).`
      },
      413
    );
  }

  const rawId = (formData.get("item_id") || "item").replace(/[^a-z0-9_-]/gi, "").slice(0, 40);
  const ext = file.type === "video/webm" ? "webm" : "mp4";
  const filename = `clips/${rawId}_${Date.now()}.${ext}`;

  await env.MEDIA_BUCKET.put(filename, buffer, {
    httpMetadata: {
      contentType: file.type,
      cacheControl: "public, max-age=31536000, immutable"
    }
  });

  const origin = new URL(request.url).origin;
  return json({ url: `${origin}/media/${filename}`, filename, size_bytes: buffer.byteLength });
}

// ── Image upload handler ───────────────────────────────────────────────

async function handleImageUpload(request, env) {
  const provided = request.headers.get("X-Admin-Secret") || "";
  if (!env.UPLOAD_SECRET || provided !== env.UPLOAD_SECRET) {
    return json({ error: "Unauthorized. Set UPLOAD_SECRET via wrangler secret put." }, 401);
  }

  const contentLength = parseInt(request.headers.get("Content-Length") || "0", 10);
  if (contentLength > MAX_IMAGE_BYTES) {
    return json(
      {
        error: `File too large: ${(contentLength / 1024 / 1024).toFixed(1)} MB sent. Limit is 2 MB.`
      },
      413
    );
  }

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return json({ error: "Could not parse multipart upload." }, 400);
  }

  const file = formData.get("image");
  if (!file || typeof file === "string") {
    return json({ error: 'No image file attached. Use field name "image".' }, 400);
  }

  const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!allowed.includes(file.type)) {
    return json({ error: `Unsupported format: ${file.type}. Use JPEG, PNG, or WebP.` }, 415);
  }

  const buffer = await file.arrayBuffer();
  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    return json(
      {
        error: `File too large: ${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB. Limit is 2 MB.`
      },
      413
    );
  }

  const rawId = (formData.get("item_id") || "img").replace(/[^a-z0-9_-]/gi, "").slice(0, 40);
  const extMap = { "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
  const ext = extMap[file.type] || "jpg";
  const filename = `images/${rawId}_${Date.now()}.${ext}`;

  await env.MEDIA_BUCKET.put(filename, buffer, {
    httpMetadata: {
      contentType: file.type,
      cacheControl: "public, max-age=31536000, immutable"
    }
  });

  const origin = new URL(request.url).origin;
  return json({ url: `${origin}/media/${filename}`, filename, size_bytes: buffer.byteLength });
}

// ── Media serving with Cloudflare edge cache ───────────────────────────
// First request per edge PoP hits R2 once; all subsequent requests are
// served from Cloudflare's cache — no R2 Class B reads consumed.

async function serveMedia(key, request, env, ctx) {
  if (!key) return new Response("Not found", { status: 404 });

  const cache = caches.default;
  const cacheKey = new Request(request.url, request);

  // Return cached response if available
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  // Fetch from R2
  const obj = await env.MEDIA_BUCKET.get(key);
  if (!obj) return new Response("Not found", { status: 404 });

  if (key.startsWith("receipts/")) {
    const expiresAt = Number(obj.customMetadata?.expires_at || 0);
    if (expiresAt && expiresAt <= Date.now()) {
      ctx.waitUntil(env.MEDIA_BUCKET.delete(key));
      return new Response("Receipt expired", { status: 410 });
    }
  }

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set(
    "Cache-Control",
    key.startsWith("receipts/") ? "private, no-store" : "public, max-age=31536000, immutable"
  );
  headers.set("Access-Control-Allow-Origin", "*");

  const response = new Response(obj.body, { headers });

  // Store in edge cache (async — don't block the response)
  ctx.waitUntil(cache.put(cacheKey, response.clone()));

  return response;
}
