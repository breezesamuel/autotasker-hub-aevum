/**
 * Vercel Serverless Entry Point (single function)
 *
 * IMPORTANT: Vercel treats every .js file inside `api/` as its own Serverless
 * Function. On the Hobby plan the hard limit is 12 functions per deployment, so
 * all server code lives in `lib/` (plain modules, not functions) and only this
 * single `index.js` is deployed as a function.
 *
 * We never call app.listen() here — Vercel invokes the exported handler.
 */
const path = require('path');

process.chdir(path.resolve(__dirname));

const app = require('./lib/x402-v4.js');

module.exports = app;
