/* REPLAY DE PARTIDA — os TRÊS caminhos que abrem uma reprodução.
 *
 * ⚠️ ESTE ARQUIVO NÃO DESENHA NADA, E ISSO É O PONTO. Ordem do dono (19/ago/2026):
 *   _"tem que ser como o placar ao vivo, mesma apresentação, mesma mecânica, mas
 *    reproduzindo a ordem dos pontos da partida e apresentando as estatísticas da
 *    partida ao final"_.
 * Então o replay não é uma tela: é O PLACAR AO VIVO em modo reprodução. Tudo o que
 * aparece — a placa, os nomes, a bola do saque, a virada de game/set e a tela de
 * estatísticas do fim — sai de `_openLiveScoring` (bracket-ui.js), alimentado pelo
 * diário de pontos em vez do dedo. Aqui só se monta o `opts` e se abre.
 *
 * ⚠️ POR QUE ISTO ENCOLHEU DE ~350 LINHAS PRA ISTO (1.9.60): até a 1.9.59 este
 * arquivo era um overlay PRÓPRIO, com desenho próprio de placar. Duas telas
 * desenhando a mesma coisa divergem — e divergiram: a tela paralela precisava
 * ADIVINHAR, pelo placar do ponto seguinte, quando um game tinha virado, e foi essa
 * duplicação que produziu o bug corrigido na 1.9.59. Uma tela só não tem como
 * discordar de si mesma, e o replay passa a herdar de graça toda melhoria do placar.
 *
 * ⚠️ E O BUG DA TELA CHEIA (1.9.59) TAMBÉM SOME DAQUI, pelo mesmo motivo. Ele nunca
 * foi z-index: o replay usava 100060, o MAIOR valor do app, e mesmo assim ficava
 * invisível — porque quem está em tela cheia (`requestFullscreen`) faz o navegador
 * desenhar SÓ a subárvore daquele elemento, e o overlay pendurado no `body` cai fora.
 * O placar ao vivo já resolve isso pra si (é ele que ocupa a tela), então a regra
 * agora vale por construção em vez de por um `appendChild` que alguém tem de lembrar
 * de escrever certo. O invariante segue travado em
 * `tests/replay-aparece-em-tela-cheia.test.js`.
 *
 * De onde vem o dado: `bracket-ui.js` grava `record.replay` no único ponto em que o
 * registro da partida ao vivo nasce — por isso vale igual pra CASUAL e TORNEIO.
 * Partidas anteriores à v1.8.79 não têm o campo; o botão simplesmente não aparece.
 */
(function () {
  'use strict';

  // Toda reprodução abre em modo CASUAL, inclusive a de um jogo de torneio — e isso é
  // deliberado: o modo casual é o caminho genérico, que não procura torneio, não
  // carimba `startedAt` no jogo e não tem nenhum caminho de escrita na chave. O nome
  // do torneio entra como TÍTULO, então o cabeçalho continua dizendo onde a partida
  // foi jogada. (A trava de verdade contra gravar é o `if (_replay) return` no
  // `_saveResult`; isto aqui é a segunda camada — não chegar perto do caminho.)
  function _abrir(record) {
    var rep = record && record.replay;
    if (!rep || !Array.isArray(rep.points) || !rep.points.length) {
      if (window.showNotification) {
        window.showNotification('Sem replay', 'Esta partida não tem o registro ponto a ponto.', 'info');
      }
      return;
    }
    if (typeof window._openLiveScoring !== 'function') return;

    var t1 = [], t2 = [];
    (record.players || []).forEach(function (p) {
      if (!p || !p.name) return;
      (p.team === 2 ? t2 : t1).push(p.name);
    });

    window._openLiveScoring(null, null, {
      casual: true,
      replay: rep,
      // O placar de cada SET já fechado. Só é lido quando o registro veio truncado
      // (partida longa): ali o diário começa no meio e o motor precisa ser semeado
      // com os sets anteriores, senão reproduziria um placar menor que o real.
      recordSets: Array.isArray(record.sets) ? record.sets : [],
      p1Name: t1.join(' / '),
      p2Name: t2.join(' / '),
      isDoubles: t1.length > 1 || t2.length > 1,
      sportName: record.sport || '',
      // A regra da partida vem do REGISTRO (v:2). Sem ela — registro v:1, de
      // 1.8.79–1.9.59 — cai no padrão do esporte, que é de onde a partida tirou a
      // regra dela na maioria dos casos.
      scoring: rep.scoring || null,
      countingType: rep.countingType || null,
      title: record.tournamentName || record.sport || 'Partida'
    });
  }

  window._openMatchReplay = _abrir;

  // Abre o replay de um jogo de TORNEIO a partir do doc DO JOGO — o caminho que vale
  // pra QUALQUER pessoa, inclusive quem não jogou (as regras liberam a leitura do
  // subdoc pra todo autenticado, e pro público quando o torneio é público).
  window._openMatchReplayFromBracket = function (tid, matchId) {
    var t = (window.AppStore && typeof window._findTournamentById === 'function')
      ? window._findTournamentById(tid)
      : (window.AppStore && window.AppStore.tournaments || []).filter(function (x) { return String(x.id) === String(tid); })[0];
    var res = t && t._results && t._results[matchId];
    if (!res || !res.replay) {
      if (window.showNotification) window.showNotification('Sem replay', 'Este jogo não tem o registro ponto a ponto.', 'info');
      return;
    }
    var todos = (typeof window._collectAllMatches === 'function') ? window._collectAllMatches(t) : [];
    var m = null;
    for (var i = 0; i < todos.length; i++) {
      if (todos[i] && String(todos[i].id) === String(matchId)) { m = todos[i]; break; }
    }
    // Nomes: o subdoc denormaliza p1/p2 (DISPLAY_FIELDS), e o match do torneio é o
    // fallback — assim a tela funciona mesmo se um dos dois estiver defasado.
    var n1 = (res.p1 || (m && m.p1) || 'Time 1');
    var n2 = (res.p2 || (m && m.p2) || 'Time 2');
    var jogadores = [];
    String(n1).split(' / ').forEach(function (n) { jogadores.push({ name: n, team: 1 }); });
    String(n2).split(' / ').forEach(function (n) { jogadores.push({ name: n, team: 2 }); });
    _abrir({
      matchId: matchId,
      matchType: 'tournament',
      sport: (t && t.sport) || '',
      tournamentName: (t && t.name) || res.tournamentName || null,
      players: jogadores,
      sets: res.sets || [],
      replay: res.replay
    });
  };

  // Abre o replay a partir de um registro guardado por id (os cards do histórico
  // guardam só o id pra não carregar o payload inteiro em cada card).
  var _reg = {};
  window._registerMatchReplay = function (id, record) { if (id && record) _reg[id] = record; };
  window._hasMatchReplay = function (id) { return !!(_reg[id] && _reg[id].replay); };
  window._openMatchReplayById = function (id) {
    var r = _reg[id];
    if (!r) {
      if (window.showNotification) window.showNotification('Replay indisponível', 'Abra o histórico novamente.', 'info');
      return;
    }
    _abrir(r);
  };

  // Compat: o overlay próprio não existe mais, mas call sites antigos podem chamar
  // isto. Fechar uma reprodução é fechar o placar — não há uma segunda tela a remover.
  window._closeMatchReplay = function () {
    if (typeof window._liveScoreReplayExit === 'function') window._liveScoreReplayExit();
    else if (typeof window._closeLiveScoring === 'function') window._closeLiveScoring();
  };
})();
