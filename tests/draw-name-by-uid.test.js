/* Nome do MEMBRO resolvido pelo uid no SORTEIO (Parte 14 · FASE 2) — carrega o app
 * REAL via render-harness e dirige window._buildPhase0Pool (motor de sorteio).
 *
 * A CAMPANHA ITEM 3 vai parar de GRAVAR p1Name/p2Name pra quem tem uid (Fase 4).
 * Aí existirá a "dupla só-uid": { p1Uid, p2Uid } sem p1Name/p2Name. O motor de
 * sorteio (que decompõe a dupla em pessoas e monta a string do slot) precisa
 * resolver o nome de cada membro PELO UID (perfil ao vivo) — senão a string do
 * slot vira o uid cru (ou vazio), e o slot é a CHAVE de classificação/W.O./folga.
 *
 * FALHA no antigo (`p.p1Name || p.p1Uid` → grava o uid cru como nome);
 * PASSA no novo (`_displayNameForUid(uid, nome)` → nome vivo do perfil).
 * node tests/draw-name-by-uid.test.js
 */
const W = require('./render-harness').window;

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }
function eq(a, b, m) { ok(a === b, m + ' (esperado ' + JSON.stringify(b) + ', veio ' + JSON.stringify(a) + ')'); }

ok(typeof W._buildPhase0Pool === 'function', '_buildPhase0Pool existe (tournaments-draw carregou)');
ok(typeof W._displayNameForUid === 'function', '_displayNameForUid existe (store.js carregou)');

// Perfis vivos (o que estaria em users/{uid} → cache de nome por uid).
W._profileNameByUid['uAna'] = 'Ana Lima';
W._profileNameByUid['uBia'] = 'Bia Souza';

// Dupla "só-uid" (forma da Fase 4): tem os dois uids, NÃO tem p1Name/p2Name.
var duplaUidOnly = { p1Uid: 'uAna', p2Uid: 'uBia', p1Gender: 'F', p2Gender: 'F' };
var t = { participants: [duplaUidOnly] };

// isMon=true → o motor decompõe a dupla em 2 PESSOAS (Rei/Rainha), montando displayName.
var pool = W._buildPhase0Pool(t, true, 1);
eq(pool.length, 2, 'dupla só-uid decompõe em 2 pessoas (detecção uid-first)');
eq(pool[0].displayName, 'Ana Lima', 'membro 1: nome resolve pelo uid (não o uid cru)');
eq(pool[1].displayName, 'Bia Souza', 'membro 2: nome resolve pelo uid (não o uid cru)');
ok(pool[0].displayName !== 'uAna' && pool[1].displayName !== 'uBia', 'REGRESSÃO MORTA: uid cru nunca vira nome de slot quando há perfil');
eq(pool[0].uid, 'uAna', 'uid do membro 1 preservado');
eq(pool[1].uid, 'uBia', 'uid do membro 2 preservado');

// Réplica do ANTIGO (`p.p1Name || p.p1Uid`) pra provar que ELE erra na forma só-uid.
function oldName(p, side) { return p[side + 'Name'] || p[side + 'Uid'] || ''; }
eq(oldName(duplaUidOnly, 'p1'), 'uAna', 'ANTIGO gravava o uid cru como nome (a falha)');

// Sanidade: dupla clássica (nome + uid) segue decompondo nos nomes (sem regressão).
var duplaClassica = { p1Uid: 'uC', p1Name: 'Carlos', p2Uid: 'uD', p2Name: 'Duda', p1Gender: 'M', p2Gender: 'F' };
var pool2 = W._buildPhase0Pool({ participants: [duplaClassica] }, true, 1);
eq(pool2.length, 2, 'dupla clássica decompõe em 2 (sem regressão)');
// nome gravado sem perfil no cache → _displayNameForUid cai no nome gravado (fallback correto)
ok(pool2[0].displayName === 'Carlos' || pool2[0].displayName === W._profileNameByUid['uC'], 'membro clássico usa nome gravado/vivo, nunca o uid');
ok(pool2[0].displayName !== 'uC', 'dupla clássica: uid nunca vira nome');

console.log((fail === 0 ? '✓ PASS' : '✗ FAIL') + ' draw-name-by-uid: ' + pass + ' asserts, ' + fail + ' falhas');
process.exit(fail === 0 ? 0 : 1);
