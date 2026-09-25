'use strict';

/* ⛔⛔ OMITIR NÃO APAGA: `merge:true` PRESERVA O CAMPO AUSENTE.
 *
 * Este é o erro que quase passou. Eu tirei os três campos de e-mail de todos os escritores com
 * `delete` e ANUNCIEI que eles saíam do documento. `delete` só faz parar de REESCREVER: nos 78
 * torneios já gravados o endereço continuava lá, público, intacto. A prova estava no próprio
 * arquivo que eu editei, escrita por mim meses antes — _"merge:true PRESERVA no banco o campo
 * que não vem: omitir aqui não apaga nada"_.
 *
 * ⇒ A remoção exige SENTINELA. E como toda gravação passa pelas duas portas abaixo, cada edição,
 * sorteio ou placar limpa o torneio que tocou: a limpeza acontece pelo uso.
 *
 * ⛔ Esta suíte existe para que "parei de gravar" nunca mais seja confundido com "apaguei".
 */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const semComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const CAMPOS = ['organizerEmail', 'creatorEmail', 'adminEmails'];

// ── 1. cliente: a porta única, e ela usa sentinela ───────────────────────────
const db = fs.readFileSync(path.join(root, 'js/firebase-db.js'), 'utf8');
const ini = db.indexOf('_apagarEmailDoDocPublico(alvo) {');
assert.ok(ini > 0, 'existe a porta única da remoção no cliente');
const porta = semComentarios(db.slice(ini, db.indexOf('\n  },', ini)));

assert.match(porta, /firebase\.firestore\.FieldValue/, '⛔ a porta usa SENTINELA de remoção, não `delete` de objeto');
assert.match(porta, /typeof _fv\.delete === 'function'/,
  '⛔ e a guarda vai até o FIM da corrente: um harness tem `firestore` sem `FieldValue`, e parar no meio derrubava a gravação');
CAMPOS.forEach((c) => assert.match(porta, new RegExp("'" + c + "'"), 'a porta cobre ' + c));
assert.match(porta, /else delete alvo\[campo\]/,
  'e sem `firebase` carregado cai no delete — o harness não quebra por causa da sentinela');

// os dois caminhos de gravação do cliente chamam a porta
const dbSemCom = semComentarios(db);
assert.equal((dbSemCom.match(/_apagarEmailDoDocPublico\(/g) || []).length, 3,
  'a porta é definida UMA vez e chamada pelos DOIS caminhos de gravação (save + transação)');
assert.match(dbSemCom, /set\(cleanData, \{ merge: true \}\)/,
  '⛔ e a gravação segue com merge — é justamente por isso que a sentinela é obrigatória');

/* ── 2. servidor: a fronteira do autodraw OMITE, e omitir é o CERTO lá ────────
 * ⛔⛔ AS DUAS PORTAS TÊM REGRAS OPOSTAS, E A RAZÃO É A FORMA DA ESCRITA.
 * O cliente grava COM mesclagem: o campo ausente é preservado ⇒ precisa de sentinela.
 * O servidor grava o documento INTEIRO com `set` sem mesclagem: o ausente desaparece ⇒ omitir
 * apaga, e sentinela é RECUSADA pelo Firestore fora de `update`/`set({merge:true})`.
 * As duas maneiras já falharam uma vez cada, trocadas de lado. Esta suíte prende cada uma na
 * sua porta para que ninguém "unifique" e quebre a outra. */
const auto = semComentarios(fs.readFileSync(path.join(root, 'functions-autodraw/index.js'), 'utf8'));
const bi = auto.indexOf('function _applyWriteBoundary(');
assert.ok(bi > 0, 'achou a fronteira de escrita do autodraw');
const fronteira = auto.slice(bi, auto.indexOf('\n}', bi));
CAMPOS.forEach((c) => assert.match(fronteira, new RegExp("'" + c + "'"), 'a fronteira cobre ' + c));
assert.match(fronteira, /delete data\[campo\]/,
  '⛔ a fronteira do servidor OMITE (o `set` é inteiro) — sentinela ali é recusada pelo Firestore');
assert.doesNotMatch(fronteira, /FieldValue\.delete\(\)/,
  '⛔ e NÃO usa sentinela: foi assim que a criação de torneio explodiu na primeira tentativa');

// ── 3. nenhum dos dois volta a CALCULAR a lista de e-mails ───────────────────
assert.doesNotMatch(dbSemCom, /adminEmails\s*=\s*this\._computeAdminEmails/,
  'o cliente não recompõe a lista de e-mails');
assert.doesNotMatch(fronteira, /adminEmails = w\._computeAdminEmails/,
  'a fronteira do autodraw não recompõe a lista de e-mails');

// ── 4. o que NÃO pode sair junto: quem a regra lê ────────────────────────────
assert.match(fronteira, /data\.adminUids = w\._computeAdminUids\(data\)/,
  '⛔ `adminUids` FICA — é por ele que a regra autoriza a organização');
assert.match(dbSemCom, /adminUids\s*=\s*this\._computeAdminUids/, 'idem no cliente');

console.log('✅ omitir não apaga: sentinela no cliente (mescla), omissão no servidor (set inteiro) — 18 verificações');
