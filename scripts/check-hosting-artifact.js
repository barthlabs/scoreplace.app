#!/usr/bin/env node
/* Confere o único diretório que o Firebase Hosting pode publicar.
 * Fonte e artefato ficam separados: o Hosting não recebe o repositório, e o pacote
 * Capacitor continua sem version.txt para que seu auto-update consulte a rede. */
'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { verify } = require('./check-web-entry-contract');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'www');
const required = ['index.html', 'sw.js', 'manifest.json', 'version.txt', 'ext-version.txt',
  'native-update-policy.json', 'favicon.ico', '.vite/manifest.json', '.scoreplace-build.json'];
const forbidden = ['tests', 'scripts', 'tools', 'functions', 'functions-autodraw',
  'functions-stripe', 'android', 'ios', 'docs', 'infra', 'node_modules'];
let checks = 0;
const must = (value, message) => { assert.ok(value, message); checks++; console.log('  ✓ ' + message); };

console.log('──── artefato do Hosting ────');
must(fs.existsSync(OUT), '`www/` foi gerado antes da conferência');
required.forEach((file) => must(fs.existsSync(path.join(OUT, file)), '`www/' + file + '` existe'));
forbidden.forEach((dir) => must(!fs.existsSync(path.join(OUT, dir)), '`www/` não carrega `' + dir + '/`'));
must(fs.readFileSync(path.join(OUT, 'version.txt'), 'utf8') === fs.readFileSync(path.join(ROOT, 'version.txt'), 'utf8'),
  '`version.txt` publicado é a versão gerada nesta mesma fonte');
must(fs.readFileSync(path.join(OUT, 'ext-version.txt'), 'utf8') === fs.readFileSync(path.join(ROOT, 'ext-version.txt'), 'utf8'),
  '`ext-version.txt` publicado é a versão gerada nesta mesma fonte');
must(verify(OUT, { log() {}, error(message) { throw new Error(message); } }),
  'o shell do artefato resolve todos os recursos locais e preserva dependências');
console.log('✅ ' + checks + ' verificações — Hosting serve somente o artefato Vite');
