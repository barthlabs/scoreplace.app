'use strict';
/* ⛔ A LISTA DE ESPERA USA O CARD CANÔNICO — NÃO UMA LINHA FEITA À MÃO.
 * Ordem do dono (12/set/2026): _"os cards da lista de espera deveriam ser canônicos e como
 * estão aqui os do W.O."_ e, olhando o painel: _"não são cards afinal"_.
 * Era verdade: inativos, W.O., duplas e o elenco inteiro usam `_inscritoIndividualCard`; só a
 * espera montava à mão uma linha achatada (bolinha + nome + toggle + botão). Geometria paralela
 * é a que diverge na primeira mudança — foi assim que os cards de inativos apareceram "todos com
 * 1 de inscrição" duas levas atrás.
 * Este teste RENDERIZA o painel de verdade e confere o que não pode se perder na troca.
 * [[project_card_de_jogo_geometria_canon]] · [[project_inscrito_card_canonical]]
 */
const assert = require('assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const { sandbox } = require('./render-harness');
// o painel usa o card canônico, que mora em participants.js — o harness de render não o carrega
vm.runInContext(fs.readFileSync(path.join(root, 'js/views/participants.js'), 'utf8'), sandbox,
  { filename: 'participants.js' });
const W = sandbox;
let ok = 0; const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };

const t = {
  id: 'tour_x', name: 'T', format: 'Fase de Grupos', sport: 'Beach Tennis',
  participants: [{ uid: 'u-a', name: 'Ana' }, { uid: 'u-b', name: 'Bia' }],
  standbyParticipants: [{ uid: 'u-adriana', name: 'Adriana Rosa' }, { uid: 'u-eliane', name: 'Eliane Cinelli' }],
  checkedIn: {}, absent: {}, matches: [{ id: 'm1', p1: 'Ana', p2: 'Bia' }], phases: [{ name: 'F1' }],
  woLog: [], woClaims: []
};
const html = W._renderStandbyPanel(t, true);

// ── ① é o card canônico, para cada pessoa da fila ───────────────────────────
must(/participant-card/.test(html), '① ⭐ o painel emite o CARD canônico (`participant-card`)');
must((html.match(/participant-card/g) || []).length >= 2,
  '① um por pessoa na espera — contados ' + (html.match(/participant-card/g) || []).length);
must(/Adriana Rosa/.test(html) && /Eliane Cinelli/.test(html), '① com os nomes de quem está na fila');

// ── ② nada do que a linha à mão fazia se perdeu ─────────────────────────────
must(/toggle-switch/.test(html), '② o toggle de presença continua no card');
must(/_markAbsent|Aplicar W\.O\./.test(html), '② e o "Aplicar W.O." também');
must(/na fila/.test(html), '② ⭐ a POSIÇÃO NA FILA continua visível — o número do card é o de INSCRIÇÃO, não o da fila');
must(/data-players="[^"]*Adriana Rosa/.test(html) && /data-player-uids="[^"]*u-adriana/.test(html),
  '② e a busca do painel continua enxergando quem está na fila (nome E uid no wrapper)');

// ── ③ a cor diz o estado, dos dois lados ────────────────────────────────────
must(/245,\s*158,\s*11/.test(html), '③ quem espera vaga sai em ÂMBAR');

// ── ④ a linha achatada não volta ────────────────────────────────────────────
const BRK = fs.readFileSync(path.join(root, 'js/views/bracket.js'), 'utf8');
const ini = BRK.indexOf('  const listItems = _solosWL.map((p, i) => {');
const fim = BRK.indexOf("  }).join('');", ini);
assert.ok(ini > 0 && fim > ini, 'âncoras da lista de solos');
const bloco = BRK.slice(ini, fim);
must(/window\._inscritoIndividualCard\(t, p, i, \{/.test(bloco),
  '④ a lista chama o card canônico com a pessoa e o índice dela');
must(!/border-left:4px solid/.test(bloco), '④ ⛔ e o estilo da linha achatada não ficou pra trás');
must(/skip: false/.test(BRK.slice(BRK.indexOf('const _presencaWL'), ini)),
  '④ ⛔ o filtro da CHAMADA não apaga ninguém da fila — `skip` é neutralizado aqui');

console.log('✅ ' + ok + ' asserções — a espera usa o card canônico, com fila, presença e W.O.');
