const assert=require('assert/strict'),fs=require('fs'),path=require('path'),acorn=require('acorn'),{chromium}=require('@playwright/test');
const root=path.join(__dirname,'../');
const source=fs.readFileSync(root+'js/views/create-tournament.js','utf8');
let handler;
function visit(n){if(!n||typeof n!=='object')return;if(n.type==='AssignmentExpression'&&source.slice(n.left.start,n.left.end)==='window._saveTournamentClickHandler')handler=source.slice(n.start,n.end)+';';for(const v of Object.values(n)){if(Array.isArray(v))v.forEach(visit);else if(v&&typeof v==='object')visit(v);}}
visit(acorn.parse(source,{ecmaVersion:'latest'}));
(async()=>{const b=await chromium.launch();try{const p=await b.newPage();await p.setContent('<form id="form-create-tournament"></form><button id="btn-save-tournament">Salvar</button>');
await p.evaluate((src)=>{
 const ids=[...src.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)].map(x=>x[1]);
 for(const id of ids){if(document.getElementById(id))continue;const e=document.createElement('input');e.id=id;document.body.append(e);}
 for(const [id,v] of Object.entries({'edit-tournament-id':'e','tourn-name':'Nome editado','select-formato':'elim_simples','tourn-sport':'Tênis'})){const e=document.getElementById(id);if(e)e.value=v;}
 window._t=(k)=>k;window._autoDrawAgendadoNoForm=()=>false;window._sportBaseName=x=>x;window._gsmReadHidden=()=>({type:'simple'});
 window._allowSelfDeactEl=()=>null;window._f2GetConfig=()=>({classifAtiva:false,eliminatoria:{ativa:true}});
 window._canCreateTournament=()=>true;window._getCreateFormCategoryData=()=>({});window.closeModal=()=>{};
 window._notes=[];window.showNotification=(...x)=>window._notes.push(x);window.showAlertDialog=(...x)=>window._notes.push(x);
 window._error=(...x)=>window._notes.push(x.map(y=>String(y)));
 window.AppStore={currentUser:{uid:'owner'},tournaments:[{id:'e',name:'Antigo',format:'Eliminatórias Simples'}],addTournament:async data=>{window._sent=data;return data.id||'CREATED';}};
},handler);
await p.addScriptTag({content:fs.readFileSync(root+'js/views/format2.js','utf8')});await p.addScriptTag({content:handler});
await p.evaluate(()=>window._saveTournamentClickHandler());
const edited=await p.evaluate(()=>({sent:window._sent,notes:window._notes}));
assert.equal(edited.sent.id,'e','edição envia ID: sem ele o store criava outro torneio');
assert(edited.notes.some(n=>n[0]==='create.tournamentUpdated'));
await p.evaluate(()=>{
 document.getElementById('edit-tournament-id').value=''; document.getElementById('tourn-name').value='Nova copa';
 window._notes=[];window._beforeHash=location.hash;
 window.AppStore.addTournament=data=>{window._firstRequest=data;return new Promise((resolve,reject)=>{window._resolveCreation=resolve;window._rejectCreation=reject;});};
 window._saveTournamentClickHandler();
});
assert(await p.evaluate(()=>document.getElementById('btn-save-tournament').disabled));
assert.equal(await p.evaluate(()=>window._notes.length),0,'não anuncia sucesso antes da confirmação');
assert(await p.evaluate(()=>location.hash===window._beforeHash));
await p.evaluate(()=>window._rejectCreation(new Error('falha de rede')));
await p.waitForFunction(()=>!document.getElementById('btn-save-tournament').disabled);
assert(await p.evaluate(()=>window._notes.some(n=>n[0]==='auth.error')));
assert(await p.evaluate(()=>location.hash===window._beforeHash));
await p.evaluate(()=>{
 window._notes=[];
 window.AppStore.addTournament=async data=>{window._sameRequest=data===window._firstRequest;return 'confirmed-id';};
 return window._saveTournamentClickHandler();
});
assert(await p.evaluate(()=>window._sameRequest),'retry recupera a mesma intenção');
assert.equal(await p.evaluate(()=>location.hash),'#tournaments/confirmed-id');
assert(await p.evaluate(()=>!document.getElementById('btn-save-tournament').disabled));
console.log('✓ formulário real em Chromium: ID de edição, espera, falha sem sucesso/navegação e recuperação do mesmo pedido');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});
