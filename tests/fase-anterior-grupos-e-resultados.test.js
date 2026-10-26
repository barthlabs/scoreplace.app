'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const H = require('./render-harness');
const W = H.window;

const source = fs.readFileSync(path.join(__dirname, '../js/views/bracket.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../css/bracket.css'), 'utf8');
assert.match(source, /class="bracket-phase-reveal-scope"/, 'fase anterior participa do layout lateral');
assert.match(source, /class="bracket-previous-phase-button"/, 'controle da fase anterior fica à esquerda');
assert.match(css, /\.bracket-previous-round-button,\s*\.bracket-previous-phase-button\s*\{/, 'fase e rodada usam o mesmo estilo vertical');
assert.match(source, /window\._bracketPresentation !== 'chaves'/, 'Condensado é o padrão até escolher Expandido');
assert.match(source, /window\._renderPhase0ReadOnly\(t\)/, 'fase zero histórica abre apenas para consulta');
assert.match(source, /_renderPhaseBracket\(t, _ppi === 0 \? false : canEnterResult, '', _ppi\)/,
  'fallback da fase zero também não habilita lançamento');

const t = H.hydrateMonarchGroups(H.buildViaDraw('Liga', 8, {
  ligaRoundFormat: 'rei_rainha', drawMode: 'rei_rainha', drawManual: true
}));
H.simulateRounds(t);
t.phases = [
  { name: 'Rei/Rainha', kind: 'classification', drawMode: 'rei_rainha' },
  { name: 'Eliminatória', kind: 'elimination' }
];
t.currentPhaseIndex = 1;
t.matches = [{ id: 'elim-1', phaseIndex: 1, bracket: 'main', round: 1, p1: 'J1', p2: 'J2' }];
const before = JSON.stringify({ rounds: t.rounds, matches: t.matches, groups: t.groups });
const resultSnapshot = () => JSON.stringify({
  rounds: t.rounds.map(r => (r.matches || []).map(m => ({ id: m.id, p1: m.p1, p2: m.p2, winner: m.winner, scoreP1: m.scoreP1, scoreP2: m.scoreP2 }))),
  matches: t.matches.map(m => ({ id: m.id, p1: m.p1, p2: m.p2, winner: m.winner, scoreP1: m.scoreP1, scoreP2: m.scoreP2 }))
});
const resultsBefore = resultSnapshot();
const html = W._renderPhase0ReadOnly(t, false);
assert.match(html, /data-group-box/, 'fase histórica mostra grupos');
assert.match(html, /card-/, 'fase histórica mostra jogos e resultados');
assert.match(html, /Classificação do grupo/, 'fase histórica mostra classificação');
assert.equal(JSON.stringify({ rounds: t.rounds, matches: t.matches, groups: t.groups }), before,
  'consultar fase histórica não reescreve resultados ou confrontos');
assert.equal(t.currentPhaseIndex, 1, 'fase atual não muda');
const container = { innerHTML: '', querySelector: () => null, querySelectorAll: () => [], style: {} };
W._phasePrevOpen[t.id] = false;
W.renderBracket(container, t.id, false);
assert.match(container.innerHTML, /class="bracket-previous-phase-button" aria-expanded="false"/, 'controle lateral inicia fechado');
W._phasePrevOpen[t.id] = true;
W.renderBracket(container, t.id, false);
assert.match(container.innerHTML, /class="bracket-previous-phase-button" aria-expanded="true"/, 'fase aberta preserva estado após re-render');
assert.match(container.innerHTML, /data-group-box/, 'fase anterior aberta mostra grupos na tela real');
assert.match(container.innerHTML, /Classificação do grupo/, 'fase anterior aberta mostra resultados e classificação na tela real');
assert.match(container.innerHTML, /card-elim-1/, 'fase atual permanece visível ao lado da histórica');
assert.equal(resultSnapshot(), resultsBefore,
  'alternar e re-renderizar as fases não modifica confrontos ou resultados');
console.log('fase-anterior-grupos-e-resultados: 17 verificações passaram');
