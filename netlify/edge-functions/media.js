// Netlify Edge Function serving /media/<key>?e=<expiry>&s=<signature>.
// Links are signed by the API (src/app.js mediaUrl) with SESSION_SECRET, so no database lookup is
// needed here. Files are stored as 4 MB chunks in the "media" Blobs store and streamed back with
// Range support, so videos can be seeked and large files bypass the function response limit.

import { getStore } from '@netlify/blobs';

const encoder = new TextEncoder();

function base64url(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function validSignature(key, exp, sig) {
  const secret = Netlify.env.get('SESSION_SECRET');
  if (!secret || !key || !exp || !sig || Number(exp) < Date.now() / 1000) return false;
  const cryptoKey = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = base64url(await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(`media:${key}:${exp}`)));
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

export default async (request) => {
  const url = new URL(request.url);
  const key = decodeURIComponent(url.pathname.replace(/^\/media\//, ''));
  if (!/^[a-f0-9-]{36}$/.test(key) || !(await validSignature(key, url.searchParams.get('e'), url.searchParams.get('s')))) {
    return new Response('This media link has expired. Reload the page.', { status: 403 });
  }

  const store = getStore('media');
  const meta = await store.get(`${key}/meta`, { type: 'json' });
  if (!meta) return new Response('Not found', { status: 404 });

  let start = 0;
  let end = meta.size - 1;
  let status = 200;
  const headers = new Headers({
    'Content-Type': meta.mime,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=3600',
  });
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') || '');
  if (range) {
    if (range[1] === '') start = Math.max(0, meta.size - Number(range[2]));
    else {
      start = Number(range[1]);
      if (range[2] !== '') end = Math.min(end, Number(range[2]));
    }
    if (start > end || start >= meta.size) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${meta.size}` } });
    }
    status = 206;
    headers.set('Content-Range', `bytes ${start}-${end}/${meta.size}`);
  }
  headers.set('Content-Length', String(end - start + 1));

  let n = Math.floor(start / meta.chunkSize);
  const last = Math.floor(end / meta.chunkSize);
  const body = new ReadableStream({
    async pull(controller) {
      if (n > last) return controller.close();
      const data = await store.get(`${key}/${n}`, { type: 'arrayBuffer' });
      if (!data) return controller.error(new Error(`missing chunk ${n}`));
      const base = n * meta.chunkSize;
      controller.enqueue(new Uint8Array(data).subarray(Math.max(0, start - base), Math.min(data.byteLength, end - base + 1)));
      n++;
    },
  });
  return new Response(body, { status, headers });
};

export const config = { path: '/media/*' };
