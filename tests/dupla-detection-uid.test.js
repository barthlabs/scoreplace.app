/* Detecção de DUPLA por uid (Parte 14 · FASE 1) — carrega store.js REAL e dirige
 * o filtro canônico window._getCompetitors.
 *
 * A CAMPANHA ITEM 3 vai parar de GRAVAR p1Name/p2Name pra quem tem uid (Fase 4).
 * A partir daí existirá a forma "dupla só-uid": { p1Uid, p2Uid } sem p1Name/p2Name.
 * A detecção antiga por NOME (`p.p1Name && p.p2Name`) leria essa dupla como SOLO.
 *
 * Falha concreta que isso reproduz: uma dupla cujo MEMBRO é o organizador (o e-mail
 * da entrada bate com organizerEmail). Com a detecção por nome, isTeam=false → o
 * filtro exclui a entrada por "organizador que não se auto-inscreveu" → o time
 * inteiro SOME ("2 inscritos / 1 time" quando são 4 inscritos / 2 times, exatamente
 * o bug que o comentário em _getCompetitors alerta). Com a detecção uid-first
 * (`(p.p1Uid||p.p1Name) && (p.p2Uid||p.p2Name)`) a dupla é reconhecida e mantida.
 *
 * FALHA no antigo (detecção por nome exclui a dupla-só-uid); PASSA no novo.
 * node tests/dupla-detection-uid.test.js
 */
// render-harness carrega store.js REAL por completo (inclui _getCompetitors, que
// mora bem depois no arquivo — o sandbox cru pararia antes por falta de DOM/timers).
const W = require('./render-harness').window;

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }
function eq(a, b, m) { ok(a === b, m + ' (esperado ' + JSON.stringify(b) + ', veio ' + JSON.stringify(a) + ')'); }

ok(typeof W._getCompetitors === 'function', '_getCompetitors existe (store.js carregou)');
ok(typeof W._entryTeamMembers === 'function', '_entryTeamMembers existe');

// ── Réplica da detecção ANTIGA (por nome) pra provar que ela ERRAVA ────────────
function oldIsPair(p) { return !!(p && typeof p === 'object' && p.p1Name && p.p2Name); }
function newIsPair(p) { return !!(p && typeof p === 'object' && (p.p1Uid || p.p1Name) && (p.p2Uid || p.p2Name)); }

// Dupla "só-uid" cujo MEMBRO 2 é o organizador (email da entrada = organizerEmail).
// displayName traz só o nome do p1 (como o slot de dupla costuma vir).
var duplaOrgUidOnly = { p1Uid: 'uKelly', p2Uid: 'uOrg', email: 'org@x.com', displayName: 'Kelly' };
ok(oldIsPair(duplaOrgUidOnly) === false, 'ANTIGO (por nome) NÃO detecta a dupla só-uid (a raiz da falha)');
ok(newIsPair(duplaOrgUidOnly) === true, 'NOVO (uid-first) detecta a dupla só-uid');

var t = {
  organizerEmail: 'org@x.com',
  organizerName: 'Org Pessoa',
  participants: [duplaOrgUidOnly]
};
var comp = W._getCompetitors(t);
eq(comp.length, 1, 'a dupla só-uid (membro=org) CONTINUA competidor — não some da lista');
ok(comp[0] === duplaOrgUidOnly, 'é exatamente a dupla mantida');

// v1.2.44 — ESTE ASSERT FOI INVERTIDO DE PROPÓSITO. Ele cobrava "org SOLO sem
// auto-inscrição segue excluído (esperado 0)", ou seja, exigia que o programa
// identificasse o organizador pelo E-MAIL da entrada e o tirasse da lista. Isso é o
// oposto do cânone (dono, jul/2026): identidade é uid — nunca nome/e-mail/telefone — e
// INSCRITO = está em participants[]; quem está lá aparece, organizador inclusive. Era
// essa regra que sumia com o organizador inscrito ("Duplas Mistas Sorteadas", staging:
// cabeçalho 14, lista 13). Manter o assert antigo era manter o bug travado por teste.
// Ver tests/uid-poison-inscritos.test.js / [[project_uid_identity_canon_locked]].
var t2 = {
  organizerEmail: 'org@x.com',
  participants: [{ uid: 'uOrg', email: 'org@x.com', displayName: 'Org Solo' }]
};
eq(W._getCompetitors(t2).length, 1, 'org SOLO que está em participants[] APARECE (inscrito é quem está no banco)');

// Sanidade: dupla clássica (nome + uid) continua mantida por AMBAS as detecções.
var duplaClassica = { p1Uid: 'uA', p1Name: 'Ana', p2Uid: 'uB', p2Name: 'Bia', displayName: 'Ana / Bia' };
ok(oldIsPair(duplaClassica) && newIsPair(duplaClassica), 'dupla clássica detectada por ambas (sem regressão)');
eq(W._getCompetitors({ organizerEmail: 'org@x.com', participants: [duplaClassica] }).length, 1, 'dupla clássica mantida');

// _entryTeamMembers (helper canônico) já é uid-first: a dupla só-uid retorna 2 membros.
var mem = W._entryTeamMembers(duplaOrgUidOnly);
ok(Array.isArray(mem) && mem.length === 2, '_entryTeamMembers vê a dupla só-uid como 2 pessoas');
eq(W._peopleInList([duplaOrgUidOnly]), 2, '_peopleInList conta a dupla só-uid como 2 pessoas');

console.log((fail === 0 ? '✓ PASS' : '✗ FAIL') + ' dupla-detection-uid: ' + pass + ' asserts, ' + fail + ' falhas');
process.exit(fail === 0 ? 0 : 1);
