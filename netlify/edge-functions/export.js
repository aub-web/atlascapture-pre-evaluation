// Netlify Edge Function serving /export/<id>?e=<expiry>&s=<signature> as a ZIP download.
// The API (src/exports.js) saves a manifest (CSV + file list) in Blobs and signs the link with
// SESSION_SECRET. This streams the ZIP from the stored chunks, so large exports aren't limited by
// function response sizes. Same ZIP layout as streamZip() in src/exports.js.

import { getStore } from '@netlify/blobs';

const enc = new TextEncoder();

function base64url(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function validSignature(id, exp, sig) {
  const secret = Netlify.env.get('SESSION_SECRET');
  if (!secret || !id || !exp || !sig || Number(exp) < Date.now() / 1000) return false;
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = base64url(await crypto.subtle.sign('HMAC', key, enc.encode(`export:${id}:${exp}`)));
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf, crc) {
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return crc;
}

function header(size, fill) {
  const b = new Uint8Array(size);
  fill(new DataView(b.buffer));
  return b;
}

export default async (request) => {
  const url = new URL(request.url);
  const id = decodeURIComponent(url.pathname.replace(/^\/export\//, ''));
  if (!/^[a-f0-9-]{36}$/.test(id) || !(await validSignature(id, url.searchParams.get('e'), url.searchParams.get('s')))) {
    return new Response('This export link has expired. Create the export again.', { status: 403 });
  }
  const store = getStore('media');
  const manifest = await store.get(`exports/${id}`, { type: 'json' });
  if (!manifest) return new Response('Export not found', { status: 404 });

  const now = new Date();
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const entries = [{ name: 'tickets.csv', data: enc.encode(manifest.csv) }, ...manifest.files];

  const body = new ReadableStream({
    async start(controller) {
      try {
        const central = [];
        let offset = 0;
        for (const entry of entries) {
          const name = enc.encode(entry.name);
          controller.enqueue(header(30, (v) => {
            v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0x0808, true);
            v.setUint16(10, time, true); v.setUint16(12, date, true); v.setUint16(26, name.length, true);
          }));
          controller.enqueue(name);
          let crc = 0xffffffff;
          let size = 0;
          if (entry.data) {
            crc = crc32(entry.data, crc);
            size = entry.data.length;
            controller.enqueue(entry.data);
          } else {
            for (let n = 0; n < entry.chunks; n++) {
              const data = new Uint8Array(await store.get(`${entry.key}/${n}`, { type: 'arrayBuffer' }));
              crc = crc32(data, crc);
              size += data.length;
              controller.enqueue(data);
            }
          }
          crc = (crc ^ 0xffffffff) >>> 0;
          controller.enqueue(header(16, (v) => {
            v.setUint32(0, 0x08074b50, true); v.setUint32(4, crc, true); v.setUint32(8, size, true); v.setUint32(12, size, true);
          }));
          central.push({ name, crc, size, offset });
          offset += 30 + name.length + size + 16;
        }
        const cdStart = offset;
        for (const e of central) {
          controller.enqueue(header(46, (v) => {
            v.setUint32(0, 0x02014b50, true); v.setUint16(4, 20, true); v.setUint16(6, 20, true); v.setUint16(8, 0x0808, true);
            v.setUint16(12, time, true); v.setUint16(14, date, true); v.setUint32(16, e.crc, true);
            v.setUint32(20, e.size, true); v.setUint32(24, e.size, true); v.setUint16(28, e.name.length, true); v.setUint32(42, e.offset, true);
          }));
          controller.enqueue(e.name);
          offset += 46 + e.name.length;
        }
        controller.enqueue(header(22, (v) => {
          v.setUint32(0, 0x06054b50, true); v.setUint16(8, central.length, true); v.setUint16(10, central.length, true);
          v.setUint32(12, offset - cdStart, true); v.setUint32(16, cdStart, true);
        }));
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
  return new Response(body, {
    headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${manifest.fileName}"`, 'Cache-Control': 'private, no-store' },
  });
};

export const config = { path: '/export/*' };
