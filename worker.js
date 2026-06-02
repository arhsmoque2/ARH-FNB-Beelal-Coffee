/**
 * Cloudflare Worker — fnb-pwa
 *
 * Routes:
 *   POST /api/upload/video   — validate & store video to R2, return URL
 *   GET  /media/*            — serve media files from R2 (edge-cached)
 *   *                        — pass through to static assets (Pages)
 *
 * Limits:
 *   Per file  — 5 MB max, MP4/WebM only (duration enforced client-side: max 5s, 720p)
 *   Per store — 100 MB soft cap tracked in Firebase by admin; Worker enforces per-file only
 *
 * Required Worker secrets (wrangler secret put):
 *   UPLOAD_SECRET   — random string; mirror in Firebase config/dev/video_upload_secret
 *
 * Required R2 binding (wrangler.jsonc):
 *   MEDIA_BUCKET    — R2 bucket (fnb-pwa-media)
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Secret',
};

const MAX_VIDEO_BYTES = 5 * 1024 * 1024; // 5 MB — ~5s 720p at good quality

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (url.pathname === '/api/upload/video') {
      if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
      return handleVideoUpload(request, env);
    }

    if (url.pathname.startsWith('/media/')) {
      const key = url.pathname.slice('/media/'.length);
      return serveMedia(key, request, env, ctx);
    }

    return env.ASSETS.fetch(request);
  },
};

// ── Helpers ───────────────────────────────────────────────────────────

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// ── Upload handler ─────────────────────────────────────────────────────

async function handleVideoUpload(request, env) {
  const provided = request.headers.get('X-Admin-Secret') || '';
  if (!env.UPLOAD_SECRET || provided !== env.UPLOAD_SECRET) {
    return json({ error: 'Unauthorized. Set UPLOAD_SECRET via wrangler secret put.' }, 401);
  }

  // Fast pre-check on Content-Length before reading body
  const contentLength = parseInt(request.headers.get('Content-Length') || '0', 10);
  if (contentLength > MAX_VIDEO_BYTES) {
    return json({
      error: `File too large: ${(contentLength / 1024 / 1024).toFixed(1)} MB sent. Limit is 5 MB (≈ 5s 720p).`,
    }, 413);
  }

  let formData;
  try { formData = await request.formData(); }
  catch { return json({ error: 'Could not parse multipart upload.' }, 400); }

  const file = formData.get('video');
  if (!file || typeof file === 'string') {
    return json({ error: 'No video file attached. Use field name "video".' }, 400);
  }

  const allowed = ['video/mp4', 'video/webm', 'video/quicktime'];
  if (!allowed.includes(file.type)) {
    return json({ error: `Unsupported format: ${file.type}. Use MP4 or WebM.` }, 415);
  }

  const buffer = await file.arrayBuffer();
  if (buffer.byteLength > MAX_VIDEO_BYTES) {
    return json({
      error: `File too large: ${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB. Limit is 5 MB (≈ 5s 720p).`,
    }, 413);
  }

  const rawId = (formData.get('item_id') || 'item').replace(/[^a-z0-9_-]/gi, '').slice(0, 40);
  const ext   = file.type === 'video/webm' ? 'webm' : 'mp4';
  const filename = `clips/${rawId}_${Date.now()}.${ext}`;

  await env.MEDIA_BUCKET.put(filename, buffer, {
    httpMetadata: {
      contentType: file.type,
      cacheControl: 'public, max-age=31536000, immutable',
    },
  });

  const origin = new URL(request.url).origin;
  return json({ url: `${origin}/media/${filename}`, filename, size_bytes: buffer.byteLength });
}

// ── Media serving with Cloudflare edge cache ───────────────────────────
// First request per edge PoP hits R2 once; all subsequent requests are
// served from Cloudflare's cache — no R2 Class B reads consumed.

async function serveMedia(key, request, env, ctx) {
  if (!key) return new Response('Not found', { status: 404 });

  const cache    = caches.default;
  const cacheKey = new Request(request.url, request);

  // Return cached response if available
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  // Fetch from R2
  const obj = await env.MEDIA_BUCKET.get(key);
  if (!obj) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('Access-Control-Allow-Origin', '*');

  const response = new Response(obj.body, { headers });

  // Store in edge cache (async — don't block the response)
  ctx.waitUntil(cache.put(cacheKey, response.clone()));

  return response;
}
