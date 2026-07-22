/* Sandbox (SB) — espelho one-way no CLIENTE (Etapa 3), SEM código paralelo: a MESMA
 * AppStore.mutate que muda o original roda o MESMO mutator também no doc do SB. Guardas:
 * (a) só o dev; (b) mão única (nada do SB volta pro original); (c) só enquanto o SB não
 * foi sorteado (protege o teste do dev).
 *
 * Reproduz a falha: no código velho mutate() não replicava → o SB não acompanhava o
 * original. NOVO: replica sob as guardas certas.
 */
const { sandbox: W } = require('./render-harness');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
console.log('──── sandbox-mirror-mutate ────');

const AS = W.AppStore;
// Stub determinístico da transação: aplica o mutator no doc em memória (sem Firestore).
AS.commitTournamentTx = async function (tId, fn) {
  var t = AS.tournaments.find(function (x) { return String(x.id) === String(tId); });
  if (t) fn(t);
  return { ok: true };
};

function setup() {
  var orig = { id: 'ORIG', name: 'Copa', isSandbox: false, participants: [], checkedIn: {} };
  var sb = { id: 'ORIG_SB', name: '(SB) Copa', isSandbox: true, sandboxOf: 'ORIG', creatorUid: 'uDEV',
             participants: [], checkedIn: {} };
  AS.tournaments = [orig, sb];
  return { orig: orig, sb: sb };
}
const mark = function (val) { return function (t) { t.marker = val; }; };

(async function () {
  // (1) DEV + SB pré-sorteio: mutate no original replica no SB (mesmo mutator).
  var s = setup();
  AS.currentUser = { uid: 'uDEV', email: 'rstbarth@gmail.com', displayName: 'Rodrigo' };
  await AS.mutate('ORIG', mark('A'));
  ok(s.orig.marker === 'A', '1: original mudou');
  ok(s.sb.marker === 'A', '1: SB replicou (mesma mutate, mesmo mutator)');

  // (2) SB JÁ sorteado → não replica (protege o teste do dev).
  s = setup(); s.sb.matches = [{ id: 'm1' }];
  AS.currentUser = { uid: 'uDEV', email: 'rstbarth@gmail.com', displayName: 'Rodrigo' };
  await AS.mutate('ORIG', mark('B'));
  ok(s.orig.marker === 'B', '2: original mudou');
  ok(s.sb.marker !== 'B', '2: SB sorteado NÃO é sobrescrito');

  // (3) mão única: mutate no SB NÃO toca o original.
  s = setup();
  AS.currentUser = { uid: 'uDEV', email: 'rstbarth@gmail.com', displayName: 'Rodrigo' };
  await AS.mutate('ORIG_SB', mark('C'));
  ok(s.sb.marker === 'C', '3: SB mudou');
  ok(s.orig.marker !== 'C', '3: original NÃO recebe nada do SB (mão única)');

  // (4) não-dev: mutate no original NÃO replica no SB (só o dev tem/escreve o SB).
  s = setup();
  AS.currentUser = { uid: 'uRANDO', email: 'rando@x.com', displayName: 'Rando' };
  await AS.mutate('ORIG', mark('D'));
  ok(s.orig.marker === 'D', '4: original mudou');
  ok(s.sb.marker !== 'D', '4: não-dev não replica no SB');

  console.log('  ' + pass + ' asserts OK, ' + fail + ' falhas');
  if (fail > 0) { console.error('❌ sandbox-mirror-mutate FALHOU'); process.exit(1); }
  console.log('✅ sandbox-mirror-mutate: OK');
})();
