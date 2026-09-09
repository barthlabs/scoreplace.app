/* L7.P1.17 — reparos automáticos não podem persistir pelo navegador. */
'use strict';
const fs=require('fs');
const index=fs.readFileSync('functions-autodraw/index.js','utf8');
const bracket=fs.readFileSync('js/views/bracket.js','utf8');
const logic=fs.readFileSync('js/views/bracket-logic.js','utf8');
let fail=0; function ok(v,s){ if(v) console.log('✓ '+s); else { fail++; console.error('✗ '+s); } }
ok(index.includes('ligaPrematura') && index.includes('_healPrematureLigaRounds(t)'), 'Function reconcilia rodada Liga prematura no documento fresco');
ok(index.includes('folgaLegada') && index.includes('_healSitOutWinners(t)'), 'Function limpa vencedor legado de folga no documento fresco');
ok(!bracket.includes('v2.3.10: heal IMEDIATO ao abrir o bracket'), 'abertura da chave não conserva o heal automático');
const poll=logic.slice(logic.indexOf('window._checkLigaAutoDraws'), logic.indexOf('// ── v1.2.11:', logic.indexOf('window._checkLigaAutoDraws')));
ok(poll.includes("_callCF('reconcileBracket'") && !poll.includes('AppStore.mutate'), 'poller da Liga só despacha a Function');
process.exit(fail?1:0);
