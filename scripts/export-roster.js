'use strict';

// Converts the private roster (config/team.js) to config/team.json for "Import roster" on the
// hosted site's Team page. Both files are gitignored.
// Usage: node scripts/export-roster.js

const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'config', 'team.js');
const out = path.join(__dirname, '..', 'config', 'team.json');
if (!fs.existsSync(src)) {
  console.error('✗ config/team.js not found. Copy config/team.example.js to config/team.js and fill it in first.');
  process.exit(1);
}
const { STUDIOS = [], QC_TEAM = [], ADMIN_TEAM = [] } = require(src);
fs.writeFileSync(out, JSON.stringify({ STUDIOS, QC_TEAM, ADMIN_TEAM }, null, 2));
const people = STUDIOS.reduce((n, s) => n + s.members.length, 0) + QC_TEAM.length + ADMIN_TEAM.length;
console.log(`✓ Wrote config/team.json (${people} people). Upload it on the Team page → Import roster.`);
