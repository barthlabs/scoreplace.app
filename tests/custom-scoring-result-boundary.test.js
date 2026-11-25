'use strict';
const assert=require('node:assert/strict');
const W=require('../functions-autodraw/draw-core')._window;
const base={type:'sets',customRulesVersion:1,setsToWin:1,gamesPerSet:7,fixedSet:true,fixedSetGames:7,setTwoPointAdvantage:true,tiebreakTwoPointAdvantage:true,tiebreakPoints:7,tiebreakMargin:2,tiebreakEnabled:false,tieRule:'extend',tiebreakAt:'4',superTiebreak:false,superTiebreakPoints:10};
function tour(sc=base){return {id:'synthetic-result',format:'Liga',sport:'Beach Tennis',scoring:{...sc},matches:[{id:'m',p1:'A',p2:'B',group:0}],groups:[],rounds:[]};}
for(const path of ['manual','live','sumula']){
 const payload=(a,b)=>path==='live'?{gsmFinal:true,isFixedSet:true,sets:[{gamesP1:a,gamesP2:b}],setsWonP1:1,setsWonP2:0}:{s1:a,s2:b,useSets:true,isFixedSet:true};
 let t=tour();assert.throws(()=>W._applyResultToTournament(t,'m',payload(4,3)),/encerra|terminado/);assert.equal(t.matches[0].winner,undefined,path+' inválido não escreve vencedor');
 t=tour();W._applyResultToTournament(t,'m',payload(5,3));assert.equal(t.matches[0].winner,'A');assert.equal(t.matches[0].sets[0].gamesP1,5,path+' guarda placar prorrogado');
 t=tour({...base,fixedSetGames:6,setTwoPointAdvantage:false});assert.throws(()=>W._applyResultToTournament(t,'m',payload(3,3)));W._applyResultToTournament(t,'m',payload(4,3));assert.equal(t.matches[0].winner,'A');
 t=tour({...base,customRulesVersion:undefined});W._applyResultToTournament(t,'m',payload(4,3));assert.equal(t.matches[0].winner,'A',path+' resultado legado permanece válido');
}
const tb=W._tbPoints(8,6),sc={...base,tieRule:'tiebreak',tiebreakEnabled:true};
let t=tour(sc);assert.throws(()=>W._applyResultToTournament(t,'m',{s1:5,s2:4,useSets:true,isFixedSet:true,isTiebreakEntry:true,tbP1:7,tbP2:6}),/pontos/);
t=tour(sc);W._applyResultToTournament(t,'m',{gsmFinal:true,isFixedSet:true,sets:[{gamesP1:5,gamesP2:4,tiebreak:tb}],setsWonP1:1,setsWonP2:0});assert.equal(t.matches[0].winner,'A');assert.equal(t.matches[0].sets[0].tiebreak.pointsP1,8);
t=tour({...base,superTiebreak:true});assert.throws(()=>W._applyResultToTournament(t,'m',{s1:10,s2:9,useSets:true,isFixedSet:true}),/super tie-break/);W._applyResultToTournament(t,'m',{s1:11,s2:9,useSets:true,isFixedSet:true});assert.equal(t.matches[0].sets[0].superTiebreak,true);
assert.equal(W._validateCustomSetScore({...sc,fixedSet:false,gamesPerSet:4,tiebreakAt:'3'},'',5,3).ok,false,'alvo convencional não pode saltar o tie-break em 3–3');
for(const setsToWin of [2,3]) {
 const progress=tour({...base,setsToWin});
 W._applyResultToTournament(progress,'m',{setsInProgress:true,sets:[{gamesP1:5,gamesP2:3}],setsWonP1:1,setsWonP2:0,at:1});
 assert.equal(progress.matches[0].winner,undefined,'set completo não encerra partida de '+setsToWin+' sets');
 assert.equal(progress.matches[0].sets.length,1);
 assert.throws(()=>W._applyResultToTournament(progress,'m',{setsInProgress:true,sets:[{gamesP1:5,gamesP2:3},{gamesP1:4,gamesP2:3}],setsWonP1:2,setsWonP2:0,at:2}),/encerra/);
 assert.equal(progress.matches[0].sets.length,1,'set parcial rejeitado não altera o confirmado');
}
assert.equal(W._validateNormalSetScore({...base,tieRule:'extend',tiebreakEnabled:true},'',5,4).ok,false,'UI respeita tieRule mesmo se espelho TB estiver inconsistente');
console.log('PASS: fronteira canônica do servidor valida resultado manual/live/súmula, TB/STB e legado sem mutar resultado inválido.');
