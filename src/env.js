'use strict';

// True when running on Netlify (functions run on AWS Lambda; NETLIFY is set during builds).
const HOSTED = Boolean(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT);

module.exports = { HOSTED };
