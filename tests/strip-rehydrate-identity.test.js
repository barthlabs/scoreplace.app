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

// v1.2.2: o contrato do strip é "tem PERFIL → o nome vem de lá, não grava". Antes era "tem
// uid → não grava", que é a MESMA coisa só enquanto users/{uid} existe. Quando a pessoa
// recria a conta, o users/ do uid velho some e a entrada stripada fica sem âncora nenhuma —
// o resolvedor caía no uid cru e o sorteio gravava o uid como nome. Então "tem conta" agora
// se prova com o perfil vivo, e estes perfis precisam existir ANTES dos casos abaixo (eles
// são as pessoas COM conta). Sem isto, os casos 1 exercitariam o caminho de ÓRFÃO.
['uA', 'u1', 'u2', 'us1'].forEach(function (u, i) {
  var n = ['Ana', 'Ana', 'Bia', 'Sub1'][i];
  W._profileNameByUid[u] = n; W._userProfileCache[u] = { displayName: n };
});

// solo COM conta → PERFIL sai (nome/email/gênero...), uid + campos do TORNEIO ficam.
// v1.3.52 (dono: "grava SÓ o uid; nome, email, celular, tudo vem do perfil pelo uid"):
// o strip remove TODO campo de perfil das entradas com uid — resolvidos por uid no display
// (cliente) e no sorteio/notificação (CF _enrichParticipantsFromProfiles).
var soloAcc = { uid: 'uA', name: 'Ana', displayName: 'Ana', email: 'a@x.com', gender: 'feminino',
                phone: '+5511999', birthDate: '1990-01-01', skillBySport: { tenis: 'B' }, defaultCategory: 'B', photoURL: 'http://x',
                enrollSeq: 5, category: 'Fem B', categories: ['Fem B'], categorySource: 'inscricao', ligaActive: true, selfEnrolled: true };
var sA = W._stripStoredNamesForUidEntries([soloAcc])[0];
ok(sA.uid === 'uA', 'solo conta: uid preservado');
ok(!has(sA, 'name') && !has(sA, 'displayName'), 'solo conta: name/displayName REMOVIDOS');
ok(!has(sA, 'email') && !has(sA, 'gender') && !has(sA, 'phone') && !has(sA, 'birthDate') && !has(sA, 'skillBySport') && !has(sA, 'defaultCategory') && !has(sA, 'photoURL'),
   'solo conta: PERFIL (email/gênero/celular/idade/skill/foto) REMOVIDO — resolve por uid (v1.3.52)');
ok(sA.enrollSeq === 5 && sA.category === 'Fem B' && Array.isArray(sA.categories) && sA.categorySource === 'inscricao' && sA.ligaActive === true && sA.selfEnrolled === true,
   'solo conta: campos do TORNEIO preservados (enrollSeq/category/categories/categorySource/ligaActive/selfEnrolled)');
ok(has(soloAcc, 'displayName') && has(soloAcc, 'email'), 'NÃO muta o objeto de entrada (cópia)');

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

// ═══ 1b. ÓRFÃO: uid sem users/ (a pessoa recriou a conta) ════════════════════════
// Bug real (Ranking/staging, jul/2026): o strip apagava o nome, o users/ do uid velho não
// existia mais, e o resolvedor devolvia o UID CRU — que o sorteio gravava como nome em m.p1.
// Sem perfil, o nome gravado é a ÚNICA identidade que resta: preservar, igual ao guest.
var orfao = { uid: 'uMORTO', name: 'Cátia Cavedon', displayName: 'Cátia Cavedon' };
var sO = W._stripStoredNamesForUidEntries([orfao])[0];
ok(sO.displayName === 'Cátia Cavedon' && sO.name === 'Cátia Cavedon',
  'ÓRFÃO solo: nome PRESERVADO (uid sem perfil não tem de onde repor)');
ok(sO.uid === 'uMORTO', 'ÓRFÃO solo: uid preservado (identidade continua sendo o uid)');

// dupla com um membro órfão → só o membro COM perfil perde o nome
var duplaOrfa = { p1Uid: 'u1', p1Name: 'Ana', p2Uid: 'uMORTO', p2Name: 'Cátia Cavedon' };
var sDO = W._stripStoredNamesForUidEntries([duplaOrfa])[0];
ok(!has(sDO, 'p1Name'), 'dupla c/ órfão: membro COM perfil perde p1Name');
ok(sDO.p2Name === 'Cátia Cavedon', 'dupla c/ órfão: membro órfão MANTÉM p2Name');

// E o resolvedor nunca pode devolver o uid cru.
ok(W._displayNameForUid('uMORTO', 'Cátia Cavedon') === 'Cátia Cavedon',
  'resolvedor: órfão COM nome gravado → nome (nunca o uid)');
ok(W._displayNameForUid('uMORTO', 'c@x.com') === 'c@x.com',
  'resolvedor: órfão só com e-mail → e-mail (nunca o uid)');
var semNada = W._displayNameForUid('uMORTO', '');
ok(semNada.indexOf('uMORTO') === -1 && /^Jogador sem perfil/.test(semNada),
  'resolvedor: órfão sem nome/e-mail → rótulo neutro, NUNCA o uid (got ' + JSON.stringify(semNada) + ')');
ok(W._displayNameForUid('uA', '') === 'Ana', 'resolvedor: uid COM perfil → nome vivo (não regrediu)');

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
