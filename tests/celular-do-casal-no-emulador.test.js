'use strict';
/* ⛔⛔ O CASO FABIANA E VAL, RODANDO DE VERDADE.
 *
 * Ordens do dono (13/set/2026): _"sempre pode acontecer de autenticar 1 telefone em duas contas
 * (mae e filho usando o mesmo telefone), marido e mulher como é o caso do val e fabiana"_ ·
 * _"precisa colocar essa possibilidade. nome diferente mesmo telefone"_ · _"o celular que o
 * organizador registra deve gerar a pergunta de serem a mesma pessoa se o nome bater (nome e
 * sobrenome)"_.
 *
 * ⛔ POR QUE ESTE TESTE EXISTE: eu mexi na porta que registra o contato e no detector de pessoa
 * repetida, e tudo que garantia isso LIA O TEXTO do código. Depois de a separação de contas ter
 * mostrado quatro defeitos que só apareceram executando, medir o texto deixou de bastar.
 * Aqui o servidor roda de verdade e o que se mede é o DADO depois.
 */
const path = require('path');
const fs = require('fs');
const { rodarNoEmulador } = require('./emulador');
const ROOT = path.join(__dirname, '..');

const DRIVER = String.raw`
'use strict';
const PROJECT='demo-scoreplace';
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8093';
process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9092';
process.env.GCLOUD_PROJECT=PROJECT;
process.env.FIREBASE_CONFIG=JSON.stringify({projectId:PROJECT});
const admin=require(process.env.ADMIN_PATH);
const CF=require(process.env.ROOT_PATH+'/functions/index.js');
/* ⛔ AS CHAVES DE BUSCA DO NOME SÃO ESCRITAS POR UM GATILHO, e gatilho não roda sem o emulador
 * de FUNÇÕES. Sem elas a busca de candidatos não acha ninguém e a pergunta de segunda conta
 * jamais apareceria — o teste ficaria verde por falta de dado, não por acerto. Semeamos com a
 * MESMA função do produto, para não inventar uma régua paralela. */
const NOMES=require(process.env.ROOT_PATH+'/functions/name-unique-core.js');
const comChaves=(nome,resto)=>{const p=Object.assign({displayName:nome},resto||{});
  NOMES.denormalizeDisplayName(p,nome); return p;};
const chamarCF=(nome,dados,uid)=>CF[nome].run({data:dados||{},auth:uid?{uid:uid,token:{uid:uid}}:null,
  rawRequest:{headers:{}},acceptsStreaming:false});

const ORG='uid_organizador', FABI='uid_fabiana', VAL='uid_val', IRMA='uid_irma';
const FONE_DA_CASA='+5511982012440';
const TOUR='tour_confra';

(async()=>{
  const db=admin.firestore();
  const R={};
  await db.doc('_meta/amizadeMigration').set({fase:'live',maintenance:false});

  /* ── O CENÁRIO REAL: casal, um aparelho só. Val confirmou o número por SMS; Fabiana não
   * tem telefone nenhum no cadastro. Os dois estão no MESMO torneio. */
  await admin.auth().createUser({uid:ORG,email:'org@x.com',password:'senha123'});
  await admin.auth().createUser({uid:FABI,email:'fabi@gmail.com',emailVerified:true,password:'senha123'});
  await admin.auth().createUser({uid:VAL,email:'val@sialdrill.com',password:'senha123',phoneNumber:FONE_DA_CASA});
  await admin.auth().createUser({uid:IRMA,email:'irma@gmail.com',password:'senha123'});
  await db.doc('users/'+ORG).set(comChaves('Organizador',{email:'org@x.com'}));
  await db.doc('users/'+FABI).set(comChaves('FABIANA VIEIRA',{email:'fabi@gmail.com'}));
  await db.doc('users/'+VAL).set(comChaves('Val',{email:'val@sialdrill.com',phone:FONE_DA_CASA,phoneVerified:true}));
  await db.doc('users/'+IRMA).set(comChaves('Fabiana Vieira',{email:'irma@gmail.com'}));

  await db.doc('tournaments/'+TOUR).set({
    name:'Confra BT', creatorUid:ORG, memberUids:[ORG,FABI,VAL,IRMA],
    participants:[{uid:FABI,name:'FABIANA VIEIRA',enrollSeq:1},
      {uid:VAL,name:'Val',enrollSeq:2},{uid:IRMA,name:'Fabiana Vieira',enrollSeq:3}],
  });

  /* ── ① O ORGANIZADOR REGISTRA O NÚMERO DA CASA NA FICHA DA FABIANA.
   * O número já está CONFIRMADO por SMS na conta da Val. A versão que eu tinha feito antes
   * recusava exatamente aqui. */
  try{ const d=await chamarCF('setParticipantContactPhone',
        {tournamentId:TOUR,uid:FABI,phone:'11982012440',country:'55'},ORG);
    R['registrou']={ok:true,d:d}; }
  catch(e){ R['registrou']={ok:false,erro:String(e&&e.message),codigo:String(e&&e.code)}; }

  const fabi=(await db.doc('users/'+FABI).get()).data()||{};
  R['fichaDaFabiana']={fone:fabi.phone||'',origem:fabi.phoneSource||'',porQuem:fabi.phoneSetBy||''};
  const val=(await db.doc('users/'+VAL).get()).data()||{};
  R['fichaDaVal']={fone:val.phone||'',origem:val.phoneSource||''};

  /* ── ② O ORGANIZADOR NÃO SOBRESCREVE QUEM JÁ CONFIRMOU O PRÓPRIO NÚMERO. */
  try{ const d=await chamarCF('setParticipantContactPhone',
        {tournamentId:TOUR,uid:VAL,phone:'11999990000',country:'55'},ORG);
    R['tentouTrocarDaVal']={ok:true,d:d}; }
  catch(e){ R['tentouTrocarDaVal']={ok:false,erro:String(e&&e.message),codigo:String(e&&e.code)}; }
  R['foneDaValDepois']=((await db.doc('users/'+VAL).get()).data()||{}).phone||'';

  /* ── ③ A PERGUNTA DE SEGUNDA CONTA, MEDIDA PELA PORTA DA INSCRIÇÃO.
   *
   * ⛔ NÃO DÁ PARA MEDIR PELO GATILHO AQUI: quem grava a pergunta no cadastro é um gatilho de
   * documento, e gatilho precisa do emulador de FUNÇÕES — que não pode ser usado nesta
   * bateria porque o proxy dele derruba o firebase-admin. A porta da inscrição decide a MESMA
   * coisa, na hora, e devolve a resposta: é por ela que se mede.
   *
   * Dois casos, e os dois importam:
   *   · a homônima, que compartilha o número da casa → tem de PERGUNTAR (ordem do dono);
   *   · a Val, mesmo número e nome sem nada a ver → NÃO pode perguntar (casal). */
  await db.doc('users/'+IRMA).set({phone:FONE_DA_CASA,phoneSource:'organizer'},{merge:true});
  await db.doc('tournaments/'+TOUR).update({
    memberUids:[ORG,FABI,VAL],
    participants:[{uid:FABI,name:'FABIANA VIEIRA',enrollSeq:1},{uid:VAL,name:'Val',enrollSeq:2}],
  });
  try{ const d=await chamarCF('enrollParticipant',
        {tournamentId:TOUR,participantObj:{uid:IRMA,name:'Fabiana Vieira'}},IRMA);
    R['inscreveuHomonima']={ok:true,dup:d&&d.dupSuspect?
      {motivo:d.dupSuspect.motivo,nome:d.dupSuspect.nome}:null,recusou:!!(d&&d.alreadyEnrolled)}; }
  catch(e){ R['inscreveuHomonima']={ok:false,erro:String(e&&e.message)}; }

  const SO_FONE='uid_so_fone';
  await admin.auth().createUser({uid:SO_FONE,email:'outro@x.com',password:'senha123'});
  await db.doc('users/'+SO_FONE).set(comChaves('Roberto Kruger',{email:'outro@x.com',phone:FONE_DA_CASA,phoneSource:'organizer'}));
  try{ const d=await chamarCF('enrollParticipant',
        {tournamentId:TOUR,participantObj:{uid:SO_FONE,name:'Roberto Kruger'}},SO_FONE);
    R['inscreveuSoMesmoFone']={ok:true,dup:d&&d.dupSuspect?
      {motivo:d.dupSuspect.motivo,nome:d.dupSuspect.nome}:null,recusou:!!(d&&d.alreadyEnrolled)}; }
  catch(e){ R['inscreveuSoMesmoFone']={ok:false,erro:String(e&&e.message)}; }

  /* ── ④ E O NÚMERO DO ORGANIZADOR CADUCA quando a pessoa confirma o próprio.
   * É o que acontece quando Fabiana enfim cadastra e confirma o celular dela. */
  await admin.auth().updateUser(FABI,{phoneNumber:'+5511911112222'});
  /* ⛔ SEM MANDAR O NOME DE NOVO: este cenário tem uma homônima de propósito (é ela que faz a
   * pergunta de segunda conta aparecer), e o cadastro RECUSA nome já em uso — corretamente.
   * Quem confirma o próprio celular não está trocando de nome; mandar o nome junto misturaria
   * duas regras e reprovaria o produto por um acerto dele. */
  try{ const d=await chamarCF('registerPhonePassword',
        {phone:'5511911112222',password:'senha123',displayName:''},FABI);
    R['confirmouOProprio']={ok:true,d:d}; }
  catch(e){ R['confirmouOProprio']={ok:false,erro:String(e&&e.message),codigo:String(e&&e.code)}; }
  const fabi3=(await db.doc('users/'+FABI).get()).data()||{};
  R['fichaDepoisDeConfirmar']={fone:fabi3.phone||'',
    origem:fabi3.phoneSource===undefined?'(apagado)':String(fabi3.phoneSource),
    porQuem:fabi3.phoneSetBy===undefined?'(apagado)':String(fabi3.phoneSetBy)};

  /* ── ⑤ Ninguém nasceu de novo: continuam 4 cadastros vivos. */
  const vivos=(await db.collection('users').get()).docs.filter(d=>!(d.data()||{}).mergedInto);
  R['cadastrosVivos']=vivos.length;

  console.log('__JSON__'+JSON.stringify(R));
  process.exit(0);
})().catch(e=>{console.error('DRIVER ERRO:',e&&e.stack||e);process.exit(1);});
`;

const drv = path.join(require('os').tmpdir(), 'sp-casal-driver-' + process.pid + '.js');
fs.writeFileSync(drv, DRIVER);
let saida = '';
try {
  saida = rodarNoEmulador(['emulators:exec', '--only', 'firestore,auth',
    '--config', path.join(ROOT, 'firebase.sandbox.json'), '--project', 'demo-scoreplace',
    'node ' + JSON.stringify(drv)], {
    cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 64 * 1024 * 1024,
    env: Object.assign({}, process.env, {
      PATH: '/opt/homebrew/opt/openjdk/bin:' + process.env.PATH,
      ADMIN_PATH: path.join(ROOT, 'functions/node_modules/firebase-admin'),
      ROOT_PATH: ROOT,
    }),
  });
} catch (e) { saida = String((e.stdout || '') + (e.stderr || '')); }
try { fs.unlinkSync(drv); } catch (e) {}
try { fs.writeFileSync(path.join(require('os').tmpdir(), 'sp-casal.log'), saida); } catch (e) {}
const mm = /__JSON__(\{[\s\S]*\})/.exec(saida);
if (!mm) { console.error(saida.slice(-4000)); console.error('\n❌ o driver não devolveu resultado'); process.exit(1); }
const R = JSON.parse(mm[1]);

let falhas = 0;
const ok = (n, c, x) => { if (c) console.log('  ✓ ' + n); else { console.log('  ✗ ' + n + (x ? '\n      ' + x : '')); falhas++; } };
const J = (v) => JSON.stringify(v);

console.log('\n──── o celular do casal, no emulador de verdade ────\n');
console.log('── ① o organizador registra o número da casa ──');
ok('⭐⭐ ele CONSEGUE registrar, mesmo com o número já confirmado por SMS noutra conta',
  R.registrou.ok === true, J(R.registrou));
ok('⭐ o número entrou na ficha de quem ele quis alcançar',
  R.fichaDaFabiana.fone === '+5511982012440', J(R.fichaDaFabiana));
ok('⭐ marcado como posto por terceiro — é contato, não identidade',
  R.fichaDaFabiana.origem === 'organizer' && !!R.fichaDaFabiana.porQuem, J(R.fichaDaFabiana));
ok('⛔ e a ficha de quem confirmou o número não foi tocada',
  R.fichaDaVal.fone === '+5511982012440' && !R.fichaDaVal.origem, J(R.fichaDaVal));

console.log('\n── ② quem já confirmou manda no próprio número ──');
ok('⛔⛔ o organizador NÃO sobrescreve número confirmado por SMS',
  R.tentouTrocarDaVal.ok === false, J(R.tentouTrocarDaVal));
ok('⭐ e o número dela continua o mesmo', R.foneDaValDepois === '+5511982012440', R.foneDaValDepois);

console.log('\n── ③ o sinal de segunda conta ──');
ok('⭐⭐ nome e sobrenome iguais + o número da casa → sinaliza para revisão',
  !!(R.inscreveuHomonima.dup), J(R.inscreveuHomonima));
ok('⛔ e ela é registrada como NOME, não como celular — a força de um "não sou eu" tem de ser honesta',
  R.inscreveuHomonima.dup && R.inscreveuHomonima.dup.motivo === 'nome', J(R.inscreveuHomonima));
ok('⭐ o sinal não bloqueia a inscrição da homônima', R.inscreveuHomonima.recusou === false,
  J(R.inscreveuHomonima));
ok('⛔⛔ mesmo número com nome sem nada a ver NÃO vira pergunta (casal, mãe e filho)',
  R.inscreveuSoMesmoFone.ok === true && !R.inscreveuSoMesmoFone.dup, J(R.inscreveuSoMesmoFone));
ok('⭐ e essa pessoa entra no torneio normalmente', R.inscreveuSoMesmoFone.recusou === false,
  J(R.inscreveuSoMesmoFone));

console.log('\n── ④ o registro do organizador caduca ──');
ok('quem confirma o próprio número consegue', R.confirmouOProprio.ok === true, J(R.confirmouOProprio));
ok('⭐⭐ o número confirmado substitui o que o organizador tinha posto',
  R.fichaDepoisDeConfirmar.fone === '+5511911112222', J(R.fichaDepoisDeConfirmar));
ok('⭐⭐ e o carimbo de terceiro SOME — senão as travas seguiriam recusando o que já foi provado',
  R.fichaDepoisDeConfirmar.origem === '(apagado)' && R.fichaDepoisDeConfirmar.porQuem === '(apagado)',
  J(R.fichaDepoisDeConfirmar));

console.log('\n── ⑤ ninguém foi duplicado ──');
ok('⛔ continuam 5 cadastros vivos — nada de conta nova nascendo', R.cadastrosVivos === 5, String(R.cadastrosVivos));

console.log(falhas ? ('\n❌ ' + falhas + ' falha(s)') : '\n✅ tudo passou');
process.exit(falhas ? 1 : 0);
