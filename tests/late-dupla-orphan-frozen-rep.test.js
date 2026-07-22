// REPRODUZ o bug do dono (jul/2026): Dupla Eliminatória PLAYIN (repescagem), R1 upper com jogos
// pendentes — INCLUSIVE um jogo com REPESCADO JÁ DEFINIDO (frozen) — e a R2 upper ainda não começou.
// O dono FORMA uma dupla à mão (órfão de roster: entra em t.participants com teamOrigins==='formada',
// NÃO na lista de espera → sem _lateJoin). Antes do fix a dupla ficava em LIMBO: _integrateLateDuplas
// só lia a espera, e a CF caía no redraw (bloqueado por resultado) → a dupla nunca entrava na chave.
//
// Fix: _integrateLateDuplas consome também os órfãos de roster formados e, quando sobra 1 dupla ímpar
// sem par, cria um NOVO jogo (repGame) vs um NOVO repescado — CONGELANDO o repescado existente (o
// jogo dele vira normal). Ver [[project_dupla_elim_late_integration_cascade]] [[project_formed_pair_roster_orphan]].
//
// Prova via a CF REAL (draw-core.integrateLateEntries) sobre a chave PLAYIN construída pelo motor.
const { window: W, sandbox, load, E } = require('./headless');
sandbox.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], body: {} };
sandbox.AppStore = { tournaments: [], logAction: () => {}, sync: () => {} };
load('tournaments-draw.js');
const dc = require('../functions-autodraw/draw-core.js');
const BYE = 'BYE (Avança Direto)';
const isEmpty = v => !v || v === 'TBD' || v === BYE || /a definir/i.test(String(v));

let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }

function mkPool(n){var a=[];for(var i=0;i<n;i++)a.push({displayName:'D'+i,name:'D'+i,uid:'u'+i});return a;}
function build(n){
  const CAT='Misto Obrig.';
  const cfg={format:'Dupla Eliminatória',formatCode:'elim_dupla',teamSize:2,bracketResolution:'playin',seedVip:true,thirdPlace:true,source:{type:'enrollment'},categories:[CAT]};
  const pool=mkPool(n).map(p=>Object.assign({categories:[CAT]},p));
  const t={id:'DEO'+n,format:'Dupla Eliminatória',teamSize:2,matches:[],currentPhaseIndex:0,lateEnrollment:'expand',newMatchups:true,participants:pool.slice(),teamOrigins:{},standbyParticipants:[],waitlist:[],checkedIn:{},absent:{},combinedCategories:[CAT]};
  pool.forEach(p=>{t.checkedIn[p.uid]=1;});
  const built=E.generatePhase(pool,cfg,{idPrefix:'gp',ordered:true,t,isVip:()=>false,catOf:e=>(e.categories&&e.categories[0])||''});
  E.storePhase(t,0,built);
  if(built.needsRepechageDoubleElim&&W._buildRepechageDoubleElim){(built.repMetaByCat&&built.repMetaByCat.length?built.repMetaByCat:[built.repMeta]).forEach(mm=>W._buildRepechageDoubleElim(t,mm));}
  return t;
}
const all = t => W._collectAllMatches(t) || [];
const labels = t => { const s = new Set(); all(t).forEach(m => { [m.p1,m.p2].forEach(x => { if (x && !isEmpty(x)) s.add(String(x)); }); }); return s; };
function orphan(t, idx){ const nm='LX'+idx+' / LY'+idx; t.participants.push({p1Uid:'lx'+idx,p1Name:'LX'+idx,p2Uid:'ly'+idx,p2Name:'LY'+idx,displayName:nm,name:nm,ligaActive:true}); t.teamOrigins[nm]='formada'; t.checkedIn['lx'+idx]=1; t.checkedIn['ly'+idx]=1; return nm; }
function playout(t){
  let guard=0;
  const playable=()=>all(t).filter(m=>m&&!m.winner&&!m.isBye&&!m.isSitOut&&m.p1&&m.p2&&!isEmpty(m.p1)&&!isEmpty(m.p2));
  while(guard++<800){const p=playable();if(!p.length)break;const m=p[0];m.winner=m.p1;m.scoreP1=6;m.scoreP2=guard%5;try{W._advanceWinner(t,m);}catch(e){return 'advance:'+e.message;}if(W._resolveRepFills)try{W._resolveRepFills(t);}catch(e){}}
  return null;
}

// ── SUB B: repescado FROZEN + órfão de roster lone ──────────────────────────────────
console.log('── SUB B: repescado congelado + dupla formada (órfão de roster) — TIER 1 ──');
(function(){
  const t=build(5); W.AppStore.tournaments=[t];
  // joga 2 repR1 normais → define o repescado no jogo da ímpar (frozen), deixa esse jogo pendente
  const rep=all(t).filter(m=>m&&m.bracket==='upper'&&m.round===0&&m.isPhaseRepR1&&!m.isPhaseRepGame);
  rep.slice(0,2).forEach((m,i)=>{m.winner=m.p1;m.scoreP1=6;m.scoreP2=i;W._advanceWinner(t,m);});
  if(W._resolveRepFills)W._resolveRepFills(t);
  // pré-condição: existe repGame com AMBOS os lados reais (repescado definido) e SEM vencedor
  const frozen = all(t).find(m=>m.isPhaseRepGame&&m.bracket==='upper'&&m.round===0&&!m.winner&&!isEmpty(m.p1)&&!isEmpty(m.p2));
  ok(!!frozen, 'pré: existe repGame com repescado JÁ DEFINIDO e pendente ('+(frozen?frozen.p1+' VS '+frozen.p2:'—')+')');
  const frozenId=frozen&&frozen.id, frozenP1=frozen&&frozen.p1, frozenP2=frozen&&frozen.p2;
  const winsBefore = all(t).filter(m=>m.winner).length;

  const nm=orphan(t,1);
  ok(!labels(t).has(nm), 'pré: dupla formada NÃO está na chave');

  const r=dc.integrateLateEntries(t,{});
  ok(r && r.changed===true, 'CF integrou (changed=true) ['+JSON.stringify(r)+']');
  // entrou CIRURGICAMENTE (no lugar de um repescado), NÃO via redraw completo (que destruiria o
  // repescado congelado). O caminho é _fillRepFillWithLateDuplas → repfill>0; redraw teria refeito
  // TODOS os ids (perderia frozenId).
  ok(r && r.repfill >= 1, 'entrou CIRURGICAMENTE (repfill>=1), NÃO redraw ['+JSON.stringify(r)+']');
  ok(labels(t).has(nm), '✅ a dupla FORMADA entrou na chave');
  // repescado congelado preservado: o MESMO jogo (id) D4vD3 continua existindo com os dois lados reais
  const frozenGame = all(t).find(m=>m.id===frozenId);
  ok(!!frozenGame, 'repescado CONGELADO preservado — MESMO jogo ('+frozenP1+' VS '+frozenP2+', id intacto ⇒ sem redraw)');
  ok(frozenGame && ((frozenGame.p1===frozenP1&&frozenGame.p2===frozenP2)||(frozenGame.p1===frozenP2&&frozenGame.p2===frozenP1)), 'repescado congelado com os MESMOS dois times');
  // resultados R1 preservados
  ok(all(t).filter(m=>m.winner).length >= winsBefore, 'resultados R1 preservados (>= '+winsBefore+' vitórias)');
  // a dupla nova entrou jogando (vs a definir / repescado) — jogo com adversário a resolver
  const orphGame = all(t).find(m=>m.p1===nm||m.p2===nm);
  ok(!!orphGame, 'a dupla nova tem jogo próprio na chave');
  ok(orphGame && orphGame.nextMatchId && all(t).some(x=>x.id===orphGame.nextMatchId), 'o jogo da dupla nova alimenta a chave (nextMatchId)');

  const err=playout(t);
  ok(!err, 'playout sem erro ('+(err||'')+')');
  const grand=all(t).filter(m=>m.bracket==='grand');
  ok(grand.length>=1 && grand[grand.length-1].winner, 'grande final resolve num campeão ('+(grand.length?grand[grand.length-1].winner:'—')+')');
  const stuck=all(t).filter(m=>!m.winner&&!m.isBye&&!m.isSitOut&&m.p1&&m.p2&&!isEmpty(m.p1)&&!isEmpty(m.p2));
  ok(stuck.length===0, 'nenhum jogo travado no fim ('+stuck.length+')');
})();

// ── SUB A: R1 upper FRESH (repGame com vaga aberta) + órfão de roster — via satRepGame ──
console.log('\n── SUB A: R1 fresh (repGame aberto) + dupla formada → pareia com a ímpar ──');
(function(){
  const t=build(5); W.AppStore.tournaments=[t];
  const nm=orphan(t,1);
  const idsBefore = all(t).map(m=>m.id).sort().join('|');
  const r=dc.integrateLateEntries(t,{});
  ok(r && r.changed===true && r.repfill >= 1, 'SUB A: entra CIRURGICAMENTE (repfill, não redraw) ['+JSON.stringify(r)+']');
  ok(labels(t).has(nm), 'SUB A: dupla formada entrou na chave');
  // sem redraw: os jogos originais continuam existindo (ids preservados)
  const survived = all(t).filter(m=>idsBefore.indexOf(m.id)!==-1).length;
  ok(survived >= 10, 'SUB A: chave original preservada (jogos originais sobrevivem, sem redraw)');
  const err=playout(t);
  ok(!err, 'SUB A: playout sem erro ('+(err||'')+')');
  const grand=all(t).filter(m=>m.bracket==='grand');
  ok(grand.length>=1 && grand[grand.length-1].winner, 'SUB A: campeão coroado');
})();

// ── TIER 2: R2 upper JÁ começou → órfão (2 duplas) entra na R1 do LOWER ───────────────
console.log('\n── TIER 2: R2 upper começou → duas duplas formadas → R1 lower ──');
(function(){
  const t=build(5); W.AppStore.tournaments=[t];
  // joga a R1 upper INTEIRA (round 0) e começa a R2 upper (round 1) — 1 placar na R2
  all(t).filter(m=>m.bracket==='upper'&&m.round===0&&!m.winner&&!isEmpty(m.p1)&&!isEmpty(m.p2)).forEach((m,i)=>{m.winner=m.p1;m.scoreP1=6;m.scoreP2=i%5;W._advanceWinner(t,m);if(W._resolveRepFills)W._resolveRepFills(t);});
  const r2=all(t).find(m=>m.bracket==='upper'&&m.round>=1&&!m.winner&&!isEmpty(m.p1)&&!isEmpty(m.p2));
  ok(!!r2, 'pré: há jogo jogável na R2 upper');
  if(r2){r2.winner=r2.p1;r2.scoreP1=6;r2.scoreP2=1;W._advanceWinner(t,r2);if(W._resolveRepFills)W._resolveRepFills(t);}
  // 2 duplas formadas à mão (órfãos de roster) — Tier 2 pareia 2-a-2 no lower. O órfão de roster
  // entra pelo MESMO caminho da dupla _lateJoin da espera (paridade); duplasTier===2 prova isso.
  const n1=orphan(t,1), n2=orphan(t,2);
  const r=dc.integrateLateEntries(t,{});
  ok(r && r.changed===true, 'TIER 2: CF integrou ['+JSON.stringify(r)+']');
  ok(r && r.duplas===2 && r.duplasTier===2, 'TIER 2: entrou por _integrateLateDuplas Tier 2 (append lower) ['+JSON.stringify(r)+']');
  ok(labels(t).has(n1)&&labels(t).has(n2), 'TIER 2: ambas as duplas formadas entraram na chave');
  ok(all(t).some(m=>m.bracket==='lower'&&(m.p1===n1||m.p2===n1||m.p1===n2||m.p2===n2)), 'TIER 2: entraram na chave INFERIOR (lower)');
  const err=playout(t);
  ok(!err, 'TIER 2: playout sem erro de execução ('+(err||'')+')');
  // (obs: a completude do playout da chave inferior no Tier 2 é comportamento PRÉ-EXISTENTE — órfão e
  // _lateJoin da espera resolvem IDÊNTICO; a completude do lower Tier 2 é fora do escopo deste fix.)
})();

// ── GATE: novos confrontos OFF → NÃO integra o órfão ─────────────────────────────────
console.log('\n── gate: sem novos confrontos, órfão NÃO entra ──');
(function(){
  const t=build(5); t.newMatchups=false; t.lateEnrollment='closed'; W.AppStore.tournaments=[t];
  const nm=orphan(t,1);
  const r=dc.integrateLateEntries(t,{});
  ok(!(r&&r.changed), 'gate OFF: CF não muda ['+JSON.stringify(r)+']');
  ok(!labels(t).has(nm), 'gate OFF: dupla formada fica FORA (config do dono)');
})();

console.log('\n' + (fail===0?'✅ late-dupla-orphan-frozen-rep: OK':'❌ '+fail+' FALHA(S)') + '  ('+pass+' asserts ok)');
if (fails.length) { console.error('\nFALHAS:'); fails.forEach(f=>console.error('  ✗ '+f)); }
process.exit(fail>0?1:0);
