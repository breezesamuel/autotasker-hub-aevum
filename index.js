/**
 * AutoTasker Hub v4 — Serverless Entry Point (single function)
 * Loads the full x402-v4 server and runs it on Vercel edge.
 */
const path = require('path');
process.chdir(path.resolve(__dirname));
require('./api/x402-v4.js');
