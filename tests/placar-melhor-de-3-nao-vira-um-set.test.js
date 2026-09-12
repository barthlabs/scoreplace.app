'use strict';
/* JOGO 168 DO CONFRA (11/set/2026) — quatro defeitos que o dono viu na mesma partida.
 *
 * ① Melhor de 3 gravado CERTO (5-6 · 6-3 · STB 7-10) e reescrito 22,8 s depois como UM set:
 *    o segundo Confirmar, com a partida já decidida, caía no salvamento de set único.
 * ② O subponto do tie-break (9-7) não viajava para a notificação.
 * ③ A cor do placar era da LINHA (vencedor da partida) e não do SET.
 * ④ O verde `#16a34a` cravado ficava ilegível no card branco do tema claro.
 *
 * Roda o CÓDIGO REAL: fatias do arquivo em VM, nunca cópia.
 */
const assert = require('assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const BUI = fs.readFileSync(path.join(root, 'js/views/bracket-ui.js'), 'utf8');
const FN = fs.readFileSync(path.join(root, 'functions/index.js'), 'utf8');
let ok = 0;
const must = (v, m) => { assert.ok(v, m); ok++; };

// ── ① a bifurcação do Confirmar, rodando de verdade ──────────────────────────
{
  const ini = BUI.indexOf('  var _planSave = (typeof window._matchSetPlan');
  const fim = BUI.indexOf('\n  }\n', BUI.indexOf('if (_planSave && _planSave.multi && !_planSave.live)', ini));
  assert.ok(ini > 0 && fim > ini, 'âncoras da bifurcação');
  const trecho = BUI.slice(ini, fim + 4);

  function decide(plan) {
    let avisou = false, multi = null;
    const ctx = {
      window: {
        _matchSetPlan: () => plan,
        _confirmSetFromCard: () => { multi = 'MULTI'; return 'MULTI'; }
      },
      showAlertDialog: () => { avisou = true; },
      _t: () => null, _isc: {}, m: {}, tId: 't', matchId: 'x',
      s1: 7, s2: 10, tbP1: null, tbP2: null, isTiebreakEntry: false
    };
    const r = vm.runInNewContext('(function () {' + trecho + '\nreturn "CAIU_NO_SET_UNICO";})()', ctx);
    return { r, avisou, multi };
  }

  const decidido = { multi: true, live: null, bestOf: 3, played: [{}, {}, {}], setsToWin: 2 };
  const d = decide(decidido);
  must(d.r !== 'CAIU_NO_SET_UNICO',
    '⛔ partida de melhor de N JÁ DECIDIDA não cai no salvamento de set único (era isso que apagava os 3 sets)');
  must(d.avisou, 'e o usuário é avisado de que o jogo já está encerrado, em vez de perder o placar em silêncio');

  const emJogo = { multi: true, live: { i: 2, kind: 'stb' }, bestOf: 3, played: [{}, {}], setsToWin: 2 };
  must(decide(emJogo).multi === 'MULTI', 'com set em disputa, o caminho de melhor de N continua valendo');

  const umSet = { multi: false, live: null, bestOf: 1, played: [], setsToWin: 1 };
  must(decide(umSet).r === 'CAIU_NO_SET_UNICO', 'jogo de 1 set segue no salvamento simples — nada mudou para ele');
}

// ── ② o subponto viaja no payload ────────────────────────────────────────────
{
  const ini = BUI.indexOf('window._matchScoreboard = function');
  const fim = BUI.indexOf('\n};\n', ini);
  // ⭐ o leitor e o ESCRITOR únicos entram REAIS (fatiados de bracket-model.js): é assim que o
  // teste prova que o payload usa a forma canônica, e não uma segunda forma montada à mão.
  const BM = fs.readFileSync(path.join(root, 'js/views/bracket-model.js'), 'utf8');
  const gIni = BM.indexOf('  function _getSetTB(set) {'), gFim = BM.indexOf('\n  }\n', gIni);
  const tIni = BM.indexOf('  window._tbPoints = function (p1, p2) {'), tFim = BM.indexOf('\n  };\n', tIni);
  assert.ok(gIni > 0 && tIni > 0, 'âncoras do leitor/escritor de tie-break');
  const ctx = { window: {} };
  vm.runInNewContext(BM.slice(gIni, gFim + 4) + '\nwindow._setTiebreak = _getSetTB;\n' + BM.slice(tIni, tFim + 4), ctx);
  vm.runInNewContext(BUI.slice(ini, fim + 3), ctx);
  const b = ctx.window._matchScoreboard({ p1: 'A / B', p2: 'C / D' }, [
    { gamesP1: 5, gamesP2: 6, tiebreak: { pointsP1: 7, pointsP2: 9 } },
    { gamesP1: 6, gamesP2: 3 },
    { gamesP1: 7, gamesP2: 10, superTiebreak: true }
  ], 'C / D');
  must(b.sets[0].tiebreak && b.sets[0].tiebreak.pointsP2 === 9, '⛔ o set com tie-break leva o subponto (era descartado)');
  must(b.sets[1].tiebreak === undefined, 'set sem tie-break não ganha campo inventado');
  must(b.sets[2].label === 'STB' && b.sets[2].superTiebreak === true, 'o super tie-break continua rotulado');
}

// ── ③ e ④ o placar do e-mail: cor por SET, subponto desenhado, cores da paleta ──
{
  const pIni = FN.indexOf('function _digestPalette(theme)');
  const pFim = FN.indexOf('\n}\n', pIni);
  const sIni = FN.indexOf('function _digestScoreboard(it, P)');
  const sFim = FN.indexOf('\n}\n', sIni);
  const ctx = { _digestEscape: (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;') };
  vm.runInNewContext(FN.slice(pIni, pFim + 2) + '\n' + FN.slice(sIni, sFim + 2), ctx);

  const claro = ctx._digestPalette('light'), escuro = ctx._digestPalette('dark');
  must(claro.win && claro.loss && escuro.win && escuro.loss, '⛔ vitória/derrota saem da PALETA, não de hex cravado');
  must(claro.win !== escuro.win, 'e cada tema tem o seu valor — contraste é regra dos dois');
  must(!/#16a34a|#dc2626/.test(FN.slice(sIni, sFim)), '⛔ nenhuma cor cravada sobrou no placar');

  const html = ctx._digestScoreboard({ scoreboard: {
    p1: 'Livia / Rodrigo', p2: 'Inga / Denise', winner: 'Inga / Denise',
    sets: [
      { label: 'Set 1', p1: 5, p2: 6, tiebreak: { pointsP1: 7, pointsP2: 9 } },
      { label: 'Set 2', p1: 6, p2: 3 },
      { label: 'STB', p1: 7, p2: 10, superTiebreak: true }
    ] } }, claro);
  const linhas = html.split('<tr>');
  const l1 = linhas.find((x) => x.indexOf('Livia') >= 0), l2 = linhas.find((x) => x.indexOf('Inga') >= 0);
  // o set 2 (6-3) é DELE: verde na linha dele mesmo tendo perdido a partida — o relato do dono
  must((l1.match(new RegExp(claro.win, 'g')) || []).length >= 1, '⛔ o set 2 (6-3) sai VERDE para quem o venceu, mesmo perdendo a partida');
  must(l1.indexOf(claro.loss) >= 0, 'e os sets que ele perdeu saem vermelhos na mesma linha');
  must(l2.indexOf(claro.win) >= 0 && l2.indexOf(claro.loss) >= 0, 'a linha do adversário também mistura — a cor é do set');
  must(/>7<sup[^>]*>\(7\)/.test(l1.replace(/\s+/g, ' ')) || l1.indexOf('(7)') >= 0, '⛔ o subponto do tie-break aparece do lado dele');
  must(l2.indexOf('(9)') >= 0, 'e o do adversário do lado dele');
  must(html.indexOf('object') === -1, '⛔ nunca "[object Object]" — o tie-break é objeto e tem de ser lido por lado');
  must(FN.indexOf('name="color-scheme" content="light dark"') > 0 &&
       FN.indexOf('name="supported-color-schemes"') > 0,
    '⛔ o HTML declara color-scheme — sem isso o Apple Mail ignora o tema escuro que o servidor mandou');
}

console.log('✅ jogo 168: ' + ok + ' asserções — melhor de N não vira 1 set, subponto viaja e aparece, cor por set e contraste nos dois temas');
