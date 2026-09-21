'use strict';
/* ⛔⛔ O MESMO TELEFONE EM DUAS CONTAS É NORMAL — E NUNCA UNE NADA.
 *
 * Ordem do dono (13/set/2026), depois de eu errar duas vezes seguidas no mesmo ponto:
 *   _"pelo caso da fabiana e val é a prova que só autenticada é prova verdadeira. nao pode
 *   mesclar ou considerar digitado pelo organizador"_
 *   _"e sempre pode acontecer de autenticar 1 telefone em duas contas (mae e filho usando o
 *   mesmo telefone), marido e mulher como é o caso do val e fabiana"_
 *
 * ⛔ AS DUAS COISAS QUE EU TINHA CONSTRUÍDO E ESTAVAM ERRADAS:
 *   ① recusar o registro de contato quando o número já estava autenticado noutra conta;
 *   ② unir automaticamente duas contas que carregassem o mesmo número.
 * O dado real desmentiu as duas de uma vez: Fabiana e Val dividem o número, são casal e estão
 * INSCRITOS NO MESMO TORNEIO. A recusa quebrava o organizador; a união teria apagado a conta
 * de uma pessoa de verdade.
 *
 * ⭐ A REGRA QUE FICA, e é uma só: telefone é CONTATO. Ele só é prova de identidade quando a
 * própria pessoa o confirma por SMS — e mesmo aí prova apenas que o aparelho é dela, nunca que
 * duas contas são a mesma pessoa. Nada de união por telefone, em lugar nenhum.
 */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const raiz = path.join(__dirname, '..');
let ok = 0;
const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };

const SRC = fs.readFileSync(path.join(raiz, 'functions/index.js'), 'utf8');
const semComentario = (t) => t.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');

console.log('\n──── telefone repetido não une conta ────\n');

// ── ① a porta de contato não recusa por número repetido ────────────────────
const iCt = SRC.indexOf('exports.setParticipantContactPhone');
const PORTA = semComentario(SRC.slice(iCt, SRC.indexOf('\n);', iCt)));
must(iCt > 0, '① a porta de registrar contato existe');
must(!/getUserByPhoneNumber/.test(PORTA),
  '① ⭐⭐ ela NÃO vai perguntar quem autenticou o número — casal e mãe/filho dividem aparelho');
must(!/already-exists/.test(PORTA),
  '① ⛔ e não recusa por "esse número já é de outra conta" — era a recusa que quebrava o organizador');
const iGrava = PORTA.indexOf('.set(r.update, { merge: true })');
must(iGrava > 0, '① ⭐ ela grava o contato na conta da pessoa, que é para o que serve');

// ── ② o número entra marcado como posto por terceiro ───────────────────────
const C = require(path.join(raiz, 'functions/contact-phone-core.js'));
const r = C.computeSetContactPhone({
  tournament: { id: 't1', creatorUid: 'orgUid00', participants: [{ uid: 'alvoUid00' }], memberUids: ['orgUid00', 'alvoUid00'] },
  callerUid: 'orgUid00', targetUid: 'alvoUid00', phone: '11982012440', country: '55',
  targetProfile: {}, nowIso: '2026-09-13T12:00:00.000Z',
});
must(r.ok, '② registrar contato de um inscrito continua permitido ao organizador');
must(r.update.phoneSource === 'organizer',
  '② ⭐ e entra marcado como posto por terceiro — é contato, não identidade');

// ── ③ quem já confirmou o próprio número não tem o dele trocado ────────────
const r2 = C.computeSetContactPhone({
  tournament: { id: 't1', creatorUid: 'orgUid00', participants: [{ uid: 'alvoUid00' }], memberUids: ['orgUid00', 'alvoUid00'] },
  callerUid: 'orgUid00', targetUid: 'alvoUid00', phone: '11999990000', country: '55',
  targetProfile: { phone: '+5511982012440', phoneVerified: true },
  nowIso: '2026-09-13T12:00:00.000Z',
});
must(!r2.ok && r2.reason === 'ja-tem-verificado',
  '③ ⭐⭐ o registro confirmado por SMS vence o digitado — o organizador não sobrescreve');

// ── ④ NENHUMA união é disparada por telefone ───────────────────────────────
const CODIGO = semComentario(SRC);
must(!/_assumirContaDoTelefone/.test(CODIGO),
  '④ ⛔⛔ não existe porta que "assume a conta existente" pelo telefone — era a união que o dono vetou');
must(!/unirContasDobradas/.test(CODIGO),
  '④ ⛔ nem conserto em massa que una contas por número repetido');
const CLIENTE = fs.readFileSync(path.join(raiz, 'js/views/auth.js'), 'utf8');
must(!/assumirContaDoTelefone/.test(CLIENTE),
  '④ ⛔ e o aplicativo não chama nada disso na entrada por SMS');

must(/fusão automática de contas está desativada/.test(CODIGO),
  '④ nenhuma união automática resta: até credencial confirmada abre caso/revisão, não funde contas');

// ── ⑤ o carimbo do organizador continua caducando ──────────────────────────
must(/apagarCarimboDeTerceiro/.test(CODIGO),
  '⑤ ⭐ quando a pessoa confirma o próprio número, o registro do organizador cai');

console.log('\n✅ ' + ok + ' verificações');
