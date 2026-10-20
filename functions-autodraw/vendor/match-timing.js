// Relógio canônico da chamada para quadra. Chave e NO AR usam as mesmas
// fronteiras e mantêm a contagem do jogo ao passar para Atrasado.
(function (root) {
  'use strict';
  function config(tournament) {
    tournament = tournament || {};
    return { call: Math.max(0, Number(tournament.callTime) || 0),
      warmup: Math.max(0, Number(tournament.warmupTime) || 0),
      game: Math.max(0, Number(tournament.gameDuration) || 0) };
  }
  function phaseAt(start, timing, now) {
    timing = timing || { call: 0, warmup: 0, game: 0 };
    now = now == null ? Date.now() : now;
    var callEnd = start + timing.call * 60000;
    var warmupEnd = callEnd + timing.warmup * 60000;
    var gameEnd = warmupEnd + timing.game * 60000;
    if (!start || now < start) return { phase: 'call', transitionAt: 0, phaseStart: start };
    if (now < callEnd) return { phase: 'call', transitionAt: start, phaseStart: start };
    if (now < warmupEnd) return { phase: 'warmup', transitionAt: callEnd, phaseStart: callEnd };
    if (timing.game && now >= gameEnd) return { phase: 'overdue', transitionAt: gameEnd, phaseStart: warmupEnd };
    return { phase: 'game', transitionAt: warmupEnd, phaseStart: warmupEnd };
  }
  function elapsed(start, now) {
    now = now == null ? Date.now() : now;
    var seconds = Math.max(0, Math.floor((now - start) / 1000));
    return String(Math.floor(seconds / 3600)).padStart(2, '0') + ':' +
      String(Math.floor(seconds / 60) % 60).padStart(2, '0') + ':' +
      String(seconds % 60).padStart(2, '0');
  }
  function label(phase) {
    return { call: 'Chamado', warmup: 'Aquecimento', game: 'Tempo de jogo', overdue: 'Atrasado' }[phase];
  }
  function title(phase) {
    return { call: 'Tempo de chamada', warmup: 'Aquecimento', game: 'Tempo de jogo', overdue: 'Tempo previsto excedido' }[phase];
  }
  function text(state, now) { return label(state.phase) + ' ' + elapsed(state.phaseStart, now); }
  function adjust(start, timing, now, action) {
    var current = phaseAt(start, timing, now).phase;
    var target = current;
    if (action === 'next') {
      target = current === 'call' ? (timing.warmup ? 'warmup' : 'game')
        : current === 'warmup' ? 'game'
        : current === 'game' && timing.game ? 'overdue' : current;
    } else if (action === 'restart') {
      if (current === 'overdue') target = 'game';
    } else throw new Error('Ação do relógio inválida.');
    if (action === 'next' && target === current) return { phase: current, start: start, changed: false };
    var offsets = { call: 0, warmup: timing.call, game: timing.call + timing.warmup,
      overdue: timing.call + timing.warmup + timing.game };
    return { phase: target, start: now - offsets[target] * 60000, changed: true };
  }
  var api = { config: config, phaseAt: phaseAt, elapsed: elapsed, label: label, title: title, text: text, adjust: adjust };
  root.ScoreplaceMatchTiming = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
