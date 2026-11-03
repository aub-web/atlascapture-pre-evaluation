'use strict';

// Copies every submitted photo/video into a Google Drive folder, named
//   Country_Project_BusinessName_TICKET_View.ext   (e.g. Philippines_EgoExo_Retail_TKT-0004_EXO-1.jpg)
//
// How: the Apps Script attached to the ticket sheet (scripts/google-sheets-sync.gs) opens a Drive
// "resumable upload session" in the folder and returns its URL. The site then PUTs the file to that
// URL in 4 MB pieces straight from storage. Each file is a job in `drive_jobs`, so a transfer that
// doesn't finish in one request continues on the next run (after submissions, and from the
// scheduled function netlify/functions/drive-sync.mjs).
//
// Enabled with DRIVE_SYNC=1 (plus SHEETS_WEBHOOK_URL / SHEETS_WEBHOOK_SECRET for the script).

const { q, one, run, now } = require('./db');
const storage = require('./storage');
const { getProject } = require('./projects');

const driveEnabled = () => process.env.DRIVE_SYNC === '1' && Boolean(process.env.SHEETS_WEBHOOK_URL && process.env.SHEETS_WEBHOOK_SECRET);

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif', 'image/gif': 'gif',
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'video/x-matroska': 'mkv' };

// Keeps letters (any language), digits and dashes; spaces become dashes; parts joined with "_".
const part = (s) => String(s || '').normalize('NFKC').trim().replace(/[\s_]+/g, '-').replace(/[^\p{L}\p{N}-]+/gu, '').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'NA';

function fileNameFor({ country, project, business, code, label, mime, originalName }) {
  const ext = EXT[mime] || (String(originalName || '').match(/\.([a-z0-9]{2,5})$/i)?.[1] || 'bin').toLowerCase();
  return `${[part(country || 'Unassigned'), part(project), part(business), part(code), part(label)].join('_')}.${ext}`;
}

// Queues Drive copies for a ticket's media (call after the media rows are inserted).
async function queueTicketMedia(ticketId, submissionNo) {
  if (!driveEnabled()) return 0;
  const rows = await q(`SELECT m.id, m.storage_key, m.label, m.mime, m.size, m.original_name, t.code, t.project, t.business_type, st.country
    FROM media m JOIN tickets t ON t.id = m.ticket_id LEFT JOIN studios st ON st.name = t.studio
    WHERE m.ticket_id = $1 AND m.submission_no = $2 AND NOT EXISTS (SELECT 1 FROM drive_jobs j WHERE j.media_id = m.id)`, [ticketId, submissionNo]);
  for (const m of rows) {
    const meta = await storage.getMeta(m.storage_key);
    const round = submissionNo > 1 ? `R${submissionNo}` : '';
    const name = fileNameFor({
      country: m.country, project: getProject(m.project)?.name || m.project, business: m.business_type,
      code: round ? `${m.code}-${round}` : m.code, label: m.label, mime: m.mime, originalName: m.original_name,
    });
    await run(`INSERT INTO drive_jobs (media_id, storage_key, file_name, mime, size, chunk_size, chunks, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)`,
      [m.id, m.storage_key, name, m.mime, m.size, meta?.chunkSize || storage.CHUNK_SIZE, meta?.chunks || 1, now()]);
  }
  return rows.length;
}

async function openSession(job) {
  const res = await fetch(process.env.SHEETS_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ secret: process.env.SHEETS_WEBHOOK_SECRET, action: 'drive-session', name: job.file_name, mime: job.mime, size: job.size }),
    redirect: 'follow',
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}
  if (!data?.ok || !data.uploadUrl) throw new Error(data?.error || `Apps Script answered HTTP ${res.status}: ${text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 160)}`);
  return data.uploadUrl;
}

// Sends the next pieces of one job until it finishes or the deadline passes. Returns the new status.
async function advanceJob(job, deadline) {
  let uploadUrl = job.upload_url;
  if (!uploadUrl) {
    uploadUrl = await openSession(job);
    await run('UPDATE drive_jobs SET upload_url = $1, status = $2, updated_at = $3 WHERE id = $4', [uploadUrl, 'uploading', now(), job.id]);
  }
  for (let n = job.next_chunk; n < job.chunks; n++) {
    if (Date.now() > deadline) return 'uploading';
    const chunk = await storage.getChunk(job.storage_key, n);
    if (!chunk) throw new Error(`Stored file part ${n} is missing`);
    const start = n * job.chunk_size;
    const end = start + chunk.length - 1;
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Length': String(chunk.length), 'Content-Range': `bytes ${start}-${end}/${job.size}` },
      body: chunk,
      signal: AbortSignal.timeout(60_000),
    });
    if (res.status === 308) {
      await run('UPDATE drive_jobs SET next_chunk = $1, updated_at = $2 WHERE id = $3', [n + 1, now(), job.id]);
      continue;
    }
    if (res.ok) {
      const body = await res.json().catch(() => ({}));
      await run("UPDATE drive_jobs SET next_chunk = $1, status = 'done', drive_file_id = $2, error = NULL, updated_at = $3 WHERE id = $4",
        [job.chunks, body.id || null, now(), job.id]);
      return 'done';
    }
    if (res.status === 404 || res.status === 410) {
      // Session expired (they last about a week): start this file over.
      await run("UPDATE drive_jobs SET upload_url = NULL, next_chunk = 0, status = 'pending', updated_at = $1 WHERE id = $2", [now(), job.id]);
      return 'pending';
    }
    throw new Error(`Drive answered HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
  }
  return 'uploading';
}

// Works through queued jobs for up to `budgetMs`. Jobs that fail 8 times stop retrying.
async function processDriveJobs(budgetMs = 5000) {
  if (!driveEnabled()) return { enabled: false };
  const deadline = Date.now() + budgetMs;
  const jobs = await q("SELECT * FROM drive_jobs WHERE status IN ('pending', 'uploading') AND attempts < 8 ORDER BY id LIMIT 25");
  let done = 0;
  for (const job of jobs) {
    if (Date.now() > deadline) break;
    try {
      if ((await advanceJob(job, deadline)) === 'done') done++;
    } catch (err) {
      console.error(`[drive] ${job.file_name}: ${err.message}`);
      await run("UPDATE drive_jobs SET attempts = attempts + 1, error = $1, status = CASE WHEN attempts + 1 >= 8 THEN 'failed' ELSE status END, updated_at = $2 WHERE id = $3",
        [err.message.slice(0, 500), now(), job.id]);
    }
  }
  return { enabled: true, processed: jobs.length, done };
}

async function driveStatus() {
  const rows = await q('SELECT status, COUNT(*)::int AS n FROM drive_jobs GROUP BY status');
  const counts = Object.fromEntries(rows.map((r) => [r.status, r.n]));
  const lastError = await one("SELECT file_name, error, updated_at FROM drive_jobs WHERE error IS NOT NULL AND status <> 'done' ORDER BY updated_at DESC LIMIT 1");
  return { enabled: driveEnabled(), done: counts.done || 0, waiting: (counts.pending || 0) + (counts.uploading || 0), failed: counts.failed || 0, lastError: lastError || null };
}

// Lets failed jobs try again (e.g. after fixing folder access).
const retryFailed = () => run("UPDATE drive_jobs SET status = 'pending', attempts = 0, upload_url = NULL, next_chunk = 0, error = NULL WHERE status = 'failed'");

module.exports = { driveEnabled, fileNameFor, queueTicketMedia, processDriveJobs, driveStatus, retryFailed };
