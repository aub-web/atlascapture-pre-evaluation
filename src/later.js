'use strict';

// Slow follow-up work after a ticket action: emails, the Google Sheet row and Drive copies.
// In-app notifications are saved right away; this other work runs after the response, so submitting,
// approving or returning doesn't wait on Google (several seconds per email when many people are notified).
//
//   - On Netlify: handed to the background function netlify/functions/followup-background.js
//     (runs up to 15 minutes), signed with SESSION_SECRET so nobody else can trigger it.
//   - Locally: runs in the same process right after the response.
// If handing off fails, the work runs inline instead, so nothing is lost.

const crypto = require('crypto');
const { HOSTED } = require('./env');

const handlers = {
  mail: (t) => require('./notify').sendMail(t.mail),
  sheet: (t) => require('./sheets').syncTicketToSheet(t.ticketId),
  drive: async (t) => {
    const drive = require('./drive');
    if (!drive.driveEnabled()) return;
    await drive.queueTicketMedia(t.ticketId, t.submissionNo);
    await drive.processDriveJobs(8 * 60 * 1000);
  },
};

async function runTasks(tasks) {
  for (const task of tasks) {
    try {
      await handlers[task.type]?.(task);
    } catch (err) {
      console.error(`[later] ${task.type} failed:`, err.message);
    }
  }
}

const signature = (body) => crypto.createHmac('sha256', process.env.SESSION_SECRET || '').update(body).digest('base64url');

function verify(body, sig) {
  if (!process.env.SESSION_SECRET || !sig) return null;
  const a = Buffer.from(String(sig));
  const b = Buffer.from(signature(body));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const data = JSON.parse(body);
  return Math.abs(Date.now() - Number(data.ts)) < 10 * 60 * 1000 ? data : null;
}

// later({ type: 'mail', mail }, { type: 'sheet', ticketId }, { type: 'drive', ticketId, submissionNo })
async function later(...list) {
  const tasks = list.flat().filter(Boolean);
  if (!tasks.length) return;
  if (!HOSTED) {
    setImmediate(() => runTasks(tasks));
    return;
  }
  const base = (process.env.URL || process.env.APP_URL || '').replace(/\/+$/, '');
  const body = JSON.stringify({ ts: Date.now(), tasks });
  try {
    const res = await fetch(`${base}/.netlify/functions/followup-background`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-signature': signature(body) },
      body,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    console.error('[later] background hand-off failed, running now:', err.message);
    await runTasks(tasks);
  }
}

module.exports = { later, runTasks, verify };
