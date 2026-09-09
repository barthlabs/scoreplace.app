/* L7.P1.17/P1.20 — reparos automáticos nunca persistem pelo navegador. */
'use strict';
const fs=require('fs');
const index=fs.readFileSync('functions-autodraw/index.js','utf8');
const bracket=fs.readFileSync('js/views/bracket.js','utf8');
const logic=fs.readFileSync('js/views/bracket-logic.js','utf8');
let fail=0; function ok(v,s){ if(v) console.log('✓ '+s); else { fail++; console.error('✗ '+s); } }
const recStart=index.indexOf('exports.reconcileBracket');
const recEnd=index.indexOf('// ─── Auto-Draw:',recStart);
const reconcile=index.slice(recStart,recEnd);
ok(reconcile.includes('ligaPrematura') && reconcile.includes('_healPrematureLigaRounds(t)'), 'Function reconcilia rodada Liga prematura no documento fresco');
ok(reconcile.includes('folgaLegada') && reconcile.includes('_healSitOutWinners(t)'), 'Function limpa vencedor legado de folga no documento fresco');
ok(reconcile.includes('folgaReativada') && reconcile.includes('_sanitizeSitOutsVsRoster(t)'), 'Function remove folga de quem reativou no documento fresco');
ok(reconcile.includes('sobraMonarca') && reconcile.includes('_healMonarchRemainderToWaitlist(t)'), 'Function move sobra Rei/Rainha para espera no documento fresco');
ok(!bracket.includes('window.FirestoreDB.saveTournament(t)'), 'render da chave não salva reparo automático');
ok(!bracket.includes('window._sanitizeSitOutsVsRoster(t)'), 'render da chave não limpa folga diretamente');
ok(!bracket.includes('window._healMonarchRemainderToWaitlist(t)'), 'render da chave não move sobra Rei/Rainha diretamente');
const poll=logic.slice(logic.indexOf('window._checkLigaAutoDraws'), logic.indexOf('// ── v1.2.11:', logic.indexOf('window._checkLigaAutoDraws')));
ok(poll.includes("_callCF('reconcileBracket'") && !poll.includes('AppStore.mutate'), 'poller da Liga só despacha a Function');
process.exit(fail?1:0);
