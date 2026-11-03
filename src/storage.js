'use strict';

// Media storage, written in chunks (uploads arrive in pieces small enough for serverless limits).
//   - On Netlify: Netlify Blobs store "media", keys `<id>/<n>` for chunks and `<id>/meta` for metadata
//   - Locally: files under DATA_DIR/uploads/<id>/
// The media edge function (netlify/edge-functions/media.js) reads the same Blobs layout.

const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./db');
const { HOSTED } = require('./env');

const CHUNK_SIZE = 4 * 1024 * 1024; // stays under the ~6 MB function request limit after base64
// Checked per call: Netlify provides the Blobs context per request (see netlify/functions/api.js).
const blobsAvailable = () => HOSTED || Boolean(process.env.NETLIFY_BLOBS_CONTEXT);

function blobStore() {
  const { getStore } = require('@netlify/blobs');
  return getStore('media');
}

const dirFor = (id) => path.join(DATA_DIR, 'uploads', id.replace(/[^a-zA-Z0-9-]/g, ''));

async function putChunk(id, n, buffer) {
  if (blobsAvailable()) return blobStore().set(`${id}/${n}`, buffer);
  fs.mkdirSync(dirFor(id), { recursive: true });
  fs.writeFileSync(path.join(dirFor(id), `${n}.chunk`), buffer);
}

async function getChunk(id, n) {
  if (blobsAvailable()) {
    const data = await blobStore().get(`${id}/${n}`, { type: 'arrayBuffer' });
    return data ? Buffer.from(data) : null;
  }
  const file = path.join(dirFor(id), `${n}.chunk`);
  return fs.existsSync(file) ? fs.readFileSync(file) : null;
}

async function putMeta(id, meta) {
  if (blobsAvailable()) return blobStore().setJSON(`${id}/meta`, meta);
  fs.mkdirSync(dirFor(id), { recursive: true });
  fs.writeFileSync(path.join(dirFor(id), 'meta.json'), JSON.stringify(meta));
}

async function getMeta(id) {
  if (blobsAvailable()) return blobStore().get(`${id}/meta`, { type: 'json' });
  const file = path.join(dirFor(id), 'meta.json');
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}

// Removes a stored file (all chunks + metadata). Used when admins archive media after exporting it.
async function deleteFile(id) {
  if (blobsAvailable()) {
    const store = blobStore();
    const meta = await store.get(`${id}/meta`, { type: 'json' });
    for (let n = 0; n < (meta?.chunks || 0); n++) await store.delete(`${id}/${n}`);
    return store.delete(`${id}/meta`);
  }
  fs.rmSync(dirFor(id), { recursive: true, force: true });
}

// Small JSON documents (export manifests), kept beside the media under "exports/<id>".
async function putDoc(key, data) {
  if (blobsAvailable()) return blobStore().setJSON(`exports/${key}`, data);
  fs.mkdirSync(path.join(DATA_DIR, 'exports'), { recursive: true });
  fs.writeFileSync(path.join(DATA_DIR, 'exports', `${key.replace(/[^a-zA-Z0-9-]/g, '')}.json`), JSON.stringify(data));
}

async function getDoc(key) {
  if (blobsAvailable()) return blobStore().get(`exports/${key}`, { type: 'json' });
  const file = path.join(DATA_DIR, 'exports', `${key.replace(/[^a-zA-Z0-9-]/g, '')}.json`);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}

module.exports = { CHUNK_SIZE, putChunk, getChunk, putMeta, getMeta, deleteFile, putDoc, getDoc };
