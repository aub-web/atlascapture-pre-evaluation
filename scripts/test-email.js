'use strict';

// Sends one test email using the SMTP settings in .env.
// Usage: npm run test-email -- you@atlascapture.io

const { verifyMail, sendMail, appLink } = require('../src/notify');

(async () => {
  const to = process.argv[2];
  if (!to || !to.includes('@')) {
    console.error('Usage: npm run test-email -- you@atlascapture.io');
    process.exit(1);
  }
  const check = await verifyMail();
  console.log(`${check.ok ? '✓' : '✗'} SMTP ${check.message}`);
  if (!check.ok) process.exit(1);

  const link = appLink('/welcome');
  const sent = await sendMail({
    to,
    subject: 'Studio Setup QC test email',
    text: `This is a test email from Studio Setup QC. Email sending is working.${link ? `\n\nOpen the app: ${link}` : ''}`,
  });
  console.log(sent ? `✓ Test email sent to ${to}` : '✗ Sending failed (see the error above)');
  process.exit(sent ? 0 : 1);
})();
