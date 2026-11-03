'use strict';

const { q, run, now } = require('./db');

// In-app notifications are always created. Email is sent too when SMTP is fully configured:
//   SMTP_HOST, SMTP_PORT (default 587), SMTP_USER, SMTP_PASS, MAIL_FROM, APP_URL
// Email stays off until host, user and password are all set, so a half-filled .env
// keeps the app in test mode instead of breaking sign-in.
const SMTP_REQUIRED = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'];
const smtpMissing = SMTP_REQUIRED.filter((k) => !String(process.env[k] || '').trim());
let transport = null;
if (!smtpMissing.length) {
  const nodemailer = require('nodemailer');
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST.trim(),
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    // Google shows app passwords in groups of four; spaces are not part of the password.
    auth: { user: process.env.SMTP_USER.trim(), pass: process.env.SMTP_PASS.replace(/\s+/g, '') },
  });
}
const mailEnabled = Boolean(transport);
const mailFrom = () => process.env.MAIL_FROM || `Studio Setup QC <${process.env.SMTP_USER.trim()}>`;

// Checks the SMTP login and explains common failures. Resolves { ok, message }.
async function verifyMail() {
  if (!transport) {
    const partial = smtpMissing.length < SMTP_REQUIRED.length;
    return { ok: false, message: partial ? `email is off: ${smtpMissing.join(', ')} not set` : 'email is off: SMTP is not configured' };
  }
  try {
    await transport.verify();
    return { ok: true, message: `connected to ${process.env.SMTP_HOST} as ${process.env.SMTP_USER}` };
  } catch (err) {
    const hint = /535|Username and Password not accepted|BadCredentials/i.test(err.message)
      ? ' (Google rejected the login: check SMTP_USER and that SMTP_PASS is a 16-character App Password, not the normal password)'
      : '';
    return { ok: false, message: `could not connect to ${process.env.SMTP_HOST}: ${err.message}${hint}` };
  }
}

const appLink = (hashPath) => (process.env.APP_URL ? `${process.env.APP_URL.replace(/\/$/, '')}/#${hashPath}` : '');

// Sends one email. Resolves false (without throwing) when email isn't configured or sending fails.
async function sendMail({ to, bcc, subject, text }) {
  if (!transport) return false;
  try {
    await transport.sendMail({ from: mailFrom(), to, bcc, subject, text });
    return true;
  } catch (err) {
    console.error('[mail] failed:', err.message);
    return false;
  }
}

// `link` is an app path like '/t/12' or '/team'; defaults to the ticket when there is one.
// Awaited by callers: on serverless hosts work left running after the response may never finish.
async function notify(userIds, { ticketId, type, message, detail, link }) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return;
  const ts = now();
  for (const id of ids) {
    await run('INSERT INTO notifications (user_id, ticket_id, type, message, created_at) VALUES ($1, $2, $3, $4, $5)',
      [id, ticketId ?? null, type, message, ts]);
  }

  if (!transport) return;
  const recipients = (await q('SELECT email FROM users WHERE id = ANY($1) AND email IS NOT NULL', [ids])).map((r) => r.email);
  if (!recipients.length) return;

  const url = appLink(link || (ticketId ? `/t/${ticketId}` : '/'));
  await sendMail({ bcc: recipients, subject: message, text: [message, detail, url && `Open: ${url}`].filter(Boolean).join('\n\n') });
}

module.exports = { notify, sendMail, verifyMail, mailEnabled, appLink };
