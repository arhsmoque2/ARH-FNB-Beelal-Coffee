/**
 * Cloudflare Worker — fnb-pwa
 *
 * Routes:
 *   POST /api/upload/video   — validate & store video to R2, return URL
 *   GET  /media/*            — serve media files from R2
 *   *                        — pass through to static assets (Pages)
 *
 * Required Worker secrets (set via `wrangler secret put`):
 *   UPLOAD_SECRET   — random string; also stored in Firebase config/dev/video_upload_secret
 *
 * Required R2 binding (wrangler.jsonc):
 *   MEDIA_BUCKET    — R2 bucket
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Secret',
};

const MAX_VIDEO_BYTES = 8 * 1024 * 1024; // 8 MB hard limit

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    // Video upload
    if (url.pathname === '/api/upload/video') {
      if (request.method !== 'POST') {
        return json({ error: 'Method not allowed' }, 405);
      }
      return handleVideoUpload(request, env);
    }

    // Media serving from R2
    if (url.pathname.startsWith('/media/')) {
      const key = url.pathname.slice('/media/'.length);
      return serveMedia(key, env);
    }

    // Everything else → static site assets
    return env.ASSETS.fetch(request);
  },
};

// ── Helpers ──────────────────────────────────────────────────────────

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// ── Upload handler ────────────────────────────────────────────────────

async function handleVideoUpload(request, env) {
  // Auth — compare against UPLOAD_SECRET Worker secret
  const provided = request.headers.get('X-Admin-Secret') || '';
  if (!env.UPLOAD_SECRET || provided !== env.UPLOAD_SECRET) {
    return json({ error: 'Unauthorized. Set UPLOAD_SECRET in Worker secrets and config/dev/video_upload_secret in Firebase.' }, 401);
  }

  // Fast size pre-check from Content-Length header (before reading body)
  const contentLength = parseInt(request.headers.get('Content-Length') || '0', 10);
  if (contentLength > MAX_VIDEO_BYTES) {
    return json({
      error: `File too large: ${(contentLength / 1024 / 1024).toFixed(1)} MB. Maximum is 8 MB.`,
    }, 413);
  }

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return json({ error: 'Could not parse multipart upload.' }, 400);
  }

  const file = formData.get('video');
  if (!file || typeof file === 'string') {
    return json({ error: 'No video file attached. Send field name "video".' }, 400);
  }

  // MIME type gate
  const allowed = ['video/mp4', 'video/webm', 'video/quicktime'];
  if (!allowed.includes(file.type)) {
    return json({ error: `Unsupported format: ${file.type}. Use MP4 or WebM.` }, 415);
  }

  // Read the full buffer and hard-check size
  const buffer = await file.arrayBuffer();
  if (buffer.byteLength > MAX_VIDEO_BYTES) {
    return json({
      error: `File too large: ${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB. Maximum is 8 MB.`,
    }, 413);
  }

  // Build a safe filename: clips/{itemId}_{timestamp}.mp4|webm
  const rawId = (formData.get('item_id') || 'item').replace(/[^a-z0-9_-]/gi, '').slice(0, 40);
  const ext = file.type === 'video/webm' ? 'webm' : 'mp4';
  const filename = `clips/${rawId}_${Date.now()}.${ext}`;

  // Store to R2
  await env.MEDIA_BUCKET.put(filename, buffer, {
    httpMetadata: {
      contentType: file.type,
      cacheControl: 'public, max-age=31536000, immutable',
    },
  });

  const origin = new URL(request.url).origin;
  return json({
    url: `${origin}/media/${filename}`,
    filename,
    size_bytes: buffer.byteLength,
  });
}

// ── Media serving ─────────────────────────────────────────────────────

async function serveMedia(key, env) {
  if (!key) return new Response('Not found', { status: 404 });

  const obj = await env.MEDIA_BUCKET.get(key);
  if (!obj) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('Access-Control-Allow-Origin', '*');

  return new Response(obj.body, { headers });
}
