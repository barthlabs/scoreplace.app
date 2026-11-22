#!/usr/bin/env node
'use strict';

const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { FILES, LEGACY_FILES, digestFor, digestFiles } = require('../functions-autodraw/court-capability-digest');

function filesFromTar(tar, requiredFiles = FILES) {
  const files = new Map();
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) break;
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
    const prefix = header.subarray(345, 500).toString('utf8').replace(/\0.*$/, '');
    const archivePath = prefix ? `${prefix}/${name}` : name;
    const sizeText = header.subarray(124, 136).toString('ascii').replace(/\0.*$/, '').trim();
    const size = parseInt(sizeText || '0', 8);
    if (!Number.isSafeInteger(size) || size < 0) throw new Error(`tamanho inválido no archive: ${archivePath}`);
    const dataStart = offset + 512;
    if (dataStart + size > tar.length) throw new Error(`archive truncado em ${archivePath}`);
    if (archivePath.startsWith('functions-autodraw/')) {
      const relative = archivePath.slice('functions-autodraw/'.length);
      if (requiredFiles.includes(relative)) {
        if (files.has(relative)) throw new Error(`arquivo duplicado no archive: ${relative}`);
        files.set(relative, tar.subarray(dataStart, dataStart + size));
      }
    }
    offset = dataStart + Math.ceil(size / 512) * 512;
  }
  const missing = requiredFiles.filter(file => !files.has(file));
  if (missing.length) throw new Error(`archive sem fontes centrais: ${missing.join(', ')}`);
  return files;
}

function archiveFilesForCommit(commit, root) {
  if (!/^[a-f0-9]{40}$/.test(commit || '')) throw new Error('commit central inválido');
  const tar = execFileSync('git', ['archive', '--format=tar', commit, 'functions-autodraw'], {
    cwd:root, maxBuffer:64 * 1024 * 1024
  });
  return filesFromTar(tar);
}

function digestForCommit(commit, root = path.join(__dirname, '..')) {
  const files = archiveFilesForCommit(commit, root);
  return digestFor('functions-autodraw', (_file, relative) => {
    const bytes = files.get(relative);
    if (!bytes) throw new Error(`fonte central ausente no archive: ${relative}`);
    return bytes;
  });
}

// Only for verifying the already-published three-file protocol before the first
// seven-file rollout. New readiness and deployment paths always use digestForCommit.
function legacyDigestForCommit(commit, root = path.join(__dirname, '..')) {
  if (!/^[a-f0-9]{40}$/.test(commit || '')) throw new Error('commit central inválido');
  const tar = execFileSync('git', ['archive', '--format=tar', commit, 'functions-autodraw'], {
    cwd:root, maxBuffer:64 * 1024 * 1024
  });
  const files = filesFromTar(tar, LEGACY_FILES);
  return digestFiles('functions-autodraw', LEGACY_FILES, (_file, relative) => files.get(relative));
}

if (require.main === module) {
  try { process.stdout.write(digestForCommit(process.argv[2]) + '\n'); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { filesFromTar, digestForCommit, legacyDigestForCommit };
