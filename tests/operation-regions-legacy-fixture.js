'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { sourceDescriptor, sourceDigest } = require('../scripts/operation-source-digest');

const root = path.join(__dirname, '..');
const release = '40be907dfc593db2eb4de1d6ed9783493b301787';

function git(args) {
  return spawnSync('git', args, { cwd: root, encoding: 'utf8' });
}

function legacyFixtureAvailability() {
  const ancestry = git(['rev-list', '--parents', '-n', '1', release]);
  const parts = ancestry.status === 0 ? ancestry.stdout.trim().split(/\s+/) : [];
  if (parts.length !== 2 || parts[0] !== release) {
    return { parent: null, skipReason: 'corte regional sem pai único no histórico Git' };
  }
  const parent = parts[1];
  if (git(['cat-file', '-e', `${parent}^{commit}`]).status !== 0) {
    return { parent: null, skipReason: 'pai do corte regional ausente no histórico Git' };
  }
  for (const codebase of ['functions', 'functions-autodraw']) {
    if (git(['cat-file', '-e', `${parent}:${codebase}`]).status !== 0) {
      return { parent: null, skipReason: `árvore ${codebase} ausente no pai do corte regional` };
    }
  }
  return { parent, skipReason: false };
}

function legacyFixtureRows(rows, parent) {
  if (!rows.every(row => row.commit === release)) return rows;
  if (!parent) throw new Error('pai histórico necessário para derivar a fixture regional');
  const descriptors = new Map();
  return rows.map(row => {
    const key = `${row.codebase}:${parent}`;
    if (!descriptors.has(key)) descriptors.set(key, sourceDescriptor(row.codebase, parent, true));
    return {
      ...row,
      commit: parent,
      sourceDigest: sourceDigest(row.target, parent, descriptors.get(key)),
    };
  });
}

module.exports = { legacyFixtureAvailability, legacyFixtureRows };
