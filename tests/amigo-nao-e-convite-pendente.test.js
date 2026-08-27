/* A INVARIANTE DA AMIZADE, NOS TRÊS PONTOS QUE A PERDIAM (leva 2.1.24)
 *
 * A regra cabe numa frase, e é do dono: _"amigos nao podem estar como convites pendetes.
 * aceitou, virou amigo, nao tem convite pendente."_
 *
 * ⚠️ ELA FALTAVA EM TRÊS LUGARES, todos unindo os arrays de forma independente e nenhum
 * comparando um com o outro:
 *   1. js/views/auth.js — o merge do doc legado (chave e-mail → chave uid): três
 *      `arrayUnion` seguidos, um por campo;
 *   2. functions/index.js — a fusão de contas monta surv.friends / surv.friendRequestsSent /
 *      surv.friendRequestsReceived com uniões separadas;
 *   3. functions/index.js — ao repontar TERCEIROS, percorre os três campos trocando o uid
 *      velho pelo novo em cada um ISOLADO. Quem tinha o uid velho em `friends` e o novo em
 *      `sent` termina com o mesmo uid nos dois.
 *
 * ⭐ MEDIDO na base antes do conserto (27/ago/2026): 12 usuários com alguém que JÁ ERA
 * AMIGO ainda listado como convite — 11 pares. O dono via os próprios amigos na lista de
 * "convites pendentes". A limpeza resolveu o passado; isto impede o futuro de repor.
 *
 * ⛔ E A REGRA É UM MÓDULO SÓ (js/views/amizade-core.js, vendorizado pra functions/): três
 * lugares que precisam da mesma regra são três lugares que vão divergir. Foi exatamente
 * assim que esta sessão começou — o gate do "Propor datas" reimplementado.
 */
const fs = require('fs');
const path = require('path');
const A = require('../js/views/amizade-core.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
console.log('──── amigo não é convite pendente ────');

// ── a regra ─────────────────────────────────────────────────────────────────
const r = A.reconciliarAmizade({
  friends: ['ana', 'bru'], friendRequestsSent: ['bru', 'carla'], friendRequestsReceived: ['ana', 'davi'],
});
ok(r.friendRequestsSent.join() === 'carla', 'quem já é amigo sai dos ENVIADOS');
ok(r.friendRequestsReceived.join() === 'davi', 'e dos RECEBIDOS');
ok(r.friends.join() === 'ana,bru', '⛔ e `friends` NUNCA é tocado — a amizade é o estado forte');

// não inventa nem reordena
const r2 = A.reconciliarAmizade({ friends: [], friendRequestsSent: ['x', 'y'], friendRequestsReceived: [] });
ok(r2.friendRequestsSent.join() === 'x,y', 'sem amigos, nada é removido (não é uma limpeza cega)');
ok(A.reconciliarAmizade({}).friends.length === 0, 'doc vazio não quebra');
ok(A.reconciliarAmizade({ friends: ['a', null, '', 'b'] }).friends.join() === 'a,b',
   'entradas vazias/nulas são descartadas (dado real tem buraco)');

// ── a fusão: unir E reconciliar juntos ──────────────────────────────────────
// Este é O caso do bug: um lado tem a amizade, o outro tem o convite.
const f = A.fundirAmizade(
  { friends: ['ana'], friendRequestsSent: [] },
  { friends: [], friendRequestsSent: ['ana'], friendRequestsReceived: ['ana'] });
ok(f.friends.join() === 'ana', 'fusão preserva a amizade');
ok(f.friendRequestsSent.length === 0 && f.friendRequestsReceived.length === 0,
   '⛔ e o convite que veio do OUTRO lado não sobrevive à fusão (era exatamente o bug)');
ok(A.unirUids(['a', 'b'], ['b', 'c']).join() === 'a,b,c', 'a união não duplica');

// ── quem sai (pro caminho de arrayRemove) ───────────────────────────────────
const tirar = A.conviteDeQuemJaEAmigo({
  friends: ['ana', 'bru'], friendRequestsSent: ['bru'], friendRequestsReceived: ['ana', 'zé'] });
ok(tirar.sort().join() === 'ana,bru', 'lista exatamente quem deve sair dos convites');
ok(A.conviteDeQuemJaEAmigo({ friends: ['a'], friendRequestsSent: ['b'] }).length === 0,
   'e não devolve ninguém quando está tudo certo (nada de escrita à toa)');

// ── ⛔ OS TRÊS PONTOS USAM O MÓDULO ─────────────────────────────────────────
const ROOT = path.join(__dirname, '..');
const auth = fs.readFileSync(path.join(ROOT, 'js', 'views', 'auth.js'), 'utf8');
ok(/_amizadeCore/.test(auth) && /conviteDeQuemJaEAmigo/.test(auth),
   '(1) o merge do doc legado aplica a invariante');
ok(/if \(updates\.friends\) \{[\s\S]{0,240}arrayRemove\(uid\)/.test(auth),
   '(1b) e o TERCEIRO que ganha o uid em `friends` perde o uid dos convites');
const idx = fs.readFileSync(path.join(ROOT, 'functions', 'index.js'), 'utf8');
ok(/require\("\.\/vendor\/amizade-core\.js"\)/.test(idx), 'o servidor importa o MESMO módulo');
ok(/_amizade\.reconciliarAmizade\(\{[\s\S]{0,400}unionArr\(newData\.friends/.test(idx),
   '(2) a fusão de contas reconcilia depois de unir');
ok((idx.match(/_amizade\.reconciliarAmizade\(/g) || []).length >= 2,
   '(3) e o repontar de terceiros também — os dois pontos do servidor');

// ── o módulo é PURO (viaja pro Node sem DOM) ────────────────────────────────
const src = fs.readFileSync(path.join(ROOT, 'js', 'views', 'amizade-core.js'), 'utf8');
ok(!/document\.|localStorage|firebase|Date\.now/.test(src),
   '⛔ puro: sem DOM, sem Firestore, sem relógio — é o que permite a MESMA regra nos dois lados');
ok(fs.existsSync(path.join(ROOT, 'functions', 'vendor', 'amizade-core.js')),
   'e a cópia do servidor existe (copy-vendor)');
ok(fs.readFileSync(path.join(ROOT, 'functions', 'vendor', 'amizade-core.js'), 'utf8') === src,
   '⛔ e é IDÊNTICA à fonte — vendor que diverge é a quarta cópia da regra');

console.log(pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);
