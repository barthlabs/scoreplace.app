/* AUTO-W.O.: quem se dá W.O. NÃO precisa da aprovação de ninguém.
 *
 * Ordem do dono (22/ago/2026): _"o participante pode se dar W.O. sem precisar de aprovação
 * de ninguém"_ + _"só precisa clicar no botão, no próprio nome, pedir a cancelar/confirmar
 * advertindo do que vai acontecer e confirmado confere o auto W.O."_
 *
 * O que esta trava prova, na cadeia REAL (wo-claim → _applyClaimViaGate → _applyWO), com
 * AppStore.mutate mockado:
 *  (a) apontar OUTRA pessoa continua PENDENTE — a confirmação cruzada não morreu.
 *  (b) apontar A SI MESMO vale na hora: jogo decidido, claim 'applied', ninguém confirmou.
 *  (c) o botão do MEU nome no picker chama `_woSelfConfirm` (o cancelar/confirmar que
 *      adverte), NÃO `_woDeclare` direto — e o do nome dos outros segue em `_woDeclare`.
 *  (d) auto-W.O. de dupla em eliminatória NÃO atropela a 2ª decisão: o fato já nasce
 *      confirmado, mas o DESFECHO continua negociado (project_wo_outcome_negotiation_canon).
 *
 * FALHA no código anterior: (b) ficava 'pending' esperando o adversário — que é justamente
 * quem lucra com o W.O. — e (c) não existia.
 *
 * Rodado por: npm test (tests/run-unit.js)
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = {};
sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.console = console;

// DOM mínimo que devolve o elemento criado — é assim que se lê o HTML do overlay
// (o picker) sem navegador: `_overlay` cria a div e joga no body.
let ultimoOverlay = null;
const mkEl = () => ({ style: { cssText: '' }, innerHTML: '', id: '', setAttribute() {}, appendChild() {}, addEventListener() {}, remove() {}, querySelectorAll: () => [] });
sandbox.document = {
  getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  createElement: () => { ultimoOverlay = mkEl(); return ultimoOverlay; },
  addEventListener() {}, body: { appendChild() {} }, location: { hash: '' }
};
sandbox.location = { hash: '' }; sandbox.navigator = { userAgent: 'node' };
sandbox.setTimeout = setTimeout; sandbox.clearTimeout = clearTimeout;
sandbox._t = (k) => k;
sandbox._warn = sandbox._log = sandbox._error = sandbox._debug = () => {};
sandbox._safeHtml = sandbox._safeText = (s) => String(s == null ? '' : s);
sandbox.showNotification = () => {};
sandbox._showLoading = sandbox._hideLoading = sandbox._rerenderBracket = sandbox._softRefreshView = () => {};
const notificados = [];
sandbox._sendUserNotification = (uid, data) => notificados.push({ uid, title: data && data.title });
sandbox._opVoterName = () => '';
sandbox._canManagePresence = () => false;      // o ator é JOGADOR, não organizador
sandbox._maybeFinishElimination = () => {};
sandbox.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {} };
sandbox.firebase = { functions: () => ({ httpsCallable: () => (() => Promise.resolve({ data: {} })) }), firestore: () => ({}) };

const _pName = (p) => typeof p === 'string' ? p : ((p && (p.displayName || p.name)) || '');
sandbox._pName = _pName;
sandbox._participantUids = (p) => (p && typeof p === 'object' && p.uid) ? [p.uid] : [];
sandbox._displayNameForUid = (u, d) => ({ ua: 'A', ub: 'B', uc: 'C', ud: 'D' }[u] || d || '');
sandbox._isLigaFormat = (t) => !!(t && (t.format === 'Liga' || t.format === 'Ranking'));
sandbox._isMonarchFormat = () => false;
sandbox._resultEntryIncludes = (t, k) => { var re = t && t.resultEntry; return Array.isArray(re) ? re.indexOf(k) !== -1 : re === k; };
sandbox._idMapKey = (t, who) => ({ uid: (who && who.uid) || '', name: typeof who === 'string' ? who : ((who && (who.displayName || who.name)) || '') });
sandbox._idMapGet = (t, map, who) => { const k = sandbox._idMapKey(t, who); return (k.name && map) ? map[k.name] : undefined; };
sandbox._idMapHas = (t, map, who) => sandbox._idMapGet(t, map, who) !== undefined;
sandbox._idMapSet = (t, map, who, v) => { const k = sandbox._idMapKey(t, who); if (k.name && map) map[k.name] = v; };
sandbox._idMapDel = (t, map, who) => { const k = sandbox._idMapKey(t, who); if (k.name && map) delete map[k.name]; };
sandbox._getStandbyPool = (t) => (Array.isArray(t.standbyParticipants) ? t.standbyParticipants.slice() : []);
sandbox._woHistSet = sandbox._woHistGet = sandbox._woHistDel = () => {};

let _cu = { uid: 'ua', displayName: 'A' };     // eu sou o JOGADOR A
sandbox.AppStore = {
  tournaments: [],
  get currentUser() { return _cu; },
  isOrganizer: () => false,
  isCreator: () => false,
  logAction() {}, sync() {}, syncImmediate() {},
  mutate(tId, mutatorFn) {
    const t = sandbox.AppStore.tournaments.find(x => String(x.id) === String(tId));
    let r;
    try { r = mutatorFn(t); } catch (e) { return Promise.reject(e); }
    return Promise.resolve(r !== false);
  },
};
sandbox._findTournamentById = (id) => sandbox.AppStore.tournaments.find(t => String(t.id) === String(id)) || null;

vm.createContext(sandbox);
const ROOT = path.join(__dirname, '..');
['js/views/bracket-model.js', 'js/views/bracket-logic.js', 'js/views/wo-core.js', 'js/views/participants.js', 'js/views/wo-claim.js']
  .forEach((rel) => vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), sandbox, { filename: rel }));
const W = sandbox;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
const eq = (a, b, m) => ok(a === b, m + ' (esperado ' + JSON.stringify(b) + ', veio ' + JSON.stringify(a) + ')');
console.log('──── wo-auto-do-proprio-jogador ────');

// ⚠️ FUNÇÃO, não constante: `woClaims`/`absent` são objetos, e um BASE literal
// compartilharia a MESMA referência entre os fixtures — o 2º torneio já nasceria com o
// claim do 1º e o teste mediria o cenário errado.
const BASE = () => ({
  name: 'T', format: 'Eliminatórias Simples', woScope: 'individual',
  resultEntry: ['organizer', 'players'],
  startDate: '2026-07-18T10:00', endDate: '2026-07-19T15:00',
  standbyParticipants: [], checkedIn: {}, absent: {}, woClaims: []
});
// 1×1: A × C. Sem parceiro → não há desfecho a negociar → aplica direto.
function mkSolo(id) {
  const t = Object.assign({ id }, BASE(), {
    participants: [{ displayName: 'A', uid: 'ua' }, { displayName: 'C', uid: 'uc' }],
    matches: [{ id: 'm1', p1: 'A', p2: 'C', team1Uids: ['ua'], team2Uids: ['uc'], winner: null, nextMatchId: null }]
  });
  W.AppStore.tournaments = [t]; return t;
}
// Dupla A/B × C/D: o parceiro segue → a 2ª decisão (o desfecho) continua negociada.
function mkDupla(id) {
  const t = Object.assign({ id }, BASE(), {
    participants: [{ displayName: 'A', uid: 'ua' }, { displayName: 'B', uid: 'ub' }, { displayName: 'C', uid: 'uc' }, { displayName: 'D', uid: 'ud' }],
    matches: [{ id: 'm1', p1: 'A / B', p2: 'C / D', team1Uids: ['ua', 'ub'], team2Uids: ['uc', 'ud'], winner: null, nextMatchId: null }]
  });
  W.AppStore.tournaments = [t]; return t;
}
// O ctxKey NASCE do chip (é ele que registra o contexto) — mesmo caminho da tela.
function ctxKeyDo(t) {
  const chip = W._woClaimChip(t, { scope: 'match', matchId: 'm1', compact: true });
  const m = chip.match(/_woOpenClaim\('[^']*','([^']*)'\)/);
  return { chip, key: m && m[1] };
}

ok(typeof W._woSelfConfirm === 'function', '_woSelfConfirm existe (o cancelar/confirmar do auto-W.O.)');

// ── (a) apontar OUTRA pessoa: segue PENDENTE, nada aplicado ────────────────────
(async function () {
  const t = mkSolo('s1');
  const k = ctxKeyDo(t).key;
  ok(!!k, 'outro: o chip registrou o contexto');
  W._woDeclare('s1', k, 'C', 'uc');
  await new Promise(r => setTimeout(r, 0));
  eq((t.woClaims[0] || {}).status, 'pending', 'outro: claim fica PENDENTE (o outro lado confirma)');
  ok(!t.matches[0].winner, 'outro: jogo NÃO decidido sem confirmação');
})().then(() => {
  // ── (b) apontar A SI MESMO: vale na hora ─────────────────────────────────────
  return (async function () {
    const t = mkSolo('s2');
    const k = ctxKeyDo(t).key;
    W._woDeclare('s2', k, 'A', 'ua');
    await new Promise(r => setTimeout(r, 0));
    const c = t.woClaims[0] || {};
    ok(c.selfDeclared === true, 'auto: o claim sai marcado como selfDeclared');
    ok(c.factConfirmed === true, 'auto: o FATO já nasce confirmado (ninguém aprova)');
    eq(c.status, 'applied', 'auto: claim APLICADO na hora');
    eq(t.matches[0].winner, 'C', 'auto: o adversário vence por W.O.');
    ok(t.matches[0].wo === true, 'auto: o jogo fica marcado como W.O.');
  })();
}).then(() => {
  // ── (c) o picker manda o MEU nome pro cancelar/confirmar ─────────────────────
  return (async function () {
    const t = mkSolo('s3');
    const k = ctxKeyDo(t).key;
    W._woOpenClaim('s3', k);
    const html = (ultimoOverlay && ultimoOverlay.innerHTML) || '';
    ok(/_woSelfConfirm\('s3'/.test(html), 'picker: o botão do MEU nome chama _woSelfConfirm (adverte antes)');
    ok(/_woDeclare\('s3'/.test(html), 'picker: o botão do OUTRO segue em _woDeclare (confirmação cruzada)');
    const iSelf = html.indexOf('_woSelfConfirm');
    const iOutro = html.indexOf('_woDeclare');
    ok(iSelf !== -1 && iOutro !== -1 && iSelf !== iOutro, 'picker: são botões DIFERENTES, não o mesmo caminho');
    // e a advertência diz o que vai acontecer
    W._woSelfConfirm('s3', k, 'A', 'ua');
    const av = (ultimoOverlay && ultimoOverlay.innerHTML) || '';
    ok(/Confirmar W\.O\./.test(av) && /Cancelar/.test(av), 'advertência: tem Cancelar e Confirmar');
    ok(/adversário avança|W\.O\./.test(av), 'advertência: diz o que vai acontecer com o jogo');
    ok(!t.matches[0].winner, 'advertência: só a tela — nada aplicado antes de confirmar');
  })();
}).then(() => {
  // ── (d) dupla: o fato não precisa de aprovação, o DESFECHO continua negociado ─
  return (async function () {
    const t = mkDupla('d1');
    const k = ctxKeyDo(t).key;
    W._woDeclare('d1', k, 'A', 'ua');
    await new Promise(r => setTimeout(r, 0));
    const c = t.woClaims[0] || {};
    ok(c.selfDeclared === true && c.factConfirmed === true, 'dupla: o fato nasce confirmado');
    eq(c.outcomeStage, 'awaiting-proposal', 'dupla: pula direto pra 2ª decisão (o parceiro propõe)');
    eq(c.outcomePartnerUid, 'ub', 'dupla: o parceiro que ficou é quem propõe');
    ok(!t.matches[0].winner, 'dupla: o jogo NÃO é decidido sozinho — o desfecho é negociado');
    ok(notificados.some(n => n.uid === 'ub' && /desfecho/i.test(n.title || '')), 'dupla: o parceiro é avisado pra propor');
  })();
}).then(() => {
  console.log('  ' + pass + ' asserts OK, ' + fail + ' falhas');
  if (fail > 0) { console.error('❌ wo-auto-do-proprio-jogador FALHOU'); process.exit(1); }
  console.log('✅ wo-auto-do-proprio-jogador: OK');
});
