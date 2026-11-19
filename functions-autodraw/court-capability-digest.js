'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const FILES = ['court-capability-digest.js', 'index.js', 'monarch-court-series.js'].sort();

function digestFor(directory) {
  const hash = crypto.createHash('sha256');
  hash.update('target=endMatchOnCourt\nruntime=node\nprotocol=per-monarch-series-mode-v1\n');
  for (const name of FILES) {
    hash.update(name + '\0');
    hash.update(fs.readFileSync(path.join(directory, name)));
    hash.update('\0');
  }
  return hash.digest('hex');
}

module.exports = { FILES, digestFor };
