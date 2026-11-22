'use strict';

const { execFileSync } = require('node:child_process');

function git(root, args) {
  return execFileSync('git', args, { cwd:root, encoding:'utf8' }).trim();
}

function ultimoAutodrawImplantavel(root, gitCommand = args => git(root, args)) {
  let commits;
  try { commits = gitCommand(['log', '--format=%H', '--', 'functions-autodraw']).split('\n').filter(Boolean); }
  catch (_) { return null; }
  for (const sha of commits) {
    let changed = [];
    try { changed = gitCommand(['diff-tree', '--no-commit-id', '--name-only', '-r', sha]).split('\n').filter(Boolean); }
    catch (_) { continue; }
    if (changed.some(file => file.startsWith('functions-autodraw/') &&
      !/^functions-autodraw\/test-[^/]+\.js$/.test(file))) return sha;
  }
  return '';
}

function mesmoAutodrawPublicado(root, backendCommit, execFile = execFileSync) {
  if (!/^[a-f0-9]{40}$/i.test(backendCommit || '')) return false;
  try {
    execFile('git', ['merge-base', '--is-ancestor', backendCommit, 'HEAD'], { cwd:root, stdio:'ignore' });
    execFile('git', ['diff', '--quiet', backendCommit, 'HEAD', '--', 'functions-autodraw'], { cwd:root, stdio:'ignore' });
    return true;
  } catch (_) { return false; }
}

module.exports = { ultimoAutodrawImplantavel, mesmoAutodrawPublicado };
