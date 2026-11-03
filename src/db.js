'use strict';

const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const { STUDIOS, QC_TEAM, ADMIN_TEAM, isExample: rosterIsExample } = require('./team');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'ticketing.db'));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id      INTEGER PRIMARY KEY,
    name    TEXT NOT NULL,
    email   TEXT,
    role    TEXT NOT NULL,           -- SPL | SPC | SD | QC | ADMIN
    studio  TEXT,
    title   TEXT,                    -- job title shown for Admin Team members
    active  INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS tickets (
    id              INTEGER PRIMARY KEY,
    code            TEXT UNIQUE,
    project         TEXT NOT NULL,
    sd_id           INTEGER NOT NULL REFERENCES users(id),
    spl_id          INTEGER REFERENCES users(id),
    studio          TEXT,
    task_name       TEXT NOT NULL,
    scene           TEXT NOT NULL,
    business_type   TEXT NOT NULL,
    boundary_size   REAL NOT NULL,
    setup_checklist TEXT NOT NULL,   -- JSON {itemId: true}
    media_type      TEXT NOT NULL,   -- images | video
    status          TEXT NOT NULL,   -- pending | reviewing | approved | returned
    reviewer_id     INTEGER REFERENCES users(id),
    qc_checks       TEXT,            -- JSON {checkId: true|false}
    submission_no   INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    decided_at      TEXT
  );

  CREATE TABLE IF NOT EXISTS media (
    id             INTEGER PRIMARY KEY,
    ticket_id      INTEGER NOT NULL REFERENCES tickets(id),
    submission_no  INTEGER NOT NULL,
    slot           TEXT NOT NULL,    -- exo1..exo4 | ego | video
    label          TEXT NOT NULL,
    filename       TEXT NOT NULL,
    original_name  TEXT,
    mime           TEXT NOT NULL,
    size           INTEGER NOT NULL,
    duration       REAL,
    created_at     TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS history (
    id          INTEGER PRIMARY KEY,
    ticket_id   INTEGER NOT NULL REFERENCES tickets(id),
    user_id     INTEGER REFERENCES users(id),
    action      TEXT NOT NULL,       -- submitted | review_started | approved | returned | resubmitted
    comment     TEXT,
    created_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id          INTEGER PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    ticket_id   INTEGER REFERENCES tickets(id),
    type        TEXT NOT NULL,
    message     TEXT NOT NULL,
    read_at     TEXT,
    created_at  TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
  CREATE INDEX IF NOT EXISTS idx_tickets_sd ON tickets(sd_id);
  CREATE INDEX IF NOT EXISTS idx_media_ticket ON media(ticket_id);
  CREATE INDEX IF NOT EXISTS idx_history_ticket ON history(ticket_id);
  CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read_at);
`);

// Migrations for databases created before a column existed.
function addColumn(table, column, definition) {
  if (!db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
addColumn('users', 'title', 'TEXT');
addColumn('users', 'source', "TEXT NOT NULL DEFAULT 'roster'"); // roster (team.js) | manual (added in the app)
addColumn('tickets', 'channel', "TEXT NOT NULL DEFAULT 'app'");  // app (signed in) | quick ("Submit a photo", no login)
addColumn('history', 'via', "TEXT NOT NULL DEFAULT 'app'");
// Sign-in access: company-domain emails are allowed automatically; other emails need
// login_approved = 1 (set by an admin/manager). People not on the team can request access.
addColumn('users', 'login_approved', 'INTEGER NOT NULL DEFAULT 0');
addColumn('users', 'access_request', 'TEXT');   // pending | denied | NULL
addColumn('users', 'request_note', 'TEXT');
addColumn('users', 'requested_at', 'TEXT');

const now = () => new Date().toISOString();

function tx(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// The roster in team.js is synced on every start: existing users are matched by email (then name)
// and updated, new people are added, and roster people no longer listed are deactivated (their
// tickets remain). People added in the app (source = 'manual') are left alone.
function syncRoster() {
  const roster = [
    ...STUDIOS.flatMap((s) => s.members.map(([name, email, role]) => ({ name, email, role, studio: s.name }))),
    ...QC_TEAM.map(([name, email]) => ({ name, email, role: 'QC', studio: null })),
    ...ADMIN_TEAM.map(([name, email, title]) => ({ name, email, role: 'ADMIN', studio: null, title })),
  ].map((r) => ({ ...r, email: r.email ? r.email.trim().toLowerCase() : null, title: r.title ?? null }));

  const byEmail = db.prepare('SELECT id FROM users WHERE lower(email) = ?');
  const byName = db.prepare('SELECT id FROM users WHERE name = ?');
  const update = db.prepare("UPDATE users SET name = ?, email = ?, role = ?, studio = ?, title = ?, active = 1, source = 'roster' WHERE id = ?");
  const insert = db.prepare('INSERT INTO users (name, email, role, studio, title) VALUES (?, ?, ?, ?, ?)');

  tx(() => {
    const keep = new Set();
    for (const r of roster) {
      const existing = (r.email && byEmail.get(r.email)) || byName.get(r.name);
      if (existing && !keep.has(existing.id)) {
        update.run(r.name, r.email, r.role, r.studio, r.title, existing.id);
        keep.add(existing.id);
      } else {
        keep.add(Number(insert.run(r.name, r.email, r.role, r.studio, r.title).lastInsertRowid));
      }
    }
    const deactivate = db.prepare('UPDATE users SET active = 0 WHERE id = ?');
    // Never deactivate people based on the example roster (e.g. config/team.js missing).
    if (rosterIsExample) return;
    for (const { id } of db.prepare("SELECT id FROM users WHERE active = 1 AND source = 'roster'").all()) {
      if (!keep.has(id)) deactivate.run(id);
    }
  });
}
// With only the example roster, sync just to seed a brand-new database; never touch an existing one.
if (!rosterIsExample || db.prepare("SELECT COUNT(*) AS n FROM users").get().n === 0) syncRoster();

module.exports = { db, now, tx, DATA_DIR };
