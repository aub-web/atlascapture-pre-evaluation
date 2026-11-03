'use strict';

// Netlify Function running the Express API. netlify.toml rewrites /api/*, /site-login and /healthz here.

const serverless = require('serverless-http');
const { connectLambda } = require('@netlify/blobs');
const { app } = require('../../src/app');

const handle = serverless(app, {
  basePath: '/.netlify/functions/api',
  binary: false,
  // serverless-http hands Express a request whose socket reads as finished, so Express's body
  // parsers skip it. Parse the body here instead; the app's parsers skip requests marked this way.
  request(req) {
    const raw = req.body;
    const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw || '');
    const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    try {
      if (type === 'application/json') req.body = buf.length ? JSON.parse(buf.toString('utf8')) : {};
      else if (type === 'application/x-www-form-urlencoded') req.body = Object.fromEntries(new URLSearchParams(buf.toString('utf8')));
      else req.body = buf;
    } catch {
      req.body = {};
    }
    req.parsedByHost = true;
  },
});

exports.handler = async (event, context) => {
  // Gives @netlify/blobs its credentials in Lambda-style functions (Netlify adds event.blobs).
  if (event.blobs) connectLambda(event);
  return handle(event, context);
};
