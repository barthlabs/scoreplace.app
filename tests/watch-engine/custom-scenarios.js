'use strict';
const p=team=>({kind:'point',team}),points=s=>[...s].map(n=>p(Number(n)));
const start=[{kind:'serveSelect',team:1,idx:0},{kind:'serveConfirm'}];
const config={type:'sets',customRulesVersion:1,setsToWin:1,gamesPerSet:7,fixedSet:true,fixedSetGames:7,countingType:'tennis',tieRule:'extend',tiebreakEnabled:false,tiebreakPoints:7,tiebreakMargin:2,setTwoPointAdvantage:true,tiebreakTwoPointAdvantage:true,superTiebreak:false,superTiebreakPoints:10,tiebreakAt:'4'};
const vector=(name,patch,seq)=>({name:'custom-'+name,note:'Personalizado opt-in; regras escolhidas explicitamente, sem alterar vetores legados.',sport:'Beach Tennis',players:{p1Name:'Ana',p2Name:'Caio',isDoubles:false},config:{...config,...patch},events:[...start,...seq]});
module.exports=[
 vector('total-sete-margem-dois',{},[...points('12121211'),{kind:'undo'},p(1)]),
 vector('total-sete-sem-margem',{setTwoPointAdvantage:false},points('1212121')),
 vector('total-tb-quatro-margem-dois',{tieRule:'tiebreak',tiebreakEnabled:true},points('12121212'+'12121212121211')),
 vector('total-tb-tres-sem-margem-pontos',{tieRule:'tiebreak',tiebreakEnabled:true,tiebreakAt:'3',tiebreakTwoPointAdvantage:false},points('121212'+'1212121212121')),
 vector('stb-unico-margem-dois',{superTiebreak:true},points('12121212121212121211')),
 vector('stb-unico-sem-margem',{superTiebreak:true,tiebreakTwoPointAdvantage:false},points('1212121212121212121')),
 vector('alvo-sem-margem-com-tb',{fixedSet:false,gamesPerSet:4,setTwoPointAdvantage:false,tieRule:'tiebreak',tiebreakEnabled:true,tiebreakAt:'6'},points('1111111111111111'))
];
