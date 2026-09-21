'use strict';
/* ⛔ `linkedEmails` É PROVA DE POSSE — E O CLIENTE ESCREVIA A LISTA INTEIRA.
 * MEDIDO no inventário da L4: o servidor aceita `linkedEmails` como prova numa FUSÃO DE CONTAS
 * (`via: "email-vinculado"`) e resolve conta por ele no LOGIN POR SENHA e no RESET
 * (`_uidByProfileEmail` → `_resolveAccount` → `checkAccount`). A ADIÇÃO virou server-only na
 * L1.1 — só entra com token de e-mail confirmado. A REMOÇÃO continuava um
 * `users/{uid}.update({ linkedEmails })` cru, e a mesma Rule que deixa remover deixa gravar
 * QUALQUER array: bastava escrever o e-mail de outra pessoa para o servidor passar a tratar
 * aquela caixa como prova de posse da minha conta.
 * Das portas abertas do inventário, era a ÚNICA cuja consequência é entrar na conta alheia.
 */
const assert = require('assert/strict'), fs = require('fs'), path = require('path');
const raiz = path.join(__dirname, '..');
const F = fs.readFileSync(path.join(raiz, 'functions/index.js'), 'utf8');
const A = fs.readFileSync(path.join(raiz, 'js/views/auth.js'), 'utf8');
let ok = 0; const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };
const semComentario = (s) => s.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');

// ── ① o cliente não escreve mais a lista ────────────────────────────────────
const cru = (semComentario(A).match(/linkedEmails:\s*linked/g) || []).length;
must(cru === 0, '① ⛔ nenhuma escrita crua de linkedEmails sobrou no cliente (achei ' + cru + ')');
const iniU = A.indexOf('window._profileUnlinkEmail = function');
assert.ok(iniU > 0, 'âncora: a remoção no perfil');
const desv = semComentario(A.slice(iniU, iniU + 2200));
must(/httpsCallable\('unlinkSecondaryEmail'\)/.test(desv), '① a remoção entra pela porta do servidor');
must(!/collection\('users'\)\.doc\(cu\.uid\)\.update/.test(desv),
  '① ⛔ e não sobrou o update direto no documento do usuário');
const posOk = desv.indexOf('if (!out.ok)');
const posMem = desv.indexOf('cu.linkedEmails = _l;');
must(posOk > 0 && posMem > posOk,
  '① a cópia em memória só muda DEPOIS de o servidor confirmar — senão a tela mentiria');

// ── ② a porta do servidor só TIRA, e só do próprio dono ─────────────────────
const iniP = F.indexOf('exports.unlinkSecondaryEmail = onCall(');
assert.ok(iniP > 0, 'âncora: a porta de desvincular');
const porta = semComentario(F.slice(iniP, F.indexOf('exports.confirmSecondaryEmail', iniP)));
must(/const uid = request\.auth && request\.auth\.uid;/.test(porta) && /unauthenticated/.test(porta),
  '② exige estar logado');
must(/db\.collection\("users"\)\.doc\(uid\)/.test(porta),
  '② ⛔ escreve SEMPRE no documento de QUEM CHAMOU — nunca num uid vindo do payload');
must(!/request\.data.*linkedEmails|linkedEmails.*request\.data/.test(porta),
  '② ⛔ e NÃO aceita lista do cliente — era o array do cliente que era o problema');
must(/const restam = linked\.filter\(/.test(porta) && /!== alvo/.test(porta),
  '② só TIRA: reescreve a lista existente sem o alvo, nunca acrescenta');
must(/return \{ ok: false, motivo: "nao-vinculado" \};/.test(porta),
  '② remover o que não está vinculado é recusa explícita, não silêncio');
must(/runTransaction/.test(porta),
  '② em transação: sem corrida com a confirmação de um outro vínculo chegando junto');
must(/_secEmail\.normalizaEmail/.test(porta),
  '② compara pela MESMA normalização do lado que adiciona — senão maiúscula escaparia');

// ── ③ o que esta leva NÃO fez, dito por escrito ─────────────────────────────
const R = fs.readFileSync(path.join(raiz, 'firestore.rules'), 'utf8');
const priv = /function privilegedUserFields\(\)[\s\S]{0,2200}?\]/.exec(R);
assert.ok(priv, 'âncora: a lista de campos privilegiados');
must(!/'linkedEmails'/.test(priv[0]),
  '③ a Rule AINDA permite o campo — fechar antes de a versão nova circular quebraria quem está em build velha');
must(/⏳ Fechar a Rule/.test(F.slice(Math.max(0, iniP - 1600), iniP)),
  '③ e o passo seguinte está registrado no código, não só na cabeça de alguém');

console.log('\n✅ desvincular e-mail é do servidor — ' + ok + ' verificações');
