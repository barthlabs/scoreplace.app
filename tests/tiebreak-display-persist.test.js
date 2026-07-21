// TIE-BREAK persiste + aparece no card DECIDIDO — em QUALQUER torneio, pelo MESMO caminho.
// Bug do dono (jul/2026): "lancei o placar de tiebreak, mas ele nao apareceu depois".
// Raiz: reveal do campo TB usava (type==='sets' || gamesPerSet), mas o SAVE e o DISPLAY
// gateavam só em type==='sets'. Num torneio cujo scoring tinha gamesPerSet+tiebreakEnabled
// mas SEM type:'sets' (config parcial), o campo aparecia, o dono preenchia, mas o valor
// NÃO era gravado em m.sets nem exibido → caía no scoreP1 cru ("6" em vez de "6⁽⁷⁾").
// Fix: window._scoringUsesSets é a ÚNICA função que decide "usa sets?" — reveal + save +
// edição inline + display do card + standings. [[project_live_scoring_canonical]]
const H = require('./render-harness');
const W = H.sandbox;
let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }

// ── 1. O predicado CANÔNICO trata os 4 casos de forma consistente ──
ok(W._scoringUsesSets({ type: 'sets', gamesPerSet: 6 }) === true, 'type=sets → usa sets');
ok(W._scoringUsesSets({ type: 'gsm', gamesPerSet: 6 }) === true, 'type=gsm (alias) → usa sets');
ok(W._scoringUsesSets({ gamesPerSet: 6, tiebreakEnabled: true }) === true,
  'gamesPerSet+tiebreak SEM type → usa sets (o caso do bug)');
ok(W._scoringUsesSets({ type: 'simple', gamesPerSet: 1, tiebreakEnabled: false }) === false,
  'simples de verdade (tb off, gp1) → NÃO usa sets');
ok(W._scoringUsesSets(null) === false, 'scoring null → false');

// ── 2. Reprodução do fluxo: torneio com scoring PARCIAL (o que quebrava) ──
// scoring sem type:'sets', mas com games + tiebreak → o dono lança 6-5 com TB 7-5.
function makeT() {
  return {
    id: 't_tb', sport: 'Beach Tennis',
    scoring: { gamesPerSet: 6, tiebreakEnabled: true, tiebreakAt: 'g-1' }, // 5-5 → set 6-5
    matches: [{ id: 'm1', p1: 'Ana', p2: 'Bia', scoreP1: null, scoreP2: null }]
  };
}

// O SAVE agora calcula useSets pelo MESMO helper (como _saveResultInline faz).
const t = makeT();
const _isc = W._effectiveScoring(t, t.matches[0]);
const useSets = W._scoringUsesSets(_isc);
ok(useSets === true, 'save: useSets calculado pelo helper = true no scoring parcial');

W._applyResultToTournament(t, 'm1', {
  s1: 6, s2: 5, useSets: useSets, isFixedSet: true,
  isTiebreakEntry: true, tbP1: 7, tbP2: 5
});
const m = t.matches[0];
ok(!!(m.sets && m.sets[0]), 'save: m.sets[0] gravado (branch useSets, não o else cru)');
ok(!!(m.sets && m.sets[0] && m.sets[0].tiebreak), 'save: m.sets[0].tiebreak persistido');
ok(m.sets && m.sets[0] && m.sets[0].tiebreak.pointsP1 === 7, 'save: TB p1 = 7');

// ── 3. DISPLAY do card decidido usa o <sup> HTML (dimensionável), não o superscript
//     unicode minúsculo. O card decidido chama _formatSetForPlayer com html:true. ──
const disp1 = W._formatSetForPlayer(m.sets[0], 1, { html: true });
const disp2 = W._formatSetForPlayer(m.sets[0], 2, { html: true });
ok(/^6/.test(disp1) && /<sup[^>]*>\(7\)<\/sup>/.test(disp1), 'display p1: "6" + <sup>(7)</sup> (não unicode)');
ok(/^5/.test(disp2) && /<sup[^>]*>\(5\)<\/sup>/.test(disp2), 'display p2: "5" + <sup>(5)</sup>');
ok(/font-size/.test(disp1), 'display: <sup> tem font-size (tamanho ajustável, não glifo unicode fixo)');

// ── 4. PROVA da regressão: com o gate ANTIGO (só type==='sets') o TB se perdia ──
const tOld = makeT();
const useSetsOld = !!(_isc && _isc.type === 'sets'); // gate antigo
ok(useSetsOld === false, 'regressão: gate antigo daria useSets=false no scoring parcial');
W._applyResultToTournament(tOld, 'm1', {
  s1: 6, s2: 5, useSets: useSetsOld, isFixedSet: false,
  isTiebreakEntry: true, tbP1: 7, tbP2: 5
});
ok(!(tOld.matches[0].sets && tOld.matches[0].sets[0]),
  'regressão: gate antigo NÃO grava m.sets → TB perdido (bug reproduzido)');

console.log('\n' + (fail === 0 ? '✅ tiebreak-display-persist: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fails.length) { fails.forEach((f) => console.error('  ✗ ' + f)); }
process.exit(fail > 0 ? 1 : 0);
