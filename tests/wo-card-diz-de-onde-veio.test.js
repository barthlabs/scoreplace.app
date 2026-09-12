'use strict';
/* ⛔ O CARD DE W.O. DIZ DE ONDE A PESSOA VEIO — E PELA FONTE DURÁVEL.
 * Relato do dono (12/set/2026, painel de W.O. do Confra): _"alguns W.O. não estão indicando de
 * onde a pessoa veio (em que grupo estava quando tomou o W.O.)"_. No print: Thereza e marcia com
 * "Grupo anterior: R1 Grupo W/C", Claudia sem nada.
 * A causa: o card lia SÓ `t.woClaims` — a trilha do SERVIDOR, que nasceu depois. Quem levou W.O.
 * por um caminho que não gravou claim ficava sem origem, embora o fato esteja gravado em
 * `t.woLog` (registro append-only, com leitor canônico `_woLogGrupoDoWo`).
 * ⛔ E a cor do card passa a dizer o estado: fora da disputa = VERMELHO; esperando vaga = âmbar.
 * [[project_wo_e_do_grupo_onde_aconteceu]]
 */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert/strict');
const root = path.join(__dirname, '..');
const { sandbox } = require('./render-harness');
vm.runInContext(fs.readFileSync(path.join(root, 'js/views/wo-log.js'), 'utf8'), sandbox, { filename: 'wo-log.js' });
const W = sandbox;
const BRK = fs.readFileSync(path.join(root, 'js/views/bracket.js'), 'utf8');
const PART = fs.readFileSync(path.join(root, 'js/views/participants.js'), 'utf8');
let ok = 0; const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };

// ── ① o registro sabe responder — inclusive para quem não tem claim ─────────
const t = { id: 'tour_x', woLog: [], woClaims: [{ absentUids: ['u-thereza'], absentName: 'Thereza', groupName: 'R1 Grupo W' }] };
W._woLogAdd(t, { roundIndex: 0, groupName: 'Grupo C', absentUid: 'u-claudia', absentName: 'Claudia Kohl Pessoal' }, '2026-09-01T10:00:00.000Z');
const claudia = W._woLogGrupoDoWo(t, 'u-claudia', 'Claudia Kohl Pessoal');
must(claudia && claudia.groupName === 'Grupo C',
  '① o REGISTRO responde por quem não tem claim nenhum (Claudia → Grupo C)');
must(W._woLogGrupoDoWo(t, 'u-ninguem', 'Fulano') === null, '① e não inventa origem para quem não tem W.O.');
W._woLogRevert(t, { roundIndex: 0, groupName: 'Grupo C', absentUid: 'u-claudia', absentName: 'Claudia Kohl Pessoal' }, '2026-09-02T10:00:00.000Z');
must(W._woLogGrupoDoWo(t, 'u-claudia', 'Claudia Kohl Pessoal') === null,
  '① W.O. revertido deixa de ser origem — o card não mostra um fato desfeito');

// ── ② o card pergunta ao registro ANTES do claim ────────────────────────────
const ini = BRK.indexOf('    var _linha = function (pp, isWo) {');
const fim = BRK.indexOf("var _origem = _grupoOrigem", ini);
assert.ok(ini > 0 && fim > ini, 'âncoras do card de W.O.');
const bloco = BRK.slice(ini, fim);
must(bloco.indexOf('window._woLogGrupoDoWo') > 0, '② o card usa o leitor canônico do registro');
// ⛔ comparar CÓDIGO, não comentário: o texto explicativo cita as duas fontes e inverteria a
// ordem aparente. As duas âncoras abaixo são as chamadas de verdade.
must(bloco.indexOf('window._woLogGrupoDoWo(t, _uid') < bloco.indexOf('Array.isArray(t.woClaims)'),
  '② ⭐ e pergunta a ELE primeiro — o claim é a segunda fonte, não a única');
must(/_memberUidByName/.test(bloco) &&
     bloco.indexOf('window._memberUidByName(t,') < bloco.indexOf('window._woLogGrupoDoWo(t, _uid'),
  '② o uid é resolvido ANTES da pergunta — é por ele que o registro identifica a pessoa');
must(/R' \+ \(\(_reg\.roundIndex \|\| 0\) \+ 1\)/.test(bloco),
  '② e a rodada entra no rótulo quando o nome do grupo não a traz');

// ── ③ a cor diz o estado ────────────────────────────────────────────────────
must(/ctx\.pele === 'fora'/.test(PART), '③ o card canônico tem a pele de QUEM ESTÁ FORA da disputa');
const peleIni = PART.indexOf("if (ctx.pele === 'fora')");
must(PART.indexOf("if (ctx.lateJoin)") < peleIni,
  '③ ⛔ e ela vem por ÚLTIMO — vence VIP, dupla e espera (um VIP com W.O. está fora como qualquer um)');
must(/rgba\(127,29,29/.test(PART.slice(peleIni, peleIni + 260)), '③ e é vermelha de verdade');
must(/enrollOrderMap: _ordemMapa, pele: 'fora'/.test(BRK),
  '③ inativos e W.O. pedem essa pele (ordem do dono: vermelho para os dois)');
const standby = PART.slice(PART.indexOf('else if (_isStandbyEntry)'), PART.indexOf('else if (isTeam)'));
must(/245,158,11/.test(standby), '③ e quem espera vaga continua ÂMBAR — o outro lado da mesma ordem');

console.log('✅ ' + ok + ' asserções — o card de W.O. diz de onde veio, e a cor diz o estado');
