// Ordem operacional das fases por categoria. Compartilhada entre navegador e CF.
(function (root) {
  'use strict';
  function key(stage) { return String(stage.kind) + '\u0000' + String(stage.category); }
  function valid(list) {
    if (!Array.isArray(list)) return false;
    var waves = new Map(), wave = -1;
    list.forEach(function (s, i) {
      if (!s.parallel || i === 0) wave++;
      waves.set(key(s), wave);
    });
    return list.every(function (s) {
      if (s.kind !== 'elimination') return true;
      var groupWave = waves.get(key({ kind:'groups', category:s.category }));
      return groupWave === undefined || groupWave < waves.get(key(s));
    });
  }
  function stages(t) {
    var windowConfig = t && t.scheduleWindow || {};
    var blocks = windowConfig.interleavedPlan && windowConfig.interleavedPlan.blocks;
    var available = [];
    if (Array.isArray(blocks)) blocks.forEach(function (b) {
      if (!b || (b.kind !== 'groups' && b.kind !== 'elimination') || !b.category) return;
      var found = available.find(function (s) { return key(s) === key(b); });
      var when = String(b.day || windowConfig.interleavedPlan.day || '') + 'T' + String(b.startTime || '');
      if (!found) available.push({ kind:b.kind, category:String(b.category), firstTime:when });
      else if (when < found.firstTime) found.firstTime = when;
    });
    if (!available.length) return [];
    var saved = windowConfig.phaseCallOrder;
    if (Array.isArray(saved) && saved.length === available.length &&
        new Set(saved.map(key)).size === available.length &&
        saved.every(function (s) { return available.some(function (a) { return key(a) === key(s); }); }) && valid(saved)) {
      return saved.map(function (s, i) { return { kind:s.kind, category:s.category, parallel:i > 0 && s.parallel === true }; });
    }
    // A grade existente tem Diamante e Ouro simultâneos às 13h. Prata só
    // começa depois da etapa de eliminação das duas categorias.
    available.sort(function (a, b) { return a.firstTime.localeCompare(b.firstTime); });
    return available.map(function (s, i) { return { kind:s.kind, category:s.category,
      parallel:i > 0 && s.firstTime === available[i - 1].firstTime }; });
  }
  function expected(t, stage) {
    // Na grade concentrada Rei/Rainha, cada quadra de grupo contém os três
    // confrontos do quarteto; cada quadra eliminatória contém um confronto.
    var blocks = t && t.scheduleWindow && t.scheduleWindow.interleavedPlan && t.scheduleWindow.interleavedPlan.blocks || [];
    return blocks.filter(function (b) { return key(b) === key(stage); }).reduce(function (sum, b) {
      return sum + (Array.isArray(b.courts) ? b.courts.length : 0) * (stage.kind === 'groups' ? 3 : 1);
    }, 0);
  }
  function belongs(match, stage) {
    return !!match && String(match.category || '') === stage.category &&
      (Number(match.phaseIndex || 0) === 0 ? 'groups' : 'elimination') === stage.kind &&
      !match.isTieBreak;
  }
  function stageGamesDone(t, matches, stage, finished) {
    var ids = new Set();
    var games = matches.filter(function (m) {
      if (!belongs(m, stage) || m.isBye || m.isSitOut) return false;
      var id = String(m.id || '');
      if (id && ids.has(id)) return false;
      if (id) ids.add(id);
      return true;
    });
    if (games.length < expected(t, stage) || !games.every(finished)) return false;
    if (stage.kind === 'groups') {
      var decisions = t.phaseTieDecisions && t.phaseTieDecisions['0'] || {};
      if (Object.keys(decisions).some(function (id) {
        var decision = decisions[id];
        return decision && String(decision.category || '') === stage.category &&
          (decision.status === 'pending' || decision.status === 'review');
      })) return false;
    }
    return true;
  }
  function stageDone(t, matches, stage, finished) {
    if (!stageGamesDone(t, matches, stage, finished)) return false;
    if (stage.kind === 'groups') {
      var hasElimination = stages(t).some(function (s) { return s.category === stage.category && s.kind === 'elimination'; });
      if (hasElimination && !(t.phaseCategoryMaterialized && t.phaseCategoryMaterialized[stage.category])) return false;
    }
    return true;
  }
  function current(t, matches, finished) {
    var list = stages(t);
    if (!list.length) return null;
    var wave = -1;
    for (var i = 0; i < list.length; i++) {
      if (!list[i].parallel || i === 0) wave++;
      if (!stageDone(t, matches, list[i], finished)) return { wave:wave, stages:list, index:i };
    }
    return { wave:wave + 1, stages:list, index:list.length };
  }
  function covers(t, match) {
    return stages(t).some(function (s) {
      return belongs(match, s) || (match && match.isTieBreak && s.kind === 'groups' &&
        s.category === String(match.category || ''));
    });
  }
  function allowed(t, matches, match, finished) {
    var plan = t && t.scheduleWindow && t.scheduleWindow.interleavedPlan;
    if (plan && plan.editorVersion === 2 && Array.isArray(plan.blocks)) {
      var intervals = {};
      plan.blocks.forEach(function (block) {
        if (!block || !block.category) return;
        var bits = String(block.startTime || '').split(':');
        var at = Date.parse(String(block.day || plan.day || '') + 'T00:00:00Z') / 60000 +
          Number(bits[0]) * 60 + Number(bits[1]);
        if (!Number.isFinite(at)) return;
        var duration = block.kind === 'groups' ? 3 * (Number(t.gameDuration) || 30) +
          (Number(t.callTime) || 0) + (Number(t.warmupTime) || 0) : Number(plan.eliminationMinutes);
        var id = key(block), interval = intervals[id] || (intervals[id] = {
          stage:{ kind:block.kind, category:String(block.category) }, first:at, last:at + duration
        });
        interval.first = Math.min(interval.first, at);
        interval.last = Math.max(interval.last, at + duration);
      });
      var targetStage = match && { kind:Number(match.phaseIndex || 0) === 0 ? 'groups' : 'elimination',
        category:String(match.category || '') };
      var target = targetStage && intervals[key(targetStage)];
      var sequence = stages(t);
      var targetIndex = targetStage ? sequence.findIndex(function (stage) { return key(stage) === key(targetStage); }) : -1;
      if (target) return Object.keys(intervals).every(function (id) {
        var predecessor = intervals[id];
        if (targetStage.kind === 'elimination' && predecessor.stage.kind === 'groups') {
          var predecessorIndex = sequence.findIndex(function (stage) { return key(stage) === id; });
          if (predecessorIndex < targetIndex) {
            return predecessor.stage.category === targetStage.category
              ? stageDone(t, matches, predecessor.stage, finished)
              : stageGamesDone(t, matches, predecessor.stage, finished);
          }
          return true;
        }
        // Uma classificatória posterior não toma a vez das eliminatórias já
        // previstas antes dela, mesmo quando os horários da grade se sobrepõem.
        // Diamante/Ouro podem dividir quadras; Prata espera ambas terminarem.
        if (targetStage.kind === 'groups' && predecessor.stage.kind === 'elimination' &&
            sequence.findIndex(function (stage) { return key(stage) === id; }) < targetIndex)
          return stageDone(t, matches, predecessor.stage, finished);
        if (targetStage.kind === 'elimination' && predecessor.stage.kind === 'elimination') {
          var priorIndex = sequence.findIndex(function (stage) { return key(stage) === id; });
          if (priorIndex >= 0 && priorIndex < targetIndex && !sequence[targetIndex].parallel)
            return stageDone(t, matches, predecessor.stage, finished);
        }
        if (id === key(targetStage) || predecessor.first >= target.first ||
            predecessor.last > target.first) return true;
        // Só etapas que terminam antes desta começar são pré-requisitos.
        // Etapas com janelas sobrepostas dividem as quadras de propósito.
        return targetStage.kind === 'groups' && predecessor.stage.kind === 'groups'
          ? stageGamesDone(t, matches, predecessor.stage, finished)
          : stageDone(t, matches, predecessor.stage, finished);
      });
    }
    var state = current(t, matches, finished);
    if (!state) return true;
    var target = state.stages.findIndex(function (s) {
      return belongs(match, s) || (match && match.isTieBreak && s.kind === 'groups' &&
        s.category === String(match.category || ''));
    });
    if (target < 0) return true; // Outros formatos mantêm seu fluxo.
    var wave = -1;
    for (var i = 0; i <= target; i++) if (!state.stages[i].parallel || i === 0) wave++;
    return wave === state.wave;
  }
  var api = { stages:stages, current:current, allowed:allowed, covers:covers, expected:expected, key:key, valid:valid };
  root.ScoreplacePhaseCallOrder = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
