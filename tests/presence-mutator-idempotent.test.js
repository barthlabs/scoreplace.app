// REPRODUZ o bug do dono (jul/2026): "continua pulando e desmarcando presentes depois de ~16.
// tem que ser mais consistente."
//
// CAUSA-RAIZ: o mutator da presença era um TOGGLE — lia o estado do doc FRESCO e INVERTIA. Só que
// ele roda MAIS DE UMA VEZ para o MESMO clique:
//   (a) AppStore.mutate aplica no objeto LOCAL e de novo no doc fresco da transação;
//   (b) commitTournamentTx faz RETRY (até 5×) em conflito transiente, re-executando o mutator;
//   (c) o próprio Firestore re-executa a função da transação sob contenção.
// Cada re-execução INVERTIA de novo ⇒ nº PAR de aplicações = volta a DESMARCADO. Marcando 16-24
// pessoas em rajada a contenção sobe, os retries acontecem, e presenças caem sozinhas. É por isso
// que as 3 correções anteriores (intenção pendente, união no eco da CF, debounce) não resolveram:
// todas tratavam a LEITURA/eco, e o defeito estava na ESCRITA.
//
// REGRA TRAVADA: mutator que roda dentro de transação com retry TEM de ser IDEMPOTENTE — alvo
// ABSOLUTO decidido uma vez, nunca um toggle sobre o estado fresco. [[project_concurrency_safe_saves]]
const H = require('./render-harness');
const W = H.sandbox;
require('./headless').load('participants.js');   // _applyCheckInToggle

let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }

const UID = 'u1', NOME = 'Fulano';
function mkT(present) {
  const t = { id: 'IDEMP', format: 'Eliminatórias Simples', teamSize: 2, participants: [{ uid: UID, displayName: NOME, name: NOME }],
    checkedIn: {}, absent: {}, checkedInConfirmed: {}, standbyParticipants: [], waitlist: [], teamOrigins: {}, matches: [] };
  if (present) t.checkedIn[UID] = 1;
  return t;
}
const isPresent = (t) => W._idMapHas(t, t.checkedIn || {}, { uid: UID, displayName: NOME });

// captura o mutator e simula RETRY (N execuções sobre o MESMO doc)
function runToggleWithRetries(t, times) {
  let captured = null;
  W.AppStore.tournaments = [t];
  W.AppStore.mutate = function (tid, fn) { captured = fn; return { then: function (cb) { try { cb && cb(); } catch (e) {} return { then: function (c2) { try { c2 && c2(); } catch (e) {} return null; } }; } }; };
  W._presenceBusyUntil = function () {};
  W._updateCardPresenceInPlace = function () { return true; };
  W._stampPresenceIntent = function () {};
  W._participantsViewSig = null; W._tournamentDetailSig = null;
  W._applyCheckInToggle('IDEMP', NOME, UID);
  ok(typeof captured === 'function', 'o mutator foi capturado');
  if (!captured) return t;
  for (let i = 0; i < times; i++) captured(t);   // simula as re-execuções (retry/local+fresh)
  return t;
}

console.log('── mutator de presença é IDEMPOTENTE (retry não inverte) ──');

// AUSENTE → marcar presente; qualquer nº de re-execuções mantém PRESENTE
[1, 2, 3, 5].forEach(n => {
  const t = mkT(false);
  runToggleWithRetries(t, n);
  ok(isPresent(t) === true, `marcar PRESENTE aplicado ${n}× ⇒ segue PRESENTE (nº par não desmarca)`);
});

// PRESENTE → desmarcar; qualquer nº de re-execuções mantém DESMARCADO
[1, 2, 3, 5].forEach(n => {
  const t = mkT(true);
  runToggleWithRetries(t, n);
  ok(isPresent(t) === false, `desmarcar aplicado ${n}× ⇒ segue DESMARCADO`);
});

// PROVA do furo antigo: um toggle sobre o estado fresco inverte a cada aplicação
(function () {
  const t = mkT(false);
  const toggleAntigo = (ft) => { if (W._idMapHas(ft, ft.checkedIn, { uid: UID })) W._idMapDel(ft, ft.checkedIn, { uid: UID }); else W._idMapSet(ft, ft.checkedIn, { uid: UID }, 1); };
  toggleAntigo(t); toggleAntigo(t);   // 2 aplicações (local + 1 retry)
  ok(isPresent(t) === false, 'toggle ANTIGO aplicado 2× DESMARCA — era exatamente o furo');
})();

console.log('\n' + (fail === 0 ? '✅ presence-mutator-idempotent: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fails.length) { console.error('\nFALHAS:'); fails.forEach(f => console.error('  ✗ ' + f)); }
process.exit(fail > 0 ? 1 : 0);
