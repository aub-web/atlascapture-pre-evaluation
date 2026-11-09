// Scheduled Netlify Function: every 5 minutes, continues copying queued photos/videos to Google Drive.
// New files are also sent right after each submission; this picks up what didn't fit in that request,
// e.g. large videos, and retries after errors.
//
// It asks the API function to do the work (POST /api/internal/drive-tick, signed with SESSION_SECRET)
// instead of loading the database code here: bundled as an ES module, this function couldn't load `pg`.

import crypto from 'node:crypto';

export default async () => {
  const secret = process.env.SESSION_SECRET;
  const base = (process.env.APP_URL || process.env.URL || '').replace(/\/+$/, '');
  if (!secret || !base || process.env.DRIVE_SYNC !== '1') return new Response('skipped');

  for (let round = 0; round < 3; round++) {
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = crypto.createHmac('sha256', secret).update(`drive-tick:${ts}`).digest('base64url');
    const res = await fetch(`${base}/api/internal/drive-tick`, { method: 'POST', headers: { 'x-drive-tick': `${ts}.${sig}`, Accept: 'application/json' } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { console.error('[drive-sync]', res.status, JSON.stringify(body)); break; }
    if (body.processed) console.log('[drive-sync]', JSON.stringify({ processed: body.processed, done: body.done, waiting: body.waiting, failed: body.failed }));
    if (!body.waiting || !body.done) break; // nothing left, or no progress this round (errors are retried next time)
  }
  return new Response('ok');
};

export const config = { schedule: '*/5 * * * *' };
