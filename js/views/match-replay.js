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

  /* ── CASUAL: o replay sai do PRÓPRIO doc da partida ────────────────────────────
   * Os cards de "Últimas Partidas" (bracket-ui `_casualLoadLastMatches`) trazem o doc
   * de `casualMatches` inteiro, e é dele que a reprodução nasce — não do `matchHistory`.
   * A razão é MEDIDA (28/ago/2026, base real): das 15 partidas casuais em produção,
   * **13 têm `liveState.pointLog`** e **ZERO tem o campo `replay`** no topo. O `replay`
   * compacto só é gravado no `matchHistory` (que é do jogador e obedece ao
   * `statsVisibility`), enquanto o doc casual — legível por qualquer um — guarda o
   * diário CRU dentro do `liveState`. Ler daqui é o que faz a reprodução valer também
   * pra quem só assistiu.
   *
   * ⚠️ OS DOIS DIÁRIOS TÊM FORMATOS DIFERENTES, e é só por isso que esta função existe:
   *     cru (liveState.pointLog) : team, serverTeam, p1Before, p2Before, isTiebreak, t
   *     compacto (replay.points) : w,    sv,         a,        b,        tb,         t
   * O motor só sabe ler o compacto. Traduzir AQUI — em vez de afrouxar o motor pra
   * aceitar dois formatos — mantém um formato só do lado de quem reproduz.
   *
   * ⭐ `g1`/`g2`/`si` são a TESTEMUNHA que `_replayConfere` usa pra saber se o motor
   * está onde o registro diz que a partida estava, e só existem nos diários novos:
   * medido, 274 dos 670 pontos em produção os têm. Saem como `null` e não como 0 —
   * `0` afirmaria "estava 0-0", `null` diz "não sei", e o motor trata os dois
   * diferente (com `null` a conferência devolve true e o replay roda sem a rede).
   *
   * ⛔ `truncated: false` é AFIRMAÇÃO, não preguiça: o corte de 600 pontos existe só
   * dentro de `_buildReplayPayload` (que monta o registro do matchHistory). O
   * `liveState` do doc casual é gravado inteiro — conferido, nenhum `slice` no caminho
   * de escrita.
   *
   * Devolve `null` quando não há diário; quem chama decide o que fazer com isso.
   */
  window._replayRecordFromCasualDoc = function (m) {
    if (!m) return null;
    var ls = m.liveState || {};
    var pts = Array.isArray(ls.pointLog) ? ls.pointLog : [];
    if (!pts.length) return null;
    var sc = m.scoring || {};
    // A ordem de saque como ela FICOU. Partida jogada sem marcar sacador reproduz sem
    // sacador — `serveSkipped` é estado válido, não ausência de dado.
    var so = (ls.serveSkipped || !Array.isArray(ls.serveOrder) || !ls.serveOrder.length)
      ? null
      : ls.serveOrder.map(function (s) { return { t: s.team, n: s.name || null }; });
    return {
      matchId: m._docId || m.roomCode || null,
      matchType: 'casual',
      sport: m.sport || '',
      tournamentName: null,
      players: Array.isArray(m.players) ? m.players : [],
      sets: Array.isArray(ls.sets) ? ls.sets : [],
      replay: {
        v: 2,
        truncated: false,
        totalPoints: pts.length,
        useSets: sc.type === 'sets',
        isFixedSet: !!sc.fixedSet,
        countingType: sc.countingType || null,
        // A regra vai CRUA do doc, `tieRule:'ask'` incluído. Resolver aqui seria
        // decidir por quem jogou: no 5-5 quem responde é o próprio diário, pelo `tb`
        // do ponto seguinte (`_replayAnswerTie`, bracket-ui.js).
        scoring: sc,
        so: so,
        serveSkipped: !!ls.serveSkipped,
        points: pts.map(function (p) {
          return {
            w: p.team === 2 ? 2 : 1,
            a: p.p1Before != null ? p.p1Before : 0,
            b: p.p2Before != null ? p.p2Before : 0,
            g1: p.g1 != null ? p.g1 : null,
            g2: p.g2 != null ? p.g2 : null,
            si: p.si != null ? p.si : 0,
            tb: p.isTiebreak ? 1 : 0,
            sv: p.serverTeam || null,
            t: p.t || null
          };
        })
      }
    };
  };

  // Abre a reprodução de uma partida casual a partir do doc. Devolve `false` quando
  // não há diário — quem chama cai no caminho antigo (a tela de estatísticas), que
  // segue valendo pras 2 partidas em produção sem `pointLog`.
  window._openCasualMatchReplay = function (m) {
    var rec = window._replayRecordFromCasualDoc(m);
    if (!rec) return false;
    _abrir(rec);
    return true;
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
