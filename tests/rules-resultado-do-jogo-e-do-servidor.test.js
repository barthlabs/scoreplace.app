'use strict';
/* ⛔⛔ O DOC DE RESULTADO POR JOGO É DO SERVIDOR — O CLIENTE SÓ LÊ.
 *
 * POR QUE ISTO É GRAVE, e não arrumação: o campo `playerUids` de
 * `tournaments/{id}/results/{matchId}` é o HISTÓRICO GLOBAL de uma pessoa. "Meus
 * Resultados" é uma consulta de collection group por `playerUids array-contains uid`.
 * Com a regra antiga o ORGANIZADOR criava um jogo com o uid de QUALQUER UM e um placar
 * inventado, e aquilo aparecia na vida dela — sem ela estar inscrita, sem ela saber.
 * É o irmão do que o bloco 3 tirou do documento do torneio: trava de elenco no doc não
 * vale nada com esta porta aberta ao lado.
 *
 * ⚠️ MEDIDO ANTES DE FECHAR: o cliente não usava a porta. A única escrita dele era
 * `mutateMatchResult` (js/firebase-db.js), chamada só por `commitMatchResult`, cujos dois
 * chamadores não têm chamador nenhum — nem no main nem na árvore da versão que está no
 * Play. Quem escreve é processo privilegiado (CF/Admin SDK, manutenção por IAM/REST).
 *
 * ⭐ E A LEITURA TEM DE CONTINUAR VIVA. O GET direto NÃO é o contrato real: a consulta do
 * produto é collection group com array-contains MAIS orderBy updatedAt DESC, e ela é
 * autorizada por OUTRA regra (o curinga). Testar só o GET seria testar o que o app não faz.
 *
 * Dados 100% sintéticos. Nada de produção é lido ou escrito.
 * Rodado por: npm run test:rules  (e pelo catálogo de npm test)
 */
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.join(__dirname, '..');
const PORT_ATUAL = 8108;      // portas livres conferidas antes de escrever o teste
const PORT_CONTROLE = 8109;
const PROJECT = 'demo-scoreplace';

const DRIVER = (porta) => `
const P='${PROJECT}', H='http://127.0.0.1:${porta}';
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const tok=uid=>b64({alg:'none',typ:'JWT'})+'.'+b64({iss:'https://securetoken.google.com/'+P,aud:P,sub:uid,user_id:uid,
  auth_time:Math.floor(Date.now()/1000),iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600,
  email:uid+'@x.invalid',email_verified:true,firebase:{identities:{},sign_in_provider:'google.com'}})+'.';
const raiz=H+'/v1/projects/'+P+'/databases/(default)/documents';
const base=raiz+'/';
const cab=q=>{const h={'Content-Type':'application/json'}; if(q==='owner')h.Authorization='Bearer owner'; else if(q)h.Authorization='Bearer '+tok(q); return h;};
const req=(m,p,q,b)=>fetch(base+p,{method:m,headers:cab(q),body:b?JSON.stringify(b):undefined}).then(r=>r.status);
const S=v=>({stringValue:v});
const I=v=>({integerValue:String(v)});
const B=v=>({booleanValue:v});
const arr=(...xs)=>({arrayValue:{values:xs}});
const mapa=o=>({mapValue:{fields:o}});
const AGORA=new Date().toISOString();

/* A consulta REAL de "Meus Resultados": collection group, array-contains e ordenacao por
 * updatedAt DESC (js/firebase-db.js). Devolve status e os ids que vieram. */
async function consultaMeusJogos(uid){
  const corpo={structuredQuery:{
    from:[{collectionId:'results',allDescendants:true}],
    where:{fieldFilter:{field:{fieldPath:'playerUids'},op:'ARRAY_CONTAINS',value:S(uid)}},
    orderBy:[{field:{fieldPath:'updatedAt'},direction:'DESCENDING'}],
    limit:20
  }};
  const r=await fetch(raiz+':runQuery',{method:'POST',headers:cab(uid),body:JSON.stringify(corpo)});
  if(r.status!==200) return {status:r.status,ids:[]};
  const j=await r.json();
  const ids=(Array.isArray(j)?j:[]).filter(x=>x&&x.document).map(x=>String(x.document.name).split('/').pop());
  return {status:200,ids:ids};
}

(async()=>{
  const o={};
  // ── fixture pelo bypass de ADMIN do emulador: so monta o cenario ──────────────
  await req('PATCH','tournaments/t1','owner',{fields:{
    name:S('Confra'), creatorUid:S('ORG'), adminUids:arr(S('ORG')), isPublic:B(true),
    status:S('active'), memberUids:arr(S('ORG'),S('JOG')),
    participants:arr(mapa({uid:S('ORG')}),mapa({uid:S('JOG')})),
    _nascidoEm:{timestampValue:AGORA}
  }});
  await req('PATCH','tournaments/t1/results/m1','owner',{fields:{
    matchId:S('m1'), tournamentId:S('t1'),
    playerUids:arr(S('ORG'),S('JOG')),
    scoreP1:I(0), scoreP2:I(0), updatedAt:S(AGORA)
  }});

  // ── ① O ATAQUE: o organizador inventa um jogo com o uid de um ESTRANHO ────────
  o.org_cria_com_estranho = await req('PATCH','tournaments/t1/results/m2','ORG',{fields:{
    matchId:S('m2'), tournamentId:S('t1'),
    playerUids:arr(S('ORG'),S('FORA')),
    scoreP1:I(6), scoreP2:I(0), updatedAt:S(AGORA)
  }});
  // ② e enfia o estranho num jogo que ja existe
  o.org_enfia_estranho = await req('PATCH','tournaments/t1/results/m1?updateMask.fieldPaths=playerUids','ORG',
    {fields:{playerUids:arr(S('ORG'),S('JOG'),S('FORA'))}});
  // ③ organizador grava SO o placar, sem tocar no elenco do jogo: a porta e do servidor,
  //    nao "de quem nao mexe no elenco"
  o.org_so_placar = await req('PATCH','tournaments/t1/results/m1?updateMask.fieldPaths=scoreP1','ORG',
    {fields:{scoreP1:I(6)}});
  // ④ o PARTICIPANTE daquele jogo lancando o placar — era o caso que a regra antiga abria
  o.jog_lanca_placar = await req('PATCH','tournaments/t1/results/m1?updateMask.fieldPaths=scoreP2','JOG',
    {fields:{scoreP2:I(3)}});
  // ⑤ e apagar
  o.org_apaga = await req('DELETE','tournaments/t1/results/m1','ORG',null);

  // ── LEITURA: tem de continuar viva, ou eu fechei o produto junto ──────────────
  o.leitura_jogador = await req('GET','tournaments/t1/results/m1','JOG',null);
  o.leitura_anonimo = await req('GET','tournaments/t1/results/m1',null,null);
  const q = await consultaMeusJogos('JOG');
  o.consulta_status = q.status;
  o.consulta_achou_m1 = q.ids.indexOf('m1')!==-1;

  console.log('__JSON__'+JSON.stringify(o));
  process.exit(0);
})();
`;

/* ⛔ CONTROLE: as MESMAS rules com o predicado ANTIGO de volta — e SO dentro do bloco de
 * `results`. Sem o "passava antes", um 403 nao prova que a regra nova recusou, prova so que
 * ALGUMA regra recusou.
 * ⚠️ `|| true` nao serve com `if false`: o controle recusaria igual e o teste ficaria verde
 * provando nada. E a troca e RECORTADA porque ha mais de um `allow create: if false;` no
 * arquivo — um replace global abriria a porta errada. */
function regrasAntigas() {
  const atual = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
  const ini = atual.indexOf('match /results/{matchId} {');
  if (ini < 0) throw new Error('controle: nao achei o bloco de results');
  const fim = atual.indexOf('match /', ini + 10);
  if (fim < 0) throw new Error('controle: nao achei o fim do bloco de results');
  let bloco = atual.slice(ini, fim);
  const trocar = (de, para, nome) => {
    const n = bloco.split(de).length - 1;
    if (n !== 1) throw new Error('controle: esperava 1 "' + nome + '" no bloco de results, achei ' + n);
    bloco = bloco.replace(de, para);
  };
  trocar('allow create: if false;',
    'allow create: if request.auth != null && isAdminOf(parentT());', 'o create fechado');
  trocar('allow update: if false;',
    'allow update: if request.auth != null && (isAdminOf(parentT())'
    + ' || ((resource.data.playerUids is list) && (request.auth.uid in resource.data.playerUids)'
    + ' && (request.resource.data.playerUids == resource.data.playerUids)));', 'o update fechado');
  trocar('allow delete: if false;',
    'allow delete: if request.auth != null && isAdminOf(parentT());', 'o delete fechado');
  trocar('function parentT() {',
    'function isAdminOf(pt) { return isTournamentAdmin(pt) || isTournamentAdminByUid(pt); }\n'
    + '        function parentT() {', 'o parentT (pra repor o isAdminOf)');
  const old = atual.slice(0, ini) + bloco + atual.slice(fim);
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sp-res-old-')), 'antigas.rules');
  fs.writeFileSync(f, old);
  return f;
}

function rodar(rulesPath, porta, rotulo) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-res-'));
  fs.writeFileSync(path.join(tmp, 'firebase.json'), JSON.stringify({
    firestore: { rules: rulesPath },
    emulators: { firestore: { port: porta }, ui: { enabled: false }, singleProjectMode: true },
  }));
  fs.writeFileSync(path.join(tmp, 'd.js'), DRIVER(porta));
  const out = execFileSync('firebase', ['emulators:exec', '--only', 'firestore',
    '--config', path.join(tmp, 'firebase.json'), '--project', PROJECT,
    'node ' + JSON.stringify(path.join(tmp, 'd.js'))],
  { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    env: Object.assign({}, process.env, { PATH: '/opt/homebrew/opt/openjdk/bin:' + process.env.PATH }) });
  const m = /__JSON__(\{.*\})/.exec(out);
  if (!m) { console.error('[' + rotulo + '] sem medida:\n' + out.slice(-1200)); process.exit(1); }
  return JSON.parse(m[1]);
}

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.error('  ✗ ' + m); } };

console.log('\n──── o resultado por jogo é do servidor ────\n');
const A = rodar(path.join(ROOT, 'firestore.rules'), PORT_ATUAL, 'regras atuais');

ok(A.org_cria_com_estranho === 403,
  '① ⭐⭐ o ORGANIZADOR não inventa jogo com o uid de um estranho — veio ' + A.org_cria_com_estranho);
ok(A.org_enfia_estranho === 403,
  '② ⭐⭐ nem enfia o estranho num jogo existente — veio ' + A.org_enfia_estranho);
ok(A.org_so_placar === 403,
  '③ 🔒 nem o placar sozinho: a porta é do SERVIDOR — veio ' + A.org_so_placar);
ok(A.jog_lanca_placar === 403,
  '④ 🔒 o participante daquele jogo também não escreve aqui — veio ' + A.jog_lanca_placar);
ok(A.org_apaga === 403,
  '⑤ 🔒 e não apaga — veio ' + A.org_apaga);
ok(A.leitura_jogador === 200,
  '⭐ LEITURA viva: o jogador lê o próprio jogo — veio ' + A.leitura_jogador);
ok(A.leitura_anonimo === 200,
  '⭐ LEITURA viva: anônimo lê jogo de torneio público — veio ' + A.leitura_anonimo);
ok(A.consulta_status === 200,
  '⭐⭐ "Meus Resultados" (collection group + array-contains + orderBy) responde — veio ' + A.consulta_status);
ok(A.consulta_achou_m1 === true,
  '⭐⭐ e ela TRAZ o jogo — sem isto eu teria fechado o produto junto com a porta');

console.log('  ── controle (mesmas rules com o predicado ANTIGO) ──');
const B = rodar(regrasAntigas(), PORT_CONTROLE, 'controle');
ok(B.org_cria_com_estranho === 200, 'controle: inventar jogo com estranho PASSAVA — veio ' + B.org_cria_com_estranho);
ok(B.org_enfia_estranho === 200, 'controle: enfiar estranho PASSAVA — veio ' + B.org_enfia_estranho);
ok(B.org_so_placar === 200, 'controle: organizador gravava placar — veio ' + B.org_so_placar);
ok(B.jog_lanca_placar === 200, 'controle: participante gravava placar — veio ' + B.jog_lanca_placar);
ok(B.org_apaga === 200, 'controle: organizador apagava — veio ' + B.org_apaga);
ok(B.consulta_status === 200, 'controle: a consulta do produto já respondia antes — veio ' + B.consulta_status);

console.log('\n' + (fail ? '✗ ' + fail + ' falha(s), ' : '✅ ') + pass + ' verificações');
process.exit(fail ? 1 : 0);
