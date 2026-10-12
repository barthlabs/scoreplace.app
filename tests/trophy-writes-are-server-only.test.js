/* Regressão: recompensa não é dado que o navegador pode fabricar. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const client = fs.readFileSync(path.join(root, 'js/trophies.js'), 'utf8');
const bridge = fs.readFileSync(path.join(root, 'js/firebase-db.js'), 'utf8');
const functions = fs.readFileSync(path.join(root, 'functions/index.js'), 'utf8');
const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');

assert.ok(/reconcileOwnTrophies/.test(bridge), 'o cliente precisa da porta de reconciliação');
assert.ok(/exports\.reconcileOwnTrophies\s*=\s*onCall/.test(functions), 'a porta precisa ser callable');
assert.ok(/_reconcileTrophiesForUser\(db, uid, profile\.data\(\) \|\| \{\}, "self"\)/.test(functions),
  'a porta só pode calcular pelo próprio perfil canônico');
assert.ok(!/collection\('trophies'\)[\s\S]{0,120}\.(?:set|delete)\(/.test(client),
  'o navegador não pode gravar ou apagar troféus');
assert.ok(!/collection\('milestones'\)[\s\S]{0,120}\.set\(/.test(client),
  'o navegador não pode gravar marcos');
assert.ok(/match \/trophies\/\{trophyId\}[\s\S]{0,260}allow write: if false;/.test(rules),
  'Rules deve fechar escrita direta de troféus');
assert.ok(/match \/milestones\/\{milestoneId\}[\s\S]{0,260}allow write: if false;/.test(rules),
  'Rules deve fechar escrita direta de marcos');

console.log('✓ troféus e marcos só são mutados pelo servidor');
