'use strict';
/* A pílula de atualização é uma afirmação operacional: ela só pode existir se
 * version.txt já provou que a versão remota difere do JS rodando. Esta rede fixa
 * o relato 2.3.315: controller novo, app já atualizado, botão ainda aparecendo. */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
let ok = 0;
function must(condition, message) { assert.ok(condition, message); ok++; console.log('  ✓ ' + message); }

console.log('\n──── atualização só com versão remota comprovada ────\n');
const root = path.join(__dirname, '..');
const store = fs.readFileSync(path.join(root, 'js', 'store.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const startPill = store.indexOf('window._showUpdatePill = function()');
const endPill = store.indexOf('window._applyUpdate = function', startPill);
const pill = store.slice(startPill, endPill);
must(startPill > 0 && /if \(!window\._hasProvenUpdatePending\(\)\)/.test(pill),
  'a pílula recusa renderizar sem uma versão pendente comprovada');
must(/var stale = document\.getElementById\('sp-update-pill'\);[\s\S]{0,120}?stale\.remove\(\)/.test(pill),
  'uma pílula residual é removida quando a prova deixa de existir');

const predicate = store.slice(store.indexOf('window._hasProvenUpdatePending = function'), startPill);
must(/pending !== running/.test(predicate) && /pending\.length < 40/.test(predicate),
  'a prova exige identificador remoto válido e diferente da versão rodando');

const checkStart = store.indexOf('window._checkForUpdate = function');
const check = store.slice(checkStart, store.indexOf('// 1. No load inicial', checkStart));
must(/if \(window\._updateCheckInFlight\) \{[\s\S]{0,180}?window\._updateCheckQueued = true/.test(check),
  'uma sonda forçada enquanto há outra em voo é coalescida');
must(/window\._updateCheckInFlight = _probe;[\s\S]{0,500}?window\._updateCheckQueued = false;[\s\S]{0,180}?_checkForUpdate\(\{ force: true \}\)/.test(check),
  'a repetição coalescida consulta a versão novamente após a primeira resposta');
must(/if \(v === window\.SCOREPLACE_VERSION\) \{[\s\S]{0,700}?_pillAtualizada\.remove\(\)/.test(check),
  'versão remota igual remove a pílula mesmo se um evento anterior a deixou na tela');

const i = html.indexOf("addEventListener('controllerchange'");
const body = html.slice(i, html.indexOf('\n        });', i));
must(i > 0 && /_checkForUpdate\(\{ force: true, source: 'controllerchange' \}\)/.test(body),
  'controllerchange só delega a decisão para a sonda canônica');
must(!/_showUpdatePill\s*\(|_pendingUpdateReload\s*=\s*true|window\.location\.reload\s*\(/.test(body),
  'controllerchange não pode recriar o falso positivo nem recarregar por suposição');

console.log('\n✅ ' + ok + ' verificações');
