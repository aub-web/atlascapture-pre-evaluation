'use strict';

// The Express app. Runs locally (server.js) and as a Netlify Function (netlify/functions/api.js).

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const { q, one, run, tx, now, syncRoster, DATA_DIR } = require('./db');
const { PROJECTS, getProject } = require('./projects');
const { notify, sendMail, mailEnabled } = require('./notify');
const storage = require('./storage');
const { HOSTED } = require('./env');

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
// The no-password name picker is for local development only, enabled with DEV_LOGIN=1.
const DEV_LOGIN = process.env.DEV_LOGIN === '1';
// Emails on these domains sign in without approval; any other email needs an admin/manager to approve it.
const COMPANY_DOMAINS = (process.env.ALLOWED_DOMAINS || 'atlascapture.io').split(',').map((d) => d.trim().toLowerCase()).filter(Boolean);
const isCompanyEmail = (email) => COMPANY_DOMAINS.includes(String(email || '').split('@')[1]?.toLowerCase());
const canSignIn = (user) => Boolean(user?.active && user.email && (isCompanyEmail(user.email) || user.login_approved));
const SECURE_COOKIE = /^https:/i.test(process.env.APP_URL || '') || HOSTED;
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

const STATUS_LABELS = {
  pending: 'Pending QC Review',
  reviewing: 'Reviewing',
  approved: 'Approved',
  returned: 'Returned / Needs Fixes',
};
const FEEDBACK_PLACEHOLDERS = ['[Problem / Issue Description]', '[Clear Correction or Required Action]'];
const MAX_IMAGE_BYTES = 30 * 1024 * 1024;
const MAX_VIDEO_BYTES = 1024 * 1024 * 1024;
const MEDIA_LINK_SECONDS = 6 * 60 * 60;

class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// ---------- Secret (sessions, codes, media links) ----------

let SECRET = process.env.SESSION_SECRET;
if (!SECRET) {
  if (HOSTED) throw new Error('SESSION_SECRET must be set in the Netlify environment variables');
  const secretFile = path.join(DATA_DIR, '.secret');
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(secretFile)) SECRET = fs.readFileSync(secretFile, 'utf8');
  else fs.writeFileSync(secretFile, (SECRET = crypto.randomBytes(32).toString('hex')));
}

const hmac = (value) => crypto.createHmac('sha256', SECRET).update(String(value)).digest('base64url');
const sign = (v) => `${v}.${hmac(v)}`;
// Short tag of the user's email (or name when there is none) bound into the session cookie.
const sessionTag = (user) => hmac(`user:${String(user.email || user.name).toLowerCase()}`).slice(0, 12);
function unsign(signed) {
  if (!signed) return null;
  const value = signed.slice(0, signed.lastIndexOf('.'));
  const a = Buffer.from(signed);
  const b = Buffer.from(sign(value));
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? value : null;
}
function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

// Media links are signed and expire, so the media edge function can check them without a database.
// The same signature format is verified in netlify/edge-functions/media.js.
function mediaUrl(key) {
  const exp = Math.floor(Date.now() / 1000) + MEDIA_LINK_SECONDS;
  return `/media/${key}?e=${exp}&s=${hmac(`media:${key}:${exp}`)}`;
}
function validMediaSignature(key, exp, sig) {
  if (!key || !exp || !sig || Number(exp) < Date.now() / 1000) return false;
  const a = Buffer.from(String(sig));
  const b = Buffer.from(hmac(`media:${key}:${exp}`));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------- App ----------

const app = express();

// The Netlify function wrapper parses request bodies itself (see netlify/functions/api.js).
const unlessParsed = (parser) => (req, res, next) => (req.parsedByHost ? next() : parser(req, res, next));
app.set('trust proxy', true);

// Health check for the host (registered before the site password so it always answers).
app.get('/healthz', (req, res) => res.type('text').send('ok'));

// Optional shared password in front of the site (SITE_PASSWORD), for test deployments shared by link.
// A plain form + signed cookie rather than HTTP Basic auth: in-app browsers never show that dialog.
// The API answers 401 with code "site_password" so the page can show the password form itself.
if (process.env.SITE_PASSWORD) {
  const digest = (s) => crypto.createHash('sha256').update(String(s)).digest();
  const expected = digest(process.env.SITE_PASSWORD);
  const gateValue = `gate-${expected.toString('hex').slice(0, 16)}`;
  const gatePage = (error) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Studio Setup QC</title>
<style>
  :root{--bg:#f5f6f8;--card:#fff;--text:#16191f;--muted:#5d6573;--border:#e2e5ea;--accent:#2f6fed;--red:#c4302b;--red-soft:#fce8e7}
  @media (prefers-color-scheme:dark){:root{--bg:#0f1115;--card:#171a20;--text:#e8eaee;--muted:#a0a7b3;--border:#2b3039;--accent:#5b8ef5;--red:#f07167;--red-soft:#3a1a18}}
  *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:16px;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
  form{width:100%;max-width:360px;background:var(--card);border:1px solid var(--border);border-radius:12px;padding:28px 24px;text-align:center}
  h1{font-size:20px;margin:0 0 4px}p{margin:0 0 18px;color:var(--muted);font-size:14px}
  input{width:100%;height:44px;padding:0 12px;border:1px solid var(--border);border-radius:8px;background:var(--card);color:var(--text);font:inherit}
  button{width:100%;height:44px;margin-top:12px;border:0;border-radius:8px;background:var(--accent);color:#fff;font:inherit;font-weight:600;cursor:pointer}
  .err{margin:0 0 14px;padding:9px 12px;border-radius:8px;background:var(--red-soft);color:var(--red);font-size:14px}
</style></head><body>
<form method="post" action="/site-login">
  <h1>Studio Setup QC</h1><p>This is a test site. Enter the access password you were given.</p>
  ${error ? '<div class="err">That password isn\'t right. Please try again.</div>' : ''}
  <input type="password" name="password" placeholder="Access password" autocomplete="current-password" autofocus required>
  <button type="submit">Continue</button>
</form></body></html>`;
  const wantsJson = (req) => (req.headers.accept || '').includes('application/json');

  app.post('/site-login', unlessParsed(express.urlencoded({ extended: false })), unlessParsed(express.json()), async (req, res) => {
    if (crypto.timingSafeEqual(digest(req.body?.password ?? ''), expected)) {
      res.setHeader('Set-Cookie', `site=${encodeURIComponent(sign(gateValue))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}${req.secure ? '; Secure' : ''}`);
      return wantsJson(req) ? res.json({ ok: true }) : res.redirect(303, '/');
    }
    await new Promise((r) => setTimeout(r, 800)); // slow down guessing
    if (wantsJson(req)) return res.status(401).json({ error: "That password isn't right. Please try again.", code: 'site_password' });
    res.status(401).type('html').send(gatePage(true));
  });

  app.use((req, res, next) => {
    if (unsign(parseCookies(req.headers.cookie).site) === gateValue) return next();
    if (req.path.startsWith('/api/') || req.path.startsWith('/media/')) {
      return res.status(401).json({ error: 'Access password required', code: 'site_password' });
    }
    res.status(401).type('html').send(gatePage(false));
  });
}

app.use(unlessParsed(express.json({ limit: '1mb' })));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use(async (req, res, next) => {
  try {
    const session = unsign(parseCookies(req.headers.cookie).sid);
    const [uid, emailTag] = String(session || '').split(':');
    const user = uid && (await one('SELECT * FROM users WHERE id = $1 AND active = 1', [Number(uid) || 0]));
    // The session names the user's email too, so a cookie never maps onto a different person
    // (e.g. after a database reset). Revoking approval or deactivating ends the session immediately.
    if (user && emailTag === sessionTag(user) && (DEV_LOGIN || canSignIn(user))) req.user = user;
    next();
  } catch (err) {
    next(err);
  }
});

const requireAuth = (req, res, next) => (req.user ? next() : next(new HttpError(401, 'Not signed in')));
const requireRole =
  (...roles) =>
  (req, res, next) =>
    roles.includes(req.user.role) ? next() : next(new HttpError(403, 'Your role cannot perform this action'));

// ---------- Helpers ----------

const TICKET_SELECT = `
  SELECT t.*, sd.name AS sd_name, spl.name AS spl_name, r.name AS reviewer_name
  FROM tickets t
  JOIN users sd ON sd.id = t.sd_id
  LEFT JOIN users spl ON spl.id = t.spl_id
  LEFT JOIN users r ON r.id = t.reviewer_id`;

function shapeTicket(t) {
  return {
    ...t,
    status_label: STATUS_LABELS[t.status],
    project_name: getProject(t.project)?.name || t.project,
    setup_checklist: JSON.parse(t.setup_checklist || '{}'),
    qc_checks: JSON.parse(t.qc_checks || '{}'),
  };
}

// Which tickets a user may see: SDs their own, SPL/SPC their studio (or assigned), QC and Admins everything.
// Appends its parameters to `params` and returns the SQL condition.
function visibility(user, params) {
  if (user.role === 'SD') {
    params.push(user.id);
    return `t.sd_id = $${params.length}`;
  }
  if (user.role === 'SPL' || user.role === 'SPC') {
    params.push(user.studio, user.id);
    return `(t.studio = $${params.length - 1} OR t.spl_id = $${params.length})`;
  }
  return 'TRUE';
}

async function loadTicket(user, id) {
  const params = [Number(id) || 0];
  const t = await one(`${TICKET_SELECT} WHERE t.id = $1 AND ${visibility(user, params)}`, params);
  if (!t) throw new HttpError(404, 'Ticket not found');
  return t;
}

const historyFor = (ticketId) =>
  q(`SELECT h.*, u.name AS user_name, u.role AS user_role FROM history h LEFT JOIN users u ON u.id = h.user_id
     WHERE h.ticket_id = $1 ORDER BY h.id DESC`, [ticketId]);

const logHistory = (c, ticketId, userId, action, comment = null, via = 'app') =>
  c.run('INSERT INTO history (ticket_id, user_id, action, comment, via, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
    [ticketId, userId, action, comment, via, now()]);

const qcUserIds = async () => (await q("SELECT id FROM users WHERE role = 'QC' AND active = 1")).map((r) => r.id);

// Validates the setup checklist + media part of a submission (shared by submit and resubmit).
// Media arrives as [{ slot, uploadId }] referring to completed chunked uploads.
async function collectSubmission(project, body) {
  let checklist = body.checklist;
  if (typeof checklist === 'string') {
    try {
      checklist = JSON.parse(checklist);
    } catch {
      throw new HttpError(400, 'Invalid checklist data');
    }
  }
  checklist ||= {};
  const missing = project.setupChecklist.filter((c) => checklist[c.id] !== true);
  if (missing.length) throw new HttpError(400, `Confirm every setup checklist item. Missing: ${missing.map((m) => m.label).join('; ')}`);

  const boundarySize = Number(body.boundarySize);
  const { min, max } = project.boundary;
  if (!(boundarySize >= min && boundarySize <= max)) throw new HttpError(400, `Boundary box must be between ${min}m and ${max}m`);

  const items = Array.isArray(body.media) ? body.media : [];
  const ids = items.map((i) => String(i.uploadId || ''));
  const uploads = Object.fromEntries((await q("SELECT * FROM uploads WHERE id = ANY($1) AND status = 'complete'", [ids])).map((u) => [u.id, u]));
  const bySlot = Object.fromEntries(items.map((i) => [i.slot, uploads[String(i.uploadId)]]));

  const mediaType = body.mediaType === 'video' ? 'video' : 'images';
  const media = [];
  if (mediaType === 'video') {
    const u = bySlot.video;
    if (!u || !u.mime.startsWith('video/')) throw new HttpError(400, 'Upload a setup video clip');
    const { minSec, maxSec } = project.video;
    if (!(u.duration >= minSec - 0.5 && u.duration <= maxSec + 0.5)) throw new HttpError(400, `Video must be ${minSec}–${maxSec} seconds long`);
    media.push({ slot: 'video', label: 'Setup video', upload: u });
  } else {
    for (const s of project.mediaSlots) {
      const u = bySlot[s.key];
      if (!u || !u.mime.startsWith('image/')) throw new HttpError(400, `Missing preview image for ${s.label}`);
      media.push({ slot: s.key, label: s.label, upload: u });
    }
  }
  const cleanChecklist = Object.fromEntries(project.setupChecklist.map((c) => [c.id, true]));
  return { checklist: cleanChecklist, boundarySize, mediaType, media };
}

async function insertMedia(c, ticketId, submissionNo, media) {
  for (const m of media) {
    const u = m.upload;
    await c.run(`INSERT INTO media (ticket_id, submission_no, slot, label, storage_key, original_name, mime, size, duration, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [ticketId, submissionNo, m.slot, m.label, u.id, u.name, u.mime, u.size, u.duration ?? null, now()]);
    await c.run("UPDATE uploads SET status = 'used' WHERE id = $1", [u.id]);
  }
}

// ---------- Uploads (chunked) ----------
// 1. POST /api/uploads {name, mime, size, duration} → { uploadId, chunkSize }
// 2. PUT  /api/uploads/:id/:n  (raw bytes, in order)
// 3. POST /api/uploads/:id/complete
// Open to "Submit a photo" (no login); behind SITE_PASSWORD when that is set.

app.post('/api/uploads', async (req, res) => {
  const b = req.body || {};
  const mime = String(b.mime || '');
  const size = Number(b.size);
  if (!/^(image|video)\//.test(mime)) throw new HttpError(400, 'Only images and videos can be uploaded');
  const limit = mime.startsWith('video/') ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (!(size > 0) || size > limit) throw new HttpError(400, `Files must be under ${Math.round(limit / 1024 / 1024)} MB`);
  const duration = b.duration == null || b.duration === '' ? null : Number(b.duration);
  const id = crypto.randomUUID();
  const chunks = Math.ceil(size / storage.CHUNK_SIZE);
  await run(`INSERT INTO uploads (id, name, mime, size, duration, chunk_size, chunks, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, String(b.name || '').slice(0, 200) || null, mime, size, Number.isFinite(duration) ? duration : null, storage.CHUNK_SIZE, chunks, now()]);
  res.status(201).json({ uploadId: id, chunkSize: storage.CHUNK_SIZE, chunks });
});

app.put('/api/uploads/:id/:n', unlessParsed(express.raw({ type: () => true, limit: storage.CHUNK_SIZE + 1024 })), async (req, res) => {
  const u = await one("SELECT * FROM uploads WHERE id = $1 AND status = 'open'", [req.params.id]);
  if (!u) throw new HttpError(404, 'Upload not found');
  const n = Number(req.params.n);
  if (!Number.isInteger(n) || n < 0 || n >= u.chunks) throw new HttpError(400, 'Invalid chunk number');
  if (n > u.received) throw new HttpError(409, 'Chunks must be sent in order');
  const expectedLength = n < u.chunks - 1 ? u.chunk_size : u.size - u.chunk_size * (u.chunks - 1);
  const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (body.length !== expectedLength) throw new HttpError(400, `Chunk ${n} should be ${expectedLength} bytes, got ${body.length}`);
  await storage.putChunk(u.id, n, body);
  await run('UPDATE uploads SET received = GREATEST(received, $1) WHERE id = $2', [n + 1, u.id]);
  res.json({ ok: true });
});

app.post('/api/uploads/:id/complete', async (req, res) => {
  const u = await one("SELECT * FROM uploads WHERE id = $1 AND status = 'open'", [req.params.id]);
  if (!u) throw new HttpError(404, 'Upload not found');
  if (u.received !== u.chunks) throw new HttpError(409, `Upload incomplete: ${u.received} of ${u.chunks} parts received`);
  await storage.putMeta(u.id, { mime: u.mime, size: u.size, chunks: u.chunks, chunkSize: u.chunk_size });
  await run("UPDATE uploads SET status = 'complete' WHERE id = $1", [u.id]);
  res.json({ ok: true });
});

// ---------- Session routes ----------

const COOKIE_ATTRS = `Path=/; HttpOnly; SameSite=Lax${SECURE_COOKIE ? '; Secure' : ''}`;
function startSession(res, user) {
  res.setHeader('Set-Cookie', `sid=${encodeURIComponent(sign(`${user.id}:${sessionTag(user)}`))}; ${COOKIE_ATTRS}; Max-Age=${60 * 60 * 24 * 30}`);
  res.json(user);
}
const requireDevLogin = (req, res, next) => (DEV_LOGIN ? next() : next(new HttpError(404, 'Not found')));

app.get('/api/auth-config', (req, res) =>
  res.json({ googleClientId: GOOGLE_CLIENT_ID || null, devLogin: DEV_LOGIN, companyDomains: COMPANY_DOMAINS, emailEnabled: mailEnabled }));

// ---------- Email sign-in (one-time code) ----------
// 1. POST /api/auth/email/start {email}: tells the client what to do next (code sent, needs approval,
//    request access...). 2. POST /api/auth/email/verify {email, code}: starts the session.
// Codes are stored hashed, expire after 10 minutes and allow 5 attempts. Until SMTP is configured
// the code is returned to the page (test mode) because there is no way to email it.

const codeHash = (email, code) => crypto.createHmac('sha256', SECRET).update(`${email}:${code}`).digest('hex');
const normEmail = (e) => String(e || '').trim().toLowerCase();
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const userByEmail = (email) => one('SELECT * FROM users WHERE lower(email) = $1 ORDER BY active DESC, id LIMIT 1', [email]);

// What a given email can do right now.
async function accessState(email) {
  const user = await userByEmail(email);
  if (!user) return { status: 'unknown' };
  if (user.access_request === 'pending') return { status: 'pending', user };
  if (user.access_request === 'denied' && !user.active) return { status: 'denied', user };
  if (!user.active) return { status: 'unknown' };
  if (canSignIn(user)) return { status: 'allowed', user };
  return { status: 'needs_approval', user };
}

app.post('/api/auth/email/start', async (req, res) => {
  const email = normEmail(req.body?.email);
  if (!validEmail(email)) throw new HttpError(400, 'Enter a valid email address');
  const state = await accessState(email);
  if (state.status !== 'allowed') {
    return res.json({ status: state.status, name: state.user?.name || null, company: isCompanyEmail(email) });
  }

  const prev = await one('SELECT sent_at FROM login_codes WHERE email = $1', [email]);
  if (prev && Date.now() - prev.sent_at < 30_000) throw new HttpError(429, 'A code was just sent. Wait 30 seconds before asking for another.');
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  await run(`INSERT INTO login_codes (email, hash, expires, attempts, sent_at) VALUES ($1, $2, $3, 0, $4)
    ON CONFLICT (email) DO UPDATE SET hash = EXCLUDED.hash, expires = EXCLUDED.expires, attempts = 0, sent_at = EXCLUDED.sent_at`,
    [email, codeHash(email, code), Date.now() + 10 * 60_000, Date.now()]);

  if (mailEnabled) {
    const sent = await sendMail({
      to: email,
      subject: `${code} is your Studio Setup QC sign-in code`,
      text: `Hi ${state.user.name},\n\nYour sign-in code is ${code}. It expires in 10 minutes.\n\nIf you didn't try to sign in, you can ignore this email.`,
    });
    if (!sent) throw new HttpError(502, "Couldn't send the sign-in email. Please try again in a minute.");
    return res.json({ status: 'code_sent' });
  }
  console.log(`[auth] test mode, sign-in code for ${email}: ${code}`);
  res.json({ status: 'code_sent', testCode: code });
});

app.post('/api/auth/email/verify', async (req, res) => {
  const email = normEmail(req.body?.email);
  const code = String(req.body?.code || '').replace(/\D/g, '');
  const entry = await one('SELECT * FROM login_codes WHERE email = $1', [email]);
  if (!entry || entry.expires < Date.now()) {
    await run('DELETE FROM login_codes WHERE email = $1', [email]);
    throw new HttpError(400, 'That code has expired. Request a new one.');
  }
  if (entry.attempts + 1 > 5) {
    await run('DELETE FROM login_codes WHERE email = $1', [email]);
    throw new HttpError(429, 'Too many attempts. Request a new code.');
  }
  await run('UPDATE login_codes SET attempts = attempts + 1 WHERE email = $1', [email]);
  const a = Buffer.from(codeHash(email, code));
  const b = Buffer.from(entry.hash);
  if (!crypto.timingSafeEqual(a, b)) throw new HttpError(400, "That code isn't right. Check the email and try again.");
  await run('DELETE FROM login_codes WHERE email = $1', [email]);
  const state = await accessState(email);
  if (state.status !== 'allowed') throw new HttpError(403, 'This email is not allowed to sign in');
  startSession(res, state.user);
});

// ---------- Access requests ----------

const APPROVER_ROLES = ['ADMIN', 'SPL'];
const REQUESTABLE_ROLES = ['SD', 'SPC', 'SPL', 'QC', 'ADMIN'];
const STUDIO_ROLES = ['SD', 'SPC', 'SPL'];
// Admins manage everyone; SPLs manage Set Directors and Coordinators in their own studio.
const canManage = (actor, role, studio) =>
  actor.role === 'ADMIN' || (actor.role === 'SPL' && studio === actor.studio && ['SD', 'SPC'].includes(role));

async function notifyApprovers(user, role, studio) {
  const admins = (await q("SELECT id FROM users WHERE role = 'ADMIN' AND active = 1")).map((r) => r.id);
  const spls = ['SD', 'SPC'].includes(role) && studio
    ? (await q("SELECT id FROM users WHERE role = 'SPL' AND studio = $1 AND active = 1", [studio])).map((r) => r.id)
    : [];
  await notify([...admins, ...spls], {
    type: 'access_request',
    message: `${user.name} (${user.email}) is requesting access as ${role}${studio ? ` · ${studio}` : ''}`,
    detail: user.request_note ? `Note: ${user.request_note}` : null,
    link: '/team',
  });
}

app.post('/api/auth/request', async (req, res) => {
  const b = req.body || {};
  const email = normEmail(b.email);
  if (!validEmail(email)) throw new HttpError(400, 'Enter a valid email address');
  const note = String(b.note || '').trim().slice(0, 500) || null;
  const state = await accessState(email);
  if (state.status === 'allowed') return res.json({ status: 'allowed' });
  if (state.status === 'pending') return res.json({ status: 'pending' });

  if (state.user && state.status !== 'unknown') {
    // Already on the team (external email) or previously denied: re-open the request as-is.
    await run("UPDATE users SET access_request = 'pending', request_note = $1, requested_at = $2 WHERE id = $3", [note, now(), state.user.id]);
    const user = await one('SELECT * FROM users WHERE id = $1', [state.user.id]);
    await notifyApprovers(user, user.role, user.studio);
    return res.json({ status: 'pending' });
  }

  const name = String(b.name || '').trim().replace(/\s+/g, ' ');
  const role = String(b.role || '');
  let studio = String(b.studio || '').trim() || null;
  if (!name) throw new HttpError(400, 'Enter your full name');
  if (!REQUESTABLE_ROLES.includes(role)) throw new HttpError(400, 'Choose your role');
  if (STUDIO_ROLES.includes(role) && !studio) throw new HttpError(400, 'Choose your studio');
  if (!STUDIO_ROLES.includes(role)) studio = null;

  const user = await one(`INSERT INTO users (name, email, role, studio, source, active, access_request, request_note, requested_at)
    VALUES ($1, $2, $3, $4, 'request', 0, 'pending', $5, $6) RETURNING *`, [name, email, role, studio, note, now()]);
  await notifyApprovers(user, role, studio);
  res.status(201).json({ status: 'pending' });
});

app.get('/api/access-requests', requireAuth, requireRole(...APPROVER_ROLES), async (req, res) => {
  const rows = (await q("SELECT id, name, email, role, studio, title, source, active, request_note, requested_at FROM users WHERE access_request = 'pending' ORDER BY requested_at"))
    .filter((u) => canManage(req.user, u.role, u.studio))
    .map((u) => ({ ...u, company: isCompanyEmail(u.email), on_team: u.source !== 'request' }));
  res.json(rows);
});

app.post('/api/access-requests/:id/approve', requireAuth, requireRole(...APPROVER_ROLES), async (req, res) => {
  const u = await one("SELECT * FROM users WHERE id = $1 AND access_request = 'pending'", [Number(req.params.id)]);
  if (!u) throw new HttpError(404, 'Request not found');
  // Approvers can adjust the role/studio of brand-new requests before approving.
  let role = u.role;
  let studio = u.studio;
  if (u.source === 'request') {
    role = REQUESTABLE_ROLES.includes(req.body?.role) ? req.body.role : u.role;
    studio = STUDIO_ROLES.includes(role) ? String(req.body?.studio ?? u.studio ?? '').trim() || null : null;
    if (STUDIO_ROLES.includes(role) && !studio) throw new HttpError(400, 'Choose a studio');
  }
  if (!canManage(req.user, u.role, u.studio) || !canManage(req.user, role, studio)) throw new HttpError(403, 'You cannot approve this request');

  await run('UPDATE users SET role = $1, studio = $2, active = 1, login_approved = 1, access_request = NULL WHERE id = $3', [role, studio, u.id]);
  await notify([u.id], {
    type: 'access_approved',
    message: 'Your Studio Setup QC access was approved',
    detail: `${req.user.name} approved your access as ${role}${studio ? ` · ${studio}` : ''}. Sign in with ${u.email}.`,
    link: '/login',
  });
  res.json({ ok: true });
});

app.post('/api/access-requests/:id/deny', requireAuth, requireRole(...APPROVER_ROLES), async (req, res) => {
  const u = await one("SELECT * FROM users WHERE id = $1 AND access_request = 'pending'", [Number(req.params.id)]);
  if (!u) throw new HttpError(404, 'Request not found');
  if (!canManage(req.user, u.role, u.studio)) throw new HttpError(403, 'You cannot deny this request');
  await run("UPDATE users SET access_request = 'denied' WHERE id = $1", [u.id]);
  if (u.source === 'request' && u.email) {
    await sendMail({ to: u.email, subject: 'Your Studio Setup QC access request', text: `Hi ${u.name},\n\nYour access request wasn't approved. If you think this is a mistake, contact your Studio Project Lead.` });
  }
  res.json({ ok: true });
});

app.get('/api/users', requireDevLogin, async (req, res) => {
  res.json(await q('SELECT id, name, role, studio, title FROM users WHERE active = 1 ORDER BY studio, role, name'));
});

app.post('/api/session', requireDevLogin, async (req, res) => {
  const user = await one('SELECT * FROM users WHERE id = $1 AND active = 1', [Number(req.body?.userId)]);
  if (!user) throw new HttpError(400, 'Unknown user');
  startSession(res, user);
});

// Google sign-in: the browser gets an ID token from Google Identity Services; we verify it
// and match the verified email against the team list, which decides the user's role.
app.post('/api/session/google', async (req, res) => {
  if (!googleClient) throw new HttpError(404, 'Google sign-in is not configured');
  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: String(req.body?.credential || ''), audience: GOOGLE_CLIENT_ID });
    payload = ticket.getPayload();
  } catch {
    throw new HttpError(401, 'Google sign-in failed. Please try again.');
  }
  if (!payload?.email || !payload.email_verified) throw new HttpError(401, 'Your Google account email is not verified');
  const email = payload.email.toLowerCase();
  const state = await accessState(email);
  if (state.status === 'needs_approval') throw new HttpError(403, `${email} needs approval from an admin or manager before it can sign in. Use "Sign in with email" below to request access.`);
  if (state.status === 'pending') throw new HttpError(403, `The access request for ${email} is still waiting for approval.`);
  if (state.status !== 'allowed') throw new HttpError(403, `${email} isn't on the team yet. Use "Sign in with email" below to request access.`);
  startSession(res, state.user);
});

app.delete('/api/session', (req, res) => {
  res.setHeader('Set-Cookie', `sid=; ${COOKIE_ATTRS}; Max-Age=0`);
  res.json({ ok: true });
});

app.get('/api/me', requireAuth, (req, res) => res.json(req.user));

app.get('/api/meta', requireAuth, async (req, res) => {
  res.json({
    projects: Object.values(PROJECTS),
    spls: await q("SELECT id, name, studio FROM users WHERE role = 'SPL' AND active = 1 ORDER BY studio"),
    studios: (await q('SELECT DISTINCT studio FROM users WHERE studio IS NOT NULL ORDER BY studio')).map((r) => r.studio),
    statusLabels: STATUS_LABELS,
    feedbackTemplate: `${FEEDBACK_PLACEHOLDERS[0]} - ${FEEDBACK_PLACEHOLDERS[1]}`,
  });
});

// ---------- Tickets ----------

app.get('/api/tickets', requireAuth, async (req, res) => {
  const params = [];
  const rows = await q(`${TICKET_SELECT} WHERE ${visibility(req.user, params)} ORDER BY t.updated_at DESC LIMIT 1000`, params);
  res.json(rows.map(shapeTicket));
});

// Shared by the signed-in form (channel 'app') and "Submit a photo" without login (channel 'quick').
async function createTicket(submitter, b, channel) {
  const project = getProject(b.project);
  if (!project) throw new HttpError(400, 'Select a project');
  const spl = await one("SELECT id FROM users WHERE id = $1 AND role = 'SPL' AND active = 1", [Number(b.splId) || 0]);
  if (!spl) throw new HttpError(400, 'Select the assigned Studio Project Lead');
  for (const [key, label] of [['taskName', 'Task Name'], ['scene', 'Scene'], ['businessType', 'Business Type']]) {
    if (!String(b[key] || '').trim()) throw new HttpError(400, `${label} is required`);
  }
  const sub = await collectSubmission(project, b);

  const { ticketId, code } = await tx(async (c) => {
    const ts = now();
    const row = await c.one(`INSERT INTO tickets (project, sd_id, spl_id, studio, task_name, scene, business_type, boundary_size,
      setup_checklist, media_type, status, channel, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', $11, $12, $13) RETURNING id`,
      [project.id, submitter.id, spl.id, submitter.studio, String(b.taskName).trim(), String(b.scene).trim(), String(b.businessType).trim(),
        sub.boundarySize, JSON.stringify(sub.checklist), sub.mediaType, channel, ts, ts]);
    const code = `TKT-${String(row.id).padStart(4, '0')}`;
    await c.run('UPDATE tickets SET code = $1 WHERE id = $2', [code, row.id]);
    await insertMedia(c, row.id, 1, sub.media);
    await logHistory(c, row.id, submitter.id, 'submitted', null, channel);
    return { ticketId: row.id, code };
  });
  await notify(await qcUserIds(), {
    ticketId,
    type: 'submitted',
    message: `${code} submitted by ${submitter.name} (${submitter.studio}) is awaiting QC review`,
  });
  return ticketId;
}

async function resubmitTicket(t, user, body, channel) {
  if (t.status !== 'returned') throw new HttpError(409, 'Only returned tickets can be resubmitted');
  const sub = await collectSubmission(getProject(t.project), body);
  const note = String(body.note || '').trim() || null;
  const submissionNo = t.submission_no + 1;
  await tx(async (c) => {
    await c.run(`UPDATE tickets SET status = 'pending', boundary_size = $1, setup_checklist = $2, media_type = $3, qc_checks = NULL,
      submission_no = $4, decided_at = NULL, updated_at = $5 WHERE id = $6`,
      [sub.boundarySize, JSON.stringify(sub.checklist), sub.mediaType, submissionNo, now(), t.id]);
    await insertMedia(c, t.id, submissionNo, sub.media);
    await logHistory(c, t.id, user.id, 'resubmitted', note, channel);
  });
  await notify(t.reviewer_id ? [t.reviewer_id] : await qcUserIds(), {
    ticketId: t.id,
    type: 'resubmitted',
    message: `${t.code} was resubmitted by ${user.name} (round ${submissionNo})`,
    detail: note,
  });
}

app.post('/api/tickets', requireAuth, requireRole('SD'), async (req, res) => {
  res.status(201).json({ id: await createTicket(req.user, req.body || {}, 'app') });
});

app.get('/api/tickets/:id', requireAuth, async (req, res) => {
  const t = await loadTicket(req.user, req.params.id);
  const media = await q('SELECT id, submission_no, slot, label, mime, size, duration, original_name, storage_key, created_at FROM media WHERE ticket_id = $1 ORDER BY submission_no DESC, id', [t.id]);
  res.json({
    ticket: shapeTicket(t),
    project: getProject(t.project),
    media: media.map(({ storage_key, ...m }) => ({ ...m, url: mediaUrl(storage_key) })),
    history: await historyFor(t.id),
  });
});

// QC opens the ticket: Pending -> Reviewing.
app.post('/api/tickets/:id/start-review', requireAuth, requireRole('QC'), async (req, res) => {
  const t = await loadTicket(req.user, req.params.id);
  if (t.status === 'pending') {
    await tx(async (c) => {
      await c.run("UPDATE tickets SET status = 'reviewing', reviewer_id = $1, updated_at = $2 WHERE id = $3", [req.user.id, now(), t.id]);
      await logHistory(c, t.id, req.user.id, 'review_started');
    });
  }
  res.json({ ok: true });
});

function parseQcChecks(project, raw) {
  const checks = {};
  for (const c of project.qcChecks) checks[c.id] = raw?.[c.id] === true;
  return checks;
}

app.post('/api/tickets/:id/approve', requireAuth, requireRole('QC', 'ADMIN'), async (req, res) => {
  const t = await loadTicket(req.user, req.params.id);
  if (!['pending', 'reviewing'].includes(t.status)) throw new HttpError(409, 'Only tickets awaiting review can be approved');
  const project = getProject(t.project);
  const checks = parseQcChecks(project, req.body?.qcChecks);
  const failed = project.qcChecks.filter((c) => !checks[c.id]);
  if (failed.length) throw new HttpError(400, `All QC checks must pass to approve. Unchecked: ${failed.map((f) => f.label).join(', ')}`);

  await tx(async (c) => {
    const ts = now();
    await c.run("UPDATE tickets SET status = 'approved', reviewer_id = $1, qc_checks = $2, decided_at = $3, updated_at = $3 WHERE id = $4",
      [req.user.id, JSON.stringify(checks), ts, t.id]);
    await logHistory(c, t.id, req.user.id, 'approved');
  });
  await notify([t.sd_id], {
    ticketId: t.id,
    type: 'approved',
    message: `${t.code} approved by ${req.user.name}: filming can begin`,
    detail: `Your setup for "${t.task_name}" (${t.scene}) passed QC. You have the green light to start the recording session.`,
  });
  res.json({ ok: true });
});

app.post('/api/tickets/:id/return', requireAuth, requireRole('QC', 'ADMIN'), async (req, res) => {
  const t = await loadTicket(req.user, req.params.id);
  if (!['pending', 'reviewing'].includes(t.status)) throw new HttpError(409, 'Only tickets awaiting review can be returned');
  const project = getProject(t.project);
  const checks = parseQcChecks(project, req.body?.qcChecks);
  const comment = String(req.body?.comment || '').trim();
  if (comment.length < 10) throw new HttpError(400, 'Feedback is required: describe the problem and the required correction');
  if (FEEDBACK_PLACEHOLDERS.some((p) => comment.includes(p)))
    throw new HttpError(400, 'Replace the [bracketed] placeholders with the actual problem and correction');

  await tx(async (c) => {
    const ts = now();
    await c.run("UPDATE tickets SET status = 'returned', reviewer_id = $1, qc_checks = $2, decided_at = $3, updated_at = $3 WHERE id = $4",
      [req.user.id, JSON.stringify(checks), ts, t.id]);
    await logHistory(c, t.id, req.user.id, 'returned', comment);
  });
  await notify([t.sd_id], {
    ticketId: t.id,
    type: 'returned',
    message: `${t.code} returned by ${req.user.name}: fixes needed before filming`,
    detail: comment,
  });
  await notify([t.spl_id], {
    ticketId: t.id,
    type: 'returned_spl',
    message: `${t.code} (${t.sd_name}) was returned by QC and needs corrections`,
    detail: comment,
  });
  res.json({ ok: true });
});

app.post('/api/tickets/:id/resubmit', requireAuth, requireRole('SD'), async (req, res) => {
  const t = await loadTicket(req.user, req.params.id);
  if (t.sd_id !== req.user.id) throw new HttpError(403, 'Only the submitting Set Director can resubmit');
  await resubmitTicket(t, req.user, req.body || {}, 'app');
  res.json({ ok: true });
});

// ---------- "Submit a photo" (no login) ----------
// The submitter picks their own name; every submission and resubmission records who it was,
// and the submission log shows QC's feedback on returned tickets. Media is not exposed here.

const SUBMITTER_SQL = "SELECT * FROM users WHERE id = $1 AND active = 1 AND role IN ('SD', 'SPC', 'SPL') AND studio IS NOT NULL";

app.get('/api/public/options', async (req, res) => {
  res.json({
    projects: Object.values(PROJECTS),
    submitters: await q("SELECT id, name, role, studio FROM users WHERE active = 1 AND role IN ('SD', 'SPC', 'SPL') AND studio IS NOT NULL ORDER BY studio, name"),
    spls: await q("SELECT id, name, studio FROM users WHERE role = 'SPL' AND active = 1 ORDER BY studio"),
  });
});

app.get('/api/public/submissions', async (req, res) => {
  const project = getProject(req.query.project);
  if (!project) throw new HttpError(400, 'Unknown project');
  const rows = await q(`${TICKET_SELECT} WHERE t.project = $1 ORDER BY t.updated_at DESC LIMIT 100`, [project.id]);
  const returns = await q(`SELECT DISTINCT ON (h.ticket_id) h.ticket_id, h.comment, h.created_at, u.name AS user_name
    FROM history h LEFT JOIN users u ON u.id = h.user_id
    WHERE h.action = 'returned' AND h.ticket_id = ANY($1) ORDER BY h.ticket_id, h.id DESC`, [rows.map((t) => t.id)]);
  const lastReturn = Object.fromEntries(returns.map((r) => [r.ticket_id, { comment: r.comment, created_at: r.created_at, user_name: r.user_name }]));
  res.json(rows.map((t) => ({ ...shapeTicket(t), last_return: lastReturn[t.id] || null })));
});

app.get('/api/public/submissions/:id', async (req, res) => {
  const t = await one(`${TICKET_SELECT} WHERE t.id = $1`, [Number(req.params.id) || 0]);
  if (!t) throw new HttpError(404, 'Submission not found');
  res.json({ ticket: shapeTicket(t), project: getProject(t.project), history: await historyFor(t.id) });
});

app.post('/api/public/submissions', async (req, res) => {
  const submitter = await one(SUBMITTER_SQL, [Number(req.body?.submitterId) || 0]);
  if (!submitter) throw new HttpError(400, 'Choose who is submitting');
  res.status(201).json({ id: await createTicket(submitter, req.body, 'quick') });
});

app.post('/api/public/submissions/:id/resubmit', async (req, res) => {
  const t = await one(`${TICKET_SELECT} WHERE t.id = $1`, [Number(req.params.id) || 0]);
  if (!t) throw new HttpError(404, 'Submission not found');
  const submitter = await one(SUBMITTER_SQL, [Number(req.body?.submitterId) || 0]);
  if (!submitter) throw new HttpError(400, 'Choose who is resubmitting');
  if (submitter.studio !== t.studio) throw new HttpError(403, `Only ${t.studio} team members can resubmit this ticket`);
  await resubmitTicket(t, submitter, req.body, 'quick');
  res.json({ ok: true });
});

// ---------- Team management ----------
// Admins can add anyone; SPLs can add Set Directors and Coordinators to their own studio.
// People added here are kept when the roster syncs.

const ADDABLE_ROLES = { ADMIN: ['SD', 'SPC', 'SPL', 'QC', 'ADMIN'], SPL: ['SD', 'SPC'] };

app.get('/api/team', requireAuth, requireRole('ADMIN', 'SPL'), async (req, res) => {
  const scoped = req.user.role === 'SPL';
  // Brand-new access requests that aren't approved yet live in the requests list, not here.
  const users = (await q(`SELECT id, name, email, role, studio, title, source, active, login_approved, access_request FROM users
      WHERE NOT (source = 'request' AND active = 0) ${scoped ? 'AND studio = $1' : ''}
      ORDER BY active DESC, studio IS NULL, studio, role, name`, scoped ? [req.user.studio] : []))
    .map((u) => ({ ...u, company: isCompanyEmail(u.email), can_sign_in: canSignIn(u), can_manage: canManage(req.user, u.role, u.studio) }));
  res.json({ users, addableRoles: ADDABLE_ROLES[req.user.role], companyDomains: COMPANY_DOMAINS });
});

app.post('/api/team', requireAuth, requireRole('ADMIN', 'SPL'), async (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim().replace(/\s+/g, ' ');
  const email = String(b.email || '').trim().toLowerCase() || null;
  const role = String(b.role || '');
  const title = String(b.title || '').trim() || null;
  let studio = String(b.studio || '').trim() || null;

  if (!name) throw new HttpError(400, 'Name is required');
  if (!ADDABLE_ROLES[req.user.role].includes(role)) throw new HttpError(403, 'You cannot add someone with that role');
  if (email && !validEmail(email)) throw new HttpError(400, 'Enter a valid email address');
  if (req.user.role === 'SPL') studio = req.user.studio;
  if (STUDIO_ROLES.includes(role) && !studio) throw new HttpError(400, 'Choose a studio');
  if (!STUDIO_ROLES.includes(role)) studio = null;
  if (email && (await one('SELECT 1 FROM users WHERE lower(email) = $1', [email]))) throw new HttpError(409, 'Someone with that email is already on the team');
  if (await one('SELECT 1 FROM users WHERE name = $1 AND active = 1', [name])) throw new HttpError(409, 'Someone with that name is already on the team');

  const user = await one(`INSERT INTO users (name, email, role, studio, title, source, login_approved)
    VALUES ($1, $2, $3, $4, $5, 'manual', 1) RETURNING id, name, email, role, studio, title, source, active`, [name, email, role, studio, title]);
  res.status(201).json(user);
});

// Roster import (admins): same format as config/team.js, sent as JSON.
app.post('/api/team/import', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const b = req.body || {};
  const roster = { STUDIOS: b.STUDIOS, QC_TEAM: b.QC_TEAM, ADMIN_TEAM: b.ADMIN_TEAM };
  if (![roster.STUDIOS, roster.QC_TEAM, roster.ADMIN_TEAM].some((x) => Array.isArray(x) && x.length)) {
    throw new HttpError(400, 'That file has no STUDIOS, QC_TEAM or ADMIN_TEAM entries');
  }
  for (const k of Object.keys(roster)) if (!Array.isArray(roster[k])) roster[k] = [];
  const result = await syncRoster(roster, { deactivateMissing: b.deactivateMissing === true });
  res.json(result);
});

app.patch('/api/team/:id', requireAuth, requireRole('ADMIN', 'SPL'), async (req, res) => {
  const target = await one('SELECT * FROM users WHERE id = $1', [Number(req.params.id) || 0]);
  if (!target) throw new HttpError(404, 'User not found');
  if (target.id === req.user.id) throw new HttpError(409, "You can't change your own access");
  if (!canManage(req.user, target.role, target.studio)) {
    throw new HttpError(403, 'You can only manage your own studio’s Set Directors and Coordinators');
  }
  // Sign-in approval for external emails (works for roster and added people alike).
  if ('loginApproved' in (req.body || {})) {
    await run('UPDATE users SET login_approved = $1, access_request = NULL WHERE id = $2', [req.body.loginApproved ? 1 : 0, target.id]);
    return res.json({ ok: true });
  }
  if (target.source === 'roster') throw new HttpError(409, 'People from the roster are managed by re-importing the roster');
  await run('UPDATE users SET active = $1 WHERE id = $2', [req.body?.active ? 1 : 0, target.id]);
  res.json({ ok: true });
});

// ---------- Metrics (SPL oversight) ----------

app.get('/api/stats', requireAuth, requireRole('SPL', 'SPC', 'QC', 'ADMIN'), async (req, res) => {
  const params = [];
  const tickets = await q(`SELECT t.id, t.status, t.studio, t.submission_no FROM tickets t WHERE ${visibility(req.user, params)}`, params);
  const history = await q(`SELECT ticket_id, action, created_at FROM history
    WHERE action IN ('submitted','resubmitted','approved','returned') AND ticket_id = ANY($1) ORDER BY id`, [tickets.map((t) => t.id)]);

  const lastSubmit = {};
  let decisions = 0, totalMs = 0, approvals = 0, returns = 0;
  for (const h of history) {
    if (h.action === 'submitted' || h.action === 'resubmitted') {
      lastSubmit[h.ticket_id] = h.created_at;
      continue;
    }
    if (h.action === 'approved') approvals++;
    else returns++;
    if (lastSubmit[h.ticket_id]) {
      totalMs += Date.parse(h.created_at) - Date.parse(lastSubmit[h.ticket_id]);
      decisions++;
      delete lastSubmit[h.ticket_id];
    }
  }

  const counts = { pending: 0, reviewing: 0, approved: 0, returned: 0 };
  for (const t of tickets) counts[t.status]++;
  const approved = tickets.filter((t) => t.status === 'approved');
  res.json({
    total: tickets.length,
    counts,
    approvals,
    returns,
    firstPassRate: approved.length ? approved.filter((t) => t.submission_no === 1).length / approved.length : null,
    avgDecisionMinutes: decisions ? totalMs / decisions / 60000 : null,
  });
});

// ---------- Notifications ----------

app.get('/api/notifications', requireAuth, async (req, res) => {
  res.json({
    items: await q('SELECT * FROM notifications WHERE user_id = $1 ORDER BY id DESC LIMIT 50', [req.user.id]),
    unread: (await one('SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL', [req.user.id])).n,
  });
});

app.post('/api/notifications/read', requireAuth, async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isInteger) : null;
  if (ids?.length) {
    await run('UPDATE notifications SET read_at = $1 WHERE user_id = $2 AND read_at IS NULL AND id = ANY($3)', [now(), req.user.id, ids]);
  } else if (!ids) {
    await run('UPDATE notifications SET read_at = $1 WHERE user_id = $2 AND read_at IS NULL', [now(), req.user.id]);
  }
  res.json({ ok: true });
});

// ---------- Media (local only; on Netlify the media edge function serves /media/*) ----------

app.get('/media/:key', async (req, res) => {
  const { key } = req.params;
  if (!validMediaSignature(key, req.query.e, req.query.s)) throw new HttpError(403, 'This media link has expired. Reload the page.');
  const meta = await storage.getMeta(key);
  if (!meta) throw new HttpError(404, 'Not found');

  let start = 0;
  let end = meta.size - 1;
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (range) {
    if (range[1] === '') start = Math.max(0, meta.size - Number(range[2]));
    else {
      start = Number(range[1]);
      if (range[2] !== '') end = Math.min(end, Number(range[2]));
    }
    if (start > end || start >= meta.size) {
      res.status(416).setHeader('Content-Range', `bytes */${meta.size}`);
      return res.end();
    }
    res.status(206).setHeader('Content-Range', `bytes ${start}-${end}/${meta.size}`);
  }
  res.setHeader('Content-Type', meta.mime);
  res.setHeader('Content-Length', end - start + 1);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  for (let n = Math.floor(start / meta.chunkSize); n <= Math.floor(end / meta.chunkSize); n++) {
    const chunk = await storage.getChunk(key, n);
    const base = n * meta.chunkSize;
    res.write(chunk.subarray(Math.max(0, start - base), Math.min(chunk.length, end - base + 1)));
  }
  res.end();
});

// ---------- Errors ----------

app.use('/api', (req, res, next) => next(new HttpError(404, 'Not found')));

app.use((err, req, res, next) => {
  let status = err.status || err.statusCode || 500;
  let message = err.message;
  if (err.type === 'entity.too.large') {
    status = 413;
    message = 'That upload part is too large';
  }
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong' : message, ...(err.code === 'site_password' ? { code: err.code } : {}) });
});

module.exports = { app, COMPANY_DOMAINS, DEV_LOGIN };
