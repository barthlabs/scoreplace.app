/* ITEM 3 · Fase 4 (v4.5.85) — SANITIZA na persistência + REHIDRATA no sorteio.
 *
 * Arquitetura: a identidade do inscrito é o uid; o nome vem do perfil VIVO. Logo:
 *  - SAVE: não grava name/displayName/p1Name/p2Name de quem tem uid (guest mantém).
 *  - DRAW: rehidrata o nome (por uid) nas entradas EM MEMÓRIA antes do motor ler,
 *    senão o pool por NOME (_getActiveLigaPlayers) descarta a entrada só-uid e a
 *    Liga gera 0 rodadas — a REGRESSÃO que este teste reproduz.
 *
 * Dirige as funções REAIS via render-harness (store.js + tournaments-draw + bracket-logic).
 * node tests/strip-rehydrate-identity.test.js
 */
const H = require('./render-harness');
const W = H.window;

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }
function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

// ═══ 1. SANITIZADOR (_stripStoredNamesForUidEntries) ═════════════════════════════
ok(typeof W._stripStoredNamesForUidEntries === 'function', '_stripStoredNamesForUidEntries existe');

// solo COM conta → nome sai, uid fica
var soloAcc = { uid: 'uA', name: 'Ana', displayName: 'Ana', email: 'a@x.com' };
var sA = W._stripStoredNamesForUidEntries([soloAcc])[0];
ok(sA.uid === 'uA', 'solo conta: uid preservado');
ok(!has(sA, 'name') && !has(sA, 'displayName'), 'solo conta: name/displayName REMOVIDOS');
ok(sA.email === 'a@x.com', 'solo conta: outros campos intactos');
ok(has(soloAcc, 'displayName'), 'NÃO muta o objeto de entrada (cópia)');

// solo SEM conta (guest) → nome MANTIDO
var guest = { name: 'Zé Visitante', displayName: 'Zé Visitante' };
var sG = W._stripStoredNamesForUidEntries([guest])[0];
ok(sG.name === 'Zé Visitante' && sG.displayName === 'Zé Visitante', 'guest solo: nome MANTIDO (única identidade)');

// dupla ambos com conta → tudo de nome sai, uids ficam
var duplaAcc = { p1Uid: 'u1', p1Name: 'Ana', p2Uid: 'u2', p2Name: 'Bia', name: 'Ana / Bia', displayName: 'Ana / Bia' };
var sD = W._stripStoredNamesForUidEntries([duplaAcc])[0];
ok(sD.p1Uid === 'u1' && sD.p2Uid === 'u2', 'dupla conta: uids preservados');
ok(!has(sD, 'p1Name') && !has(sD, 'p2Name'), 'dupla conta: p1Name/p2Name REMOVIDOS');
ok(!has(sD, 'name') && !has(sD, 'displayName'), 'dupla conta: teamString name/displayName REMOVIDOS');

// dupla 1 conta + 1 guest → só o slot com conta perde o nome; guest mantém
var duplaMix = { p1Uid: 'u1', p1Name: 'Ana', p2Name: 'Convidado', name: 'Ana / Convidado', displayName: 'Ana / Convidado' };
var sM = W._stripStoredNamesForUidEntries([duplaMix])[0];
ok(!has(sM, 'p1Name'), 'dupla mista: slot com conta perde p1Name');
ok(sM.p2Name === 'Convidado', 'dupla mista: slot GUEST mantém p2Name');
ok(!has(sM, 'name') && !has(sM, 'displayName'), 'dupla mista: teamString removido (display reconstrói)');

// sub-participants[] → cada um com uid perde o nome; guest sub mantém
var subEntry = { participants: [{ uid: 'us1', displayName: 'Sub1' }, { displayName: 'GuestSub' }] };
var sS = W._stripStoredNamesForUidEntries([subEntry])[0];
ok(!has(sS.participants[0], 'displayName'), 'sub com conta: displayName removido');
ok(sS.participants[1].displayName === 'GuestSub', 'sub guest: displayName mantido');

// ═══ 2. REHIDRATA no SORTEIO — Liga só-uid: 0 rodadas SEM, rodada COM ════════════
// perfis vivos (o que users/{uid} traria pro cache)
['u1', 'u2', 'u3', 'u4'].forEach(function (u, i) {
  var n = ['Ana', 'Bia', 'Cid', 'Duda'][i];
  W._profileNameByUid[u] = n; W._userProfileCache[u] = { displayName: n };
});
function mkLiga() {
  return {
    id: 'LGA', format: 'Liga', status: 'open', rounds: [], categories: ['C'],
    participants: [{ uid: 'u1', categories: ['C'] }, { uid: 'u2', categories: ['C'] },
                   { uid: 'u3', categories: ['C'] }, { uid: 'u4', categories: ['C'] }]
  };
}

// ANTIGO (rehydrate desligado): entrada só-uid é descartada pelo pool por nome → 0 rodadas
var _saved = W._rehydrateEntryNames;
W._rehydrateEntryNames = undefined;
var tOld = mkLiga(); W.AppStore.tournaments = [tOld];
try { W._generateNextRound(tOld); } catch (e) {}
ok((tOld.rounds || []).length === 0, 'ANTIGO (sem rehydrate): Liga só-uid gera 0 rodadas (a REGRESSÃO)');
W._rehydrateEntryNames = _saved;

// NOVO (rehydrate ligado): gera rodada com NOME VIVO nos slots
var tNew = mkLiga(); W.AppStore.tournaments = [tNew];
W._generateNextRound(tNew);
ok((tNew.rounds || []).length === 1, 'NOVO: Liga só-uid gera a rodada');
var slotStr = ((tNew.rounds[0] || {}).matches || []).map(function (m) { return (m.p1 || '') + ' ' + (m.p2 || ''); }).join(' ');
ok(/Ana|Bia|Cid|Duda/.test(slotStr), 'NOVO: slots trazem o nome VIVO (' + slotStr.trim() + ')');
ok(!/\bu[1-4]\b/.test(slotStr), 'NOVO: uid cru NUNCA vira slot');

if (fail) { console.error('\n❌ strip-rehydrate-identity: ' + fail + ' falharam, ' + pass + ' ok'); process.exit(1); }
console.log('✅ strip-rehydrate-identity: ' + pass + ' ok, 0 falharam');
