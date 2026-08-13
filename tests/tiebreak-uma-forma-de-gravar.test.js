// REGRAS DO DONO (13/ago/2026):
//   "quando lança tie-break esse subplacar deve persistir e aparecer para todos como
//    aparece o placar do jogo."
//   "unifique a forma de gravar se não tiver uma justificativa para isso."
//
// O tie-break era gravado em DUAS formas — `{p1,p2}` (matchHistory do usuário + estado do
// placar ao vivo) e `{pointsP1,pointsP2}` (doc do torneio) — com CONVERSORES nas fronteiras
// e QUATRO cópias da normalização espalhadas. Não havia justificativa: era acaso histórico.
// Unificado: grava-se SEMPRE `{pointsP1,pointsP2}` (window._tbPoints) e lê-se SEMPRE por
// window._setTiebreak. A tolerância às duas formas ficou SÓ na LEITURA, e isso é
// deliberado — MEDIDO em produção (ago/2026): matchHistory 100% `{p1,p2}`, casualMatches
// quase tudo `{p1,p2}`, doc do torneio `{pointsP1,pointsP2}`. Reescrever o passado exigiria
// migração; tolerar na leitura custa duas linhas.
//
// E "persistir" tem um passo que não é óbvio: o subplacar só APARECE se o jogo tiver
// `m.sets` — `_applyApprovedResult` exige `pr.sets` ser ARRAY. Guardar só `tbP1/tbP2` no
// pendingResult fazia o TB ser aceito e sumir na aprovação.
const fs = require('fs');
const path = require('path');
const H = require('./render-harness');
const W = H.sandbox;
let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }

// ─────────────────────────────────────────────────────────────────────────────
// 1. UMA forma de gravar
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n1. Grava-se numa forma só');

ok(typeof W._tbPoints === 'function', 'existe o escritor único window._tbPoints');
ok(typeof W._setTiebreak === 'function', 'existe o leitor único window._setTiebreak');
const tb = W._tbPoints(7, 5);
ok(tb && tb.pointsP1 === 7 && tb.pointsP2 === 5, '_tbPoints devolve a forma canônica {pointsP1,pointsP2}');
ok(tb && tb.p1 === undefined && tb.p2 === undefined, '_tbPoints NÃO emite a forma curta');
ok(W._tbPoints(null, 5) === null && W._tbPoints(7, undefined) === null && W._tbPoints(NaN, 1) === null,
  '_tbPoints recusa valor faltando (não grava tie-break pela metade)');

// varredura: nenhum arquivo grava mais a forma curta
const ARQS = ['bracket-ui.js', 'bracket.js', 'bracket-model.js', 'dashboard.js', 'tournaments-analytics.js'];
ARQS.forEach(function (f) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', f), 'utf8');
  const curtas = (src.match(/tiebreak\s*(?:=|:)\s*\{\s*p1\s*:/g) || []);
  ok(curtas.length === 0, f + ': não grava a forma curta {p1,...} (achou ' + curtas.length + ')');
  // e ninguém lê `set.tiebreak.p1` cru — tem que passar pelo leitor único
  const crus = (src.match(/tiebreak\.p[12]\b/g) || []);
  const permitido = (f === 'bracket-model.js'); // é onde o leitor normaliza
  ok(permitido || crus.length === 0, f + ': não lê tiebreak.p1/p2 cru (achou ' + crus.length + ')');
});

// leitor aceita as DUAS formas — compat com o que JÁ está gravado
ok(W._setTiebreak({ tiebreak: { pointsP1: 7, pointsP2: 3 } }).p1 === 7, 'leitor entende a forma canônica');
ok(W._setTiebreak({ tiebreak: { p1: 7, p2: 3 } }).p1 === 7, 'leitor entende a forma LEGADA (dado já gravado)');
ok(W._setTiebreak({ gamesP1: 6 }) === null, 'set sem tie-break devolve null');
ok(W._setTiebreak(null) === null, 'set inexistente devolve null');

// ─────────────────────────────────────────────────────────────────────────────
// 2. O subplacar PERSISTE e APARECE
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n2. O subplacar sobrevive do lançamento até a tela');

const built = W._buildManualSet(6, 5, { isTiebreakEntry: true, tbP1: 7, tbP2: 5 });
ok(Array.isArray(built.sets) && built.sets.length === 1, '_buildManualSet devolve o array de sets');
ok(built.sets[0].tiebreak && built.sets[0].tiebreak.pointsP1 === 7, 'o set carrega o tie-break na forma canônica');
ok(built.setsWonP1 === 1 && built.setsWonP2 === 0, 'e quem fez mais games venceu o set');
const semTb = W._buildManualSet(6, 4, { isTiebreakEntry: false });
ok(!semTb.sets[0].tiebreak, 'placar sem tie-break não inventa subplacar');

// a tela: o formatador canônico mostra 6⁽⁷⁾ — é ele que o card usa
ok(/6<sup[^>]*>\(7\)<\/sup>/.test(W._formatSetForPlayer(built.sets[0], 1, { html: true })),
  'na tela o lado vencedor sai 6 com (7) sobrescrito');
ok(/5<sup[^>]*>\(5\)<\/sup>/.test(W._formatSetForPlayer(built.sets[0], 2, { html: true })),
  'e o outro lado sai 5 com (5)');
ok(W._formatSetCombined(built.sets[0], {}) === '6⁽⁷⁾-5⁽⁵⁾', 'combinado: 6⁽⁷⁾-5⁽⁵⁾');
ok(W._formatSetForPlayer(semTb.sets[0], 1, { html: true }) === '6', 'sem tie-break, só o número');

// dado LEGADO (forma curta) também aparece — é o que está gravado hoje no casual
ok(/6<sup[^>]*>\(7\)<\/sup>/.test(W._formatSetForPlayer({ gamesP1: 6, gamesP2: 5, tiebreak: { p1: 7, p2: 5 } }, 1, { html: true })),
  'set LEGADO {p1,p2} continua aparecendo na tela');

// ── ponta a ponta: proposta pendente COM tie-break → aprovação → tela ──
// (era exatamente aqui que sumia: sem `pr.sets`, _applyApprovedResult não monta m.sets)
const t = {
  id: 't1', name: 'T', sport: 'Beach Tennis', creatorUid: 'org', creatorEmail: 'o@x',
  organizerEmail: 'o@x', coHosts: [], participants: [], checkedIn: {},
  scoring: { type: 'sets', gamesPerSet: 6, tiebreakEnabled: true, setsToWin: 1 },
  rounds: [{ number: 1, matches: [{ id: 'm1', p1: 'A / B', p2: 'C / D', roundIndex: 0 }] }]
};
const mp = W._buildManualSet(6, 5, { isTiebreakEntry: true, tbP1: 7, tbP2: 5 });
t.rounds[0].matches[0].pendingResult = {
  kind: 'inline', scoreP1: 6, scoreP2: 5, winner: 'A / B', draw: false,
  useSets: true, isTiebreakEntry: true, tbP1: 7, tbP2: 5,
  sets: mp.sets, setsWonP1: mp.setsWonP1, setsWonP2: mp.setsWonP2
};
W._applyApprovedResult(t, 'm1', t.rounds[0].matches[0].pendingResult);
const mAfter = t.rounds[0].matches[0];
ok(Array.isArray(mAfter.sets) && mAfter.sets.length === 1, 'aprovado: o jogo ficou com m.sets');
ok(mAfter.sets[0].tiebreak && mAfter.sets[0].tiebreak.pointsP1 === 7,
  'aprovado: o TIE-BREAK sobreviveu à aprovação (era o que sumia)');
ok(!mAfter.pendingResult, 'aprovado: a proposta foi consumida');
ok(/6<sup[^>]*>\(7\)<\/sup>/.test(W._formatSetForPlayer(mAfter.sets[0], 1, { html: true })),
  'aprovado: e aparece na tela para QUALQUER pessoa que abrir o jogo');

// e o contra-exemplo que prova o porquê: pendingResult SEM `sets` perde o subplacar
const t2 = JSON.parse(JSON.stringify(t));
t2.rounds[0].matches[0] = { id: 'm1', p1: 'A / B', p2: 'C / D', roundIndex: 0, pendingResult: {
  kind: 'inline', scoreP1: 6, scoreP2: 5, winner: 'A / B', draw: false,
  useSets: true, isTiebreakEntry: true, tbP1: 7, tbP2: 5 } };
W._applyApprovedResult(t2, 'm1', t2.rounds[0].matches[0].pendingResult);
ok(!Array.isArray(t2.rounds[0].matches[0].sets),
  'CONTRA-EXEMPLO: sem `pr.sets` o jogo fica sem m.sets — é por isso que o builder é obrigatório');

// ─────────────────────────────────────────────────────────────────────────────
// 3. O caminho canônico de lançamento usa o builder
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n3. Todo caminho monta o set pelo mesmo builder');
const BUI = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'bracket-ui.js'), 'utf8');
ok((BUI.match(/_buildManualSet\(/g) || []).length >= 4,
  'os caminhos de lançamento montam o set pelo builder (achou ' + (BUI.match(/_buildManualSet\(/g) || []).length + ')');
// NENHUM lugar monta o objeto do tie-break à mão — todos passam pelo escritor único.
// (varre o literal em qualquer das duas formas, em todo o arquivo)
const aMao = (BUI.match(/tiebreak\s*(?:=|:)\s*\{\s*(?:points)?P?p?1/gi) || []);
ok(aMao.length === 0, 'nenhum tie-break montado à mão em bracket-ui.js (achou ' + aMao.length + ')');
ok((BUI.match(/window\._tbPoints\(/g) || []).length >= 5,
  'os pontos do TB são gravados pelo escritor único em todos os pontos');

console.log('\n' + (fail === 0 ? '✅ tiebreak-uma-forma-de-gravar: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fails.length) { fails.forEach(function (f) { console.error('  ✗ ' + f); }); }
process.exit(fail > 0 ? 1 : 0);
