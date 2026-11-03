'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const { OAuth2Client } = require('google-auth-library');
const { db, now, tx, DATA_DIR } = require('./src/db');
const { PROJECTS, getProject } = require('./src/projects');
const { notify, sendMail, verifyMail, mailEnabled, appLink } = require('./src/notify');

const PORT = Number(process.env.PORT || 3000);
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
// The no-password name picker is for local development only, enabled with DEV_LOGIN=1.
const DEV_LOGIN = process.env.DEV_LOGIN === '1';
// Emails on these domains sign in without approval; any other email needs an admin/manager to approve it.
const COMPANY_DOMAINS = (process.env.ALLOWED_DOMAINS || 'atlascapture.io').split(',').map((d) => d.trim().toLowerCase()).filter(Boolean);
const isCompanyEmail = (email) => COMPANY_DOMAINS.includes(String(email || '').split('@')[1]?.toLowerCase());
const canSignIn = (user) => Boolean(user?.active && user.email && (isCompanyEmail(user.email) || user.login_approved));
const SECURE_COOKIE = /^https:/i.test(process.env.APP_URL || '');
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const STATUS_LABELS = {
  pending: 'Pending QC Review',
  reviewing: 'Reviewing',
  approved: 'Approved',
  returned: 'Returned / Needs Fixes',
};
const FEEDBACK_PLACEHOLDERS = ['[Problem / Issue Description]', '[Clear Correction or Required Action]'];

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ---------- Sessions (signed cookie holding the user id) ----------

const secretFile = path.join(DATA_DIR, '.secret');
let SECRET = process.env.SESSION_SECRET;
if (!SECRET) {
  if (fs.existsSync(secretFile)) SECRET = fs.readFileSync(secretFile, 'utf8');
  else fs.writeFileSync(secretFile, (SECRET = crypto.randomBytes(32).toString('hex')));
}

const sign = (v) => `${v}.${crypto.createHmac('sha256', SECRET).update(String(v)).digest('base64url')}`;
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

// ---------- App ----------

const app = express();

// Health check for the host (registered before the site password so it always answers).
app.get('/healthz', (req, res) => res.type('text').send('ok'));

// Optional shared password in front of the whole site, for test deployments shared by link.
// Enabled by setting SITE_PASSWORD. Uses a plain form + signed cookie rather than HTTP Basic auth,
// because in-app browsers (Slack, WeChat, Messenger) never show the Basic auth dialog.
if (process.env.SITE_PASSWORD) {
  const digest = (s) => crypto.createHash('sha256').update(String(s)).digest();
  const expected = digest(process.env.SITE_PASSWORD);
  // Tied to the password, so changing SITE_PASSWORD signs everyone out of the gate.
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

  app.post('/site-login', express.urlencoded({ extended: false }), (req, res) => {
    if (crypto.timingSafeEqual(digest(req.body?.password ?? ''), expected)) {
      res.setHeader('Set-Cookie', `site=${encodeURIComponent(sign(gateValue))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}${req.secure || req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''}`);
      return res.redirect(303, '/');
    }
    setTimeout(() => res.status(401).type('html').send(gatePage(true)), 800); // slow down guessing
  });

  app.use((req, res, next) => {
    if (unsign(parseCookies(req.headers.cookie).site) === gateValue) return next();
    if (req.path.startsWith('/api/') || req.path.startsWith('/media/')) return res.status(401).json({ error: 'Access password required' });
    res.status(401).type('html').send(gatePage(false));
  });
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
  const uid = unsign(parseCookies(req.headers.cookie).sid);
  const user = uid && db.prepare('SELECT * FROM users WHERE id = ? AND active = 1').get(Number(uid));
  // Revoking someone's sign-in approval (or deactivating them) ends their session immediately.
  if (user && (DEV_LOGIN || canSignIn(user))) req.user = user;
  next();
});

const requireAuth = (req, res, next) => (req.user ? next() : next(new HttpError(401, 'Not signed in')));
const requireRole =
  (...roles) =>
  (req, res, next) =>
    roles.includes(req.user.role) ? next() : next(new HttpError(403, 'Your role cannot perform this action'));

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, crypto.randomUUID() + path.extname(file.originalname).toLowerCase()),
  }),
  limits: { fileSize: 1024 * 1024 * 1024, files: 10 },
  fileFilter: (req, file, cb) => cb(null, /^(image|video)\//.test(file.mimetype)),
});

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
function visibility(user) {
  if (user.role === 'SD') return { clause: 't.sd_id = ?', params: [user.id] };
  if (user.role === 'SPL' || user.role === 'SPC') return { clause: '(t.studio = ? OR t.spl_id = ?)', params: [user.studio, user.id] };
  return { clause: '1 = 1', params: [] };
}

function loadTicket(user, id) {
  const t = db.prepare(`${TICKET_SELECT} WHERE t.id = ?`).get(Number(id));
  if (!t) throw new HttpError(404, 'Ticket not found');
  const v = visibility(user);
  const visible = db.prepare(`SELECT 1 FROM tickets t WHERE t.id = ? AND ${v.clause}`).get(t.id, ...v.params);
  if (!visible) throw new HttpError(404, 'Ticket not found');
  return t;
}

const logHistory = (ticketId, userId, action, comment = null, via = 'app') =>
  db.prepare('INSERT INTO history (ticket_id, user_id, action, comment, via, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    ticketId,
    userId,
    action,
    comment,
    via,
    now()
  );

const qcUserIds = () => db.prepare("SELECT id FROM users WHERE role = 'QC' AND active = 1").all().map((r) => r.id);

function removeFiles(files) {
  for (const f of files || []) fs.rm(f.path, { force: true }, () => {});
}

// Validates the setup checklist + media part of a submission (shared by submit and resubmit).
function collectSubmission(project, body, files) {
  let checklist;
  try {
    checklist = JSON.parse(body.checklist || '{}');
  } catch {
    throw new HttpError(400, 'Invalid checklist data');
  }
  const missing = project.setupChecklist.filter((c) => checklist[c.id] !== true);
  if (missing.length) throw new HttpError(400, `Confirm every setup checklist item. Missing: ${missing.map((m) => m.label).join('; ')}`);

  const boundarySize = Number(body.boundarySize);
  const { min, max } = project.boundary;
  if (!(boundarySize >= min && boundarySize <= max)) throw new HttpError(400, `Boundary box must be between ${min}m and ${max}m`);

  const byField = Object.fromEntries((files || []).map((f) => [f.fieldname, f]));
  const mediaType = body.mediaType === 'video' ? 'video' : 'images';
  const media = [];
  if (mediaType === 'video') {
    const f = byField.video;
    if (!f || !f.mimetype.startsWith('video/')) throw new HttpError(400, 'Upload a setup video clip');
    const duration = Number(body.videoDuration);
    const { minSec, maxSec } = project.video;
    if (!(duration >= minSec - 0.5 && duration <= maxSec + 0.5))
      throw new HttpError(400, `Video must be ${minSec}–${maxSec} seconds long`);
    media.push({ slot: 'video', label: 'Setup video', file: f, duration });
  } else {
    for (const s of project.mediaSlots) {
      const f = byField[s.key];
      if (!f || !f.mimetype.startsWith('image/')) throw new HttpError(400, `Missing preview image for ${s.label}`);
      media.push({ slot: s.key, label: s.label, file: f });
    }
  }

  const cleanChecklist = Object.fromEntries(project.setupChecklist.map((c) => [c.id, true]));
  const used = new Set(media.map((m) => m.file));
  return { checklist: cleanChecklist, boundarySize, mediaType, media, unused: (files || []).filter((f) => !used.has(f)) };
}

function insertMedia(ticketId, submissionNo, media) {
  const stmt = db.prepare(`INSERT INTO media (ticket_id, submission_no, slot, label, filename, original_name, mime, size, duration, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const m of media) {
    stmt.run(ticketId, submissionNo, m.slot, m.label, m.file.filename, m.file.originalname, m.file.mimetype, m.file.size, m.duration ?? null, now());
  }
}

// ---------- Session routes ----------

const COOKIE_ATTRS = `Path=/; HttpOnly; SameSite=Lax${SECURE_COOKIE ? '; Secure' : ''}`;
function startSession(res, user) {
  res.setHeader('Set-Cookie', `sid=${encodeURIComponent(sign(user.id))}; ${COOKIE_ATTRS}; Max-Age=${60 * 60 * 24 * 30}`);
  res.json(user);
}
const requireDevLogin = (req, res, next) => (DEV_LOGIN ? next() : next(new HttpError(404, 'Not found')));

app.get('/api/auth-config', (req, res) =>
  res.json({ googleClientId: GOOGLE_CLIENT_ID || null, devLogin: DEV_LOGIN, companyDomains: COMPANY_DOMAINS, emailEnabled: mailEnabled }));

// ---------- Email sign-in (one-time code) ----------
// 1. POST /api/auth/email/start {email}: tells the client what to do next (code sent, needs approval,
//    request access...). 2. POST /api/auth/email/verify {email, code}: starts the session.
// Codes live in memory, expire after 10 minutes and allow 5 attempts. Until SMTP is configured
// the code is returned to the page (test mode) because there is no way to email it.

const loginCodes = new Map(); // email -> { hash, expires, attempts, sentAt }
const codeHash = (email, code) => crypto.createHmac('sha256', SECRET).update(`${email}:${code}`).digest('hex');
const normEmail = (e) => String(e || '').trim().toLowerCase();
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const userByEmail = (email) => db.prepare('SELECT * FROM users WHERE lower(email) = ? ORDER BY active DESC, id LIMIT 1').get(email);

// What a given email can do right now.
function accessState(email) {
  const user = userByEmail(email);
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
  const state = accessState(email);
  if (state.status !== 'allowed') {
    return res.json({ status: state.status, name: state.user?.name || null, company: isCompanyEmail(email) });
  }

  const prev = loginCodes.get(email);
  if (prev && Date.now() - prev.sentAt < 30_000) throw new HttpError(429, 'A code was just sent. Wait 30 seconds before asking for another.');
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  loginCodes.set(email, { hash: codeHash(email, code), expires: Date.now() + 10 * 60_000, attempts: 0, sentAt: Date.now() });

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

app.post('/api/auth/email/verify', (req, res) => {
  const email = normEmail(req.body?.email);
  const code = String(req.body?.code || '').replace(/\D/g, '');
  const entry = loginCodes.get(email);
  if (!entry || entry.expires < Date.now()) {
    loginCodes.delete(email);
    throw new HttpError(400, 'That code has expired. Request a new one.');
  }
  if (++entry.attempts > 5) {
    loginCodes.delete(email);
    throw new HttpError(429, 'Too many attempts. Request a new code.');
  }
  const a = Buffer.from(codeHash(email, code));
  const b = Buffer.from(entry.hash);
  if (!crypto.timingSafeEqual(a, b)) throw new HttpError(400, "That code isn't right. Check the email and try again.");
  loginCodes.delete(email);
  const state = accessState(email);
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

function notifyApprovers(user, role, studio) {
  const admins = db.prepare("SELECT id FROM users WHERE role = 'ADMIN' AND active = 1").all().map((r) => r.id);
  const spls = ['SD', 'SPC'].includes(role) && studio
    ? db.prepare("SELECT id FROM users WHERE role = 'SPL' AND studio = ? AND active = 1").all(studio).map((r) => r.id)
    : [];
  notify([...admins, ...spls], {
    type: 'access_request',
    message: `${user.name} (${user.email}) is requesting access as ${role}${studio ? ` · ${studio}` : ''}`,
    detail: user.request_note ? `Note: ${user.request_note}` : null,
    link: '/team',
  });
}

app.post('/api/auth/request', (req, res) => {
  const b = req.body || {};
  const email = normEmail(b.email);
  if (!validEmail(email)) throw new HttpError(400, 'Enter a valid email address');
  const note = String(b.note || '').trim().slice(0, 500) || null;
  const state = accessState(email);
  if (state.status === 'allowed') return res.json({ status: 'allowed' });
  if (state.status === 'pending') return res.json({ status: 'pending' });

  if (state.user && state.status !== 'unknown') {
    // Already on the team (external email) or previously denied: re-open the request as-is.
    db.prepare("UPDATE users SET access_request = 'pending', request_note = ?, requested_at = ? WHERE id = ?").run(note, now(), state.user.id);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(state.user.id);
    notifyApprovers(user, user.role, user.studio);
    return res.json({ status: 'pending' });
  }

  const name = String(b.name || '').trim().replace(/\s+/g, ' ');
  const role = String(b.role || '');
  let studio = String(b.studio || '').trim() || null;
  if (!name) throw new HttpError(400, 'Enter your full name');
  if (!REQUESTABLE_ROLES.includes(role)) throw new HttpError(400, 'Choose your role');
  if (STUDIO_ROLES.includes(role) && !studio) throw new HttpError(400, 'Choose your studio');
  if (!STUDIO_ROLES.includes(role)) studio = null;

  const { lastInsertRowid } = db
    .prepare(`INSERT INTO users (name, email, role, studio, source, active, access_request, request_note, requested_at)
      VALUES (?, ?, ?, ?, 'request', 0, 'pending', ?, ?)`)
    .run(name, email, role, studio, note, now());
  notifyApprovers(db.prepare('SELECT * FROM users WHERE id = ?').get(Number(lastInsertRowid)), role, studio);
  res.status(201).json({ status: 'pending' });
});

app.get('/api/access-requests', requireAuth, requireRole(...APPROVER_ROLES), (req, res) => {
  const rows = db
    .prepare("SELECT id, name, email, role, studio, title, source, active, request_note, requested_at FROM users WHERE access_request = 'pending' ORDER BY requested_at")
    .all()
    .filter((u) => canManage(req.user, u.role, u.studio))
    .map((u) => ({ ...u, company: isCompanyEmail(u.email), on_team: u.source !== 'request' }));
  res.json(rows);
});

app.post('/api/access-requests/:id/approve', requireAuth, requireRole(...APPROVER_ROLES), (req, res) => {
  const u = db.prepare("SELECT * FROM users WHERE id = ? AND access_request = 'pending'").get(Number(req.params.id));
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

  db.prepare("UPDATE users SET role = ?, studio = ?, active = 1, login_approved = 1, access_request = NULL WHERE id = ?").run(role, studio, u.id);
  notify([u.id], {
    type: 'access_approved',
    message: 'Your Studio Setup QC access was approved',
    detail: `${req.user.name} approved your access as ${role}${studio ? ` · ${studio}` : ''}. Sign in with ${u.email}.`,
    link: '/login',
  });
  res.json({ ok: true });
});

app.post('/api/access-requests/:id/deny', requireAuth, requireRole(...APPROVER_ROLES), (req, res) => {
  const u = db.prepare("SELECT * FROM users WHERE id = ? AND access_request = 'pending'").get(Number(req.params.id));
  if (!u) throw new HttpError(404, 'Request not found');
  if (!canManage(req.user, u.role, u.studio)) throw new HttpError(403, 'You cannot deny this request');
  db.prepare("UPDATE users SET access_request = 'denied' WHERE id = ?").run(u.id);
  if (u.source === 'request' && u.email) {
    sendMail({ to: u.email, subject: 'Your Studio Setup QC access request', text: `Hi ${u.name},\n\nYour access request wasn't approved. If you think this is a mistake, contact your Studio Project Lead.` });
  }
  res.json({ ok: true });
});

app.get('/api/users', requireDevLogin, (req, res) => {
  res.json(db.prepare('SELECT id, name, role, studio, title FROM users WHERE active = 1 ORDER BY studio, role, name').all());
});

app.post('/api/session', requireDevLogin, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ? AND active = 1').get(Number(req.body?.userId));
  if (!user) throw new HttpError(400, 'Unknown user');
  startSession(res, user);
});

// Google sign-in: the browser gets an ID token from Google Identity Services; we verify it
// and match the verified email against the roster, which decides the user's role.
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
  const state = accessState(email);
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

app.get('/api/meta', requireAuth, (req, res) => {
  res.json({
    projects: Object.values(PROJECTS),
    spls: db.prepare("SELECT id, name, studio FROM users WHERE role = 'SPL' AND active = 1 ORDER BY studio").all(),
    studios: db.prepare('SELECT DISTINCT studio FROM users WHERE studio IS NOT NULL ORDER BY studio').all().map((r) => r.studio),
    statusLabels: STATUS_LABELS,
    feedbackTemplate: `${FEEDBACK_PLACEHOLDERS[0]} - ${FEEDBACK_PLACEHOLDERS[1]}`,
  });
});

// ---------- Tickets ----------

app.get('/api/tickets', requireAuth, (req, res) => {
  const v = visibility(req.user);
  const rows = db.prepare(`${TICKET_SELECT} WHERE ${v.clause} ORDER BY t.updated_at DESC LIMIT 1000`).all(...v.params);
  res.json(rows.map(shapeTicket));
});

// Shared by the signed-in form (channel 'app') and "Submit a photo" without login (channel 'quick').
function createTicket(submitter, b, files, channel) {
  try {
    const project = getProject(b.project);
    if (!project) throw new HttpError(400, 'Select a project');
    const spl = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'SPL' AND active = 1").get(Number(b.splId));
    if (!spl) throw new HttpError(400, 'Select the assigned Studio Project Lead');
    for (const [key, label] of [['taskName', 'Task Name'], ['scene', 'Scene'], ['businessType', 'Business Type']]) {
      if (!String(b[key] || '').trim()) throw new HttpError(400, `${label} is required`);
    }
    const sub = collectSubmission(project, b, files);
    removeFiles(sub.unused);

    return tx(() => {
      const ts = now();
      const { lastInsertRowid } = db
        .prepare(`INSERT INTO tickets (project, sd_id, spl_id, studio, task_name, scene, business_type, boundary_size,
          setup_checklist, media_type, status, channel, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`)
        .run(project.id, submitter.id, spl.id, submitter.studio, b.taskName.trim(), b.scene.trim(), b.businessType.trim(),
          sub.boundarySize, JSON.stringify(sub.checklist), sub.mediaType, channel, ts, ts);
      const ticketId = Number(lastInsertRowid);
      const code = `TKT-${String(ticketId).padStart(4, '0')}`;
      db.prepare('UPDATE tickets SET code = ? WHERE id = ?').run(code, ticketId);
      insertMedia(ticketId, 1, sub.media);
      logHistory(ticketId, submitter.id, 'submitted', null, channel);
      notify(qcUserIds(), {
        ticketId,
        type: 'submitted',
        message: `${code} submitted by ${submitter.name} (${submitter.studio}) is awaiting QC review`,
      });
      return ticketId;
    });
  } catch (err) {
    removeFiles(files);
    throw err;
  }
}

function resubmitTicket(t, user, body, files, channel) {
  try {
    if (t.status !== 'returned') throw new HttpError(409, 'Only returned tickets can be resubmitted');
    const sub = collectSubmission(getProject(t.project), body, files);
    removeFiles(sub.unused);
    const note = String(body.note || '').trim() || null;

    tx(() => {
      const submissionNo = t.submission_no + 1;
      db.prepare(`UPDATE tickets SET status = 'pending', boundary_size = ?, setup_checklist = ?, media_type = ?, qc_checks = NULL,
        submission_no = ?, decided_at = NULL, updated_at = ? WHERE id = ?`)
        .run(sub.boundarySize, JSON.stringify(sub.checklist), sub.mediaType, submissionNo, now(), t.id);
      insertMedia(t.id, submissionNo, sub.media);
      logHistory(t.id, user.id, 'resubmitted', note, channel);
      notify(t.reviewer_id ? [t.reviewer_id] : qcUserIds(), {
        ticketId: t.id,
        type: 'resubmitted',
        message: `${t.code} was resubmitted by ${user.name} (round ${submissionNo})`,
        detail: note,
      });
    });
  } catch (err) {
    removeFiles(files);
    throw err;
  }
}

app.post('/api/tickets', requireAuth, requireRole('SD'), upload.any(), (req, res) => {
  res.status(201).json({ id: createTicket(req.user, req.body, req.files, 'app') });
});

app.get('/api/tickets/:id', requireAuth, (req, res) => {
  const t = loadTicket(req.user, req.params.id);
  res.json({
    ticket: shapeTicket(t),
    project: getProject(t.project),
    media: db.prepare('SELECT id, submission_no, slot, label, mime, size, duration, original_name, created_at FROM media WHERE ticket_id = ? ORDER BY submission_no DESC, id').all(t.id),
    history: db
      .prepare(`SELECT h.*, u.name AS user_name, u.role AS user_role FROM history h LEFT JOIN users u ON u.id = h.user_id
        WHERE h.ticket_id = ? ORDER BY h.id DESC`)
      .all(t.id),
  });
});

// QC opens the ticket: Pending -> Reviewing.
app.post('/api/tickets/:id/start-review', requireAuth, requireRole('QC'), (req, res) => {
  const t = loadTicket(req.user, req.params.id);
  if (t.status === 'pending') {
    tx(() => {
      db.prepare("UPDATE tickets SET status = 'reviewing', reviewer_id = ?, updated_at = ? WHERE id = ?").run(req.user.id, now(), t.id);
      logHistory(t.id, req.user.id, 'review_started');
    });
  }
  res.json({ ok: true });
});

function parseQcChecks(project, raw) {
  const checks = {};
  for (const c of project.qcChecks) checks[c.id] = raw?.[c.id] === true;
  return checks;
}

app.post('/api/tickets/:id/approve', requireAuth, requireRole('QC', 'ADMIN'), (req, res) => {
  const t = loadTicket(req.user, req.params.id);
  if (!['pending', 'reviewing'].includes(t.status)) throw new HttpError(409, 'Only tickets awaiting review can be approved');
  const project = getProject(t.project);
  const checks = parseQcChecks(project, req.body?.qcChecks);
  const failed = project.qcChecks.filter((c) => !checks[c.id]);
  if (failed.length) throw new HttpError(400, `All QC checks must pass to approve. Unchecked: ${failed.map((f) => f.label).join(', ')}`);

  tx(() => {
    const ts = now();
    db.prepare("UPDATE tickets SET status = 'approved', reviewer_id = ?, qc_checks = ?, decided_at = ?, updated_at = ? WHERE id = ?")
      .run(req.user.id, JSON.stringify(checks), ts, ts, t.id);
    logHistory(t.id, req.user.id, 'approved');
    notify([t.sd_id], {
      ticketId: t.id,
      type: 'approved',
      message: `${t.code} approved by ${req.user.name}: filming can begin`,
      detail: `Your setup for "${t.task_name}" (${t.scene}) passed QC. You have the green light to start the recording session.`,
    });
  });
  res.json({ ok: true });
});

app.post('/api/tickets/:id/return', requireAuth, requireRole('QC', 'ADMIN'), (req, res) => {
  const t = loadTicket(req.user, req.params.id);
  if (!['pending', 'reviewing'].includes(t.status)) throw new HttpError(409, 'Only tickets awaiting review can be returned');
  const project = getProject(t.project);
  const checks = parseQcChecks(project, req.body?.qcChecks);
  const comment = String(req.body?.comment || '').trim();
  if (comment.length < 10) throw new HttpError(400, 'Feedback is required: describe the problem and the required correction');
  if (FEEDBACK_PLACEHOLDERS.some((p) => comment.includes(p)))
    throw new HttpError(400, 'Replace the [bracketed] placeholders with the actual problem and correction');

  tx(() => {
    const ts = now();
    db.prepare("UPDATE tickets SET status = 'returned', reviewer_id = ?, qc_checks = ?, decided_at = ?, updated_at = ? WHERE id = ?")
      .run(req.user.id, JSON.stringify(checks), ts, ts, t.id);
    logHistory(t.id, req.user.id, 'returned', comment);
    notify([t.sd_id], {
      ticketId: t.id,
      type: 'returned',
      message: `${t.code} returned by ${req.user.name}: fixes needed before filming`,
      detail: comment,
    });
    notify([t.spl_id], {
      ticketId: t.id,
      type: 'returned_spl',
      message: `${t.code} (${t.sd_name}) was returned by QC and needs corrections`,
      detail: comment,
    });
  });
  res.json({ ok: true });
});

app.post('/api/tickets/:id/resubmit', requireAuth, requireRole('SD'), upload.any(), (req, res) => {
  let t;
  try {
    t = loadTicket(req.user, req.params.id);
    if (t.sd_id !== req.user.id) throw new HttpError(403, 'Only the submitting Set Director can resubmit');
  } catch (err) {
    removeFiles(req.files);
    throw err;
  }
  resubmitTicket(t, req.user, req.body, req.files, 'app');
  res.json({ ok: true });
});

// ---------- "Submit a photo" (no login) ----------
// The submitter picks their own name; every submission and resubmission records who it was,
// and the submission log shows QC's feedback on returned tickets. Media is not exposed here.

const SUBMITTER_SQL = "SELECT * FROM users WHERE id = ? AND active = 1 AND role IN ('SD', 'SPC', 'SPL') AND studio IS NOT NULL";

app.get('/api/public/options', (req, res) => {
  res.json({
    projects: Object.values(PROJECTS),
    submitters: db
      .prepare("SELECT id, name, role, studio FROM users WHERE active = 1 AND role IN ('SD', 'SPC', 'SPL') AND studio IS NOT NULL ORDER BY studio, name")
      .all(),
    spls: db.prepare("SELECT id, name, studio FROM users WHERE role = 'SPL' AND active = 1 ORDER BY studio").all(),
  });
});

const latestReturn = db.prepare(`SELECT h.comment, h.created_at, u.name AS user_name FROM history h LEFT JOIN users u ON u.id = h.user_id
  WHERE h.ticket_id = ? AND h.action = 'returned' ORDER BY h.id DESC LIMIT 1`);

app.get('/api/public/submissions', (req, res) => {
  const project = getProject(req.query.project);
  if (!project) throw new HttpError(400, 'Unknown project');
  const rows = db.prepare(`${TICKET_SELECT} WHERE t.project = ? ORDER BY t.updated_at DESC LIMIT 100`).all(project.id);
  res.json(rows.map((t) => ({ ...shapeTicket(t), last_return: latestReturn.get(t.id) || null })));
});

app.get('/api/public/submissions/:id', (req, res) => {
  const t = db.prepare(`${TICKET_SELECT} WHERE t.id = ?`).get(Number(req.params.id));
  if (!t) throw new HttpError(404, 'Submission not found');
  res.json({
    ticket: shapeTicket(t),
    project: getProject(t.project),
    history: db
      .prepare(`SELECT h.*, u.name AS user_name, u.role AS user_role FROM history h LEFT JOIN users u ON u.id = h.user_id
        WHERE h.ticket_id = ? ORDER BY h.id DESC`)
      .all(t.id),
  });
});

app.post('/api/public/submissions', upload.any(), (req, res) => {
  const submitter = db.prepare(SUBMITTER_SQL).get(Number(req.body.submitterId));
  if (!submitter) {
    removeFiles(req.files);
    throw new HttpError(400, 'Choose who is submitting');
  }
  res.status(201).json({ id: createTicket(submitter, req.body, req.files, 'quick') });
});

app.post('/api/public/submissions/:id/resubmit', upload.any(), (req, res) => {
  const t = db.prepare(`${TICKET_SELECT} WHERE t.id = ?`).get(Number(req.params.id));
  const submitter = db.prepare(SUBMITTER_SQL).get(Number(req.body.submitterId));
  try {
    if (!t) throw new HttpError(404, 'Submission not found');
    if (!submitter) throw new HttpError(400, 'Choose who is resubmitting');
    if (submitter.studio !== t.studio) throw new HttpError(403, `Only ${t.studio} team members can resubmit this ticket`);
  } catch (err) {
    removeFiles(req.files);
    throw err;
  }
  resubmitTicket(t, submitter, req.body, req.files, 'quick');
  res.json({ ok: true });
});

// ---------- Team management ----------
// Admins can add anyone; SPLs can add Set Directors and Coordinators to their own studio.
// People added here are kept across restarts (the team.js roster sync leaves them alone).

const ADDABLE_ROLES = { ADMIN: ['SD', 'SPC', 'SPL', 'QC', 'ADMIN'], SPL: ['SD', 'SPC'] };

app.get('/api/team', requireAuth, requireRole('ADMIN', 'SPL'), (req, res) => {
  const scoped = req.user.role === 'SPL';
  // Brand-new access requests that aren't approved yet live in the requests list, not here.
  const users = db
    .prepare(`SELECT id, name, email, role, studio, title, source, active, login_approved, access_request FROM users
      WHERE NOT (source = 'request' AND active = 0) ${scoped ? 'AND studio = ?' : ''}
      ORDER BY active DESC, studio IS NULL, studio, role, name`)
    .all(...(scoped ? [req.user.studio] : []))
    .map((u) => ({ ...u, company: isCompanyEmail(u.email), can_sign_in: canSignIn(u), can_manage: canManage(req.user, u.role, u.studio) }));
  res.json({ users, addableRoles: ADDABLE_ROLES[req.user.role], companyDomains: COMPANY_DOMAINS });
});

app.post('/api/team', requireAuth, requireRole('ADMIN', 'SPL'), (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim().replace(/\s+/g, ' ');
  const email = String(b.email || '').trim().toLowerCase() || null;
  const role = String(b.role || '');
  const title = String(b.title || '').trim() || null;
  let studio = String(b.studio || '').trim() || null;

  if (!name) throw new HttpError(400, 'Name is required');
  if (!ADDABLE_ROLES[req.user.role].includes(role)) throw new HttpError(403, 'You cannot add someone with that role');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Enter a valid email address');
  if (req.user.role === 'SPL') studio = req.user.studio;
  if (STUDIO_ROLES.includes(role) && !studio) throw new HttpError(400, 'Choose a studio');
  if (!STUDIO_ROLES.includes(role)) studio = null;
  if (email && db.prepare('SELECT 1 FROM users WHERE lower(email) = ?').get(email)) throw new HttpError(409, 'Someone with that email is already on the team');
  if (db.prepare('SELECT 1 FROM users WHERE name = ? AND active = 1').get(name)) throw new HttpError(409, 'Someone with that name is already on the team');

  const { lastInsertRowid } = db
    .prepare("INSERT INTO users (name, email, role, studio, title, source, login_approved) VALUES (?, ?, ?, ?, ?, 'manual', 1)")
    .run(name, email, role, studio, title);
  res.status(201).json(db.prepare('SELECT id, name, email, role, studio, title, source, active FROM users WHERE id = ?').get(Number(lastInsertRowid)));
});

app.patch('/api/team/:id', requireAuth, requireRole('ADMIN', 'SPL'), (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(req.params.id));
  if (!target) throw new HttpError(404, 'User not found');
  if (target.id === req.user.id) throw new HttpError(409, "You can't change your own access");
  if (!canManage(req.user, target.role, target.studio)) {
    throw new HttpError(403, 'You can only manage your own studio’s Set Directors and Coordinators');
  }
  // Sign-in approval for external emails (works for roster and added people alike).
  if ('loginApproved' in (req.body || {})) {
    db.prepare('UPDATE users SET login_approved = ?, access_request = NULL WHERE id = ?').run(req.body.loginApproved ? 1 : 0, target.id);
    return res.json({ ok: true });
  }
  if (target.source === 'roster') throw new HttpError(409, 'People from the roster file are managed in config/team.js');
  db.prepare('UPDATE users SET active = ? WHERE id = ?').run(req.body?.active ? 1 : 0, target.id);
  res.json({ ok: true });
});

// ---------- Metrics (SPL oversight) ----------

app.get('/api/stats', requireAuth, requireRole('SPL', 'SPC', 'QC', 'ADMIN'), (req, res) => {
  const v = visibility(req.user);
  const tickets = db.prepare(`SELECT t.id, t.status, t.studio, t.submission_no FROM tickets t WHERE ${v.clause}`).all(...v.params);
  const ids = new Set(tickets.map((t) => t.id));
  const history = db
    .prepare("SELECT ticket_id, action, created_at FROM history WHERE action IN ('submitted','resubmitted','approved','returned') ORDER BY id")
    .all()
    .filter((h) => ids.has(h.ticket_id));

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

app.get('/api/notifications', requireAuth, (req, res) => {
  res.json({
    items: db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50').all(req.user.id),
    unread: db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL').get(req.user.id).n,
  });
});

app.post('/api/notifications/read', requireAuth, (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isInteger) : null;
  if (ids?.length) {
    db.prepare(`UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL AND id IN (${ids.map(() => '?').join(',')})`)
      .run(now(), req.user.id, ...ids);
  } else if (!ids) {
    db.prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL').run(now(), req.user.id);
  }
  res.json({ ok: true });
});

// ---------- Media (access-checked) ----------

app.get('/media/:id', requireAuth, (req, res) => {
  const m = db.prepare('SELECT * FROM media WHERE id = ?').get(Number(req.params.id));
  if (!m) throw new HttpError(404, 'Not found');
  loadTicket(req.user, m.ticket_id);
  res.type(m.mime).sendFile(path.join(UPLOAD_DIR, m.filename));
});

// ---------- Errors ----------

app.use('/api', (req, res, next) => next(new HttpError(404, 'Not found')));

app.use((err, req, res, next) => {
  let status = err.status || 500;
  let message = err.message;
  if (err instanceof multer.MulterError) {
    status = 400;
    if (err.code === 'LIMIT_FILE_SIZE') message = 'A file is too large (max 1 GB)';
  }
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong' : message });
});

app.listen(PORT, () => {
  console.log(`Studio Setup QC running at http://localhost:${PORT}`);
  console.log(`[auth] company domains (no approval needed): ${COMPANY_DOMAINS.join(', ')}`);
  verifyMail().then(({ ok, message }) => {
    if (ok) console.log(`[mail] ${message}`);
    else if (mailEnabled) console.error(`[mail] ${message}`);
    else console.warn(`[mail] ${message}. Sign-in codes are shown on screen (test mode) and no emails are sent.`);
  });
  if (DEV_LOGIN) console.warn('[auth] DEV_LOGIN=1: the no-password name picker is enabled (development only).');
});
