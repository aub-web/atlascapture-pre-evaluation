'use strict';

// Local, one-time email setup page (an alternative to the terminal prompt in setup-email.js).
// Runs on http://127.0.0.1:3010 only. You enter the sending account + Google App Password; it saves
// them to .env, checks the login, sends a test email, and copies both to the linked Netlify site
// with the Netlify CLI (if `netlify login` / `netlify link` were done in this folder).
// Usage: node scripts/setup-email-web.js

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const ENV_PATH = path.join(ROOT, '.env');
const PORT = 3010;

function setEnvValue(text, key, value) {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  return re.test(text) ? text.replace(re, line) : `${text.replace(/\s*$/, '\n')}${line}\n`;
}

async function checkAndSend(user, pass, to) {
  const nodemailer = require('nodemailer');
  const transport = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 587, secure: false, auth: { user, pass } });
  try {
    await transport.verify();
  } catch (err) {
    const hint = /535|BadCredentials|not accepted/i.test(err.message)
      ? 'Google rejected the login. Check the email address, and that the password is a 16-character App Password (not the normal password).'
      : err.message;
    return { ok: false, message: hint };
  }
  await transport.sendMail({
    from: `Studio Setup QC <${user}>`,
    to,
    subject: 'Studio Setup QC test email',
    text: 'This is a test email from Studio Setup QC. Email sending is working.',
  });
  return { ok: true };
}

function copyToNetlify(user, pass) {
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const results = [];
  for (const [key, value] of [['SMTP_USER', user], ['SMTP_PASS', pass]]) {
    const r = spawnSync(npx, ['--yes', 'netlify-cli@latest', 'env:set', key, value], { cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32' });
    results.push(r.status === 0);
  }
  return results.every(Boolean);
}

const page = (body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Email setup</title><style>
:root{--bg:#f5f6f8;--card:#fff;--text:#16191f;--muted:#5d6573;--border:#e2e5ea;--accent:#2f6fed;--green:#17803d;--green-soft:#e3f4e8;--red:#c4302b;--red-soft:#fce8e7}
@media (prefers-color-scheme:dark){:root{--bg:#0f1115;--card:#171a20;--text:#e8eaee;--muted:#a0a7b3;--border:#2b3039;--accent:#5b8ef5;--green:#4cc274;--green-soft:#15301f;--red:#f07167;--red-soft:#3a1a18}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:16px;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.card{width:100%;max-width:440px;background:var(--card);border:1px solid var(--border);border-radius:12px;padding:26px 24px}
h1{font-size:20px;margin:0 0 6px}p{color:var(--muted);margin:0 0 16px;font-size:14px}label{display:block;font-weight:600;font-size:13px;margin:12px 0 6px}
input{width:100%;height:42px;padding:0 12px;border:1px solid var(--border);border-radius:8px;background:var(--card);color:var(--text);font:inherit}
button{width:100%;height:44px;margin-top:18px;border:0;border-radius:8px;background:var(--accent);color:#fff;font:inherit;font-weight:600;cursor:pointer}
.ok{background:var(--green-soft);color:var(--green);padding:12px;border-radius:8px;font-weight:600}.err{background:var(--red-soft);color:var(--red);padding:12px;border-radius:8px;margin-bottom:8px}
small{color:var(--muted)}
</style></head><body><div class="card">${body}</div></body></html>`;

const form = (error = '', user = '') => page(`
  <h1>Email setup</h1>
  <p>Enter the Google account that will send Studio Setup QC emails and its 16-character App Password. This page runs only on this PC.</p>
  ${error ? `<div class="err">${error}</div>` : ''}
  <form method="post" action="/">
    <label>Sending account email</label><input name="user" type="email" required autocomplete="off" placeholder="noreply@atlascapture.io" value="${user.replace(/"/g, '&quot;')}">
    <label>App Password</label><input name="pass" type="password" required autocomplete="new-password" placeholder="xxxx xxxx xxxx xxxx">
    <small>Create one at myaccount.google.com/apppasswords (2-Step Verification must be on).</small>
    <label>Send a test email to</label><input name="to" type="email" autocomplete="off" placeholder="Leave blank to use the sending account">
    <button type="submit">Save and send test email</button>
  </form>`);

http.createServer((req, res) => {
  if (req.method !== 'POST') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(form());
  }
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', async () => {
    const f = Object.fromEntries(new URLSearchParams(body));
    const user = String(f.user || '').trim();
    const pass = String(f.pass || '').replace(/\s+/g, '');
    const to = String(f.to || '').trim() || user;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user)) return res.end(form('Enter a valid sending account email.', user));
    if (pass.length !== 16) return res.end(form(`App Passwords are 16 characters; that was ${pass.length}.`, user));
    let result;
    try {
      result = await checkAndSend(user, pass, to);
    } catch (err) {
      result = { ok: false, message: err.message };
    }
    if (!result.ok) return res.end(form(result.message, user));

    let env = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
    env = setEnvValue(env, 'SMTP_HOST', 'smtp.gmail.com');
    env = setEnvValue(env, 'SMTP_PORT', '587');
    env = setEnvValue(env, 'SMTP_USER', user);
    env = setEnvValue(env, 'SMTP_PASS', pass);
    fs.writeFileSync(ENV_PATH, env);
    const netlify = copyToNetlify(user, pass);
    console.log(`[setup-email-web] saved; test email sent to ${to}; copied to Netlify: ${netlify}`);
    res.end(page(`<h1>Email is set up</h1>
      <div class="ok">✓ Google accepted the login and a test email was sent to ${to.replace(/</g, '&lt;')}.</div>
      <p style="margin-top:14px">Saved on this PC${netlify ? ' and copied to the Netlify site' : ' (copying to Netlify failed; Claude will finish that)'}. You can close this page and tell Claude it's done.</p>`));
  });
}).listen(PORT, '127.0.0.1', () => console.log(`Email setup page: http://127.0.0.1:${PORT}`));
