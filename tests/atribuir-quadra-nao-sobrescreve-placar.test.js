/* L7.P1.18 — quadra é uma intenção CF; o cliente não grava jogo. */
'use strict'; const fs=require('fs');
const vm=require('vm');
const src=fs.readFileSync('js/views/bracket.js','utf8');
const begin=src.indexOf('window._assignMatchCourt = function'); const end=src.indexOf('// ─── Formação de duplas',begin);
let fail=0; function ok(v,s){if(v)console.log('✓ '+s);else{fail++;console.error('✗ '+s)}}
const body=src.slice(begin,end);
ok(body.includes("_callCF('assignMatchCourt'"), 'atribuição despacha assignMatchCourt para a Function');
ok(!body.includes('AppStore.mutate') && !body.includes('saveTournament'), 'atribuição não persiste fotografia pelo cliente');
const cf=fs.readFileSync('functions-autodraw/index.js','utf8');
ok(cf.includes('exports.assignMatchCourt = onCall') && cf.includes('_isTournamentAdmin(t, uid)'), 'Function exige organização no documento fresco');
ok(cf.includes("exports.assignMatchCourt = onCall({ invoker: 'public' }") && cf.includes("if (!uid) throw new HttpsError('unauthenticated'"),
  'preflight CORS alcança a callable, que continua exigindo login');
ok(cf.includes("const m = drawWindow._findMatch(t, matchId)") && cf.includes('_gravaTorneio(tx, ref, t, antes'), 'Function encontra jogo e grava pelo plano canônico');
ok(cf.includes('Jogo iniciado ou concluído não pode mudar de quadra.'), 'Function bloqueia alteração de quadra em jogo iniciado ou concluído');
ok(src.includes('regression_played_match_court_is_immutable') && src.includes('sp-match-court'), 'card mostra a quadra e só libera o seletor em jogo futuro');
ok(src.includes("typeof m.scoreP1 === 'number' && m.scoreP1 > 0") && src.includes("typeof m.scoreP2 === 'number' && m.scoreP2 > 0"),
  'cliente também bloqueia seletor quando já existe placar numérico — mesma régua da Function');
ok(body.includes("confirmCall: true") && body.includes('select.value'), 'OK envia a quadra escolhida e a intenção de chamada na mesma operação');
ok(cf.includes('if (confirmCall && !court)') && cf.includes('if (confirmCall) m.courtCalledAt = agoraIso;'),
  'servidor exige quadra e registra o instante da chamada');
ok(cf.includes('atual === court && (!confirmCall || m.courtCalledAt)'), 'chamada repetida não regrava nem reinicia o relógio');
ok(cf.includes('else if (atual !== court) delete m.courtCalledAt;'), 'trocar ou remover quadra cancela chamada antiga');
const courtBlockStart=cf.indexOf("const atual = String(m.court || '');",cf.indexOf('exports.assignMatchCourt = onCall'));
const courtBlockEnd=cf.indexOf('const b = _gravaTorneio',courtBlockStart);
ok(courtBlockStart>=0 && courtBlockEnd>courtBlockStart, 'regra real da chamada localizada na Function');
if(courtBlockStart>=0 && courtBlockEnd>courtBlockStart){
  const apply=new Function('m','court','confirmCall','agoraIso','_drawFail','tId','matchId','t','drawWindow',
    cf.slice(courtBlockStart,courtBlockEnd)+' return {ok:true,changed:true,courtCalledAt:m.courtCalledAt||null};');
  const m={court:'Quadra 4'};
  const fail=()=>new Error('precondition');
  apply(m,'Quadra 4',true,'2026-10-19T18:00:00Z',fail,'t','j');
  ok(m.courtCalledAt==='2026-10-19T18:00:00Z','OK inicial carimba a chamada');
  const repeat=apply(m,'Quadra 4',true,'2026-10-19T18:01:00Z',fail,'t','j');
  ok(repeat.changed===false && m.courtCalledAt==='2026-10-19T18:00:00Z','OK repetido conserva o início');
  apply(m,'Quadra 5',false,'2026-10-19T18:02:00Z',fail,'t','j');
  ok(m.court==='Quadra 5' && !m.courtCalledAt,'mudar quadra remove a chamada velha');
  apply(m,'Quadra 5',true,'2026-10-19T18:03:00Z',fail,'t','j');
  ok(m.courtCalledAt==='2026-10-19T18:03:00Z','novo OK inicia chamada da quadra nova');
  apply(m,'',false,'2026-10-19T18:04:00Z',fail,'t','j');
  ok(!m.court && !m.courtCalledAt,'remover quadra também cancela a chamada');
  const first={id:'j1',court:'Quadra 8',scheduledAt:'2026-10-22T18:00:00Z'};
  const second={id:'j2',court:'Quadra 9',scheduledAt:'2026-10-22T18:00:00Z'};
  const later={id:'j3',court:'Quadra 9',scheduledAt:'2026-10-22T18:35:00Z'};
  const t={courtNames:['Quadra 8','Quadra 9'],games:[first,second,later]};
  const drawWindow={_collectAllMatches: tournament=>tournament.games};
  apply(first,'Quadra 9',false,'2026-10-22T17:00:00Z',fail,'t','j1',t,drawWindow);
  ok(first.court==='Quadra 9' && second.court==='Quadra 8' && later.court==='Quadra 9',
    'troca quadras de dois jogos futuros no mesmo horário sem mexer em rodada posterior');
  second.courtCalledAt='2026-10-22T17:01:00Z';
  let locked=false;
  try { apply(first,'Quadra 8',false,'2026-10-22T17:02:00Z',fail,'t','j1',t,drawWindow); } catch (_) { locked=true; }
  ok(locked && first.court==='Quadra 9' && second.court==='Quadra 8', 'jogo chamado bloqueia nova troca');
}
ok(src.includes('data-start-ms') && src.includes('_matchCardTimestamp(m.courtCalledAt)') && src.includes('_matchCardTimestamp(m.startedAt)'),
  'card usa chamada para espera e início real para jogo ao vivo');
ok(fs.readFileSync('js/views/chaves-adapter.js','utf8').includes("'court', 'courtCalledAt',"), 'recálculo preserva a chamada');
const formatSource=body.match(/window\._spFormatElapsed = function\(start, now\) \{[\s\S]*?\n\};/);
ok(!!formatSource, 'formatador do relógio encontrado');
if(formatSource){
  const ctx={window:{}}; vm.runInNewContext(formatSource[0],ctx);
  ok(ctx.window._spFormatElapsed(1000,1000)==='00:00:00' &&
    ctx.window._spFormatElapsed(1000,3662000)==='01:01:01' &&
    ctx.window._spFormatElapsed(1000,0)==='00:00:00', 'relógio usa hh:mm:ss e não mostra tempo negativo');
}
process.exit(fail?1:0);
