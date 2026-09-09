/* Caminho barato da ficha: group primeiro; local só quando group falha. */
const { window, load } = require('./headless.js');
load('tournaments-enrollment-report.js');
let pass = 0, fail = 0;
function ok(v, m) { if (v) pass++; else { fail++; console.error('✗ ' + m); } }
function qs(rows) { return { forEach: (fn) => rows.forEach((x) => fn({ data: () => x })) }; }
const uid = 'u';
const row = { tournamentId: 't', matchId: 'm', p1: 'Eu / P', p2: 'A / B', scoreP1: 6, scoreP2: 2, winner: 'Eu / P', playerUids: [uid] };
async function run(groupFails, groupRows) {
  let local = 0;
  window.AppStore = { tournaments: [{ id: 't', name: 'T' }] };
  window._isSandboxRef = () => false;
  window.FirestoreDB = { db: {
    collectionGroup: () => ({ where: () => ({ limit: () => ({ get: () => groupFails ? Promise.reject({ code: 'permission-denied' }) : Promise.resolve(qs(groupRows)) }) }) }),
    collection: () => ({ doc: () => ({ collection: () => ({ where: () => ({ limit: () => ({ get: () => { local++; return Promise.resolve(qs([row])); } }) }) }) }) })
  }};
  const out = await window._lzJogosDoScoreplace(uid, 'Eu');
  return { local, out };
}
(async () => {
  let r = await run(false, []);
  ok(r.local === 0 && r.out.length === 0, 'sucesso vazio do group não abre consultas locais');
  r = await run(false, [row]);
  ok(r.local === 0 && r.out.length === 1, 'sucesso do group retorna jogo sem fallback');
  r = await run(true, []);
  ok(r.local === 1 && r.out.length === 1, 'falha do group abre fallback local');
  console.log((fail ? '✗ ' + fail : '✓ ' + pass) + ' asserções');
  process.exitCode = fail ? 1 : 0;
})();
