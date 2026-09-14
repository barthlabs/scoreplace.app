'use strict';
/* ⛔⛔ A PROVA DE QUE A SEPARAÇÃO SEPARA — rodando a união e a volta de verdade.
 *
 * ⛔ POR QUE ESTE TESTE EXISTE: todo o resto que escrevi sobre desfazer a união LÊ O TEXTO do
 * código. Isso pega comentário e fiação, e não pega o que o dono já cobrou: teste verde com
 * produção quebrada. Aqui sobem Firestore, Auth e as Cloud Functions DE VERDADE, duas contas
 * nascem, um torneio existe, a união acontece pela porta publicada e a separação também.
 * O que se mede é o DADO depois — não o código antes.
 * [[feedback_medir_com_dado_real_antes_de_teorizar]]
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
/* ⛔ AS FUNÇÕES SÃO CHAMADAS DIRETO, e isso é deliberado.
 * O emulador de FUNÇÕES troca o módulo do firebase-admin por um proxy dele, e nesse proxy
 * ' admin.firestore.FieldValue ' não existe — qualquer união quebra lá com
 * "Cannot read properties of undefined (reading 'serverTimestamp')", inclusive a gravação da
 * lápide, que é código antigo e funciona em produção. Ou seja: é artefato do emulador, não
 * defeito do produto, e consertar o produto para agradar o emulador seria estragar o certo.
 * Carregando 'functions/index.js' num processo normal, contra os emuladores de Firestore e
 * Auth, o admin é o de verdade e o '.run()' das funções v2 executa o MESMO código publicado.
 * [[feedback_nao_afirmar_causa_sem_medir]] */
const CF=require(process.env.ROOT_PATH+'/functions/index.js');
const chamarCF=(nome,dados,uid)=>CF[nome].run({data:dados||{},auth:uid?{uid:uid,token:{uid:uid}}:null,
  rawRequest:{headers:{}},acceptsStreaming:false});

const VELHA='uid_conta_velha', NOVA='uid_conta_nova';
const TOUR='tour_prova';

(async()=>{
  /* index.js ja chamou admin.initializeApp() ao ser carregado — chamar de novo derruba. */
  const db=admin.firestore();
  const R={};

  /* ⛔ A MIGRAÇÃO DE AMIZADES TEM DE ESTAR LIBERADA, senão a união é recusada com
   * "em manutenção" — que é o certo em produção, e no emulador nasce sem o documento. */
  await db.doc('_meta/amizadeMigration').set({fase:'live',maintenance:false});

  /* ── O CENÁRIO: a pessoa tem duas contas. A VELHA entra pelo Google e é a que está no
   * torneio. A NOVA nasceu por telefone. Espelha os pares medidos na base real. */
  await admin.auth().createUser({uid:VELHA,email:'ela@gmail.com',emailVerified:true,password:'senha123'});
  await admin.auth().createUser({uid:NOVA,phoneNumber:'+5511988906144'});
  await db.doc('users/'+VELHA).set({displayName:'Deborah Monteiro',email:'ela@gmail.com',
    authProvider:'google.com',createdAt:'2026-06-01T00:00:00.000Z',city:'São Paulo'});
  await db.doc('users/'+NOVA).set({displayName:'Deborah Perestrello Monteiro',
    phone:'+5511988906144',authProvider:'phone',createdAt:'2026-08-25T00:00:00.000Z',
    birthDate:'1982-01-13'});

  /* ⛔ O TORNEIO TEM DE ESTAR NA CONTA QUE VAI SER ABSORVIDA — senão o teste nao prova nada.
   * Quem sobrevive é a conta MAIS ATIVA (mais torneios). Na primeira versão deste cenário eu
   * pus o torneio na conta que sobrevive: nada precisava se mover, e a verificacao "o torneio
   * voltou" passava sem que a volta tivesse feito coisa alguma.
   * Entao: VELHA tem 1 torneio (o que medimos), NOVA tem 2 — NOVA sobrevive, VELHA é
   * absorvida, e o torneio dela PRECISA ir e voltar. */
  await db.doc('tournaments/'+TOUR).set({
    name:'Confra de prova', creatorUid:'uid_org', memberUids:['uid_org',VELHA],
    participants:[{uid:VELHA,name:'Deborah Monteiro',enrollSeq:1}],
  });
  await db.doc('tournaments/'+TOUR+'/participants/'+VELHA).set({uid:VELHA,name:'Deborah Monteiro'});
  for(const t of ['tour_outro_1','tour_outro_2']){
    await db.doc('tournaments/'+t).set({name:t,creatorUid:'uid_org',memberUids:['uid_org',NOVA],
      participants:[{uid:NOVA,name:'Deborah Perestrello Monteiro',enrollSeq:1}]});
  }

  const perfilVelhaAntes=(await db.doc('users/'+VELHA).get()).data();
  const perfilNovaAntes=(await db.doc('users/'+NOVA).get()).data();

  const retrato=async()=>{
    const t=(await db.doc('tournaments/'+TOUR).get()).data()||{};
    const esp=await db.collection('tournaments/'+TOUR+'/participants').get();
    return { memberUids:(t.memberUids||[]).slice().sort(),
      inscritos:(t.participants||[]).map(p=>p.uid).sort(),
      espelhos:esp.docs.map(d=>d.id).sort() };
  };
  R['antes']=await retrato();
  const canon=v=>{ if(v===null||typeof v!=='object') return JSON.stringify(v===undefined?null:v);
    if(Array.isArray(v)) return '['+v.map(canon).join(',')+']';
    return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canon(v[k])).join(',')+'}'; };
  const semLapide=d=>{const x=Object.assign({},d||{});delete x.mergedInto;delete x.mergedAt;
    delete x.updatedAt;delete x.dupSuspect;return x;};

  /* ── ① A UNIÃO, pela porta publicada (o link do e-mail). ── */
  const token='tok_prova';
  await db.doc('mergeTokens/'+token).set({requesterUid:NOVA,targetUid:VELHA,
    email:'ela@gmail.com',expiresAt:new Date(Date.now()+3600000),used:false});

  try{ const d=await chamarCF('confirmEmailMerge',{token:token});
    R['uniu']={ok:true,d:d}; }
  catch(e){ R['uniu']={ok:false,erro:String(e&&e.message),codigo:String(e&&e.code)}; }

  R['depoisDaUniao']=await retrato();
  /* ⛔ QUEM FOI ABSORVIDA SAI DA LÁPIDE, NÃO DO RETORNO DA CHAMADA. A união também acontece
   * por gatilho automático — e quando ela dispara primeiro, a porta do e-mail responde
   * "já estava feito" e devolve vazio. O fato está no dado. */
  const dVelha=(await db.doc('users/'+VELHA).get()).data()||{};
  const dNova=(await db.doc('users/'+NOVA).get()).data()||{};
  const absorvida=dVelha.mergedInto?VELHA:(dNova.mergedInto?NOVA:'');
  const sobrevivente=absorvida?(absorvida===VELHA?VELHA:NOVA)===VELHA?dVelha.mergedInto:dNova.mergedInto:'';
  R['quemFicou']={sobrevivente:sobrevivente,absorvida:absorvida,
    porQualCaminho:(R['uniu'].d&&R['uniu'].d.already)?'automatico':'link do e-mail'};
  if(!absorvida){ console.log('__JSON__'+JSON.stringify(R)); process.exit(0); }

  /* A conta absorvida continua existindo? (era isto que o deleteUser impedia) */
  try{ const a=await admin.auth().getUser(absorvida);
    R['contaAbsorvida']={existe:true,desligada:!!a.disabled,email:a.email||'',fone:a.phoneNumber||''}; }
  catch(e){ R['contaAbsorvida']={existe:false,codigo:String(e&&e.code)}; }

  const und=await db.doc('mergeUndo/'+absorvida).get();
  R['caderno']=und.exists?{existe:true,completo:(und.data()||{}).completo===true,
    documentos:(und.data()||{}).documentos||0,passos:(und.data()||{}).passos||0}:{existe:false};

  R['desviosDepoisDaUniao']=(await db.collection('loginRedirects').get()).size;

  /* ── ② A SEPARAÇÃO, de dentro da conta que ficou. ── */
  try{ const d=await chamarCF('desfazerFusao',{absorvida:absorvida},sobrevivente);
    R['separou']={ok:true,d:d}; }
  catch(e){ R['separou']={ok:false,erro:String(e&&e.message),codigo:String(e&&e.code)}; }

  R['depoisDaVolta']=await retrato();
  try{ const a=await admin.auth().getUser(absorvida);
    R['contaDepoisDaVolta']={existe:true,desligada:!!a.disabled,email:a.email||'',fone:a.phoneNumber||''}; }
  catch(e){ R['contaDepoisDaVolta']={existe:false,codigo:String(e&&e.code)}; }
  const lap=await db.doc('users/'+absorvida).get();
  R['lapide']={temLapide:!!((lap.data()||{}).mergedInto),
    nome:(lap.data()||{}).displayName||''};
  /* ⛔ O PERFIL É COMPARADO COM A FOTO DE ANTES, não com campos que eu escolhi a dedo:
   * palpitar campo derruba o teste quando o cenário muda e não prova o que interessa. */
  const perfilAntes=(absorvida===VELHA)?perfilVelhaAntes:perfilNovaAntes;
  R['perfilVoltouIgual']=canon(semLapide(lap.data()))===canon(semLapide(perfilAntes));
  R['desviosDepoisDaVolta']=(await db.collection('loginRedirects').get()).size;

  /* ── ③ Não separa duas vezes. ── */
  try{ const d=await chamarCF('desfazerFusao',{absorvida:absorvida},sobrevivente);
    R['segundaVez']={ok:true,d:d}; }
  catch(e){ R['segundaVez']={ok:false,erro:String(e&&e.message)}; }

  console.log('__JSON__'+JSON.stringify(R));
  process.exit(0);
})().catch(e=>{console.error('DRIVER ERRO:',e&&e.stack||e);process.exit(1);});
`;

/* ⛔ O ARQUIVO TEMPORÁRIO NÃO MORA NO REPOSITÓRIO. Escrevê-lo em `tests/` fazia outras suítes
 * que VARREM essa pasta enxergarem um arquivo que não é delas — e duas ficaram vermelhas na
 * rodada paralela, sem defeito nenhum. Fora do repositório o problema deixa de existir, em vez
 * de precisar de uma exceção na lista de exclusivas.
 * [[feedback_temporarios_em_tmp_do_projeto_e_apagar]] */
const drv = path.join(require('os').tmpdir(), 'sp-fusao-volta-driver-' + process.pid + '.js');
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
      FB_PATH: path.join(ROOT, 'node_modules/firebase'),
    }),
  });
} catch (e) { saida = String((e.stdout || '') + (e.stderr || '')); }
try { fs.unlinkSync(drv); } catch (e) {}
/* ⛔ O LOG DO EMULADOR É A ÚNICA FONTE DO ERRO DE DENTRO DA FUNÇÃO. Sem guardá-lo, uma falha
 * chega aqui como "INTERNAL" e não há o que investigar. */
try { fs.writeFileSync(path.join(require('os').tmpdir(), 'sp-emulador-fusao.log'), saida); } catch (e) {}
const mm = /__JSON__(\{[\s\S]*\})/.exec(saida);
if (!mm) { console.error(saida.slice(-4000)); console.error('\n❌ o driver não devolveu resultado'); process.exit(1); }
const R = JSON.parse(mm[1]);

let falhas = 0;
const ok = (n, c, x) => { if (c) console.log('  ✓ ' + n); else { console.log('  ✗ ' + n + (x ? '\n      ' + x : '')); falhas++; } };
const J = (v) => JSON.stringify(v);

console.log('\n──── unir e separar, no emulador de verdade ────\n');
console.log('── ① a união fez o que tinha de fazer ──');
ok('a união rodou', R.uniu.ok, R.uniu.erro);
ok('⭐ quem ficou foi a conta mais ativa (a que está no torneio)',
  R.quemFicou.sobrevivente && R.quemFicou.absorvida && R.quemFicou.sobrevivente !== R.quemFicou.absorvida,
  J(R.quemFicou));
ok('⭐⭐ o torneio passou a apontar para a conta que ficou',
  R.depoisDaUniao.memberUids.indexOf(R.quemFicou.sobrevivente) >= 0 &&
  R.depoisDaUniao.memberUids.indexOf(R.quemFicou.absorvida) < 0, J(R.depoisDaUniao));
ok('⭐ e o espelho do inscrito mudou de nome junto',
  R.depoisDaUniao.espelhos.indexOf(R.quemFicou.sobrevivente) >= 0, J(R.depoisDaUniao.espelhos));

if (!R.quemFicou || !R.quemFicou.absorvida) {
  console.error('\n❌ a união não aconteceu — nada a medir. ' + J(R.uniu));
  process.exit(1);
}
console.log('   (uniu pelo caminho: ' + R.quemFicou.porQualCaminho + ')');

console.log('\n── ② a conta absorvida sobreviveu para poder voltar ──');
ok('⛔⛔ ela NÃO foi apagada — era isto que tornava a volta impossível',
  R.contaAbsorvida.existe === true, J(R.contaAbsorvida));
ok('⭐ está desligada enquanto a união vale', R.contaAbsorvida.desligada === true, J(R.contaAbsorvida));
ok('⭐ e a credencial de verdade saiu dela (é o que precisava ficar livre)',
  /@phone\.scoreplace\.app$/.test(R.contaAbsorvida.email || '') && !R.contaAbsorvida.fone,
  J(R.contaAbsorvida));
ok('⭐ o caderno da volta ficou completo',
  R.caderno.existe && R.caderno.completo === true, J(R.caderno));
ok('⭐ e anotou documentos de verdade', (R.caderno.documentos || 0) > 0, J(R.caderno));

console.log('\n── ③ a separação devolveu o que a união moveu ──');
ok('a separação rodou', R.separou.ok, R.separou.erro);
ok('⭐⭐ o torneio VOLTOU para a conta separada — é isto que faz alguém querer separar',
  J(R.depoisDaVolta.memberUids) === J(R.antes.memberUids), 'antes=' + J(R.antes) + ' depois=' + J(R.depoisDaVolta));
ok('⭐⭐ a inscrição voltou com o uid de antes',
  J(R.depoisDaVolta.inscritos) === J(R.antes.inscritos), J(R.depoisDaVolta.inscritos));
ok('⭐⭐ e o espelho voltou para o nome de antes',
  J(R.depoisDaVolta.espelhos) === J(R.antes.espelhos), J(R.depoisDaVolta.espelhos));
ok('⭐ a conta separada voltou a funcionar',
  R.contaDepoisDaVolta.existe === true && R.contaDepoisDaVolta.desligada === false, J(R.contaDepoisDaVolta));
ok('⭐⭐ com a credencial que a união tinha levado',
  !!(R.contaDepoisDaVolta.email || R.contaDepoisDaVolta.fone), J(R.contaDepoisDaVolta));
ok('⛔ a lápide saiu — a conta deixou de ser lápide', R.lapide.temLapide === false, J(R.lapide));
ok('⭐⭐ e o perfil dela voltou IGUAL ao de antes da união', R.perfilVoltouIgual === true, J(R.lapide));
ok('⛔⛔ o desvio de login sumiu: sem isso, entrar pela credencial devolvida cairia de volta na conta unida',
  R.desviosDepoisDaUniao > 0 && R.desviosDepoisDaVolta === 0,
  'depois da união=' + R.desviosDepoisDaUniao + ' depois da volta=' + R.desviosDepoisDaVolta);

console.log('\n── ④ e não separa duas vezes ──');
ok('⛔ a segunda tentativa é recusada',
  R.segundaVez.ok === false || (R.segundaVez.d && R.segundaVez.d.ok === false), J(R.segundaVez));

console.log(falhas ? ('\n❌ ' + falhas + ' falha(s)') : '\n✅ tudo passou');
process.exit(falhas ? 1 : 0);
