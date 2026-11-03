'use strict';

// "Export ZIP" for admins: a CSV of the selected tickets plus their photos/videos, named like the
// Drive copies (Country_Project_BusinessName_TICKET_View) in a folder per country.
//
// Building the ZIP happens while it downloads: an export "manifest" (file list + CSV) is saved, and a
// signed link streams the ZIP from storage. On Netlify the edge function netlify/edge-functions/export.js
// does the streaming (no function size limit); locally streamZip() below does it.

const crypto = require('crypto');
const { q, now } = require('./db');
const storage = require('./storage');
const { getProject } = require('./projects');
const { fileNameFor } = require('./drive');

const STATUS_LABELS = { pending: 'Pending QC Review', reviewing: 'Reviewing', approved: 'Approved', returned: 'Returned / Needs Fixes' };
const MAX_ZIP_BYTES = 3.9 * 1024 ** 3; // plain ZIP (no ZIP64) tops out at 4 GB

const csvCell = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s; // don't let spreadsheet apps run formulas
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

async function buildManifest(ticketIds, { includeMedia = true } = {}) {
  const tickets = await q(`SELECT t.*, sd.name AS sd_name, spl.name AS spl_name, r.name AS reviewer_name, st.country, st.region
    FROM tickets t JOIN users sd ON sd.id = t.sd_id LEFT JOIN users spl ON spl.id = t.spl_id LEFT JOIN users r ON r.id = t.reviewer_id
    LEFT JOIN studios st ON st.name = t.studio WHERE t.id = ANY($1) ORDER BY t.id`, [ticketIds]);
  const ids = tickets.map((t) => t.id);
  const returns = await q(`SELECT DISTINCT ON (h.ticket_id) h.ticket_id, h.comment, u.name AS user_name FROM history h
    LEFT JOIN users u ON u.id = h.user_id WHERE h.action = 'returned' AND h.ticket_id = ANY($1) ORDER BY h.ticket_id, h.id DESC`, [ids]);
  const lastReturn = Object.fromEntries(returns.map((r) => [r.ticket_id, r]));
  const media = includeMedia
    ? await q('SELECT * FROM media WHERE ticket_id = ANY($1) AND archived_at IS NULL ORDER BY ticket_id, submission_no, id', [ids])
    : [];

  const header = ['Ticket', 'Status', 'Project', 'Country', 'City / Region', 'Studio', 'Set Director', 'Assigned SPL', 'Task Name', 'Scene',
    'Business Type', 'Boundary (m)', 'Round', 'QC Reviewer', 'Latest QC Feedback', 'Submitted At', 'Last Updated', 'Decided At', 'Files'];
  const byTicket = {};
  const files = [];
  const used = new Set();
  for (const m of media) {
    const t = tickets.find((x) => x.id === m.ticket_id);
    const meta = await storage.getMeta(m.storage_key);
    if (!meta) continue;
    const country = t.country || 'Unassigned';
    let name = `${country.replace(/[\\/:*?"<>|]/g, '')}/${fileNameFor({
      country, project: getProject(t.project)?.name || t.project, business: t.business_type,
      code: m.submission_no > 1 ? `${t.code}-R${m.submission_no}` : t.code, label: m.label, mime: m.mime, originalName: m.original_name,
    })}`;
    while (used.has(name)) name = name.replace(/(\.[a-z0-9]+)?$/i, (ext) => `-2${ext}`);
    used.add(name);
    files.push({ key: m.storage_key, name, size: meta.size, chunks: meta.chunks, chunkSize: meta.chunkSize });
    (byTicket[t.id] ||= []).push(name);
  }
  const rows = tickets.map((t) => [
    t.code, STATUS_LABELS[t.status] || t.status, getProject(t.project)?.name || t.project, t.country || '', t.region || '', t.studio || '',
    t.sd_name, t.spl_name || '', t.task_name, t.scene, t.business_type, t.boundary_size ? `${t.boundary_size} x ${t.boundary_size}` : '',
    t.submission_no, t.reviewer_name || '', lastReturn[t.id] ? `${lastReturn[t.id].comment} (${lastReturn[t.id].user_name || 'QC'})` : '',
    t.created_at, t.updated_at, t.decided_at || '', (byTicket[t.id] || []).join(' | '),
  ]);
  const csv = '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
  const totalBytes = files.reduce((s, f) => s + f.size, 0) + Buffer.byteLength(csv);
  if (totalBytes > MAX_ZIP_BYTES) throw Object.assign(new Error('That selection is over 3.9 GB. Filter it down (by country, city or project) and export in parts.'), { status: 400 });

  const id = crypto.randomUUID();
  const stamp = now().slice(0, 16).replace(/[-:T]/g, '').replace(/^(\d{8})(\d{4})$/, '$1-$2');
  const manifest = { id, fileName: `studio-setup-qc-export-${stamp}.zip`, csv, files, created_at: now() };
  await storage.putDoc(id, manifest);
  return { id, fileName: manifest.fileName, tickets: tickets.length, files: files.length, bytes: totalBytes };
}

// ---------- Streaming ZIP writer (stored, no compression; same format as the edge function) ----------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf, crc = 0xffffffff) {
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return crc;
}
function dosDateTime(d = new Date()) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

// Writes the ZIP to `write(buffer)` (awaited). `readChunk(key, n)` returns a file's nth stored part.
async function streamZip(manifest, write, readChunk) {
  const { time, date } = dosDateTime();
  const central = [];
  let offset = 0;
  const entries = [{ name: 'tickets.csv', data: Buffer.from(manifest.csv, 'utf8') }, ...manifest.files];
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0808, 6); // sizes in data descriptor + UTF-8 names
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt16LE(name.length, 26);
    await write(Buffer.concat([local, name]));
    let crc = 0xffffffff;
    let size = 0;
    if (entry.data) {
      crc = crc32(entry.data, crc);
      size = entry.data.length;
      await write(entry.data);
    } else {
      for (let n = 0; n < entry.chunks; n++) {
        const chunk = await readChunk(entry.key, n);
        crc = crc32(chunk, crc);
        size += chunk.length;
        await write(chunk);
      }
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const desc = Buffer.alloc(16);
    desc.writeUInt32LE(0x08074b50, 0);
    desc.writeUInt32LE(crc, 4);
    desc.writeUInt32LE(size, 8);
    desc.writeUInt32LE(size, 12);
    await write(desc);
    central.push({ name, crc, size, offset });
    offset += 30 + name.length + size + 16;
  }
  const cdStart = offset;
  for (const e of central) {
    const h = Buffer.alloc(46);
    h.writeUInt32LE(0x02014b50, 0);
    h.writeUInt16LE(20, 4);
    h.writeUInt16LE(20, 6);
    h.writeUInt16LE(0x0808, 8);
    h.writeUInt16LE(0, 10);
    h.writeUInt16LE(time, 12);
    h.writeUInt16LE(date, 14);
    h.writeUInt32LE(e.crc, 16);
    h.writeUInt32LE(e.size, 20);
    h.writeUInt32LE(e.size, 24);
    h.writeUInt16LE(e.name.length, 28);
    h.writeUInt32LE(e.offset, 42);
    await write(Buffer.concat([h, e.name]));
    offset += 46 + e.name.length;
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(central.length, 8);
  end.writeUInt16LE(central.length, 10);
  end.writeUInt32LE(offset - cdStart, 12);
  end.writeUInt32LE(cdStart, 16);
  await write(end);
}

module.exports = { buildManifest, streamZip, MAX_ZIP_BYTES };
