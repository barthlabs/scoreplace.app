/* Teste headless: a TRANSIÇÃO Suíço→eliminatória monta a chave (quartas/semis) —
 * regressão do construtor-de-fases que fazia t.matches ficar VAZIO (o caminho
 * canônico da fase 0 lia t.format='Suíço Clássico' e gerava outra rodada de liga).
 * Fix: generateDrawFunction pula o caminho canônico quando currentStage==='elimination'.
 * Carrega a pilha REAL de sorteio (tournaments-draw + deps). Pura lógica → vm serve.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sb = {};
sb.window = sb; sb.globalThis = sb; sb.console = console;
sb.setTimeout = (f) => { try { f(); } catch (e) {} }; sb.clearTimeout = () => {};
sb.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }), addEventListener() {}, body: { style: {} } };
sb.navigator = { userAgent: 'node' };
sb.location = { hash: '' }; // window.location.hash (redirect pós-sorteio) — não crashar
sb._t = (k, v) => (v && typeof k === 'string') ? k.replace(/\{(\w+)\}/g, (_, n) => v[n] != null ? v[n] : '{' + n + '}') : k;
sb._warn = sb._log = sb._error = sb._debug = () => {};
sb._safeHtml = sb._safeText = (s) => String(s == null ? '' : s);
sb.showNotification = () => {}; sb.showConfirmDialog = (a, b, ok) => ok && ok(); sb.showAlertDialog = () => {};
sb.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {} };
sb.AppStore = {
  tournaments: [], currentUser: null,
  syncImmediate: () => Promise.resolve(true),
  logAction() {}, _saveToCache() {},
  commitTournamentTx: function (id, fn) { var t = this.tournaments.find((x) => String(x.id) === String(id)); try { fn(t); } catch (e) {} return Promise.resolve(true); },
};
sb.firebase = { functions: () => ({ httpsCallable: () => (() => Promise.resolve({ data: {} })) }), firestore: () => ({}) };
sb.FirestoreDB = { db: {}, saveTournament: () => Promise.resolve(), mutateTournament: () => Promise.resolve({ data: {} }) };
sb._idMapKey = (t, w) => ({ uid: (w && w.uid) || '', name: typeof w === 'string' ? w : ((w && (w.displayName || w.name)) || '') });
sb._idMapGet = (t, m, w) => { const k = sb._idMapKey(t, w); return k.name && m ? m[k.name] : undefined; };
sb._idMapHas = (t, m, w) => !!sb._idMapGet(t, m, w);
sb._idMapSet = (t, m, w, v) => { const k = sb._idMapKey(t, w); if (k.name && m) m[k.name] = v; };
sb._idMapDel = (t, m, w) => { const k = sb._idMapKey(t, w); if (k.name && m) delete m[k.name]; };
sb._memberUidByName = () => '';
sb._notifyTournamentParticipants = () => {}; sb._notifyDrawPersonalized = () => {}; sb._notifyLigaRoundWhatsApp = () => {};
vm.createContext(sb);

const ROOT = path.join(__dirname, '..');
['js/views/sport-rules.js', 'js/views/tournaments-utils.js', 'js/views/tournaments-categories.js',
 'js/views/bracket-model.js', 'js/views/bracket-logic.js', 'js/views/draw-cores.js', 'js/views/team-formation.js',
 'js/views/phases-engine.js', 'js/views/phase-generators.js', 'js/views/tournaments-draw-prep.js',
 'js/views/tournaments-draw.js', 'js/views/bracket-ui.js'].forEach((rel) => {
  vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), sb, { filename: rel });
});
sb._findTournamentById = (id) => sb.AppStore.tournaments.find((x) => String(x.id) === String(id));

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }
function eq(a, b, m) { ok(a === b, m + ' (esperado ' + JSON.stringify(b) + ', veio ' + JSON.stringify(a) + ')'); }

// Suíço-como-classificação: 4 jogadores, 1 rodada, top 4 avançam → semis + final.
(function () {
  const t = {
    id: 'swx', name: 'SwissX', format: 'Suíço Clássico', status: 'active',
    currentStage: 'swiss', classifyFormat: 'swiss', p2Resolution: 'swiss', p2TargetCount: 4, swissRounds: 1,
    participants: [{ uid: 'a', displayName: 'A' }, { uid: 'b', displayName: 'B' }, { uid: 'c', displayName: 'C' }, { uid: 'd', displayName: 'D' }],
    rounds: [{ status: 'active', matches: [
      { id: 's1', p1: 'A', p2: 'B', winner: 'A', scoreP1: 6, scoreP2: 3 },
      { id: 's2', p1: 'C', p2: 'D', winner: 'C', scoreP1: 6, scoreP2: 2 },
    ] }],
  };
  sb.AppStore.tournaments = [t];

  ok((t.matches || []).length === 0, 'antes: sem chave de eliminatória');
  sb._closeRound('swx', 0, 's2'); // fecha a última rodada suíça = dispara a transição

  eq(t.currentStage, 'elimination', 'transicionou pra fase eliminatória');
  ok(Array.isArray(t.matches) && t.matches.length > 0, 'CHAVE MONTADA: t.matches populado (veio ' + (t.matches || []).length + ')');
  // Os 4 classificados aparecem nos confrontos reais (não-BYE, não-TBD)
  var names = [];
  (t.matches || []).forEach(function (m) { [m.p1, m.p2].forEach(function (s) { if (s && s !== 'TBD' && !/BYE/i.test(s)) names.push(s); }); });
  ['A', 'B', 'C', 'D'].forEach(function (n) { ok(names.indexOf(n) !== -1, 'classificado ' + n + ' está na chave'); });
  ok(!(t.rounds && t.rounds.length > 0 && t.rounds[0].matches && t.rounds[0].matches.some(function (m) { return m.id && String(m.id).indexOf('s') !== 0 && !m.winner; })), 'não regenerou rodada de liga no lugar da chave');
})();

console.log((fail === 0 ? '✅' : '❌') + ' swiss-to-elim-transition: ' + pass + ' asserts ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
