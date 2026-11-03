'use strict';

// Loads the team roster file for local use. The real roster (names + emails) is kept out of git:
//   config/team.js           real roster, gitignored (or set ROSTER_FILE to another path)
//   config/team.example.js   committed example with the expected format
// When only the example exists, `isExample` is true and the roster sync won't deactivate anyone.
// On Netlify there is no roster file: admins import it on the Team page (`hosted: true`).

const fs = require('fs');
const path = require('path');
const { HOSTED } = require('./env');

function load() {
  if (HOSTED) return { STUDIOS: [], QC_TEAM: [], ADMIN_TEAM: [], isExample: true, hosted: true };

  const realPath = process.env.ROSTER_FILE
    ? path.resolve(process.env.ROSTER_FILE)
    : path.join(__dirname, '..', 'config', 'team.js');
  const examplePath = path.join(__dirname, '..', 'config', 'team.example.js');
  const isExample = !fs.existsSync(realPath);
  if (isExample) {
    console.warn(`[roster] ${path.relative(process.cwd(), realPath)} not found: using the example roster. Copy config/team.example.js to config/team.js and fill it in.`);
  }
  const { STUDIOS = [], QC_TEAM = [], ADMIN_TEAM = [] } = require(isExample ? examplePath : realPath);
  return { STUDIOS, QC_TEAM, ADMIN_TEAM, isExample, hosted: false };
}

module.exports = load();
