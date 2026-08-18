/* AO VIVO AGORA — quem está com o placar ao vivo aberto, e quem quiser, assiste.
 *
 * Pedido do dono (18/ago/2026): uma seção logo abaixo da hero box da dashboard que só
 * existe quando ALGUÉM está com o placar ao vivo rodando (casual ou torneio); clicar
 * ASSISTE (nunca edita); qualquer pessoa pode assistir; ao fim, mostra as estatísticas
 * do jogo que ela acabou de acompanhar; placar de torneio em que a pessoa joga — ou de
 * amigo — vem no TOPO; sem nenhum placar ao vivo, a seção some. A MESMA seção vai no topo
 * da chave do torneio. E quem não quiser recebe nada disso desliga no perfil.
 *
 * ── POR QUE UMA COLEÇÃO NOVA (`liveScores`) ────────────────────────────────────────
 * O placar ao vivo já sincroniza em tempo real, mas SÓ no casual: a sala
 * (`casualMatches/{id}.liveState`) é escrita a cada 300ms e os convidados leem por
 * onSnapshot. Em TORNEIO o estado é local — some quando a aba fecha, e ninguém de fora
 * vê nada. Além disso, "o que está ao vivo AGORA" é uma pergunta de LISTA, e listar
 * salas casuais não responderia por torneio.
 * Então existe um doc por partida ao vivo, com o mínimo pra desenhar e ranquear:
 *   liveScores/{id} = { kind, status, tournamentId, tournamentName, matchId, title,
 *                       sport, p1Players[], p2Players[], playerUids[], scoring,
 *                       state (o mesmo _serializeState do placar), createdBy,
 *                       startedAt, lastActivityAt, finishedAt }
 * O id é DETERMINÍSTICO (`t_<torneio>_<jogo>` / `casual_<sala>`): reabrir o mesmo jogo
 * atualiza o mesmo doc em vez de criar um fantasma por reabertura.
 *
 * ⚠️ A CONSULTA É DE UM CAMPO SÓ (`status == 'live'`), de propósito: `where` + `orderBy`
 * em campos diferentes exige índice composto, e ordenar 20 documentos no cliente custa
 * nada. Ver [[feedback_firestore_composite_query_pattern]].
 *
 * ⚠️ QUEM FECHA A ABA NO MEIO não escreve `finished`. Por isso "ao vivo" também exige
 * SINAL RECENTE (`lastActivityAt`): sem batida por _LIVE_STALE_MS, o jogo sai da lista
 * sozinho, sem depender de faxina no servidor.
 */
(function () {
  'use strict';

  var COL = 'liveScores';
  // ── QUANTO TEMPO SEM SINAL AINDA É "AO VIVO" (1.9.37) ─────────────────────────
  // Eram 3 min e o dono cortou: _"3min para sumir é tempo demais"_. O piso não é
  // estético — é o HEARTBEAT: se a janela fosse menor que a batida, um jogo em
  // andamento piscaria pra fora da lista entre uma batida e outra. Com batida de 20s,
  // 60s tolera DUAS perdidas (rede de quadra cai) e ainda tira o jogo em ~1 min de quem
  // fechou o app no meio. Mexer num sem mexer no outro quebra essa relação.
  window._LIVE_STALE_MS = 60 * 1000;
  var HEARTBEAT_MS = 20 * 1000;

  function _db() {
    return (window.FirestoreDB && window.FirestoreDB.db) || null;
  }
  function _uid() {
    var cu = window.AppStore && window.AppStore.currentUser;
    return (cu && cu.uid) || '';
  }
  function _esc(s) { return window._safeHtml ? window._safeHtml(s) : String(s == null ? '' : s); }
  function _jsEsc(s) { return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

  // ── ID DETERMINÍSTICO ──────────────────────────────────────────────────────────
  // Firestore não aceita "/" no id do documento, e id de jogo/torneio pode trazer
  // qualquer coisa — normaliza pra [A-Za-z0-9_-].
  window._liveNowId = function (kind, a, b) {
    var limpa = function (x) { return String(x == null ? '' : x).replace(/[^A-Za-z0-9_-]/g, '_'); };
    return kind === 'casual' ? ('casual_' + limpa(a)) : ('t_' + limpa(a) + '__' + limpa(b));
  };

  // ── PUBLICAR / ATUALIZAR / ENCERRAR ────────────────────────────────────────────
  // `info` traz o cabeçalho (torneio, nomes, uids, config de pontuação) e `state` o
  // placar. Merge sempre: o cabeçalho é escrito uma vez e o estado muitas.
  window._liveNowPublish = function (info) {
    var db = _db();
    if (!db || !info || !info.id) return Promise.resolve(null);
    var doc = {
      kind: info.kind || 'casual',
      status: 'live',
      tournamentId: info.tournamentId || '',
      tournamentName: info.tournamentName || '',
      matchId: info.matchId || '',
      title: info.title || '',
      sport: info.sport || '',
      p1Players: Array.isArray(info.p1Players) ? info.p1Players.slice(0, 4) : [],
      p2Players: Array.isArray(info.p2Players) ? info.p2Players.slice(0, 4) : [],
      playerUids: Array.isArray(info.playerUids) ? info.playerUids.filter(Boolean).slice(0, 8) : [],
      // ── QUEM PODE ASSISTIR (1.9.37) ──────────────────────────────────────────
      // Ordem do dono: _"respeita os privados que mostram apenas para os
      // participantes"_. `audience` é a LISTA de quem enxerga: `'*'` = qualquer um
      // (torneio público e partida casual); torneio privado = os uids do torneio.
      // ⚠️ Mora no DOC, não num `if` de tela: é ela que a REGRA do Firestore lê e é
      // por ela que a consulta filtra — filtrar só no cliente deixaria o doc legível
      // por quem soubesse o id, que é o oposto de privado.
      audience: Array.isArray(info.audience) && info.audience.length ? info.audience.slice(0, 400) : ['*'],
      scoring: info.scoring || null,
      createdBy: _uid(),
      startedAt: info.startedAt || Date.now(),
      lastActivityAt: Date.now()
    };
    if (info.state) doc.state = info.state;
    return db.collection(COL).doc(info.id).set(doc, { merge: true })
      .then(function () { return info.id; })
      .catch(function (e) { if (window._warn) window._warn('[ao vivo] publish', e); return null; });
  };

  window._liveNowTouch = function (id, state) {
    var db = _db();
    if (!db || !id) return Promise.resolve();
    var patch = { lastActivityAt: Date.now(), status: 'live' };
    if (state) patch.state = state;
    return db.collection(COL).doc(id).set(patch, { merge: true }).catch(function () {});
  };

  window._liveNowFinish = function (id, state) {
    var db = _db();
    if (!db || !id) return Promise.resolve();
    var patch = { status: 'finished', finishedAt: Date.now(), lastActivityAt: Date.now() };
    if (state) patch.state = state;
    // ⚠️ NÃO apaga o doc: quem está assistindo precisa ver as ESTATÍSTICAS do jogo que
    // acabou de acompanhar (pedido do dono). A faxina é por tempo, não por evento.
    return db.collection(COL).doc(id).set(patch, { merge: true }).catch(function () {});
  };

  // Heartbeat: enquanto o placar está aberto, renova o sinal mesmo sem ponto novo
  // (game parado, intervalo, discussão de regra). Sem isso um set longo sumiria da lista.
  window._liveNowHeartbeat = function (id) {
    window._liveNowStopHeartbeat();
    if (!id) return;
    window.__liveHb = setInterval(function () { window._liveNowTouch(id, null); }, HEARTBEAT_MS);
  };
  window._liveNowStopHeartbeat = function () {
    if (window.__liveHb) { try { clearInterval(window.__liveHb); } catch (e) {} window.__liveHb = null; }
  };

  // ── É UM PLACAR VIVO DE VERDADE? ───────────────────────────────────────────────
  window._liveNowIsFresh = function (d, agora) {
    if (!d || d.status !== 'live') return false;
    var t = d.lastActivityAt || d.startedAt || 0;
    return (( agora || Date.now()) - t) < window._LIVE_STALE_MS;
  };

  // ── ORDEM: MEU TORNEIO E AMIGO PRIMEIRO ────────────────────────────────────────
  // Regra do dono: "placares ao vivo de torneios em que a pessoa participa ou de amigos
  // aparecem no topo". Peso, do mais forte pro mais fraco: jogo do próprio usuário →
  // torneio em que ele está inscrito → tem amigo em quadra → o resto. Empate: mais
  // recente primeiro.
  window._liveNowRank = function (lista) {
    var meu = _uid();
    var cu = (window.AppStore && window.AppStore.currentUser) || {};
    var amigos = {};
    (Array.isArray(cu.friends) ? cu.friends : []).forEach(function (f) {
      var u = (typeof f === 'string') ? f : (f && (f.uid || f.id));
      if (u) amigos[u] = 1;
    });
    var meusTorneios = {};
    var tours = (window.AppStore && window.AppStore.tournaments) || [];
    tours.forEach(function (t) {
      if (!t || !t.id) return;
      var uids = (typeof window._participantUidsAll === 'function') ? window._participantUidsAll(t) : null;
      if (!uids && Array.isArray(t.memberUids)) uids = t.memberUids;
      if (meu && Array.isArray(uids) && uids.indexOf(meu) !== -1) meusTorneios[String(t.id)] = 1;
      else if (meu && t.creatorUid === meu) meusTorneios[String(t.id)] = 1;
    });
    return (lista || []).map(function (d) {
      var uids = Array.isArray(d.playerUids) ? d.playerUids : [];
      var peso = 0;
      if (meu && uids.indexOf(meu) !== -1) peso = 4;                       // eu estou jogando
      else if (d.tournamentId && meusTorneios[String(d.tournamentId)]) peso = 3;  // meu torneio
      else if (uids.some(function (u) { return amigos[u]; })) peso = 2;    // amigo em quadra
      return { d: d, peso: peso };
    }).sort(function (a, b) {
      if (a.peso !== b.peso) return b.peso - a.peso;
      return (b.d.lastActivityAt || 0) - (a.d.lastActivityAt || 0);
    }).map(function (x) { return Object.assign({}, x.d, { _peso: x.peso }); });
  };

  // ── ASSINATURA ────────────────────────────────────────────────────────────────
  // `cb(lista)` recebe a lista JÁ ranqueada e sem os vencidos. Devolve a função de
  // desinscrever. `opts.tournamentId` limita à chave de um torneio (topo do bracket).
  window._liveNowSubscribe = function (cb, opts) {
    var db = _db();
    if (!db || typeof cb !== 'function') return function () {};
    opts = opts || {};
    // A consulta pede SÓ o que a regra deixaria ler — em Firestore, regra não filtra:
    // se um único doc da resposta fosse proibido, a consulta INTEIRA falharia.
    var _eu = _uid();
    var _plateia = _eu ? ['*', _eu] : ['*'];
    var q = db.collection(COL).where('status', '==', 'live')
      .where('audience', 'array-contains-any', _plateia).limit(30);
    try {
      return q.onSnapshot(function (snap) {
        var agora = Date.now(), out = [];
        snap.forEach(function (doc) {
          var d = Object.assign({ id: doc.id }, doc.data() || {});
          if (!window._liveNowIsFresh(d, agora)) return;
          if (opts.tournamentId && String(d.tournamentId) !== String(opts.tournamentId)) return;
          out.push(d);
        });
        cb(window._liveNowRank(out));
      }, function (e) { if (window._warn) window._warn('[ao vivo] subscribe', e); cb([]); });
    } catch (e) {
      if (window._warn) window._warn('[ao vivo] subscribe', e);
      return function () {};
    }
  };

  // ── O CARTÃO DE CADA JOGO ─────────────────────────────────────────────────────
  function _placarCurto(d) {
    var st = (d && d.state) || {};
    var sets = Array.isArray(st.sets) ? st.sets : [];
    var fech = sets.filter(function (s) { return s && (s.p1 != null || s.p2 != null); })
      .map(function (s) { return (s.p1 || 0) + '-' + (s.p2 || 0); });
    var atual = (st.currentGameP1 != null || st.currentGameP2 != null)
      ? ((st.currentGameP1 || 0) + '-' + (st.currentGameP2 || 0)) : '';
    var partes = fech.slice();
    if (atual && !st.isFinished) partes.push(atual);
    return partes.join(' · ') || '0-0';
  }
  function _timeLabel(arr) {
    var nomes = (Array.isArray(arr) ? arr : []).filter(Boolean);
    return nomes.length ? nomes.join(' / ') : '—';
  }
  function _minutos(d) {
    var st = (d && d.state) || {};
    var ini = st.matchStartTime || d.startedAt;
    var fim = st.matchEndTime || d.finishedAt || Date.now();
    if (!ini) return '';
    var min = Math.max(0, Math.round((fim - ini) / 60000));
    return min + ' min';
  }

  // ── O CARTÃO: A MESMA GRAMÁTICA DO CARD DE JOGO DA CHAVE ─────────────────────
  // Ordem do dono: "faça isso se parecer mais com a chave do torneio". Então o cartão
  // não inventa layout — copia o do `renderMatchCard`: cabeçalho com o rótulo do jogo em
  // azul-claro maiúsculo e uma linha divisória, as duas LINHAS de time (fundo próprio,
  // borda de 3px à esquerda, nome à esquerda e placar à direita), o "VS" no meio e um
  // chip de ação no rodapé. O que muda é o que o card da chave não tem: a borda vermelha
  // de AO VIVO, o ponto pulsando e o placar do game corrente.
  function _linhaTime(nomes, sets, ponto, sacando, cor) {
    var fundo = sacando ? 'rgba(239,68,68,0.14)' : 'rgba(0,0,0,0.20)';
    var borda = sacando ? cor : 'rgba(255,255,255,0.08)';
    var chips = (sets || []).map(function (v) {
      return '<span style="display:inline-block;min-width:17px;text-align:center;font-family:ui-monospace,Menlo,monospace;' +
             'font-size:0.72rem;font-weight:700;color:var(--text-main);background:rgba(255,255,255,0.06);' +
             'border-radius:4px;padding:1px 3px;margin-left:3px;">' + v + '</span>';
    }).join('');
    return '<div style="padding:8px 10px;border-radius:8px;display:flex;justify-content:space-between;align-items:center;' +
        'background:' + fundo + ';border-left:3px solid ' + borda + ';margin-bottom:2px;">' +
        '<div style="flex:1;overflow:hidden;min-width:0;font-size:0.8rem;font-weight:600;color:var(--text-bright);' +
          'white-space:nowrap;text-overflow:ellipsis;">' + (sacando ? '🎾 ' : '') + _esc(_timeLabel(nomes)) + '</div>' +
        '<div style="display:flex;align-items:center;flex-shrink:0;gap:2px;">' + chips +
          '<span style="min-width:30px;text-align:center;font-family:ui-monospace,Menlo,monospace;font-size:0.95rem;' +
            'font-weight:800;color:' + (sacando ? cor : 'var(--text-bright)') + ';margin-left:5px;">' + ponto + '</span>' +
        '</div>' +
      '</div>';
  }

  // sets fechados de cada lado + ponto do game corrente + quem saca
  function _leituraPlacar(d) {
    var st = (d && d.state) || {};
    var sets = (Array.isArray(st.sets) ? st.sets : []).filter(function (x) { return x && (x.p1 != null || x.p2 != null); });
    var srv = null;
    if (Array.isArray(st.serveOrder) && st.serveOrder.length) {
      srv = st.serveOrder[(st.totalGamesPlayed || 0) % st.serveOrder.length] || null;
    }
    return {
      s1: sets.map(function (x) { return x.p1 || 0; }),
      s2: sets.map(function (x) { return x.p2 || 0; }),
      pt1: st.currentGameP1 == null ? 0 : st.currentGameP1,
      pt2: st.currentGameP2 == null ? 0 : st.currentGameP2,
      saca: srv ? srv.team : 0,
      fim: !!st.isFinished
    };
  }

  window._liveNowCardHtml = function (d) {
    var l = _leituraPlacar(d);
    var badge = d._peso >= 4 ? '<span style="font-size:0.56rem;font-weight:800;letter-spacing:0.02em;background:rgba(34,211,238,0.22);color:#a5f3fc;padding:1px 6px;border-radius:5px;">VOCÊ JOGA</span>'
      : d._peso === 3 ? '<span style="font-size:0.56rem;font-weight:800;letter-spacing:0.02em;background:rgba(99,102,241,0.22);color:#c7d2fe;padding:1px 6px;border-radius:5px;">SEU TORNEIO</span>'
      : d._peso === 2 ? '<span style="font-size:0.56rem;font-weight:800;letter-spacing:0.02em;background:rgba(16,185,129,0.2);color:#6ee7b7;padding:1px 6px;border-radius:5px;">AMIGO</span>'
      : '';
    // o rótulo do jogo ocupa o lugar exato do "JOGO N · GRUPO X" do card da chave
    var rotulo = d.kind === 'tournament'
      ? (d.title || 'Jogo') : 'Partida casual';
    var sub = d.kind === 'tournament' ? (d.tournamentName || '') : (d.title || '');
    return '' +
      '<div onclick="window._openLiveSpectator(\'' + _jsEsc(d.id) + '\')" ' +
        'style="background:var(--bg-card);border:2px solid rgba(239,68,68,0.55);border-radius:12px;padding:14px;cursor:pointer;' +
        'box-shadow:0 0 16px rgba(239,68,68,0.18),0 4px 12px rgba(0,0,0,0.15);">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap;' +
          'margin-bottom:10px;border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:5px;">' +
          '<div style="display:flex;flex-direction:column;gap:3px;align-items:flex-start;min-width:0;">' +
            '<span style="font-size:0.7rem;font-weight:700;color:#38bdf8;text-transform:uppercase;">' + _esc(rotulo) + '</span>' +
            (sub ? '<span style="font-size:0.6rem;color:var(--text-muted);line-height:1.3;overflow:hidden;text-overflow:ellipsis;">' + _esc(sub) + '</span>' : '') +
          '</div>' +
          '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;flex-shrink:0;margin-left:auto;">' +
            '<span style="display:inline-flex;align-items:center;gap:4px;font-size:0.56rem;font-weight:800;' +
              'color:#f87171;text-transform:uppercase;letter-spacing:0.02em;">' +
              '<span class="sp-live-dot" style="width:7px;height:7px;border-radius:50%;background:#ef4444;display:inline-block;"></span>AO VIVO</span>' +
            badge +
            '<span style="font-size:0.56rem;color:var(--text-muted);">' + _esc(_minutos(d)) + '</span>' +
          '</div>' +
        '</div>' +
        _linhaTime(d.p1Players, l.s1, l.pt1, l.saca === 1, '#ef4444') +
        '<div style="text-align:center;font-size:0.65rem;color:var(--text-muted);font-weight:800;letter-spacing:2px;padding:3px 0;">VS</div>' +
        _linhaTime(d.p2Players, l.s2, l.pt2, l.saca === 2, '#ef4444') +
        '<div class="btn-row" style="display:flex;justify-content:center;align-items:center;gap:6px;margin:8px 0 2px;">' +
          '<span class="btn btn-micro" style="font-size:0.72rem;background:rgba(239,68,68,0.16);color:#fca5a5;' +
            'border:1px solid rgba(239,68,68,0.4);border-radius:8px;padding:4px 12px;font-weight:700;">👀 Assistir</span>' +
        '</div>' +
      '</div>';
  };

  // ── A SEÇÃO ───────────────────────────────────────────────────────────────────
  // Mesma peça na dashboard e no topo da chave: `slotId` mudo, `opts.tournamentId`
  // limita ao torneio. Sem jogo ao vivo o slot fica VAZIO — a seção não existe.
  window._renderLiveNowInto = function (slotId, opts) {
    opts = opts || {};
    // `opts.criarSlot` = o slot ainda NÃO existe no DOM e só deve nascer se houver jogo ao
    // vivo (é o caso da chave: inserir nó no topo de um container gigante custa layout
    // inteiro, e quase sempre não haveria nada pra mostrar).
    if (!document.getElementById(slotId) && typeof opts.criarSlot !== 'function') return function () {};
    var pinta = function (lista) {
      var el = document.getElementById(slotId);
      if (!el && (!lista || !lista.length)) return;                 // nada ao vivo e nada no DOM → nem cria
      if (!el) { try { el = opts.criarSlot(); } catch (e) { return; } }
      if (!el) return;
      if (!lista || !lista.length) { el.innerHTML = ''; return; }   // sem placar ao vivo → seção omitida
      var titulo = opts.tournamentId ? 'Ao vivo agora neste torneio' : 'Ao vivo agora';
      el.innerHTML = '' +
        '<div style="margin-bottom:1.25rem;border:1px solid rgba(239,68,68,0.35);border-radius:14px;padding:12px 14px;' +
          'background:linear-gradient(180deg,rgba(239,68,68,0.10),rgba(239,68,68,0.03));box-shadow:0 0 18px rgba(239,68,68,0.10);">' +
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap;">' +
            '<span style="font-size:1rem;">🔴</span>' +
            '<span style="font-size:0.9rem;font-weight:800;color:#f87171;">' + _esc(titulo) + '</span>' +
            '<span style="font-size:0.68rem;color:var(--text-muted);">' + lista.length + ' ' + (lista.length === 1 ? 'partida' : 'partidas') + ' · toque para assistir</span>' +
          '</div>' +
          '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:8px;">' +
            lista.map(window._liveNowCardHtml).join('') +
          '</div>' +
        '</div>';
    };
    var unsub = window._liveNowSubscribe(pinta, opts);
    // o cartão mostra "há N min": re-pinta de tempos em tempos mesmo sem snapshot novo
    return unsub;
  };

  // ── ASSISTIR = A MESMA TELA DO PLACAR AO VIVO ─────────────────────────────────
  // Ordem do dono (18/ago/2026): _"se a pessoa clicar no jogo ele ve o placar ao vivo
  // sendo preenchido pelos participantes (mesma renderizacao do placar ao vivo)"_.
  // Então NÃO existe uma segunda tela de assistir — existe a MESMA, aberta em modo
  // espectador: o `_openLiveScoring` desenha tudo igual e o estado entra pelo doc
  // público em vez do toque na quadra. Quem assiste não escreve (as travas moram lá,
  // ver `_spectate` em bracket-ui.js).
  // Quando a partida encerra, a própria tela do placar mostra o resumo do jogo — com o
  // botão de REPLAY, que existe pra casual E pra torneio desde a 1.8.79 (o ponto a ponto
  // é gravado no doc do jogo justamente pra qualquer pessoa poder rever).
  window._openLiveSpectator = function (id) {
    var db = _db();
    if (!db || !id) return;
    db.collection(COL).doc(id).get().then(function (doc) {
      if (!doc.exists) {
        if (typeof showNotification === 'function') {
          showNotification('Partida encerrada', 'Este placar não está mais disponível.', 'info');
        }
        return;
      }
      var d = doc.data() || {};
      if (typeof window._openLiveScoring !== 'function') return;
      var p1 = Array.isArray(d.p1Players) ? d.p1Players : [];
      var p2 = Array.isArray(d.p2Players) ? d.p2Players : [];
      window._openLiveScoring(null, null, {
        // `casual: true` é o caminho que NÃO procura torneio/jogo na memória local —
        // quem assiste pode nem ter aquele torneio carregado. O que a tela precisa
        // (nomes, pontuação, estado) vem do doc.
        casual: true,
        spectate: true,
        liveId: id,
        scoring: d.scoring || {},
        sportName: d.sport || '',
        p1Name: p1.join('/'),
        p2Name: p2.join('/'),
        isDoubles: p1.length > 1 || p2.length > 1,
        title: (d.kind === 'tournament')
          ? ((d.tournamentName || 'Torneio') + (d.title ? (' · ' + d.title) : ''))
          : (d.title || 'Partida casual')
      });
    }).catch(function () {});
  };

  // ── CONVITE PRA ASSISTIR ──────────────────────────────────────────────────────
  // "assim que começar um placar ao vivo, dispara uma notificação para todos os
  // inscritos no torneio (mesmo que em lista de espera ou inativo ou wo)".
  // ⚠️ Vai por AQUI e não pelo `_notifyTournamentParticipants`: aquele só varre
  // `t.participants` (quem está no elenco) e o pedido inclui EXPLICITAMENTE quem está
  // fora dele — lista de espera, desativado, W.O. Ver [[project_sitout_vs_waitlist_canon]].
  // Dispara UMA vez por partida (guarda em memória + o doc já existir evita repetição).
  window._liveNowNotifyEnrolled = async function (t, info) {
    if (!t || !window.FirestoreDB || !window.FirestoreDB.db) return;
    if (window._tournamentNotificationsMuted && window._tournamentNotificationsMuted(t)) return;
    window.__liveNotified = window.__liveNotified || {};
    if (window.__liveNotified[info.id]) return;
    window.__liveNotified[info.id] = true;

    var eu = _uid();
    var uids = {};
    var add = function (u) { if (u && u !== eu) uids[u] = 1; };
    var _uidsDe = (typeof window._participantUids === 'function') ? window._participantUids : function (p) { return p && p.uid ? [p.uid] : []; };
    // elenco (inclui desativado e quem levou W.O. — eles seguem no elenco)
    (Array.isArray(t.participants) ? t.participants : []).forEach(function (p) { _uidsDe(p).forEach(add); });
    // lista de espera, nas TRÊS formas que ela assume (waitlist / standby / monarchWaitlist)
    var espera = (typeof window._getWaitlist === 'function') ? (window._getWaitlist(t) || []) : [];
    espera.forEach(function (e) { if (!e) return; if (typeof e === 'object') _uidsDe(e).forEach(add); });
    if (t.creatorUid) add(t.creatorUid);
    (Array.isArray(t.coHosts) ? t.coHosts : []).forEach(function (c) { if (c && c.status === 'active') add(c.uid); });

    var msg = (info.title ? (info.title + ' — ') : '') +
      _timeLabel(info.p1Players) + ' × ' + _timeLabel(info.p2Players) +
      ' começou agora. Toque para assistir ao vivo.';
    var nd = {
      type: 'live_score_started',
      level: 'todas',
      message: msg,
      tournamentId: String(t.id || ''),
      tournamentName: t.name || '',
      liveId: info.id
    };
    var lista = Object.keys(uids);
    for (var i = 0; i < lista.length; i++) {
      try { await window._sendUserNotification(lista[i], nd, true); } catch (e) {}
    }
  };
})();
