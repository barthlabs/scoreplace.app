/* L7.P1.19 — encerrar a rodada de Liga de uma fase é só uma intenção do cliente.
 * A CF relê o documento, gera a próxima uma vez e mantém o placar concorrente fora
 * do navegador. */
'use strict';
const fs=require('fs');
const index=fs.readFileSync('functions-autodraw/index.js','utf8');
const bracket=fs.readFileSync('js/views/bracket.js','utf8');
const logic=fs.readFileSync('js/views/bracket-logic.js','utf8');
let fail=0; function ok(v,s){ if(v) console.log('✓ '+s); else { fail++; console.error('✗ '+s); } }
const start=bracket.indexOf('window._phaseCloseLeagueRound');
const end=bracket.indexOf('// v2.8.24:',start);
const client=bracket.slice(start,end);
const cfStart=index.indexOf('exports.closePhaseLeagueRound');
const cfEnd=index.indexOf('// ─── Reconciliador de nextDrawAt',cfStart);
const cf=index.slice(cfStart,cfEnd);
const notifier=index.slice(index.indexOf('async function _notifyIncrementalPhaseRound'), cfStart);
ok(start>=0 && client.includes("_callCF('closePhaseLeagueRound'") , 'cliente apenas despacha o fechamento para a Cloud Function');
ok(!/AppStore\.mutate|_notifyDrawPersonalized|_phaseGenNextLeagueRound/.test(client), 'cliente não persiste nem sorteia a rodada');
ok(cf.includes("const uid=request.auth && request.auth.uid") && cf.includes("_isTournamentAdmin(t,uid)"), 'Function exige autenticação e organização por uid');
ok(cf.includes('db.runTransaction') && cf.includes('_leTorneio(tx,ref,tId)') && cf.includes('_gravaTorneio(tx,ref,t,before'), 'Function relê e grava o torneio na transação canônica');
ok(cf.includes("_phaseGenNextLeagueRound(t,phaseIdx") && cf.includes('round-incomplete') && cf.includes('phase-not-found'), 'Function protege fase ausente e rodada incompleta antes de gerar a próxima');
ok(!/await _preloadDrawNames\(t\)/.test(cf) && cf.includes('const seed=await ref.get()'), 'leitura auxiliar de perfis fica fora do retry da transação');
ok(notifier.includes(".doc('phase-round-' + tId + '-' + phaseIdx + '-' + maxR)") && notifier.includes("{ merge:true }") && notifier.includes('_queueDrawEmail'), 'notificação sai do servidor com deduplicação por rodada');
ok(logic.includes('function _phaseRoundRng(seed)') && logic.includes('window._phaseRoundRng = _phaseRoundRng'), 'RNG determinístico está disponível ao motor vendorizado da Function');
console.log('fechar-rodada-liga-nao-duplica-nem-sobrescreve: '+(8-fail)+' passou, '+fail+' falhou');
process.exit(fail?1:0);
