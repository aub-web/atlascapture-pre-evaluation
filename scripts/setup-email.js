'use strict';

// Interactive email setup: asks for the sending account and its App Password (hidden while typing),
// saves them to .env, then checks the login and sends a test email.
// Usage: npm run setup-email

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawnSync } = require('child_process');

const ENV_PATH = path.join(__dirname, '..', '.env');

// One shared reader for all questions (separate readers would each grab buffered input).
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY) });
let muted = false;
const writeOutput = rl._writeToOutput.bind(rl);
rl._writeToOutput = (s) => {
  // While muted, typed characters are not echoed (for the App Password).
  if (!muted) writeOutput(s);
};

// Lines are read through an async iterator so answers typed (or pasted) ahead are queued, not lost.
const lines = rl[Symbol.asyncIterator]();

async function ask(question, { hidden = false } = {}) {
  process.stdout.write(question);
  muted = hidden;
  const { value = '' } = await lines.next();
  muted = false;
  if (hidden) process.stdout.write('\n');
  return value.trim();
}

function setEnvValue(text, key, value) {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  return re.test(text) ? text.replace(re, line) : `${text.replace(/\s*$/, '\n')}${line}\n`;
}

(async () => {
  console.log('\nStudio Setup QC: email setup\n');
  const user = await ask('Sending account email (e.g. noreply@atlascapture.io): ');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user)) {
    console.error('✗ That does not look like an email address. Nothing was saved.');
    rl.close();
    process.exit(1);
  }
  const pass = (await ask('16-character App Password (hidden as you type): ', { hidden: true })).replace(/\s+/g, '');
  if (pass.length !== 16) {
    console.error(`✗ App Passwords are 16 characters; got ${pass.length}. Nothing was saved.`);
    rl.close();
    process.exit(1);
  }
  const to = (await ask(`Send the test email to [${user}]: `)) || user;
  rl.close();

  let env = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
  env = setEnvValue(env, 'SMTP_HOST', env.match(/^SMTP_HOST=(.+)$/m)?.[1] || 'smtp.gmail.com');
  env = setEnvValue(env, 'SMTP_USER', user);
  env = setEnvValue(env, 'SMTP_PASS', pass);
  fs.writeFileSync(ENV_PATH, env);
  console.log('✓ Saved to .env\n');

  // Run the test in a fresh process so it picks up the new .env.
  const result = spawnSync(process.execPath, ['--env-file=.env', path.join(__dirname, 'test-email.js'), to], {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit',
  });
  if (result.status === 0) console.log('\nAll set. Tell Claude "email works" so it can restart the app.');
  process.exit(result.status ?? 1);
})();
