'use strict';

// Mirrors each ticket into the Google Sheet "QA/QC TICKETING_DB", one tab per country.
// The sheet runs a small Apps Script web app (scripts/google-sheets-sync.gs) that inserts or updates
// the ticket's row. Configure with SHEETS_WEBHOOK_URL (the web app URL) and SHEETS_WEBHOOK_SECRET.
// Sync failures are logged and never block the ticket action itself.

const { one } = require('./db');
const { getProject } = require('./projects');
const { appLink } = require('./notify');

const STATUS_LABELS = {
  pending: 'Pending QC Review',
  reviewing: 'Reviewing',
  approved: 'Approved',
  returned: 'Returned / Needs Fixes',
};
const TIME_ZONE = process.env.SHEETS_TIMEZONE || 'Asia/Manila'; // Manila, CDO and Bali are all UTC+8

const sheetsEnabled = () => Boolean(process.env.SHEETS_WEBHOOK_URL && process.env.SHEETS_WEBHOOK_SECRET);

function formatTime(iso) {
  if (!iso) return '';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

// Text starting with = + - @ would be treated as a formula by Sheets.
const cell = (v) => (typeof v === 'string' && /^[=+\-@]/.test(v) ? `'${v}` : v ?? '');

const loadTicket = (ticketId) => one(`SELECT t.*, sd.name AS sd_name, spl.name AS spl_name, r.name AS reviewer_name, st.country AS country
  FROM tickets t JOIN users sd ON sd.id = t.sd_id LEFT JOIN users spl ON spl.id = t.spl_id LEFT JOIN users r ON r.id = t.reviewer_id
  LEFT JOIN studios st ON st.name = t.studio
  WHERE t.id = $1`, [ticketId]);

const loadLastReturn = (ticketId) => one(`SELECT h.comment, u.name AS user_name FROM history h LEFT JOIN users u ON u.id = h.user_id
  WHERE h.ticket_id = $1 AND h.action = 'returned' ORDER BY h.id DESC LIMIT 1`, [ticketId]);

function rowFor(t, lastReturn, status) {
  const row = {
    Ticket: t.code,
    Status: status || STATUS_LABELS[t.status] || t.status,
    Project: getProject(t.project)?.name || t.project,
    Studio: t.studio || '',
    'Set Director': t.sd_name,
    'Assigned SPL': t.spl_name || '',
    'Task Name': t.task_name,
    Scene: t.scene,
    'Business Type': t.business_type,
    'Boundary (m)': t.boundary_size ? `${t.boundary_size} x ${t.boundary_size}` : '',
    Round: t.submission_no,
    'QC Reviewer': t.reviewer_name || '',
    'Latest QC Feedback': lastReturn ? `${lastReturn.comment}${lastReturn.user_name ? ` (${lastReturn.user_name})` : ''}` : '',
    'Submitted Via': t.channel === 'quick' ? 'Submit a photo (no login)' : 'Signed in',
    'Submitted At': formatTime(t.created_at),
    'Last Updated': formatTime(t.updated_at),
    'Decided At': formatTime(t.decided_at),
    Link: status ? '' : appLink(`/t/${t.id}`),
  };
  for (const k of Object.keys(row)) row[k] = cell(row[k]);
  return row;
}

async function postRow(country, row) {
  const res = await fetch(process.env.SHEETS_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ secret: process.env.SHEETS_WEBHOOK_SECRET, country: country || 'Other', row }),
    redirect: 'follow',
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  if (!res.ok || !text.includes('"ok":true')) {
    console.error(`[sheets] sync of ${row.Ticket} failed: HTTP ${res.status} ${text.slice(0, 200)}`);
    return false;
  }
  return true;
}

async function syncTicketToSheet(ticketId) {
  if (!sheetsEnabled()) return false;
  try {
    const t = await loadTicket(ticketId);
    if (!t) return false;
    return await postRow(t.country, rowFor(t, await loadLastReturn(t.id)));
  } catch (err) {
    console.error(`[sheets] sync of ticket ${ticketId} failed:`, err.message);
    return false;
  }
}

// Keeps a deleted ticket's row in the sheet with Status "Deleted by <name> on <date>".
// Takes the ticket + last return as loaded before deletion.
async function markTicketDeletedInSheet(t, lastReturn, by) {
  if (!sheetsEnabled()) return false;
  try {
    return await postRow(t.country, rowFor(t, lastReturn, `Deleted by ${by.name} on ${formatTime(new Date().toISOString())}`));
  } catch (err) {
    console.error(`[sheets] marking ${t.code} deleted failed:`, err.message);
    return false;
  }
}

module.exports = { syncTicketToSheet, sheetsEnabled, markTicketDeletedInSheet, loadLastReturn };
