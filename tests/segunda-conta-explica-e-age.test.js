'use strict';
/* ⛔⛔ A PERGUNTA DE SEGUNDA CONTA TEM DE EXPLICAR A SITUAÇÃO — E O "SIM" TEM DE AGIR.
 *
 * Ordens do dono (13/set/2026):
 *   _"temos que reforcar isso. mandar email, sms o que for e colocar um popup na conta nao
 *   abandonada para ela tomar a providencia de confirmar e dai fazer a mesclagem... do sistema
 *   ser inteligente e funcional. facilitar a vida das pessoas e nao dificultar."_
 *   _"se ela esta entrando na conta nova e nao esta dizendo nem sim nem nao a comunicacao nao
 *   esta clara e efetiva"_
 *   _"precisa nesse caso de um popup na tela explicando a situacao dela. com detalhes.
 *   mencionando como é a outra conta abamdonada. que a outra conta esta no torneio tal e essa
 *   conta nao"_
 *
 * ⛔ OS DOIS DEFEITOS, MEDIDOS NO CASO REAL (25/ago a 13/set, 19 dias):
 *   ① A pergunta identificava a outra conta pelo e-mail OCULTO da Apple
 *      (`p8***@privaterelay.appleid.com`) — um código que a pessoa nunca viu. Ela abriu o
 *      aplicativo várias vezes e não respondeu nem sim nem não: não dava para reconhecer.
 *   ② Responder "sim" só abria o perfil pedindo que ela "confirmasse a posse" DIGITANDO o
 *      e-mail da outra conta — que o próprio aplicativo mostra mascarado. Beco sem saída.
 *
 * ⭐ A pergunta passou a contar a situação (qual torneio está lá, que aqui não tem nenhum) e o
 * "sim" passou a mandar a confirmação sozinho, pela máquina de prova que já existia.
 */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const raiz = path.join(__dirname, '..');
let ok = 0;
const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };
const semComentario = (t) => t.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');

const SRC = fs.readFileSync(path.join(raiz, 'functions/index.js'), 'utf8');
const AUTH = fs.readFileSync(path.join(raiz, 'js/views/auth.js'), 'utf8');
const CODIGO = semComentario(SRC);

console.log('\n──── segunda conta: explica e age ────\n');

// ── ① a pergunta na tela conta a situação ──────────────────────────────────
const iP = AUTH.indexOf('window._askDuplicateAccount = function');
const POPUP = semComentario(AUTH.slice(iP, AUTH.indexOf('window._askNameConflict = function', iP)));
must(iP > 0, '① a pergunta existe');
must(/ds\.pista/.test(POPUP), '① ⭐ ela usa a pista que o servidor mandou');
must(/está inscrita em/.test(POPUP),
  '① ⭐⭐ e diz EM QUAL TORNEIO a outra conta está — é o que a pessoa reconhece');
must(/você não está em torneio nenhum/.test(POPUP),
  '① ⭐⭐ e diz que NESTA conta não há torneio nenhum — a comparação é o que explica a situação');
must(/euTenhoTorneios === 0/.test(POPUP),
  '① ⛔ essa frase só sai quando é VERDADE — não é texto fixo');
must(/esconder seu e-mail de verdade/.test(POPUP),
  '① ⭐ e explica o código estranho da Apple, em vez de mostrá-lo como se a pessoa soubesse');

// ── ② o "sim" AGE — não larga no perfil ────────────────────────────────────
const iSim = POPUP.indexOf("confirmText: 'Sim, unir as duas'");
must(iSim > 0, '② o botão diz o que vai acontecer: unir as duas');
must(/_callCF\('pedirProvaDaSegundaConta'/.test(POPUP),
  '② ⭐⭐ responder sim CHAMA o servidor — antes só mudava o endereço da tela');
const iHash = POPUP.indexOf("window.location.hash = '#profile'");
must(iHash < 0 || /typeof window\._callCF !== 'function'/.test(POPUP),
  '② ⛔ e o perfil só entra como último recurso, se o caminho do servidor não existir');
must(/Mandamos um e-mail para/.test(POPUP),
  '② ⭐ e a pessoa fica sabendo para onde a confirmação foi');
must(/so-por-celular/.test(POPUP),
  '② ⭐ quando a outra conta não tem e-mail, a saída pelo celular é dita, não omitida');
must(/Não deu para enviar agora/.test(POPUP),
  '② ⛔ e uma falha APARECE — tocar em sim e nada acontecer é o defeito que estamos consertando');

// ── ③ o servidor descobre sozinho qual é a outra conta ─────────────────────
const iD = CODIGO.indexOf('exports.pedirProvaDaSegundaConta = onCall(');
must(iD > 0, '③ a porta existe no servidor');
const PORTA = CODIGO.slice(iD, CODIGO.indexOf('\nexports.', iD + 10));
must(/_detectarDuplicataNaBase\(db, callerUid/.test(PORTA),
  '③ ⭐⭐ ela redescobre o par sozinha — o cliente nunca soube nem manda o uid do outro');
must(!/request\.data.*uid/.test(PORTA),
  '③ ⛔ e não aceita um uid vindo de fora: seria entrar na conta que a pessoa apontasse');

// ── ④ a confirmação vai para um endereço que existe ───────────────────────
must(/_isSyntheticAuthEmail/.test(PORTA),
  '④ ⭐ e-mail interno de conta por telefone não é endereço de ninguém — não serve de prova');
must(/auth\/user-not-found/.test(PORTA),
  '④ ⛔ falha de leitura não vira "não tem e-mail" — só "essa conta não existe" conta');
must(/_sendMergeProofEmail\(db, callerUid, alvo\.uid, email\)/.test(PORTA),
  '④ ⭐⭐ e a prova sai pela máquina que já existia, que une pela porta de sempre');
must(/mergeProofLimits/.test(PORTA),
  '④ com o mesmo limite de envios da prova por homônimo');

// ── ⑤ dizer "sim" NÃO une nada sozinho ─────────────────────────────────────
must(!/_mergeAccountsKeepOlder/.test(PORTA) && !/_executeMerge/.test(PORTA),
  '⑤ ⛔⛔ a porta NÃO une — quem une é quem RECEBE a mensagem na outra conta');

// ── ⑥ o reforço que fica, fora da caixa na tela ───────────────────────────
must(/async function _avisarSegundaContaNoCadastro\(/.test(CODIGO),
  '⑥ o aviso que FICA existe — popup fechado no X não deixa rastro nenhum');
const iA = CODIGO.indexOf('async function _avisarSegundaContaNoCadastro(');
const AVISO = CODIGO.slice(iA, CODIGO.indexOf('\nasync function', iA + 10));
must(/collection\("notifications"\)\.doc\(notifId\)/.test(AVISO),
  '⑥ ⭐ ele entra no sininho com id fixo — o gatilho roda muito e não pode empilhar repetido');
must(/notif_email_queue/.test(AVISO), '⑥ ⭐ e sai por e-mail para quem tem endereço');
must(/if \(!ja\.exists\)/.test(AVISO),
  '⑥ ⛔ o e-mail sai UMA vez por par — reenviar a cada toque no perfil vira perseguição');
must(/_avisarSegundaContaNoCadastro\(db, uid, a, _dup\)/.test(CODIGO),
  '⑥ ⭐⭐ e o gatilho que levanta a suspeita realmente avisa');

// ── ⑦ nada de contato ou uid alheio vaza ──────────────────────────────────
const iG = CODIGO.indexOf('dupSuspect: {', CODIGO.indexOf('_mudouIdent'));
const GRAVA = CODIGO.slice(iG, CODIGO.indexOf('}, { merge: true });', iG));
must(!/uid:/.test(GRAVA),
  '⑦ ⛔⛔ o que chega ao aplicativo NÃO leva o uid da outra conta');
must(/maskedEmail: _dup\.maskedEmail/.test(GRAVA),
  '⑦ ⭐ o contato vai MASCARADO, como sempre foi');
must(/pista: _dup\.pista/.test(GRAVA),
  '⑦ ⭐ e a pista (torneio e por onde entra) vai junto — é o que torna a pergunta reconhecível');

console.log('\n✅ ' + ok + ' verificações');
