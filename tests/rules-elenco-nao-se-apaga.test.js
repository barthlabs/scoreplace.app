'use strict';
/* ⛔⛔ NINGUÉM APAGA O ELENCO DE UM TORNEIO ALHEIO.
 *
 * PROVADO NO EMULADOR em 13/set/2026, contra as Rules REAIS, antes do corte:
 *     inscrito apaga OUTRO do elenco ............ PASSOU
 *     inscrito marca o torneio como 'finished' .. PASSOU
 *     quem NEM É INSCRITO apaga o elenco todo ... PASSOU
 *
 * ⛔ A causa: `isEnrollmentOnlyDiff()` conferia SÓ QUAIS CAMPOS mudaram — nunca quem escreve
 * nem o quê. `hasOnly([...])` é uma lista de campos, não uma autorização. O mesmo valia para
 * `isParticipantBracketDiff()`, que também carrega `participants` e `memberUids`.
 *
 * ⚠️ NÃO É PELA TELA: o app nunca ofereceu isso a um inscrito. É escrevendo direto no
 * Firestore com a credencial da própria sessão — e "o app não oferece" nunca foi fronteira.
 *
 * ⭐ O CORTE É O MÍNIMO QUE MATA A DESTRUIÇÃO SEM QUEBRAR A INSCRIÇÃO:
 *   ① ninguém é REMOVIDO de `memberUids` por essas duas portas (apagar é o que não tem
 *      volta; tirar gente é do organizador, por outro ramo, ou da CF);
 *   ② quem se inscreve tem de TERMINAR DENTRO de `memberUids`.
 * A inscrição SOLO e a de DUPLA (dois uids de uma vez) continuam passando — é o que as
 * asserções de PRODUTO abaixo guardam. Portão sem elas viraria "cortei e não sei o que
 * quebrei".
 *
 * ⚠️ FICA MEDIDO E NÃO CORTADO: um inscrito ainda pode mexer em `status`. É de propósito —
 * quem lança o placar da final FECHA o torneio, e encodar a máquina de estados na Rule é
 * mais risco do que o que se ganha. Reabrir é CF. Anotado, não esquecido.
 *
 * Dados 100% sintéticos. Nada de produção é lido ou escrito.
 * Rodado por: npm run test:rules
 */
const { execFileSync } = require('child_process');
const fs=require('fs'), path=require('path'), os=require('os');
const ROOT=path.join(__dirname,'..');
const PORT=8093;   // 8094+ são das outras suítes de rules
const PROJECT='demo-scoreplace';
const DRIVER=`
const P='${PROJECT}', H='http://127.0.0.1:${PORT}';
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const tok=uid=>b64({alg:'none',typ:'JWT'})+'.'+b64({iss:'https://securetoken.google.com/'+P,aud:P,sub:uid,user_id:uid,
  auth_time:Math.floor(Date.now()/1000),iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600,
  email:uid+'@x.invalid',email_verified:true,firebase:{identities:{},sign_in_provider:'google.com'}})+'.';
const base=H+'/v1/projects/'+P+'/databases/(default)/documents/';
const cab=q=>{const h={'Content-Type':'application/json'}; if(q==='owner')h.Authorization='Bearer owner'; else if(q)h.Authorization='Bearer '+tok(q); return h;};
const req=(m,p,q,b)=>fetch(base+p,{method:m,headers:cab(q),body:b?JSON.stringify(b):undefined}).then(r=>r.status);
const S=v=>({stringValue:v});
const arr=(...xs)=>({arrayValue:{values:xs}});
const mapa=o=>({mapValue:{fields:o}});
(async()=>{
  const o={};
  // torneio com organizador ORG e inscritos JOG e VITIMA
  await req('PATCH','tournaments/t1','owner',{fields:{
    name:S('Confra'), creatorUid:S('ORG'), status:S('open'),
    memberUids:arr(S('ORG'),S('JOG'),S('VITIMA')),
    participants:arr(mapa({uid:S('JOG'),name:S('Jogador')}), mapa({uid:S('VITIMA'),name:S('Vitima')})),
    _nascidoEm:{timestampValue:new Date().toISOString()}
  }});
  // ① o inscrito JOG apaga a VITIMA do elenco (participants + memberUids, como o app faria)
  o.apaga_outro = await req('PATCH','tournaments/t1?updateMask.fieldPaths=participants&updateMask.fieldPaths=memberUids','JOG',
    {fields:{participants:arr(mapa({uid:S('JOG'),name:S('Jogador')})), memberUids:arr(S('ORG'),S('JOG'))}});
  // ② o inscrito muda o STATUS do torneio
  o.muda_status = await req('PATCH','tournaments/t1?updateMask.fieldPaths=status','JOG',{fields:{status:S('finished')}});
  // ③ quem NÃO é inscrito tenta o mesmo
  o.estranho_apaga = await req('PATCH','tournaments/t1?updateMask.fieldPaths=participants','ESTRANHO',
    {fields:{participants:arr()}});
  // ④ o que a INSCRIÇÃO precisa: um novo entra, sem tirar ninguém
  o.entra_sozinho = await req('PATCH','tournaments/t1?updateMask.fieldPaths=memberUids','NOVO',
    {fields:{memberUids:arr(S('ORG'),S('JOG'),S('VITIMA'),S('NOVO'))}});
  // ⑤ e dupla: dois uids de uma vez, um deles o próprio
  o.entra_dupla = await req('PATCH','tournaments/t1?updateMask.fieldPaths=memberUids','D1',
    {fields:{memberUids:arr(S('ORG'),S('JOG'),S('VITIMA'),S('NOVO'),S('D1'),S('D2'))}});
  // ⛔ CONTROLE: anônimo tem de ser NEGADO. Se passar, a sonda não está valendo as rules.
  o.anonimo = await req('PATCH','tournaments/t1?updateMask.fieldPaths=status',null,{fields:{status:S('x')}});
  // ⛔ CONTROLE 2: um campo FORA da lista do inscrito tem de ser negado
  o.campo_fora = await req('PATCH','tournaments/t1?updateMask.fieldPaths=name','JOG',{fields:{name:S('roubado')}});
  console.log('__JSON__'+JSON.stringify(o));
  process.exit(0);
})();
`;
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'spq-'));
fs.writeFileSync(path.join(tmp,'firebase.json'),JSON.stringify({firestore:{rules:path.join(ROOT,'firestore.rules')},
  emulators:{firestore:{port:PORT},ui:{enabled:false},singleProjectMode:true}}));
fs.writeFileSync(path.join(tmp,'d.js'),DRIVER);
const out=execFileSync('firebase',['emulators:exec','--only','firestore','--config',path.join(tmp,'firebase.json'),
  '--project',PROJECT,'node '+JSON.stringify(path.join(tmp,'d.js'))],
  {cwd:ROOT,encoding:'utf8',stdio:['ignore','pipe','pipe'],
   env:Object.assign({},process.env,{PATH:'/opt/homebrew/opt/openjdk/bin:'+process.env.PATH})});
const m=/__JSON__(\{.*\})/.exec(out);
if(!m){console.error(out.slice(-800));process.exit(1);}
const r=JSON.parse(m[1]);
const rot=c=>c===200?'PASSOU':(c===403?'negado':'HTTP '+c);
let pass=0, fail=0;
const ok=(c,m)=>{ if(c){pass++;console.log('  ✓ '+m);} else {fail++;console.error('  ✗ '+m);} };
console.log('\n──── ninguém apaga o elenco alheio ────\n');
ok(r.apaga_outro===403, '① ⭐⭐ um INSCRITO não apaga outro do elenco (got '+r.apaga_outro+')');
ok(r.estranho_apaga===403, '① ⭐⭐ quem NEM É INSCRITO não APAGA o elenco (got '+r.estranho_apaga+')');
ok(r.entra_sozinho===200, '② ⭐ o PRODUTO continua: um novo se inscreve (got '+r.entra_sozinho+')');
ok(r.entra_dupla===200, '② ⭐ e a DUPLA também, dois uids de uma vez (got '+r.entra_dupla+')');
ok(r.anonimo===403, '③ CONTROLE: anônimo é negado — a sonda está valendo as Rules (got '+r.anonimo+')');
ok(r.campo_fora===403, '③ CONTROLE: campo fora da lista é negado (got '+r.campo_fora+')');
ok(r.muda_status===200, '④ ⚠️ MEDIDO E NÃO CORTADO: inscrito ainda mexe em `status` — quem lança a final fecha o torneio');

/* ── ⑤ A ALLOWLIST ENCOLHEU, E SÓ POR MEDIDA ───────────────────────────────
 * A L6 aponta que esta lista autoriza por CHAVE e nunca por valor, e que cresceu para ~43
 * campos. Cinco saíram em 13/set/2026 — `lastModified`, `pollNotifications`,
 * `_finishNotified`, `_roundCloseAt`, `pendingMerges` — depois de medir as DUAS pontas:
 * ZERO escritores no cliente de hoje e ZERO menções no BUNDLE INSTALADO (2.2.4, o que está
 * nas lojas). Cortar não tirou permissão de ninguém, nem de quem não recebe atualização.
 * ⚠️ `polls` FICOU: aparece 3× no bundle instalado. Campo com escritor real não sai por
 * arrumação — é assim que se quebra quem já está na loja. */
const RULES = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
const iL = RULES.indexOf('function isParticipantBracketDiff');
const lista = RULES.slice(iL, RULES.indexOf(']);', iL));
['lastModified', 'pollNotifications', '_finishNotified', '_roundCloseAt', 'pendingMerges']
  .forEach((c) => ok(lista.indexOf("'" + c + "'") === -1,
    '⑤ ⛔ `' + c + '` saiu da allowlist do inscrito (zero escritores, aqui e no bundle da loja)'));
ok(lista.indexOf("'polls'") !== -1,
  '⑤ ⭐ `polls` FICOU — tem escritor real no bundle instalado');
['matches', 'status', 'participants', 'memberUids'].forEach((c) =>
  ok(lista.indexOf("'" + c + "'") !== -1,
    '⑤ `' + c + '` continua — o produto depende dele, e agora há checagem de VALOR'));
console.log('\n'+(fail?'✗ '+fail+' falha(s), ':'✅ ')+pass+' verificações');
process.exit(fail?1:0);
/* saída antiga, mantida fora do caminho:
console.log('inscrito APAGA outro do elenco:', rot(r.apaga_outro));
console.log('inscrito muda o STATUS:        ', rot(r.muda_status));
console.log('estranho apaga:                ', rot(r.estranho_apaga));
console.log('PRODUTO  novo se inscreve:     ', rot(r.entra_sozinho), '  (tem de PASSAR)');
console.log('PRODUTO  dupla se inscreve:    ', rot(r.entra_dupla), '  (tem de PASSAR)');
console.log('CONTROLE anônimo escreve:      ', rot(r.anonimo), '  (tem de ser NEGADO)');
console.log('CONTROLE campo fora da lista:  ', rot(r.campo_fora), '  (tem de ser NEGADO)'); */
