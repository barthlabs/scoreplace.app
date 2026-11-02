/* Prévia atestada de jogos de uma fase. Nunca cria torneio editável. */
(function () {
  'use strict';
  function label(value) {
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    if (value && typeof value === 'object') {
      if (typeof value.name === 'string') return value.name;
      if (typeof value.nome === 'string') return value.nome;
    }
    return '';
  }
  function button(text, action) {
    var element = document.createElement('button');
    element.type = 'button';
    element.className = 'btn btn-outline btn-sm';
    element.textContent = text;
    element.addEventListener('click', action);
    return element;
  }
  function render(container, tournamentId, initial, isCurrent) {
    if (!container || !initial || initial.mode !== 'partial' || !initial.readOnly ||
        !initial.root || !Array.isArray(initial.root.phases) ||
        typeof isCurrent !== 'function' || !isCurrent()) return false;
    var root = initial.root;
    var frame = document.createElement('section');
    frame.className = 'container';
    frame.style.padding = '24px 16px';
    var title = document.createElement('h1');
    title.textContent = label(root.name) || 'Prévia do torneio';
    frame.appendChild(title);
    var notice = document.createElement('p');
    notice.textContent = 'Prévia somente leitura. Abra os detalhes completos para classificação, inscrições e controles.';
    frame.appendChild(notice);
    var actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin:16px 0';
    var full = function () {
      if (isCurrent()) window.location.hash = '#tournaments/' + encodeURIComponent(tournamentId);
    };
    actions.appendChild(button('Detalhes completos', full));
    for (var index = 0; index <= root.currentPhaseIndex && index < root.phases.length; index++) {
      (function (requested) {
        actions.appendChild(button('Fase ' + (requested + 1), async function () {
          if (!isCurrent()) return;
          var control = this;
          control.disabled = true;
          try {
            var result = await window.FirestoreDB.loadTournamentPhaseGames(
              tournamentId, requested, { skipFullFallback: true });
            if (!isCurrent()) return;
            if (!result || result.mode !== 'partial') { full(); return; }
            if (!paint(result)) full();
          } catch (error) {
            if (isCurrent()) full();
          } finally {
            control.disabled = false;
          }
        }));
      })(index);
    }
    frame.appendChild(actions);
    var phaseTitle = document.createElement('h2');
    frame.appendChild(phaseTitle);
    var list = document.createElement('ol');
    list.style.cssText = 'display:grid;gap:8px;padding-left:24px';
    frame.appendChild(list);
    function paint(result) {
      if (!isCurrent() || !result || result.mode !== 'partial' ||
          !Array.isArray(result.games) || result.games.length === 0) return false;
      var phase = result.phaseIndex;
      var pageRoot = result.root;
      if (!pageRoot || !Array.isArray(pageRoot.phases) ||
          !Number.isSafeInteger(phase) || phase < 0 ||
          phase >= pageRoot.phases.length) return false;
      var meta = pageRoot.phases[phase];
      phaseTitle.textContent = label(meta && (meta.name || meta.nome || meta.title)) ||
        ('Fase ' + (phase + 1));
      list.replaceChildren();
      result.games.forEach(function (envelope, offset) {
        var game = envelope && envelope.jogo || {};
        var item = document.createElement('li');
        item.className = 'card';
        item.style.padding = '12px';
        var match = document.createElement('strong');
        match.textContent = label(game.id) || ('Jogo ' + (offset + 1));
        item.appendChild(match);
        var sides = [label(game.p1 || game.team1 || game.teamA),
          label(game.p2 || game.team2 || game.teamB)];
        if (sides[0] || sides[1]) {
          var opponents = document.createElement('div');
          opponents.textContent = (sides[0] || 'A definir') + ' × ' + (sides[1] || 'A definir');
          item.appendChild(opponents);
        }
        if (game.scoreP1 !== undefined && game.scoreP2 !== undefined) {
          var score = document.createElement('div');
          score.textContent = label(game.scoreP1) + ' × ' + label(game.scoreP2);
          item.appendChild(score);
        }
        list.appendChild(item);
      });
      return true;
    }
    if (!paint(initial)) return false;
    if (!isCurrent()) return false;
    container.replaceChildren(frame);
    return true;
  }
  window.renderTournamentPhasePreview = render;
})();
