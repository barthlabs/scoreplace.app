/* REPLAY DE PARTIDA — reproduz ponto a ponto uma partida jogada AO VIVO e, no fim,
 * mostra as estatísticas do jogo.
 *
 * Pedido do dono (16/ago/2026):
 *   "quando a partida tiver sido jogada ao vivo, temos os dados de cada ponto e tempos
 *    da partida. vamos colocar um botão replay que mostra ponto a ponto em 10 segs e
 *    depois mostra as estatísticas do jogo como mostra ao final da partida ao vivo.
 *    tanto nas partidas de torneio quanto nas partidas casuais."
 *
 * ⚠️ REPLAY É REPRODUÇÃO, NÃO PARTIDA. Ele NÃO roda o motor de pontuação: apenas
 * redesenha o que cada ponto já registrou (`record.replay.points`). Isso é decisão,
 * não atalho — se o replay recalculasse, qualquer mudança futura no motor reescreveria
 * o passado de uma partida já gravada, e a tela mostraria um placar que nunca existiu.
 * Pela mesma razão as estatísticas do fim saem de `record.stats`/`record.playerStats`,
 * que foram calculados NA HORA da partida.
 *
 * De onde vem o dado: `js/views/bracket-ui.js` grava `record.replay` no único ponto em
 * que o registro da partida ao vivo nasce — por isso vale igual pra CASUAL e TORNEIO.
 * Partidas anteriores à v1.8.79 não têm o campo; o botão simplesmente não aparece.
 *
 * Contraste: segue o cânone dos dois temas (CLAUDE.md · "CONTRASTE — regra permanente").
 * Fundo e texto por token; os tons de time são cores sólidas com texto branco, que leem
 * igual no claro e no escuro.
 */
(function () {
  'use strict';

  var DUR_MS = 10000;          // "ponto a ponto em 10 segs" — o pedido, literal
  var MIN_STEP = 90;           // piso por ponto: abaixo disso vira borrão, não replay
  var OV_ID = 'match-replay-overlay';

  var _timer = null;
  var _raf = null;

  function _esc(s) {
    return (window._safeHtml ? window._safeHtml(String(s == null ? '' : s))
      : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
      }));
  }

  // Nomes por time, na ordem em que foram gravados.
  function _teams(record) {
    var t1 = [], t2 = [];
    (record.players || []).forEach(function (p) {
      if (!p) return;
      (p.team === 2 ? t2 : t1).push(p.name || '—');
    });
    return { 1: t1.length ? t1 : ['Time 1'], 2: t2.length ? t2 : ['Time 2'] };
  }

  // Quantos sets cada lado já tinha ANTES do set `si`. Deriva de record.sets (o
  // resultado final de cada set) em vez de gravar de novo em cada ponto.
  function _setsAntes(record, si) {
    var s1 = 0, s2 = 0, sets = record.sets || [];
    for (var i = 0; i < si && i < sets.length; i++) {
      if (sets[i].gamesP1 > sets[i].gamesP2) s1++;
      else if (sets[i].gamesP2 > sets[i].gamesP1) s2++;
    }
    return [s1, s2];
  }

  // Estado VISÍVEL depois do ponto de índice i. O log guarda o placar ANTES do ponto,
  // então "depois do ponto i" = o ANTES do ponto i+1 quando ele existe no mesmo game;
  // no último ponto de um game/set o próximo já vem zerado, e é isso que faz o game
  // virar na tela — exatamente como virou na partida.
  function _quadro(record, i) {
    var pts = record.replay.points;
    var p = pts[i];
    var prox = pts[i + 1] || null;
    var cfg = {
      countingType: record.replay.countingType,
      isFixedSet: record.replay.isFixedSet,
      deuceRule: true
    };
    // placar do game depois deste ponto
    var a = p.a, b = p.b;
    if (p.w === 1) a++; else b++;
    var fechouGame = false, fechouSet = false;
    if (prox) {
      if (prox.si !== p.si) { fechouGame = true; fechouSet = true; }
      else if (prox.a === 0 && prox.b === 0 && !(p.a === 0 && p.b === 0 && a + b === 1 && false)) {
        // próximo ponto começa em 0-0 no MESMO set → o game virou
        fechouGame = (a + b) > 0;
      }
    } else {
      fechouGame = true; fechouSet = true;   // último ponto da partida
    }
    var g1 = p.g1 != null ? p.g1 : 0;
    var g2 = p.g2 != null ? p.g2 : 0;
    if (fechouGame) { if (p.w === 1) g1++; else g2++; }
    var st = _setsAntes(record, p.si || 0);
    return {
      pontoA: fechouGame ? '0' : window._formatGamePoint(a, b, !!p.tb, cfg),
      pontoB: fechouGame ? '0' : window._formatGamePoint(b, a, !!p.tb, cfg),
      games1: g1, games2: g2,
      sets1: st[0], sets2: st[1],
      marcou: p.w,
      tb: !!p.tb,
      saque: p.sv || null,
      set: (p.si || 0) + 1,
      fechouGame: fechouGame,
      fechouSet: fechouSet
    };
  }

  function _fechar() {
    if (_timer) { clearInterval(_timer); _timer = null; }
    if (_raf) { cancelAnimationFrame(_raf); _raf = null; }
    var ov = document.getElementById(OV_ID);
    if (ov) ov.remove();
  }
  window._closeMatchReplay = _fechar;

  // ── barra comparativa (mesma leitura das estatísticas do app: share-of-total,
  //    somando 100% — nunca relativa ao maior, que faz ratio normal parecer domínio)
  function _linha(rotulo, v1, v2, sufixo) {
    var n1 = Number(v1) || 0, n2 = Number(v2) || 0, tot = n1 + n2;
    var p1 = tot > 0 ? Math.round(n1 / tot * 100) : 50;
    var p2 = 100 - p1;
    return '' +
      '<div style="margin-bottom:10px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:baseline;font-size:0.72rem;color:var(--text-muted);margin-bottom:3px;">' +
          '<span style="font-weight:800;color:#3b82f6;">' + n1 + (sufixo || '') + '</span>' +
          '<span>' + _esc(rotulo) + '</span>' +
          '<span style="font-weight:800;color:#ef4444;">' + n2 + (sufixo || '') + '</span>' +
        '</div>' +
        '<div style="display:flex;height:7px;border-radius:4px;overflow:hidden;background:var(--stat-box-bg);">' +
          '<div style="width:' + p1 + '%;background:#3b82f6;"></div>' +
          '<div style="width:' + p2 + '%;background:#ef4444;"></div>' +
        '</div>' +
      '</div>';
  }

  function _ms(v) {
    if (!v && v !== 0) return '—';
    var s = Math.round(v / 1000);
    if (s < 60) return s + 's';
    return Math.floor(s / 60) + 'min' + String(s % 60).padStart(2, '0') + 's';
  }

  function _telaStats(record, times) {
    var s = record.stats || {};
    var a = s.team1 || {}, b = s.team2 || {};
    var ts = record.timeStats || null;
    var venceu = record.winnerTeam;
    var nomeVenc = venceu === 1 ? times[1].join(' / ') : (venceu === 2 ? times[2].join(' / ') : 'Empate');

    // ⚠️ Sem estatística gravada, a tela NÃO desenha barras: `_linha(0,0)` sairia como
    // 50%/50% com "0" dos dois lados, o que parece um dado medido e não é. Acontece no
    // replay aberto pela CHAVE (o doc do jogo é público, mas as estatísticas agregadas
    // moram no matchHistory de cada jogador, que é privado). Ali o fim mostra só o que
    // vale pra todo mundo: o resultado.
    var temStats = !!(record.stats && (Number(a.points) || Number(b.points) || Number(a.games) || Number(b.games)));
    var linhas = !temStats ? '' :
      _linha('Pontos', a.points, b.points) +
      _linha('Games', a.games, b.games) +
      (((a.sets || 0) + (b.sets || 0)) > 0 ? _linha('Sets', a.sets, b.sets) : '') +
      (((a.servePtsWon || 0) + (b.servePtsWon || 0)) > 0 ? _linha('Pontos no saque', a.servePtsWon, b.servePtsWon) : '') +
      (((a.receivePtsWon || 0) + (b.receivePtsWon || 0)) > 0 ? _linha('Pontos na devolução', a.receivePtsWon, b.receivePtsWon) : '') +
      (((a.breaks || 0) + (b.breaks || 0)) > 0 ? _linha('Quebras', a.breaks, b.breaks) : '') +
      (((a.longestStreak || 0) + (b.longestStreak || 0)) > 0 ? _linha('Maior sequência', a.longestStreak, b.longestStreak) : '');

    var tempo = '';
    if (ts || record.durationMs) {
      tempo = '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;">' +
        (record.durationMs ? '<div class="stat-box" style="flex-direction:column;min-width:88px;"><span style="font-size:1.05rem;font-weight:800;">' + _ms(record.durationMs) + '</span><span style="font-size:0.6rem;text-transform:uppercase;letter-spacing:1px;opacity:0.85;">Duração</span></div>' : '') +
        (ts && ts.avgPointMs ? '<div class="stat-box" style="flex-direction:column;min-width:88px;"><span style="font-size:1.05rem;font-weight:800;">' + _ms(ts.avgPointMs) + '</span><span style="font-size:0.6rem;text-transform:uppercase;letter-spacing:1px;opacity:0.85;">Ponto médio</span></div>' : '') +
        (ts && ts.longestPointMs ? '<div class="stat-box" style="flex-direction:column;min-width:88px;"><span style="font-size:1.05rem;font-weight:800;">' + _ms(ts.longestPointMs) + '</span><span style="font-size:0.6rem;text-transform:uppercase;letter-spacing:1px;opacity:0.85;">Ponto mais longo</span></div>' : '') +
        '</div>';
    }

    var truncado = record.replay && record.replay.truncated
      ? '<div style="font-size:0.68rem;color:var(--text-muted);margin-top:10px;">Partida longa: o replay mostrou os últimos ' +
        (record.replay.points.length) + ' de ' + record.replay.totalPoints + ' pontos.</div>'
      : '';

    return '' +
      '<div style="text-align:center;margin-bottom:16px;">' +
        '<div style="font-size:0.7rem;text-transform:uppercase;letter-spacing:1.5px;color:var(--text-muted);">Fim da partida</div>' +
        '<div style="font-size:1.25rem;font-weight:900;color:var(--text-bright);margin-top:4px;">🏆 ' + _esc(nomeVenc) + '</div>' +
        '<div style="font-size:1rem;font-weight:800;color:var(--text-main);margin-top:2px;font-variant-numeric:tabular-nums;">' + _esc(record.scoreSummary || '') + '</div>' +
      '</div>' +
      linhas + tempo + truncado;
  }

  function _placarHtml(q, times) {
    function lado(time, nomes, cor, ponto, games, sets) {
      var destaque = q.marcou === time;
      return '' +
        '<div style="flex:1;min-width:0;border-radius:12px;padding:10px 12px;background:' + (destaque ? cor : 'var(--stat-box-bg)') + ';transition:background 0.18s;">' +
          '<div style="font-size:0.78rem;font-weight:700;color:' + (destaque ? '#fff' : 'var(--text-main)') + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' +
            (q.saque === time ? '● ' : '') + _esc(nomes.join(' / ')) +
          '</div>' +
          // nowrap: "sets 0" quebrava pra segunda linha em tela estreita e
          // desalinhava as duas caixas — o placar tem que caber numa linha só.
          '<div style="display:flex;align-items:baseline;gap:8px;margin-top:6px;white-space:nowrap;color:' + (destaque ? '#fff' : 'var(--text-bright)') + ';">' +
            '<span style="font-size:2rem;font-weight:900;font-variant-numeric:tabular-nums;line-height:1;">' + _esc(ponto) + '</span>' +
            '<span style="font-size:0.95rem;font-weight:700;opacity:0.85;" title="games">' + games + '</span>' +
            '<span style="font-size:0.72rem;opacity:0.72;" title="sets">·&nbsp;' + sets + '</span>' +
          '</div>' +
        '</div>';
    }
    return '<div style="display:flex;gap:10px;align-items:stretch;">' +
      lado(1, times[1], '#3b82f6', q.pontoA, q.games1, q.sets1) +
      lado(2, times[2], '#ef4444', q.pontoB, q.games2, q.sets2) +
      '</div>';
  }

  window._openMatchReplay = function (record) {
    if (!record || !record.replay || !Array.isArray(record.replay.points) || !record.replay.points.length) {
      if (window.showNotification) window.showNotification('Sem replay', 'Esta partida não tem o registro ponto a ponto.', 'info');
      return;
    }
    _fechar();
    var times = _teams(record);
    var pts = record.replay.points;
    var passo = Math.max(MIN_STEP, Math.floor(DUR_MS / pts.length));

    var ov = document.createElement('div');
    ov.id = OV_ID;
    ov.style.cssText = 'position:fixed;inset:0;z-index:100060;background:var(--bg-darker);color:var(--text-main);overflow-y:auto;-webkit-overflow-scrolling:touch;';
    ov.innerHTML =
      '<div style="max-width:560px;margin:0 auto;padding:calc(env(safe-area-inset-top,0px) + 16px) 16px calc(env(safe-area-inset-bottom,0px) + 24px);">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px;">' +
          '<button class="btn btn-outline btn-sm" onclick="window._closeMatchReplay()">← Voltar</button>' +
          '<div style="font-size:0.7rem;text-transform:uppercase;letter-spacing:1.5px;color:var(--text-muted);">▶️ Replay</div>' +
          '<button class="btn btn-sm" id="mr-skip" style="background:var(--btn-secondary-bg);color:var(--btn-secondary-text);border:1px solid var(--border-color);">Pular ⏭</button>' +
        '</div>' +
        '<div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:10px;">' +
          _esc(record.sport || '') + (record.tournamentName ? ' · ' + _esc(record.tournamentName) : ' · Partida casual') +
        '</div>' +
        '<div id="mr-set" style="font-size:0.68rem;text-transform:uppercase;letter-spacing:1.2px;color:var(--text-muted);margin-bottom:6px;">&nbsp;</div>' +
        '<div id="mr-placar"></div>' +
        '<div style="height:6px;border-radius:3px;background:var(--stat-box-bg);margin-top:14px;overflow:hidden;">' +
          '<div id="mr-bar" style="height:100%;width:0%;background:var(--primary-color);transition:width 0.12s linear;"></div>' +
        '</div>' +
        '<div id="mr-conta" style="text-align:center;font-size:0.68rem;color:var(--text-muted);margin-top:6px;">&nbsp;</div>' +
        '<div id="mr-stats" style="margin-top:20px;"></div>' +
      '</div>';
    // ── O REPLAY PRECISA NASCER DENTRO DE QUEM ESTÁ EM TELA CHEIA (1.9.59) ─────
    // Relato do dono: _"clicando no botão de replay, o replay passava atrás da tela em
    // que estávamos e ficava não visível"_.
    // NÃO era z-index: 100060 é o MAIOR valor do app inteiro (conferido). É escopo de
    // RENDERIZAÇÃO. O placar ao vivo entra em tela cheia (`requestFullscreen`,
    // bracket-ui.js:3211), e o navegador desenha SÓ a subárvore do elemento em tela
    // cheia — qualquer coisa pendurada no `body` fica fora e não aparece, por maior que
    // seja a camada. Por isso aumentar z-index aqui nunca resolveria.
    // Pendurar no elemento em tela cheia (quando existe) põe o replay DENTRO do escopo
    // desenhado. Sem tela cheia, `body` segue valendo.
    var _hostReplay = document.fullscreenElement || document.webkitFullscreenElement || document.body;
    _hostReplay.appendChild(ov);

    var elPlacar = ov.querySelector('#mr-placar');
    var elBar = ov.querySelector('#mr-bar');
    var elConta = ov.querySelector('#mr-conta');
    var elSet = ov.querySelector('#mr-set');
    var elStats = ov.querySelector('#mr-stats');
    var i = 0;

    function desenhar(idx) {
      var q = _quadro(record, idx);
      elPlacar.innerHTML = _placarHtml(q, times);
      elSet.textContent = (record.sets && record.sets.length > 1 ? ('Set ' + q.set + (q.tb ? ' · tie-break' : '')) : (q.tb ? 'Tie-break' : ' '));
      var pct = Math.round((idx + 1) / pts.length * 100);
      elBar.style.width = pct + '%';
      elConta.textContent = 'ponto ' + (idx + 1) + ' de ' + pts.length;
    }

    function terminar() {
      if (_timer) { clearInterval(_timer); _timer = null; }
      desenhar(pts.length - 1);
      elBar.style.width = '100%';
      elStats.innerHTML = _telaStats(record, times);
      var sk = ov.querySelector('#mr-skip');
      if (sk) sk.style.display = 'none';
      if (typeof window._initStatsAnimation === 'function') {
        try { window._initStatsAnimation(elStats); } catch (e) {}
      }
    }

    desenhar(0);
    _timer = setInterval(function () {
      i++;
      if (i >= pts.length) { terminar(); return; }
      desenhar(i);
    }, passo);

    var skip = ov.querySelector('#mr-skip');
    if (skip) skip.addEventListener('click', terminar);
  };

  // Abre o replay de um jogo de TORNEIO a partir do doc DO JOGO — o caminho que vale
  // pra QUALQUER pessoa, inclusive quem não jogou (as regras liberam a leitura do
  // subdoc pra todo autenticado, e pro público quando o torneio é público).
  // Monta o `record` que a tela espera juntando o resultado do jogo com a estrutura
  // (nomes dos times), que vive no doc do torneio já carregado.
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
    for (var i = 0; i < todos.length; i++) { if (todos[i] && String(todos[i].id) === String(matchId)) { m = todos[i]; break; } }
    // Nomes: o subdoc denormaliza p1/p2 (DISPLAY_FIELDS), e o match do torneio é o
    // fallback — assim a tela funciona mesmo se um dos dois estiver defasado.
    var n1 = (res.p1 || (m && m.p1) || 'Time 1');
    var n2 = (res.p2 || (m && m.p2) || 'Time 2');
    var jogadores = [];
    String(n1).split(' / ').forEach(function (n) { jogadores.push({ name: n, team: 1 }); });
    String(n2).split(' / ').forEach(function (n) { jogadores.push({ name: n, team: 2 }); });
    var venc = 0;
    if (m && m.winner) venc = (String(m.winner) === String(n1)) ? 1 : 2;
    else if (res.winner) venc = (String(res.winner) === String(n1)) ? 1 : 2;
    window._openMatchReplay({
      matchId: matchId,
      matchType: 'tournament',
      sport: (t && t.sport) || '',
      tournamentName: (t && t.name) || res.tournamentName || null,
      scoreSummary: (res.scoreP1 != null && res.scoreP2 != null) ? (res.scoreP1 + ' × ' + res.scoreP2) : '',
      winnerTeam: venc,
      players: jogadores,
      sets: res.sets || [],
      // O subdoc não guarda as estatísticas agregadas (elas moram no matchHistory de
      // cada jogador, que é privado). Aqui o fim do replay mostra o que dá pra mostrar
      // pra todo mundo: o resultado. Nada é inventado.
      stats: null,
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
    if (!r) { if (window.showNotification) window.showNotification('Replay indisponível', 'Abra o histórico novamente.', 'info'); return; }
    window._openMatchReplay(r);
  };
})();
