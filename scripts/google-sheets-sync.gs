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

const SECRET = 'PASTE_SHEETS_WEBHOOK_SECRET_HERE';

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
  if (!data || data.secret !== SECRET || !data.row || !data.row.Ticket) return reply({ ok: false, error: 'unauthorized' });

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
