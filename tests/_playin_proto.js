// Prototype: reconstruct the CLASSIC PLAY-IN dupla-elim structure (project_bye_rep_auto_resolution).
// Validates seeding + wiring by full playout: no self-match, no double-book, no stuck, 1 champion.
// Mirrors what _duplaR1FromPool + _buildRepechageDoubleElim + _rebuildLowerBracket will produce.
'use strict';
function pow2below(n){ let p=1; while(p*2<=n) p*=2; return p; }

// Build the whole bracket as plain match objects with nextMatchId/nextSlot + loserMatchId/loserSlot.
function build(N){
  const P_lo = pow2below(N);
  const isPow2 = (N & (N-1))===0;
  const P_hi = isPow2 ? N : P_lo*2;
  const reps = N - P_lo;        // playin games (down to P_lo)
  const byes = P_hi - N;        // byes (up to P_hi)
  const mode = isPow2 ? 'pow2' : (byes <= reps ? 'bye' : 'playin'); // tie->bye
  const M=[]; let c=0;
  const mk=(bracket,round,ex)=>{ const m=Object.assign({id:'m'+(c++),bracket,round,p1:null,p2:null,winner:null},ex||{}); M.push(m); return m; };
  const BYE='__BYE__';
  const seedName=s=>'S'+s;

  // ---- UPPER ----
  const T = (mode==='bye') ? P_hi : P_lo;     // upper pow2 size
  const W = Math.round(Math.log2(T));
  const upper={};
  // R1 (round 1): T/2 games, mirror seed 1xT
  upper[1]=[];
  for(let j=0;j<T/2;j++) upper[1].push(mk('upper',1));
  // play-in R0 (playin mode only): reps games among worst 2*reps seeds
  let playin=[]; const direct = mode==='playin' ? (2*P_lo - N) : 0;
  if(mode==='playin'){
    for(let k=0;k<reps;k++){
      const g=mk('upper',0,{isPlayIn:true});
      g.p1=seedName(direct+k); g.p2=seedName(N-1-k);
      playin.push(g);
    }
  }
  // fill R1 sup slots
  // seed s -> game min(s,T-1-s), slot p1 if s<T/2 else p2
  const r1slot = s => { const j=Math.min(s,T-1-s); return {g:upper[1][j], slot:(s<T/2?'p1':'p2')}; };
  if(mode==='bye'){
    for(let s=0;s<T;s++){ const {g,slot}=r1slot(s); g[slot]= s<N?seedName(s):BYE; }
  } else { // playin
    // direct teams 0..direct-1 by seed; playin winners fill direct..T-1 via nextMatchId
    for(let s=0;s<direct;s++){ const {g,slot}=r1slot(s); g[slot]=seedName(s); }
    playin.forEach((g,k)=>{ const s=direct+k; const {g:rg,slot}=r1slot(s); g.nextMatchId=rg.id; g.nextSlot=slot; });
  }
  // upper R2..W halving
  for(let r=2;r<=W;r++){ upper[r]=[]; const pc=upper[r-1].length/2; for(let j=0;j<pc;j++) upper[r].push(mk('upper',r)); upper[r-1].forEach((pm,idx)=>{ const nm=upper[r][Math.floor(idx/2)]; pm.nextMatchId=nm.id; pm.nextSlot=(idx%2===0?'p1':'p2'); }); }
  // bye games auto-advance winner into R2 at build (winner known)
  if(mode==='bye'){
    upper[1].forEach(m=>{ const isBye = m.p1===BYE||m.p2===BYE; if(isBye){ m.winner = m.p1===BYE?m.p2:m.p1; m.isBye=true; if(m.nextMatchId){ const nx=M.find(x=>x.id===m.nextMatchId); nx[m.nextSlot]=m.winner; } } });
  }

  // ---- LOWER ----
  // preRound entrants: upper-R1 real losers + playin losers
  const realR1 = upper[1].filter(m=>!m.isBye);
  const preEntrants = realR1.length + (mode==='playin'?playin.length:0);
  const preGames = Math.ceil(preEntrants/2);
  let lround=0; const lower=[];
  const lr=(g)=>{ lround++; const a=[]; for(let i=0;i<g;i++) a.push(mk('lower',lround)); return a; };
  const slotsOf=arr=>{const s=[];arr.forEach(m=>{s.push({m,s:'p1'});s.push({m,s:'p2'});});return s;};
  let prev = lr(preGames);
  { const s=slotsOf(prev); let si=0;
    realR1.forEach(um=>{ const sl=s[si++]; um.loserMatchId=sl.m.id; um.loserSlot=sl.s; });
    if(mode==='playin') playin.forEach(pg=>{ const sl=s[si++]; pg.loserMatchId=sl.m.id; pg.loserSlot=sl.s; });
    for(;si<s.length;si++){ const sl=s[si]; sl.m[sl.s]=BYE; } // odd -> BYE (both modes)
  }
  // merges: upper R2..W losers
  const mergeUppers=[]; for(let r=2;r<=W;r++) mergeUppers.push(upper[r]);
  let alive=prev.length;
  for(let w=0;w<mergeUppers.length;w++){
    const upL=mergeUppers[w]; let ent=alive+upL.length; const rep=ent%2; ent+=rep; const merge=lr(ent/2);
    const s=slotsOf(merge); let si=0;
    prev.forEach(pm=>{ const sl=s[si++]; pm.nextMatchId=sl.m.id; pm.nextSlot=sl.s; });
    upL.forEach(um=>{ const sl=s[si++]; um.loserMatchId=sl.m.id; um.loserSlot=sl.s; });
    if(rep){ const sl=s[si++]; sl.m[sl.s]=BYE; }
    prev=merge; alive=merge.length;
  }
  while(alive>1){ let b=alive; const rep=b%2; b+=rep; const battle=lr(b/2); const s=slotsOf(battle); let si=0; prev.forEach(pm=>{const sl=s[si++]; pm.nextMatchId=sl.m.id; pm.nextSlot=sl.s;}); if(rep){const sl=s[si++]; sl.m[sl.s]=BYE;} prev=battle; alive=battle.length; }
  // grand final
  const gf=mk('grand',W+1);
  const upChamp=upper[W][0]; upChamp.nextMatchId=gf.id; upChamp.nextSlot='p1';
  if(prev[0]){ prev[0].nextMatchId=gf.id; prev[0].nextSlot='p2'; }
  return {M,mode,P_lo,P_hi,reps,byes,direct,W,gf};
}

const isE=v=>!v||v===BYEc;
const BYEc='__BYE__';
function advance(M,m){
  // winner -> nextMatchId slot; loser -> loserMatchId slot
  const w=m.winner, l = (m.p1===w?m.p2:m.p1);
  if(m.nextMatchId){ const nx=M.find(x=>x.id===m.nextMatchId); if(nx) nx[m.nextSlot]=w; }
  if(m.loserMatchId){ const nx=M.find(x=>x.id===m.loserMatchId); if(nx) nx[m.loserSlot]=l; }
}
function liveDbl(M){ const slots={}; M.filter(m=>!m.winner).forEach(m=>['p1','p2'].forEach(s=>{const v=m[s]; if(v&&v!==BYEc)(slots[v]=slots[v]||[]).push(m.bracket+m.round);})); return Object.keys(slots).find(v=>slots[v].length>1); }
function playout(N,pick){
  const {M,gf,mode}=build(N);
  // auto-resolve byes present at build
  let guard=0;
  while(guard++<9999){
    const self=M.find(m=>m.p1&&m.p2&&m.p1!==BYEc&&m.p2!==BYEc&&m.p1===m.p2); if(self) return 'SELF@'+self.bracket+self.round;
    const db=liveDbl(M); if(db) return 'DBL:'+db;
    // resolve BYE matches (one real side)
    const byeM=M.find(m=>!m.winner&&((m.p1===BYEc&&m.p2&&m.p2!==BYEc)||(m.p2===BYEc&&m.p1&&m.p1!==BYEc)));
    if(byeM){ byeM.winner=byeM.p1===BYEc?byeM.p2:byeM.p1; byeM.isBye=true; advance(M,byeM); continue; }
    const live=M.filter(m=>!m.winner&&m.p1&&m.p2&&m.p1!==BYEc&&m.p2!==BYEc);
    if(!live.length) break;
    const m=live[0]; m.winner=pick(m,guard); advance(M,m);
  }
  const stuck=M.filter(m=>!m.winner&&m.p1&&m.p2&&m.p1!==BYEc&&m.p2!==BYEc);
  if(stuck.length) return 'STUCK:'+stuck.length;
  const g=M.find(x=>x.id===gf.id); if(!g.winner) return 'NOCHAMP';
  return 'clean';
}
const PATS=[['p1',m=>m.p1],['p2',m=>m.p2],['alt',(m,g)=>g%2?m.p1:m.p2],['alt2',(m,g)=>g%3?m.p2:m.p1]];
const probs=[]; const stats={};
for(let N=3;N<=48;N++){ if((N&(N-1))===0) continue; const {mode,reps,byes}=build(N); stats[N]=mode+'(r'+reps+'/b'+byes+')';
  for(const p of PATS){ const r=playout(N,p[1]); if(r!=='clean') probs.push('N'+N+'/'+p[0]+'='+r+' ['+stats[N]+']'); }
}
console.log('modes:', Object.keys(stats).map(n=>n+':'+stats[n]).join(' '));
console.log(probs.length? probs.length+' PROBLEMS:\n'+probs.join('\n') : 'ALL CLEAN (N=3..48 non-pow2, 4 patterns)');
