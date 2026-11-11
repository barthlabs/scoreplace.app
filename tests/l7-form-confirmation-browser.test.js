const assert=require('assert/strict'),fs=require('fs'),path=require('path'),acorn=require('acorn'),{chromium}=require('@playwright/test');
const root=path.join(__dirname,'../');
const source=fs.readFileSync(root+'js/views/create-tournament.js','utf8');
const storeSource=fs.readFileSync(root+'js/store.js','utf8');
const storeMethod=storeSource.slice(storeSource.indexOf('  addTournament(data) {'),storeSource.indexOf('\n  logAction(',storeSource.indexOf('  addTournament(data) {'))).replace(/,\s*$/,'');
let handler,branding,discard,askBalance,scoring;
function visit(n){if(!n||typeof n!=='object')return;if(n.type==='FunctionDeclaration'&&n.id&&n.id.name==='_perguntarEquilibrio')askBalance=source.slice(n.start,n.end);if(n.type==='AssignmentExpression'){const left=source.slice(n.left.start,n.left.end);if(left==='window._saveTournamentClickHandler')handler=source.slice(n.start,n.end)+';';if(left==='window._readTournamentBrandingPatch')branding=source.slice(n.start,n.end)+';';if(left==='window._discardCreateTournament')discard=source.slice(n.start,n.end)+';';if(left==='window._maybeShowScoringReconcile')scoring=source.slice(n.start,n.end)+';';}for(const v of Object.values(n)){if(Array.isArray(v))v.forEach(visit);else if(v&&typeof v==='object')visit(v);}}
visit(acorn.parse(source,{ecmaVersion:'latest'}));
(async()=>{const b=await chromium.launch();try{const p=await b.newPage();await p.setContent('<form id="form-create-tournament"></form><button id="btn-save-tournament">Salvar</button>');
await p.evaluate((src)=>{
 const ids=[...src.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)].map(x=>x[1]);
 for(const id of ids){if(document.getElementById(id))continue;const e=document.createElement('input');e.id=id;document.body.append(e);}
 for(const [id,v] of Object.entries({'edit-tournament-id':'e','tourn-name':'Nome editado','select-formato':'elim_simples','tourn-sport':'Tênis'})){const e=document.getElementById(id);if(e)e.value=v;}
 window._t=(k)=>k;window._autoDrawAgendadoNoForm=()=>false;window._sportBaseName=x=>x;window._gsmReadHidden=()=>({type:'simple'});
 window._readRegistrationSettings=()=>({source:'scoreplace',pricing:{mode:'single',cents:0}});
 window._allowSelfDeactEl=()=>null;window._f2GetConfig=()=>({classifAtiva:false,eliminatoria:{ativa:true}});
 window._readRegistrationSettings=()=>({source:'scoreplace',pricing:{mode:'single',cents:0,centsByCategory:{}}});
 window._spinButton=(btn,label)=>{btn.disabled=true;btn.innerHTML='<span class="btn-spinner"></span>'+label;};
 window._spinButtonDone=(btn)=>{btn.disabled=false;btn.innerHTML='Salvar';};
 window._canCreateTournament=()=>true;window._getCreateFormCategoryData=()=>({});window._readEstimatedGameHours=()=>null;window._readPhaseCallOrder=()=>null;window.closeModal=()=>{};
 window._notes=[];window.showNotification=(...x)=>window._notes.push(x);window.showAlertDialog=(...x)=>window._notes.push(x);
 window._error=(...x)=>window._notes.push(x.map(y=>String(y)));
 window.AppStore={currentUser:{uid:'owner'},tournaments:[{id:'e',name:'Antigo',format:'Eliminatórias Simples'}],addTournament:async data=>{window._sent=data;return data.id||'CREATED';}};
},handler);
await p.addScriptTag({content:fs.readFileSync(root+'js/views/format2.js','utf8')});await p.addScriptTag({content:askBalance+';'+scoring+branding+handler+discard});
await p.addScriptTag({content:'window._actualStoreAdd=({' + storeMethod + '}).addTournament;'});
await p.evaluate(()=>{window._realMaybeShowScoringReconcile=window._maybeShowScoringReconcile;window._maybeShowScoringReconcile=()=>false;});
await p.evaluate(()=>{
 window._tvEditorHasChanges=()=>true;
 window._tvEditorSaveChanges=async()=>{window._tvSaved=true;};
});
await p.evaluate(()=>window._saveTournamentClickHandler());
assert(await p.evaluate(()=>window._tvSaved),'Salvar do topo publica a tela No ar editada');
assert.equal(await p.evaluate(()=>window._sent),undefined,'salvar tela não reenvia a grade publicada');
assert.equal(await p.evaluate(()=>window.AppStore.tournaments[0].name),'Antigo','Salvar da TV não altera a ficha junto');
assert(await p.evaluate(()=>window._notes.some(n=>n[0]==='Personalização salva')));
await p.evaluate(()=>{
 window._tvEditorHasChanges=()=>false;window._sent=undefined;window._notes=[];
 window.AppStore.tournaments[0].logoUrl='https://storage.example/logo-old.png';
 const logo=document.getElementById('tourn-logo-data');logo.value='data:image/png;base64,AAAA';
});
await p.evaluate(()=>window._saveTournamentClickHandler());
assert.deepEqual(await p.evaluate(()=>Object.keys(window._sent).sort()),['id','logoData'],
 'salvar novo logo envia só o logo, sem grade, jogos ou campos da ficha');
assert(await p.evaluate(()=>window._notes.some(n=>n[0]==='Personalização salva')));
await p.evaluate(()=>{document.getElementById('tourn-logo-data').value='';window._notes=[];});
await p.evaluate(()=>window._saveTournamentClickHandler());
const edited=await p.evaluate(()=>({sent:window._sent,notes:window._notes}));
assert.equal(edited.sent.id,'e','edição envia ID: sem ele o store criava outro torneio');
assert(!Object.hasOwn(edited.sent,'logoData'),'logo vazio durante a carga não remove o logo existente');
assert(edited.notes.some(n=>n[0]==='create.tournamentUpdated'));
await p.evaluate(()=>{
 window.AppStore.tournaments[0].coverMode='photo';
 window.AppStore.tournaments[0].coverUrl='https://storage.example/cover-old.png';
 window.AppStore.tournaments[0].matches=[{id:'published-match-1',court:'Quadra 1'}];
 document.getElementById('tourn-cover-mode').value='photo';
 document.getElementById('tourn-cover-data').value='';
 window._editLogoHydrating='e';
 window._sent=undefined;
 return window._saveTournamentClickHandler();
});
assert(!Object.hasOwn(await p.evaluate(()=>window._sent),'coverPhotoData'),'capa ainda hidratando não vira remoção');
assert.equal(await p.evaluate(()=>window._sent.coverMode),'photo','capa publicada continua no modo foto durante a hidratação');
assert(!Object.hasOwn(await p.evaluate(()=>window._sent),'coverUrl'),'salvar ficha não apaga a URL publicada da capa');
await p.evaluate(()=>{
 window._stubAddTournament=window.AppStore.addTournament;
 window.AppStore.addTournament=window._actualStoreAdd;
 window.AppStore._saveToCache=()=>{};
 window._remotePatch=undefined;
 window._callCF=async (_name,command)=>{window._remotePatch=command.patch;return {data:{tournament:{id:'e',coverMode:'photo',coverUrl:'https://storage.example/cover-old.png'}}};};
 return window._saveTournamentClickHandler();
});
assert(!Object.hasOwn(await p.evaluate(()=>window._remotePatch),'coverUrl'),'com hidratação ativa, o comando real da store preserva a URL da capa');
assert.equal(await p.evaluate(()=>window.AppStore.tournaments[0].coverUrl),'https://storage.example/cover-old.png');
assert.deepEqual(await p.evaluate(()=>window.AppStore.tournaments[0].matches),[{id:'published-match-1',court:'Quadra 1'}],
 'salvar a ficha durante o torneio preserva os jogos publicados');
await p.evaluate(()=>{window.AppStore.addTournament=window._stubAddTournament;});
await p.evaluate(()=>{window._editLogoHydrating='';window._sent=undefined;return window._saveTournamentClickHandler();});
assert(!Object.hasOwn(await p.evaluate(()=>window._sent),'coverPhotoData'),'foto publicada sem base64 também é omitida depois da hidratação');
assert.equal(await p.evaluate(()=>window._sent.coverMode),'photo');
await p.evaluate(()=>{window._editLogoHydrating='';window.AppStore.tournaments[0].coverMode='color';window.AppStore.tournaments[0].coverUrl='';document.getElementById('tourn-cover-mode').value='color';});
await p.evaluate(()=>{window._logoRemovalRequested=true;window._sent=undefined;window._notes=[];});
await p.evaluate(()=>window._saveTournamentClickHandler());
assert.deepEqual(await p.evaluate(()=>window._sent),{id:'e',logoData:''},
 'somente remover o logo explicitamente envia o campo vazio');
await p.evaluate(()=>{
 window._logoRemovalRequested=true;
 window._discardCreateTournament();
 window.AppStore.tournaments.push({id:'outro',name:'Outro',logoUrl:'https://storage.example/outro.png',coverColor:'#000000'});
 document.getElementById('edit-tournament-id').value='outro';
 document.getElementById('tourn-cover-color').value='#123456';
 window._sent=undefined;
 return window._saveTournamentClickHandler();
});
assert.equal(await p.evaluate(()=>window._logoRemovalRequested),false,'descartar limpa intenção de remover logo');
assert.equal(await p.evaluate(()=>window._sent.coverColor),'#123456');
assert(!Object.hasOwn(await p.evaluate(()=>window._sent),'logoData'),'salvar outro torneio após descartar não remove seu logo');
await p.evaluate(()=>{
 window._logoRemovalRequested=true;
 document.getElementById('tourn-logo-data').value='';
 window.AppStore.addTournament=async()=>{throw new Error('falha de rede');};
 return window._saveTournamentClickHandler();
});
assert.equal(await p.evaluate(()=>window._logoRemovalRequested),false,'erro de gravação limpa a intenção de remover logo');
await p.evaluate(()=>{
 window.AppStore.addTournament=async data=>{window._sent=data;return data.id;};
 window.AppStore.tournaments[0].logoUrl='';
 window.AppStore.tournaments[0].coverColor=document.getElementById('tourn-cover-color').value;
 document.getElementById('edit-tournament-id').value='e';
 document.getElementById('tourn-logo-data').value='';
 window._logoRemovalRequested=true;
 window._autoDrawAgendadoNoForm=()=>true;
 window._showDrawBalanceOverlay=opts=>{window._pendingBalance=opts;};
 return window._saveTournamentClickHandler();
});
assert.equal(await p.evaluate(()=>window._logoRemovalRequested),false,'aguardar decisão do sorteio não deixa remoção do logo pendente');
await p.evaluate(()=>{window._pendingBalance.onCancel();window._autoDrawAgendadoNoForm=()=>false;window.AppStore.tournaments[0].logoUrl='https://storage.example/logo-old.png';window._sent=undefined;return window._saveTournamentClickHandler();});
assert(!Object.hasOwn(await p.evaluate(()=>window._sent),'logoData'),'Salvar após cancelar sorteio preserva o logo');
await p.evaluate(()=>{
 window.AppStore.tournaments[0].logoUrl='';
 window._logoRemovalRequested=true;
 window._maybeShowScoringReconcile=window._realMaybeShowScoringReconcile;
 window._readScoringFromForm=()=>({type:'sets'});
 window._scoringMeaningfullyChanged=()=>true;
 window._scoringReconcileImpact=()=>({playedCount:1});
 window._showScoringChangePreview=(...args)=>{window._pendingScoring=args;};
 return window._saveTournamentClickHandler();
});
assert.equal(await p.evaluate(()=>window._logoRemovalRequested),false,'aguardar decisão da pontuação não deixa remoção do logo pendente');
await p.evaluate(()=>{window._pendingScoring[6]();window._maybeShowScoringReconcile=()=>false;window.AppStore.tournaments[0].logoUrl='https://storage.example/logo-old.png';window._sent=undefined;return window._saveTournamentClickHandler();});
assert(!Object.hasOwn(await p.evaluate(()=>window._sent),'logoData'),'Salvar após cancelar pontuação preserva o logo');
await p.evaluate(()=>{
 document.getElementById('edit-tournament-id').value=''; document.getElementById('tourn-name').value='Nova copa';
 window._notes=[];window._beforeHash=location.hash;
 window.AppStore.addTournament=data=>{window._firstRequest=data;return new Promise((resolve,reject)=>{window._resolveCreation=resolve;window._rejectCreation=reject;});};
 window._saveTournamentClickHandler();
});
assert(await p.evaluate(()=>document.getElementById('btn-save-tournament').disabled));
assert(await p.evaluate(()=>document.getElementById('btn-save-tournament').textContent.includes('Salvando…')),'o salvar pendente informa visualmente que está processando');
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
