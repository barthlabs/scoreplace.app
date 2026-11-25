'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require('@playwright/test');
(async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();await page.route('http**/*',r=>r.abort());
  await page.goto('file://'+path.resolve(__dirname,'watch-engine/harness.html'));
  const open=async(patch={})=>page.evaluate(patch=>{
   window._openLiveScoring(null,null,{casual:true,p1Name:'A',p2Name:'B',isDoubles:false,sportName:'Beach Tennis',scoring:{type:'sets',customRulesVersion:1,setsToWin:1,gamesPerSet:7,fixedSet:true,fixedSetGames:7,countingType:'tennis',tieRule:'extend',tiebreakEnabled:false,tiebreakPoints:7,tiebreakMargin:2,setTwoPointAdvantage:true,tiebreakTwoPointAdvantage:true,superTiebreak:false,superTiebreakPoints:10,tiebreakAt:'4',...patch}});
   _liveServeSelect(1,0);_liveServeConfirm();
  },patch);
  const play=async(seq)=>page.evaluate(seq=>{for(const c of seq){if(_getLiveScoreState().servePickOpen){_liveServeSelect(1,0);_liveServeConfirm();}_liveScorePoint(Number(c));}return _getLiveScoreState();},seq);
  await open();let s=await play('1212121');assert.equal(s.isFinished,false,'4–3 não fecha margem dois');s=await play('1');assert.equal(s.isFinished,true);assert.deepEqual(s.games,[5,3]);
  await page.evaluate(()=>_liveScoreUndoLastPoint());assert.equal((await page.evaluate(()=>_getLiveScoreState())).isFinished,false);s=await play('1');assert.equal(s.isFinished,true,'undo/refazer atravessa fim');
  await open({setTwoPointAdvantage:false});s=await play('1212121');assert.equal(s.isFinished,true);assert.deepEqual(s.games,[4,3]);
  await open({customRulesVersion:undefined,setTwoPointAdvantage:true,tiebreakAt:'3'});s=await play('1212121');assert.equal(s.isFinished,true,'legado com flags latentes segue sete exatos');
  await open({tieRule:'tiebreak',tiebreakEnabled:true,tiebreakAt:'4'});s=await play('12121212');assert.equal(s.isTiebreak,true,'gatilho quatro inicia em 4–4');
  s=await play('1212121212121');assert.equal(s.isFinished,false,'TB 7–6 exige margem dois');s=await play('1');assert.equal(s.isFinished,true);assert.deepEqual(s.games,[5,4]);
  await open({tieRule:'tiebreak',tiebreakEnabled:true,tiebreakAt:'3',tiebreakTwoPointAdvantage:false});s=await play('121212');assert.equal(s.isTiebreak,true,'TB explícito pode preceder mínimo');s=await play('1212121212121');assert.equal(s.isFinished,true,'TB 7–6 sem margem dois fecha');
  await open({fixedSetGames:6,gamesPerSet:6,setTwoPointAdvantage:false});s=await play('121212');assert.equal(s.isFinished,false,'total par não termina empatado sem TB');s=await play('1');assert.equal(s.isFinished,true);
  await open({superTiebreak:true});s=await play('1212121212121212121');assert.equal(s.isFinished,false,'STB 10–9 não encerra com margem dois');s=await play('1');assert.equal(s.isFinished,true);assert.equal(s.isSuperTiebreak,true);
  await open({superTiebreak:true,tiebreakTwoPointAdvantage:false});s=await play('1212121212121212121');assert.equal(s.isFinished,true,'STB 10–9 encerra sem margem dois');
  await open({setsToWin:2,fixedSetGames:1,gamesPerSet:1,setTwoPointAdvantage:false,superTiebreak:true,superTiebreakPoints:3});
  s=await play('12');assert.equal(s.isFinished,false);assert.equal(s.isSuperTiebreak,true,'total suporta vários sets e STB decisivo');s=await play('111');assert.equal(s.isFinished,true);assert.equal(s.winner,1);
  const validation=await page.evaluate(()=>{
   const sc={customRulesVersion:1,fixedSet:true,fixedSetGames:7,gamesPerSet:7,setTwoPointAdvantage:true,tiebreakEnabled:false,tieRule:'extend'};
   return [_validateCustomSetScore(sc,'',4,3).ok,_validateCustomSetScore(sc,'',5,3).ok,_validateCustomSetScore({...sc,fixedSetGames:6,setTwoPointAdvantage:false},'',3,3).ok,_validateCustomSetScore({...sc,fixedSetGames:6,setTwoPointAdvantage:false},'',4,3).ok];
  });assert.deepEqual(validation,[false,true,false,true]);
  console.log('PASS: motor real aplica total mínimo, margem, gatilho escolhido, TB/STB, múltiplos sets, undo e compatibilidade legada.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
