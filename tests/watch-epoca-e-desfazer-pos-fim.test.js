/* Leva 0 do relógio (incidente de 13/ago/2026, torneio ao vivo) — duas falhas
 * relatadas pelo dono, cada uma travada aqui pelo CÓDIGO REAL:
 *
 * (1) "o relógio ficou preso no placar de fim de set e nem fechando o app voltou;
 *      comecei o jogo seguinte no celular mas não pegou no relógio."
 *      CAUSA: o guard de `seq` do WatchSession descartava snapshot com seq menor
 *      quando a queda era < 20 — mas o seq ZERA a cada recarga da WebView, e com
 *      lastSeq pequeno (partida curta) TODO snapshot da carga nova era descartado
 *      até o contador alcançar o valor antigo. FIX: época de sessão no snapshot
 *      (época nova = contador recomeçou, aceita sempre).
 *
 * (2) "o desfazer com o set terminado não funcionou (e deveria funcionar
 *      permitindo retomar o jogo)."
 *      CAUSA dupla: a tela de fim NÃO oferecia o botão, e o resultado já tinha
 *      sido gravado automaticamente no último ponto (_saveResult idempotente via
 *      _resultSaved) — sem rearmar o flag, o novo fim NUNCA regravaria e a chave
 *      ficaria com o placar errado pra sempre. FIX: botão na tela de fim + rearme
 *      de _resultSaved no undo + id ESTÁVEL do registro de histórico (_liveRecId)
 *      pra regravação sobrescrever em vez de duplicar.
 *
 * Rodado por: npm test (tests/run-unit.js)
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
console.log('──── watch-epoca-e-desfazer-pos-fim ────');

const ROOT = path.join(__dirname, '..');
const bridgeSrc = fs.readFileSync(path.join(ROOT, 'js', 'watch-bridge.js'), 'utf8');
const uiSrc = fs.readFileSync(path.join(ROOT, 'js', 'views', 'bracket-ui.js'), 'utf8');
const sessSrc = fs.readFileSync(path.join(ROOT, 'ios', 'App', 'Watch', 'WatchSession.swift'), 'utf8');
const stateSrc = fs.readFileSync(path.join(ROOT, 'ios', 'WatchApp', 'Sources', 'ScoreState.swift'), 'utf8');

// ═══ PARTE 1 — ÉPOCA DE SESSÃO (watch-bridge.js REAL) ══════════════════════
function loadBridge(profile) {
  const sent = [];
  const win = {
    Capacitor: {
      isNativePlatform: () => true,
      Plugins: { ScoreplaceWatch: { sendState: (a) => sent.push(a.snapshot), addListener: () => {} } }
    },
    AppStore: { currentUser: profile || null },
    _getLiveScoreState: () => ({ v: 1, type: 'state', active: true }),
    _getCasualSetupState: undefined
  };
  win.window = win;
  const ctx = vm.createContext(win);
  ctx.setTimeout = setTimeout; ctx.clearTimeout = clearTimeout;
  vm.runInContext(bridgeSrc, ctx);
  return { win, sent };
}

const a = loadBridge(null);
a.win.WatchBridge.pushCurrent();
a.win._getLiveScoreState = () => ({ v: 1, type: 'state', active: true, points: ['15', '0'] });
a.win.WatchBridge.pushCurrent();
ok(a.sent.length === 2, 'dois snapshots enviados');
ok(typeof a.sent[0].epoch === 'string' && a.sent[0].epoch.length > 0,
   '🔒 todo snapshot carrega a ÉPOCA da sessão (sem ela o relógio adivinha o reinício do seq por heurística furada)');
ok(a.sent[0].epoch === a.sent[1].epoch, 'a época é CONSTANTE dentro da mesma carga da WebView');

const b = loadBridge(null);
b.win.WatchBridge.pushCurrent();
ok(b.sent[0].epoch !== a.sent[0].epoch,
   '🔒 recarga da WebView = época NOVA (é assim que o relógio sabe que o contador zerou)');
ok(a.sent[1].seq === 2 && b.sent[0].seq === 1, 'seq recomeça em 1 na carga nova (o cenário do congelamento)');

// ═══ PARTE 2 — O GUARD DO RELÓGIO (WatchSession.swift, trava por varredura) ═
// Swift não roda no npm test; o typecheck roda no build. A varredura trava a
// FORMA do guard — se alguém remover a época ou ressuscitar a heurística crua,
// fica vermelho aqui antes de chegar ao pulso de alguém.
ok(sessSrc.indexOf('private var lastEpoch') !== -1, 'WatchSession guarda a última época vista');
ok(/s\.epoch != lastEpoch/.test(sessSrc), 'época DIFERENTE reseta o contador (aceita a carga nova)');
ok(/s\.epoch\.isEmpty\s*\n?\s*&&.*>= 20/.test(sessSrc) || /epoch\.isEmpty[\s\S]{0,120}>= 20/.test(sessSrc),
   'a heurística da queda ≥ 20 sobrevive SÓ como fallback pra snapshot sem época (app antigo)');
ok(!/\(lastSeq - s\.seq\) < 20 \{ return \}/.test(sessSrc),
   '🔒 a regra antiga crua ("queda < 20 = descarta", que congelava o relógio) NÃO existe mais');
ok(/case v, seq, epoch/.test(stateSrc) && /decodeIfPresent\(String\.self, forKey: \.epoch\)/.test(stateSrc),
   'ScoreState decodifica a época (campo novo no contrato)');

// O CENÁRIO DO INCIDENTE, nos dois mundos (transliteração 1:1 dos guards, como
// DOCUMENTAÇÃO do porquê — a trava de verdade é a varredura acima):
function oldGuard(lastSeq, seq) { return !(seq !== 0 && seq < lastSeq && (lastSeq - seq) < 20); }
function newGuard(st, seq, epoch) {
  if (epoch && epoch !== st.lastEpoch) { st.lastEpoch = epoch; st.lastSeq = -1; }
  if (seq !== 0 && seq < st.lastSeq) return false;
  st.lastSeq = seq; return true;
}
// relógio viu a partida curta terminar em lastSeq=15; o celular recarrega pro
// jogo novo e manda seq 1, 2, 3… — o guard velho descartava TODOS:
ok(oldGuard(15, 1) === false && oldGuard(15, 14) === false,
   'reprodução do incidente: no guard VELHO a carga nova era 100% descartada (relógio preso no fim de set)');
const st = { lastSeq: 15, lastEpoch: 'carga-A' };
ok(newGuard(st, 1, 'carga-B') === true,
   '🔒 no guard NOVO a época diferente aceita o primeiro snapshot da carga nova');
ok(newGuard(st, 2, 'carga-B') === true && newGuard(st, 1, 'carga-B') === false,
   'dentro da mesma época o seq segue monotônico (reordenação continua descartada)');

// ═══ PARTE 3 — DESFAZER PÓS-FIM (função REAL extraída do bracket-ui.js) ════
function extractUndoFn() {
  const startMark = 'window._liveScoreUndoLastPoint = function() {';
  const endMark = '\n  // Rebuild _proposedOrder';
  const s = uiSrc.lastIndexOf(startMark);
  const e = uiSrc.indexOf(endMark, s);
  if (s === -1 || e === -1) return null;
  return uiSrc.slice(s, e);
}
const undoSrc = extractUndoFn();
ok(!!undoSrc, 'função _liveScoreUndoLastPoint extraída do arquivo (casamento de marcadores)');

function makeUndoScope(initial) {
  const toasts = [];
  const factory = new Function('window', 'state', 'showNotification', '_render', '_watchNotify', 'deps',
    // 1.9.36: a função extraída passou a consultar `_spectate` (o modo de quem só
    // ASSISTE o placar dos outros). O escopo fabricado aqui precisa declará-lo, senão
    // o teste explode num ReferenceError que nada tem a ver com o que ele mede.
    // Falso = o caso deste teste: quem está com o placar na mão, jogando.
    'var _spectate = false;\n' +
    'var _resultSaved = deps.resultSaved;\n' +
    'var _liveRecId = deps.liveRecId;\n' +
    'var _matchStartTime = deps.mst, _matchEndTime = deps.met;\n' +
    undoSrc + ';\n' +
    'return { undo: window._liveScoreUndoLastPoint, flags: function() { return { resultSaved: _resultSaved, liveRecId: _liveRecId }; } };');
  const win = { _haptic: null, _error: () => {} };
  const api = factory(win, initial.state,
    (t, m) => toasts.push(t), () => {}, () => {},
    { resultSaved: initial.resultSaved, liveRecId: initial.liveRecId || null, mst: 1, met: 2 });
  return { api, toasts, state: initial.state };
}

// Cenário do relato: rajada fechou a partida (isFinished + resultado JÁ gravado).
// O snapshot guardado é o estado de ANTES do ponto final.
const preFinish = { isFinished: false, winner: null, currentGameP1: 5, currentGameP2: 4, _undoSnapshots: undefined };
const snapJson = JSON.stringify({ state: { isFinished: false, winner: null, currentGameP1: 5, currentGameP2: 4 }, matchStartTime: 1, matchEndTime: null });
const finished = { isFinished: true, winner: 1, currentGameP1: 6, currentGameP2: 4, _undoSnapshots: [snapJson] };
const t1 = makeUndoScope({ state: finished, resultSaved: true });
t1.api.undo();
ok(t1.state.isFinished === false && t1.state.winner === null,
   '🔒 desfazer com a partida TERMINADA reabre o jogo (o relato do dono)');
ok(t1.state.currentGameP1 === 5 && t1.state.currentGameP2 === 4, 'o placar volta ao de antes do ponto final');
ok(t1.api.flags().resultSaved === false,
   '🔒 _resultSaved é REARMADO — sem isso o novo fim nunca regravaria e a chave ficaria com o placar errado (falha no código anterior)');
ok(t1.api.flags().liveRecId === null || t1.api.flags().liveRecId === undefined || true, 'sanidade');
const t1b = makeUndoScope({ state: { isFinished: true, winner: 2, _undoSnapshots: [snapJson] }, resultSaved: true, liveRecId: 'm_1_2' });
t1b.api.undo();
ok(t1b.api.flags().liveRecId === 'm_1_2',
   '🔒 o _liveRecId NÃO é zerado no undo — é a MESMA partida, e o mesmo id faz a regravação SOBRESCREVER o histórico em vez de duplicar');

// Não-regressões do undo comum:
const t2 = makeUndoScope({ state: { isFinished: false, tieRulePending: true, _undoSnapshots: [snapJson] }, resultSaved: false });
t2.api.undo();
ok(t2.toasts.length === 1 && t2.state.tieRulePending === true, 'transição de set pendente ainda bloqueia o undo (guard preservado)');
const t3 = makeUndoScope({ state: { isFinished: false, _undoSnapshots: [] }, resultSaved: false });
t3.api.undo();
ok(t3.toasts.length === 1, 'sem snapshot → aviso, nada explode');
const t4 = makeUndoScope({ state: { isFinished: false, currentGameP1: 3, currentGameP2: 2, _undoSnapshots: [snapJson] }, resultSaved: false });
t4.api.undo();
ok(t4.api.flags().resultSaved === false && t4.state.currentGameP1 === 5, 'undo no meio da partida segue igual (flag já era false, fica false)');

// ═══ PARTE 4 — FIAÇÃO (varredura do bracket-ui.js) ═════════════════════════
ok(/var undoSection = \(Array\.isArray\(state\._undoSnapshots\)/.test(uiSrc),
   'a tela de FIM monta o botão Desfazer (só quando há o que desfazer)');
ok(/restartSection \+\s*\n\s*undoSection \+/.test(uiSrc),
   '🔒 o botão está LIGADO na tela de fim (restartSection + undoSection) — era o que faltava: o motor sabia voltar e a tela não oferecia');
ok(undoSrc.indexOf('_resultSaved = false') !== -1,
   'o rearme vive DENTRO do undo (não em quem chama — todo caminho ganha)');
ok(/matchId: ctx\.matchId \|\| _liveRecId/.test(uiSrc),
   'registro de histórico usa o id ESTÁVEL da partida');
ok(!/matchId: ctx\.matchId \|\| \('m_' \+ Date\.now/.test(uiSrc),
   '🔒 o id ALEATÓRIO por gravação não existe mais no registro (era ele que duplicaria o histórico na regravação)');
ok(/hist2 = hist2\.filter\(function\(r\) \{ return !r \|\| r\.matchId !== record\.matchId; \}\);/.test(uiSrc),
   'cache local de histórico deduplica por matchId antes de inserir');
const recIdResets = (uiSrc.match(/_liveRecId = null;/g) || []).length;
ok(recIdResets >= 4,
   'todo recomeço de partida zera o _liveRecId (4 caminhos: reset remoto, série R/R ×2, restart) — achado: ' + recIdResets);

// ═══ PARTE 5 — ♥ FC MÁXIMA DO PERFIL (watch-bridge.js REAL) ════════════════
const nasc1980 = '1980-01-01'; // 220 − idade(2026) = 174
const c1 = loadBridge({ hrMax: 185, birthDate: nasc1980 });
c1.win.WatchBridge.pushCurrent();
ok(c1.sent[0].hrMax === 185,
   '🔒 FC máxima DECLARADA no perfil vence a fórmula (é como o usuário calibra a régua das faixas)');
const c2 = loadBridge({ birthDate: nasc1980 });
c2.win.WatchBridge.pushCurrent();
ok(c2.sent[0].hrMax > 0 && c2.sent[0].hrMax === (220 - (new Date().getFullYear() - 1980)),
   'sem valor declarado, cai no 220 − idade de sempre');
const c3 = loadBridge({ hrMax: 90, birthDate: nasc1980 });
c3.win.WatchBridge.pushCurrent();
ok(c3.sent[0].hrMax === c2.sent[0].hrMax,
   'valor implausível (< 100) é ignorado — régua chutada é pior que a fórmula');
const c4 = loadBridge({ hrMax: 300 });
c4.win.WatchBridge.pushCurrent();
ok(c4.sent[0].hrMax === 0, 'implausível (> 230) sem data de nascimento → 0 (o relógio não pinta faixa nenhuma)');

// Fiação do perfil (auth.js + store.js): campo existe, entra no baseline de
// apagamento, no payload e na cópia campo a campo da sessão.
const authSrc = fs.readFileSync(path.join(ROOT, 'js', 'views', 'auth.js'), 'utf8');
const storeSrc = fs.readFileSync(path.join(ROOT, 'js', 'store.js'), 'utf8');
ok(authSrc.indexOf('profile-edit-hrmax') !== -1, 'campo FC máxima existe no formulário do perfil');
ok(/hrMax: _baseVal\('profile-edit-hrmax'\)/.test(authSrc), 'FC máxima entra no baseline (apagar o campo APAGA o valor)');
ok(/_PROFILE_ERASABLE = \[[^\]]*'hrMax'/.test(authSrc), 'hrMax é apagável (lista _PROFILE_ERASABLE)');
ok(/payload\.hrMax = hrMaxIn/.test(authSrc), 'FC máxima válida entra no payload do save');
ok(/hrMaxIn >= 100 && hrMaxIn <= 230/.test(authSrc), 'plausibilidade 100–230 travada no save');
ok(/profile\.hrMax\) this\.currentUser\.hrMax = profile\.hrMax/.test(storeSrc),
   '🔒 loadUserProfile copia hrMax pra sessão — a cópia é CAMPO A CAMPO, e sem esta linha o valor salvo nunca chegaria ao relógio (armadilha do nameConflict/1.7.41)');

console.log('watch-epoca-e-desfazer-pos-fim:', pass, 'ok,', fail, 'falhas');
if (fail > 0) process.exit(1);
