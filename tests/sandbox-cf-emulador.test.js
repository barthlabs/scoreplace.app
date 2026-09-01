/* createSandbox NO EMULADOR REAL — a cópia fiel provada no servidor.  (FIX.SANDBOX.P2)
 * npm run test:sandbox
 *
 * INVARIANTE DO DONO: o sandbox é réplica fiel; só podem diferir id técnico,
 * isSandbox/sandboxOf/sandboxOwnerUid + estado técnico de criação, notificações e
 * estatísticas pessoais suprimidas. Nem a FORMA persistida pode mudar: dividido continua
 * dividido, inteiro continua inteiro.
 *
 * ⛔ ISTO NÃO É TESTE DE MODELO — é a Function de verdade, o Firestore de verdade e as
 * Rules de verdade, no Emulator. O defeito que ele mata (14 inscritos, 0 jogos) nasceu
 * justamente de um caminho que "passava" em modelo e falhava no banco.
 *
 * A ÚNICA exceção de forma, autorizada: results → resultsSandbox (o curinga de collection
 * group não pode ser escopado por coleção-pai; ver firestore.rules).
 */
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');

const DRIVER = String.raw`
'use strict';
const PROJECT='demo-scoreplace';
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8093';
process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9092';
const admin=require(process.env.ADMIN_PATH);
const fb=require(process.env.FB_PATH+'/compat/app');
require(process.env.FB_PATH+'/compat/auth');
require(process.env.FB_PATH+'/compat/firestore');
require(process.env.FB_PATH+'/compat/functions');
const firebase=fb.default||fb;
const DEV='B17n7JCXYOfqahlcLZ0fKxGGyUu1', REAL='uid_real';
const canon=v=>{ if(v===null||typeof v!=='object') return JSON.stringify(v===undefined?null:v);
  if(Array.isArray(v)) return '['+v.map(canon).join(',')+']';
  return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canon(v[k])).join(',')+'}'; };

(async()=>{
  admin.initializeApp({projectId:PROJECT});
  const db=admin.firestore();
  const R={};

  // ── perfis (a CF autoriza pelo users/{uid}.email) ──
  await db.doc('users/'+DEV).set({email:'rstbarth@gmail.com',displayName:'Dev'});
  await db.doc('users/'+REAL).set({email:'real@x.com',displayName:'Real'});
  for(const [uid,email] of [[DEV,'rstbarth@gmail.com'],[REAL,'real@x.com']]){
    try{ await admin.auth().createUser({uid,email,password:'senha123'}); }catch(e){}
  }

  // ── ORIGINAL DIVIDIDO (a forma do Confra) ──
  const membros=[DEV,REAL,'u_a','u_b'];
  const baseDiv={ name:'Confra', sport:'Beach Tennis', isPublic:true, creatorUid:DEV,
    memberUids:membros, coHosts:[{uid:'uCo',nome:'Co'}], adminUids:[DEV,'u_a'],
    waitlist:[{uid:'w1'}], standbyParticipants:[{uid:'s1'}], monarchWaitlist:{'0':['w1']},
    woLog:[{absentUid:'ux',groupName:'G0'}], phases:[{name:'RR'},{name:'Ouro/Prata'}],
    rounds:[{round:1,status:'complete',matches:[],monarchGroups:[
      {name:'G0',players:['a','b','c','d'],playersUids:['ua','ub','uc','ud'],
       classifCongelada:[{name:'a',uid:'ua'},{name:'b',uid:'ub'},{name:'c',uid:'uc'},{name:'d',uid:'ud'}],
       classifCongeladaAt:'2026-08-30T12:00:00.000Z', woAbsent:'x', woDest:'inactive'}]}],
    participants:[], _semPesados:['matches','participants','opponentHistory'],
    _nPartes:{matches:5,participants:7,opponentHistory:1}, _nJogos:5 };
  await db.doc('tournaments/orig_div').set(baseDiv);
  for(let i=0;i<5;i++) await db.doc('tournaments/orig_div/matches/m'+i).set({_chave:'m'+i,jogo:{id:'m'+i,winner:'a',scoreP1:6,scoreP2:3}});
  for(let i=0;i<7;i++) await db.doc('tournaments/orig_div/inscritos/u'+i).set({_k:'u'+i,item:{uid:'u'+i,name:'P'+i,enrollSeq:i+1}});
  await db.doc('tournaments/orig_div/opponentHistory/_default_').set({_idx:0,item:{u0:['u1']}});
  for(const c of ['grupos','history','checkedIn','woLog','woClaims']) await db.doc('tournaments/orig_div/'+c+'/d1').set({x:1,c});
  await db.doc('tournaments/orig_div/results/m1').set({playerUids:[DEV,REAL],winner:'a',scoreP1:6,scoreP2:3,updatedAt:9});

  /* ── ORIGINAL QUEBRADO: promete 9 jogos e tem 2 ────────────────────────────────
   * Copiar daqui produziria um sandbox que já nasce mentindo o marcador — o "14 inscritos e
   * 0 jogos" com outra roupa. A CF tem que RECUSAR antes de escrever qualquer coisa. */
  await db.doc('tournaments/orig_ruim').set({ name:'Quebrado', isPublic:true, creatorUid:DEV,
    memberUids:[DEV], coHosts:[], adminUids:[DEV], participants:[],
    _semPesados:['matches'], _nPartes:{matches:9}, _nJogos:9 });
  for(let i=0;i<2;i++) await db.doc('tournaments/orig_ruim/matches/m'+i).set({_chave:'m'+i,jogo:{id:'m'+i}});

  // ── ORIGINAL INTEIRO ──
  await db.doc('tournaments/orig_int').set({ name:'Inteiro', isPublic:true, creatorUid:DEV,
    memberUids:[DEV,REAL], coHosts:[], adminUids:[DEV],
    participants:[{uid:'p1'},{uid:'p2'}], matches:[{id:'m1',winner:'p1'}], rounds:[] });
  await db.doc('tournaments/orig_int/results/m1').set({playerUids:[DEV],winner:'p1',updatedAt:1});

  // ── cliente autenticado como DEV → chama a CF ──
  const app=firebase.initializeApp({apiKey:'fake',projectId:PROJECT,authDomain:'localhost'});
  app.auth().useEmulator('http://127.0.0.1:9092',{disableWarnings:true});
  app.firestore().useEmulator('127.0.0.1',8093);
  app.functions('us-central1').useEmulator('127.0.0.1',5011);
  const call=n=>app.functions('us-central1').httpsCallable(n);
  const fdb=app.firestore();
  const m=async(k,fn)=>{ try{ R[k]=await fn(); }catch(e){ R[k]={ok:false,erro:(e&&(e.code||e.message))||String(e)}; } };

  await app.auth().signInWithEmailAndPassword('real@x.com','senha123');
  await m('REAL chama createSandbox', async()=>{ const r=await call('createSandbox')({originalTournamentId:'orig_div'}); return {ok:true,r:r.data}; });
  await app.auth().signOut();

  await app.auth().signInWithEmailAndPassword('rstbarth@gmail.com','senha123');
  await m('DEV cria sandbox do DIVIDIDO', async()=>{ const r=await call('createSandbox')({originalTournamentId:'orig_div'}); return {ok:true,r:r.data}; });
  await m('DEV cria de novo (idempotente)', async()=>{ const r=await call('createSandbox')({originalTournamentId:'orig_div'}); return {ok:true,r:r.data}; });
  await m('DEV cria sandbox do INTEIRO', async()=>{ const r=await call('createSandbox')({originalTournamentId:'orig_int'}); return {ok:true,r:r.data}; });
  await m('original inexistente', async()=>{ const r=await call('createSandbox')({originalTournamentId:'nao_existe'}); return {ok:true,r:r.data}; });
  await m('sem originalTournamentId', async()=>{ const r=await call('createSandbox')({}); return {ok:true,r:r.data}; });
  await m('original INCOMPLETO', async()=>{ const r=await call('createSandbox')({originalTournamentId:'orig_ruim'}); return {ok:true,r:r.data}; });
  R['nada visível do original incompleto']={ok:true,
    n:(await db.collection('sandboxes').where('sandboxOf','==','orig_ruim').get()).size};

  const sbDivId=R['DEV cria sandbox do DIVIDIDO'].r && R['DEV cria sandbox do DIVIDIDO'].r.id;
  const sbIntId=R['DEV cria sandbox do INTEIRO'].r && R['DEV cria sandbox do INTEIRO'].r.id;
  R._ids={sbDivId,sbIntId};

  // ── prova de fidelidade, lida com ADMIN (independe de Rules) ──
  /* ⭐ O ENVELOPE VEM DA CF, não de uma cópia escrita aqui. Se alguém afrouxar "SB_ENVELOPE"
   * pra deixar "memberUids" ou "_semPesados" diferirem de novo (as duas exceções da 2.1.86),
   * é ESTA lista que muda — e os controles da seção ⑩ caem na hora. Uma réplica local
   * ficaria verde sobre uma regra que já não existe. */
  const ENV=(R['DEV cria sandbox do DIVIDIDO'].r && R['DEV cria sandbox do DIVIDIDO'].r.envelope) || [];
  R._envelope={ok:true,lista:ENV};
  const difsCanonicas=(o,s)=>{
    const difs=[]; const ks=new Set(Object.keys(o||{}).concat(Object.keys(s||{})));
    ks.forEach(k=>{ if(ENV.indexOf(k)===-1 && canon((o||{})[k])!==canon((s||{})[k])) difs.push(k); });
    return difs;
  };
  const cmp=async(origPath,sbPath)=>difsCanonicas(
    (await db.doc(origPath).get()).data()||{}, (await db.doc(sbPath).get()).data()||{});
  R['fidelidade DIVIDIDO (campos fora do envelope)']={ok:true,difs:await cmp('tournaments/orig_div','sandboxes/'+sbDivId)};
  R['fidelidade INTEIRO']={ok:true,difs:await cmp('tournaments/orig_int','sandboxes/'+sbIntId)};
  const sbDiv=(await db.doc('sandboxes/'+sbDivId).get()).data()||{};
  R['forma persistida DIVIDIDO']={ok:true,_semPesados:sbDiv._semPesados,_nPartes:sbDiv._nPartes,_nJogos:sbDiv._nJogos,sbState:sbDiv.sbState};
  const sbInt=(await db.doc('sandboxes/'+sbIntId).get()).data()||{};
  R['forma persistida INTEIRO']={ok:true,_semPesados:sbInt._semPesados===undefined?'(ausente)':sbInt._semPesados,sbState:sbInt.sbState};
  /* ⛔ O RETRATO DA CÓPIA RECÉM-NASCIDA, guardado ANTES do fluxo da seção ⑨ — que grava
   * placar e avança fase de propósito. Comparar o original com o sandbox JÁ OPERADO
   * acusaria "rounds/currentPhaseIndex" e o controle viraria ruído. */
  const sbRecemNascido=JSON.parse(JSON.stringify(sbDiv));
  R['membership byte a byte']={ok:true,
    memberUids:canon(sbDiv.memberUids)===canon(baseDiv.memberUids),
    coHosts:canon(sbDiv.coHosts)===canon(baseDiv.coHosts),
    adminUids:canon(sbDiv.adminUids)===canon(baseDiv.adminUids)};
  for(const c of ['matches','inscritos','opponentHistory','grupos','history','checkedIn','woLog','woClaims']){
    const a=await db.collection('tournaments/orig_div/'+c).get();
    const b=await db.collection('sandboxes/'+sbDivId+'/'+c).get();
    const iguais=a.size===b.size && a.docs.every(d=>{const o=b.docs.find(x=>x.id===d.id); return o && canon(o.data())===canon(d.data());});
    R['sub '+c]={ok:true,orig:a.size,sb:b.size,iguais};
  }
  const rOrig=await db.collection('tournaments/orig_div/results').get();
  const rSb=await db.collection('sandboxes/'+sbDivId+'/resultsSandbox').get();
  const rSbNome=await db.collection('sandboxes/'+sbDivId+'/results').get();
  R['results -> resultsSandbox']={ok:true,orig:rOrig.size,resultsSandbox:rSb.size,resultsNoSb:rSbNome.size,
    iguais:rOrig.size===rSb.size && rOrig.docs.every(d=>{const o=rSb.docs.find(x=>x.id===d.id); return o && canon(o.data())===canon(d.data());})};

  // ── isolamento pelas RULES, com o SDK ──
  for(const [quem,email] of [['DEV','rstbarth@gmail.com'],['REAL','real@x.com']]){
    if(app.auth().currentUser) await app.auth().signOut();
    await app.auth().signInWithEmailAndPassword(email,'senha123');
    const uid=app.auth().currentUser.uid, P=quem+' ';
    await m(P+'lê parent do sandbox', async()=>({ok:true,existe:(await fdb.doc('sandboxes/'+sbDivId).get()).exists}));
    for(const c of ['matches','inscritos','opponentHistory','grupos','history','checkedIn','woLog','woClaims'])
      await m(P+'lê sub '+c, async()=>({ok:true,n:(await fdb.collection('sandboxes/'+sbDivId+'/'+c).get()).size}));
    await m(P+'lê resultsSandbox', async()=>({ok:true,n:(await fdb.collection('sandboxes/'+sbDivId+'/resultsSandbox').get()).size}));
    await m(P+'query tournaments memberUids', async()=>{const s=await fdb.collection('tournaments').where('memberUids','array-contains',uid).get();return {ok:true,ids:s.docs.map(d=>d.id)};});
    await m(P+'query sandboxes por dono', async()=>{const s=await fdb.collection('sandboxes').where('sandboxOwnerUid','==',uid).get();return {ok:true,ids:s.docs.map(d=>d.id)};});
    await m(P+'cg results (ficha)', async()=>{const s=await fdb.collectionGroup('results').where('playerUids','array-contains',uid).get();return {ok:true,paths:s.docs.map(d=>d.ref.path)};});
    await m(P+'cg resultsSandbox', async()=>{const s=await fdb.collectionGroup('resultsSandbox').where('playerUids','array-contains',uid).get();return {ok:true,n:s.size};});
  }

  /* ── ⑨ O FLUXO INTEIRO DENTRO DO SANDBOX, pelas Rules ──────────────────────────
   * Lista do dono: "fluxo sandbox: inscritos, membership, barras, chaves, placar, avanço e
   * resultado". Placar e avanço são ESCRITA — sandbox que não aceita escrita é fotografia.
   * ⛔ E o que fecha o teste não é o sandbox aceitar: é o ORIGINAL não sentir nada. */
  const retratoDoOriginal=async()=>{
    const doc=(await db.doc('tournaments/orig_div').get()).data()||{};
    const subs={};
    for(const c of ['matches','inscritos','results','grupos','history','checkedIn','woLog','woClaims','opponentHistory']){
      const s=await db.collection('tournaments/orig_div/'+c).get();
      subs[c]=s.docs.map(d=>d.id+'='+canon(d.data())).sort();
    }
    return canon({doc,subs});
  };
  const origAntes=await retratoDoOriginal();

  if(app.auth().currentUser) await app.auth().signOut();
  await app.auth().signInWithEmailAndPassword('rstbarth@gmail.com','senha123');
  const sbRef=fdb.doc('sandboxes/'+sbDivId);

  // inscritos / membership / barras / chaves — o que a tela lê pra se montar
  await m('fluxo: inscritos', async()=>{
    const cfg=(await sbRef.get()).data()||{};
    const ins=await sbRef.collection('inscritos').get();
    return {ok:true,prometido:(cfg._nPartes||{}).participants,veio:ins.size};
  });
  await m('fluxo: membership', async()=>{
    const cfg=(await sbRef.get()).data()||{};
    return {ok:true,memberUids:cfg.memberUids||[],coHosts:canon(cfg.coHosts),adminUids:canon(cfg.adminUids)};
  });
  await m('fluxo: barras', async()=>{
    const cfg=(await sbRef.get()).data()||{};
    const jg=await sbRef.collection('matches').get();
    let feitos=0; jg.forEach(d=>{const j=(d.data()||{}).jogo||{}; if(j.winner) feitos++;});
    return {ok:true,total:jg.size,feitos:feitos,prometido:cfg._nJogos};
  });
  await m('fluxo: chaves', async()=>{
    const cfg=(await sbRef.get()).data()||{};
    const g=(((cfg.rounds||[])[0]||{}).monarchGroups||[])[0]||{};
    return {ok:true,grupo:g.name,congelada:canon(g.classifCongelada),congeladaAt:g.classifCongeladaAt};
  });
  // placar — escreve o jogo e o resultado, como a quadra faz
  await m('fluxo: placar no jogo', async()=>{
    await sbRef.collection('matches').doc('m2').set({_chave:'m2',jogo:{id:'m2',winner:'z',scoreP1:6,scoreP2:0}},{merge:true});
    return {ok:true,jogo:((await sbRef.collection('matches').doc('m2').get()).data()||{}).jogo};
  });
  await m('fluxo: resultado em resultsSandbox', async()=>{
    await sbRef.collection('resultsSandbox').doc('m2').set({playerUids:[DEV,REAL],winner:'z',scoreP1:6,scoreP2:0,updatedAt:11});
    return {ok:true,doc:(await sbRef.collection('resultsSandbox').doc('m2').get()).data()};
  });
  // avanço — a mesma escrita do documento que o "commitTournamentTx" faz
  await m('fluxo: avanço de fase', async()=>{
    await sbRef.set({currentPhaseIndex:1,rounds:[{round:1,status:'complete',matches:[]},{round:2,status:'active',matches:[]}]},{merge:true});
    const d=(await sbRef.get()).data()||{};
    return {ok:true,fase:d.currentPhaseIndex,rodadas:(d.rounds||[]).length};
  });
  // o carimbo é do servidor, mesmo pro dono
  for(const [k,v] of [['sandboxOwnerUid',REAL],['sandboxOf','orig_int'],['isSandbox',false],['sbState','creating']]){
    await m('DEV tenta mudar '+k, async()=>{ await sbRef.set({[k]:v},{merge:true}); return {ok:true}; });
  }
  await m('DEV tenta FABRICAR sandbox à mão', async()=>{
    await fdb.doc('sandboxes/forjado').set({sandboxOwnerUid:DEV,sandboxOf:'orig_div',isSandbox:true,sbState:'ready'});
    return {ok:true};
  });
  // e o REAL não escreve nada
  if(app.auth().currentUser) await app.auth().signOut();
  await app.auth().signInWithEmailAndPassword('real@x.com','senha123');
  await m('REAL escreve no parent do sandbox', async()=>{ await sbRef.set({name:'invadido'},{merge:true}); return {ok:true}; });
  await m('REAL escreve em matches do sandbox', async()=>{ await sbRef.collection('matches').doc('m0').set({x:1},{merge:true}); return {ok:true}; });
  await m('REAL escreve em resultsSandbox', async()=>{ await sbRef.collection('resultsSandbox').doc('m1').set({x:1},{merge:true}); return {ok:true}; });
  if(app.auth().currentUser) await app.auth().signOut();
  await app.auth().signInWithEmailAndPassword('rstbarth@gmail.com','senha123');

  R['ORIGINAL intacto depois do fluxo']={ok:true,igual:(await retratoDoOriginal())===origAntes};

  /* ── ⑩ CONTROLES CONTRA AS EXCEÇÕES DA 2.1.86 ────────────────────────────────
   * As duas que o dono recusou: trocar membership pelo dev, e tirar "_semPesados" pra
   * "caber inteiro". Aqui elas são MONTADAS e a MESMA comparação canônica tem que ACUSAR.
   * ⛔ A régua é o "envelope" que a CF devolveu — afrouxá-lo lá derruba estes controles. */
  const origDoc=(await db.doc('tournaments/orig_div').get()).data()||{};
  const sbDocOk=sbRecemNascido;   // o retrato de ANTES do fluxo — ver a nota lá em cima
  const c186a=Object.assign({},sbDocOk,{memberUids:[DEV],coHosts:[],adminUids:[DEV]});
  const c186b=Object.assign({},sbDocOk); delete c186b._semPesados; delete c186b._nPartes; delete c186b._nJogos;
  R['controle 2.1.86 · membership trocada']={ok:true,acusa:difsCanonicas(origDoc,c186a)};
  R['controle 2.1.86 · _semPesados removido']={ok:true,acusa:difsCanonicas(origDoc,c186b)};
  R['controle · a cópia REAL não acusa nada']={ok:true,acusa:difsCanonicas(origDoc,sbDocOk)};

  console.log('__JSON__'+JSON.stringify(R));
  process.exit(0);
})().catch(e=>{console.error('DRIVER ERRO:',e&&e.stack||e);process.exit(1);});
`;

const drv = path.join(ROOT, 'tests', '.sandbox-cf-driver.tmp.js');
fs.writeFileSync(drv, DRIVER);
let saida = '';
try {
  saida = execFileSync('firebase', ['emulators:exec', '--only', 'firestore,auth,functions',
    '--config', path.join(ROOT, 'firebase.sandbox.json'), '--project', 'demo-scoreplace',
    'node ' + JSON.stringify(drv)], {
    cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024,
    env: Object.assign({}, process.env, {
      PATH: '/opt/homebrew/opt/openjdk/bin:' + process.env.PATH,
      ADMIN_PATH: path.join(ROOT, 'functions/node_modules/firebase-admin'),
      FB_PATH: path.join(ROOT, 'node_modules/firebase'),
    }),
  });
} catch (e) { saida = String((e.stdout || '') + (e.stderr || '')); }
try { fs.unlinkSync(drv); } catch (e) {}
const mm = /__JSON__(\{[\s\S]*\})/.exec(saida);
if (!mm) { console.error(saida.slice(-3000)); console.error('\n❌ driver não devolveu resultado'); process.exit(1); }
const R = JSON.parse(mm[1]);

let falhas = 0;
const ok = (n, c, x) => { if (c) console.log('  ✓ ' + n); else { console.log('  ✗ ' + n + (x ? '\n      ' + x : '')); falhas++; } };
const J = (v) => JSON.stringify(v);
console.log('──── createSandbox no Emulator real ────');

console.log('\n── ① autorização server-side ──');
ok('⛔ REAL (não é identidade de teste) é RECUSADO',
  R['REAL chama createSandbox'].ok === false && /permission-denied/.test(R['REAL chama createSandbox'].erro || ''),
  J(R['REAL chama createSandbox']));
ok('⛔ sem originalTournamentId → invalid-argument',
  R['sem originalTournamentId'].ok === false && /invalid-argument/.test(R['sem originalTournamentId'].erro || ''),
  J(R['sem originalTournamentId']));
ok('⛔ original inexistente → not-found',
  R['original inexistente'].ok === false && /not-found/.test(R['original inexistente'].erro || ''),
  J(R['original inexistente']));
ok('⭐⭐ ⛔ original INCOMPLETO (promete 9 jogos, tem 2) → failed-precondition',
  R['original INCOMPLETO'].ok === false && /failed-precondition/.test(R['original INCOMPLETO'].erro || ''),
  J(R['original INCOMPLETO']));
ok('⭐⭐ e NÃO ficou sandbox parcial nenhum dele (0 documentos)',
  R['nada visível do original incompleto'].n === 0, J(R['nada visível do original incompleto']));

console.log('\n── ② criação e idempotência ──');
ok('DEV criou o sandbox do DIVIDIDO', R['DEV cria sandbox do DIVIDIDO'].ok === true, J(R['DEV cria sandbox do DIVIDIDO']));
ok('⭐ chamar de novo REAPROVEITA (idempotente, não duplica)',
  R['DEV cria de novo (idempotente)'].ok === true && R['DEV cria de novo (idempotente)'].r.reaproveitado === true &&
  R['DEV cria de novo (idempotente)'].r.id === R._ids.sbDivId, J(R['DEV cria de novo (idempotente)']));
ok('DEV criou o sandbox do INTEIRO', R['DEV cria sandbox do INTEIRO'].ok === true, J(R['DEV cria sandbox do INTEIRO']));

console.log('\n── ③ FORMA PERSISTIDA: dividido→dividido, inteiro→inteiro ──');
const fd = R['forma persistida DIVIDIDO'];
ok('⭐⭐ o sandbox do dividido CONTINUA dividido (_semPesados/_nPartes/_nJogos iguais)',
  J(fd._semPesados) === J(['matches', 'participants', 'opponentHistory']) &&
  J(fd._nPartes) === J({ matches: 5, participants: 7, opponentHistory: 1 }) && fd._nJogos === 5, J(fd));
ok('⭐⭐ e está `ready` (só depois da prova)', fd.sbState === 'ready', J(fd.sbState));
ok('⭐⭐ o sandbox do inteiro CONTINUA inteiro (sem _semPesados)',
  R['forma persistida INTEIRO']._semPesados === '(ausente)' && R['forma persistida INTEIRO'].sbState === 'ready',
  J(R['forma persistida INTEIRO']));

console.log('\n── ④ igualdade canônica ──');
ok('⭐⭐ DIVIDIDO: nenhum campo difere fora do envelope',
  (R['fidelidade DIVIDIDO (campos fora do envelope)'].difs || []).length === 0,
  J(R['fidelidade DIVIDIDO (campos fora do envelope)'].difs));
ok('⭐⭐ INTEIRO: idem', (R['fidelidade INTEIRO'].difs || []).length === 0, J(R['fidelidade INTEIRO'].difs));
const mb = R['membership byte a byte'];
ok('⭐⭐ memberUids byte a byte', mb.memberUids === true);
ok('⭐⭐ coHosts byte a byte', mb.coHosts === true);
ok('⭐⭐ adminUids byte a byte', mb.adminUids === true);

console.log('\n── ⑤ subcoleções: mesmas contagens e mesmo conteúdo ──');
['matches', 'inscritos', 'opponentHistory', 'grupos', 'history', 'checkedIn', 'woLog', 'woClaims'].forEach((c) => {
  const s = R['sub ' + c];
  ok('⭐ ' + c + ': ' + s.orig + ' → ' + s.sb + ', conteúdo idêntico', s.orig === s.sb && s.iguais === true, J(s));
});
const rr = R['results -> resultsSandbox'];
ok('⭐⭐ results → resultsSandbox: ids/campos/contagens idênticos (' + rr.orig + ' → ' + rr.resultsSandbox + ')',
  rr.orig === rr.resultsSandbox && rr.iguais === true, J(rr));
ok('⛔ e NÃO existe `results` dentro do sandbox (o curinga não teria como alcançar)', rr.resultsNoSb === 0, J(rr));

console.log('\n── ⑥ isolamento pelas RULES (SDK do app) ──');
ok('⭐⭐ DEV lê o parent do sandbox', R['DEV lê parent do sandbox'].ok === true && R['DEV lê parent do sandbox'].existe === true);
['matches', 'inscritos', 'opponentHistory', 'grupos', 'history', 'checkedIn', 'woLog', 'woClaims'].forEach((c) => {
  ok('  DEV lê sub ' + c, R['DEV lê sub ' + c].ok === true, J(R['DEV lê sub ' + c]));
  ok('  ⛔ REAL NÃO lê sub ' + c, R['REAL lê sub ' + c].ok === false, J(R['REAL lê sub ' + c]));
});
ok('⭐⭐ DEV lê resultsSandbox', R['DEV lê resultsSandbox'].ok === true);
ok('⭐⭐ ⛔ REAL NÃO lê resultsSandbox', R['REAL lê resultsSandbox'].ok === false, J(R['REAL lê resultsSandbox']));
ok('⭐⭐ ⛔ REAL NÃO lê o parent do sandbox', R['REAL lê parent do sandbox'].ok === false, J(R['REAL lê parent do sandbox']));

console.log('\n── ⑦ o listener normal nunca entrega o sandbox ──');
ok('⭐⭐ REAL: query de tournaments traz só os torneios REAIS',
  J((R['REAL query tournaments memberUids'].ids || []).sort()) === J(['orig_div', 'orig_int']),
  J(R['REAL query tournaments memberUids']));
/* ⚠️ do DEV cobra-se o que IMPORTA — que nenhum sandbox venha —, e não uma lista fechada:
 * ele é membro também do `orig_ruim` (a fixture da criação recusada), e uma lista literal
 * quebraria a cada original novo por um motivo que não é o do teste. */
ok('⭐⭐ DEV: idem (nenhum sandbox aparece na consulta de tournaments)',
  (R['DEV query tournaments memberUids'].ids || []).every((i) => i.indexOf('sb_') !== 0) &&
  (R['DEV query tournaments memberUids'].ids || []).indexOf('orig_div') !== -1,
  J(R['DEV query tournaments memberUids']));
ok('⭐ DEV lista os sandboxes dele por sandboxOwnerUid',
  (R['DEV query sandboxes por dono'].ids || []).length === 2, J(R['DEV query sandboxes por dono']));
ok('⭐⭐ REAL não lista sandbox nenhum', (R['REAL query sandboxes por dono'].ids || []).length === 0,
  J(R['REAL query sandboxes por dono']));

console.log('\n── ⑧ o collectionGroup de results ──');
ok('⭐⭐ DEV: a ficha continua achando o results REAL',
  (R['DEV cg results (ficha)'].paths || []).some((p) => p.indexOf('tournaments/orig_div/results/') === 0),
  J(R['DEV cg results (ficha)']));
ok('⭐⭐ REAL: idem (o uso legítimo não quebrou)',
  (R['REAL cg results (ficha)'].paths || []).some((p) => p.indexOf('tournaments/orig_div/results/') === 0),
  J(R['REAL cg results (ficha)']));
ok('⭐⭐ ⛔ e NENHUM caminho de sandbox aparece na ficha',
  (R['DEV cg results (ficha)'].paths || []).concat(R['REAL cg results (ficha)'].paths || [])
    .every((p) => p.indexOf('sandboxes/') !== 0), J(R['REAL cg results (ficha)']));
ok('⭐⭐ ⛔ collectionGroup("resultsSandbox") é negado a todos',
  R['DEV cg resultsSandbox'].ok === false && R['REAL cg resultsSandbox'].ok === false,
  J([R['DEV cg resultsSandbox'], R['REAL cg resultsSandbox']]));

console.log('\n── ⑨ o FLUXO dentro do sandbox (inscritos→membership→barras→chaves→placar→avanço→resultado) ──');
const fi = R['fluxo: inscritos'], fm = R['fluxo: membership'], fb = R['fluxo: barras'], fc = R['fluxo: chaves'];
ok('inscritos: o que o marcador promete é o que a subcoleção tem (' + fi.veio + ')',
  fi.ok === true && fi.veio === fi.prometido && fi.veio === 7, J(fi));
ok('⭐ membership: os uids REAIS estão lá (é o que a 2.1.86 trocava)',
  fm.ok === true && (fm.memberUids || []).length === 4 && fm.coHosts === '[{"nome":"Co","uid":"uCo"}]', J(fm));
ok('barras: total e feitos saem dos jogos copiados (' + fb.feitos + '/' + fb.total + ')',
  fb.ok === true && fb.total === 5 && fb.total === fb.prometido && fb.feitos === 5, J(fb));
ok('⭐ chaves: a classificação CONGELADA veio junto, com o carimbo',
  fc.ok === true && fc.grupo === 'G0' && /"uid":"ua"/.test(fc.congelada || '') &&
  fc.congeladaAt === '2026-08-30T12:00:00.000Z', J(fc));
ok('⭐⭐ placar: o DONO escreve o jogo dentro do sandbox',
  R['fluxo: placar no jogo'].ok === true && (R['fluxo: placar no jogo'].jogo || {}).scoreP1 === 6,
  J(R['fluxo: placar no jogo']));
ok('⭐⭐ resultado: e escreve em `resultsSandbox` (nunca em `results`)',
  R['fluxo: resultado em resultsSandbox'].ok === true &&
  (R['fluxo: resultado em resultsSandbox'].doc || {}).winner === 'z', J(R['fluxo: resultado em resultsSandbox']));
ok('⭐⭐ avanço: o DONO grava a próxima fase no documento do sandbox',
  R['fluxo: avanço de fase'].ok === true && R['fluxo: avanço de fase'].fase === 1 &&
  R['fluxo: avanço de fase'].rodadas === 2, J(R['fluxo: avanço de fase']));
['sandboxOwnerUid', 'sandboxOf', 'isSandbox', 'sbState'].forEach((k) => {
  ok('⛔ nem o DONO mexe no carimbo (' + k + ')', R['DEV tenta mudar ' + k].ok === false,
    J(R['DEV tenta mudar ' + k]));
});
ok('⭐⭐ ⛔ e o DONO NÃO fabrica sandbox à mão — criar é só da Function',
  R['DEV tenta FABRICAR sandbox à mão'].ok === false, J(R['DEV tenta FABRICAR sandbox à mão']));
['REAL escreve no parent do sandbox', 'REAL escreve em matches do sandbox', 'REAL escreve em resultsSandbox'].forEach((k) => {
  ok('⛔ ' + k + ' → NEGADO', R[k].ok === false, J(R[k]));
});
ok('⭐⭐ e o ORIGINAL não sentiu NADA do que aconteceu no sandbox (doc + 9 subcoleções)',
  R['ORIGINAL intacto depois do fluxo'].igual === true, J(R['ORIGINAL intacto depois do fluxo']));

console.log('\n── ⑩ controles contra as exceções da 2.1.86 ──');
const env = (R._envelope && R._envelope.lista) || [];
ok('o envelope veio da CF (não é cópia escrita no teste)', env.length > 0, J(env));
['memberUids', 'coHosts', 'adminUids'].forEach((k) => {
  ok('⛔ `' + k + '` NÃO está no envelope — trocá-lo volta a ser defeito', env.indexOf(k) === -1, J(env));
});
['_semPesados', '_nPartes', '_nJogos'].forEach((k) => {
  ok('⛔ `' + k + '` NÃO está no envelope — "nasce inteiro" volta a ser defeito', env.indexOf(k) === -1, J(env));
});
const c1 = R['controle 2.1.86 · membership trocada'].acusa || [];
const c2 = R['controle 2.1.86 · _semPesados removido'].acusa || [];
ok('⭐⭐ CONTROLE: a cópia com membership trocada é ACUSADA (' + c1.join(', ') + ')',
  c1.indexOf('memberUids') !== -1 && c1.indexOf('coHosts') !== -1 && c1.indexOf('adminUids') !== -1, J(c1));
ok('⭐⭐ CONTROLE: a cópia sem `_semPesados` é ACUSADA (' + c2.join(', ') + ')',
  c2.indexOf('_semPesados') !== -1 && c2.indexOf('_nPartes') !== -1 && c2.indexOf('_nJogos') !== -1, J(c2));
ok('⭐ e a cópia REAL não é acusada de nada (senão o controle acusaria qualquer coisa)',
  (R['controle · a cópia REAL não acusa nada'].acusa || []).length === 0,
  J(R['controle · a cópia REAL não acusa nada']));

console.log(falhas === 0 ? '\n✅ sandbox-cf-emulador: OK' : '\n❌ sandbox-cf-emulador: ' + falhas + ' falha(s)');
process.exit(falhas === 0 ? 0 : 1);
