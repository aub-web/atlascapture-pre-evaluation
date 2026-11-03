'use strict';

// Local entry point: `npm start`. On Netlify the same app runs via netlify/functions/api.js.

const { app, COMPANY_DOMAINS, DEV_LOGIN } = require('./src/app');
const { ready, usingPostgresUrl } = require('./src/db');
const { verifyMail, mailEnabled } = require('./src/notify');

const PORT = Number(process.env.PORT || 3000);

ready()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Studio Setup QC running at http://localhost:${PORT}`);
      console.log(`[db] ${usingPostgresUrl ? 'Postgres (DATABASE_URL)' : 'local embedded Postgres in data/pg'}`);
      console.log(`[auth] company domains (no approval needed): ${COMPANY_DOMAINS.join(', ')}`);
      verifyMail().then(({ ok, message }) => {
        if (ok) console.log(`[mail] ${message}`);
        else if (mailEnabled) console.error(`[mail] ${message}`);
        else console.warn(`[mail] ${message}. Sign-in codes are shown on screen (test mode) and no emails are sent.`);
      });
      if (DEV_LOGIN) console.warn('[auth] DEV_LOGIN=1: the no-password name picker is enabled (development only).');
    });
  })
  .catch((err) => {
    console.error('Could not start:', err);
    process.exit(1);
  });
