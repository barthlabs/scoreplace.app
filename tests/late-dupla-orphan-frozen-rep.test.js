// ÓRFÃO DE ROSTER (dupla formada à mão) entrando na Dupla Eliminatória — estrutura nova.
//
// O órfão de roster entra em t.participants com teamOrigins==='formada' (NÃO na lista de espera, sem
// _lateJoin). Modelo ANTIGO (removido): _fillRepFillWithLateDuplas o punha num repGame vs repescado
// congelado (repfill). A árvore-mínima/repescagem foi SUBSTITUÍDA pela resolução automática. Modelo
// NOVO (dono, 2026-07-24): chave FRESCA (nada jogado) → RE-SEMEIA pro N+1 (o órfão já está em
// participants, então entra no redraw); DEPOIS de jogar → preenche um BYE materializado; jogo com
// PLACAR nunca é re-sorteado. E o GATE "novos confrontos OFF" mantém o órfão FORA. Invariantes:
// órfão entra (quando permitido), jogos REAIS disputados intactos, sem double-book, campeão único.
// Ver project_bye_rep_auto_resolution / project_formed_pair_roster_orphan.
const { window: W, sandbox, load, E } = require('./headless');
sandbox.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], body: {} };
sandbox.AppStore = { tournaments: [], logAction: () => {}, sync: () => {} };
load('tournaments-draw.js');
const dc = require('../functions-autodraw/draw-core.js');
// ⏱️ Presença tem CARIMBO DE HORA e caduca em 24h ([[project_presenca_caduca_em_24h]]).
// Produção grava sempre Date.now() (medido: 317/317 valores); o `1` daqui era atalho —
// e atalho que não existe no dado real vira teste que passa sobre código quebrado.
const _AGORA = Date.now();
const BYE = 'BYE (Avança Direto)';
const isEmpty = v => !v || v === 'TBD' || v === BYE || /^bye/i.test(String(v).trim()) || /a definir/i.test(String(v));

let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }

function mkPool(n){var a=[];for(var i=0;i<n;i++)a.push({displayName:'D'+i,name:'D'+i,uid:'u'+i});return a;}
function build(n, res){
  const CAT='Misto Obrig.';
  const cfg={format:'Dupla Eliminatória',formatCode:'elim_dupla',teamSize:2,bracketResolution:(res||'playin'),seedVip:true,thirdPlace:true,source:{type:'enrollment'},categories:[CAT]};
  const pool=mkPool(n).map(p=>Object.assign({categories:[CAT]},p));
  const t={id:'DEO'+n,format:'Dupla Eliminatória',teamSize:2,matches:[],currentPhaseIndex:0,lateEnrollment:'expand',newMatchups:true,participants:pool.slice(),teamOrigins:{},standbyParticipants:[],waitlist:[],checkedIn:{},absent:{},combinedCategories:[CAT]};
  pool.forEach(p=>{t.checkedIn[p.uid]=_AGORA;});
  const built=E.generatePhase(pool,cfg,{idPrefix:'gp',ordered:true,t,isVip:()=>false,catOf:e=>(e.categories&&e.categories[0])||''});
  E.storePhase(t,0,built);
  if(built.needsRepechageDoubleElim&&W._buildRepechageDoubleElim){(built.repMetaByCat&&built.repMetaByCat.length?built.repMetaByCat:[built.repMeta]).forEach(mm=>W._buildRepechageDoubleElim(t,mm));}
  return t;
}
const all = t => W._collectAllMatches(t) || [];
const labels = t => { const s = new Set(); all(t).forEach(m => { [m.p1,m.p2].forEach(x => { if (x && !isEmpty(x)) s.add(String(x)); }); }); return s; };
function orphan(t, idx){ const nm='LX'+idx+' / LY'+idx; t.participants.push({p1Uid:'lx'+idx,p1Name:'LX'+idx,p2Uid:'ly'+idx,p2Name:'LY'+idx,displayName:nm,name:nm,ligaActive:true}); t.teamOrigins[nm]='formada'; t.checkedIn['lx'+idx]=_AGORA; t.checkedIn['ly'+idx]=_AGORA; return nm; }
function reaisSig(t){ return all(t).filter(m=>m.winner&&!m.isBye&&!isEmpty(m.p1)&&!isEmpty(m.p2)).map(m=>m.id+'|'+m.winner+'|'+m.scoreP1+'-'+m.scoreP2).sort(); }
function liveDouble(t){ const s={}; all(t).filter(m=>!m.winner).forEach(m=>['p1','p2'].forEach(sl=>{const v=m[sl];if(v&&!isEmpty(v))(s[v]=s[v]||[]).push(m.id);})); return Object.keys(s).find(v=>s[v].length>1); }
function playout(t){
  let guard=0;
  while(guard++<800){
    const self=all(t).find(m=>m&&m.p1&&m.p2&&!isEmpty(m.p1)&&!isEmpty(m.p2)&&String(m.p1)===String(m.p2));
    if(self)return 'self@'+self.bracket+'r'+self.round;
    const p=all(t).filter(m=>m&&!m.winner&&!m.isBye&&!m.isSitOut&&m.p1&&m.p2&&!isEmpty(m.p1)&&!isEmpty(m.p2));
    if(!p.length)break;
    const m=p[0];m.winner=m.p1;m.scoreP1=6;m.scoreP2=guard%5;try{W._advanceWinner(t,m);}catch(e){return 'advance:'+e.message;}if(W._resolveRepFills)try{W._resolveRepFills(t);}catch(e){}
  }
  return null;
}

// ── SUB A: chave FRESCA + órfão de roster → re-semeia pro N+1, órfão entra ──────────────
console.log('── SUB A: chave fresca + dupla formada (órfão) → re-semeia, entra ──');
(function(){
  const t=build(12,'bye'); W.AppStore.tournaments=[t];   // bye-mode: há bye pra o órfão preencher
  const nm=orphan(t,1);
  ok(!labels(t).has(nm), 'pré: dupla formada NÃO está na chave');
  const r=dc.integrateLateEntries(t,{});
  ok(r && r.changed===true, 'SUB A: CF integrou (changed=true, preencheu bye) ['+JSON.stringify(r)+']');
  ok(labels(t).has(nm), '✅ SUB A: a dupla FORMADA entrou na chave');
  ok(!r.redrawnFresh, 'SUB A: NÃO re-semeou a chave');
  ok(!liveDouble(t), 'SUB A: sem double-book');
  const err=playout(t);
  ok(!err, 'SUB A: playout sem erro/auto-confronto ('+(err||'')+')');
  const grand=all(t).filter(m=>m.bracket==='grand');
  ok(grand.length>=1 && grand[grand.length-1].winner, 'SUB A: campeão coroado');
})();

// ── SUB B: 1ª rodada em ANDAMENTO + órfão → não toca jogo REAL, sem double-book ─────────
console.log('\n── SUB B: rodada em andamento + dupla formada → jogos reais intactos ──');
(function(){
  const t=build(5); W.AppStore.tournaments=[t];
  // joga alguns jogos REAIS da 1ª rodada (materializa byes na inferior)
  const supMin=Math.min.apply(null, all(t).filter(m=>m.bracket==='upper'||!m.bracket).map(m=>(typeof m.round==='number')?m.round:1));
  all(t).filter(m=>(m.bracket==='upper'||!m.bracket)&&((typeof m.round==='number')?m.round:1)===supMin&&!m.winner&&!m.isBye&&!isEmpty(m.p1)&&!isEmpty(m.p2)).forEach((m,i)=>{m.winner=m.p1;m.scoreP1=6;m.scoreP2=i%5;W._advanceWinner(t,m);if(W._resolveRepFills)W._resolveRepFills(t);});
  const sig0=reaisSig(t);
  const nm=orphan(t,1);
  const r=dc.integrateLateEntries(t,{});
  ok(reaisSig(t).filter(x=>sig0.indexOf(x)<0).length===0, 'SUB B: jogos REAIS disputados intactos');
  ok(!liveDouble(t), 'SUB B: sem double-book');
  const err=playout(t);
  ok(!err, 'SUB B: playout sem erro/auto-confronto ('+(err||'')+')');
  const grand=all(t).filter(m=>m.bracket==='grand');
  ok(grand.length>=1 && grand[grand.length-1].winner, 'SUB B: campeão coroado');
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
