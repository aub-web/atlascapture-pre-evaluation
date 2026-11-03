// Studio Setup QC → Google Sheets sync (Apps Script web app).
//
// Setup, once, in the "QA/QC TICKETING_DB" spreadsheet:
//   1. Extensions → Apps Script. Replace the editor contents with this file and save.
//   2. Set SECRET below to the same value as SHEETS_WEBHOOK_SECRET in the site's settings.
//   3. Deploy → New deployment → type "Web app"; Execute as: Me; Who has access: Anyone → Deploy.
//      Approve the permissions prompt, then copy the Web app URL.
//   4. Put that URL in the site's settings as SHEETS_WEBHOOK_URL and redeploy the site.
//
// The site POSTs {secret, country, row}. Each country gets its own tab (created if missing);
// the ticket's row is updated in place, matched by the Ticket column.
//
// It can also send the site's emails (sign-in codes, ticket alerts) when the site sets
// MAIL_VIA=apps-script: the site POSTs {secret, action: "email", to, bcc, subject, text} and the
// mail goes out from the Google account that owns this script (no App Password needed).
// Updating an existing deployment: Deploy → Manage deployments → ✏️ → Version: New version → Deploy.

const SECRET = 'PASTE_SHEETS_WEBHOOK_SECRET_HERE';

// Google Drive folder that receives a copy of every submitted photo/video (site setting DRIVE_SYNC=1).
// The ID is the part after /folders/ in the folder's link. The script owner needs edit access to it.
const DRIVE_FOLDER_ID = 'PASTE_DRIVE_FOLDER_ID_HERE';

const HEADERS = [
  'Ticket', 'Status', 'Project', 'Studio', 'Set Director', 'Assigned SPL', 'Task Name', 'Scene', 'Business Type',
  'Boundary (m)', 'Round', 'QC Reviewer', 'Latest QC Feedback', 'Submitted Via', 'Submitted At', 'Last Updated', 'Decided At', 'Link',
];

function doPost(e) {
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return reply({ ok: false, error: 'invalid JSON' });
  }
  if (!data || data.secret !== SECRET) return reply({ ok: false, error: 'unauthorized' });
  if (data.action === 'email') return sendEmail(data);
  if (data.action === 'email-check') return reply({ ok: true, email: true, quota: MailApp.getRemainingDailyQuota() });
  if (data.action === 'drive-session') return driveSession(data);
  if (data.action === 'drive-check') return reply({ ok: true, folder: DriveApp.getFolderById(DRIVE_FOLDER_ID).getName() });
  if (!data.row || !data.row.Ticket) return reply({ ok: false, error: 'missing row' });

  const lock = LockService.getScriptLock();
  lock.waitLock(30000); // one write at a time, so two updates can't race for the same row
  try {
    const sheet = tabFor(String(data.country || 'Other'));
    const values = HEADERS.map((h) => (data.row[h] === undefined || data.row[h] === null ? '' : data.row[h]));
    const last = sheet.getLastRow();
    const codes = last > 1 ? sheet.getRange(2, 1, last - 1, 1).getValues().map((r) => String(r[0])) : [];
    const index = codes.indexOf(String(data.row.Ticket));
    const rowNumber = index >= 0 ? index + 2 : last + 1;
    sheet.getRange(rowNumber, 1, 1, values.length).setValues([values]);
    return reply({ ok: true, sheet: sheet.getName(), row: rowNumber });
  } finally {
    lock.releaseLock();
  }
}

function sendEmail(data) {
  // One email per recipient, so people never see each other's addresses.
  const list = [].concat(data.to || [], data.bcc || []).join(',').split(',').map((s) => s.trim()).filter(Boolean);
  const recipients = list.filter((r, i) => list.indexOf(r) === i);
  if (!recipients.length) return reply({ ok: false, error: 'no recipients' });
  if (MailApp.getRemainingDailyQuota() < recipients.length) return reply({ ok: false, error: 'daily email quota reached' });
  recipients.forEach((to) => MailApp.sendEmail({ to: to, subject: String(data.subject || 'Studio Setup QC'), body: String(data.text || ''), name: 'Studio Setup QC' }));
  return reply({ ok: true, sent: recipients.length, quota: MailApp.getRemainingDailyQuota() });
}

// Opens a Drive "resumable upload session" for one file in the folder and returns its URL.
// The site then sends the file's bytes straight to that URL; the URL only allows uploading this one file.
function driveSession(data) {
  const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  const res = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true', {
    method: 'post',
    contentType: 'application/json; charset=UTF-8',
    headers: {
      Authorization: 'Bearer ' + ScriptApp.getOAuthToken(),
      'X-Upload-Content-Type': String(data.mime || 'application/octet-stream'),
      'X-Upload-Content-Length': String(data.size || 0),
    },
    payload: JSON.stringify({ name: String(data.name || 'upload'), parents: [folder.getId()] }),
    muteHttpExceptions: true,
  });
  const headers = res.getHeaders();
  const location = headers.Location || headers.location;
  if (res.getResponseCode() !== 200 || !location) {
    return reply({ ok: false, error: 'Drive session failed: HTTP ' + res.getResponseCode() + ' ' + res.getContentText().slice(0, 200) });
  }
  return reply({ ok: true, uploadUrl: location });
}

// Run once from the editor (choose authorizeDrive → Run) to grant the Drive permissions.
function authorizeDrive() {
  Logger.log('Drive folder: ' + DriveApp.getFolderById(DRIVE_FOLDER_ID).getName());
  UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/about?fields=user', { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } });
}

// Run once from the editor to grant the email permission.
function authorizeEmail() {
  Logger.log(MailApp.getRemainingDailyQuota());
}

function doGet() {
  return reply({ ok: true, service: 'Studio Setup QC sheet sync' });
}

function tabFor(country) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const name = country.replace(/[\[\]*?\/\\:]/g, '').slice(0, 90) || 'Other';
  const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold').setBackground('#e8effd');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
