/* Autopresença do participante a partir da presença de LOCAL (dono, jul/2026).
 * Se o inscrito JÁ confirmou check-in NO LOCAL do torneio (presença de local, não um plano
 * futuro) e agora está na janela [início−2h, fim], vira PRESENTE (verde) sozinho. Sem GPS
 * silencioso — lê a presença já confirmada (loadMyActive). Self-only; respeita o "ausente"
 * do organizador; só sobe pra verde, nunca remove.
 *
 * Reproduz a falha: no código VELHO não havia _autoPresenceFromVenue → o participante que
 * chegou ao local NUNCA ficava verde sozinho. NOVO: marca verde na janela + local certos.
 */
const { sandbox: W } = require('./render-harness');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
console.log('──── auto-presence-venue ────');

W.showNotification = function () {};
W._softRefreshView = function () {};
W._isUserEnrolledInTournament = function () { return true; };
// mutate local determinístico (sem Firestore): acha o torneio e aplica o mutator.
W.AppStore.mutate = function (id, fn) { var t = W._findTournamentById(id); if (t) fn(t); };

const HOUR = 3600 * 1000;
function mkT(startOffsetMs) {
  var now = Date.now();
  return {
    id: 'T' + Math.floor(now + Math.random() * 1e6), teamSize: 1,
    startDate: new Date(now + (startOffsetMs || 0)).toISOString(),
    endDate: new Date(now + (startOffsetMs || 0) + 3 * HOUR).toISOString(),
    venuePlaceId: 'PID1', venueLat: -23.5, venueLon: -46.6,
    participants: [{ uid: 'uA', displayName: 'Ana', name: 'Ana' }],
    memberUids: ['uA'], checkedIn: {}, absent: {}, checkedInConfirmed: {}
  };
}
function setUser() { W.AppStore.currentUser = { uid: 'uA', displayName: 'Ana' }; }
function checkinAt(pid, lat, lon) {
  return [{ type: 'checkin', placeId: pid, venueLat: lat, venueLon: lon, startsAt: Date.now() - HOUR, endsAt: Date.now() + 4 * HOUR }];
}
function run(t, presences) {
  W._autoPresChk = {};              // zera throttle entre casos
  W.PresenceDB = { loadMyActive: function () { return Promise.resolve(presences); } };
  W.AppStore.tournaments = [t];
  setUser();
  W._autoPresenceFromVenue(t);
  return delay(5);                  // deixa o .then da Promise rodar
}
const green = (t) => W._idMapHas(t, t.checkedIn || {}, { uid: 'uA', displayName: 'Ana' });
const blue = (t) => W._idMapHas(t, t.checkedInConfirmed || {}, { uid: 'uA', displayName: 'Ana' });

(async function () {
  ok(typeof W._autoPresenceFromVenue === 'function', '_autoPresenceFromVenue existe (falha no código velho)');

  // (A) na janela + check-in no MESMO placeId → vira VERDE, limpa AZUL.
  var tA = mkT(1 * HOUR);                     // começa em 1h → agora está em [início−2h, fim]
  W._idMapSet(tA, tA.checkedInConfirmed, { uid: 'uA', displayName: 'Ana' }, 1);  // estava azul
  await run(tA, checkinAt('PID1', -23.5, -46.6));
  ok(green(tA), 'A: check-in no local + na janela → PRESENTE (verde)');
  ok(!blue(tA), 'A: verde limpa o azul (confirmado)');

  // (B) FORA da janela (torneio já terminou) → NÃO marca.
  var tB = mkT(-6 * HOUR);                    // começou há 6h, terminou há 3h
  await run(tB, checkinAt('PID1', -23.5, -46.6));
  ok(!green(tB), 'B: fora da janela (torneio encerrado) → não marca verde');

  // (C) organizador marcou AUSENTE → respeita, não sobrepõe.
  var tC = mkT(1 * HOUR);
  W._idMapSet(tC, tC.absent, { uid: 'uA', displayName: 'Ana' }, 1);
  await run(tC, checkinAt('PID1', -23.5, -46.6));
  ok(!green(tC), 'C: ausente (org) → não vira verde');

  // (D) presença é PLANO (type != checkin), não chegada real → não marca.
  var tD = mkT(1 * HOUR);
  await run(tD, [{ type: 'planned', placeId: 'PID1', venueLat: -23.5, venueLon: -46.6, startsAt: Date.now() + HOUR, endsAt: Date.now() + 4 * HOUR }]);
  ok(!green(tD), 'D: plano futuro (não check-in) → não marca verde');

  // (E) check-in em OUTRO local (placeId diferente, coords longe) → não marca.
  var tE = mkT(1 * HOUR);
  await run(tE, checkinAt('PID_OUTRO', -20.0, -40.0));
  ok(!green(tE), 'E: check-in em outro local → não marca verde');

  console.log('  ' + pass + ' asserts OK, ' + fail + ' falhas');
  if (fail > 0) { console.error('❌ auto-presence-venue FALHOU'); process.exit(1); }
  console.log('✅ auto-presence-venue: OK');
})();
