/* L7.P1.18 — quadra é uma intenção CF; o cliente não grava jogo. */
'use strict'; const fs=require('fs');
const src=fs.readFileSync('js/views/bracket.js','utf8');
const begin=src.indexOf('window._assignMatchCourt = function'); const end=src.indexOf('// ─── Formação de duplas',begin);
let fail=0; function ok(v,s){if(v)console.log('✓ '+s);else{fail++;console.error('✗ '+s)}}
const body=src.slice(begin,end);
ok(body.includes("_callCF('assignMatchCourt'"), 'atribuição despacha assignMatchCourt para a Function');
ok(!body.includes('AppStore.mutate') && !body.includes('saveTournament'), 'atribuição não persiste fotografia pelo cliente');
const cf=fs.readFileSync('functions-autodraw/index.js','utf8');
ok(cf.includes('exports.assignMatchCourt = onCall') && cf.includes('_isTournamentAdmin(t, uid)'), 'Function exige organização no documento fresco');
ok(cf.includes("const m = drawWindow._findMatch(t, matchId)") && cf.includes('_gravaTorneio(tx, ref, t, antes'), 'Function encontra jogo e grava pelo plano canônico');
ok(cf.includes('Jogo iniciado ou concluído não pode mudar de quadra.'), 'Function bloqueia alteração de quadra em jogo iniciado ou concluído');
ok(src.includes('regression_played_match_court_is_immutable') && src.includes('sp-match-court'), 'card mostra a quadra e só libera o seletor em jogo futuro');
ok(src.includes("typeof m.scoreP1 === 'number' && m.scoreP1 > 0") && src.includes("typeof m.scoreP2 === 'number' && m.scoreP2 > 0"),
  'cliente também bloqueia seletor quando já existe placar numérico — mesma régua da Function');
process.exit(fail?1:0);
