// Ponte relógio ↔ celular (fase 4) — lado JS, fonte única de verdade.
// Contrato em docs/smartwatch-bridge.md. Arquitetura Opção A: o relógio é burro;
// aqui é onde a intenção (+1 / desfazer) dirige o motor GSM real do placar ao
// vivo (bracket-ui.js) e o estado resultante é empurrado de volta pro relógio.
//
// INERTE NA WEB: se não estamos num app nativo (Capacitor), o módulo faz
// early-return e NÃO define window.WatchBridge — então o gancho _watchNotify no
// motor (bracket-ui.js) vira no-op de custo zero. Zero efeito no placar do
// navegador. Só "liga" no app iOS/Android.
(function () {
  'use strict';

  var isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform
    && window.Capacitor.isNativePlatform());
  if (!isNative) return;

  var seq = 0;
  var subscribers = [];
  var lastBody = null;      // último snapshot enviado (sem seq) pra dedup
  var seenIntents = {};     // dedup de intenções por id
  var seenCount = 0;

  function plugin() {
    return (window.Capacitor && window.Capacitor.Plugins
      && window.Capacitor.Plugins.ScoreplaceWatch) || null;
  }

  function inactiveState() {
    return { v: 1, type: 'state', active: false, isFinished: false, winner: null };
  }

  // Estado atual do motor, indexado por TIME (1/2). Se não há partida ao vivo
  // aberta, window._getLiveScoreState não existe → snapshot inativo.
  function currentState() {
    if (typeof window._getLiveScoreState === 'function') {
      try { return window._getLiveScoreState(); } catch (e) {}
    }
    return inactiveState();
  }

  // Empurra um snapshot pro relógio (via plugin) + assinantes locais.
  // Dedup pelo corpo (sem seq) pra não spammar snapshots idênticos; `force`
  // ignora o dedup (usado na resposta a "hello").
  function push(snapshot, force) {
    if (!snapshot) snapshot = currentState();
    var body = JSON.stringify(snapshot);
    if (!force && body === lastBody) return;
    lastBody = body;
    snapshot.seq = ++seq;
    var p = plugin();
    if (p && p.sendState) {
      try { p.sendState({ snapshot: snapshot }); } catch (e) {}
    }
    for (var i = 0; i < subscribers.length; i++) {
      try { subscribers[i](snapshot); } catch (e) {}
    }
  }

  // Recebe uma intenção do relógio e dirige o motor GSM (nunca duplica regra).
  function applyIntent(intent) {
    if (!intent || typeof intent !== 'object') return;
    if (intent.id) {
      if (seenIntents[intent.id]) return;
      seenIntents[intent.id] = 1;
      if (++seenCount > 500) { seenIntents = {}; seenCount = 0; } // bound
    }
    switch (intent.type) {
      case 'point':
        if ((intent.team === 1 || intent.team === 2)
            && typeof window._liveScorePoint === 'function') {
          window._liveScorePoint(intent.team);
        }
        break;
      case 'undo':
        if (typeof window._liveScoreUndoLastPoint === 'function') {
          window._liveScoreUndoLastPoint();
        }
        break;
      case 'hello':
        push(currentState(), true); // sempre responde, mesmo se igual
        return;
      default:
        return;
    }
    // point/undo já chamam _watchNotify no motor (→ push). Reforço defensivo
    // caso algum caminho não notifique; o dedup evita envio duplicado.
    push(currentState());
  }

  window.WatchBridge = {
    _onEngineState: function (snapshot) { push(snapshot); }, // chamado pelo motor
    applyIntent: applyIntent,
    currentState: currentState,
    pushCurrent: function () { push(currentState(), true); },
    pushInactive: function () { push(inactiveState(), true); }, // placar fechou
    onState: function (cb) { if (typeof cb === 'function') subscribers.push(cb); }
  };

  // Intenções vindas do plugin nativo (quando ele existir). Guardado: o plugin
  // ScoreplaceWatch será adicionado no próximo commit; até lá isto é inerte.
  var p = plugin();
  if (p && p.addListener) {
    try {
      p.addListener('watchIntent', function (ev) {
        applyIntent(ev && ev.intent ? ev.intent : ev);
      });
    } catch (e) {}
  }
})();
