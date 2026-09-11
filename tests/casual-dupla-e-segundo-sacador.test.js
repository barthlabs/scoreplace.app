'use strict';
/* PARTIDA CASUAL — dois defeitos relatados pelo dono na nativa 2.2.8 (11/set/2026), corrigidos
 * contra o CÓDIGO REAL (fatia do arquivo rodando em VM, nunca cópia):
 *
 * ① Formou a dupla com o "Jogador 4" e na tela seguinte o parceiro virou "Jogador 2". A divisão
 *    estava certa; o RÓTULO é que era recalculado pela posição DENTRO do time. Para slot anônimo
 *    o rótulo é a identidade — a dupla parecia outra.
 * ② Entre o 1º e o 2º game o app não perguntava quem saca. O `liveState` não levava
 *    `secondServerPicked`, e o eco da PRÓPRIA escrita (a gravação local não avança `_lastSyncTs`)
 *    marcava o flag como `true` só porque havia rotação.
 */
const assert = require('assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'js/views/bracket-ui.js'), 'utf8');
function fatia(de, ate, incluirFim) {
  const i = src.indexOf(de); assert.ok(i >= 0, 'âncora inicial: ' + de);
  const j = src.indexOf(ate, i); assert.ok(j > i, 'âncora final: ' + ate);
  return src.slice(i, incluirFim ? j + ate.length : j);
}
let ok = 0;
const must = (v, m) => { assert.ok(v, m); ok++; };

// ── ① o rótulo do placeholder sai da CAIXA DO SETUP (p.slot), não da posição no time ──
{
  const corpo = fatia('    function _renameRoles() {', '\n    // Sortear ON:');
  function roda(players, cu) {
    const ctx = { players: players, cu: cu, console };
    // `_isCurrentUser` real também entra na fatia? Não: ele vive logo acima — aqui basta a
    // identidade por uid, que é o que o original usa.
    vm.runInNewContext(corpo + '\n_isCurrentUser = function (p) { return !!(cu && p && p.uid && p.uid === cu.uid); };\n_renameRoles();',
      Object.assign(ctx, { _isCurrentUser: null }));
    return ctx.players;
  }
  // o caso do dono: dupla formada entre o slot 0 (ele) e o slot 3
  const dono = { uid: 'u-dono', displayName: 'Rodrigo Barth' };
  var jogadores = [
    { slot: 0, name: 'Rodrigo Barth', uid: 'u-dono', team: 1 },
    { slot: 1, name: '', uid: null, team: 2 },
    { slot: 2, name: '', uid: null, team: 2 },
    { slot: 3, name: '', uid: null, team: 1 }
  ];
  var out = roda(jogadores, dono);
  const porSlot = {}; out.forEach(function (p) { porSlot[p.slot] = p.name; });
  must(porSlot[3] === 'Jogador 4', '⛔ o parceiro do slot 4 continua "Jogador 4" (era "Jogador 2")');
  must(porSlot[1] === 'Jogador 2' && porSlot[2] === 'Jogador 3', 'os adversários mantêm os números das caixas deles');
  must(out.filter(function (p) { return p.team === 1; }).length === 2, 'a divisão em si não foi tocada');

  // nome digitado não é reescrito
  var comNome = roda([
    { slot: 0, name: 'Rodrigo Barth', uid: 'u-dono', team: 1 },
    { slot: 1, name: 'Kelly', uid: null, team: 2 },
    { slot: 2, name: 'Toninho', uid: null, team: 2 },
    { slot: 3, name: 'Michele', uid: null, team: 1 }
  ], dono);
  must(comNome.map(function (p) { return p.name; }).join('/') === 'Rodrigo Barth/Kelly/Toninho/Michele',
    'nome digitado passa intacto');

  // documento antigo, sem `slot`: cai na reserva por índice (comportamento de antes)
  var semSlot = roda([
    { name: 'Rodrigo Barth', uid: 'u-dono', team: 1 }, { name: '', uid: null, team: 1 },
    { name: '', uid: null, team: 2 }, { name: '', uid: null, team: 2 }
  ], dono);
  must(semSlot[1].name === 'Jogador 2' && semSlot[2].name === 'Jogador 3' && semSlot[3].name === 'Jogador 4',
    'sem `slot` a numeração antiga por índice continua valendo');
}

// ── ② o flag do 2º sacador viaja no estado e não é mais adivinhado ──
{
  must(/secondServerPicked: !!state\.secondServerPicked/.test(src),
    '⛔ `secondServerPicked` precisa ir no liveState — sem isso o outro lado adivinha');
  const corpo = fatia('  function _applyRemoteState(remote) {', '\n    _localizeRoleLabels();\n  }', true);
  function aplica(remote, inicial) {
    const state = Object.assign({ sets: [], serveOrder: [], secondServerPicked: false }, inicial || {});
    const ctx = { state: state, _courtLeft: null, _matchStartTime: null, _matchEndTime: null,
      p1Players: ['A', 'B'], p2Players: ['C', 'D'], console, _localizeRoleLabels: function () {} };
    vm.runInNewContext(corpo + '\n_applyRemoteState(remote);', Object.assign(ctx, { remote: remote }));
    return ctx.state;
  }
  const rotacao = [{ team: 1, name: 'A' }, { team: 2, name: 'C' }, { team: 1, name: 'B' }, { team: 2, name: 'D' }];
  must(aplica({ _ts: 1, serveOrder: rotacao, totalGamesPlayed: 1, secondServerPicked: false }).secondServerPicked === false,
    '⛔ o eco da própria escrita NÃO pode marcar o 2º sacador como escolhido');
  must(aplica({ _ts: 1, serveOrder: rotacao, totalGamesPlayed: 1, secondServerPicked: true }).secondServerPicked === true,
    'quando o estado diz que foi escolhido, é respeitado');
  must(aplica({ _ts: 1, serveOrder: rotacao, totalGamesPlayed: 1 }).secondServerPicked === false,
    'documento ANTIGO (sem o campo) no 1º game: a pergunta ainda cabe');
  must(aplica({ _ts: 1, serveOrder: rotacao, totalGamesPlayed: 2 }).secondServerPicked === true,
    'documento ANTIGO com 2 games jogados: a pergunta já não cabe — inferência conservadora');
}

console.log('✅ casual: ' + ok + ' asserções — rótulo colado na caixa do setup e 2º sacador perguntado de novo');
