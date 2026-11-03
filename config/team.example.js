'use strict';

// Example roster. Copy this file to config/team.js (which is gitignored) and replace the
// entries with the real team. The roster syncs into the database every time the app starts.
// Roles: SPL (Studio Project Lead), SPC (Studio Project Coordinator), SD (Set Director),
// QC (QC Reviewer), ADMIN (Admin Team).

const STUDIOS = [
  {
    name: 'Studio Example',
    region: 'Example City',
    members: [
      // [name, email, role]
      ['Sample Lead', 'lead@example.com', 'SPL'],
      ['Sample Coordinator', 'coordinator@example.com', 'SPC'],
      ['Sample Set Director', 'setdirector@example.com', 'SD'],
    ],
  },
];

// [name, email]
const QC_TEAM = [['Sample Reviewer', 'reviewer@example.com']];

// [name, email, title]
const ADMIN_TEAM = [['Sample Admin', 'admin@example.com', 'Admin']];

module.exports = { STUDIOS, QC_TEAM, ADMIN_TEAM };
