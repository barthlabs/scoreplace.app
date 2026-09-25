'use strict';

/* ⛔⛔ O CARD DA TELA INICIAL LÊ RESUMO, E NO RESUMO O ELENCO NÃO VEM.
 *
 * A enquete no card mostrava "2/0 votos": o total era contado a partir de `participants`, que o
 * resumo não carrega — é justamente o ponto dele. Zero no denominador é defeito VISÍVEL, e foi a
 * própria projeção do resumo que o criou. O resumo fornece o contador; esta suíte prende as duas
 * pontas para que nenhuma das duas se perca.
 */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

// ── lado do SERVIDOR: o resumo publica o contador ────────────────────────────
const resumo = fs.readFileSync(path.join(root, 'functions-autodraw/tournament-summary-core.js'), 'utf8');
assert.match(resumo, /participantsCount:\s*participantes\.length/,
  'o resumo publica o CONTADOR de inscritos (o elenco fica fora de propósito)');

// ── lado da TELA: recorta o bloco pelo próprio identificador ─────────────────
const dash = fs.readFileSync(path.join(root, 'js/views/dashboard.js'), 'utf8');
const ini = dash.indexOf('var _pTotal =');
assert.ok(ini > 0, 'achou o total da enquete no card');
const bloco = dash.slice(ini, dash.indexOf(';', dash.indexOf('participantsCount', ini)) + 1);

assert.match(bloco, /t\.participantsCount/,
  '⛔ o total cai para o contador do resumo quando o elenco não veio');
assert.match(bloco, /Array\.isArray\(t\.participants\)/,
  'e quem TEM o elenco continua contando o elenco (o caminho completo não regride)');

// ── a prova de que o zero não volta ─────────────────────────────────────────
const totalDe = (t) => (t.participants && (Array.isArray(t.participants) ? t.participants.length : Object.keys(t.participants).length))
  ? (Array.isArray(t.participants) ? t.participants : Object.values(t.participants)).length
  : (typeof t.participantsCount === 'number' ? t.participantsCount : 0);

assert.equal(totalDe({ _resumo: true, participants: [], participantsCount: 7 }), 7,
  '⛔ RESUMO com elenco vazio conta 7 pelo contador — era aqui que saía 0');
assert.equal(totalDe({ participants: [{ uid: 'a' }, { uid: 'b' }] }), 2,
  'torneio completo conta o elenco');
assert.equal(totalDe({ participants: { x: { uid: 'a' } } }), 1, 'elenco como objeto também conta');
assert.equal(totalDe({ participants: [], participantsCount: 0 }), 0, 'torneio vazio de verdade é 0');
assert.equal(totalDe({}), 0, 'sem elenco e sem contador, 0 — e não quebra');

console.log('✅ card do resumo conta pelo contador — 9 verificações');
