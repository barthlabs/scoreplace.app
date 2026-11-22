'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const LEGACY_FILES = ['court-capability-digest.js', 'index.js', 'monarch-court-series.js'].sort();
const FILES = [...LEGACY_FILES, 'tournament-create.js', 'tournament-summary-core.js',
  'tournament-summary-reconcile.js', 'vendor/tournaments-utils.js'].sort();

function fsReader(file) { return fs.readFileSync(file); }

function digestFiles(directory, files, reader) {
  const hash = crypto.createHash('sha256');
  hash.update('target=endMatchOnCourt\nruntime=node\nprotocol=per-monarch-end-court-v2\n');
  for (const name of files) {
    hash.update(name + '\0');
    hash.update(reader(path.join(directory, name), name));
    hash.update('\0');
  }
  return hash.digest('hex');
}

function digestFor(directory, reader = fsReader) {
  return digestFiles(directory, FILES, reader);
}

module.exports = { FILES, LEGACY_FILES, digestFor, digestFiles };
