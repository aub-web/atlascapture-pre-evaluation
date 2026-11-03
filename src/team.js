'use strict';

// Loads the team roster. The real roster (names + emails) is kept out of the git repo:
//   config/team.js           real roster, gitignored (or set ROSTER_FILE to another path)
//   config/team.example.js   committed example with the expected format
// When only the example exists, `isExample` is true and the roster sync won't deactivate anyone.

const fs = require('fs');
const path = require('path');

const realPath = process.env.ROSTER_FILE
  ? path.resolve(process.env.ROSTER_FILE)
  : path.join(__dirname, '..', 'config', 'team.js');
const examplePath = path.join(__dirname, '..', 'config', 'team.example.js');
const isExample = !fs.existsSync(realPath);

if (isExample) {
  console.warn(`[roster] ${path.relative(process.cwd(), realPath)} not found: using the example roster. Copy config/team.example.js to config/team.js and fill it in.`);
}

const { STUDIOS = [], QC_TEAM = [], ADMIN_TEAM = [] } = require(isExample ? examplePath : realPath);

module.exports = { STUDIOS, QC_TEAM, ADMIN_TEAM, isExample };
