/* Roster de AUTORIZAÇÃO por uid do slot — AppStore._matchPlayerUids (js/store.js).
 * O playerUids do subdoc de resultado (tournaments/{t}/results/{m}.playerUids) é o
 * que as Firestore rules usam pra liberar quem lança o placar do jogo (mata-mata
 * dirigido por participante). Resolver por NOME libera a pessoa ERRADA em homônimo
 * e BLOQUEIA quando o nome diverge (reconcile de nome removido em v4.5.73). O slot
 * carrega o uid canônico (team*Uids/p*Uid/team*Obj) via _setSlot — ler dele resolve.
 * uid-FIRST, NOME fallback só quando o slot não tem uid (guest/informal/legado).
 *
 * ESPELHO do servidor: functions/test-match-roster.js (mesma matemática, ADMIN).
 * Rodar via render-harness (carrega store.js real). Ver project_match_slot_uid_identity.
 */
const W = require('./render-harness').window;
const AppStore = W.AppStore;

let pass = 0, fail = 0;
function ok(c, msg) { if (c) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.error('  ✗ ' + msg); } }
function key(a) { return (Array.isArray(a) ? a.slice() : []).sort().join('|'); }
function eqArr(a, b, msg) { ok(key(a) === key(b), msg + ' (got ' + JSON.stringify(a) + ')'); }

// sanidade: o harness carregou o método real e o helper de slot.
ok(typeof AppStore._matchPlayerUids === 'function', 'AppStore._matchPlayerUids existe (store.js carregou)');
ok(typeof W._slotUids === 'function', 'window._slotUids existe (bracket-logic.js carregou)');

// Reproduz a LÓGICA VELHA (só por nome) pra provar que ela erra o homônimo.
function oldByName(t, m) {
  const ps = Array.isArray(t.participants) ? t.participants : Object.values(t.participants || {});
  const seen = {};
  ['p1', 'p2'].forEach(function (side) {
    const entry = m[side];
    if (!entry || entry === 'TBD' || entry === 'BYE') return;
    const p = ps.find(function (pp) { return typeof pp === 'object' && (pp.displayName || pp.name || '') === entry; });
    if (p && p.uid) seen[p.uid] = 1;
  });
  return Object.keys(seen);
}

// HOMÔNIMO: dois uids com o MESMO displayName "João". O slot aponta pro 2º (uJ2).
const homParts = [
  { uid: 'uJ1', displayName: 'João' },
  { uid: 'uJ2', displayName: 'João' },
  { uid: 'uZ', displayName: 'Zé' },
];
const tHom = { participants: homParts, matches: [{ id: 'h1', p1: 'João', p2: 'Zé', p1Uid: 'uJ2', p2Uid: 'uZ' }] };
console.log('──── homônimo (nome igual, uids distintos) ────');
eqArr(oldByName(tHom, tHom.matches[0]), ['uJ1', 'uZ'], 'VELHO (por nome) casa o homônimo ERRADO (uJ1)');
ok(key(oldByName(tHom, tHom.matches[0])) !== key(['uJ2', 'uZ']), 'VELHO NÃO bate o uid certo do slot — a falha');
eqArr(AppStore._matchPlayerUids(tHom, tHom.matches[0]), ['uJ2', 'uZ'], 'NOVO (uid do slot) casa o homônimo CERTO (uJ2)');

// NOME DIVERGENTE: cache de display velho não existe mais nos participantes; o slot
// ainda carrega o uid → velho BLOQUEIA o lado, novo resolve pelo uid.
console.log('──── nome divergente do cache ────');
const tDiv = { participants: homParts, matches: [{ id: 'd1', p1: 'João Antigo', p2: 'Zé', p1Uid: 'uJ2', p2Uid: 'uZ' }] };
eqArr(oldByName(tDiv, tDiv.matches[0]), ['uZ'], 'VELHO perde o lado divergente (bloquearia)');
eqArr(AppStore._matchPlayerUids(tDiv, tDiv.matches[0]), ['uJ2', 'uZ'], 'NOVO resolve o lado divergente pelo uid do slot');

// DUPLA por team*Uids.
console.log('──── dupla / team*Uids / team*Obj ────');
const tTeam = { participants: homParts, matches: [{ id: 't1', p1: 'João / Zé', p2: 'BYE', team1Uids: ['uJ2', 'uZ'] }] };
eqArr(AppStore._matchPlayerUids(tTeam, tTeam.matches[0]), ['uJ2', 'uZ'], 'dupla por team1Uids → [uJ2,uZ] (p2 BYE ignorado)');

// team*Obj (objeto participante embutido no slot).
const tObj = { participants: homParts, matches: [{ id: 'o1', p1: 'Dupla', p2: 'Zé', team1Obj: { p1Uid: 'uJ1', p2Uid: 'uJ2' }, p2Uid: 'uZ' }] };
eqArr(AppStore._matchPlayerUids(tObj, tObj.matches[0]), ['uJ1', 'uJ2', 'uZ'], 'team1Obj resolve p1Uid+p2Uid + p2 por uid');

// LEGADO/GUEST: slot SEM uid → fallback por nome mantém a autorização de jogos antigos.
console.log('──── legado / guest (fallback por nome) ────');
const soloParts = [{ uid: 'uA', displayName: 'A' }, { uid: 'uB', displayName: 'B' }];
const tLegacy = { participants: soloParts, matches: [{ id: 'leg1', p1: 'A', p2: 'B' }] };
eqArr(AppStore._matchPlayerUids(tLegacy, tLegacy.matches[0]), ['uA', 'uB'], 'slot sem uid (legado) → fallback por nome [uA,uB]');

// dupla legada "A / B" via split de solos (sem team*Uids no slot).
const tSplit = { participants: soloParts, matches: [{ id: 'sp1', p1: 'A / B', p2: 'TBD' }] };
eqArr(AppStore._matchPlayerUids(tSplit, tSplit.matches[0]), ['uA', 'uB'], 'dupla legada "A / B" via split de solos → [uA,uB]');

// GUEST sem conta: nome não casa participante → só o lado com conta.
const tGuest = { participants: soloParts, matches: [{ id: 'g1', p1: 'Convidado Sem Conta', p2: 'A' }] };
eqArr(AppStore._matchPlayerUids(tGuest, tGuest.matches[0]), ['uA'], 'guest sem conta (sem uid, sem match) → só [uA]');

// TBD/BYE → vazio.
eqArr(AppStore._matchPlayerUids(tLegacy, { p1: 'TBD', p2: 'BYE' }), [], 'TBD/BYE → []');

console.log('════════════════════════════════════════');
console.log((fail === 0 ? '✅' : '❌') + ' match-roster-uid: ' + pass + ' ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
