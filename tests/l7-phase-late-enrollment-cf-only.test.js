'use strict';
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'); let bad = 0;
function ok(value, label) { console.log((value ? '✓ ' : '✗ ') + label); if (!value) bad++; }
function block(source, start, end) { const a = source.indexOf(start), b = source.indexOf(end, a + start.length); return a < 0 ? '' : source.slice(a, b < 0 ? source.length : b); }
const client = fs.readFileSync(path.join(root, 'js/views/tournaments-draw.js'), 'utf8');
const ui = block(client, 'window._setPhaseLateEnrollment = function', '\nwindow.generateDrawFunction');
ok(/_callFn\('setPhaseLateEnrollment'/.test(ui), 'cliente despacha somente a intenção de modo');
ok(!/AppStore\.mutate|commitTournamentTx|saveTournament/.test(ui), 'cliente não grava fase nem torneio');
ok(/_done\.then\(function \(\) \{ _announce\(\); _fire\(\); \}\)\.catch/.test(ui) && /Não foi possível atualizar entradas tardias/.test(ui), 'sucesso só aparece após a Function e a falha aparece para a organização');
const server = fs.readFileSync(path.join(root, 'functions-autodraw/index.js'), 'utf8');
const cf = block(server, 'exports.setPhaseLateEnrollment = onCall', '\nexports.setTournamentBranding');
ok(/request\.auth/.test(cf) && /_isTournamentAdmin/.test(cf), 'Function exige autenticação e organização');
ok(/db\.runTransaction/.test(cf) && /_leTorneio/.test(cf) && /_gravaTorneio/.test(cf), 'Function relê e grava o documento fresco');
ok(/phase\.lateEnrollment/.test(cf) && /phase\.newMatchups/.test(cf) && /t\.lateEnrollment/.test(cf), 'Function mantém a fase e o espelho do torneio coerentes');
ok(/t\.rulesContractVersion >= 2 && t\.status === 'finished'/.test(cf),
  'Function recusa alterar entrada tardia após encerramento somente no contrato novo');
class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
let tournament = { id: 'legacy', creatorUid: 'owner', status: 'finished', rulesContractVersion: 1,
  lateEnrollment: 'expand', newMatchups: true, phases: [{ lateEnrollment: 'expand', newMatchups: true }] };
let writes = 0;
const db = { collection: () => ({ doc: id => ({ id }) }),
  runTransaction: callback => callback({}) };
const setMode = new Function('onCall', 'HttpsError', 'db', '_leTorneio', '_isTournamentAdmin',
  '_drawFail', '_antesDoMotor', '_gravaTorneio', 'require',
  'const exports = {};\n' + cf + '\nreturn exports.setPhaseLateEnrollment;')(
    fn => fn, HttpsError, db, async () => tournament, () => true,
    (code, message) => new HttpsError(code, message), () => ({}),
    (_tx, _ref, t) => { writes++; return { clean: t }; },
    require('node:module').createRequire(path.join(root, 'functions-autodraw/index.js')));
(async () => {
  const oldResult = await setMode({ auth: { uid: 'owner' }, data: { tournamentId: 'legacy', mode: 'closed' } });
  ok(oldResult.ok && writes === 1 && tournament.status === 'finished',
    'torneio legado encerrado mantém a edição administrativa que já existia');
  tournament = { ...tournament, rulesContractVersion: 2, lateEnrollment: 'expand', newMatchups: true };
  await require('node:assert/strict').rejects(setMode({ auth: { uid: 'owner' },
    data: { tournamentId: 'legacy', mode: 'closed' } }), { code: 'failed-precondition' });
  ok(writes === 1, 'torneio v2 encerrado recusa sem gravar');
  process.exitCode = bad ? 1 : 0;
})().catch(error => { console.error(error); process.exitCode = 1; });
