'use strict';
/* ⭐ 2.3.82 · Relato do dono (18/set/2026): na chave da Confra, toque longo no card da
   lista de espera levantava o balão "👤 Nome" — sem vaga "Jogador NN" para soltar.
   O arraste "ocupar vaga" só pode existir quando há vaga. Duas portas usam a mesma régua:
   quem renderiza o handle (bracket.js) e quem arma o gesto (tournaments-org-tools.js). */
const assert = require('assert/strict'), fs = require('fs'), path = require('path');
const H = require('./render-harness');
const W = H.window;
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let ok = 0; const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };
require('vm').runInContext(read('js/views/tournaments-org-tools.js'), H.sandbox, { filename: 'tournaments-org-tools.js' });
must(typeof W._chaveTemVaga === 'function', 'a régua única existe');
const confra = { matches: [{ id: 'a', p1: 'Roberta Rocchi / Camila Putignani', p2: 'Erika de Paula / loraine soares' }, { id: 'b', p1: 'Mariana Ciocci / Arnaldo Menezes', p2: 'Daniel Oliveira / Monica Rosenburg' }] };
must(W._chaveTemVaga(confra) === false, 'Confra (0 vagas): NÃO há vaga — o arraste não nasce');
must(W._chaveTemVaga({ matches: [{ id: 'c', p1: 'Ana / Jogador 12', p2: 'Bia / Cris' }] }) === true, 'dupla com "Jogador 12" em jogo aberto: há vaga');
must(W._chaveTemVaga({ matches: [{ id: 'd', p1: 'Jogador 3', p2: 'Bia' }] }) === true, 'individual "Jogador 3": há vaga');
must(W._chaveTemVaga({ matches: [{ id: 'e', p1: 'Jogador 3', p2: 'Bia', winner: 'Bia' }] }) === false, 'vaga em jogo já decidido não conta');
must(W._chaveTemVaga(null) === false && W._chaveTemVaga({}) === false, 'sem torneio/sem jogos: sem vaga');
const bracket = read('js/views/bracket.js');
const org = read('js/views/tournaments-org-tools.js');
const iAttr = bracket.indexOf('const _phDragAttrs = (');
const linhaAttr = bracket.slice(iAttr, bracket.indexOf('\n', iAttr));
must(/_chaveTemVaga\(t\)/.test(linhaAttr), 'porta 1 — o handle só é renderizado quando há vaga');
const iWire = org.indexOf('window._wirePlaceholderDnD = function');
const corpoWire = org.slice(iWire, org.indexOf("querySelectorAll('[data-ph-drag]')", iWire));
must(/_chaveTemVaga\(t\)\) return;/.test(corpoWire), 'porta 2 — o gesto não é armado sem vaga (o irmão do handle)');
console.log('\n✅ arraste de vaga só existe com vaga — ' + ok + ' verificações');
