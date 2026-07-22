/* Harness headless pra testar a lógica REAL do app (js/views/*) em node, sem Firebase nem DOM.
 *
 * Como: um contexto vm LIMPO (vm.createContext) cujo objeto global é `sandbox`, com
 * `sandbox.window = sandbox`. Os arquivos do app são carregados no browser via <script>, então
 * `function X(){}` no topo vira global (window.X) e `window.X = ...` idem. Rodando o texto via
 * vm.runInContext nesse sandbox, ambos aterrissam em sandbox — exatamente como no browser.
 * Contexto próprio (não o global poluído do Node) = determinístico: `window`, `firebase`,
 * `localStorage` resolvem como nome livre porque o sandbox É o global do contexto.
 *
 * Testa o código REAL de js/views/ (não a cópia vendor/ do autodraw).
 *
 * Uso:  const { window } = require('./headless');
 *       window._computeStandings(t, cat)
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = {};
sandbox.window = sandbox;        // window === global do contexto
sandbox.globalThis = sandbox;
sandbox.console = console;       // _error usa console.error
sandbox.setTimeout = setTimeout;
sandbox.clearTimeout = clearTimeout;

// --- stubs mínimos que os arquivos referenciam em runtime ---
// Labels de prod que a LÓGICA compara por igualdade (não é só exibição): ex. _autoResolveBye
// compara o slot com _t('bui.byeLabel'). Com a chave crua, BYEs inferiores não auto-resolviam
// no headless (falso "vaga morta"). Espelha o pt-BR real.
const _T_LABELS = { 'bui.byeLabel': 'BYE (Avança Direto)' };
sandbox._t = function (k, vars) {
  if (!vars && _T_LABELS[k] != null) return _T_LABELS[k];
  if (vars && typeof k === 'string') {
    return k.replace(/\{(\w+)\}/g, (_, n) => (vars[n] != null ? vars[n] : '{' + n + '}'));
  }
  return k;
};
sandbox._warn = function () {};
sandbox._log = function () {};
sandbox._error = function () { console.error.apply(console, arguments); };
sandbox._debug = function () {};
sandbox._safeHtml = (s) => String(s == null ? '' : s);
sandbox._safeText = (s) => String(s == null ? '' : s);
sandbox.showNotification = function () {};
// v1.2.25: o SORTEIO INICIAL saiu do cliente — generateDrawFunction agora chama a CF
// `drawRound`. Pra continuar exercitando o sorteio REAL, o stub roda o MESMO motor que o
// servidor: draw-core.drawInitial (que carrega vendor/, cópia exata de js/views/*). NÃO é
// uma reimplementação do sorteio em código de teste — seria uma 2ª versão, o bug que a
// canonização mata. Cross-realm é seguro: drawInitial recebe/muta um objeto simples.
let _drawCore = null;
try { _drawCore = require('../functions-autodraw/draw-core.js'); } catch (e) { _drawCore = null; }
function _drawRoundStub(payload) {
  // Thenable SÍNCRONO: os harnesses são síncronos (buildViaDraw devolve `t` na hora) e uma
  // Promise real só resolveria na microtask, devolvendo um `t` ainda sem chave.
  let val = null, err = null;
  try {
    if (!_drawCore) throw new Error('draw-core indisponível no harness');
    const tId = String((payload && payload.tournamentId) || '');
    // Mesmo lookup canônico que o cliente usa (_findTournamentById) — [[project_find_tournament_by_id]].
    // Fallback pra AppStore.tournaments: nem todo teste stuba o resolvedor.
    let t = null;
    if (typeof sandbox._findTournamentById === 'function') t = sandbox._findTournamentById(tId);
    if (!t) {
      const list = (sandbox.AppStore && Array.isArray(sandbox.AppStore.tournaments)) ? sandbox.AppStore.tournaments : [];
      t = list.find((x) => String(x.id) === tId);
    }
    if (!t) throw new Error('not-found');
    // Espelha a CF: re-sorteio limpa pelo reset canônico antes de redesenhar.
    if (payload && payload.allowRedraw) { try { _drawCore._window._clearTournamentDraw(t); } catch (e2) {} }
    const res = _drawCore.drawInitial(t, { idStamp: 1 });
    if (!res || !res.ok) throw new Error((res && res.reason) || 'draw-failed');
    // SERIALIZA, como o fio faz. Devolver a MESMA referência de `t` quebraria: o cliente
    // esvazia o `t` local (delete) antes de copiar do retorno — se forem o mesmo objeto,
    // copia de si mesmo já vazio. O callable real serializa; o stub espelha isso.
    val = { data: { ok: true, format: res.format, native: !!res.native,
      matchCount: res.matchCount, sitOuts: res.sitOuts || 0, allMaleCount: res.allMaleCount || 0,
      tournament: JSON.parse(JSON.stringify(t)) } };
  } catch (e) { err = e; }
  return {
    then(cb) {
      if (!err) { try { cb(val); } catch (e3) { err = e3; } }
      return { catch(cb2) { if (err) cb2(err); return null; } };
    },
    catch(cb2) { if (err) cb2(err); return null; },
  };
}
// FECHO de rodada Suíço: o cliente (_doCloseRound) chama window._callCloseRound → CF closeRound.
// O stub roda o MESMO núcleo do servidor (draw-core.closeRoundCore) sobre o `t` do harness.
function _closeRoundStub(payload) {
  let val = null, err = null;
  try {
    if (!_drawCore) throw new Error('draw-core indisponível no harness');
    const tId = String((payload && payload.tournamentId) || '');
    let t = null;
    if (typeof sandbox._findTournamentById === 'function') t = sandbox._findTournamentById(tId);
    if (!t) {
      const list = (sandbox.AppStore && Array.isArray(sandbox.AppStore.tournaments)) ? sandbox.AppStore.tournaments : [];
      t = list.find((x) => String(x.id) === tId);
    }
    if (!t) throw new Error('not-found');
    const res = _drawCore.closeRoundCore(t, payload && payload.roundIdx, (payload && payload.resultCtx) || null);
    if (!res || !res.ok) { val = { data: { ok: false, reason: (res && res.reason) || 'close-failed' } }; }
    else { val = { data: { ok: true, branch: res.branch, tournament: JSON.parse(JSON.stringify(t)) } }; }
  } catch (e) { err = e; }
  return {
    then(cb) {
      if (!err) { try { cb(val); } catch (e3) { err = e3; } }
      return { catch(cb2) { if (err) cb2(err); return null; } };
    },
    catch(cb2) { if (err) cb2(err); return null; },
  };
}
sandbox.firebase = {
  functions: () => ({ httpsCallable: () => (() => Promise.resolve({ data: {} })) }),
  firestore: () => ({}),
};
// O sorteio NÃO passa mais pelo httpsCallable (o SDK estoura no token de FCM com usuário
// logado — ver _callDrawRound em tournaments-draw.js). O cliente chama window._callDrawRound;
// é ELE que o teste tem de stubar, senão exercitaria um caminho que não existe mais.
// tournaments-draw.js define o real no load; sobrescrevemos DEPOIS (ver render-harness).
sandbox._callDrawRound = _drawRoundStub;
sandbox._callCloseRound = _closeRoundStub;
let _ls = {};
sandbox.localStorage = {
  getItem: (k) => (k in _ls ? _ls[k] : null),
  setItem: (k, v) => { _ls[k] = String(v); },
  removeItem: (k) => { delete _ls[k]; },
  clear: () => { _ls = {}; },
};

vm.createContext(sandbox);

const VIEWS = path.join(__dirname, '..', 'js', 'views');
function load(rel) {
  const full = path.join(VIEWS, rel);
  vm.runInContext(fs.readFileSync(full, 'utf8'), sandbox, { filename: full });
  // tournaments-draw.js define o _callDrawRound/_callCloseRound REAIS (fetch pra CF) no load —
  // no teste não há rede nem Firebase. Reaplica os stubs DEPOIS de cada arquivo pra os reais
  // nunca vencerem.
  sandbox._callDrawRound = _drawRoundStub;
  sandbox._callCloseRound = _closeRoundStub;
}

// Ordem importa (mesma do index.html / draw-core.js): utils → categorias → model → logic
load('sport-rules.js');             // window.SPORT_RULES — fonte única das regras das modalidades
load('tournaments-utils.js');       // _isLigaFormat, _calcNextDrawDate
load('tournaments-categories.js');  // _displayCategoryName, _getParticipantCategories, _participantInCategory
load('bracket-model.js');           // _appendCanonicalColumn
load('bracket-logic.js');           // _computeStandings, _advanceWinner, _findMatch, _maybeFinish*, _generateNextRound
load('phases-engine.js');           // window._phasesEngine: buildEntrantsByDest, materializeNextPhase, bracketPhaseGroups…

module.exports = { window: sandbox, sandbox, load, E: sandbox._phasesEngine, drawRoundStub: _drawRoundStub, closeRoundStub: _closeRoundStub };
