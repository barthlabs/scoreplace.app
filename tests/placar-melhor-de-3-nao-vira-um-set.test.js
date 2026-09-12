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
  // 12/set/2026: o desenho do e-mail saiu do `index.js` (que não é require-ável em teste) para
  // `functions/digest-core.js`. Módulo puro ⇒ nada de fatiar fonte: dá pra exigir o próprio.
  const ctx = require(path.join(root, 'functions/digest-core.js'));

  const claro = ctx._digestPalette('light'), escuro = ctx._digestPalette('dark');
  must(claro.win && claro.loss && escuro.win && escuro.loss, '⛔ vitória/derrota saem da PALETA, não de hex cravado');
  must(claro.win !== escuro.win, 'e cada tema tem o seu valor — contraste é regra dos dois');
  must(!/#16a34a|#dc2626/.test(ctx._digestScoreboard.toString()), '⛔ nenhuma cor cravada sobrou no placar');

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
  const DG = fs.readFileSync(path.join(root, 'functions/digest-core.js'), 'utf8');
  must(DG.indexOf('name="color-scheme" content="light dark"') > 0 &&
       DG.indexOf('name="supported-color-schemes"') > 0,
    '⛔ o HTML declara color-scheme — sem isso o Apple Mail ignora o tema escuro que o servidor mandou');
}

// ── ⑤ a cor do CARD também é por SET (a outra metade do ③) ───────────────────
{
  const BM = fs.readFileSync(path.join(root, 'js/views/bracket-model.js'), 'utf8');
  const ini = BM.indexOf('  window._corDoSetLado = function');
  const fim = BM.indexOf('\n  };\n', ini);
  assert.ok(ini > 0, 'âncora de _corDoSetLado');
  const ctx = { window: {} };
  vm.runInNewContext(BM.slice(ini, fim + 4), ctx);
  const cor = ctx.window._corDoSetLado;
  const sets = [{ gamesP1: 5, gamesP2: 6 }, { gamesP1: 6, gamesP2: 3 }, { gamesP1: 7, gamesP2: 10 }];
  const lado1 = sets.map((s) => cor(s, 1, true)), lado2 = sets.map((s) => cor(s, 2, true));
  must(lado1[0] !== lado1[1] && lado1[1] === cor({ gamesP1: 9, gamesP2: 1 }, 1, true),
    '⛔ o set 2 (6-3) recebe a cor de VITÓRIA na linha de quem perdeu a partida');
  must(lado1[0] === lado2[1] && lado2[0] === lado1[1], 'os dois lados são espelho um do outro, set a set');
  must(cor({ gamesP1: 6, gamesP2: 6 }, 1, true) === cor(null, 1, true), 'set sem vencedor legível fica neutro');
  must(cor(sets[1], 1, false) === cor(null, 1, true), 'partida sem vencedor: tudo neutro');

  // e o card emite a cor SEMPRE por _spCor — hex cru aqui traria de volta o verde ilegível
  const DASH = fs.readFileSync(path.join(root, 'js/views/dashboard.js'), 'utf8');
  const pIni = DASH.indexOf('        function _placarLado(n) {');
  const pFim = DASH.indexOf('\n        }\n', pIni);
  const bloco = DASH.slice(pIni, pFim);
  must(/_spCor\(\s*window\._corDoSetLado\(/.test(bloco.replace(/\s+/g, ' ')) ||
       /_spCor\(_c,/.test(bloco), '⛔ a cor do set passa por `_spCor` (tema), nunca hex cru');
  must(/window\._corDoSetLado\(s, n,/.test(bloco), 'o card usa a fonte única da cor');
}

// ── ⑥ o aviso não pode mostrar a CHAVE de tradução ao usuário ───────────────
{
  const pt = fs.readFileSync(path.join(root, 'js/i18n-pt.js'), 'utf8');
  const en = fs.readFileSync(path.join(root, 'js/i18n-en.js'), 'utf8');
  ['bracket.matchClosed', 'bracket.matchClosedDetail'].forEach((k) => {
    must(pt.indexOf("'" + k + "'") > 0, '⛔ `' + k + '` existe no dicionário PT');
    must(en.indexOf("'" + k + "'") > 0, 'e no EN');
  });
  // ⛔ `_t(k)` devolve a própria chave quando não traduz: `_t(k) || fb` nunca cai no fallback.
  // ⛔ recorte por ÂNCORA, nunca por tamanho fixo: 1200 caracteres hoje viram 900 amanhã.
  const i = BUI.indexOf("_planSave.multi && !_planSave.live");
  const fimAviso = BUI.indexOf("null, { type: 'warning' });", i);
  assert.ok(i > 0 && fimAviso > i, 'âncoras do aviso de partida encerrada');
  const bloco = BUI.slice(i, fimAviso);
  must(/v === k/.test(bloco), '⛔ o aviso compara com a CHAVE antes de usar o texto (senão mostra "bracket.matchClosed")');
  must(!/_t\('bracket\.matchClosed'\) \|\|/.test(bloco), 'e o padrão `_t(k) || fallback`, que não funciona, não voltou');
}

// ── ⑦ a cor por set vale em TODA tela que mostra placar (ordem do dono) ─────
{
  const DASH = fs.readFileSync(path.join(root, 'js/views/dashboard.js'), 'utf8');
  const BRK = fs.readFileSync(path.join(root, 'js/views/bracket.js'), 'utf8');
  const FN = fs.readFileSync(path.join(root, 'functions/index.js'), 'utf8');
  must(/window\._corDoSetLado\(s, n,/.test(DASH), 'dashboard (Novidades e Seus últimos resultados)');
  must(/window\._corDoSetLado\(s, playerNum, _temV\)/.test(BRK), 'card da CHAVE');
  const DIGEST = fs.readFileSync(path.join(root, 'functions/digest-core.js'), 'utf8');
  must(/const corDoSet = \(s, side\)/.test(DIGEST), 'e-mail de notificação');
  // a grade read-only já era por set desde sempre — fica travada aqui também
  const BM = fs.readFileSync(path.join(root, 'js/views/bracket-model.js'), 'utf8');
  must(/var cor = g > o \? '#4ade80' : \(o > g \? '#f87171'/.test(BM), 'grade de sets read-only');
  must((BM.match(/window\._corDoSetLado = function/g) || []).length === 1,
    '⛔ a régua da cor é UMA só — quatro telas, uma fonte');
}

console.log('✅ jogo 168: ' + ok + ' asserções — melhor de N não vira 1 set, subponto viaja e aparece, cor por set e contraste nos dois temas');
