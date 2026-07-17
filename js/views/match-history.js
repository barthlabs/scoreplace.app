/* scoreplace.app — match-history.js
 * HISTÓRICO DE JOGOS unificado e cronológico (mais recente no topo).
 * Une duas fontes numa lista só, com badge de origem e filtros:
 *   • 🎾 LetzPlay  — jogos importados (cu.letzplayImport.games, schema v2)
 *   • 🏆 Scoreplace — jogos do próprio app (matchHistory + casuais locais + torneios)
 *
 * Objetivo: uma vez importado o histórico do letzplay, ele VIVE aqui — o usuário
 * tudo num lugar só e não perde nada. Filtra por fonte, local,
 * torneio/competição e modalidade. Page-route #historico (padrão centralizado).
 */
(function () {
  var DAY = 86400000;

  function _esc(s) {
    return (typeof window._safeHtml === 'function')
      ? window._safeHtml(s == null ? '' : String(s))
      : String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
          return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
        });
  }

  // 'paineiras-bt' -> 'Paineiras BT'. Slug de clube do letzplay vira rótulo legível.
  function _prettyClub(slug) {
    if (!slug) return '';
    return String(slug).split(/[-_]/).map(function (w) {
      if (!w) return '';
      return (w.length <= 3) ? w.toUpperCase() : (w.charAt(0).toUpperCase() + w.slice(1));
    }).join(' ').trim();
  }

  var _PT_MON = { jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5, jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11 };

  // Melhor esforço pra transformar a data crua do letzplay em timestamp. Se falhar,
  // usa a ordem de import (idx; letzplay entrega mais recente primeiro) ancorada em
  // importedAt — jogos importados ficam ANTES da data de import (aconteceram antes).
  function _lpDateToTs(dateStr, importedAtTs, idx) {
    var fallback = (importedAtTs || Date.now()) - (idx + 1) * DAY;
    if (!dateStr) return fallback;
    var s = String(dateStr).trim();
    // ISO / formatos que o engine entende direto
    var n = Date.parse(s);
    if (!isNaN(n)) return n;
    // dd/mm/yyyy
    var m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (m) {
      var y = +m[3]; if (y < 100) y += 2000;
      var t = new Date(y, (+m[2]) - 1, +m[1]).getTime();
      if (!isNaN(t)) return t;
    }
    // "12 de jul. de 2026" / "12 jul 2026"
    var m2 = s.toLowerCase().match(/(\d{1,2}).*?\b(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\w*.*?(\d{4})/);
    if (m2 && _PT_MON[m2[2]] != null) {
      var t2 = new Date(+m2[3], _PT_MON[m2[2]], +m2[1]).getTime();
      if (!isNaN(t2)) return t2;
    }
    return fallback;
  }

  function _dateLabel(ts) {
    try {
      var d = new Date(ts);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch (e) { return ''; }
  }

  // ── Fonte 1: LetzPlay (games do import) ──────────────────────────────────────
  // O nome renderizado no card do letzplay às vezes é só inicial ("AC") ou vazio →
  // prefere o @handle (identidade real). Nome "cheio" (tem espaço, ou >3 chars e não é
  // tudo maiúscula) vence. São OS JOGOS DO USUÁRIO: ele tem direito de saber quem jogou.
  // Handle do letzplay ("AdrianoColetta", "ArnaldoMenezes1") → nome de apresentação
  // legível ("Adriano Coletta", "Arnaldo Menezes"): tira dígitos finais, troca _/. por
  // espaço, quebra camelCase e capitaliza cada palavra.
  function _prettyHandle(h) {
    h = String(h == null ? '' : h).trim();
    if (!h) return '';
    h = h.replace(/[_.]+/g, ' ').replace(/\d+$/, '');
    h = h.replace(/([a-zà-ÿ0-9])([A-ZÀ-Ý])/g, '$1 $2');
    h = h.replace(/\s+/g, ' ').trim();
    return h.split(' ').map(function (w) { return w ? (w.charAt(0).toUpperCase() + w.slice(1)) : w; }).join(' ');
  }
  function _bestPlayer(name, handle) {
    var n = (name || '').trim();
    var h = (handle || '').trim();
    var isInitials = !n || (n.length <= 3 && /^[A-Za-zÀ-ÿ.\-]+$/.test(n) && n === n.toUpperCase());
    if (!isInitials) return n;
    return _prettyHandle(h) || n || '';
  }
  function _lpTeam(names, handles) {
    var a = names || [], b = handles || [], out = [];
    for (var k = 0; k < Math.max(a.length, b.length); k++) {
      var v = _bestPlayer(a[k], b[k]);
      if (v) out.push(v);
    }
    return out.join(' / ');
  }

  // LEITURA CANÔNICA: os jogos vêm de letzplayTournaments/{comp}/matches (1 doc por
  // partida, compartilhado pelos 4 jogadores) em vez de cu.letzplayImport.games (1 doc
  // por usuário). Mesma forma de linha do _fromLetzplay — a tela não muda.
  //
  // O doc canônico é NEUTRO de perspectiva (dois times, dois placares), então aqui é onde
  // a perspectiva volta: descubro qual time é o meu pelo handle e derivo parceiro,
  // adversário e resultado. É de propósito que o "eu ganhei" não esteja gravado no doc —
  // ele é o mesmo pros 4 jogadores.
  async function _fromLetzplayCanonical(cu) {
    if (typeof window._lzHistoryRead !== 'function') return null;
    var handle = cu && cu.letzplayHandle;
    if (!handle) return null;
    var h = String(handle).toLowerCase();
    var r = await window._lzHistoryRead(h, 800);
    var matches = (r && r.matches) || [];
    if (!matches.length) return null;   // null (não []) = "sem acervo" → usa o formato antigo
    var comps = (r && r.comps) || {};
    return matches.map(function (m) {
      var meuIdx = (m.teams || []).findIndex(function (t) { return (t.handles || []).indexOf(h) >= 0; });
      if (meuIdx < 0) meuIdx = 0;
      var meu = m.teams[meuIdx] || { handles: [], names: [] };
      var outro = m.teams[1 - meuIdx] || { handles: [], names: [] };
      var pi = (meu.handles || []).findIndex(function (x) { return x !== h; });
      var comp = comps[m.comp] || {};
      var realComp = comp.name || comp.categoryRaw || '';
      var oficial = (m.kind || comp.kind) === 'tournament';
      // Data LOCAL a partir do número do calendário — nunca converter instante, senão o
      // fuso de quem lê muda o dia (o app roda em 172 países). new Date(y, m-1, d) é a
      // única forma de "07/08/25" continuar sendo 07/08 em qualquer lugar do mundo.
      var dp = window._spLzModel && window._spLzModel.dateParts(m.dateNum);
      var ts = dp ? new Date(dp.y, dp.m - 1, dp.d).getTime() : 0;
      return {
        ts: ts,
        source: 'letzplay',
        sport: m.sport || comp.sport || 'Beach Tennis',
        official: oficial,
        venue: _prettyClub(m.club || comp.club),
        competition: realComp || (oficial ? 'Torneio' : 'Ranking'),
        competitionLabel: (oficial ? 'Torneio' : 'Ranking') + (realComp ? ' · ' + realComp : ''),
        opponent: _lpTeam(outro.names, outro.handles) || '—',
        partner: (pi >= 0) ? (_bestPlayer((meu.names || [])[pi], meu.handles[pi]) || null) : null,
        result: (m.winner == null) ? '?' : (m.winner === meuIdx ? 'V' : 'D'),
        scoreA: (typeof meu.score === 'number') ? String(meu.score) : '',
        scoreB: (typeof outro.score === 'number') ? String(outro.score) : '',
        lpPartner: (pi >= 0) ? { name: (meu.names || [])[pi] || '', handle: meu.handles[pi] } : null,
        lpOpps: (outro.handles || []).map(function (hh, i) { return { name: (outro.names || [])[i] || '', handle: hh }; })
      };
    });
  }

  function _fromLetzplay(cu) {
    var imp = cu && cu.letzplayImport;
    var games = imp && Array.isArray(imp.games) ? imp.games : [];
    if (!games.length) return [];
    var importedAtTs = imp.importedAt ? (Date.parse(imp.importedAt) || null) : null;
    return games.map(function (g, i) {
      var ts = _lpDateToTs(g.date, importedAtTs, (g.idx != null ? g.idx : i));
      var opp = _lpTeam(g.oppNames, g.oppHandles);
      var partner = _bestPlayer(g.partnerName, g.partnerHandle) || null;
      var scoreA = (typeof g.myScore === 'number') ? String(g.myScore) : '';
      var scoreB = (typeof g.oppScore === 'number') ? String(g.oppScore) : '';
      var venue = _prettyClub(g.club);
      // Nome REAL do torneio quando disponível (tourneyName ou resgate via footprint);
      // rankings e imports sem nome caem na categoria.
      var realComp = (window._spGameComp ? window._spGameComp(imp, g) : (g.tourneyName || g.competition)) || '';
      var comp = (g.official ? 'Torneio' : 'Ranking') + (realComp ? ' · ' + realComp : '');
      return {
        ts: ts,
        source: 'letzplay',
        sport: g.sport || 'Beach Tennis',
        official: g.official === true,
        venue: venue,
        competition: realComp || (g.official ? 'Torneio' : 'Ranking'),
        competitionLabel: comp,
        opponent: opp || '—',
        partner: partner,
        result: (g.won === true) ? 'V' : (g.won === false ? 'D' : '?'),
        scoreA: scoreA,
        scoreB: scoreB,
        // cru pra cross-ref @→nome do scoreplace no render (corrige nomes importados)
        lpPartner: (g.partnerHandle || g.partnerName) ? { name: g.partnerName, handle: g.partnerHandle } : null,
        lpOpps: (g.oppHandles || []).map(function (h, i) { return { name: (g.oppNames || [])[i] || '', handle: h }; })
      };
    });
  }

  // ── Fonte 2: Scoreplace (matchHistory + casuais locais + torneios) ───────────
  function _resolveVenueForTournament(tournamentId) {
    if (!tournamentId) return '';
    var ts = (window.AppStore && window.AppStore.tournaments) || [];
    for (var i = 0; i < ts.length; i++) {
      if (String(ts[i].id) === String(tournamentId)) return ts[i].venue || '';
    }
    return '';
  }

  // Quebra o resumo do placar ("6–2", "2 a 1", "6-2 6-4") no par de números do
  // 1º confronto e orienta pelo resultado (vencedor fica com o maior). Um número
  // por time — pra render "placar do time na mesma linha do time".
  function _splitScore(summary, result) {
    var s = String(summary || '').trim();
    if (!s) return { a: '', b: '' };
    var m = s.match(/(\d+)\s*[–\-xX×a]\s*(\d+)/);
    if (!m) return { a: s, b: '' };
    var n1 = +m[1], n2 = +m[2];
    var hi = Math.max(n1, n2), lo = Math.min(n1, n2);
    if (result === 'V') return { a: String(hi), b: String(lo) };
    if (result === 'D') return { a: String(lo), b: String(hi) };
    return { a: String(n1), b: String(n2) };
  }

  function _scoreplaceRecordToItem(r, myUid) {
    if (!r || !Array.isArray(r.players)) return null;
    var mySlot = null;
    for (var i = 0; i < r.players.length; i++) {
      if (r.players[i] && r.players[i].uid === myUid) { mySlot = r.players[i]; break; }
    }
    if (!mySlot) return null;
    var myTeam = mySlot.team;
    var opp = [], partner = [];
    r.players.forEach(function (p) {
      if (!p) return;
      if (p.team === myTeam) { if (p.uid !== myUid) partner.push(p.name || ''); }
      else opp.push(p.name || '');
    });
    var w = r.winnerTeam;
    var result = (w === 0 || w == null) ? '?' : (w === myTeam ? 'V' : 'D');
    if (w === 0) result = 'E';
    var ts = r.finishedAt ? (Date.parse(r.finishedAt) || 0) : 0;
    var isCasual = r.matchType === 'casual';
    var comp = isCasual ? 'Partida casual' : (r.tournamentName || 'Torneio');
    return {
      ts: ts,
      source: 'scoreplace',
      sport: r.sport || '',
      official: !isCasual,
      venue: isCasual ? '' : _resolveVenueForTournament(r.tournamentId),
      competition: comp,
      competitionLabel: comp,
      opponent: opp.filter(Boolean).join(' / ') || '—',
      partner: partner.filter(Boolean).join(' / ') || null,
      result: result,
      scoreA: _splitScore(r.scoreSummary, result).a,
      scoreB: _splitScore(r.scoreSummary, result).b
    };
  }

  async function _fromScoreplace(cu) {
    var uid = cu && cu.uid;
    if (!uid) return [];
    var records = [];
    // matchHistory persistente (torneios + casuais gravados no Firestore)
    if (window.FirestoreDB && typeof window.FirestoreDB.loadUserMatchHistory === 'function') {
      try { records = await window.FirestoreDB.loadUserMatchHistory(uid) || []; } catch (e) { records = []; }
    }
    // casuais locais (podem não ter subido ao Firestore) — dedup por matchId
    try {
      var v2 = JSON.parse(localStorage.getItem('scoreplace_casual_history_v2') || '[]');
      if (Array.isArray(v2)) {
        var seen = {};
        records.forEach(function (r) { if (r && r.matchId) seen[r.matchId] = 1; });
        v2.forEach(function (r) { if (r && (!r.matchId || !seen[r.matchId])) records.push(r); });
      }
    } catch (e) {}
    var out = [];
    records.forEach(function (r) {
      var it = _scoreplaceRecordToItem(r, uid);
      if (it) out.push(it);
    });
    return out;
  }

  function _sourceBadge(source) {
    if (source === 'letzplay') {
      return '<span style="display:inline-flex;align-items:center;gap:3px;font-size:0.62rem;font-weight:800;padding:1px 7px;border-radius:999px;background:rgba(132,204,22,0.16);border:1px solid rgba(132,204,22,0.5);color:#84cc16;">🎾 LetzPlay</span>';
    }
    return '<span style="display:inline-flex;align-items:center;gap:3px;font-size:0.62rem;font-weight:800;padding:1px 7px;border-radius:999px;background:rgba(99,102,241,0.16);border:1px solid rgba(99,102,241,0.5);color:#818cf8;">🏆 Scoreplace</span>';
  }

  // Linha de um time: nomes à esquerda, placar à direita, ambos na cor do time
  // (verde vencedor / vermelho perdedor). Sem texto "Vitória/Derrota".
  function _teamRow(names, score, color) {
    return '<div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px;">' +
        '<div style="font-size:0.84rem;font-weight:700;line-height:1.3;color:' + color + ';min-width:0;overflow-wrap:anywhere;">' + names + '</div>' +
        (score !== '' ? '<div style="font-size:0.95rem;font-weight:800;white-space:nowrap;color:' + color + ';">' + _esc(score) + '</div>' : '') +
      '</div>';
  }

  // Nome de exibição de um jogador do letzplay: displayName do scoreplace se a
  // pessoa já entrou e vinculou o @, senão o nome importado.
  function _resolveLpName(x) {
    if (!x) return '';
    var fb = _bestPlayer(x.name, x.handle);
    return window._spNameForLetzplay ? window._spNameForLetzplay(x.handle, fb) : fb;
  }
  function _gameCard(it) {
    var GREEN = '#22c55e', RED = '#ef4444', NEUT = 'var(--text-bright,#fff)';
    var aWin = it.result === 'V', aLose = it.result === 'D';
    var aColor = aWin ? GREEN : (aLose ? RED : NEUT);
    var bColor = aWin ? RED : (aLose ? GREEN : NEUT);
    var partner = it.partner, opp = it.opponent;
    if (it.source === 'letzplay') {
      partner = it.lpPartner ? _resolveLpName(it.lpPartner) : null;
      var oppList = (it.lpOpps || []).map(_resolveLpName).filter(Boolean);
      opp = oppList.length ? oppList.join(' / ') : '—';
    }
    var teamA = _esc(_meName) + (partner ? ' / ' + _esc(partner) : '');
    var teamB = _esc(opp || '—');
    var meta = [];
    if (it.competitionLabel) meta.push(_esc(it.competitionLabel));
    if (it.venue) meta.push('📍 ' + _esc(it.venue));
    if (it.sport) meta.push(_esc(it.sport));
    return '' +
      '<div style="background:var(--bg-card,#1e2235);border:1px solid var(--border-color,rgba(255,255,255,0.08));border-radius:12px;padding:10px 12px;display:flex;flex-direction:column;gap:4px;">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:2px;">' +
          _sourceBadge(it.source) +
          '<div style="font-size:0.68rem;color:var(--text-muted,#94a3b8);white-space:nowrap;">' + _esc(_dateLabel(it.ts)) + '</div>' +
        '</div>' +
        _teamRow(teamA, it.scoreA != null ? it.scoreA : '', aColor) +
        _teamRow(teamB, it.scoreB != null ? it.scoreB : '', bColor) +
        (meta.length ? '<div style="font-size:0.7rem;color:var(--text-muted,#94a3b8);margin-top:4px;overflow-wrap:anywhere;">' + meta.join(' · ') + '</div>' : '') +
      '</div>';
  }

  // Estado de filtros (vive no módulo enquanto a página está aberta).
  var _all = [];
  var _meName = 'Você';   // nome do dono nos cards (seu nome real, não "Você")
  var _filters = { source: 'all', sport: '', venue: '', comp: '' };

  function _applyFilters() {
    return _all.filter(function (it) {
      if (_filters.source !== 'all' && it.source !== _filters.source) return false;
      if (_filters.sport && it.sport !== _filters.sport) return false;
      if (_filters.venue && it.venue !== _filters.venue) return false;
      if (_filters.comp && it.competition !== _filters.comp) return false;
      return true;
    });
  }

  // ── Resumo relacional ────────────────────────────────────────────────────
  // Só existe porque a partida virou doc compartilhado com os 4 jogadores identificados
  // por handle: dá pra cruzar "com quem" e "contra quem". O letzplay lista jogos; aqui o
  // histórico responde perguntas ("com quem eu ganho mais?"), que é o que o dono pediu —
  // ver tudo o que tem no letzplay, "apresentado de forma mais amigável e interessante".
  // Roda sobre as MESMAS linhas já filtradas, então acompanha o filtro ativo.
  function _tally(rows, pega) {
    var m = {};
    rows.forEach(function (r) {
      (pega(r) || []).forEach(function (p) {
        var k = (p.handle || p.name || '').toLowerCase();
        if (!k) return;
        if (!m[k]) m[k] = { handle: p.handle || '', nomes: {}, v: 0, d: 0, n: 0 };
        m[k].n++;
        if (r.result === 'V') m[k].v++; else if (r.result === 'D') m[k].d++;
        var nome = _bestPlayer(p.name, p.handle);
        if (nome) m[k].nomes[nome] = (m[k].nomes[nome] || 0) + 1;
      });
    });
    // NOME = o MAIS FREQUENTE, nunca o mais longo. O raspador às vezes cola texto vizinho
    // do card e o mesmo handle aparece com dois nomes — medido nos dados reais:
    //   joaoscassa      → "João Scassa" (maioria) e "Campos João Scassa" (poucos)
    //   douglasleonardo → "Douglas Leonardo" e "Diegues Douglas Leonardo"
    // "Mais longo vence" escolhia justamente o corrompido. O handle é a identidade; o nome
    // é exibição ruidosa, então a moda é o que resiste a captura suja.
    return Object.keys(m).map(function (k) {
      var x = m[k];
      var nome = Object.keys(x.nomes).sort(function (a, b) {
        return (x.nomes[b] - x.nomes[a]) || (a.length - b.length);   // empate → o mais curto (menos ruído colado)
      })[0] || _prettyHandle(x.handle) || k;
      return { nome: nome, v: x.v, d: x.d, n: x.n };
    })
      // Ordena por quantidade de jogos: "com quem eu mais jogo" é a pergunta natural.
      // Corte em 3 jogos — abaixo disso é ruído estatístico, não relação.
      .filter(function (x) { return x.n >= 3; })
      .sort(function (a, b) { return b.n - a.n; }).slice(0, 5);
  }
  function _pctBadge(v, n) {
    var p = n ? Math.round(v / n * 100) : 0;
    var cor = p >= 60 ? '#2dd4a0' : (p >= 40 ? '#f0b445' : '#f26a6a');
    return '<span style="color:' + cor + ';font-weight:800;font-variant-numeric:tabular-nums;">' + p + '%</span>';
  }
  function _linhasPessoas(titulo, dica, lista) {
    if (!lista.length) return '';
    return '<div style="flex:1;min-width:210px;">' +
      '<div style="font-size:0.72rem;font-weight:800;color:var(--text-muted,#94a3b8);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px;">' + _esc(titulo) + '</div>' +
      '<div style="font-size:0.68rem;color:var(--text-muted,#94a3b8);opacity:0.75;margin-bottom:6px;">' + _esc(dica) + '</div>' +
      lista.map(function (x) {
        return '<div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid var(--border-color,rgba(255,255,255,0.06));">' +
          '<span style="flex:1;font-size:0.82rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + _esc(x.nome) + '</span>' +
          '<span style="font-size:0.72rem;color:var(--text-muted,#94a3b8);font-variant-numeric:tabular-nums;">' + x.v + 'V ' + x.d + 'D</span>' +
          _pctBadge(x.v, x.n) +
        '</div>';
      }).join('') + '</div>';
  }
  function _renderResumo(rows) {
    var slot = document.getElementById('hist-resumo');
    if (!slot) return;
    // Menos de 5 jogos não tem padrão pra mostrar — só ocuparia a tela.
    if (rows.length < 5) { slot.innerHTML = ''; return; }
    var v = rows.filter(function (r) { return r.result === 'V'; }).length;
    var d = rows.filter(function (r) { return r.result === 'D'; }).length;
    var parceiros = _tally(rows, function (r) { return r.lpPartner ? [r.lpPartner] : (r.partner ? [{ name: r.partner }] : []); });
    var adversarios = _tally(rows, function (r) { return r.lpOpps || []; });
    if (!parceiros.length && !adversarios.length) { slot.innerHTML = ''; return; }
    slot.innerHTML =
      '<div style="margin-top:12px;padding:14px 16px;border-radius:12px;background:var(--bg-darker,#171a2b);border:1px solid var(--border-color,rgba(255,255,255,0.08));">' +
        '<div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:12px;">' +
          '<span style="font-weight:800;">📊 Seu retrospecto</span>' +
          '<span style="font-size:0.8rem;color:var(--text-muted,#94a3b8);">' + rows.length + ' jogos · ' + v + 'V ' + d + 'D · ' + _pctBadge(v, v + d) + ' de vitórias</span>' +
        '</div>' +
        '<div style="display:flex;gap:22px;flex-wrap:wrap;">' +
          _linhasPessoas('🤝 Com quem você mais joga', 'seu aproveitamento ao lado de cada um', parceiros) +
          _linhasPessoas('⚔️ Contra quem você mais joga', 'seu aproveitamento contra cada um', adversarios) +
        '</div>' +
      '</div>';
  }

  function _renderList() {
    var host = document.getElementById('hist-list');
    if (!host) return;
    var rows = _applyFilters();
    var countEl = document.getElementById('hist-count');
    if (countEl) countEl.textContent = rows.length + (rows.length === 1 ? ' jogo' : ' jogos');
    _renderResumo(rows);   // acompanha o filtro: o retrospecto é SEMPRE do que está na tela
    if (!rows.length) {
      host.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px 16px;color:var(--text-muted,#94a3b8);font-size:0.85rem;">Nenhum jogo com esses filtros.</div>';
      return;
    }
    host.innerHTML = rows.map(_gameCard).join('');
  }

  window._histSetFilter = function (key, val) {
    _filters[key] = val;
    // pills de fonte: refletir ativo
    if (key === 'source') {
      ['all', 'letzplay', 'scoreplace'].forEach(function (s) {
        var b = document.getElementById('hist-src-' + s);
        if (b) b.setAttribute('data-active', s === val ? '1' : '0');
      });
    }
    _renderList();
  };

  function _uniq(arr) {
    var seen = {}, out = [];
    arr.forEach(function (v) { if (v && !seen[v]) { seen[v] = 1; out.push(v); } });
    out.sort();
    return out;
  }

  function _srcPill(id, label, val, active) {
    return '<button id="hist-src-' + id + '" data-active="' + (active ? '1' : '0') + '" onclick="window._histSetFilter(\'source\',\'' + val + '\')" ' +
      'style="border:1px solid var(--border-color,rgba(255,255,255,0.15));background:var(--bg-darker,#171a2b);color:var(--text-main,#cbd5e1);border-radius:999px;padding:5px 12px;font-size:0.75rem;font-weight:700;cursor:pointer;" ' +
      'onmouseover="this.style.opacity=0.85" onmouseout="this.style.opacity=1">' + label + '</button>';
  }

  function _select(id, filterKey, placeholder, values) {
    if (!values.length) return '';
    var opts = '<option value="">' + placeholder + '</option>' + values.map(function (v) {
      return '<option value="' + _esc(v) + '">' + _esc(v) + '</option>';
    }).join('');
    return '<select onchange="window._histSetFilter(\'' + filterKey + '\', this.value)" ' +
      'style="border:1px solid var(--border-color,rgba(255,255,255,0.15));background:var(--bg-darker,#171a2b);color:var(--text-main,#cbd5e1);border-radius:8px;padding:5px 8px;font-size:0.75rem;max-width:46%;box-sizing:border-box;">' + opts + '</select>';
  }

  window._renderHistoricoPage = async function (container) {
    if (!container) container = document.getElementById('view-container');
    if (!container) return;
    var cu = window.AppStore && window.AppStore.currentUser;
    // Nome do dono nos cards — o nome real do perfil (não "Você"). São os jogos DELE.
    _meName = (cu && (cu.displayName || (cu.letzplayHandle ? '@' + cu.letzplayHandle : null) || cu.email)) || 'Você';

    var hdr = (typeof window._renderBackHeader === 'function')
      ? window._renderBackHeader({ href: '#dashboard', label: 'Voltar', middleHtml: '<span style="font-weight:700;">📜 Histórico de jogos</span>' })
      : '';

    if (!cu || !cu.uid) {
      container.innerHTML = hdr + '<div style="max-width:640px;margin:0 auto;padding:40px 16px;text-align:center;color:var(--text-muted,#94a3b8);">Entre na sua conta pra ver seu histórico de jogos.</div>';
      return;
    }

    // loading
    container.innerHTML = hdr + '<div style="max-width:640px;margin:0 auto;padding:40px 16px;text-align:center;color:var(--text-muted,#94a3b8);">' +
      (typeof window._renderBallLoader === 'function' ? window._renderBallLoader('Carregando seu histórico…') : 'Carregando…') + '</div>';

    // LEITURA DUPLA (transição): tenta o acervo canônico primeiro (1 doc por partida,
    // compartilhado); se ele ainda não tem nada pra este handle, cai no letzplayImport
    // antigo. Enquanto o backfill não roda, os dois convivem — beta não permite trocar
    // schema debaixo de dado existente. Falha na leitura canônica NÃO pode esconder o
    // histórico: cai pro antigo e segue.
    var lp = null;
    try { lp = await _fromLetzplayCanonical(cu); }
    catch (e) { window._log && window._log('[histórico] canônico falhou, usando o formato antigo:', (e && e.message) || e); }
    if (!lp) lp = _fromLetzplay(cu);
    var sp = [];
    try { sp = await _fromScoreplace(cu); } catch (e) { sp = []; }

    _all = lp.concat(sp).sort(function (a, b) { return b.ts - a.ts; });
    _filters = { source: 'all', sport: '', venue: '', comp: '' };

    var sports = _uniq(_all.map(function (x) { return x.sport; }));
    var venues = _uniq(_all.map(function (x) { return x.venue; }));
    var comps = _uniq(_all.map(function (x) { return x.competition; }));

    var lpCount = lp.length, spCount = sp.length;

    // Barra de filtro trava logo abaixo do cabeçalho (padrão sticky canônico:
    // topbar + dropdown do hamburger + back-header). Full-bleed com fundo darker.
    var filterBar = '' +
      '<div style="position:sticky;top:calc(var(--topbar-h,60px) + var(--hamburger-dd-h,0px) + var(--backheader-h,0px) - 1px);z-index:5;background:var(--bg-darker,#171a2b);margin-left:0;margin-right:0;border-bottom:1px solid var(--border-color,rgba(255,255,255,0.08));">' +
        '<div style="max-width:1080px;margin:0 auto;padding:10px 14px 8px;">' +
          '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">' +
            _srcPill('all', 'Todos', 'all', true) +
            _srcPill('letzplay', '🎾 LetzPlay' + (lpCount ? ' (' + lpCount + ')' : ''), 'letzplay', false) +
            _srcPill('scoreplace', '🏆 Scoreplace' + (spCount ? ' (' + spCount + ')' : ''), 'scoreplace', false) +
          '</div>' +
          '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
            _select('f-sport', 'sport', 'Modalidade', sports) +
            _select('f-venue', 'venue', 'Local', venues) +
            _select('f-comp', 'comp', 'Torneio/Competição', comps) +
          '</div>' +
          '<div id="hist-count" style="font-size:0.72rem;color:var(--text-muted,#94a3b8);margin-top:8px;font-weight:600;"></div>' +
        '</div>' +
      '</div>';

    var _impEntry = (typeof window._spImportEntry === 'function') ? window._spImportEntry({ label: 'Importar do letzplay', variant: 'solid' }) : '';
    var lpHint = (lpCount === 0)
      ? '<div style="background:rgba(132,204,22,0.08);border:1px dashed rgba(132,204,22,0.4);border-radius:10px;padding:12px;margin-bottom:10px;font-size:0.78rem;color:var(--text-muted,#cbd5e1);">' +
          '🎾 Traga também seu histórico do <b>letzplay</b> — depois de importado, ele fica aqui no seu scoreplace, junto dos seus jogos do app.' +
          '<div style="margin-top:8px;">' + _impEntry + '</div>' +
        '</div>'
      : '';

    container.innerHTML = hdr +
      '<div style="max-width:1080px;margin:0 auto;padding:0 14px 40px;">' +
        filterBar + lpHint +
        '<div id="hist-resumo"></div>' +
        '<div id="hist-list" style="margin-top:10px;display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:10px;align-items:start;"></div>' +
      '</div>';

    _renderList();

    // Cross-ref @letzplay → nome do scoreplace: carrega em lote os @handles dos
    // parceiros/adversários e re-renderiza com os nomes corrigidos de quem já
    // entrou no app e vinculou o @.
    if (typeof window._loadLetzplayNameCache === 'function') {
      var _handles = [];
      _all.forEach(function (it) {
        if (it.source !== 'letzplay') return;
        if (it.lpPartner && it.lpPartner.handle) _handles.push(it.lpPartner.handle);
        (it.lpOpps || []).forEach(function (o) { if (o.handle) _handles.push(o.handle); });
      });
      if (_handles.length) {
        window._loadLetzplayNameCache(_handles).then(function () {
          if (document.getElementById('hist-list')) _renderList();
        }).catch(function () {});
      }
    }
  };
})();
