'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createRequire } = require('node:module');
const project = 'demo-scoreplace';

async function run() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    const fs = require('node:fs');
    const os = require('node:os');
    const net = require('node:net');
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-group-config-'));
    try {
      const port = await new Promise((resolve, reject) => {
        const server = net.createServer();
        server.on('error', reject).listen(0, '127.0.0.1', () => {
          const value = server.address().port;
          server.close(() => resolve(value));
        });
      });
      const config = path.join(temp, 'firebase.json');
      fs.writeFileSync(config, JSON.stringify({ emulators: { firestore: { host: '127.0.0.1', port }, ui: { enabled:false } } }));
      const output = require('./emulador').rodarNoEmulador(['emulators:exec', '--only', 'firestore', '--project', project,
        '--config', config, 'node tests/group-category-config-emulator.test.js'], {
        cwd: path.resolve(__dirname, '..'), env: { ...process.env, PATH: '/opt/homebrew/opt/openjdk/bin:' + process.env.PATH },
        timeout: 120000, stdio:['ignore','pipe','pipe']
      });
      assert.match(output, /group category config: OK/);
    } finally { fs.rmSync(temp, { recursive:true, force:true }); }
    return;
  }
  assert.match(process.env.FIRESTORE_EMULATOR_HOST, /^127\.0\.0\.1:\d+$/);
  process.env.GCLOUD_PROJECT = project;
  process.env.FIREBASE_CONFIG = JSON.stringify({ projectId:project });
  const api = require('../functions-autodraw/index.js');
  const backend = createRequire(require.resolve('../functions-autodraw/index.js'));
  const db = backend('firebase-admin/firestore').getFirestore();
  const fmt = backend('./draw-core.js')._window.FORMAT2;
  const invoke = (name,data,uid='B17n7JCXYOfqahlcLZ0fKxGGyUu1') => api[name].run({auth:{uid,token:{uid}},data,rawRequest:{headers:{}}});
  const id = 'tour_' + Date.now() + '_' + require('node:crypto').randomBytes(16).toString('hex');
  const categories = ['Alpha','Beta'];
  const cfg = fmt.defaultConfig('Beach Tennis');
  cfg.disputa = 'individual'; cfg.parceria = null;
  cfg.classifAtiva = true; cfg.eliminatoria.ativa = false;
  cfg.rodadas.modo = 'todos'; cfg.rodadas.turnos = 'ida';
  cfg.groupFormation = {mode:'count',value:1};
  cfg.groupCategoryRules = [
    {category:'Alpha',groupFormation:{mode:'count',value:2},gamesPerUnit:3},
    {category:'Beta',groupFormation:{mode:'count',value:1},gamesPerUnit:5}
  ];
  const projected=fmt.compileToPhases(cfg,{sport:'Beach Tennis',categories});
  const created = await invoke('createTournament',{tournamentId:id,config:{...projected.topLevel,name:'Configuração sintética',
    sport:'Beach Tennis',fmt2:cfg,combinedCategories:categories}});
  assert.equal(created.ok,true,JSON.stringify(created));
  const ref = db.collection('tournaments').doc(id);
  let saved=(await ref.get()).data();
  assert.deepEqual(saved.fmt2.groupCategoryRules,cfg.groupCategoryRules);
  assert.deepEqual(saved.phases[0].classification.groupCategoryRules,cfg.groupCategoryRules);
  assert.equal(saved.phases.length,1);
  await ref.update({testModeEnabled:true});
  const fullForm={...projected.topLevel,fmt2:cfg,phases:structuredClone(projected.phases)};
  fullForm.phases[0].gruposCount=99; // uma geometria enviada pela aba não substitui o intent fresco
  await invoke('updateTournamentConfiguration',{tournamentId:id,patch:fullForm});
  saved=(await ref.get()).data();
  assert.deepEqual(saved.groupFormation,cfg.groupFormation);
  assert.equal(saved.phases[0].gruposCount,projected.phases[0].gruposCount);
  for(const bad of [{mode:'size',value:1},{mode:'count',value:1.5},{mode:'count',value:1,extra:true},{count:1,size:8}])
    await assert.rejects(invoke('updateTournamentConfiguration',{tournamentId:id,patch:{groupFormation:bad}}),{code:'invalid-argument'});
  await assert.rejects(invoke('updateTournamentConfiguration',{tournamentId:id,patch:{groupFormation:{mode:'count',value:2}}}),{code:'invalid-argument'});

  await assert.rejects(invoke('updateTournamentConfiguration',{tournamentId:id,patch:{name:'não salvar',fmt2:cfg}},'visitor'),
    {code:'permission-denied'});
  const older=structuredClone(cfg);delete older.groupCategoryRules;
  const compatible=await invoke('updateTournamentConfiguration',{tournamentId:id,patch:{name:'Edição antiga compatível',fmt2:older}});
  assert.equal(compatible.ok,true,JSON.stringify(compatible));
  saved=(await ref.get()).data();
  assert.deepEqual(saved.fmt2.groupCategoryRules,cfg.groupCategoryRules,'versão anterior compatível conserva regras novas');
  assert.equal(saved.testModeEnabled,true);
  const invalid=structuredClone(cfg);invalid.groupCategoryRules[1].category='não declarada';
  await assert.rejects(invoke('updateTournamentConfiguration',{tournamentId:id,patch:{name:'não salvar',fmt2:invalid}}),
    {code:'invalid-argument'});
  assert.equal((await ref.get()).data().name,'Edição antiga compatível');
  const changed=structuredClone(cfg);changed.groupCategoryRules[0].groupFormation={mode:'size',value:6};
  await invoke('updateTournamentConfiguration',{tournamentId:id,patch:{fmt2:changed}});
  assert.deepEqual((await ref.get()).data().fmt2.groupCategoryRules,changed.groupCategoryRules);
  await assert.rejects(invoke('updateTournamentConfiguration',{tournamentId:id,patch:{combinedCategories:['Beta']}}),
    {code:'failed-precondition'});
  assert.deepEqual((await ref.get()).data().combinedCategories,categories);
  // O estado físico de sorteio deve impedir alteração de geometria por qualquer cliente.
  const record=backend('./vendor/tournament-split-core.js').dividir({matches:[{id:'existing',phaseIndex:0,p1:'Atleta A',p2:'Atleta B',scoreP1:4,scoreP2:1,winner:'Atleta A'}]},['matches']).matches[0];
  await ref.collection('matches').doc(record._chave).set(record);
  await ref.update({_nJogos:1,_nPartes:{matches:1},matches:[]});
  const before=(await ref.collection('matches').doc('existing').get()).data();
  const rootBefore=(await ref.get()).data();
  const noop=await invoke('updateTournamentConfiguration',{tournamentId:id,patch:{groupFormation:cfg.groupFormation}});
  assert.equal(noop.changed,false);
  assert.deepEqual((await ref.get()).data(),rootBefore,'espelho idêntico pós-sorteio não regrava o torneio');
  const distinct=structuredClone(changed);distinct.groupFormation={mode:'count',value:2};
  await assert.rejects(invoke('updateTournamentConfiguration',{tournamentId:id,patch:{fmt2:distinct,groupFormation:distinct.groupFormation}}),{code:'failed-precondition'});

  const geometry=structuredClone(changed);geometry.groupCategoryRules[0].gamesPerUnit=1;
  await assert.rejects(invoke('updateTournamentConfiguration',{tournamentId:id,patch:{fmt2:geometry}}),
    {code:'failed-precondition'});
  const removed=structuredClone(changed);removed.groupCategoryRules=[];
  await assert.rejects(invoke('updateTournamentConfiguration',{tournamentId:id,patch:{fmt2:removed}}),
    {code:'failed-precondition'});
  assert.deepEqual((await ref.collection('matches').doc('existing').get()).data(),before);
  assert.equal((await ref.get()).data().testModeEnabled,true);
  const oldRef=db.collection('tournaments').doc('tour_'+Date.now()+'_'+require('node:crypto').randomBytes(16).toString('hex'));
  await oldRef.set({creatorUid:'B17n7JCXYOfqahlcLZ0fKxGGyUu1',name:'Sem fmt2',sport:'Beach Tennis',format:'Liga',status:'open',matches:[]});
  const oldBefore=(await oldRef.get()).data();
  const oldNoop=await invoke('updateTournamentConfiguration',{tournamentId:oldRef.id,patch:{name:'Sem fmt2'}});
  assert.equal(oldNoop.changed,false);
  assert.deepEqual((await oldRef.get()).data(),oldBefore);
  console.log('group category config: OK');
}
run().then(()=>console.log('✓ Firestore demo: criação, edição antiga, regras por categoria, autorização e bloqueio pós-sorteio'))
  .catch(error=>{console.error(error.stdout?.toString()||'',error.stderr?.toString()||'',error);process.exitCode=1;});
