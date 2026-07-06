/* Pontos Avançados por UID (v4.4.115) — dirige _calcAdvancedPoints REAL.
 * Bug do dono: uma cloud function reescreveu por NOME os jogos da "Vivian" pra "Vivi Hirata"
 * (homônimos de prefixo, uids diferentes) → a Vivi Hirata somava 6 games onde eram 3.
 * Fix: o jogo guarda team1Uids/team2Uids e o PA casa por UID — jogo com nome clobberado
 * mas uid da Vivian NÃO conta pra Vivi Hirata. node tests/pa-uid-identity.test.js
 *
 * FALHA no comportamento antigo (casa por nome → 6), PASSA no novo (casa por uid → 3).
 */
const { window: W } = require('./headless.js');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }
function eq(a, b, m) { ok(a === b, m + ' (esperado ' + b + ', veio ' + a + ')'); }

const VIVI = 'gaIXhirata', VIAN = 'WOwzvivian';
// grupo Rei/Rainha de 4 → 3 jogos. teamUids paralelos aos nomes.
function grp(names, uids, clobberNameTo) {
  // se clobberNameTo: troca o 1º nome (índice 0) por esse nome (simula o clobber por string),
  // mas MANTÉM os uids corretos (o clobber só mexe em string).
  const nm = names.slice(); if (clobberNameTo) nm[0] = clobberNameTo;
  const pr = [[[0,1],[2,3]],[[0,2],[1,3]],[[0,3],[1,2]]];
  return pr.map((p,mi)=>({
    id:'m-'+names.join('')+'-'+mi, round:1, isMonarch:true, monarchGroup:0,
    team1:[nm[p[0][0]],nm[p[0][1]]], team2:[nm[p[1][0]],nm[p[1][1]]],
    team1Uids:[uids[p[0][0]],uids[p[0][1]]], team2Uids:[uids[p[1][0]],uids[p[1][1]]],
    p1:nm[p[0][0]]+' / '+nm[p[0][1]], p2:nm[p[1][0]]+' / '+nm[p[1][1]],
    winner:(nm[p[0][0]]+' / '+nm[p[0][1]]), scoreP1:6, scoreP2:3
  }));
}
function mkT(clobber) {
  const viviGames = grp(['Sonia','Vivi Hirata','Luiza','Thais'], ['u5',VIVI,'u6','u7']); // grupo real da Vivi
  const vianGames = grp(['Vivian','Marjorie','Rodrigo','Vanessa'], [VIAN,'u3','u4','u8'], clobber ? 'Vivi Hirata' : null); // grupo da Vivian (nome clobberado)
  return {
    advancedScoring:{enabled:true,applyLiveScoring:false,categories:{participation:{enabled:true,value:100},match_won:{enabled:true,value:50},game_won:{enabled:true,value:10},game_lost:{enabled:true,value:-5}}},
    participants:[
      {uid:VIVI,displayName:'Vivi Hirata',name:'Vivi Hirata',ligaActive:true},
      {uid:VIAN,displayName:'Vivian',name:'Vivian',ligaActive:true},
      {uid:'u3',displayName:'Marjorie',name:'Marjorie'},{uid:'u4',displayName:'Rodrigo',name:'Rodrigo'},
      {uid:'u5',displayName:'Sonia',name:'Sonia'},{uid:'u6',displayName:'Luiza',name:'Luiza'},
      {uid:'u7',displayName:'Thais',name:'Thais'},{uid:'u8',displayName:'Vanessa',name:'Vanessa'}
    ],
    rounds:[{round:1,format:'rei_rainha',matches:viviGames.concat(vianGames)}]
  };
}
function count(r,key){let c=0;(r.breakdown||[]).forEach(mb=>(mb.items||[]).forEach(it=>{if(it.key===key)c+=it.count;}));return c;}

// ── 1. nomes CORRETOS (sem clobber): Vivi Hirata = 3 jogos ──
(function(){
  const r = W._calcAdvancedPoints(mkT(false),'Vivi Hirata',null);
  eq(count(r,'participation'),3,'sem clobber: Vivi Hirata 3 participações');
})();

// ── 2. NOME CLOBBERADO (o bug real): os 3 jogos da Vivian viraram "Vivi Hirata" por STRING,
//       mas os uids são da Vivian → PA por uid NÃO conta pra Vivi Hirata (segue 3, não 6) ──
(function(){
  const r = W._calcAdvancedPoints(mkT(true),'Vivi Hirata',null);
  eq(count(r,'participation'),3,'COM clobber: Vivi Hirata continua 3 (por uid, não 6)');
  eq(count(r,'game_won'),12,'COM clobber: games ganhos só dos jogos DELA (6+3+3), não dobrado');
})();

// ── 3. a Vivian NÃO some: pelos uids, os jogos dela contam pra ELA mesmo com nome clobberado ──
(function(){
  const r = W._calcAdvancedPoints(mkT(true),'Vivian',null);
  eq(count(r,'participation'),3,'Vivian mantém 3 participações (por uid, apesar do nome clobberado)');
})();

console.log((fail===0?'✅':'❌')+' pa-uid-identity: '+pass+' ok, '+fail+' falharam');
process.exit(fail===0?0:1);
