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
ok(poll.includes('window._isLigaAutoDraw && window._isLigaAutoDraw(t)') && !poll.includes('window._isLigaFormat && window._isLigaFormat(t)'), 'poller só reconcilia a agenda da fase atual, não o rótulo legado');
const autoStart=index.indexOf("exports.autoDraw = onSchedule('every 1 minutes'");
const autoEnd=index.indexOf('// v3.1.14 (brick 4 etapa 4): gera UMA rodada agendada', autoStart);
const auto=index.slice(autoStart,autoEnd);
ok(auto.includes('const _agendaAtual = _agendaDaFaseAtual(t);') && auto.includes('_agenda.cfgDeAgenda(_fonteAgenda)'), 'cron usa a agenda resolvida da fase atual');
ok(auto.includes('const _agendaFresca = _agendaDaFaseAtual(tf);') && auto.includes('_devidoFresco') && auto.includes("pulou: 'agenda-alterada'") && auto.includes('nextDrawAt: _agenda.agendamentoCanonico'), 'cron relê a agenda fresca e nunca regrava o slot antigo após edição');
const boundary=index.slice(index.indexOf('function _applyWriteBoundary'), index.indexOf('const clean = w._cleanUndefined', index.indexOf('function _applyWriteBoundary')));
ok(boundary.includes('const _agendaAtual = _agendaDaFaseAtual(data);') && boundary.includes('(_agendaAtual && _agendaAtual.schedule)'), 'fronteira de escrita recalcula nextDrawAt pela mesma agenda canônica');
process.exit(fail?1:0);
