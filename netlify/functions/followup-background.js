'use strict';

// Netlify Background Function (the "-background" name makes Netlify answer 202 at once and run
// this for up to 15 minutes). Does the slow follow-up work of a ticket action: emails, the Google
// Sheet row and Drive copies. Called only by the API (src/later.js), with a signed request.

const { connectLambda } = require('@netlify/blobs');
const { runTasks, verify } = require('../../src/later');

exports.handler = async (event) => {
  if (event.blobs) connectLambda(event); // Drive copies read the stored files from Netlify Blobs
  const body = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : event.body || '';
  const data = verify(body, event.headers?.['x-signature']);
  if (!data) return { statusCode: 403, body: 'Forbidden' };
  await runTasks(Array.isArray(data.tasks) ? data.tasks : []);
  return { statusCode: 200, body: 'ok' };
};
