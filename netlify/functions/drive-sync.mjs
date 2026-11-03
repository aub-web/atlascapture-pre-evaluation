// Scheduled Netlify Function: every 5 minutes, continues copying queued photos/videos to Google Drive
// (src/drive.js). New files are also sent right after each submission; this picks up what didn't fit
// in that request, e.g. large videos.

import drive from '../../src/drive.js';

export default async () => {
  const result = await drive.processDriveJobs(25_000);
  if (result.enabled && result.processed) console.log('[drive-sync]', JSON.stringify(result));
  return new Response('ok');
};

export const config = { schedule: '*/5 * * * *' };
