'use strict';
const assert=require('assert/strict'),path=require('path');
const ROOT=path.join(__dirname,'..');
if(!process.env.FIRESTORE_EMULATOR_HOST){
 const {spawnSync,execFileSync}=require('child_process');
 const fs=require('fs'),os=require('os');
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'sp-l7-emulator-'));
 const port=Number(execFileSync(process.execPath,['-e',"const s=require('net').createServer();s.listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close();});"],{encoding:'utf8'}).trim());
 const config=path.join(temp,'firebase.json');
 fs.writeFileSync(config,JSON.stringify({firestore:{rules:path.join(ROOT,'tests/concurrency/firestore.allow.rules')},emulators:{firestore:{host:'127.0.0.1',port},ui:{enabled:false},singleProjectMode:true}}));
 const result=spawnSync('firebase',['emulators:exec','--only','firestore','--config',config,'--project','demo-scoreplace','node tests/l7-creation-replay-emulator.test.js'],{cwd:ROOT,encoding:'utf8',env:{...process.env,PATH:'/opt/homebrew/opt/openjdk/bin:'+process.env.PATH},timeout:180000});
 fs.rmSync(temp,{recursive:true,force:true});
 const saida=(result.stdout||'')+(result.stderr||'');
 process.stdout.write(saida);
 if(result.error)console.error(result.error);
 /* ⛔ QUEM DÁ O VEREDITO É O TESTE, NÃO O DESLIGAMENTO DO EMULADOR.
  * MEDIDO em 13/set/2026: 2 de 3 rodadas limpas terminavam em `exit 2` com o emulador
  * gravando `DatastoreException: Transaction lock timeout` — e o próprio firebase-tools
  * imprimindo, uma linha antes, "Script exited successfully (code 0)". A trava é do
  * DESLIGAMENTO da CLI, depois de o teste ter passado: este arquivo PROVOCA de propósito
  * duas transações concorrentes no mesmo documento (é o que ele veio medir), e o emulador
  * registra a disputa como erro dele. Resultado: o portão barrava publicação por sorteio.
  * ⚠️ E ISTO NÃO ENGOLE FALHA DE VERDADE: o único caminho que passa é aquele em que a
  * PRÓPRIA CLI certificou que o script saiu com 0. Script que falha nunca imprime essa
  * linha, e continua reprovando. */
 if(result.status!==0&&/Script exited successfully \(code 0\)/.test(saida)){
  console.error('\n⚠️  O TESTE PASSOU; quem falhou foi o desligamento do emulador (firebase-tools '+
   'saiu com '+result.status+' depois de certificar "Script exited successfully (code 0)").\n'+
   '   Causa medida: disputa de transação que ESTE teste provoca de propósito.\n');
  process.exit(0);
 }
 process.exit(result.status===null?1:result.status);
}
assert(/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST),'só emulador local');
process.env.GCLOUD_PROJECT='demo-scoreplace';process.env.FIREBASE_CONFIG=JSON.stringify({projectId:'demo-scoreplace'});
const functions=require('../functions-autodraw/index');
const {getFirestore}=require('module').createRequire(path.join(ROOT,'functions-autodraw/index.js'))('firebase-admin/firestore');
(async()=>{
 const db=getFirestore(),uid='l7-emulator-owner';
 await db.doc('users/'+uid).set({displayName:'Organização teste'});
 const id='tour_'+Date.now()+'_'+'b'.repeat(32);
 const request={auth:{uid,token:{}},data:{tournamentId:id,config:{name:'Copa de teste',sport:'Tênis',format:'Eliminatórias Simples'}}};
 const responses=await Promise.all([functions.createTournament.run(request),functions.createTournament.run(request)]);
 assert.equal(responses.filter(r=>r.changed).length,1);
 const doc=db.doc('tournaments/'+id),created=(await doc.get()).data();
 assert.equal(created.creatorUid,uid);assert(created._nascidoEm.toMillis()>0);assert.deepEqual(created.matches,[]);
 await doc.update({matches:[{id:'m',p1:'A',p2:'B',p1Uid:'player',p2Uid:'opponent',scoreP1:6,scoreP2:4,winner:'A'}]});
 const replay={v:2,totalPoints:1,points:[{w:1,a:0,b:0}]};
 await functions.saveTournamentReplay.run({auth:{uid:'player'},data:{tournamentId:id,matchId:'m',replay}});
 const result=(await doc.collection('results').doc('m').get()).data();
 assert.deepEqual(result.replay,replay);assert.equal(result.scoreP1,6);assert(result.playerUids.includes('player'));
 await assert.rejects(functions.saveTournamentReplay.run({auth:{uid:'stranger'},data:{tournamentId:id,matchId:'m',replay}}),{code:'permission-denied'});
 const retry=await functions.createTournament.run(request);assert.equal(retry.tournament.matches[0].scoreP1,6);
 await doc.delete();await assert.rejects(functions.createTournament.run(request),{code:'not-found'});assert(!(await doc.get()).exists);
 // Expirou há mais que a janela do ID: o coletor pode remover o recibo com segurança.
 const expiredId='tour_'+(Date.now()-3*86400000)+'_'+'c'.repeat(32);
 await db.doc('tournamentCreationRequests/'+expiredId).set({expiresAt:Date.now()-86400000});
 await functions.cleanupTournamentCreationRequests.run({});assert(!(await db.doc('tournamentCreationRequests/'+expiredId).get()).exists);
 await assert.rejects(functions.createTournament.run({...request,data:{...request.data,tournamentId:expiredId}}),{code:'invalid-argument'});
 console.log('✓ exports reais + Firestore Emulator: transação concorrente, timestamp servidor, projeção/replay por UID, exclusão/retry e limpeza de recibos');
 await db.terminate();process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
