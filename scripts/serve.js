#!/usr/bin/env node
// Preview the gallery locally:  npm run serve   (or: node scripts/serve.js 8080)
const path = require('path');
const { startServer } = require('./lib/server');

const port = Number(process.argv[2] || process.env.PORT || 8080);
startServer(path.join(__dirname, '..'), port).then(({ url }) => {
  console.log(`Gallery running at ${url.replace('127.0.0.1', 'localhost')}  (Ctrl+C to stop)`);
});
