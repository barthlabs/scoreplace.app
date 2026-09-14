'use strict';
/* ⛔⛔ UNIR CONTAS PASSOU A TER VOLTA — 30 DIAS.
 *
 * Ordem do dono (13/set/2026): _"essa mesclagem deveria ter uma possivel reversão dentro de 30
 * dias caso a pessoa responda sim equivocadamente. um email de confirmacao com a possibilidade
 * de reversao pode ajudar."_
 *
 * ⛔ O QUE IMPEDIA A VOLTA: a união APAGAVA a conta de autenticação absorvida (`deleteUser`)
 * para liberar o celular e o e-mail — o Firebase não deixa duas contas com a mesma credencial.
 * Depois disso não havia o que desfazer. Agora ela é DESLIGADA e tem a credencial retirada,
 * que é tudo o que precisava ser liberado; a conta continua de pé.
 *
 * ⛔ E A BORDA QUE ANULARIA TUDO: já existia uma varredura apagando a conta 7 dias depois da
 * união. Ela teria destruído no 8º dia o que a tela promete por 30. Os dois prazos passaram a
 * sair do MESMO lugar. [[feedback_a_defesa_vaza_pela_borda]]
 */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const raiz = path.join(__dirname, '..');
let ok = 0;
const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };
const semComentario = (t) => t.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');

const SRC = fs.readFileSync(path.join(raiz, 'functions/index.js'), 'utf8');
const CODIGO = semComentario(SRC);
const D = require(path.join(raiz, 'functions/desfazer-fusao-core.js'));

console.log('\n──── unir contas tem volta ────\n');

// ── ① a união não destrói mais a conta absorvida ───────────────────────────
const iM = CODIGO.indexOf('async function _mergeAccountsKeepOlder(');
const MERGE = CODIGO.slice(iM, CODIGO.indexOf('\nasync function', iM + 10));
must(!/deleteUser\(dropU\.uid\)/.test(MERGE),
  '① ⛔⛔ a união NÃO apaga mais a conta absorvida — era isso que tornava a volta impossível');
must(/planejarDesligamento\(dropU\)/.test(MERGE),
  '① ⭐ ela é desligada e tem a credencial retirada, que é o que precisava ficar livre');
must(/collection\("mergeUndo"\)\.doc\(dropU\.uid\)/.test(MERGE),
  '① ⭐ e o que foi retirado fica anotado — sem isso não há o que repor');

// ── ② o prazo mora num lugar só ────────────────────────────────────────────
must(D.JANELA_DIAS === 30, '② o prazo é de 30 dias');
must(/GHOST_THRESHOLD_MS\s*=\s*_desfazer\.JANELA_DIAS/.test(CODIGO),
  '② ⭐⭐ a varredura que apaga contas antigas LÊ esse prazo — antes eram 7 dias fixos e ela ' +
  'apagaria no 8º dia o que a tela promete por 30');

// ── ③ a união anota o que mudou nos documentos ─────────────────────────────
const iS = CODIGO.indexOf('async function _sweepAllCollectionsByUid(');
const SWEEP = CODIGO.slice(iS, CODIGO.indexOf('\nasync function', iS + 10));
must(/registro\.push\(\{ col: nome, id: doc\.id, antes: antes \}\)/.test(SWEEP),
  '③ ⭐⭐ a varredura anota EM QUAIS documentos mexeu e o que havia antes');
must(/if \(registro\)/.test(SWEEP),
  '③ e quem não passa caderno segue funcionando igual');
const iE = CODIGO.indexOf('async function _executeMergeInterno(');
const EXEC = CODIGO.slice(iE, CODIGO.indexOf('\nasync function', iE + 10));
const iAnota = EXEC.indexOf('collection("mergeUndo")');
const iLapide = EXEC.indexOf('mergedInto: keepUid');
must(iAnota > 0 && iLapide > 0 && iAnota < iLapide,
  '③ ⛔ o caderno é gravado ANTES da lápide — ela é que declara a união feita');
/* ⛔⛔ A FALHA QUE ESTE PORTÃO NÃO PEGOU DA PRIMEIRA VEZ, e por isso está aqui agora:
 * eu anotei só o que a varredura genérica toca — e ela EXCLUI `tournaments` de propósito,
 * porque o torneio tem reparo próprio. A volta deixaria todos os torneios apontando para o
 * sobrevivente, que é exatamente o que faz alguém querer separar as contas.
 * [[feedback_a_defesa_vaza_pela_borda]] */
const iR = CODIGO.indexOf('async function _repairTournaments(');
const REPARO = CODIGO.slice(iR, CODIGO.indexOf('\nasync function', iR + 10));
must(/registro\.push\(\{ col: "tournaments", id: tourDoc\.id/.test(REPARO),
  '③ ⭐⭐ o TORNEIO entra no caderno — a varredura genérica não o cobre, ele tem reparo próprio');
const iSub = CODIGO.indexOf('async function _sweepTournamentSubcollections(');
const SUB = CODIGO.slice(iSub, CODIGO.indexOf('\nasync function', iSub + 10));
must(/registro\.push\(\{ col: col\.path, id: doc\.id/.test(SUB),
  '③ ⭐ e as subcoleções do torneio também');
must(/mudouDeNome: true/.test(SUB),
  '③ ⭐⭐ inclusive o espelho `participants\/{uid}`, que MUDA DE NOME em vez de mudar de campo');
must(/jaExistia: novo\.exists/.test(SUB),
  '③ ⛔⛔ anotando se o do sobrevivente já existia — sem isso a volta apagaria o espelho que sempre foi dele');
const iCad = EXEC.indexOf('const anotacoes = []');
const iRep = EXEC.indexOf('_repairTournaments(');
must(iCad > 0 && iRep > 0 && iCad < iRep,
  '③ ⛔ o caderno nasce ANTES do primeiro passo que muda dado');

must(/perfilAbsorvido: dropData/.test(EXEC) && /perfilSobreviventeAntes: keepData/.test(EXEC),
  '③ ⭐ os dois perfis de antes vão no caderno — a união COPIA campos de um para o outro');
must(/completo: false/.test(EXEC),
  '③ ⛔⛔ caderno que falhou fica marcado como incompleto — a porta prefere dizer que não dá ' +
  'a tentar e estragar');

// ── ④ a porta de separar ───────────────────────────────────────────────────
const iD = CODIGO.indexOf('exports.desfazerFusao = onCall(');
must(iD > 0, '④ a porta de separar existe');
const PORTA = CODIGO.slice(iD, CODIGO.indexOf('\nexports.', iD + 10));
must(/u\.sobreviveu !== callerUid/.test(PORTA),
  '④ ⛔⛔ só de dentro da conta que sobreviveu — é a única que provou ter as duas');
must(/u\.completo !== true/.test(PORTA),
  '④ ⛔ caderno incompleto não separa nada');
must(/dentroDoPrazo\(u\.emMs, Date\.now\(\)\)/.test(PORTA),
  '④ ⭐ e o prazo é conferido');
must(/u\.desfeita/.test(PORTA), '④ e não separa duas vezes');
must(/_amizadeLock\.adquirir\(db, \[u\.sobreviveu, absorvida\]/.test(PORTA),
  '④ ⭐ com a MESMA trava da união — as duas mexem nos mesmos documentos');
must(/it\.mudouDeNome/.test(PORTA) && /planejarVoltaDoNome\(it\)/.test(PORTA),
  '④ ⭐⭐ e a porta sabe desfazer as DUAS formas: campo trocado e documento renomeado');

must(/planejarVolta\(u\.guardado, u\.recebidasPelaSobrevivente\)/.test(PORTA),
  '④ ⭐⭐ e só devolve a credencial que a união LEVOU — devolver outra roubaria um login');
must(/collection\("loginRedirects"\)\.doc\(String\(cred\)\.toLowerCase\(\)\)\.delete\(\)/.test(PORTA),
  '④ ⭐ o desvio de login some junto: sem isso, entrar pela credencial devolvida cairia de ' +
  'volta na conta unida');
must(/throw new HttpsError\("failed-precondition"/.test(PORTA),
  '④ ⛔ se a conta não religar, a porta FALA — ficar calado deixaria um cadastro sem entrada');

// ── ⑤ o aviso por e-mail, com a saída junto ────────────────────────────────
must(/async function _avisarFusaoFeita\(/.test(CODIGO), '⑤ o aviso de união feita existe');
const iA = CODIGO.indexOf('async function _avisarFusaoFeita(');
const AVISO = CODIGO.slice(iA, CODIGO.indexOf('\nexports.', iA));
must(/\?desfazer=/.test(AVISO), '⑤ ⭐⭐ e traz o caminho de volta dentro dele');
must(/podeDesfazer \? \(/.test(AVISO),
  '⑤ ⛔ o botão de separar só aparece quando a separação é possível de verdade');
must(/u\.perfilAbsorvido \|\| \{\}\)\.email/.test(AVISO),
  '⑤ ⭐⭐ vai para os endereços das DUAS contas — quem precisa saber é justamente quem não clicou');
must(/o que você fizer daqui para a frente fica na conta onde aconteceu/.test(AVISO),
  '⑤ ⛔ e não promete o que não pode cumprir: a volta desfaz a UNIÃO, não o que veio depois');
must(/_avisarFusaoFeita\(db, res\.survivorUid, res\.droppedUid\)/.test(CODIGO),
  '⑤ ⭐ e quem une de verdade realmente avisa');

// ── ⑥ o link do e-mail é atendido pelo aplicativo ─────────────────────────
const AUTH = fs.readFileSync(path.join(raiz, 'js/views/auth.js'), 'utf8');
const CLIENTE = semComentario(AUTH);
must(/qs && qs\.get\('desfazer'\)/.test(CLIENTE),
  '⑥ ⭐⭐ o aplicativo atende o link `?desfazer=` — sem isso o e-mail apontaria para o nada');
must(/httpsCallable\('desfazerFusao'\)/.test(CLIENTE),
  '⑥ e chama a porta de separar');
const iH = CLIENTE.indexOf("qs.get('desfazer')");
const HANDLER = CLIENTE.slice(iH, CLIENTE.indexOf('})();', iH));
must(/Entre para separar as contas/.test(HANDLER),
  '⑥ ⛔ sem sessão ele manda ENTRAR — separar exige estar na conta que ficou');
must(/fora-do-prazo/.test(HANDLER) && /registro-incompleto/.test(HANDLER),
  '⑥ ⛔⛔ cada recusa diz o motivo na tela — "não deu" sem porquê faz tentar para sempre');
must(/continua nesta conta aqui/.test(HANDLER),
  '⑥ ⛔ e o sucesso não promete demais: o que veio depois da união fica onde aconteceu');

console.log('\n✅ ' + ok + ' verificações');
