// v0.16.93/94: handler de click no card de torneio na dashboard. Detecta
// se o click veio de dentro de um elemento que NÃO deve disparar navegação
// (ex: toggle Liga ativado/desativado, botão de inscrever, etc.) e ignora.
// Pedido do usuário: "quando clicarmos no togle ... não entre no detalhe
// do card" + "quando clicamos no togle ... mantenha tudo parado no lugar".
// Em vez de confiar em stopPropagation no toggle (que tem múltiplas camadas
// e às vezes falha em CSS toggle-switch), o handler do card próprio checa
// se event.target está dentro de um elemento "no-nav" via closest().
window._dashCardClick = function(event, tournamentId) {
  if (!event || !tournamentId) return;
  var target = event.target;
  // Se o click veio de dentro do toggle Liga, NÃO navega.
  if (target && target.closest && target.closest('[data-liga-toggle-tid]')) return;
  // Se o click veio de qualquer botão ou label/input dentro do card, NÃO navega.
  // Botões já têm stopPropagation no próprio onclick mas defesa em profundidade.
  if (target && target.closest && target.closest('button, input, label, select, textarea, a[href], [data-no-card-nav]')) return;
  window.location.hash = '#tournaments/' + tournamentId;
};

// ─── Organizer Analytics Section ────────────────────────────────────────────
window._buildAnalyticsSection = function _buildAnalyticsSection(organizados) {
  if (!window.AppStore || !window.AppStore.currentUser) return '';
  if (!organizados || organizados.length < 2) return '';
  if (window.AppStore.viewMode !== 'organizer') return '';

  var t = window._t || function(k) { return k; };
  var total = organizados.length;

  // Unique participants
  var participantSet = {};
  var totalParts = 0;
  organizados.forEach(function(tour) {
    var parts = tour.participants || [];
    parts.forEach(function(p) {
      var key = (typeof p === 'string') ? p : (p.email || p.displayName || p.uid || JSON.stringify(p));
      participantSet[key] = true;
    });
    totalParts += parts.length;
  });
  var uniqueCount = Object.keys(participantSet).length;
  var avgParts = total > 0 ? Math.round(totalParts / total) : 0;

  // By format
  var formatCounts = {};
  organizados.forEach(function(tour) {
    var f = tour.format || t('common.other');
    formatCounts[f] = (formatCounts[f] || 0) + 1;
  });

  // By sport
  var sportCounts = {};
  organizados.forEach(function(tour) {
    var s = tour.sport ? tour.sport.replace(/^[^\w\u00C0-\u024F]+/u, '').trim() : t('common.other');
    sportCounts[s] = (sportCounts[s] || 0) + 1;
  });

  // Best month
  var monthCounts = {};
  organizados.forEach(function(tour) {
    var d = tour.createdAt || tour.startDate;
    if (d) {
      var dt = new Date(d);
      if (!isNaN(dt.getTime())) {
        var mk = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0');
        monthCounts[mk] = (monthCounts[mk] || 0) + 1;
      }
    }
  });
  var bestMonth = '';
  var bestMonthCount = 0;
  Object.keys(monthCounts).forEach(function(mk) {
    if (monthCounts[mk] > bestMonthCount) {
      bestMonthCount = monthCounts[mk];
      bestMonth = mk;
    }
  });
  var bestMonthLabel = bestMonth ? (function() {
    var parts = bestMonth.split('-');
    var months = t('dashboard.monthAbbrevs').split(',');
    return months[parseInt(parts[1], 10) - 1] + '/' + parts[0];
  })() : '-';

  // Bar chart helper
  function barChart(counts) {
    var max = 0;
    Object.keys(counts).forEach(function(k) { if (counts[k] > max) max = counts[k]; });
    if (max === 0) return '';
    var html = '';
    Object.keys(counts).sort(function(a,b) { return counts[b] - counts[a]; }).forEach(function(k) {
      var pct = Math.round((counts[k] / max) * 100);
      html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">' +
        '<span style="min-width:120px;font-size:0.78rem;color:var(--text-muted);text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + window._safeHtml(k) + '</span>' +
        '<div style="flex:1;height:18px;background:var(--bg-darker);border-radius:6px;overflow:hidden;">' +
          '<div style="width:' + pct + '%;height:100%;background:var(--primary-color);border-radius:6px;transition:width 0.3s;"></div>' +
        '</div>' +
        '<span style="min-width:24px;font-size:0.78rem;color:var(--text-bright);font-weight:600;">' + counts[k] + '</span>' +
      '</div>';
    });
    return html;
  }

  var isOpen = localStorage.getItem('scoreplace_analytics_open') === '1';

  return '<div style="margin-bottom:1rem;">' +
    '<details' + (isOpen ? ' open' : '') + ' ontoggle="localStorage.setItem(\'scoreplace_analytics_open\', this.open ? \'1\' : \'0\')">' +
    '<summary style="cursor:pointer;font-weight:700;font-size:1rem;color:var(--text-bright);padding:12px 16px;background:var(--bg-card);border:1px solid var(--border-color);border-radius:12px;user-select:none;list-style:none;display:flex;align-items:center;gap:8px;">' +
      '<span style="transition:transform 0.2s;">📊</span> ' + t('analytics.title') +
    '</summary>' +
    '<div style="margin-top:8px;padding:16px;background:var(--bg-card);border:1px solid var(--border-color);border-radius:12px;">' +
      // Stat cards row
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:16px;">' +
        '<div class="stat-box"><div style="font-size:1.5rem;font-weight:800;color:var(--primary-color);">' + total + '</div><div style="font-size:0.78rem;color:var(--text-muted);">' + t('analytics.totalTournaments') + '</div></div>' +
        '<div class="stat-box"><div style="font-size:1.5rem;font-weight:800;color:var(--primary-color);">' + uniqueCount + '</div><div style="font-size:0.78rem;color:var(--text-muted);">' + t('analytics.uniqueParticipants') + '</div></div>' +
        '<div class="stat-box"><div style="font-size:1.5rem;font-weight:800;color:var(--primary-color);">' + avgParts + '</div><div style="font-size:0.78rem;color:var(--text-muted);">' + t('analytics.avgParticipants') + '</div></div>' +
        '<div class="stat-box"><div style="font-size:1.5rem;font-weight:800;color:var(--primary-color);">' + bestMonthLabel + '</div><div style="font-size:0.78rem;color:var(--text-muted);">' + t('analytics.bestMonth') + '</div></div>' +
      '</div>' +
      // Bar charts
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">' +
        '<div><div style="font-size:0.82rem;font-weight:600;color:var(--text-bright);margin-bottom:8px;">' + t('analytics.byFormat') + '</div>' + barChart(formatCounts) + '</div>' +
        '<div><div style="font-size:0.82rem;font-weight:600;color:var(--text-bright);margin-bottom:8px;">' + t('analytics.bySport') + '</div>' + barChart(sportCounts) + '</div>' +
      '</div>' +
    '</div>' +
    '</details>' +
  '</div>';
};

// ─── Dashboard Enroll: direct enrollment + navigate to detail ───────────────
window._dashEnroll = function(tId) {
  // Look up tournament in both the scoped list AND the discovery feed.
  // Antes só olhava em AppStore.tournaments (scoped) — quando o usuário
  // clicava "Inscrever" num card de descoberta (torneio público que ele
  // ainda não entrou, disponível apenas em publicDiscovery), o find vinha
  // undefined e o handler caía no fallback enrollCurrentUser que TAMBÉM só
  // olha em tournaments — falha silenciosa total. Agora, se vier só do
  // discovery, hidratamos em AppStore.tournaments primeiro pra que as
  // funções downstream (enrollCurrentUser, _doEnrollCurrentUser) encontrem.
  var t = (window.AppStore.tournaments || []).find(function(x) { return String(x.id) === String(tId); });
  if (!t && Array.isArray(window.AppStore.publicDiscovery)) {
    var fromDiscovery = window.AppStore.publicDiscovery.find(function(x) { return String(x.id) === String(tId); });
    if (fromDiscovery) {
      window.AppStore.tournaments.push(fromDiscovery);
      t = fromDiscovery;
    }
  }
  var user = window.AppStore.currentUser;
  if (!t || !user) { window.enrollCurrentUser(tId); return; }

  // Block enrollment if inscriptions are closed
  var _isLiga = t.format && (t.format === 'Liga' || t.format === 'Ranking' || t.format === 'liga' || t.format === 'ranking');
  var _ligaOpen = _isLiga && t.ligaOpenEnrollment;
  var _sorteio = (Array.isArray(t.matches) && t.matches.length > 0) ||
                 (Array.isArray(t.rounds) && t.rounds.length > 0) ||
                 (Array.isArray(t.groups) && t.groups.length > 0);
  var _aberto = (t.status !== 'closed' && t.status !== 'finished' && !_sorteio) || _ligaOpen;
  if (!_aberto) {
    if (typeof showAlertDialog === 'function') showAlertDialog(window._t('auth.enrollClosed'), window._t('auth.enrollClosedMsg'), null, { type: 'warning' });
    return;
  }

  // For team tournaments, skip the team modal — enroll as individual participant
  // (organizer enrolling from dashboard is always self-enrollment)
  var hasCats = (t.combinedCategories && t.combinedCategories.length > 0) ||
                (t.genderCategories && t.genderCategories.length > 0);
  if (hasCats) {
    window._resolveEnrollmentCategory(tId, function(cats) {
      if (!cats) return;
      window._doEnrollCurrentUser(tId, cats);
      window.location.hash = '#tournaments/' + tId;
    });
    return;
  }

  window._doEnrollCurrentUser(tId, null);
  window.location.hash = '#tournaments/' + tId;
};

// v1.9.94: re-render automático da dashboard SEM "pulo" de scroll. As
// re-renderizações disparadas por fetch assíncrono (discovery re-fetch / poll
// de 25s) chamavam renderDashboard direto — isso (a) resetava o scroll pro topo
// (innerHTML novo) e (b) com _isSoftRefresh=false, resetava o guard
// _dashPendingScrolled, fazendo o auto-scroll pro jogo pendente disparar de
// novo. Resultado reportado: na entrada com jogo pendente, "ia pro jogo e
// voltava pro topo 3x". Este helper preserva o scroll atual e marca
// _isSoftRefresh durante o render pra NÃO re-disparar o auto-scroll.
function _reRenderDashKeepScroll() {
  var c = document.getElementById('view-container');
  if (!c || typeof renderDashboard !== 'function') return;
  var _sy = window.scrollY || window.pageYOffset || 0;
  var _prevSR = window._isSoftRefresh;
  window._isSoftRefresh = true; // impede reset do guard _dashPendingScrolled
  try { renderDashboard(c); } finally { window._isSoftRefresh = _prevSR; }
  // Só restaura se havia scroll E ele foi de fato perdido pelo novo innerHTML.
  // Evita chamar scrollTo à toa (que poderia cortar o momentum no mobile).
  if (_sy > 0) {
    requestAnimationFrame(function() {
      var _now = window.scrollY || window.pageYOffset || 0;
      if (Math.abs(_now - _sy) > 2) window.scrollTo({ top: _sy, behavior: 'instant' });
    });
  }
}

function renderDashboard(container) {
  const visible = window.AppStore.getVisibleTournaments();

  // Filtros Básicos
  const torneiosCount = visible.length;
  const torneiosPublicos = visible.filter(t => t.isPublic).length;
  const inscricoesAbertas = visible.filter(t => {
    const sorteioRealizado = (Array.isArray(t.matches) && t.matches.length > 0) || (Array.isArray(t.rounds) && t.rounds.length > 0) || (Array.isArray(t.groups) && t.groups.length > 0);
    const ligaAberta = (typeof window._isLigaFormat === 'function' ? window._isLigaFormat(t) : t.format === 'Liga') && t.ligaOpenEnrollment !== false && sorteioRealizado && t.status !== 'finished';
    // v2.1.4: late enrollment (Fechadas OFF) — inscrições seguem abertas após o
    // sorteio (e após iniciar) até o organizador encerrar. Mesma regra do detalhe.
    const lateEnrollOpen = sorteioRealizado && t.status !== 'finished' && t.status !== 'closed' && (t.lateEnrollment === 'standby' || t.lateEnrollment === 'expand');
    return (t.status !== 'finished' && t.status !== 'closed' && !sorteioRealizado && (!t.registrationLimit || new Date(t.registrationLimit) >= new Date())) || ligaAberta || lateEnrollOpen;
  }).length;


  // Filtros de Relacionamento (Dono / Participante)
  const organizados = window.AppStore.getMyOrganized();
  const participacoes = window.AppStore.getMyParticipations();
  const organizadosCount = organizados.length;
  const participacoesCount = participacoes.length;

  // Torneios com qualquer data definida (startDate, registrationLimit ou endDate)
  // Torneios com data aparecem antes dos sem datas.
  // v1.8.67: torneios EM ANDAMENTO com endDate ordenam por endDate (término);
  // demais ordenam por startDate (início) → usuário vê "o que termina mais cedo" primeiro.
  const _isInProgress = t => {
    var hasDraw = (Array.isArray(t.matches) && t.matches.length > 0) ||
                  (Array.isArray(t.rounds) && t.rounds.length > 0) ||
                  (Array.isArray(t.groups) && t.groups.length > 0);
    return hasDraw || t.status === 'active' || t.status === 'started' || t.status === 'in_progress';
  };
  const sortByDate = (a, b) => {
    // v1.8.87: torneios EM ANDAMENTO sempre acima dos demais
    const inA = _isInProgress(a) && a.status !== 'finished';
    const inB = _isInProgress(b) && b.status !== 'finished';
    if (inA && !inB) return -1;
    if (!inA && inB) return 1;

    const _hasDate = t => !!(t.startDate || t.registrationLimit || t.endDate);
    const hasA = _hasDate(a), hasB = _hasDate(b);
    if (hasA && !hasB) return -1;
    if (!hasA && hasB) return 1;
    const _time = t => {
      // Em andamento com data de término → usa endDate
      if (_isInProgress(t) && t.endDate) return new Date(t.endDate).getTime();
      // Não iniciado → usa startDate
      if (t.startDate) return new Date(t.startDate).getTime();
      if (t.registrationLimit) return new Date(t.registrationLimit).getTime();
      return Infinity;
    };
    return _time(a) - _time(b);
  };

  // v1.9.79: ordenação por PRÓXIMO EVENTO (encerramento de inscrição, início ou
  // término) — o mais URGENTE (mais próximo no futuro) primeiro. Torneios sem
  // data futura vão depois (ordenados pelo evento mais recente). Usado no feed
  // público de descoberta, conforme pedido: "ordem cronológica do próximo
  // evento; aparecem primeiro os mais urgentes". A cidade do usuário entra como
  // leve desempate (mesma cidade primeiro) quando disponível.
  const _userCity = (function() {
    var _u = window.AppStore && window.AppStore.currentUser;
    return _u && _u.city ? String(_u.city).trim().toLowerCase() : '';
  })();
  const _tMatchesCity = (t, city) => {
    if (!city || !t) return false;
    var hay = ((t.venueName || '') + ' ' + (t.venueAddress || '') + ' ' + (t.city || '') + ' ' + (t.venue || '')).toLowerCase();
    return hay.indexOf(city) !== -1;
  };
  const _nextEventInfo = (t) => {
    var now = Date.now();
    var times = [];
    ['registrationLimit', 'startDate', 'endDate'].forEach(function(k) {
      if (t && t[k]) { var ms = new Date(t[k]).getTime(); if (!isNaN(ms)) times.push(ms); }
    });
    if (!times.length) return { hasFuture: false, ms: Number.MAX_SAFE_INTEGER };
    var grace = now - 3600000; // 1h de tolerância — eventos "agora" ainda urgentes
    var future = times.filter(function(ms) { return ms >= grace; });
    if (future.length) return { hasFuture: true, ms: Math.min.apply(null, future) };
    return { hasFuture: false, ms: Math.max.apply(null, times) };
  };
  const sortByUrgency = (a, b) => {
    var ea = _nextEventInfo(a), eb = _nextEventInfo(b);
    // 1) com evento futuro vêm antes dos sem evento futuro
    if (ea.hasFuture && !eb.hasFuture) return -1;
    if (!ea.hasFuture && eb.hasFuture) return 1;
    // 2) ordena por data
    if (ea.ms !== eb.ms) {
      return ea.hasFuture ? (ea.ms - eb.ms) /* mais próximo primeiro */
                          : (eb.ms - ea.ms) /* sem futuro: mais recente primeiro */;
    }
    // 3) desempate: torneio na cidade do usuário primeiro
    if (_userCity) {
      var ac = _tMatchesCity(a, _userCity), bc = _tMatchesCity(b, _userCity);
      if (ac && !bc) return -1;
      if (!ac && bc) return 1;
    }
    return 0;
  };

  const participacoesSorted = [...participacoes].sort(sortByDate);
  const organizadosSorted = [...organizados].sort(sortByDate);

  // "Inscrições Abertas" = TODOS os torneios com inscrição aberta que o
  // usuário pode ver, união de:
  // (a) torneios próprios (organizados + participando) com enrollment aberto
  // (b) torneios públicos do discovery feed que o usuário ainda não entrou
  //
  // Antes mostrávamos só (b), e o usuário reportou "tem torneio com inscrição
  // aberta, público, mas esta dando 0" quando criava um torneio próprio
  // público — o count ficava zero porque o filtro só pegava do discovery
  // (que exclui torneios onde o usuário é member). A semântica do label
  // "Inscrições Abertas" não sugere "só os que você não entrou"; agora é
  // o que o usuário espera: total de torneios aceitando inscrição.
  const _isOpenEnrollment = (t) => {
    if (!t) return false;
    const _hasDraw = (Array.isArray(t.matches) && t.matches.length > 0) ||
                     (Array.isArray(t.rounds) && t.rounds.length > 0) ||
                     (Array.isArray(t.groups) && t.groups.length > 0);
    const _ligaAberta = (typeof window._isLigaFormat === 'function'
                          ? window._isLigaFormat(t)
                          : t.format === 'Liga')
                        && t.ligaOpenEnrollment !== false
                        && _hasDraw;
    const _deadlinePassed = t.registrationLimit && new Date(t.registrationLimit) < new Date();
    return (t.status !== 'closed' && t.status !== 'finished' && !_hasDraw && !_deadlinePassed) || _ligaAberta;
  };

  const discovery = (window.AppStore && Array.isArray(window.AppStore.publicDiscovery))
    ? window.AppStore.publicDiscovery
    : [];

  // v0.16.57: helper que classifica um torneio em uma das 4 categorias do
  // discovery feed pra renderizar na ordem pedida pelo usuário:
  //   1. open       → inscrições abertas (topo)
  //   2. inProgress → já começou (sorteio realizado, !finished)
  //   3. closedNoStart → inscrições encerradas mas sem sorteio
  //   4. finished   → encerrados (sessão separada/colapsada)
  const _classifyDiscoveryTournament = (t) => {
    if (!t) return null;
    if (t.status === 'finished') return 'finished';
    const hasDraw = (Array.isArray(t.matches) && t.matches.length > 0) ||
                    (Array.isArray(t.rounds) && t.rounds.length > 0) ||
                    (Array.isArray(t.groups) && t.groups.length > 0);
    // v1.3.35-beta: "inProgress" só quando o organizador clicou em
    // Iniciar Torneio (t.tournamentStarted ou status='in_progress'). Antes,
    // qualquer sorteio realizado já caía em "Em Andamento" — mas o tempo
    // só conta após o user iniciar.
    const tournamentStarted = !!(t.tournamentStarted || t.status === 'in_progress');
    if (tournamentStarted) return 'inProgress';
    const isLiga = t.format === 'Liga' || t.format === 'Ranking' || t.format === 'liga' || t.format === 'ranking';
    const ligaAcceptsEnroll = isLiga && t.ligaOpenEnrollment !== false && t.status !== 'closed';
    // Liga após sorteio com inscrição aberta = considerar como "inProgress"
    // (rodadas em andamento) — caso especial pra Liga, que não tem botão
    // Iniciar Torneio explícito.
    if (hasDraw && isLiga) return 'inProgress';
    const deadlinePassed = t.registrationLimit && new Date(t.registrationLimit) < new Date();
    if ((t.status === 'closed' || deadlinePassed || hasDraw) && !ligaAcceptsEnroll) return 'closedNoStart';
    return 'open';
  };

  // (a) Torneios próprios do usuário com inscrição aberta — lista primeiro
  // porque são os mais relevantes (próprios).
  const myOpenTournaments = visible.filter(_isOpenEnrollment);
  // (b) Discovery: deduplica vs próprios e organiza nas 4 categorias.
  const myOpenIds = new Set(myOpenTournaments.map(t => String(t.id)));
  const seenInOwn = new Set([...organizados, ...participacoes].map(t => String(t.id)));
  const discoveryDedup = discovery.filter(t => !seenInOwn.has(String(t.id)) && !myOpenIds.has(String(t.id)));
  const discoveryByCategory = { open: [], inProgress: [], closedNoStart: [], finished: [] };
  discoveryDedup.forEach(t => {
    const cat = _classifyDiscoveryTournament(t);
    if (cat && discoveryByCategory[cat]) discoveryByCategory[cat].push(t);
  });
  // Ordena cada categoria por urgência do próximo evento (v1.9.79)
  Object.keys(discoveryByCategory).forEach(k => discoveryByCategory[k].sort(sortByUrgency));
  // Backwards-compat: discoveryOpen ainda alimenta `abertosParaVoce` que
  // outras partes do dashboard consomem.
  const discoveryOpen = discoveryByCategory.open;
  // União ordenada por data — próprios primeiro (já sortiráveis), depois
  // discovery. Mantida como única variável pra minimizar diff do resto
  // da dashboard que consome `abertosParaVoce`.
  const abertosParaVoce = [...myOpenTournaments, ...discoveryOpen].sort(sortByUrgency);

  const cleanSportName = (sport) => sport ? sport.replace(/^[^\w\u00C0-\u024F]+/u, '').trim() : '';
  // v0.17.16: delega ao resolver global em store.js (centralização).
  const getSportIcon = (sport) => window._sportIcon ? window._sportIcon(sport) : '🏆';

  const renderTournamentCard = (t, type) => {
    var _t = window._t || function(k) { return k; };
    const publicText = t.isPublic ? _t('tournament.public') : _t('tournament.private');

    const formatDateBr = (dStr) => {
      if (!dStr) return '';
      try {
        const datePart = dStr.includes('T') ? dStr.split('T')[0] : dStr;
        const timePart = dStr.includes('T') ? dStr.split('T')[1] : '';
        const [y, m, d] = datePart.split('-');
        if (y && m && d) {
          let result = d + '/' + m + '/' + y;
          if (timePart) result += ' ' + timePart.substring(0, 5);
          return result;
        }
      } catch (e) { }
      return dStr;
    };

    const start = formatDateBr(t.startDate);
    const end = formatDateBr(t.endDate);
    const dates = start ? (end ? `${start} ${_t('tourn.dateTo')} ${end}` : `${start}`) : _t('tourn.dateTbd');
    const regLimit = formatDateBr(t.registrationLimit);
    const cats = (t.categories && t.categories.length) ? t.categories.join(', ') : _t('tourn.singleCat');

    // Liga season auto-closure: se a temporada expirou, encerra automaticamente
    if ((typeof window._isLigaFormat === 'function' ? window._isLigaFormat(t) : t.format === 'Liga') && t.status !== 'finished') {
      const _seasonMonths = t.ligaSeasonMonths || t.rankingSeasonMonths;
      if (_seasonMonths && t.startDate) {
        const _seasonStart = new Date(t.startDate);
        if (!isNaN(_seasonStart.getTime())) {
          const _seasonEnd = new Date(_seasonStart);
          _seasonEnd.setMonth(_seasonEnd.getMonth() + parseInt(_seasonMonths));
          if (new Date() >= _seasonEnd) {
            t.status = 'finished';
            if (!t.finishedAt) t.finishedAt = new Date().toISOString(); // v2.1.12: regra 24h
            if (!t.standings || !t.standings.length) {
              if (typeof window._computeStandings === 'function') {
                var _cats = (t.combinedCategories && t.combinedCategories.length) ? t.combinedCategories : ['default'];
                for (var _ci = 0; _ci < _cats.length; _ci++) {
                  var _st = window._computeStandings(t, _cats[_ci]);
                  if (_st && _st.length) { t.standings = _st; break; }
                }
              }
            }
            if (window.FirestoreDB && typeof window.FirestoreDB.saveTournament === 'function') {
              window.FirestoreDB.saveTournament(t).catch(function() {});
            }
            // Notify participants of season end (flag persistida no Firestore — v1.8.45)
            if (!t.finishNotifiedAt && typeof window._notifyTournamentParticipants === 'function') {
              t.finishNotifiedAt = new Date().toISOString();
              var _tFnSeason = window._t || function(k) { return k; };
              window._notifyTournamentParticipants(t, {
                type: 'tournament_finished',
                message: _tFnSeason('notif.tournamentFinished').replace('{name}', t.name || 'Torneio'),
                tournamentName: t.name || '',
                level: 'important'
              });
            }
          }
        }
      }
    }

    // Inscrições fecham após sorteio (status 'active'), exceto Liga com inscrições abertas na temporada
    const isFinished = t.status === 'finished';
    const sorteioRealizado = (Array.isArray(t.matches) && t.matches.length > 0) || (Array.isArray(t.rounds) && t.rounds.length > 0) || (Array.isArray(t.groups) && t.groups.length > 0);
    const ligaAberta = (typeof window._isLigaFormat === 'function' ? window._isLigaFormat(t) : t.format === 'Liga') && t.ligaOpenEnrollment !== false && sorteioRealizado && t.status !== 'finished';
    // v2.1.4: late enrollment (Fechadas OFF) mantém inscrições abertas após o
    // sorteio e após iniciar, até o organizador encerrar. Mesma regra do detalhe.
    const lateEnrollOpen = sorteioRealizado && !isFinished && t.status !== 'closed' && (t.lateEnrollment === 'standby' || t.lateEnrollment === 'expand');
    const isAberto = (!isFinished && t.status !== 'closed' && !sorteioRealizado && (!t.registrationLimit || new Date(t.registrationLimit) >= new Date())) || ligaAberta || lateEnrollOpen;
    // v1.3.35-beta: "Em Andamento" só com t.tournamentStarted setado pelo
    // botão Iniciar Torneio. Sorteio realizado mantém "Inscrições Encerradas".
    const tournamentStarted = !!(t.tournamentStarted || t.status === 'in_progress');
    const statusText = isFinished ? _t('status.finished') : (isAberto ? _t('status.open') : (tournamentStarted ? _t('status.active') : _t('status.closed')));
    const statusBg = isFinished ? 'rgba(251,191,36,0.15)' : (isAberto ? '#fbbf24' : (tournamentStarted ? 'rgba(16,185,129,0.2)' : 'rgba(0,0,0,0.3)'));
    const statusColor = isFinished ? '#fbbf24' : (isAberto ? '#78350f' : (tournamentStarted ? '#34d399' : '#fca5a5'));
    const statusFontWeight = isAberto ? '700' : '600';

    let enrollmentText = _t('enroll.modeMixed');
    if (t.enrollmentMode === 'individual') enrollmentText = _t('enroll.modeIndividual');
    else if (t.enrollmentMode === 'time') enrollmentText = _t('enroll.modeTeam');
    else if (t.enrollmentMode === 'misto') enrollmentText = _t('enroll.modeMixed');

    const isOrg = window.AppStore.currentUser && t.organizerEmail === window.AppStore.currentUser.email;

    let isParticipating = false;
    if (t.participants && window.AppStore.currentUser) {
      const user = window.AppStore.currentUser;
      const arr = Array.isArray(t.participants) ? t.participants : Object.values(t.participants);
      if (arr.length > 0) {
        isParticipating = arr.some(p => {
          if (typeof p === 'string') {
            if (p.indexOf(' / ') !== -1) return false;
            return p === user.email || p === user.displayName;
          }
          if (p.uid && user.uid && p.uid === user.uid) return true;
          if (p.email && p.email === user.email) return true;
          if (p.displayName && p.displayName === user.displayName) return true;
          return false;
        });
      }
    }

    // v2.1.5: detecta se o usuário está na lista de espera (standby/waitlist)
    let _isInStandby = false;
    if (window.AppStore.currentUser) {
      const _cuStb = window.AppStore.currentUser;
      const _matchStb = function(p) {
        if (!p) return false;
        if (typeof p === 'string') {
          if (p.indexOf(' / ') !== -1) return false;
          return p === _cuStb.email || p === _cuStb.displayName;
        }
        if (p.uid && _cuStb.uid && p.uid === _cuStb.uid) return true;
        if (p.email && _cuStb.email && p.email === _cuStb.email) return true;
        if (p.displayName && _cuStb.displayName && p.displayName === _cuStb.displayName) return true;
        return false;
      };
      _isInStandby = (Array.isArray(t.standbyParticipants) && t.standbyParticipants.some(_matchStb)) ||
                     (Array.isArray(t.waitlist) && t.waitlist.some(_matchStb));
    }

    // Card gradients adaptam ao tema via CSS variables
    // v0.17.32: dark themes (Noturno/Oceano) precisam de gradients DARK pros
    // 3 estados (default/participating/organizer) — antes participating/org
    // usavam tons médios saturados (teal-500, indigo-500, cyan-600) que
    // pareciam claros contra bg escuro. Agora usa deep tints (teal-950,
    // indigo-950, cyan-950, sky-900) que mantêm a identidade hue mas ficam
    // dark de verdade. Sunset agora é light cream desde v0.17.25 — gradients
    // antigos (brown-950) ficaram quebrados; corrigidos pra cream warm.
    var _theme = (document.documentElement.getAttribute('data-theme') || 'dark');
    var _isLight = (_theme === 'light' || _theme === 'sunset');
    let bgGradient;
    if (_theme === 'light') {
      bgGradient = 'linear-gradient(135deg, #e2e8f0 0%, #f1f5f9 100%)';
      if (isParticipating) bgGradient = 'linear-gradient(135deg, #ccfbf1 0%, #99f6e4 100%)';
      else if (isOrg) bgGradient = 'linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%)';
    } else if (_theme === 'sunset') {
      bgGradient = 'linear-gradient(135deg, #fdf6e3 0%, #f7e5cb 100%)';
      if (isParticipating) bgGradient = 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)';
      else if (isOrg) bgGradient = 'linear-gradient(135deg, #fed7aa 0%, #fdba74 100%)';
    } else if (_theme === 'ocean') {
      bgGradient = 'linear-gradient(135deg, #1c3d5e 0%, #173352 100%)';
      if (isParticipating) bgGradient = 'linear-gradient(135deg, #0c4a6e 0%, #0e3a52 100%)';
      else if (isOrg) bgGradient = 'linear-gradient(135deg, #1e3a5f 0%, #1a2f4d 100%)';
    } else {
      bgGradient = 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)';
      if (isParticipating) bgGradient = 'linear-gradient(135deg, #0f3a36 0%, #0d2826 100%)';
      else if (isOrg) bgGradient = 'linear-gradient(135deg, #1e1b4b 0%, #161339 100%)';
    }

    // Card text color adapts to theme
    var _cardTextColor = _isLight ? '#1f2937' : 'white';

    // Venue photo background
    let venuePhotoBg = '';
    if (t.venuePhotoUrl) {
      var overlayGrad = isOrg
        ? 'linear-gradient(135deg, rgba(67,56,202,0.85) 0%, rgba(99,102,241,0.8) 100%)'
        : isParticipating
          ? 'linear-gradient(135deg, rgba(15,118,110,0.85) 0%, rgba(20,184,166,0.8) 100%)'
          : 'linear-gradient(135deg, rgba(30,41,59,0.85) 0%, rgba(15,23,42,0.8) 100%)';
      venuePhotoBg = 'background-image: ' + overlayGrad + ', url(' + t.venuePhotoUrl + '); background-size: cover; background-position: center;';
      _cardTextColor = 'white'; // Overlay sempre escuro, texto branco
    }

    let individualCount = 0;
    let teamCount = 0;
    // Count waitlisted participants to subtract from active count
    const _waitlistArr = Array.isArray(t.waitlist) ? t.waitlist : [];
    const _waitlistNames = new Set();
    _waitlistArr.forEach(function(w) {
      var wName = typeof w === 'string' ? w : (w.displayName || w.name || '');
      if (wName) _waitlistNames.add(wName);
    });
    const _standbyCount = _waitlistArr.length;

    if (t.participants) {
      const arr = typeof window._getCompetitors === 'function' ? window._getCompetitors(t) : (Array.isArray(t.participants) ? t.participants : Object.values(t.participants));
      arr.forEach(p => {
        // Skip waitlisted participants from the active count
        var _pN = window._pName(p);
        if (_waitlistNames.has(_pN)) return;

        if (typeof p === 'object' && p !== null && Array.isArray(p.participants)) {
          teamCount++;
          individualCount += p.participants.length;
        } else {
          const pStr = _pN;
          if (pStr.includes('/')) {
            teamCount++;
            individualCount += pStr.split('/').filter(n => n.trim().length > 0).length;
          } else {
            individualCount++;
          }
        }
      });
    }

    // Enroll/unenroll button: only when inscriptions are truly open
    // hasDraw = tournament already has matches/rounds/groups drawn
    const hasDraw = (Array.isArray(t.matches) && t.matches.length > 0) || (Array.isArray(t.rounds) && t.rounds.length > 0) || (Array.isArray(t.groups) && t.groups.length > 0);
    const canEnroll = isAberto && !isFinished && (!hasDraw || ligaAberta || t.lateEnrollment === 'standby' || t.lateEnrollment === 'expand');
    let enrollBtnHtml = '';
    if (_isInStandby && !isFinished) {
      enrollBtnHtml = `<div style="font-size: 0.6rem; font-weight: 800; color: #fbbf24; text-transform: uppercase; letter-spacing: 0.4px; background: rgba(251,191,36,0.15); padding: 2px 8px; border-radius: 6px;">⏳ ${_t('enroll.onWaitlist')}</div><button class="btn btn-sm btn-danger hover-lift" onclick="event.stopPropagation(); window._spinButton(this, '${_t('enroll.processing')}'); window._leaveStandby('${t.id}')">🛑 ${_t('enroll.leaveWaitlist')}</button>`;
    } else if (isParticipating && canEnroll) {
      enrollBtnHtml = `<button class="btn btn-sm btn-danger hover-lift" onclick="event.stopPropagation(); window._spinButton(this, '${_t('enroll.processing')}'); window.deenrollCurrentUser('${t.id}')">🛑 ${_t('enroll.unenrollBtn')}</button>`;
    } else if (!isParticipating && canEnroll) {
      enrollBtnHtml = `<button class="btn btn-sm btn-success hover-lift" onclick="event.stopPropagation(); window._spinButton(this, '${_t('enroll.processing')}'); window._dashEnroll('${t.id}')">✅ ${_t('enroll.enrollBtn')}</button>`;
    } else if (isParticipating && !canEnroll && !isFinished) {
      enrollBtnHtml = `<div style="font-size: 0.65rem; font-weight: 700; color: #fef08a; text-transform: uppercase; letter-spacing: 0.5px;">${_t('enroll.enrolled')} ✓</div>`;
    } else if (isFinished && (isParticipating || isOrg)) {
      // v2.1.47: tempo que o torneio durou (início real → encerramento).
      var _finDurStr = '';
      if (t.tournamentStarted) {
        var _fEnd = t.finishedAt ? (typeof t.finishedAt === 'number' ? t.finishedAt : new Date(t.finishedAt).getTime()) : null;
        if (_fEnd && !isNaN(_fEnd)) {
          var _fd = _fEnd - (+t.tournamentStarted);
          if (_fd > 0 && typeof window._tProgFmtDur === 'function') _finDurStr = window._tProgFmtDur(_fd).replace(/\s\d+s$/, '');
        }
      }
      enrollBtnHtml = `<div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;">` +
        `<div style="font-size: 0.65rem; font-weight: 700; color: #fbbf24; text-transform: uppercase; letter-spacing: 0.5px; background: rgba(251,191,36,0.12); padding: 3px 10px; border-radius: 10px; border: 1px solid rgba(251,191,36,0.25);">🏆 ${isOrg ? _t('dashboard.youOrganized') : _t('dashboard.youParticipated')}</div>` +
        (_finDurStr ? `<div style="font-size:0.6rem;color:var(--text-muted);font-weight:600;">⏱️ durou ${_finDurStr}</div>` : '') +
      `</div>`;
    }

    const _isFav = typeof window._isFavorite === 'function' && window._isFavorite(t.id);
    return `
        <div class="card mb-3" style="position: relative; overflow: hidden; ${venuePhotoBg ? venuePhotoBg : 'background: ' + bgGradient + ';'} color: ${_cardTextColor}; border: 1px solid ${_isLight ? 'rgba(0,0,0,0.08)' : 'transparent'}; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,${_isLight ? '0.06' : '0.1'}); cursor: pointer; transition: transform 0.2s;" onclick="window._dashCardClick(event, '${t.id}')" onmouseover="this.style.transform='translateX(5px)'" onmouseout="this.style.transform='none'">
          ${isOrg ? `
             <div style="position: absolute; bottom: 6px; right: 8px; opacity: 0.9; pointer-events: none;" title="Organizador">
               <svg width="28" height="28" viewBox="0 0 24 24" fill="rgba(251,191,36,0.95)"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
             </div>
          ` : ''}
          <div class="card-body p-4" style="${isOrg ? 'padding-bottom: 38px;' : ''}">

            <!-- Top Row: Icon/Modality | Status (same line, consistent with detail page) -->
            <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; flex-wrap: nowrap;">
               <div style="display: flex; align-items: center; gap: 6px; opacity: 0.65; flex-shrink: 0;">
                  <span style="font-size: 1.1rem;">${getSportIcon(t.sport)}</span>
                  <span>${cleanSportName(t.sport) || _t('tournament.sport')}</span>
               </div>
               <div style="display: flex; flex-direction: column; align-items: flex-end; flex-shrink: 0;">
                  <div id="dash-regstatus-${t.id}"
                       ${isAberto && t.registrationLimit ? `data-regdeadline-tid="${t.id}" data-regdeadline-ts="${new Date(t.registrationLimit).getTime()}"` : ''}
                       style="color: ${statusColor}; background: ${statusBg}; padding: 4px 10px; border-radius: 12px; font-size: 0.7rem; font-weight: ${statusFontWeight}; white-space: nowrap;">
                    ${statusText}
                  </div>
               </div>
            </div>
            ${enrollBtnHtml ? `<div id="dash-enrollbtn-${t.id}" style="display: flex; flex-direction: column; align-items: flex-end; margin-top: 6px; gap: 4px;">
               ${enrollBtnHtml}
            </div>` : ''}

            <!-- Middle: Logo 1/3 + conteúdo 2/3 -->
            <div style="display:flex;align-items:flex-start;gap:14px;margin:1.4rem 0 1.2rem 0;">
              ${t.logoData ? `<div style="width:33%;min-width:80px;flex-shrink:0;"><img src="${t.logoData}" alt="Logo" style="width:100%;aspect-ratio:1/1;border-radius:12px;object-fit:cover;display:block;box-shadow:0 4px 16px rgba(0,0,0,0.4);"></div>` : ''}
              <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:0;">
                <div style="display:flex;align-items:flex-start;gap:6px;">
                  <h4 style="margin:0;font-size:1.5rem;font-weight:800;color:white;line-height:1.2;flex:1;overflow-wrap:break-word;">
                    ${window._safeHtml(t.name)}
                  </h4>
                  <span data-fav-id="${t.id}" onclick="window._toggleFavorite('${t.id}', event)" title="${_isFav ? _t('fav.remove') : _t('fav.add')}" style="font-size:1.4rem;cursor:pointer;flex-shrink:0;color:${_isFav ? '#f43f5e' : 'rgba(255,255,255,0.4)'};transition:color 0.2s;line-height:1;margin-top:2px;" onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'">${_isFav ? '♥' : '♡'}</span>
                </div>
              </div>
            </div>

            ${t.venueName ? `
            <!-- Local -->
            <div style="display: flex; align-items: center; gap: 8px; font-size: 0.85rem; font-weight: 500; opacity: 0.6; margin-top: -0.8rem;">
               <span style="font-size: 1rem;">📍</span>
               <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${window._safeHtml(t.venueName)}</span>
            </div>
            ` : ''}

            <!-- Below Name: Calendário + Data + badge contextual (HOJE/AMANHÃ/Em Xd) -->
            <div style="display: flex; align-items: center; gap: 8px; font-size: 0.9rem; font-weight: 500; opacity: 0.8; flex-wrap: wrap;">
               <span style="font-size: 1.1rem;">🗓️</span>
               <span>${dates}</span>
               ${(() => {
                 // Badge de início — aparece em torneios ativos (nao encerrados)
                 // com startDate futura ou hoje. Reusa as i18n keys
                 // tournament.startsToday / startsTomorrow / startsIn que
                 // estavam órfãs desde alguma refatoração passada.
                 // v0.17.39: também pula quando torneio já está "Em andamento"
                 // (sorteioRealizado=true) — info redundante e contraditória.
                 if (isFinished || !t.startDate || sorteioRealizado) return '';
                 try {
                   var _s = new Date(t.startDate);
                   if (isNaN(_s.getTime())) return '';
                   // Compara só dia/mês/ano — ignora fuso pra "hoje" bater
                   // com a definição local do usuário.
                   var _today = new Date();
                   var _dayDiff = Math.round((new Date(_s.getFullYear(), _s.getMonth(), _s.getDate()) -
                                              new Date(_today.getFullYear(), _today.getMonth(), _today.getDate())) / 86400000);
                   if (_dayDiff < 0) return ''; // já começou, não mostra badge
                   if (_dayDiff > 14) return ''; // mais de 2 semanas — badge fica irrelevante
                   var _label, _bg, _color;
                   if (_dayDiff === 0) {
                     _label = _t('tournament.startsToday');
                     _bg = 'rgba(16,185,129,0.22)'; _color = '#10b981';
                   } else if (_dayDiff === 1) {
                     _label = _t('tournament.startsTomorrow');
                     _bg = 'rgba(251,191,36,0.22)'; _color = '#fbbf24';
                   } else {
                     _label = _t('tournament.startsIn').replace('{days}', _dayDiff);
                     _bg = 'rgba(99,102,241,0.2)'; _color = '#a5b4fc';
                   }
                   return '<span style="font-size:0.68rem;font-weight:700;padding:2px 8px;border-radius:10px;background:' + _bg + ';color:' + _color + ';border:1px solid ' + _color + '40;white-space:nowrap;">' + _label + '</span>';
                 } catch(e) { return ''; }
               })()}
            </div>

            ${(() => {
              if (isFinished) return '';
              var _now = Date.now();
              var _isLiga = window._isLigaFormat && window._isLigaFormat(t);

              // Liga: um único countdown excludente (início → próximo sorteio → fim da temporada)
              if (_isLiga) {
                var _ligaEv = null;
                // 1. Não começou → countdown para início
                if (t.startDate && !sorteioRealizado) {
                  var _sd = new Date(t.startDate).getTime();
                  if (!isNaN(_sd) && _sd > _now) _ligaEv = { ts: _sd, label: _t('tourn.ligaStart'), icon: '🏁', color: '#10b981' };
                }
                // 2. Começou + próximo sorteio → countdown para próximo sorteio
                if (!_ligaEv && !t.drawManual && t.drawFirstDate && typeof window._calcNextDrawDate === 'function') {
                  var _nd = window._calcNextDrawDate(t);
                  if (_nd) {
                    var _ndTs = _nd.getTime();
                    var _seTs = null;
                    var _sm = t.ligaSeasonMonths || t.rankingSeasonMonths;
                    if (_sm && t.startDate) {
                      var _ssd = new Date(t.startDate);
                      if (!isNaN(_ssd.getTime())) { var _se = new Date(_ssd); _se.setMonth(_se.getMonth() + parseInt(_sm)); _seTs = _se.getTime(); }
                    }
                    if (!isNaN(_ndTs) && _ndTs > _now && (!_seTs || _ndTs <= _seTs)) _ligaEv = { ts: _ndTs, label: _t('tourn.nextDraw'), icon: '🎲', color: '#fb923c' };
                  }
                }
                // 3. Sem próximo sorteio → countdown para fim da temporada
                if (!_ligaEv) {
                  var _sm2 = t.ligaSeasonMonths || t.rankingSeasonMonths;
                  if (_sm2 && t.startDate) {
                    var _ssd2 = new Date(t.startDate);
                    if (!isNaN(_ssd2.getTime())) { var _end = new Date(_ssd2); _end.setMonth(_end.getMonth() + parseInt(_sm2)); var _eTs = _end.getTime(); if (!isNaN(_eTs) && _eTs > _now) _ligaEv = { ts: _eTs, label: _t('tourn.seasonEnd'), icon: '🏁', color: '#8b5cf6' }; }
                  }
                }
                if (!_ligaEv) return '';
                var _ct = window._formatCountdown ? window._formatCountdown(_ligaEv.ts - _now) : '';
                var _cm = { '#10b981': '16,185,129', '#fb923c': '251,146,60', '#8b5cf6': '139,92,246' };
                var _rgb = _cm[_ligaEv.color] || '139,92,246';
                // v0.16.91: toggle Liga "Ativado/Desativado" alinhado à direita
                // logo acima do countdown — mesmo aspecto do card de detalhe.
                // Pedido do usuário: "o botao ativado deve aparecer de forma
                // consistente tambem no card da dashboard."
                var _ligaToggleDash = (typeof window._buildLigaActiveToggleHtml === 'function')
                  ? window._buildLigaActiveToggleHtml(t)
                  : '';
                // v0.16.92: stopPropagation no wrapper da row pra cobrir
                // cliques fora do toggle (área vazia à esquerda). Caso
                // contrário a row inteira é "área quente" do card click.
                var _toggleRowDash = _ligaToggleDash
                  ? '<div style="display:flex;justify-content:flex-end;margin-top:6px;" onclick="event.stopPropagation();">' + _ligaToggleDash + '</div>'
                  : '';
                return _toggleRowDash +
                  '<div style="margin-top:' + (_toggleRowDash ? '4px' : '10px') + ';display:flex;align-items:center;gap:10px;padding:10px 14px;background:rgba(' + _rgb + ',0.1);border:1px solid rgba(' + _rgb + ',0.3);border-radius:12px;">' +
                  '<span style="font-size:1.3rem;">' + _ligaEv.icon + '</span>' +
                  '<span style="font-size:0.85rem;font-weight:700;color:' + _ligaEv.color + ';">' + _ligaEv.label + '</span>' +
                  '<span data-countdown-target="' + _ligaEv.ts + '" style="margin-left:auto;font-size:1.15rem;font-weight:900;color:' + _ligaEv.color + ';font-variant-numeric:tabular-nums;letter-spacing:0.5px;">' + _ct + '</span>' +
                '</div>';
              }

              // Não-Liga: countdown do evento mais próximo
              var _events = [];
              if (isAberto && t.registrationLimit) {
                var _rd = new Date(t.registrationLimit).getTime();
                if (!isNaN(_rd) && _rd > _now) _events.push({ ts: _rd, label: _t('event.enrollClose'), icon: '⏰', color: '#f59e0b' });
              }
              if (t.startDate) {
                var _sd2 = new Date(t.startDate).getTime();
                if (!isNaN(_sd2) && _sd2 > _now && !sorteioRealizado) _events.push({ ts: _sd2, label: _t('event.tournamentStart'), icon: '🏁', color: '#10b981' });
              }
              if (t.endDate) {
                var _ed = new Date(t.endDate).getTime();
                if (!isNaN(_ed) && _ed > _now) _events.push({ ts: _ed, label: _t('event.tournamentEnd'), icon: '🏆', color: '#8b5cf6' });
              }
              if (_events.length === 0) return '';
              _events.sort(function(a,b) { return a.ts - b.ts; });
              var _next = _events[0];
              var _countdownText = window._formatCountdown ? window._formatCountdown(_next.ts - _now) : '';
              var _rgb2 = _next.color === '#f59e0b' ? '245,158,11' : _next.color === '#10b981' ? '16,185,129' : '139,92,246';
              return '<div style="margin-top:10px;display:flex;align-items:center;gap:10px;padding:10px 14px;background:rgba(' + _rgb2 + ',0.1);border:1px solid rgba(' + _rgb2 + ',0.3);border-radius:12px;">' +
                '<span style="font-size:1.3rem;">' + _next.icon + '</span>' +
                '<span style="font-size:0.85rem;font-weight:700;color:' + _next.color + ';">' + _next.label + '</span>' +
                '<span data-countdown-target="' + _next.ts + '" style="margin-left:auto;font-size:1.15rem;font-weight:900;color:' + _next.color + ';font-variant-numeric:tabular-nums;letter-spacing:0.5px;">' + _countdownText + '</span>' +
              '</div>';
            })()}

            ${(() => {
              if (!sorteioRealizado || isFinished) return '';
              // Liga: não mostrar tempo decorrido (usa countdowns de próximo sorteio / fim de temporada)
              if (window._isLigaFormat && window._isLigaFormat(t)) return '';
              // Determine start time: startDate or first match/round creation
              var _startTs = 0;
              if (t.startDate) {
                _startTs = new Date(t.startDate).getTime();
              }
              if (!_startTs || isNaN(_startTs) || _startTs > Date.now()) return '';
              var _elapsedText = window._formatCountdown ? window._formatCountdown(Date.now() - _startTs) : '';
              return '<div style="margin-top:10px;display:flex;align-items:center;gap:10px;padding:10px 14px;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);border-radius:12px;">' +
                '<span style="font-size:1.3rem;">⏱️</span>' +
                '<span style="font-size:0.85rem;font-weight:700;color:#10b981;">' + _t('dashboard.inProgress') + '</span>' +
                '<span data-elapsed-since="' + _startTs + '" style="margin-left:auto;font-size:1.15rem;font-weight:900;color:#10b981;font-variant-numeric:tabular-nums;letter-spacing:0.5px;">' + _elapsedText + '</span>' +
              '</div>';
            })()}

            <!-- Linha separadora -->
            <div style="height: 1px; background: rgba(255,255,255,0.1); margin: 1.8rem 0;"></div>

            <!-- Bottom Section -->
            <div style="display: flex; gap: 1.5rem; flex-wrap: wrap; align-items: center; opacity: 0.75;">

               <!-- Stats Column -->
               <div style="display: flex; flex-direction: column; gap: 8px; width: 100%;">
                   <div style="display: flex; flex-direction: row; gap: 8px; flex-wrap: wrap; align-items: flex-start;">
                       <div class="stat-box" style="flex-direction: column;">
                          <div style="display: flex; align-items: center; gap: 4px;">
                             <span style="font-size: 1.1rem;">👤</span>
                             <span style="font-size: 1.4rem; font-weight: 800; line-height: 1; opacity: 0.95;">${individualCount}</span>
                          </div>
                          <span style="font-size: 0.65rem; text-transform: uppercase; letter-spacing: 1px; margin-top: 3px; opacity: 0.8;">${_t('dashboard.statEnrolled')}</span>
                       </div>
                       ${teamCount > 0 ? `
                       <div class="stat-box" style="flex-direction: column;">
                          <div style="display: flex; align-items: center; gap: 4px;">
                             <span style="font-size: 1.1rem;">👥</span>
                             <span style="font-size: 1.4rem; font-weight: 800; line-height: 1; opacity: 0.95;">${teamCount}</span>
                          </div>
                          <span style="font-size: 0.65rem; text-transform: uppercase; letter-spacing: 1px; margin-top: 3px; opacity: 0.8;">${_t('dashboard.statTeams')}</span>
                       </div>
                       ` : ''}
                       ${_standbyCount > 0 ? `
                       <div class="stat-box" style="flex-direction: column; border-color: rgba(251,191,36,0.3); background: rgba(251,191,36,0.08);">
                          <div style="display: flex; align-items: center; gap: 4px;">
                             <span style="font-size: 1.1rem;">⏱️</span>
                             <span style="font-size: 1.4rem; font-weight: 800; line-height: 1; opacity: 0.95; color: #fbbf24;">${_standbyCount}</span>
                          </div>
                          <span style="font-size: 0.65rem; text-transform: uppercase; letter-spacing: 1px; margin-top: 3px; opacity: 0.8; color: #fbbf24;">${_t('dashboard.statWaiting')}</span>
                       </div>
                       ` : ''}
                   </div>
                   ${(typeof window._buildCategoryCountHtml === 'function') ? window._buildCategoryCountHtml(t) : ''}
               </div>

               <!-- Formato, Regras e Categorias -->
               <div class="info-box">
                  <div><strong>${_t('dashboard.labelFormat')}:</strong> ${t.format}</div>
                  <div><strong>${_t('dashboard.labelAccess')}:</strong> ${publicText}</div>
               </div>
            </div>

            ${(() => {
              var _html = '';
              // Progress bar for active tournaments
              if (typeof window._getTournamentProgress === 'function') {
                var _prog = window._getTournamentProgress(t);
                if (_prog.total > 0) {
                  var _barColor = _prog.pct === 100 ? '#10b981' : (_prog.pct > 50 ? '#3b82f6' : '#f59e0b');
                  _html += '<div class="info-box" style="margin-top: 10px; padding: 8px 12px;">';
                  _html += '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">';
                  _html += '<span style="font-size: 0.65rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.7;">' + _t('dashboard.labelProgress') + '</span>';
                  _html += '<span style="font-size: 0.7rem; font-weight: 700;">' + _prog.pct + '%</span>';
                  _html += '</div>';
                  _html += '<div style="width: 100%; height: 5px; background: rgba(255,255,255,0.1); border-radius: 3px; overflow: hidden;">';
                  _html += '<div style="width: ' + _prog.pct + '%; height: 100%; background: ' + _barColor + '; border-radius: 3px;"></div>';
                  _html += '</div></div>';
                }
              }
              // Active poll banner on card
              if (t.polls && t.polls.length > 0) {
                var _activePoll = null;
                for (var _pi = 0; _pi < t.polls.length; _pi++) {
                  var _pp = t.polls[_pi];
                  if (_pp.status === 'active' && Date.now() < _pp.deadline) { _activePoll = _pp; break; }
                }
                if (_activePoll) {
                  var _pRemaining = Math.max(0, _activePoll.deadline - Date.now());
                  var _pHrs = Math.floor(_pRemaining / 3600000);
                  var _pMins = Math.floor((_pRemaining % 3600000) / 60000);
                  var _pTimeStr = _pHrs > 0 ? _pHrs + 'h ' + _pMins + 'm' : _pMins + 'm';
                  var _pVotes = Object.keys(_activePoll.votes || {}).length;
                  var _pTotal = (t.participants ? (Array.isArray(t.participants) ? t.participants : Object.values(t.participants)).length : 0);
                  var _pUser = window.AppStore.currentUser;
                  var _pUserEmail = (_pUser && _pUser.email) ? _pUser.email : '';
                  var _pHasVoted = !!(_activePoll.votes && _activePoll.votes[_pUserEmail]);
                  var _pStatusText = _pHasVoted ? '✅ ' + _t('poll.voted') : '⏳ ' + _t('poll.awaitingVote');
                  _html += '<div onclick="event.stopPropagation();window._showPollVotingDialog(\'' + t.id + '\',\'' + _activePoll.id + '\')" style="margin-top:10px;background:linear-gradient(135deg,rgba(99,102,241,0.15),rgba(139,92,246,0.08));border:2px solid rgba(99,102,241,0.4);border-radius:20px;padding:1rem 1.25rem;cursor:pointer;box-shadow:0 4px 20px rgba(99,102,241,0.1);">';
                  _html += '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">';
                  _html += '<div style="display:flex;align-items:center;gap:12px;">';
                  _html += '<div style="width:42px;height:42px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:1.3rem;flex-shrink:0;">🗳️</div>';
                  _html += '<div>';
                  _html += '<div style="font-weight:900;font-size:1.15rem;color:var(--text-bright);letter-spacing:0.02em;">ENQUETE</div>';
                  _html += '<div style="font-size:0.7rem;color:var(--text-muted);margin-top:1px;">' + _pStatusText + ' · ' + _pVotes + '/' + _pTotal + ' ' + _t('dashboard.votes') + '</div>';
                  _html += '</div></div>';
                  _html += '<div style="text-align:center;background:rgba(0,0,0,0.2);padding:6px 14px;border-radius:10px;">';
                  _html += '<div style="font-size:1.4rem;font-weight:900;color:#a5b4fc;line-height:1;font-variant-numeric:tabular-nums;">' + _pTimeStr + '</div>';
                  _html += '<div style="font-size:0.55rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-top:2px;">' + _t('dashboard.remaining') + '</div>';
                  _html += '</div></div>';
                  _html += '<div style="margin-top:8px;font-size:0.65rem;color:var(--text-muted);opacity:0.7;">' + _t('enroll.suspended') + '</div>';
                  _html += '</div>';
                }
              }
              return _html;
            })()}

          </div>
        </div>
      `;
  };

  // Grupo 1: torneios que o usuário organiza OU participa (sem duplicata), ordem cronológica
  const seenIds = new Set();
  const meus = [];
  [...organizadosSorted, ...participacoesSorted].forEach(t => {
    if (!seenIds.has(t.id)) {
      seenIds.add(t.id);
      meus.push(t);
    }
  });
  meus.sort(sortByDate);

  // Grupo 2: abertos para se inscrever (já excluem org e participante por definição)
  const abertos = abertosParaVoce; // já ordenado por sortByDate

  // Grupo 3: encerrados visíveis (públicos ou com participação) que não estão em meus
  const encerradosVisiveis = visible.filter(t => {
    if (t.status !== 'finished') return false;
    return !seenIds.has(t.id);
  }).sort(sortByDate);

  // Collect unique sports and locations for filter bar
  const allTournaments = [...meus, ...abertosParaVoce, ...encerradosVisiveis];
  const uniqueIds = new Set();
  const allUnique = [];
  allTournaments.forEach(t => { if (!uniqueIds.has(t.id)) { uniqueIds.add(t.id); allUnique.push(t); } });

  const sportsSet = new Set();
  const locationsSet = new Set();
  const formatsSet = new Set();
  allUnique.forEach(t => {
    if (t.sport) sportsSet.add(cleanSportName(t.sport));
    if (t.venueName) locationsSet.add(t.venueName);
    if (t.format) formatsSet.add(t.format);
  });

  const sportsArr = Array.from(sportsSet).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const locationsArr = Array.from(locationsSet).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const formatsArr = Array.from(formatsSet).sort((a, b) => a.localeCompare(b, 'pt-BR'));

  var _t = window._t || function(k) { return k; };
  // v1.0.43-beta: detecta displayName que parece telefone e cai no fallback
  // — bug reportado: "Bem-vindo, +5511997237733!" pra users que logaram via
  // SMS antes do cross-ref por phone (e.g., users que já tinham displayName
  // = phoneNumber salvo no Firestore por bug histórico).
  // v1.9.53: usa o helper canônico (mesma cadeia da topbar) — um usuário
  // logado nunca deve aparecer como "Visitante". Só cai em guest quando NÃO
  // há usuário/identidade alguma (visitante de verdade).
  var _friendly = (typeof window._friendlyUserName === 'function')
    ? window._friendlyUserName(window.AppStore.currentUser)
    : null;
  const userName = _friendly || _t('common.guest');
  // v1.9.96: com monetização pausada, _isPro() é true pra todos (acesso
  // completo) — mas NÃO exibimos o selo "⭐ PRO" (senão pareceria que todos
  // pagaram). O selo só volta quando a cobrança for reativada.
  const _userIsPro = (window._MONETIZATION_ENABLED !== false) && typeof window._isPro === 'function' && window._isPro();
  const _proBadge = _userIsPro ? ' <span style="display:inline-flex;align-items:center;gap:3px;background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;font-size:0.55rem;font-weight:800;padding:2px 8px;border-radius:20px;vertical-align:middle;letter-spacing:0.5px;box-shadow:0 2px 8px rgba(245,158,11,0.3);position:relative;top:-2px;">⭐ PRO</span>' : '';

  // Initialize filter state
  if (!window._dashFilter) window._dashFilter = 'todos';
  if (!window._dashSport) window._dashSport = '';
  if (!window._dashLocation) window._dashLocation = '';
  if (!window._dashFormat) window._dashFormat = '';

  // Filter function
  window._applyDashFilter = function(filter) {
    window._dashFilter = filter;
    window._dashPage = 1;
    var c = document.getElementById('view-container');
    if (c && typeof renderDashboard === 'function') renderDashboard(c);
  };
  window._applyDashSport = function(sport) {
    window._dashSport = (window._dashSport === sport) ? '' : sport;
    var c = document.getElementById('view-container');
    if (c && typeof renderDashboard === 'function') renderDashboard(c);
  };
  window._applyDashLocation = function(loc) {
    window._dashLocation = (window._dashLocation === loc) ? '' : loc;
    var c = document.getElementById('view-container');
    if (c && typeof renderDashboard === 'function') renderDashboard(c);
  };
  window._applyDashFormat = function(fmt) {
    window._dashFormat = (window._dashFormat === fmt) ? '' : fmt;
    var c = document.getElementById('view-container');
    if (c && typeof renderDashboard === 'function') renderDashboard(c);
  };
  window._setDashView = function(view) {
    window._dashView = view;
    try { localStorage.setItem('scoreplace_dashView', view); } catch(e) {}
    var c = document.getElementById('view-container');
    if (c && typeof renderDashboard === 'function') renderDashboard(c);
  };
  // v0.16.73: removidos handlers _dashForceFetchDiscovery e
  // _dashDiagnoseTournaments (v0.16.60-61) — eram acionados por botões do
  // diag inline removido junto. Discovery feed estável desde v0.16.62.
  // Restaurar pelo histórico do git se algum bug regredir.
  window._loadMoreDiscovery = function() {
    if (!window.AppStore || typeof window.AppStore.loadPublicDiscovery !== 'function') return;
    window.AppStore.loadPublicDiscovery({ append: true }).then(function() {
      var c = document.getElementById('view-container');
      if (c && typeof renderDashboard === 'function') renderDashboard(c);
    });
  };
  // Restore saved view preference
  if (!window._dashView) {
    try { window._dashView = localStorage.getItem('scoreplace_dashView') || 'cards'; } catch(e) { window._dashView = 'cards'; }
  }

  // Build upcoming matches widget for current user
  // Profile completion nudge (v1.0.7-beta enhanced):
  //   Aparece pra QUALQUER user logado (não só quem já tem torneios) que
  //   tenha campos críticos faltando. Antes ficava restrito a allUnique>0
  //   pra não empilhar com o welcome card de fresh user — mas o welcome
  //   card foi reavaliado e os 2 banners conviveriam mal. Solução: nudge
  //   substitui o welcome quando há campos faltando; se perfil completo,
  //   welcome card volta a aparecer (caminho separado).
  //
  //   Campos críticos checados (5 no total):
  //     1. gender              — usado pra auto-categorização em torneios
  //     2. birthDate           — usado pra categorias por idade
  //     3. city                — notificações de torneios na região
  //     4. preferredSports     — sugestões de torneios/parceiros
  //     5. preferredLocations  — opcional (alternativa a city)
  //
  //   Pula o nudge se:
  //     - usuário nunca logou (sem cu)
  //     - já dismissou nesta sessão (sessionStorage)
  //     - todos os 5 campos críticos preenchidos (perfil 100%)
  function _buildProfileNudgeHtml() {
    var cu = window.AppStore && window.AppStore.currentUser;
    if (!cu || !cu.uid) return '';
    // v1.0.41-beta: aguarda profile load real do Firestore antes de avaliar
    // completude. Bug reportado: ao logar via magic link, dashboard renderiza
    // antes do loadUserProfile terminar — currentUser tem só os campos do
    // Google login (uid, email, displayName, photoURL), e os campos extras
    // (gender, birthDate, city, preferredSports) chegam depois async.
    // Resultado: nudge "Complete seu perfil" aparecia mesmo pra users com
    // perfil 100% completo. Pior: clicar Completar → abria o modal com
    // campos vazios → usuário podia preencher e SOBRESCREVER os dados
    // reais ao salvar. Agora só avalia depois que _profileLoaded vira true
    // (setado em store.js após loadUserProfile resolver/falhar). O event
    // listener `scoreplace:profile-loaded` re-injeta o nudge no slot abaixo.
    if (!cu._profileLoaded) return '';
    try {
      if (sessionStorage.getItem('scoreplace_profile_nudge_dismissed') === '1') return '';
    } catch (e) {}

    var _openProfile = "if(typeof window._showProfileModal==='function')window._showProfileModal();else if(typeof openModal==='function')openModal('modal-profile');";

    // ── Nudge prioritário: nome é um número de telefone ──────────────────
    // Usuários que entraram só por telefone ficam com o número como nome de
    // exibição. Isso aparece em torneios, rankings e chats — precisa de ação
    // imediata, mais urgente do que os campos opcionais de perfil.
    // Não pode ser dismissado (não tem botão ✕) pois afeta outros usuários
    // que veem esse nome em partidas e classificações.
    var _dn = (cu.displayName || '').trim();
    if (typeof window._isUnfriendlyName === 'function' && window._isUnfriendlyName(_dn)) {
      // O usuário está identificado pelo uid (interno), mas não tem nome no
      // perfil — então o app mostra o fallback (prefixo do email ou telefone)
      // nos torneios/rankings. Mostra exatamente o que os outros veem hoje,
      // via o MESMO helper canônico de exibição (_friendlyUserName).
      var _fallbackShown = (typeof window._friendlyUserName === 'function')
        ? (window._friendlyUserName(cu) || _dn)
        : (_dn || (cu.email ? String(cu.email).split('@')[0] : '') || (cu.phone || ''));
      return '<div id="dash-profile-nudge" style="background:linear-gradient(135deg,rgba(239,68,68,0.13),rgba(239,68,68,0.05));border:1px solid rgba(239,68,68,0.4);border-radius:14px;padding:14px 16px;margin-bottom:1rem;display:flex;align-items:center;gap:14px;flex-wrap:wrap;">' +
          '<span style="font-size:1.6rem;flex-shrink:0;line-height:1;">👤</span>' +
          '<div style="flex:1;min-width:220px;">' +
            '<div style="font-weight:800;color:#fca5a5;font-size:0.92rem;line-height:1.2;">Adicione seu nome ao perfil</div>' +
            '<div style="font-size:0.76rem;color:var(--text-muted);margin-top:4px;line-height:1.45;">' +
              'Sem um nome no perfil, você aparece como <b style="color:#fca5a5;font-family:monospace;">' + window._safeHtml(_fallbackShown || 'sem nome') + '</b> nos torneios e rankings. ' +
              'Coloque seu nome para que os outros jogadores te reconheçam.' +
            '</div>' +
          '</div>' +
          '<button class="btn btn-sm hover-lift" onclick="' + _openProfile + '" style="white-space:nowrap;background:linear-gradient(135deg,#ef4444,#dc2626);border:none;color:#fff;font-weight:700;flex-shrink:0;">Colocar meu nome →</button>' +
        '</div>';
    }

    // ── Nudge padrão: campos de perfil incompletos ───────────────────────
    var hasPhoto = !!(cu.photoURL && typeof cu.photoURL === 'string'
                     && cu.photoURL.length > 0
                     && cu.photoURL.indexOf('dicebear.com') === -1);
    var hasGender = !!(cu.gender && String(cu.gender).trim().length > 0 && cu.gender !== 'nao_informar');
    var hasBirth = !!(cu.birthDate && String(cu.birthDate).trim().length > 0);
    var hasCity = !!(cu.city && String(cu.city).trim().length > 0);
    var hasSports = !!(Array.isArray(cu.preferredSports) && cu.preferredSports.length > 0);
    var hasSkill = !!(cu.skill || (cu.skillBySport && Object.keys(cu.skillBySport).length > 0));
    var hasPhone = !!(cu.phone && String(cu.phone).trim().length > 0);
    var prefLocs = Array.isArray(cu.preferredLocations) ? cu.preferredLocations : [];
    var hasPrefLocation = prefLocs.length > 0;

    var checks = [
      { key: 'photo',    label: 'foto real',            ok: hasPhoto },
      { key: 'gender',   label: 'gênero',               ok: hasGender },
      { key: 'birth',    label: 'data de nascimento',   ok: hasBirth },
      { key: 'city',     label: 'cidade',               ok: hasCity },
      { key: 'sports',   label: 'modalidade preferida', ok: hasSports },
      { key: 'skill',    label: 'nível de habilidade',  ok: hasSkill },
      { key: 'phone',    label: 'telefone',             ok: hasPhone },
      { key: 'location', label: 'local favorito',       ok: hasPrefLocation }
    ];
    var filled = checks.filter(function(c){ return c.ok; }).length;
    var total = checks.length;
    if (filled === total) return ''; // perfil completo, sem nudge

    var missing = checks.filter(function(c){ return !c.ok; }).map(function(c){ return c.label; });
    var missStr = missing.length === 1
      ? missing[0]
      : missing.length === 2
        ? missing[0] + ' e ' + missing[1]
        : missing.slice(0, -1).join(', ') + ' e ' + missing[missing.length - 1];

    var secsEstimate = Math.max(15, Math.min(60, missing.length * 8));
    var timeLabel = secsEstimate <= 30 ? 'em ~' + secsEstimate + 's' : 'em ~1min';
    var pct = Math.round((filled / total) * 100);

    return '<div id="dash-profile-nudge" style="background:linear-gradient(135deg,rgba(245,158,11,0.12),rgba(245,158,11,0.05));border:1px solid rgba(245,158,11,0.35);border-radius:14px;padding:14px 16px;margin-bottom:1rem;display:flex;align-items:center;gap:14px;flex-wrap:wrap;">' +
        '<span style="font-size:1.6rem;flex-shrink:0;line-height:1;">🎯</span>' +
        '<div style="flex:1;min-width:220px;">' +
          '<div style="font-weight:800;color:var(--text-bright);font-size:0.92rem;line-height:1.2;">Complete seu perfil ' + timeLabel + '</div>' +
          '<div style="font-size:0.76rem;color:var(--text-muted);margin-top:3px;line-height:1.35;">' + filled + ' de ' + total + ' campos preenchidos · faltam <b style="color:#fbbf24;">' + window._safeHtml(missStr) + '</b></div>' +
          '<div style="margin-top:7px;height:5px;background:rgba(255,255,255,0.08);border-radius:3px;overflow:hidden;">' +
            '<div style="height:100%;background:linear-gradient(90deg,#fbbf24,#f59e0b);width:' + pct + '%;transition:width 0.4s ease;border-radius:3px;"></div>' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;gap:6px;flex-shrink:0;">' +
          '<button class="btn btn-primary btn-sm hover-lift" onclick="' + _openProfile + '" style="white-space:nowrap;background:linear-gradient(135deg,#f59e0b,#d97706);border:none;">Completar →</button>' +
          '<button class="btn btn-sm" onclick="window._dismissProfileNudge()" style="background:transparent;border:1px solid var(--border-color);color:var(--text-muted);font-size:0.78rem;" title="Descartar nesta sessão">✕</button>' +
        '</div>' +
      '</div>';
  }

  window._dismissProfileNudge = function() {
    try { sessionStorage.setItem('scoreplace_profile_nudge_dismissed', '1'); } catch (e) {}
    var el = document.getElementById('dash-profile-nudge');
    if (el) el.remove();
  };

  function _buildUpcomingMatchesHtml() {
    var cu = window.AppStore.currentUser;
    if (!cu || !cu.email) return '';

    var email = cu.email.toLowerCase();
    var dName = (cu.displayName || '').toLowerCase();
    var pending = [];

    function _isMe(label) {
      if (!label) return false;
      var l = label.toLowerCase();
      return l === email || (dName && l === dName) || (cu.uid && l === cu.uid);
    }
    function _isMeByUid(name, tournament) {
      if (!cu.uid || !name || !tournament) return false;
      var parts = Array.isArray(tournament.participants) ? tournament.participants : [];
      for (var _i = 0; _i < parts.length; _i++) {
        var _p = parts[_i];
        if (!_p || typeof _p !== 'object') continue;
        if (_p.p1Name === name && _p.p1Uid === cu.uid) return true;
        if (_p.p2Name === name && _p.p2Uid === cu.uid) return true;
      }
      return false;
    }

    participacoes.forEach(function(t) {
      if (t.status === 'finished') return;
      var _tFallback = window._t || function(k) { return k; };
      var tName = t.name || _tFallback('dashboard.tournamentName');
      var tId = t.id;

      // Collect pending matches (no winner yet, player is p1 or p2)
      var matchSources = (typeof window._collectAllMatches === 'function')
        ? window._collectAllMatches(t).slice()
        : [];
      if (matchSources.length === 0 && typeof window._collectAllMatches !== 'function') {
        // Defensive fallback: bracket-model.js not loaded.
        if (Array.isArray(t.matches)) matchSources = matchSources.concat(t.matches);
        if (t.thirdPlaceMatch) matchSources.push(t.thirdPlaceMatch);
        if (Array.isArray(t.rounds)) {
          t.rounds.forEach(function(r) {
            if (Array.isArray(r)) matchSources = matchSources.concat(r);
            else if (r && Array.isArray(r.matches)) matchSources = matchSources.concat(r.matches);
          });
        }
        if (Array.isArray(t.groups)) {
          t.groups.forEach(function(g) {
            if (g && Array.isArray(g.matches)) matchSources = matchSources.concat(g.matches);
            if (g && Array.isArray(g.rounds)) {
              g.rounds.forEach(function(gr) {
                if (Array.isArray(gr)) matchSources = matchSources.concat(gr);
              });
            }
          });
        }
        if (Array.isArray(t.rodadas)) {
          t.rodadas.forEach(function(r) {
            if (Array.isArray(r)) matchSources = matchSources.concat(r);
            else if (r && Array.isArray(r.matches)) matchSources = matchSources.concat(r.matches);
          });
        }
      }

      // v0.16.80: para Liga/Suíço, só consideramos matches da ÚLTIMA rodada
      // como "próximas partidas". Pedido do usuário: "na liga quando há um
      // novo sorteio, os jogos da rodada anterior que não tiverem resultado
      // registrado devem ser considerados encerrados. ... jogos que não
      // tiveram os resultaos lançados não podem constar como próximas
      // partidas do jogador." Antes, qualquer match sem winner aparecia
      // como pendente — incluindo rounds antigos abandonados (jogo nunca
      // foi disputado, novo sorteio veio sem resultado registrado). Agora
      // filtramos pela rodada mais alta encontrada (m.round máximo) entre
      // todos os matches do torneio. Outros formatos (Eliminatórias, Grupos)
      // mantêm comportamento atual — nesses todo match pendente é válido
      // até que seja resolvido.
      var isLigaFmt = (typeof window._isLigaFormat === 'function')
        ? window._isLigaFormat(t)
        : (t.format === 'Liga' || t.format === 'Ranking');
      var isSwissFmt = t.format === 'Suíço' || t.format === 'Suico';
      if (isLigaFmt || isSwissFmt) {
        var maxRound = -Infinity;
        matchSources.forEach(function(m) {
          if (m && typeof m.round === 'number' && m.round > maxRound) maxRound = m.round;
        });
        if (isFinite(maxRound)) {
          matchSources = matchSources.filter(function(m) {
            return m && m.round === maxRound;
          });
        }
      }

      // v0.16.74: extrai info rica de cada match — formato, fase, parceiro,
      // adversários, e (pra Rei/Rainha) os 4 do grupo. Antes só mostrava
      // "vs Adv" + nome do torneio. Pedido do usuário: "coloque o nome do
      // torneio que tem próximas partidas e coloque o parceiro e os
      // adversários e a fase da partida no torneio. se for rei/rainha
      // coloque isso e os sorteados junto."
      matchSources.forEach(function(m) {
        if (!m || m.winner) return; // Already has result
        if (m.p1 === 'TBD' || m.p2 === 'TBD' || m.p1 === 'BYE' || m.p2 === 'BYE') return;

        // Detecta se sou parte do match (singles, doubles slash-separated, ou monarch team).
        var isMonarchMatch = m.isMonarch && Array.isArray(m.team1) && Array.isArray(m.team2);
        var inTeam1 = false, inTeam2 = false;
        var team1Names = [], team2Names = [];
        if (isMonarchMatch) {
          team1Names = m.team1.slice();
          team2Names = m.team2.slice();
          inTeam1 = team1Names.some(_isMe);
          inTeam2 = team2Names.some(_isMe);
        } else {
          // Singles: m.p1/p2 são nomes; doubles: slash-separated.
          team1Names = String(m.p1 || '').split(/\s*\/\s*/).filter(Boolean);
          team2Names = String(m.p2 || '').split(/\s*\/\s*/).filter(Boolean);
          inTeam1 = team1Names.some(_isMe) || _isMe(m.p1) || team1Names.some(function(n) { return _isMeByUid(n, t); });
          inTeam2 = team2Names.some(_isMe) || _isMe(m.p2) || team2Names.some(function(n) { return _isMeByUid(n, t); });
        }
        if (!inTeam1 && !inTeam2) return;

        var myTeam = inTeam1 ? team1Names : team2Names;
        var oppTeam = inTeam1 ? team2Names : team1Names;
        // Parceiro = qualquer nome no meu time que não sou eu.
        var partner = null;
        for (var pi = 0; pi < myTeam.length; pi++) {
          if (!_isMe(myTeam[pi])) { partner = myTeam[pi]; break; }
        }

        // Format label
        var formatLabel = '';
        if (isMonarchMatch) formatLabel = 'Rei/Rainha';
        else if (t.format) formatLabel = t.format;
        // Liga com rodadas Rei/Rainha
        if (t.format === 'Liga' && t.ligaRoundFormat === 'rei_rainha' && isMonarchMatch) {
          formatLabel = 'Liga · Rei/Rainha';
        }

        // Phase label — Rei/Rainha tem m.label rico ("R1 Grupo A • Jogo 1"),
        // Liga/Suíço usa rodada, Eliminatórias deriva de m.round.
        var phaseLabel = '';
        if (m.label) {
          phaseLabel = String(m.label);
        } else if (m.roundLabel) {
          phaseLabel = String(m.roundLabel);
        } else if (m.round != null) {
          phaseLabel = 'Rodada ' + m.round;
        }

        pending.push({
          tournament: tName,
          tournamentId: tId,
          sport: t.sport || '',
          formatLabel: formatLabel,
          phaseLabel: phaseLabel,
          partner: partner,
          oppTeam: oppTeam,
          isMonarch: isMonarchMatch,
          // Pra Rei/Rainha, o "grupo" é os 4 nomes — usuário pediu pra
          // mostrar os sorteados juntos (rotação de duplas a cada jogo).
          monarchGroup: isMonarchMatch ? [].concat(team1Names, team2Names) : null
        });
      });
    });

    if (pending.length === 0) return '';

    // v0.16.75: agrupa partidas que dividem o mesmo torneio + grupo Rei/Rainha
    // (ou tournament + phase pra não-monarch). Pedido do usuário: "como sao 3
    // jogos do mesmo torneio, podemos colocar o torneio, modo rei/rainha, grupo
    // do sorteio uma unica vez e já colocar em boxes os confrontos em seguinda
    // alinhados numa unica linha." Antes cada match era um card próprio com
    // headers repetidos (3 cards iguais com "liga / Liga · Rei/Rainha · R2
    // Grupo H / 🎲 Grupo: A·B·C·D" idênticos, só mudando "Você + X vs Y + Z").
    // Agora um único card por (tournament + group/phase) com header + N linhas
    // compactas de confrontos.
    var grouped = [];
    var keyToIdx = {};
    pending.forEach(function(p) {
      var key;
      if (p.isMonarch && p.monarchGroup && p.monarchGroup.length > 0) {
        // Grupo Rei/Rainha = mesmo torneio + mesmo conjunto canônico de 4.
        key = p.tournamentId + '|monarch|' + p.monarchGroup.slice().sort().join(',');
      } else {
        // Não-monarch: agrupa por torneio + fase (mesma rodada de Liga/Suíço).
        key = p.tournamentId + '|single|' + (p.phaseLabel || '');
      }
      if (keyToIdx[key] == null) {
        keyToIdx[key] = grouped.length;
        // v0.16.82: guarda referência ao tournament real pra computar
        // standings ao renderizar (Liga/Suíço) sem precisar buscar de novo.
        var tRef = participacoes.find(function(tt) { return tt.id === p.tournamentId; });
        grouped.push({
          tournament: p.tournament, tournamentId: p.tournamentId, sport: p.sport,
          formatLabel: p.formatLabel, phaseLabel: p.phaseLabel,
          isMonarch: p.isMonarch, monarchGroup: p.monarchGroup,
          matches: [],
          tRef: tRef
        });
      }
      grouped[keyToIdx[key]].matches.push({
        partner: p.partner, oppTeam: p.oppTeam, phaseLabel: p.phaseLabel
      });
      // v0.16.76: pra Liga com sorteio automático, guarda referência ao
      // próximo draw scheduled — countdown vai pro header do card.
      if (!grouped[keyToIdx[key]].nextDrawAt) {
        var tFull = grouped[keyToIdx[key]].tRef;
        if (tFull && tFull.format === 'Liga' && !tFull.drawManual && tFull.drawFirstDate &&
            typeof window._calcNextDrawDate === 'function') {
          var nd = window._calcNextDrawDate(tFull);
          if (nd) grouped[keyToIdx[key]].nextDrawAt = nd.getTime();
        }
      }
    });

    var maxShowGroups = Math.min(grouped.length, 5);
    var html = '<div style="margin-bottom:1.25rem;background:var(--bg-card);border:1px solid var(--border-color);border-radius:14px;padding:14px 16px;">';
    var _t2 = window._t || function(k) { return k; };
    var _safe = window._safeHtml || function(s) { return String(s || ''); };
    html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;"><span style="font-size:1.1rem;">⚔️</span><span style="font-size:0.9rem;font-weight:700;color:var(--text-bright);">' + _t2('dashboard.nextMatches') + '</span><span style="font-size:0.7rem;color:var(--text-muted);margin-left:auto;">' + pending.length + '</span></div>';

    for (var gi = 0; gi < maxShowGroups; gi++) {
      var g = grouped[gi];
      var safeTourney = _safe(g.tournament);
      // Pra Rei/Rainha, descasca "• Jogo N" do phaseLabel pro header (deixa
      // só "R2 Grupo H"); pra não-monarch, mantém o phaseLabel inteiro.
      var headerPhase = g.phaseLabel;
      if (g.isMonarch && headerPhase) {
        headerPhase = headerPhase.replace(/\s*[•·]\s*Jogo\s*\d+.*/i, '');
      }
      var fmtPhase = [];
      if (g.formatLabel) fmtPhase.push(_safe(g.formatLabel));
      if (headerPhase) fmtPhase.push(_safe(headerPhase));
      var fmtPhaseLine = fmtPhase.length > 0
        ? '<div style="font-size:0.72rem;color:var(--text-muted);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + fmtPhase.join(' · ') + '</div>'
        : '';
      // v0.16.76: dice line "🎲 Grupo: ..." removida — usuário pediu pra
      // limpar a duplicação ("já tem a informação abaixo" — os 4 nomes
      // aparecem nos confrontos Jogo 1/2/3 logo abaixo).
      var monarchLine = '';
      // v0.16.76/77: countdown pro próximo sorteio em Liga com auto-draw —
      // INCLUI segundos via tick global em store.js. Pedido do usuário: "a
      // contagem regressiva deve conter os segundos tambem". span tem
      // data-countdown-target=timestamp; setInterval(1s) em store.js
      // re-renderiza textContent via window._formatCountdown — formato
      // "3d 2h 15m 30s" / "18h 30m 15s" / "45m 22s" / "30s".
      var ligaCountdownLine = '';
      if (g.nextDrawAt) {
        var diffMs = g.nextDrawAt - Date.now();
        var urgent = diffMs > 0 && diffMs < 24 * 3600 * 1000;
        var color = urgent ? '#fbbf24' : '#a5b4fc';
        var bg = urgent ? 'rgba(251,191,36,0.12)' : 'rgba(99,102,241,0.12)';
        var border = urgent ? 'rgba(251,191,36,0.3)' : 'rgba(99,102,241,0.3)';
        var initialText = (typeof window._formatCountdown === 'function' && diffMs > 0)
          ? window._formatCountdown(diffMs)
          : (diffMs <= 0 ? 'Agora!' : '...');
        // v0.16.90: toggle Liga "Ativado/Desativado" agora aparece numa
        // linha própria acima do countdown, alinhado à direita (mesmo
        // aspecto dos cards de torneio). Em widget compacto não há linha
        // "Atualizado em" pra encostar — toggle solo na borda direita.
        var _ligaToggleWidget = (g.tRef && typeof window._buildLigaActiveToggleHtml === 'function')
          ? window._buildLigaActiveToggleHtml(g.tRef)
          : '';
        // v0.16.92: stopPropagation na row do toggle (mesmo padrão da
        // dashboard card) — clique no toggle não dispara navegação pra
        // detalhe via card click handler.
        var _toggleRow = _ligaToggleWidget
          ? '<div style="display:flex;justify-content:flex-end;margin-top:6px;" onclick="event.stopPropagation();">' + _ligaToggleWidget + '</div>'
          : '';
        ligaCountdownLine = _toggleRow +
          '<div style="display:inline-flex;align-items:center;gap:6px;font-size:0.7rem;font-weight:600;color:' + color + ';background:' + bg + ';border:1px solid ' + border + ';border-radius:999px;padding:2px 10px;margin-top:6px;">⏱️ próximo sorteio em <span data-countdown-target="' + g.nextDrawAt + '">' + initialText + '</span></div>';
      }
      // Linhas de confronto — uma por match no grupo
      var matchLines = '';
      g.matches.forEach(function(m, mi) {
        var meLbl = m.partner ? 'Você + ' + _safe(m.partner) : 'Você';
        var oppLbl = (m.oppTeam || []).map(_safe).join(' + ');
        // Pra monarch, extrai "Jogo N" do phaseLabel da própria match (cada
        // match no grupo tem phaseLabel diferente: "R2 Grupo H • Jogo 1/2/3").
        var jogoBadge = '';
        if (g.isMonarch && m.phaseLabel) {
          var jm = m.phaseLabel.match(/Jogo\s*(\d+)/i);
          if (jm) jogoBadge = '<span style="display:inline-block;font-size:0.66rem;font-weight:700;color:#a5b4fc;background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.3);border-radius:6px;padding:1px 7px;margin-right:8px;flex-shrink:0;">Jogo ' + jm[1] + '</span>';
        }
        // Box compacto numa linha — Você+Partner vs Adv+Adv
        matchLines += '<div style="display:flex;align-items:center;font-size:0.78rem;padding:5px 0;' + (mi > 0 ? 'border-top:1px dashed rgba(255,255,255,0.06);' : '') + 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' +
          jogoBadge +
          '<span style="color:var(--text-color);overflow:hidden;text-overflow:ellipsis;">' +
            meLbl + ' <span style="opacity:0.5;font-weight:400;margin:0 4px;">vs</span> <span style="color:var(--text-muted);">' + oppLbl + '</span>' +
          '</span>' +
        '</div>';
      });
      // v0.16.84: classificação removida do widget — fica APENAS na tela de
      // detalhe do torneio. Pedido do usuário: "a classificação geral da liga
      // deve aparecer apenas no detalhe da liga e não na dashboard". Mantém
      // dashboard enxuta (foco em "o que vou jogar agora") e o detalhe é o
      // home da informação completa de standings.
      html += '<div onclick="window.location.hash=\'#tournaments/' + g.tournamentId + '\'" style="display:flex;align-items:flex-start;gap:10px;padding:10px;border-radius:8px;cursor:pointer;transition:background 0.15s;' + (gi > 0 ? 'border-top:1px solid var(--border-color);margin-top:6px;padding-top:14px;' : '') + '" onmouseover="this.style.background=\'var(--bg-hover)\'" onmouseout="this.style.background=\'transparent\'">';
      html += '<span style="font-size:1.1rem;line-height:1.2;flex-shrink:0;margin-top:1px;">' + getSportIcon(g.sport) + '</span>';
      html += '<div style="flex:1;min-width:0;overflow:hidden;">';
      html +=   '<div style="font-size:0.86rem;font-weight:700;color:var(--text-bright);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + safeTourney + '</div>';
      html +=   fmtPhaseLine;
      html +=   ligaCountdownLine;
      html +=   '<div style="margin-top:8px;display:flex;flex-direction:column;">' + matchLines + '</div>';
      html += '</div>';
      html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;opacity:0.5;margin-top:3px;"><path d="M9 18l6-6-6-6"/></svg>';
      html += '</div>';
    }
    if (grouped.length > maxShowGroups) {
      html += '<div style="text-align:center;font-size:0.7rem;color:var(--text-muted);padding:4px 0;">' + _t2('dashboard.andMore', {count: grouped.length - maxShowGroups}) + '</div>';
    }
    html += '</div>';
    return html;
  }

  // ── Meus Resultados ─────────────────────────────────────────────────────────
  // v1.8.2-beta: seção abaixo da hero box com (a) partidas pendentes de
  // resultado ou aprovação, (b) próximas partidas (unificado com "Suas Próximas
  // Partidas" em v1.9.0-beta), (c) últimos resultados confirmados.
  function _buildMyResultsHtml() {
    var cu = window.AppStore.currentUser;
    if (!cu) return '';

    var email = cu.email ? cu.email.toLowerCase() : '';
    var dName = (cu.displayName || '').toLowerCase();
    var uid = cu.uid || '';
    var myFullName = cu.displayName || '';

    function _isMe(label) {
      if (!label) return false;
      var l = label.toLowerCase();
      if (uid && l === uid) return true;
      if (email && l === email) return true;
      if (dName && (l === dName || l.indexOf(dName) !== -1 || dName.indexOf(l) !== -1)) return true;
      return false;
    }
    // Verifica se um nome individual é membro de uma dupla do usuário corrente,
    // usando p1Uid/p2Uid do participante — garante individualidade de duplas.
    function _isMeByUid(name, tournament) {
      if (!uid || !name || !tournament) return false;
      var parts = Array.isArray(tournament.participants) ? tournament.participants : [];
      for (var _i = 0; _i < parts.length; _i++) {
        var _p = parts[_i];
        if (!_p || typeof _p !== 'object') continue;
        if (_p.p1Name === name && _p.p1Uid === uid) return true;
        if (_p.p2Name === name && _p.p2Uid === uid) return true;
      }
      return false;
    }

    // Formata time com "(você)" no nome do usuário atual. Nomes completos, sem abreviação.
    // Ex: "Nelson Barth (você) / Zilda Quintas vs. Kelly Barth / Rodrigo Barth"
    function _formatMatchLine(p1raw, p2raw, inP1) {
      var _sf = window._safeHtml || function(s) { return String(s || ''); };
      function markMe(name) {
        return _isMe(name)
          ? '<b style="color:#e2e8f0;">' + _sf(name) + '</b> <span style="color:#a5b4fc;font-size:0.72em;">(você)</span>'
          : '<span style="color:#94a3b8;">' + _sf(name) + '</span>';
      }
      function formatTeam(raw) {
        var names = String(raw || '').split(/\s*\/\s*/).filter(Boolean);
        return names.map(markMe).join(' <span style="opacity:0.4;">/</span> ');
      }
      var side1 = formatTeam(p1raw);
      var side2 = formatTeam(p2raw);
      return side1 + ' <span style="color:#64748b;margin:0 6px;font-weight:500;">vs.</span> ' + side2;
    }

    var pendingForMe = [];   // m.pendingResult e sou time adversário (preciso agir)
    var pendingByMe = [];    // m.pendingResult e sou o proposer (aguardando adversário)
    var disputedMatches = []; // m.pendingResult.disputed — aguardando organizador (Fase 4)
    var noResult = [];       // match sem resultado, torneio ativo, sou participante
    var upcoming = [];       // próximas partidas (sem resultado, resultEntry = organizer)
    var recentConfirmed = []; // últimas partidas com resultado confirmado

    participacoes.forEach(function(t) {
      var matchSources = [];
      if (typeof window._collectAllMatches === 'function') {
        matchSources = window._collectAllMatches(t).slice();
      } else {
        if (Array.isArray(t.matches)) matchSources = matchSources.concat(t.matches);
        if (t.thirdPlaceMatch) matchSources.push(t.thirdPlaceMatch);
        if (Array.isArray(t.rounds)) t.rounds.forEach(function(r) {
          if (r && Array.isArray(r.matches)) matchSources = matchSources.concat(r.matches);
          else if (Array.isArray(r)) matchSources = matchSources.concat(r);
        });
        if (Array.isArray(t.groups)) t.groups.forEach(function(g) {
          if (g && Array.isArray(g.matches)) matchSources = matchSources.concat(g.matches);
        });
        if (Array.isArray(t.rodadas)) t.rodadas.forEach(function(r) {
          if (r && Array.isArray(r.matches)) matchSources = matchSources.concat(r.matches);
          else if (Array.isArray(r)) matchSources = matchSources.concat(r);
        });
      }

      matchSources.forEach(function(m) {
        if (!m) return;
        if (!m.p1 || !m.p2 || m.p1 === 'BYE' || m.p2 === 'BYE' || m.p1 === 'TBD' || m.p2 === 'TBD') return;

        // Am I in this match?
        var p1Names = String(m.p1 || '').split(/\s*\/\s*/).filter(Boolean);
        var p2Names = String(m.p2 || '').split(/\s*\/\s*/).filter(Boolean);
        if (m.isMonarch && Array.isArray(m.team1)) p1Names = m.team1.slice();
        if (m.isMonarch && Array.isArray(m.team2)) p2Names = m.team2.slice();
        var inP1 = p1Names.some(_isMe) || _isMe(m.p1) || p1Names.some(function(n) { return _isMeByUid(n, t); });
        var inP2 = p2Names.some(_isMe) || _isMe(m.p2) || p2Names.some(function(n) { return _isMeByUid(n, t); });
        if (!inP1 && !inP2) return;

        // Fase/rodada para exibir no card (igual ao "Próximas Partidas" antigo)
        var _phaseLabel = '';
        if (m.label) _phaseLabel = String(m.label);
        else if (m.roundLabel) _phaseLabel = String(m.roundLabel);
        else if (m.round != null) _phaseLabel = 'Rodada ' + m.round;
        var _formatLabel = m.isMonarch ? 'Rei/Rainha' : (t.format || '');
        if (t.format === 'Liga' && t.ligaRoundFormat === 'rei_rainha' && m.isMonarch) _formatLabel = 'Liga · Rei/Rainha';
        var _subLine = [_formatLabel, _phaseLabel].filter(Boolean).join(' · ');

        var matchInfo = {
          tId: t.id, tName: t.name || '', sport: t.sport || '', m: m,
          opp: inP1 ? (m.p2 || '') : (m.p1 || ''),
          subLine: _subLine
        };

        if (m.winner) {
          // Confirmed result — up to 10 recent
          recentConfirmed.push(Object.assign({ confirmedAt: m.updatedAt || m.proposedAt || 0, inP1: inP1 }, matchInfo));
        } else if (m.pendingResult) {
          var pr = m.pendingResult;
          if (pr.disputed) {
            // Fase 4: já contestado — aguardando organizador. Jogador não age mais.
            disputedMatches.push(Object.assign({ inP1: inP1 }, matchInfo));
          } else {
            var isProposerSelf = (uid && pr.proposedBy === uid) || (email && pr.proposedByEmail === (cu.email || '').toLowerCase());
            if (isProposerSelf) {
              pendingByMe.push(Object.assign({ inP1: inP1 }, matchInfo));
            } else {
              pendingForMe.push(Object.assign({ inP1: inP1 }, matchInfo));
            }
          }
        } else if (t.status !== 'finished') {
          var re = t.resultEntry || 'organizer';
          var canLaunch = (re === 'players' || re === 'all' || (Array.isArray(re) && re.indexOf('players') !== -1));
          if (canLaunch) {
            noResult.push(Object.assign({ inP1: inP1 }, matchInfo));
          } else {
            // resultEntry = organizer: aparece como "próxima partida" (só ver)
            upcoming.push(Object.assign({ inP1: inP1 }, matchInfo));
          }
        }
      });
    });

    // Recent confirmed: sort by confirmedAt desc, cap at 5
    recentConfirmed.sort(function(a, b) { return (b.confirmedAt || 0) - (a.confirmedAt || 0); });
    recentConfirmed = recentConfirmed.slice(0, 5);

    var totalSection = pendingForMe.length + pendingByMe.length + disputedMatches.length + noResult.length + upcoming.length + recentConfirmed.length;
    if (totalSection === 0) return '';

    var _sf = window._safeHtml || function(s) { return String(s || ''); };
    var _sportIcon = function(s) {
      var sL = (s || '').toLowerCase();
      if (sL.indexOf('beach') !== -1) return '🎾';
      if (sL.indexOf('paddle') !== -1 || sL.indexOf('padel') !== -1) return '🏓';
      if (sL.indexOf('pickle') !== -1) return '🥒';
      if (sL.indexOf('tenis') !== -1 || sL.indexOf('tênis') !== -1) return '🎾';
      if (sL.indexOf('squash') !== -1) return '🟡';
      if (sL.indexOf('badmin') !== -1) return '🏸';
      if (sL.indexOf('volei') !== -1 || sL.indexOf('vôlei') !== -1) return '🏐';
      return '🏅';
    };

    var _hasPendingApproval = (pendingForMe.length + pendingByMe.length + disputedMatches.length) > 0;
    var html = '<div id="meus-resultados-section"' + (_hasPendingApproval ? ' data-has-pending="1"' : '') + ' style="background:rgba(99,102,241,0.05);border:1px solid rgba(99,102,241,0.15);border-radius:14px;padding:14px 16px;margin-bottom:1rem;">';
    html += '<h3 style="margin:0 0 12px;font-size:0.85rem;font-weight:700;color:#a5b4fc;letter-spacing:0.04em;text-transform:uppercase;">🏅 Meus Resultados</h3>';

    // Calcula label de fase para eliminatórias (FINAL, SEMI-FINAL etc.)
    function _elabFaseLabel(t, m) {
      // Conta partidas totais do torneio (excluindo BYE/TBD) para estimar total de times
      var allM = (typeof window._collectAllMatches === 'function') ? window._collectAllMatches(t) : (t.matches || []);
      var realMatches = allM.filter(function(mm) {
        return mm && mm.p1 && mm.p2 && mm.p1 !== 'BYE' && mm.p2 !== 'BYE' && mm.p1 !== 'TBD' && mm.p2 !== 'TBD';
      });
      // Número de rodadas = log2(times) para single elim. Derivamos do round máximo.
      var maxRound = 0;
      realMatches.forEach(function(mm) { if ((mm.round || 0) > maxRound) maxRound = mm.round || 0; });
      var curRound = m.round || 0;
      // fromEnd: 0 = final, 1 = semi, 2 = quartas, 3 = oitavas
      var fromEnd = maxRound - curRound;
      var phaseStr = '';
      if (maxRound > 0) {
        if (fromEnd === 0) phaseStr = 'Final';
        else if (fromEnd === 1) phaseStr = 'Semifinal';
        else if (fromEnd === 2) phaseStr = 'Quartas de Final';
        else if (fromEnd === 3) phaseStr = 'Oitavas de Final';
        else phaseStr = 'Rodada ' + curRound;
        // Sufixo (R<n>) quando o nome genérico seria ambíguo
        if (maxRound > 1) phaseStr += ' (R' + curRound + ')';
      } else if (m.label) {
        phaseStr = m.label;
      } else if (m.roundLabel) {
        phaseStr = m.roundLabel;
      } else if (curRound) {
        phaseStr = 'Rodada ' + curRound;
      }
      return phaseStr;
    }

    // helper: card de match com linha de nomes formatada
    function _matchCard(item, bgStyle, borderStyle, extra) {
      var nav = 'window.location.hash=\'#bracket/' + _sf(item.tId) + '\'';
      var nameLine = _formatMatchLine(item.m.p1 || '', item.m.p2 || '', item.inP1);
      var subMeta = item.subLine
        ? _sf(item.tName) + ' <span style="opacity:0.5;">·</span> ' + _sf(item.subLine)
        : _sf(item.tName);
      return '<div onclick="' + nav + '" style="cursor:pointer;' + bgStyle + ';border:1px solid ' + borderStyle + ';border-radius:8px;padding:8px 10px;margin-bottom:5px;display:flex;align-items:flex-start;gap:8px;">' +
        '<span style="font-size:1rem;flex-shrink:0;margin-top:2px;">' + _sportIcon(item.sport) + '</span>' +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-size:0.79rem;line-height:1.4;color:#f1f5f9;">' + nameLine + '</div>' +
          '<div style="font-size:0.65rem;color:var(--text-muted);margin-top:2px;">' + subMeta + '</div>' +
          (extra || '') +
        '</div>';
    }

    // helper: mini bracket card — estrutura idêntica ao bracket.js:
    //   • coluna bracket-round-column: min-width 280px, max-width 320px (não full-width!)
    //   • título da coluna com barra colorida à esquerda (border-left) + nome da fase
    //   • card do jogo igual ao renderMatchCard: header com label + Ao Vivo + Confirmar
    //   • "Ir para Torneio" no footer do card (não no header)
    function _miniBracketCard(item, canLaunch) {
      var tId = _sf(item.tId);
      var mId = _sf(item.m.id || '');
      var p1 = item.m.p1 || '';
      var p2 = item.m.p2 || '';
      var _esc = function(s) { return String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'"); };

      // Fase label + cor da barra (igual às colunas do bracket)
      var tRef = participacoes.find(function(tt) { return tt.id === item.tId; });
      var faseStr = tRef ? _elabFaseLabel(tRef, item.m) : (item.subLine || '');
      // Cor baseada na fase — Final=ouro, Semi=ciano, Quartas=verde, resto=primário
      var faseColor = '#fbbf24'; // ouro por padrão (Final)
      var faseLower = faseStr.toLowerCase();
      if (faseLower.indexOf('semi') !== -1) faseColor = '#06b6d4';
      else if (faseLower.indexOf('quarta') !== -1) faseColor = '#4ade80';
      else if (faseLower.indexOf('oitava') !== -1 || faseLower.indexOf('rodada') !== -1) faseColor = '#818cf8';

      // matchLabel — JOGO N do match ou fallback
      var matchLabel = item.m.label || 'JOGO 1';

      // Foto real do jogador: tenta _playerPhotoCache, depois perfil do usuário
      function _initials(name) {
        return (name || '?').split(/\s+/).slice(0,2).map(function(w){return w[0]||'';}).join('').toUpperCase();
      }
      function _photoForPlayer(name) {
        // Próprio usuário: foto do próprio perfil em sessão
        if (_isMe(name) && cu && cu.photoURL && cu.photoURL.indexOf('dicebear.com') === -1) return cu.photoURL;
        // Cache global de fotos por nome (populado por _preloadPlayerPhotos —
        // SEMPRE a foto real do perfil do usuário, por uid). Chave é lowercase.
        if (window._playerPhotoCache) {
          var _c = window._playerPhotoCache[(name || '').toLowerCase()];
          if (_c && _c.indexOf('dicebear.com') === -1) return _c;
        }
        // Sem foto de perfil em cache → null (cai em iniciais; será trocado
        // pelo swap pós-preload). NÃO usar p.photoURL armazenado (pode estar
        // defasado — a regra é sempre a foto do perfil real).
        return null;
      }
      // Um jogador (linha): avatar + nome
      function _playerRow(name) {
        var isMe = _isMe(name);
        var photo = _photoForPlayer(name);
        // Usa _profileAvatarUrl (dicebear initials como fallback) — mesmo pipeline do bracket
        var avatarSrc = (typeof window._profileAvatarUrl === 'function')
          ? window._profileAvatarUrl(name, photo, 28)
          : (photo || ('https://api.dicebear.com/9.x/initials/svg?seed=' + encodeURIComponent(name) + '&backgroundColor=6366f1&textColor=ffffff&fontSize=42&size=28'));
        var avatarEl = '<img src="' + avatarSrc + '" data-player-name="' + _sf(name) + '" style="width:28px;height:28px;border-radius:50%;object-fit:cover;flex-shrink:0;" onerror="this.src=\'https://api.dicebear.com/9.x/initials/svg?seed=' + encodeURIComponent(name) + '&backgroundColor=6366f1&textColor=ffffff&fontSize=42&size=28\'">';
        var nameEl = '<span style="font-size:0.8rem;font-weight:' + (isMe ? '700' : '500') + ';color:' + (isMe ? '#f1f5f9' : '#94a3b8') + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + _sf(name) + (isMe ? ' <span style="font-size:0.65em;color:#818cf8;font-weight:800;">(você)</span>' : '') + '</span>';
        return '<div style="display:flex;align-items:center;gap:6px;min-width:0;">' + avatarEl + nameEl + '</div>';
      }
      // Time: jogadores EMPILHADOS verticalmente (um em cima do outro)
      function _teamHtml(teamStr) {
        var parts = String(teamStr).split(/\s*\/\s*/).filter(Boolean);
        return '<div style="display:flex;flex-direction:column;gap:4px;flex:1;min-width:0;">' +
          parts.map(_playerRow).join('') +
        '</div>';
      }

      var rowStyle = 'display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;background:rgba(255,255,255,0.03);margin-bottom:4px;';
      var scoreInputStyle = 'width:52px;text-align:center;font-size:0.95rem;font-weight:700;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);color:var(--text-bright);border-radius:6px;padding:4px 6px;-moz-appearance:textfield;';
      var scorePlaceholder = '<div style="width:52px;height:30px;border-radius:6px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:center;font-size:0.9rem;color:#475569;flex-shrink:0;">0</div>';

      // opts.pendingScores = {p1, p2} → mostra placar âmbar read-only (estado pendente)
      // opts.headerBtns → HTML dos botões no header (substitui Ao Vivo + Confirmar)
      // opts.cardBorder / opts.cardBg → override de estilo do card
      var opts = arguments[2] || {};
      var pendingScores = opts.pendingScores || null;
      var headerBtns = opts.headerBtns != null ? opts.headerBtns : null;
      var cardBorderStr = opts.cardBorder || 'rgba(99,102,241,0.6)';
      var cardBgStr = opts.cardBg || 'rgba(99,102,241,0.06)';
      var cardShadow = opts.cardShadow || '0 0 20px rgba(99,102,241,0.25),0 4px 12px rgba(0,0,0,0.15)';

      var pendingScoreStyle = 'font-weight:800;font-size:1rem;min-width:28px;text-align:center;color:#fbbf24;font-style:italic;flex-shrink:0;';

      var p1ScoreHtml = pendingScores
        ? '<span style="' + pendingScoreStyle + '">' + (pendingScores.p1 != null ? pendingScores.p1 : '?') + '</span>'
        : canLaunch
          ? '<input id="s1-' + mId + '" type="number" min="0" placeholder="0" onclick="event.stopPropagation();" oninput="window._highlightWinner&&window._highlightWinner(\'' + _esc(mId) + '\')" style="' + scoreInputStyle + 'flex-shrink:0;">'
          : scorePlaceholder;
      var p2ScoreHtml = pendingScores
        ? '<span style="' + pendingScoreStyle + '">' + (pendingScores.p2 != null ? pendingScores.p2 : '?') + '</span>'
        : canLaunch
          ? '<input id="s2-' + mId + '" type="number" min="0" placeholder="0" onclick="event.stopPropagation();" oninput="window._highlightWinner&&window._highlightWinner(\'' + _esc(mId) + '\')" style="' + scoreInputStyle + 'flex-shrink:0;">'
          : scorePlaceholder;

      var defaultHeaderBtns = '';
      if (headerBtns === null) {
        var liveBtnHtml = (!pendingScores && canLaunch)
          ? '<button onclick="event.stopPropagation();window._openLiveScoring(\'' + _esc(tId) + '\',\'' + _esc(mId) + '\')" style="background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);color:#f87171;border-radius:6px;padding:3px 10px;font-size:0.72rem;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:3px;" onmouseover="this.style.background=\'rgba(239,68,68,0.3)\'" onmouseout="this.style.background=\'rgba(239,68,68,0.15)\'">📡 Ao Vivo</button>'
          : '';
        var confirmBtnHtml = (!pendingScores && canLaunch)
          ? '<button id="confirm-' + mId + '" onclick="event.stopPropagation();window._saveResultInline(\'' + _esc(tId) + '\',\'' + _esc(mId) + '\')" style="background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.3);color:#4ade80;border-radius:6px;padding:3px 10px;font-size:0.72rem;font-weight:700;cursor:pointer;" onmouseover="this.style.background=\'rgba(16,185,129,0.3)\'" onmouseout="this.style.background=\'rgba(16,185,129,0.15)\'">✓ Confirmar</button>'
          : '';
        defaultHeaderBtns = liveBtnHtml + confirmBtnHtml;
      }
      var finalHeaderBtns = headerBtns !== null ? headerBtns : defaultHeaderBtns;

      var goToBtnFooter = '<div style="display:flex;justify-content:flex-end;margin-top:8px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.06);">' +
        '<button onclick="event.stopPropagation();window._goToTournamentMatch(\'' + _esc(tId) + '\',\'' + _esc(mId) + '\')" style="background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.25);color:#818cf8;border-radius:6px;padding:3px 10px;font-size:0.7rem;font-weight:600;cursor:pointer;" onmouseover="this.style.background=\'rgba(99,102,241,0.2)\'" onmouseout="this.style.background=\'rgba(99,102,241,0.1)\'">Ir para Torneio →</button>' +
        '</div>';

      return '<div style="min-width:300px;max-width:360px;display:flex;flex-direction:column;gap:0.6rem;">' +
        '<div style="display:flex;align-items:center;gap:8px;">' +
          '<h4 style="color:' + faseColor + ';font-size:0.75rem;text-transform:uppercase;letter-spacing:2px;margin:0;border-left:3px solid ' + faseColor + ';padding-left:8px;flex:1;">' +
            (faseLower.indexOf('final') !== -1 ? '🏆 ' : '') + _sf(faseStr) +
            '<span style="font-weight:400;color:var(--text-muted);font-size:0.65rem;margin-left:6px;">' + _sf(item.tName) + '</span>' +
          '</h4>' +
        '</div>' +
        '<div id="card-' + mId + '" style="background:' + cardBgStr + ';border:2px solid ' + cardBorderStr + ';border-radius:12px;padding:14px;box-shadow:' + cardShadow + ';">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:5px;gap:6px;">' +
            '<span style="font-size:0.7rem;font-weight:700;color:#38bdf8;text-transform:uppercase;flex-shrink:0;">' + _sf(matchLabel) + '</span>' +
            '<div id="header-btns-' + mId + '" style="display:flex;align-items:center;gap:4px;flex-wrap:nowrap;min-width:0;">' + finalHeaderBtns + '</div>' +
          '</div>' +
          '<div style="' + rowStyle + '">' + _teamHtml(p1) + '<div id="score-p1-' + mId + '" style="display:flex;align-items:center;flex-shrink:0;">' + p1ScoreHtml + '</div></div>' +
          '<div style="text-align:center;font-size:0.65rem;color:var(--text-muted);font-weight:800;letter-spacing:2px;padding:3px 0;">VS</div>' +
          '<div style="' + rowStyle + '">' + _teamHtml(p2) + '<div id="score-p2-' + mId + '" style="display:flex;align-items:center;flex-shrink:0;">' + p2ScoreHtml + '</div></div>' +
          goToBtnFooter +
        '</div>' +
      '</div>';
    }

    // ── Aguardando minha aprovação ──
    if (pendingForMe.length > 0) {
      html += '<div style="margin-bottom:10px;">';
      html += '<p style="margin:0 0 8px;font-size:0.72rem;font-weight:700;color:#fbbf24;text-transform:uppercase;letter-spacing:0.04em;">⏳ Aguardando sua aprovação (' + pendingForMe.length + ')</p>';
      html += '<div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start;">';
      var _pendTag = '<span style="font-size:0.58rem;font-weight:800;color:#fbbf24;background:rgba(251,191,36,0.15);padding:2px 5px;border-radius:4px;text-transform:uppercase;letter-spacing:0.03em;flex-shrink:0;">PENDENTE</span>';
      var _btnStyle = function(r,g,b) { return 'border:1px solid rgba('+r+','+g+','+b+',0.4);color:rgba('+r+','+g+','+b+',1);border-radius:6px;padding:2px 7px;font-size:0.65rem;font-weight:700;cursor:pointer;white-space:nowrap;flex-shrink:0;background:rgba('+r+','+g+','+b+',0.15);'; };
      pendingForMe.forEach(function(item) {
        var pr = item.m.pendingResult || {};
        var s1 = pr.scoreP1, s2 = pr.scoreP2;
        var mid = String(item.m.id || '');
        // Fase 1: adversário vê proposta original → Editar + Confirmar
        // Fase 3: time original vê contra-proposta → Confirmar + Contestar
        var _isCounter = !!pr.isCounterProposal;
        var btns = _pendTag;
        if (_isCounter) {
          btns += '<button data-pending-action="contest" data-tid="' + _sf(item.tId) + '" data-mid="' + _sf(mid) + '" style="' + _btnStyle(239,68,68) + '">❌ Contestar</button>';
          btns += '<button data-pending-action="approve" data-tid="' + _sf(item.tId) + '" data-mid="' + _sf(mid) + '" style="' + _btnStyle(16,185,129) + '">✅ Confirmar</button>';
        } else {
          btns += '<button data-pending-action="edit" data-tid="' + _sf(item.tId) + '" data-mid="' + _sf(mid) + '" style="' + _btnStyle(99,102,241) + '">✏️ Editar</button>';
          btns += '<button data-pending-action="approve" data-tid="' + _sf(item.tId) + '" data-mid="' + _sf(mid) + '" style="' + _btnStyle(16,185,129) + '">✅ Confirmar</button>';
        }
        html += _miniBracketCard(item, false, {
          pendingScores: {p1: s1, p2: s2},
          headerBtns: btns,
          cardBorder: 'rgba(251,191,36,0.6)',
          cardBg: 'rgba(251,191,36,0.06)',
          cardShadow: '0 0 14px rgba(251,191,36,0.18),0 4px 12px rgba(0,0,0,0.15)'
        });
      });
      html += '</div></div>';
    }

    // ── Resultado proposto aguardando adversário ──
    if (pendingByMe.length > 0) {
      html += '<div style="margin-bottom:10px;">';
      html += '<p style="margin:0 0 8px;font-size:0.72rem;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.04em;">🕐 Aguardando confirmação do adversário (' + pendingByMe.length + ')</p>';
      html += '<div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start;">';
      var _pendTag2 = '<span style="font-size:0.6rem;font-weight:800;color:#fbbf24;background:rgba(251,191,36,0.15);padding:2px 6px;border-radius:4px;text-transform:uppercase;letter-spacing:0.04em;">PENDENTE</span>';
      pendingByMe.forEach(function(item) {
        var pr = item.m.pendingResult || {};
        var s1 = pr.scoreP1, s2 = pr.scoreP2;
        var mid = String(item.m.id || '');
        var btns = _pendTag2 +
          '<button data-pending-action="edit" data-tid="' + _sf(item.tId) + '" data-mid="' + _sf(mid) + '" style="background:rgba(99,102,241,0.12);border:1px solid rgba(99,102,241,0.35);color:#a78bfa;border-radius:6px;padding:3px 8px;font-size:0.7rem;font-weight:700;cursor:pointer;margin-left:4px;">✏️ Editar</button>';
        html += _miniBracketCard(item, false, {
          pendingScores: {p1: s1, p2: s2},
          headerBtns: btns,
          cardBorder: 'rgba(148,163,184,0.4)',
          cardBg: 'rgba(148,163,184,0.06)',
          cardShadow: '0 4px 12px rgba(0,0,0,0.15)'
        });
      });
      html += '</div></div>';
    }

    // ── Em disputa — aguardando organizador (Fase 4) ──
    if (disputedMatches.length > 0) {
      html += '<div style="margin-bottom:10px;">';
      html += '<p style="margin:0 0 8px;font-size:0.72rem;font-weight:700;color:#f87171;text-transform:uppercase;letter-spacing:0.04em;">🚨 Em disputa — aguardando organizador (' + disputedMatches.length + ')</p>';
      html += '<div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start;">';
      var _dispTag = '<span style="font-size:0.6rem;font-weight:800;color:#f87171;background:rgba(239,68,68,0.15);padding:2px 6px;border-radius:4px;text-transform:uppercase;letter-spacing:0.04em;flex-shrink:0;">EM DISPUTA</span>';
      disputedMatches.forEach(function(item) {
        var pr = item.m.pendingResult || {};
        var s1 = pr.scoreP1, s2 = pr.scoreP2;
        // Sem botões de ação — o jogador não age mais, só o organizador (no bracket).
        html += _miniBracketCard(item, false, {
          pendingScores: {p1: s1, p2: s2},
          headerBtns: _dispTag,
          cardBorder: 'rgba(239,68,68,0.5)',
          cardBg: 'rgba(239,68,68,0.06)',
          cardShadow: '0 0 14px rgba(239,68,68,0.18),0 4px 12px rgba(0,0,0,0.15)'
        });
      });
      html += '</div></div>';
    }

    // ── Próximos jogos (horizontal, até 3, mais imediato à esquerda) ──
    // Combina noResult (pode lançar) + upcoming (só ver) em ordem cronológica
    var allUpcoming = [];
    noResult.forEach(function(i) { allUpcoming.push({ item: i, canLaunch: true }); });
    upcoming.forEach(function(i) { allUpcoming.push({ item: i, canLaunch: false }); });
    // Ordena por round (menor = mais imediato)
    allUpcoming.sort(function(a, b) { return (a.item.m.round || 0) - (b.item.m.round || 0); });

    if (allUpcoming.length > 0) {
      var shown3 = allUpcoming.slice(0, 3);
      html += '<div style="margin-bottom:10px;">';
      html += '<p style="margin:0 0 8px;font-size:0.72rem;font-weight:700;color:#38bdf8;text-transform:uppercase;letter-spacing:0.04em;">⚔️ Próximos jogos (' + allUpcoming.length + ')</p>';
      html += '<div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start;">';
      shown3.forEach(function(entry) {
        html += _miniBracketCard(entry.item, entry.canLaunch);
      });
      html += '</div>';
      if (allUpcoming.length > 3) {
        html += '<p style="margin:6px 0 0;font-size:0.68rem;color:var(--text-muted);text-align:center;">...e mais ' + (allUpcoming.length - 3) + ' jogos — <a href="#" onclick="event.preventDefault();window.location.hash=\'#tournaments\'" style="color:#818cf8;">ver todos os torneios</a></p>';
      }
      html += '</div>';
    }

    // ── Últimos resultados confirmados — estilo chave (não card flat) ──
    if (recentConfirmed.length > 0) {
      html += '<div>';
      html += '<p style="margin:0 0 8px;font-size:0.72rem;font-weight:700;color:#4ade80;text-transform:uppercase;letter-spacing:0.04em;">✅ Últimos resultados (' + recentConfirmed.length + ')</p>';
      html += '<div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start;">';
      recentConfirmed.forEach(function(item) {
        var m2 = item.m;
        var _esc2 = function(s) { return String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'"); };
        var tRef2 = participacoes.find(function(tt) { return tt.id === item.tId; });
        var faseStr2 = tRef2 ? _elabFaseLabel(tRef2, m2) : (item.subLine || '');
        var faseLower2 = faseStr2.toLowerCase();
        var faseColor2 = faseLower2.indexOf('final') !== -1 ? '#fbbf24'
          : faseLower2.indexOf('semi') !== -1 ? '#06b6d4'
          : faseLower2.indexOf('quarta') !== -1 ? '#4ade80' : '#818cf8';

        // vitória/derrota/empate
        var myTeamStr = item.inP1 ? (m2.p1 || '') : (m2.p2 || '');
        var isWinner = !!m2.winner && !m2.draw && (
          m2.winner === myTeamStr ||
          String(myTeamStr).split(/\s*\/\s*/).some(function(n) { return _isMe(n) && m2.winner.indexOf(n) !== -1; })
        );
        var resultColor = m2.draw ? '#94a3b8' : (isWinner ? '#4ade80' : '#f87171');
        var resultLabel = m2.draw ? 'Empate' : (isWinner ? '🏆 Vitória' : 'Derrota');

        // placar — mostra pelo lado do usuário (p1 ou p2)
        function _scoreDisplay(p1, p2) {
          return '<span style="font-size:0.95rem;font-weight:800;color:#f1f5f9;">' + _sf(String(p1)) + '</span>' +
            '<span style="font-size:0.75rem;color:#475569;margin:0 4px;">×</span>' +
            '<span style="font-size:0.95rem;font-weight:800;color:#f1f5f9;">' + _sf(String(p2)) + '</span>';
        }
        var scoresHtml = '';
        if (Array.isArray(m2.sets) && m2.sets.length > 0) {
          scoresHtml = m2.sets.map(function(s) {
            return _scoreDisplay(item.inP1 ? s.gamesP1 : s.gamesP2, item.inP1 ? s.gamesP2 : s.gamesP1);
          }).join('<span style="color:#334155;margin:0 6px;">·</span>');
        } else if (m2.scoreP1 != null && m2.scoreP2 != null) {
          scoresHtml = _scoreDisplay(item.inP1 ? m2.scoreP1 : m2.scoreP2, item.inP1 ? m2.scoreP2 : m2.scoreP1);
        }

        // mesmo estilo de coluna que _miniBracketCard
        var matchLabel2 = m2.label || 'JOGO 1';
        var rowStyle2 = 'display:flex;align-items:center;gap:10px;padding:7px 10px;border-radius:8px;margin-bottom:4px;';
        function _teamRowResult(teamStr, isWinnerSide) {
          var bg = isWinnerSide ? 'background:rgba(16,185,129,0.12);border-left:3px solid #10b981;' : 'background:rgba(255,255,255,0.02);';
          var parts2 = String(teamStr).split(/\s*\/\s*/).filter(Boolean);
          var playersHtml = '<div style="display:flex;flex-direction:column;gap:4px;flex:1;min-width:0;">';
          parts2.forEach(function(n) {
            var isMe2 = _isMe(n);
            var _pc2 = (window._playerPhotoCache && window._playerPhotoCache[(n || '').toLowerCase()]);
            var photo2 = (_pc2 && _pc2.indexOf('dicebear.com') === -1) ? _pc2
              : ((isMe2 && cu && cu.photoURL && cu.photoURL.indexOf('dicebear.com') === -1) ? cu.photoURL : null);
            var _ini2url = 'https://api.dicebear.com/9.x/initials/svg?seed=' + encodeURIComponent(n || '?') + '&backgroundColor=' + (isMe2 ? '6366f1' : '94a3b8') + '&textColor=ffffff&fontSize=42&size=26';
            var av2 = '<img src="' + (photo2 || _ini2url) + '" data-player-name="' + _sf(n) + '" style="width:26px;height:26px;border-radius:50%;object-fit:cover;flex-shrink:0;" onerror="this.onerror=null;this.src=\'' + _ini2url + '\'">';
            playersHtml += '<div style="display:flex;align-items:center;gap:6px;">' + av2 +
              '<span style="font-size:0.78rem;font-weight:' + (isMe2 ? '700' : '400') + ';color:' + (isMe2 ? '#f1f5f9' : '#94a3b8') + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + _sf(n) + (isMe2 ? ' <span style="font-size:0.62em;color:#818cf8;">(você)</span>' : '') + '</span>' +
              '</div>';
          });
          playersHtml += '</div>';
          return '<div style="' + rowStyle2 + bg + '">' + playersHtml + '</div>';
        }

        var p1IsWinner = !m2.draw && m2.winner === m2.p1;
        var p2IsWinner = !m2.draw && m2.winner === m2.p2;

        // v1.9.99: posição final do usuário no torneio (quando a participação já
        // está definida em t.classification — ex.: vice = 2º). Mostrada abaixo do
        // nome do torneio e acima da chave.
        var _finalPos = null;
        if (tRef2 && tRef2.classification && typeof tRef2.classification === 'object') {
          if (tRef2.classification[myTeamStr] != null) {
            _finalPos = tRef2.classification[myTeamStr];
          } else {
            Object.keys(tRef2.classification).forEach(function(k) {
              if (_finalPos == null && String(k).split(/\s*\/\s*/).some(function(n) { return _isMe(n); })) {
                _finalPos = tRef2.classification[k];
              }
            });
          }
        }
        var _posBadge = '';
        if (_finalPos != null && !isNaN(Number(_finalPos))) {
          var _fp = Number(_finalPos);
          var _posMedal = _fp === 1 ? '🥇' : _fp === 2 ? '🥈' : _fp === 3 ? '🥉' : '🏅';
          var _posCol = _fp === 1 ? '#fbbf24' : _fp === 2 ? '#cbd5e1' : _fp === 3 ? '#d97706' : '#94a3b8';
          // v2.0.3: mais destaque — "2º lugar" + medalha, sem "Você terminou em",
          // fonte ~2x maior.
          _posBadge = '<div style="font-size:1.45rem;font-weight:900;color:' + _posCol + ';margin:4px 0 8px;display:flex;align-items:center;gap:8px;line-height:1.1;">' +
            '<span>' + _fp + 'º lugar</span>' +
            '<span style="font-size:1.6rem;">' + _posMedal + '</span></div>';
        }

        html += '<div style="min-width:280px;max-width:320px;display:flex;flex-direction:column;gap:0.6rem;">' +
          '<div style="display:flex;align-items:center;gap:8px;">' +
            '<h4 style="color:' + faseColor2 + ';font-size:0.75rem;text-transform:uppercase;letter-spacing:2px;margin:0;border-left:3px solid ' + faseColor2 + ';padding-left:8px;flex:1;">' +
              (faseLower2.indexOf('final') !== -1 ? '🏆 ' : '') + _sf(faseStr2) +
              '<span style="font-weight:400;color:var(--text-muted);font-size:0.65rem;margin-left:6px;">' + _sf(item.tName) + '</span>' +
            '</h4>' +
          '</div>' +
          _posBadge +
          '<div onclick="window.location.hash=\'#bracket/' + _esc2(item.tId) + '\'" style="cursor:pointer;background:var(--bg-card);border:1px solid rgba(16,185,129,0.3);border-radius:12px;padding:14px;box-shadow:0 4px 12px rgba(0,0,0,0.15);">' +
            // Header: label + badge resultado
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:5px;">' +
              '<span style="font-size:0.7rem;font-weight:700;color:#38bdf8;text-transform:uppercase;">' + _sf(matchLabel2) + '</span>' +
              '<span style="font-size:0.75rem;font-weight:800;color:' + resultColor + ';">' + resultLabel + '</span>' +
            '</div>' +
            // P1 row com placar
            '<div style="' + rowStyle2 + (p1IsWinner ? 'background:rgba(16,185,129,0.12);border-left:3px solid #10b981;' : 'background:rgba(255,255,255,0.02);') + 'justify-content:space-between;">' +
              (function(){
                var parts3 = String(m2.p1||'').split(/\s*\/\s*/).filter(Boolean);
                var ph = '<div style="display:flex;flex-direction:column;gap:4px;flex:1;min-width:0;">';
                parts3.forEach(function(n){
                  var isMe3=_isMe(n); var _pc3=(window._playerPhotoCache&&window._playerPhotoCache[(n||'').toLowerCase()]); var ph2=(_pc3&&_pc3.indexOf('dicebear.com')===-1)?_pc3:((isMe3&&cu&&cu.photoURL&&cu.photoURL.indexOf('dicebear.com')===-1)?cu.photoURL:null);
                  var _ini3url='https://api.dicebear.com/9.x/initials/svg?seed='+encodeURIComponent(n||'?')+'&backgroundColor='+(isMe3?'6366f1':'94a3b8')+'&textColor=ffffff&fontSize=42&size=26';
                  var av3='<img src="'+(ph2||_ini3url)+'" data-player-name="'+_sf(n)+'" style="width:26px;height:26px;border-radius:50%;object-fit:cover;flex-shrink:0;" onerror="this.onerror=null;this.src=\''+_ini3url+'\'">';
                  ph+='<div style="display:flex;align-items:center;gap:6px;">'+av3+'<span style="font-size:0.78rem;font-weight:'+(isMe3?'700':'400')+';color:'+(isMe3?'#f1f5f9':'#94a3b8')+';">'+_sf(n)+(isMe3?' <span style="font-size:0.62em;color:#818cf8;">(você)</span>':'')+'</span></div>';
                });
                ph+='</div>';
                var sc3 = m2.scoreP1 != null ? '<div style="font-size:1rem;font-weight:800;color:'+(p1IsWinner?'#4ade80':'#94a3b8')+';flex-shrink:0;min-width:28px;text-align:right;">'+m2.scoreP1+'</div>' : '';
                return ph+sc3;
              })() +
            '</div>' +
            '<div style="text-align:center;font-size:0.65rem;color:var(--text-muted);font-weight:800;letter-spacing:2px;padding:3px 0;">VS</div>' +
            // P2 row com placar
            '<div style="' + rowStyle2 + (p2IsWinner ? 'background:rgba(16,185,129,0.12);border-left:3px solid #10b981;' : 'background:rgba(255,255,255,0.02);') + 'justify-content:space-between;">' +
              (function(){
                var parts4 = String(m2.p2||'').split(/\s*\/\s*/).filter(Boolean);
                var ph = '<div style="display:flex;flex-direction:column;gap:4px;flex:1;min-width:0;">';
                parts4.forEach(function(n){
                  var isMe4=_isMe(n); var _pc4=(window._playerPhotoCache&&window._playerPhotoCache[(n||'').toLowerCase()]); var ph2=(_pc4&&_pc4.indexOf('dicebear.com')===-1)?_pc4:((isMe4&&cu&&cu.photoURL&&cu.photoURL.indexOf('dicebear.com')===-1)?cu.photoURL:null);
                  var _ini4url='https://api.dicebear.com/9.x/initials/svg?seed='+encodeURIComponent(n||'?')+'&backgroundColor='+(isMe4?'6366f1':'94a3b8')+'&textColor=ffffff&fontSize=42&size=26';
                  var av4='<img src="'+(ph2||_ini4url)+'" data-player-name="'+_sf(n)+'" style="width:26px;height:26px;border-radius:50%;object-fit:cover;flex-shrink:0;" onerror="this.onerror=null;this.src=\''+_ini4url+'\'">';
                  ph+='<div style="display:flex;align-items:center;gap:6px;">'+av4+'<span style="font-size:0.78rem;font-weight:'+(isMe4?'700':'400')+';color:'+(isMe4?'#f1f5f9':'#94a3b8')+';">'+_sf(n)+(isMe4?' <span style="font-size:0.62em;color:#818cf8;">(você)</span>':'')+'</span></div>';
                });
                ph+='</div>';
                var sc4 = m2.scoreP2 != null ? '<div style="font-size:1rem;font-weight:800;color:'+(p2IsWinner?'#4ade80':'#94a3b8')+';flex-shrink:0;min-width:28px;text-align:right;">'+m2.scoreP2+'</div>' : '';
                return ph+sc4;
              })() +
            '</div>' +
          '</div>' +
        '</div>';
      });
      html += '</div>';
      html += '</div>';
    }

    html += '</div>';
    return html;
  }

  const curFilter = window._dashFilter || 'todos';
  const curSport = window._dashSport || '';
  const curLocation = window._dashLocation || '';
  const curFormat = window._dashFormat || '';

  // Favorites count
  const favIds = typeof window._getFavorites === 'function' ? window._getFavorites() : [];
  const favoritosCount = allUnique.filter(t => favIds.indexOf(String(t.id)) !== -1).length;

  // Count finished tournaments
  const encerradosCount = allUnique.filter(t => t.status === 'finished').length;

  // Apply main filter
  let filtered = [];
  if (curFilter === 'organizados') filtered = [...organizadosSorted];
  else if (curFilter === 'participando') filtered = [...participacoesSorted];
  else if (curFilter === 'abertos') filtered = [...abertosParaVoce];
  else if (curFilter === 'favoritos') {
    const seen = new Set();
    [...organizadosSorted, ...participacoesSorted, ...abertosParaVoce].forEach(t => {
      if (!seen.has(t.id) && favIds.indexOf(String(t.id)) !== -1) { seen.add(t.id); filtered.push(t); }
    });
    filtered.sort(sortByDate);
  } else if (curFilter === 'encerrados') {
    const seen = new Set();
    [...organizadosSorted, ...participacoesSorted, ...abertosParaVoce, ...encerradosVisiveis].forEach(t => {
      if (!seen.has(t.id) && t.status === 'finished') { seen.add(t.id); filtered.push(t); }
    });
    filtered.sort(sortByDate);
  } else {
    const seen = new Set();
    [...organizadosSorted, ...participacoesSorted, ...abertosParaVoce, ...encerradosVisiveis].forEach(t => {
      if (!seen.has(t.id)) { seen.add(t.id); filtered.push(t); }
    });
    filtered.sort(sortByDate);
  }

  // Apply secondary filters
  if (curSport) filtered = filtered.filter(t => cleanSportName(t.sport) === curSport);
  if (curLocation) filtered = filtered.filter(t => t.venueName === curLocation);
  if (curFormat) filtered = filtered.filter(t => t.format === curFormat);

  // Pagination — show N items initially, with "load more" button
  const PAGE_SIZE = 12;
  const pageNum = window._dashPage || 1;
  const totalFiltered = filtered.length;

  // Separate active and finished when showing "Todos"
  let filteredHtml = '';
  if (curFilter === 'todos' && !curSport && !curLocation && !curFormat && encerradosCount > 0) {
    // v2.1.12: torneio encerrado só vai pra seção "Encerrados" depois de 24h.
    // Nas primeiras 24h após encerrar, ele continua na lista principal (pra
    // todo mundo ver o resultado/pódio fresquinho). finishedAt é setado em
    // todos os caminhos de encerramento; se faltar (legado), trata como antigo.
    const _isRecentlyFinished = function(t) {
      if (!t || t.status !== 'finished') return false;
      var fa = t.finishedAt ? new Date(t.finishedAt).getTime() : 0;
      if (!fa || isNaN(fa)) return false;
      return (Date.now() - fa) < 24 * 60 * 60 * 1000;
    };
    const activeList = filtered.filter(t => t.status !== 'finished' || _isRecentlyFinished(t));
    const finishedList = filtered.filter(t => t.status === 'finished' && !_isRecentlyFinished(t));
    const visibleActive = activeList.slice(0, pageNum * PAGE_SIZE);
    filteredHtml = visibleActive.length > 0
      ? visibleActive.map(t => renderTournamentCard(t, '')).join('')
      : '<div style="text-align:center;padding:1rem;color:var(--text-muted);opacity:0.6;">' + _t('tournament.emptyState') + '</div>';
    if (activeList.length > visibleActive.length) {
      filteredHtml += '<div style="grid-column:1/-1;text-align:center;padding:1rem;"><button onclick="window._dashPage=(window._dashPage||1)+1;var c=document.getElementById(\'view-container\');if(c&&typeof renderDashboard===\'function\')renderDashboard(c);" class="btn hover-lift" style="background:rgba(99,102,241,0.15);color:#a5b4fc;border:1px solid rgba(99,102,241,0.3);border-radius:12px;padding:10px 28px;font-weight:600;font-size:0.85rem;cursor:pointer;">' + _t('dashboard.loadMore', {count: activeList.length - visibleActive.length}) + '</button></div>';
    }
    if (finishedList.length > 0) {
      // Separate: user's finished tournaments first, then others
      var _cu = window.AppStore.currentUser;
      var myFinished = finishedList.filter(function(t) {
        if (!_cu) return false;
        if (t.organizerEmail === _cu.email) return true;
        var pArr = Array.isArray(t.participants) ? t.participants : (t.participants ? Object.values(t.participants) : []);
        return pArr.some(function(p) {
          if (typeof p === 'string') return p === _cu.email || p === _cu.displayName;
          if (p.uid && _cu.uid && p.uid === _cu.uid) return true;
          if (p.email && p.email === _cu.email) return true;
          if (p.displayName && p.displayName === _cu.displayName) return true;
          return false;
        });
      });
      var otherFinished = finishedList.filter(function(t) { return myFinished.indexOf(t) === -1; });
      var finishedCards = '';
      if (myFinished.length > 0) {
        finishedCards += '<div style="font-size:0.78rem;font-weight:700;color:var(--text-bright);margin-bottom:8px;opacity:0.85;">🏆 ' + _t('dashboard.yourFinished', {count: myFinished.length}) + '</div>';
        finishedCards += '<div class="cards-grid" style="margin-bottom:1rem;">' + myFinished.map(t => renderTournamentCard(t, '')).join('') + '</div>';
      }
      if (otherFinished.length > 0) {
        if (myFinished.length > 0) finishedCards += '<div style="font-size:0.72rem;font-weight:600;color:var(--text-muted);margin-bottom:8px;opacity:0.7;">' + _t('dashboard.otherFinished', {count: otherFinished.length}) + '</div>';
        finishedCards += '<div class="cards-grid">' + otherFinished.map(t => renderTournamentCard(t, '')).join('') + '</div>';
      }
      filteredHtml += '<div style="grid-column:1/-1;margin-top:0.5rem;"><details><summary style="cursor:pointer;font-weight:700;font-size:0.9rem;color:var(--text-muted);padding:8px 0;user-select:none;">' + _t('dashboard.finishedSection', {count: finishedList.length}) + '</summary><div style="margin-top:0.75rem;">' + finishedCards + '</div></details></div>';
    }
  } else {
    // When viewing "encerrados" filter, sort user's tournaments first
    var _sortedFiltered = filtered;
    if (curFilter === 'encerrados' && window.AppStore.currentUser) {
      var _cu2 = window.AppStore.currentUser;
      var _isMine = function(t) {
        if (t.organizerEmail === _cu2.email) return true;
        var pArr = Array.isArray(t.participants) ? t.participants : (t.participants ? Object.values(t.participants) : []);
        return pArr.some(function(p) {
          if (typeof p === 'string') return p === _cu2.email || p === _cu2.displayName;
          if (p.uid && _cu2.uid && p.uid === _cu2.uid) return true;
          if (p.email && p.email === _cu2.email) return true;
          if (p.displayName && p.displayName === _cu2.displayName) return true;
          return false;
        });
      };
      var _myEnc = filtered.filter(_isMine);
      var _otherEnc = filtered.filter(function(t) { return !_isMine(t); });
      _sortedFiltered = _myEnc.concat(_otherEnc);
    }
    const visibleItems = _sortedFiltered.slice(0, pageNum * PAGE_SIZE);
    // Empty state: dois níveis de experiência dependendo do contexto.
    // (a) Usuário novo sem nenhum torneio em lugar nenhum (allUnique zero),
    //     sem filtros aplicados → card welcome rico com CTAs; é o primeiro
    //     vislumbre da plataforma e merece algo mais que "Nenhum torneio
    //     encontrado". (b) Filtros ativos ou busca retornando nada → mensagem
    //     neutra (a antiga) porque o usuário sabe por que tá vazio.
    var _isFreshUser = allUnique.length === 0 && !curSport && !curLocation && !curFormat &&
                       (curFilter === 'todos' || !curFilter);
    // v1.9.79: enquanto a descoberta pública ainda não terminou de carregar,
    // NÃO mostrar "Seja bem-vindo / nenhum torneio" — mostra um estado de
    // carregando. Evita o flash de "sem torneios" pra usuário novo (os torneios
    // públicos aparecem assim que o feed chega e a dashboard re-renderiza).
    var _discoveryLoaded = !!(window.AppStore && window.AppStore._publicDiscoveryLoaded);
    if (visibleItems.length > 0) {
      filteredHtml = visibleItems.map(t => renderTournamentCard(t, '')).join('');
    } else if (_isFreshUser && !_discoveryLoaded) {
      filteredHtml =
        '<div style="grid-column:1/-1;text-align:center;padding:2.5rem 1rem;color:var(--text-muted);">' +
          '<div style="display:inline-block;width:22px;height:22px;border:3px solid rgba(99,102,241,0.3);border-top-color:#818cf8;border-radius:50%;animation:spin 0.8s linear infinite;margin-bottom:10px;"></div>' +
          '<div style="font-size:0.9rem;">Procurando torneios públicos perto de você…</div>' +
        '</div>';
    } else if (_isFreshUser) {
      filteredHtml =
        '<div style="grid-column:1/-1;background:linear-gradient(135deg, rgba(99,102,241,0.1), rgba(59,130,246,0.08));border:1px solid rgba(99,102,241,0.25);border-radius:16px;padding:2rem 1.5rem;text-align:center;">' +
          '<div style="font-size:2.5rem;margin-bottom:8px;">🏆</div>' +
          '<div style="font-size:1.15rem;font-weight:800;color:var(--text-bright);margin-bottom:6px;">Seja bem-vindo ao scoreplace!</div>' +
          '<div style="font-size:0.88rem;color:var(--text-muted);max-width:520px;margin:0 auto 1.25rem auto;line-height:1.5;">Aqui você organiza torneios, joga partidas casuais com placar ao vivo, descobre quadras próximas e marca presença, e acompanha seus amigos. Comece por um dos caminhos abaixo:</div>' +
          '<div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;max-width:600px;margin:0 auto;">' +
            '<button class="btn hover-lift" onclick="if(typeof window._openCasualMatch===\'function\')window._openCasualMatch()" style="background:linear-gradient(135deg,#38bdf8,#0ea5e9);color:#fff;border:none;font-weight:700;padding:10px 18px;font-size:0.85rem;border-radius:10px;">⚡ Partida Casual</button>' +
            '<button class="btn hover-lift" onclick="if(typeof openModal===\'function\')openModal(\'modal-quick-create\')" style="background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;font-weight:700;padding:10px 18px;font-size:0.85rem;border-radius:10px;">🏆 Criar torneio</button>' +
            '<button class="btn hover-lift" title="Procure lugares para seus jogos e marque presença" onclick="window.location.hash=\'#place\'" style="background:linear-gradient(135deg,#FFD700,#DAA520);color:#1a0f00;border:none;font-weight:800;padding:10px 18px;font-size:0.85rem;border-radius:10px;">📍 Place</button>' +
            '<button class="btn hover-lift" onclick="window.location.hash=\'#explore\'" style="background:rgba(99,102,241,0.2);color:#a5b4fc;border:1px solid rgba(99,102,241,0.4);font-weight:700;padding:10px 18px;font-size:0.85rem;border-radius:10px;">👥 Encontrar amigos</button>' +
          '</div>' +
          '<div style="margin-top:1.25rem;font-size:0.78rem;color:var(--text-muted);">Dica: se já existe um torneio público na sua cidade, ele vai aparecer aqui automaticamente.</div>' +
        '</div>';
    } else {
      filteredHtml = '<div style="text-align:center;padding:2rem;color:var(--text-muted);opacity:0.6;">' + _t('tournament.emptyState') + '</div>';
    }
    if (_sortedFiltered.length > visibleItems.length) {
      filteredHtml += '<div style="grid-column:1/-1;text-align:center;padding:1rem;"><button onclick="window._dashPage=(window._dashPage||1)+1;var c=document.getElementById(\'view-container\');if(c&&typeof renderDashboard===\'function\')renderDashboard(c);" class="btn hover-lift" style="background:rgba(99,102,241,0.15);color:#a5b4fc;border:1px solid rgba(99,102,241,0.3);border-radius:12px;padding:10px 28px;font-weight:600;font-size:0.85rem;cursor:pointer;">' + _t('dashboard.loadMore', {count: _sortedFiltered.length - visibleItems.length}) + '</button></div>';
    } else if (curFilter === 'abertos' && window.AppStore && window.AppStore._publicDiscoveryHasMore) {
      // When viewing the public discovery feed and the client has rendered
      // everything loaded, offer to fetch the next server page via cursor.
      filteredHtml += '<div style="grid-column:1/-1;text-align:center;padding:1rem;"><button onclick="window._loadMoreDiscovery()" class="btn hover-lift" style="background:rgba(16,185,129,0.15);color:#6ee7b7;border:1px solid rgba(16,185,129,0.3);border-radius:12px;padding:10px 28px;font-weight:600;font-size:0.85rem;cursor:pointer;">🔍 ' + _t('dashboard.discoverMore') + '</button></div>';
    }
  }

  // Build filter pills for sports
  let sportsPills = sportsArr.map(s => {
    const active = curSport === s;
    return `<button onclick="window._applyDashSport('${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}')" style="display:inline-flex;align-items:center;gap:4px;padding:6px 12px;border-radius:20px;border:1px solid ${active ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.1)'};background:${active ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)'};color:${active ? '#a5b4fc' : 'var(--text-muted)'};font-size:0.75rem;font-weight:${active ? '700' : '500'};cursor:pointer;white-space:nowrap;transition:all 0.2s;"><span>${getSportIcon(s)}</span>${s}</button>`;
  }).join('');

  // Build filter pills for locations
  let locationPills = locationsArr.map(l => {
    const active = curLocation === l;
    return `<button onclick="window._applyDashLocation('${l.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}')" style="display:inline-flex;align-items:center;gap:4px;padding:6px 12px;border-radius:20px;border:1px solid ${active ? 'rgba(16,185,129,0.5)' : 'rgba(255,255,255,0.1)'};background:${active ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.04)'};color:${active ? '#4ade80' : 'var(--text-muted)'};font-size:0.75rem;font-weight:${active ? '700' : '500'};cursor:pointer;white-space:nowrap;transition:all 0.2s;">📍${l}</button>`;
  }).join('');

  // Build filter pills for formats
  let formatPills = formatsArr.map(f => {
    const active = curFormat === f;
    return `<button onclick="window._applyDashFormat('${f.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}')" style="display:inline-flex;align-items:center;gap:4px;padding:6px 12px;border-radius:20px;border:1px solid ${active ? 'rgba(251,191,36,0.5)' : 'rgba(255,255,255,0.1)'};background:${active ? 'rgba(251,191,36,0.15)' : 'rgba(255,255,255,0.04)'};color:${active ? '#fbbf24' : 'var(--text-muted)'};font-size:0.75rem;font-weight:${active ? '700' : '500'};cursor:pointer;white-space:nowrap;transition:all 0.2s;">🏅${f}</button>`;
  }).join('');

  const hasSecondaryFilters = sportsArr.length > 0 || locationsArr.length > 0 || formatsArr.length > 0;
  const filterBarHtml = hasSecondaryFilters ? `
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:1.2rem;align-items:center;">
      ${sportsPills}${locationPills}${formatPills}
      ${(curSport || curLocation || curFormat) ? `<button class="btn btn-micro btn-pill" onclick="window._dashSport='';window._dashLocation='';window._dashFormat='';window._applyDashFilter(window._dashFilter||'todos')" style="background:rgba(239,68,68,0.1);color:#f87171;border:1px solid rgba(239,68,68,0.3);">${_t('dashboard.clearFilters')}</button>` : ''}
    </div>
  ` : '';

  // Build compact list view
  const _buildCompactList = function(items) {
    if (!items || items.length === 0) return '<div style="text-align:center;padding:2rem;color:var(--text-muted);opacity:0.6;">' + _t('tournament.emptyState') + '</div>';
    return '<div class="compact-list-container" style="display:flex;flex-direction:column;gap:2px;">' + items.map(function(t) {
      var isOrg = typeof window.AppStore.isOrganizer === 'function' && window.AppStore.isOrganizer(t);
      var statusText = '', statusColor = '';
      // v1.3.35-beta: distinguir 'finished' real de 'closed' (inscrições
      // encerradas) e só mostrar "Em Andamento" quando t.tournamentStarted
      // estiver setado pelo botão Iniciar Torneio. Antes:
      //   isFinished = status finished OR closed (errado — closed != finished)
      //   hasDraw → "Em Andamento" (errado — só após Iniciar Torneio)
      var isFinished = t.status === 'finished';
      var isClosed = t.status === 'closed';
      var tournamentStarted = !!(t.tournamentStarted || t.status === 'in_progress');
      // v1.6.2-beta: hasDraw must be per-item — was referencing outer scope's
      // hasDraw (defined inside a different forEach) causing ReferenceError on
      // iOS Safari when compact view was used. Sentry #7474466372 (count=12).
      var hasDraw = (Array.isArray(t.matches) && t.matches.length > 0) ||
                    (Array.isArray(t.rounds) && t.rounds.length > 0) ||
                    (Array.isArray(t.groups) && t.groups.length > 0);
      if (isFinished) { statusText = _t('status.finished'); statusColor = '#94a3b8'; }
      else if (tournamentStarted) { statusText = _t('status.active'); statusColor = '#4ade80'; }
      else if (isClosed) { statusText = _t('status.closed'); statusColor = '#fca5a5'; }
      else { statusText = _t('status.open'); statusColor = '#60a5fa'; }
      var pCount = typeof window._getCompetitors === 'function' ? window._getCompetitors(t).length : (Array.isArray(t.participants) ? t.participants.length : 0);
      var prog = typeof window._getTournamentProgress === 'function' ? window._getTournamentProgress(t) : { pct: 0 };
      var dateStr = '';
      if (t.startDate) { try { dateStr = new Date(t.startDate).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }); } catch(e) {} }
      var isFav = typeof window._isFavorite === 'function' && window._isFavorite(t.id);

      var _lt = (document.documentElement.getAttribute('data-theme') === 'light');
      var _rowBg = _lt ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.03)';
      var _rowBgH = _lt ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.07)';
      var _rowBd = _lt ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.05)';
      var statusBadgeBgRgb = statusColor === '#4ade80' ? '16,185,129' : statusColor === '#60a5fa' ? '96,165,250' : '148,163,184';
      return '<a href="#tournaments/' + t.id + '" class="compact-row" style="display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:10px;background:' + _rowBg + ';border:1px solid ' + _rowBd + ';text-decoration:none;color:inherit;transition:background 0.2s;" onmouseover="this.style.background=\'' + _rowBgH + '\'" onmouseout="this.style.background=\'' + _rowBg + '\'">' +
        (t.logoData ? '<img src="' + t.logoData + '" class="compact-logo" style="width:36px;height:36px;border-radius:8px;object-fit:cover;flex-shrink:0;">' : '<div class="compact-logo" style="width:36px;height:36px;border-radius:8px;background:rgba(99,102,241,0.2);display:flex;align-items:center;justify-content:center;font-size:1rem;flex-shrink:0;">' + (getSportIcon(t.sport)) + '</div>') +
        '<div class="compact-info" style="flex:1;min-width:0;display:flex;align-items:center;gap:12px;">' +
          '<div class="compact-name-block" style="flex:1;min-width:0;">' +
            '<div style="font-weight:600;font-size:0.88rem;color:var(--text-bright);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + (isFav ? '<span style="color:#f43f5e">♥</span> ' : '') + window._safeHtml(t.name) + '</div>' +
            '<div class="compact-details" style="font-size:0.7rem;color:var(--text-muted);display:flex;gap:8px;margin-top:2px;flex-wrap:wrap;">' +
              '<span>' + (t.sport || '—') + '</span>' +
              '<span>' + (t.format || '—') + '</span>' +
              (dateStr ? '<span>' + dateStr + '</span>' : '') +
            '</div>' +
          '</div>' +
          '<div class="compact-badges" style="display:flex;align-items:center;gap:8px;flex-shrink:0;">' +
            '<span style="font-size:0.7rem;color:var(--text-muted);">👥 ' + pCount + '</span>' +
            (hasDraw && !isFinished ? '<span style="font-size:0.7rem;color:' + (prog.pct === 100 ? '#10b981' : '#f59e0b') + ';">' + prog.pct + '%</span>' : '') +
            '<span style="font-size:0.68rem;font-weight:600;padding:3px 8px;border-radius:6px;background:rgba(' + statusBadgeBgRgb + ',0.15);color:' + statusColor + ';white-space:nowrap;">' + statusText + '</span>' +
            (isOrg ? '<span style="font-size:0.65rem;padding:2px 6px;border-radius:4px;background:rgba(251,191,36,0.15);color:#fbbf24;">' + _t('auth.orgShort') + '</span>' : '') +
          '</div>' +
        '</div>' +
      '</a>';
    }).join('') + '</div>';
  };

  // Main filter card styles
  // v1.0.44-beta: pill mais compacto pra dar lugar a 3 novos stat pills
  // (Usuários, Amigos, Partidas). Reduções:
  //   flex base 130 → 92px, min-width 110 → 80px
  //   padding 0.9rem 0.75rem → 0.55rem 0.45rem
  //   emoji 1.4 → 1.1rem
  //   count 1.7 → 1.3rem
  //   label 0.78 → 0.66rem
  // Cabe agora 3-4 pills por linha em mobile e 6-7 em desktop, dando
  // espaço pra grupo de torneios + grupo de stats sociais sem precisar
  // de scroll horizontal.
  const _fStyle = (key, emoji, count, label) => {
    const active = curFilter === key;
    // v1.0.58-beta: só permite wrap em labels com 2+ palavras (espaço presente).
    // Single-word labels ("Todos", "Organizados", "Participando", "Favoritos",
    // "Encerrados") mantêm nowrap — não tem como quebrar 1 palavra com sentido.
    // Labels com espaço ("Inscrições Abertas") ganham white-space:normal pra
    // quebrar entre palavras quando o pill fica estreito.
    const _wrapLabel = String(label).indexOf(' ') !== -1;
    const _ws = _wrapLabel ? 'normal' : 'nowrap';
    return `<div style="flex:0 1 92px;min-width:80px;background:${active ? 'var(--hero-pill-active-bg)' : 'var(--hero-pill-inactive-bg)'};backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);padding:0.55rem 0.45rem;border-radius:10px;border:${active ? '2px solid var(--hero-pill-active-border)' : '1px solid var(--hero-pill-inactive-border)'};cursor:pointer;transition:transform 0.2s,box-shadow 0.2s,border 0.2s;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;${active ? 'box-shadow:0 0 14px var(--hero-pill-glow);transform:translateY(-2px);' : ''}" onclick="window._applyDashFilter('${key}')" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 4px 14px rgba(0,0,0,0.15)'" onmouseout="this.style.transform='${active ? 'translateY(-2px)' : 'none'}';this.style.boxShadow='${active ? '0 0 14px var(--hero-pill-glow)' : 'none'}'">
      <div style="font-size:1.1rem;margin-bottom:0.55rem;line-height:1;">${emoji}</div>
      <span style="font-size:1.3rem;font-weight:800;line-height:1;">${count}</span>
      <h3 style="margin:0.35rem 0 0 0;font-size:0.66rem;font-weight:600;opacity:0.9;line-height:1.15;white-space:${_ws};">${label}</h3>
    </div>`;
  };

  // v1.0.44-beta: stat pill (não-filtro) — mesmo visual que _fStyle pero
  // com onclick navegacional em vez de aplicar filtro.
  // v1.0.45/46-beta: opts.{wider, subtitle, dataAttrs, countDataAttr,
  // subtitleDataAttr} pra suportar refresh async (Usuários e Partidas).
  // v1.0.54-beta: opts.labelOnTop=true inverte a hierarquia — label vira
  // o texto prominente e a count/subtitle ficam embaixo. Pedido do user
  // pra Partidas: "coloque partidas na linha de cima e as outras infos
  // abaixo (acho que ficará mais bonito)". Pra Partidas o count numérico
  // (total = V + D) é redundante com a subtitle (V · D · %), então
  // labelOnTop também esconde o count e usa só a subtitle como info.
  const _statPill = (emoji, count, label, onclickJs, title, opts) => {
    opts = opts || {};
    var titleAttr = title ? ' title="' + String(title).replace(/"/g, '&quot;') + '"' : '';
    var flexBasis = opts.wider ? '140' : '92';
    var minWidth = opts.wider ? '130' : '80';
    var pillDataAttrs = opts.dataAttrs || '';
    var countAttr = opts.countDataAttr ? (' ' + opts.countDataAttr) : '';
    var subAttr = opts.subtitleDataAttr ? (' ' + opts.subtitleDataAttr) : '';
    if (opts.labelOnTop) {
      // v1.0.56-beta: ordem final pedida pelo user — emoji → count (big)
      // → label → subtitle (V/D/%). "numero total depois do icone e
      // partidas em seguida e depois v/d/%". Tamanhos IGUAIS aos do
      // pill padrão, só ordem de elementos diferente do default
      // (default: emoji → count → subtitle → label).
      var subtitleHtmlTop = opts.subtitle
        ? '<div' + subAttr + ' style="font-size:0.62rem;font-weight:700;color:var(--hero-text-soft,#94a3b8);line-height:1.1;margin-top:2px;font-variant-numeric:tabular-nums;letter-spacing:0.2px;white-space:nowrap;">' + opts.subtitle + '</div>'
        : (opts.subtitleDataAttr
            ? '<div' + subAttr + ' style="font-size:0.62rem;font-weight:700;color:var(--hero-text-soft,#94a3b8);line-height:1.1;margin-top:2px;font-variant-numeric:tabular-nums;letter-spacing:0.2px;white-space:nowrap;"></div>'
            : '');
      return `<div${titleAttr}${pillDataAttrs ? ' ' + pillDataAttrs : ''} style="flex:0 1 ${flexBasis}px;min-width:${minWidth}px;background:var(--hero-pill-inactive-bg);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);padding:0.55rem 0.45rem;border-radius:10px;border:1px solid var(--hero-pill-inactive-border);cursor:pointer;transition:transform 0.2s,box-shadow 0.2s;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;" onclick="${onclickJs}" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 4px 14px rgba(0,0,0,0.15)'" onmouseout="this.style.transform='none';this.style.boxShadow='none'">
        <div style="font-size:1.1rem;margin-bottom:0.55rem;line-height:1;">${emoji}</div>
        <span${countAttr} style="font-size:1.3rem;font-weight:800;line-height:1;">${count}</span>
        <h3 style="margin:0.35rem 0 0 0;font-size:0.66rem;font-weight:600;opacity:0.9;line-height:1.1;white-space:nowrap;">${label}</h3>
        ${subtitleHtmlTop}
      </div>`;
    }
    var subtitleHtml = opts.subtitle
      ? '<div' + subAttr + ' style="font-size:0.62rem;font-weight:700;color:var(--hero-text-soft,#94a3b8);line-height:1.1;margin-top:1px;font-variant-numeric:tabular-nums;letter-spacing:0.2px;white-space:nowrap;">' + opts.subtitle + '</div>'
      : (opts.subtitleDataAttr
          ? '<div' + subAttr + ' style="font-size:0.62rem;font-weight:700;color:var(--hero-text-soft,#94a3b8);line-height:1.1;margin-top:1px;font-variant-numeric:tabular-nums;letter-spacing:0.2px;white-space:nowrap;"></div>'
          : '');
    return `<div${titleAttr}${pillDataAttrs ? ' ' + pillDataAttrs : ''} style="flex:0 1 ${flexBasis}px;min-width:${minWidth}px;background:var(--hero-pill-inactive-bg);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);padding:0.55rem 0.45rem;border-radius:10px;border:1px solid var(--hero-pill-inactive-border);cursor:pointer;transition:transform 0.2s,box-shadow 0.2s;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;" onclick="${onclickJs}" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 4px 14px rgba(0,0,0,0.15)'" onmouseout="this.style.transform='none';this.style.boxShadow='none'">
      <div style="font-size:1.1rem;margin-bottom:0.55rem;line-height:1;">${emoji}</div>
      <span${countAttr} style="font-size:1.3rem;font-weight:800;line-height:1;">${count}</span>
      ${subtitleHtml}
      <h3 style="margin:0.35rem 0 0 0;font-size:0.66rem;font-weight:600;opacity:0.9;line-height:1.1;white-space:nowrap;">${label}</h3>
    </div>`;
  };

  // v1.0.44/45/47-beta: Social stats — usuários, amigos, partidas V/D.
  var _cuRef = window.AppStore && window.AppStore.currentUser;
  var _myEmail = (_cuRef && _cuRef.email || '').toLowerCase();
  var _myUid = _cuRef && _cuRef.uid;

  // v1.0.45-beta + v1.0.46-beta: Usuários = total cadastrados no banco.
  // Estratégia robusta com 2 caminhos:
  //   1. Tenta aggregate count() (Firestore SDK 9.6+) — barato (1 read)
  //   2. Fallback: get() + .size (lê todos os docs — caro mas garantido)
  // Cache de 5min em localStorage. Render imediato com cached, update
  // assíncrono substitui o número via data-stat-users-count.
  // v1.0.51-beta: revertido o "n-1" da v1.0.50. Mantém o total absoluto
  // (inclui self) — discrepância com Pessoas é esperada e explicada
  // (página Pessoas filtra o próprio usuário).
  var _socialUsersCount = '0';
  try {
    var _uCacheRaw = localStorage.getItem('scoreplace_total_users_cache');
    if (_uCacheRaw) {
      var _uCache = JSON.parse(_uCacheRaw);
      if (_uCache && _uCache.count != null) {
        _socialUsersCount = String(_uCache.count);
      }
    }
  } catch (_e) {}
  // v1.3.79-beta: só busca se autenticado — evita permission-denied de bots/anon
  if (window.FirestoreDB && window.FirestoreDB.db && _myUid) {
    (async function() {
      var n = null;
      // Path 1: aggregate count (preferred)
      try {
        var ref = window.FirestoreDB.db.collection('users');
        if (typeof ref.count === 'function') {
          var snap = await ref.count().get();
          if (snap && snap.data) {
            var data = snap.data();
            if (data && typeof data.count === 'number') n = data.count;
          }
        }
      } catch (e1) {
        if (e1 && e1.code !== 'permission-denied')
          window._warn('[users count] aggregate failed, falling back to .get():', e1 && e1.message);
      }
      // Path 2: fallback — get() todos os docs e count via .size
      if (n == null) {
        try {
          var fullSnap = await window.FirestoreDB.db.collection('users').get();
          if (fullSnap && typeof fullSnap.size === 'number') n = fullSnap.size;
        } catch (e2) {
          if (e2 && e2.code !== 'permission-denied')
            window._warn('[users count] .get() fallback also failed:', e2 && e2.message);
        }
      }
      if (n != null) {
        try {
          localStorage.setItem('scoreplace_total_users_cache', JSON.stringify({ count: n, at: new Date().toISOString() }));
        } catch (_e) {}
        var pillNumEl = document.querySelector('[data-stat-users-count]');
        if (pillNumEl) pillNumEl.textContent = String(n);
      }
    })();
  }

  // Amigos: cu.friends pode estar vazio se profile não carregou ainda;
  // mostra 0 e o pill atualiza naturalmente quando re-render acontece.
  var _socialFriendsCount = (_cuRef && Array.isArray(_cuRef.friends))
    ? _cuRef.friends.filter(function(u) { return u && u !== _myUid; }).length
    : 0;

  // Partidas V/D: agrega match history.
  // v1.0.46-beta: render imediato com cache local (scoreplace_casual_history_v2 +
  // scoreplace_match_stats_cache) e refresh async do Firestore
  // users/{uid}/matchHistory. Cobre partidas jogadas em outros browsers/
  // devices. Pill mais largo (opts.wider) com subtitle "5V·3D·62%".
  // Pedido do user: "inves de aparecer o numero de partidas disputadas pelo
  // usuário com V/D/%, está aparecendo 0".
  var _socialMatchesDisplay = '0';
  var _socialMatchesSubtitle = '';
  var _socialMatchesTitle = 'Suas partidas casuais e em torneios — clique pra ver detalhes';
  var _socialMatchesClick = "if(typeof window._showPlayerStats==='function' && window.AppStore.currentUser){window._showPlayerStats(window.AppStore.currentUser.displayName||'')}";

  // Helper compartilhado: agrega W/L de uma lista de records.
  function _aggregateWL(records, myUid, myDn) {
    var _w = 0, _l = 0;
    records.forEach(function(r) {
      if (!r) return;
      var team = null;
      if (Array.isArray(r.players)) {
        var mySlot = r.players.find(function(p) {
          if (!p) return false;
          if (myUid && p.uid === myUid) return true;
          if (myDn && p.name && String(p.name).toLowerCase().trim() === myDn) return true;
          return false;
        });
        if (mySlot) team = mySlot.team;
      }
      if (!team) return;
      if (r.winnerTeam === team) _w++;
      else if (r.winnerTeam && r.winnerTeam !== 0) _l++;
    });
    return { w: _w, l: _l };
  }
  function _formatMatchesPill(w, l) {
    var total = w + l;
    if (total === 0) return null;
    var pct = Math.round(w / total * 100);
    return {
      display: String(total),
      subtitle: '<span style="color:#22c55e;">' + w + 'V</span> · <span style="color:#ef4444;">' + l + 'D</span> · ' + pct + '%',
      title: w + 'V · ' + l + 'D · ' + pct + '% aproveitamento — clique pra ver detalhes'
    };
  }

  // Render inicial com cache local (v2 — mesma fonte do modal).
  var _myDn = ((_cuRef && _cuRef.displayName) || '').toLowerCase().trim();
  try {
    var _v2raw = localStorage.getItem('scoreplace_casual_history_v2') || '[]';
    var _v2 = JSON.parse(_v2raw);
    if (Array.isArray(_v2) && _v2.length > 0) {
      var agg = _aggregateWL(_v2, _myUid, _myDn);
      var fmt = _formatMatchesPill(agg.w, agg.l);
      if (fmt) {
        _socialMatchesDisplay = fmt.display;
        _socialMatchesSubtitle = fmt.subtitle;
        _socialMatchesTitle = fmt.title;
      }
    }
  } catch (_e) {}

  // Refresh async do Firestore matchHistory. Cobre partidas em outros
  // devices que não estão no cache local v2. Substitui via data attrs.
  if (_myUid && window.FirestoreDB && typeof window.FirestoreDB.loadUserMatchHistory === 'function') {
    (async function() {
      try {
        var records = await window.FirestoreDB.loadUserMatchHistory(_myUid, { limit: 500 });
        if (!Array.isArray(records) || records.length === 0) return;
        var agg = _aggregateWL(records, _myUid, _myDn);
        var fmt = _formatMatchesPill(agg.w, agg.l);
        if (!fmt) return;
        var pill = document.querySelector('[data-stat-matches-pill]');
        if (!pill) return;
        var numEl = pill.querySelector('[data-stat-matches-count]');
        var subEl = pill.querySelector('[data-stat-matches-subtitle]');
        if (numEl) numEl.textContent = fmt.display;
        if (subEl) subEl.innerHTML = fmt.subtitle;
        pill.setAttribute('title', fmt.title);
      } catch (e) {
        window._warn('[matches stats] async refresh failed:', e);
      }
    })();
  }

  const html = `
    <!-- Header Hero Box -->
    <!-- v0.17.31: cores do hero-box agora vêm de --hero-* tokens (style.css)
         que adaptam ao tema. Light themes ganham gradient suave + texto
         escuro; dark themes mantêm gradient escuro + texto branco. -->
    <div class="mb-4 hero-box" style="
        border-radius: 24px;
        padding: 2.5rem 2rem;
        box-shadow: 0 4px 12px rgba(0,0,0,0.05);
        position: relative;
    ">

      <div style="margin-bottom: 1rem; display: flex; align-items: center; gap: 10px; text-align: left;">
        <h2 style="margin:0; font-size: 2.2rem; font-weight: 700; flex:1; color:var(--hero-text);">${_t('dashboard.welcome', {name: userName})}${_proBadge}</h2>
        ${window.AppStore.currentUser ? '<div style="display:flex;flex-direction:column;gap:5px;align-items:stretch;"><button onclick="window.location.hash=\'#trofeus\'" style="background:var(--hero-glass-bg);border:1px solid var(--hero-glass-border);border-radius:12px;padding:6px 12px;cursor:pointer;display:flex;align-items:center;gap:5px;color:var(--hero-text);font-size:0.78rem;font-weight:600;white-space:nowrap;transition:background 0.2s;" onmouseover="this.style.background=\'var(--hero-glass-bg-hover)\'" onmouseout="this.style.background=\'var(--hero-glass-bg)\'"><span style="font-size:1rem;">🏆</span> Conquistas</button><button onclick="if(typeof window._showPlayerStats===\'function\')window._showPlayerStats(\'' + window._safeHtml((window.AppStore.currentUser.displayName || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")) + '\')" style="background:var(--hero-glass-bg);border:1px solid var(--hero-glass-border);border-radius:12px;padding:6px 12px;cursor:pointer;display:flex;align-items:center;gap:5px;color:var(--hero-text);font-size:0.78rem;font-weight:600;white-space:nowrap;transition:background 0.2s;" onmouseover="this.style.background=\'var(--hero-glass-bg-hover)\'" onmouseout="this.style.background=\'var(--hero-glass-bg)\'"><span style="font-size:1rem;">📊</span> ' + _t('dashboard.statistics') + '</button></div>' : ''}
      </div>
      <div style="text-align:center;margin-bottom:8px;font-size:0.75rem;color:var(--hero-text-soft);font-weight:600;letter-spacing:0.5px;">v${window.SCOREPLACE_VERSION || ''}</div>

      <div style="display: flex; flex-direction: column; align-items: center; gap: 12px; margin-bottom: 1.5rem;">
        <div style="display:flex;gap:8px;justify-content:center;flex-wrap:nowrap;width:100%;max-width:580px;">
          <!-- v0.17.45: Row 1 mais alta — min-height 64→80px, ícone 1.4→1.7rem.
               v0.17.55: white-space:normal explícito no label pra OVERRIDE o
               white-space:nowrap herdado da classe .btn (components.css:192).
               Sem isso, o texto não quebrava E era cortado pelo overflow:hidden.
               Combinação completa: display:block; width:100%; white-space:normal
               + overflow:hidden no botão (defense-in-depth). -->
          <button class="btn btn-cta hover-lift" id="btn-casual-match" style="--shine-delay:0s;background:linear-gradient(135deg,#38bdf8,#0ea5e9); color: #ffffff; flex:1;min-width:0; min-height: 80px; font-size: 0.95rem; font-weight: 700; border-radius: 14px; border: 1px solid rgba(255,255,255,0.35); letter-spacing: 0.02em;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:8px 6px;overflow:hidden;" onmouseover="this.style.filter='brightness(1.1)'" onmouseout="this.style.filter=''" onclick="if(typeof window._openCasualMatch==='function')window._openCasualMatch();">
            <span style="font-size:1.7rem;line-height:1;">⚡</span>
            <span style="line-height:1.15;text-align:center;width:100%;display:block;white-space:normal;">${_t('dashboard.casualMatch')}</span>
          </button>
          <button class="btn btn-cta hover-lift" id="btn-create-tournament-in-box" style="--shine-delay:0.6s;background: #1e40af; color: #ffffff; flex:1;min-width:0; min-height: 80px; font-size: 0.95rem; font-weight: 700; border-radius: 14px; border: 1px solid rgba(255,255,255,0.35); letter-spacing: 0.02em;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:8px 6px;overflow:hidden;" onmouseover="this.style.background='#1e3a8a'" onmouseout="this.style.background='#1e40af'" onclick="if(typeof openModal==='function')openModal('modal-quick-create');">
            <span style="font-size:1.7rem;line-height:1;">🏆</span>
            <span style="line-height:1.15;text-align:center;width:100%;display:block;white-space:normal;">${_t('dashboard.newTournament')}</span>
          </button>
          <button class="btn btn-cta hover-lift" id="btn-place" title="Procure lugares para seus jogos e marque presença" style="--shine-delay:1.2s;background:linear-gradient(135deg,#FFD700,#DAA520); color: #1a0f00; flex:1;min-width:0; min-height: 80px; font-size: 0.95rem; font-weight: 800; border-radius: 14px; border: 1px solid rgba(255,255,255,0.35); letter-spacing: 0.02em;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:8px 6px;overflow:hidden;" onmouseover="this.style.filter='brightness(1.1)'" onmouseout="this.style.filter=''" onclick="window.location.hash='#place'">
            <span style="font-size:1.7rem;line-height:1;">📍</span>
            <span style="line-height:1.15;text-align:center;width:100%;display:block;white-space:normal;">Place</span>
          </button>
        </div>
        <!-- v2.1.7-beta: leitor de QR GERAL — entra em partida casual OU em
             torneio conforme o destino do QR. Botão com volume (padrão .btn),
             posicionado entre os CTAs (Place) e as estatísticas. -->
        <div style="display:flex;justify-content:center;width:100%;">
          <button id="btn-scan-qr" class="btn btn-shine hover-lift" aria-label="Ler QR Code" title="Leia um QR code para entrar em uma partida casual ou em um torneio" style="--shine-delay:1.5s;background:linear-gradient(135deg,#a855f7,#7c3aed);color:#fff;border:1px solid rgba(255,255,255,0.3);font-size:1rem;font-weight:700;height:58px;padding:0 30px;border-radius:14px;display:inline-flex;align-items:center;gap:10px;letter-spacing:0.01em;" onclick="if(typeof window._openScanQR==='function')window._openScanQR();">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8V6a2 2 0 0 1 2-2h2"/><path d="M16 4h2a2 2 0 0 1 2 2v2"/><path d="M20 16v2a2 2 0 0 1-2 2h-2"/><path d="M8 20H6a2 2 0 0 1-2-2v-2"/><rect x="8" y="8" width="3" height="3" rx="0.5" fill="currentColor" stroke="none"/><rect x="13" y="8" width="3" height="3" rx="0.5" fill="currentColor" stroke="none"/><rect x="8" y="13" width="3" height="3" rx="0.5" fill="currentColor" stroke="none"/><rect x="13.5" y="13.5" width="2" height="2" rx="0.3" fill="currentColor" stroke="none"/></svg>
            Ler QR Code
          </button>
        </div>
        <!-- v0.17.46: Row 2 (interativos: Pessoas + Convidar) e Row 3
             (utilitários: Pro + Apoie, mais discretos) separados em linhas
             próprias. Apoie/Pro ficam em uma linha menor — não competem
             visualmente com Pessoas/Convidar que são uso mais frequente. -->
        <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; align-items: center;">
          <button id="btn-people" class="btn btn-shine hover-lift" title="Encontre jogadores e expanda sua rede" style="--shine-delay:1.8s;background: linear-gradient(135deg,#6366f1,#4f46e5); color: #fff; border: 1px solid rgba(255,255,255,0.3); font-size: 0.92rem; font-weight: 600; padding: 0 20px; height: 54px; border-radius: 12px;" onclick="window.location.hash='#explore'">👥 ${_t('dashboard.people') || 'Pessoas'}</button>
          <button id="btn-invite-app" class="btn btn-shine hover-lift" title="${_t('invite.appQrTitle')}" style="--shine-delay:2.4s;background: #7c3aed; color: #fff; border: 1px solid rgba(255,255,255,0.3); font-size: 0.92rem; font-weight: 600; padding: 0 20px; height: 54px; border-radius: 12px;" onclick="window.location.hash='#invite'">📱 ${_t('invite.inviteFriends')}</button>
        </div>
        <!-- Row 3: Pro + Apoie (utilitários menores, mais discretos) -->
        <div style="display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; margin-top: -2px;">
          <button id="btn-upgrade-pro" class="btn hover-lift" title="${_t('common.pro')}" style="display: none; background: linear-gradient(135deg,#3b82f6,#6366f1); color: #fff; border: 1px solid rgba(255,255,255,0.3); font-size: 0.78rem; font-weight: 600; padding: 0 14px; height: 34px; border-radius: 9px; opacity: 0.9;" onclick="window._showUpgradeModal()">🚀 ${_t('common.pro')}</button>
          <button id="btn-support-pix" class="btn hover-lift" title="${_t('common.support')}" style="background: #047857; color: #fff; border: 1px solid rgba(255,255,255,0.3); font-size: 0.78rem; font-weight: 600; padding: 0 14px; height: 34px; border-radius: 9px; opacity: 0.9;" onclick="window.location.hash='#support'">💚 ${_t('common.support')}</button>
        </div>
      </div>

      <!-- v0.17.50: trocado de grid auto-fit pra flex centralizado.
           Antes (grid auto-fit minmax 110px): 4 pills em viewport médio
           viravam 3+1 com a sobrante alinhada à esquerda — visualmente
           desbalanceado. Agora flex+center+wrap: pills ficam em linha
           cheia quando cabe, e quando wraps (2+2 ou 3+1), os itens
           da última linha ficam centralizados. min-width 110px em cada
           pill mantém leitura consistente. -->
      <!-- Tournament filter pills (clickable — apply filter to list) -->
      <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: center;">
        ${_fStyle('todos', '📋', allUnique.length, _t('dashboard.filterAll'))}
        ${_fStyle('organizados', '🏆', organizadosCount, _t('dashboard.filterOrganized'))}
        ${_fStyle('participando', '👤', participacoesCount, _t('dashboard.filterParticipating'))}
        ${_fStyle('abertos', '🗓️', abertosParaVoce.length, _t('dashboard.filterOpen'))}
        ${favoritosCount > 0 ? _fStyle('favoritos', '♥', favoritosCount, _t('dashboard.filterFavorites')) : ''}
        ${encerradosCount > 0 ? _fStyle('encerrados', '🏆', encerradosCount, _t('dashboard.filterFinished')) : ''}
      </div>
      <!-- v1.0.44-beta: Social/personal stats pills (separadas das de torneio
           pra não misturar contextos). Usuários = unique participantes
           encontrados nos torneios visíveis (proxy de "rede no scoreplace").
           Amigos = cu.friends.length. Partidas = total V/D do match history
           local (scoreplace_casual_history_v2 + uid match em records). -->
      <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: center; margin-top: 0.5rem;">
        <!-- v1.0.46-beta: Usuários e Partidas usam countDataAttr/subtitleDataAttr
             pra que o refresh assíncrono possa achar e atualizar os elementos
             via querySelector quando o Firestore responder. -->
        ${_statPill('👥', _socialUsersCount, 'Usuários', "window.location.hash='#explore'", 'Total de usuários cadastrados no scoreplace', { countDataAttr: 'data-stat-users-count' })}
        ${_statPill('🤝', _socialFriendsCount, 'Amigos', "window.location.hash='#explore'", 'Seus amigos no scoreplace')}
        ${_statPill('⚔️', _socialMatchesDisplay, 'Partidas', _socialMatchesClick, _socialMatchesTitle, { wider: true, labelOnTop: true, subtitle: _socialMatchesSubtitle, dataAttrs: 'data-stat-matches-pill', countDataAttr: 'data-stat-matches-count', subtitleDataAttr: 'data-stat-matches-subtitle' })}
      </div>
    </div>

    <!-- Meus Resultados (v1.8.2-beta): pendentes de ação + últimos confirmados -->
    ${_buildMyResultsHtml()}

    <!-- Profile Completion Nudge (dismissible, smart — only when key fields missing).
         v1.0.41-beta: wrapper #dash-profile-nudge-slot pra event listener
         scoreplace:profile-loaded re-injetar o nudge quando profile chega
         async (evita race condition de mostrar nudge com dados vazios). -->
    <div id="dash-profile-nudge-slot">${_buildProfileNudgeHtml()}</div>

    <!-- Casual Link Request Banner (loaded async — prominent call-to-action when someone
         suggested that a guest player in a casual match is actually this user.
         v1.3.73-beta: user reported the notification only appears in the bell icon and
         users often miss it — now also shown as a prominent amber banner on the dashboard.) -->
    <div id="dashboard-casual-link-widget" style="margin-bottom:1rem;"></div>

    <!-- My Active Presence (loaded async — pill at top when user has a check-in/plan live) -->
    <div id="dashboard-myactive-widget" style="margin-bottom:1rem;"></div>

    <!-- Friends' Presences (loaded async) -->
    <div id="dashboard-presences-widget" style="margin-bottom:1.25rem;"></div>

    <!-- v2.1.14: filtros de modalidade/formato/local movidos pra logo ACIMA do
         toggle Cards/Lista (pedido do usuário) — antes ficavam lá em cima, longe
         da lista que eles filtram. -->
    ${filterBarHtml}

    <!-- View Toggle + Tournament Cards -->
    <div style="display:flex;justify-content:flex-end;margin-bottom:0.75rem;">
      <div style="display:inline-flex;border-radius:8px;overflow:hidden;border:1px solid rgba(255,255,255,0.1);">
        <button class="btn btn-pill btn-sm" onclick="window._setDashView('cards')" style="background:${(window._dashView||'cards')==='cards'?'rgba(99,102,241,0.25)':'rgba(255,255,255,0.04)'};color:${(window._dashView||'cards')==='cards'?'#a5b4fc':'var(--text-muted)'};border:none;" title="${_t('dashboard.cards')}">▦ ${_t('dashboard.cards')}</button>
        <button class="btn btn-pill btn-sm" onclick="window._setDashView('compact')" style="border-left:1px solid rgba(255,255,255,0.1);background:${window._dashView==='compact'?'rgba(99,102,241,0.25)':'rgba(255,255,255,0.04)'};color:${window._dashView==='compact'?'#a5b4fc':'var(--text-muted)'};border-radius:0;" title="${_t('dashboard.compact')}">☰ ${_t('dashboard.compact')}</button>
      </div>
    </div>
    <div class="dashboard-list" style="margin-bottom: 2rem;">
      ${(window._dashView === 'compact') ? '<div class="compact-list">' + _buildCompactList(filtered) + '</div>' : '<div class="cards-grid">' + filteredHtml + '</div>'}
    </div>
    ${(() => {
      // v0.16.60: diag SEMPRE visível, independente de filtro — usuário
      // reportou "nelson ainda nao ve torneio algum" mas o diag da v0.16.59
      // ficava escondido se tivesse filtro ativo. Agora o diag sempre
      // aparece; apenas as 3 seções extras (em andamento, fechadas-sem-início,
      // encerrados) ficam restritas ao filtro 'todos'.
      var _curFilter = window._dashFilter || 'todos';
      var _showExtraSections = (_curFilter === 'todos' && !curSport && !curLocation && !curFormat);
      var _cuPref = window.AppStore && window.AppStore.currentUser;
      var _prefSports = (_cuPref && Array.isArray(_cuPref.preferredSports))
        ? _cuPref.preferredSports.map(function(s) { return cleanSportName(s); }).filter(Boolean)
        : (typeof (_cuPref && _cuPref.preferredSports) === 'string' && _cuPref.preferredSports.trim()
            ? _cuPref.preferredSports.split(/[,;]/).map(function(s) { return cleanSportName(s); }).filter(Boolean)
            : []);
      var _filterByInterest = function(arr) {
        if (!_prefSports.length) return arr;
        return arr.filter(function(t) {
          if (!t.sport) return true; // torneio sem modalidade declarada não é filtrado
          var tsClean = cleanSportName(t.sport).toLowerCase();
          return _prefSports.some(function(p) { return p.toLowerCase() === tsClean; });
        });
      };
      var _inProgress = _filterByInterest(discoveryByCategory.inProgress);
      var _closedNoStart = _filterByInterest(discoveryByCategory.closedNoStart);
      var _finishedDiscovery = _filterByInterest(discoveryByCategory.finished);
      // v0.16.73: removido o bloco de diag inline da v0.16.59-61 (renderer
      // version, FirestoreDB.db disponível, contagens por categoria, botões
      // "Forçar re-fetch" / "Diagnose banco"). Discovery feed estável desde
      // v0.16.62 (fix do orderBy que excluía docs sem createdAt). Manter o
      // diag em produção poluía a UI sem propósito ativo. Pode ser
      // restaurado pelo histórico do git se algum bug regredir.
      if (!_showExtraSections) return '';
      if (_inProgress.length === 0 && _closedNoStart.length === 0 && _finishedDiscovery.length === 0) return '';
      var _interestNote = _prefSports.length
        ? '<div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:0.5rem;">Filtrado pelas suas modalidades favoritas: ' + _prefSports.map(function(s) { return window._safeHtml(s); }).join(', ') + '</div>'
        : '';
      var _section = function(title, items, color, collapsed) {
        if (!items || items.length === 0) return '';
        var _cards = '<div class="cards-grid">' + items.map(function(t) { return renderTournamentCard(t, ''); }).join('') + '</div>';
        if (collapsed) {
          return '<details style="margin-top:1rem;"><summary style="cursor:pointer;font-weight:700;font-size:0.92rem;color:' + color + ';padding:8px 0;user-select:none;">' + title + ' (' + items.length + ')</summary><div style="margin-top:0.75rem;">' + _cards + '</div></details>';
        }
        return '<div style="margin-top:1.25rem;"><div style="font-weight:800;font-size:0.95rem;color:' + color + ';margin-bottom:0.5rem;border-left:3px solid ' + color + ';padding-left:10px;">' + title + ' <span style="font-weight:500;color:var(--text-muted);font-size:0.78rem;">(' + items.length + ')</span></div>' + _cards + '</div>';
      };
      return '<div style="margin-top:0.5rem;">' +
        _interestNote +
        _section('🎮 Em andamento (públicos)', _inProgress, '#10b981', false) +
        _section('🚪 Inscrições encerradas (aguardando início)', _closedNoStart, '#fb923c', false) +
        _section('🏁 Encerrados (públicos)', _finishedDiscovery, '#94a3b8', true) +
      '</div>';
    })()}
  `;
  container.innerHTML = html;

  // Regra "sempre usar foto do perfil para usuário cadastrado": o dashboard
  // não passa pelo bracket, então o _playerPhotoCache pode estar frio. Pré-
  // carrega as fotos reais (por uid) dos torneios em que o usuário participa
  // e troca os avatares iniciais pelas fotos de perfil. Mesmo padrão de
  // participants.js (swap por data-player-name).
  if (typeof _preloadPlayerPhotos === 'function' && typeof participacoes !== 'undefined' && Array.isArray(participacoes)) {
    var _phTournaments = participacoes.slice(0, 20);
    Promise.all(_phTournaments.map(function(t) {
      try { return _preloadPlayerPhotos(t); } catch(e) { return Promise.resolve(); }
    })).then(function() {
      var imgs = container.querySelectorAll('img[data-player-name]');
      imgs.forEach(function(img) {
        var nm = img.getAttribute('data-player-name');
        var real = window._playerPhotoCache && window._playerPhotoCache[(nm || '').toLowerCase()];
        if (real && real.indexOf('dicebear.com') === -1 && img.src.indexOf('dicebear.com') !== -1) {
          var fb = 'https://api.dicebear.com/9.x/initials/svg?seed=' + encodeURIComponent(nm) + '&backgroundColor=6366f1&textColor=ffffff&fontSize=42&size=28';
          img.onerror = function() { this.onerror = null; this.src = fb; };
          img.src = real;
        }
      });
    }).catch(function() {});
  }

  // Auto-scroll para resultados pendentes de aprovação.
  // 600ms = após todos os _jumpTop do router (último em 350ms) e após a
  // restauração de scroll do _softRefreshView (RAF ~16ms).
  // Em navegação fresca (!_isSoftRefresh) reseta o guard para que o scroll
  // aconteça nessa visita. Em soft-refresh só rola se ainda não rolou (guard=false).
  if (!window._isSoftRefresh) {
    // Chegou ao dashboard via navegação — reset do guard para esta sessão de visita
    window._dashPendingScrolled = false;
  }
  setTimeout(function() {
    if (window._dashPendingScrolled) return;
    // Confirmar que ainda estamos no dashboard
    var _h = (window.location.hash || '').replace('#', '').split('/')[0];
    if (_h && _h !== 'dashboard') return;
    // v1.9.94: se o usuário JÁ começou a rolar manualmente, NÃO sequestra o
    // scroll — respeita a ação dele. A seção pendente continua visível na
    // página; o auto-scroll é só uma conveniência da primeira abertura.
    var _cur = window.scrollY || window.pageYOffset || 0;
    if (_cur > 40) { window._dashPendingScrolled = true; return; }
    var _section = document.querySelector('[data-has-pending="1"]');
    if (_section) {
      window._dashPendingScrolled = true;
      // v1.9.94: instantâneo (não 'smooth'). Com re-renders assíncronos na
      // entrada, a animação suave era interrompida no meio e parecia "pulo".
      // O guard + scroll preservado garantem que isto roda UMA vez e fica.
      _section.scrollIntoView({ behavior: 'auto', block: 'start' });
    }
  }, 350);

  // Botões de resultado pendente — event listeners via JS (evita parsing issues
  // de onclick em HTML gerado dinamicamente em mobile Safari)
  container.querySelectorAll('[data-pending-action]').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var action = btn.getAttribute('data-pending-action');
      var tId = btn.getAttribute('data-tid');
      var mId = btn.getAttribute('data-mid');
      if (action === 'edit') {
        // Tenta editar in-place; se não achar os elementos (não está no bracket),
        // seta sp_pendingEdit e navega — o bracket auto-abre o edit ao carregar
        try { sessionStorage.setItem('sp_pendingEdit', JSON.stringify({tId: tId, matchId: mId})); } catch(e2) {}
        if (typeof window._editPendingResult === 'function') {
          window._editPendingResult(tId, mId);
        } else {
          window.location.hash = '#bracket/' + tId;
        }
      } else if (action === 'contest' && typeof window._contestResult === 'function') {
        window._contestResult(tId, mId);
      } else if (action === 'approve' && typeof window._approveResult === 'function') {
        window._approveResult(tId, mId);
      }
    });
  });

  // Show/hide Pro button based on plan (element is now inside hero box)
  var proBtn = document.getElementById('btn-upgrade-pro');
  if (proBtn) {
    var isPro = typeof window._isPro === 'function' && window._isPro();
    proBtn.style.display = isPro ? 'none' : 'inline-flex';
  }

  // ─── Casual link request banner (async load) ───
  _hydrateCasualLinkWidget();

  // ─── Friends' presences widget (async load) ───
  _hydrateMyActivePresenceWidget();
  _hydrateFriendsPresenceWidget();

  // v0.16.60: re-fetch do discovery feed sempre que renderiza dashboard.
  // Throttle de 15s (bem mais agressivo que v0.16.59 que era 30s) E ignora
  // throttle quando publicDiscovery está vazio (force fetch quando tem
  // motivo claro pra estar vazio — Nelson não vê NADA).
  if (window.AppStore && typeof window.AppStore.loadPublicDiscovery === 'function') {
    var _curLen = (window.AppStore.publicDiscovery || []).length;
    var _lastFetch = window.AppStore._publicDiscoveryLastFetch || 0;
    var _force = _curLen === 0; // sem dados = sempre re-fetch, sem throttle
    if (_force || Date.now() - _lastFetch > 15000) {
      window.AppStore._publicDiscoveryLastFetch = Date.now();
      window._log('[Discovery v0.16.60] re-fetch disparado', { curLen: _curLen, force: _force, msSinceLast: Date.now() - _lastFetch });
      window.AppStore.loadPublicDiscovery().then(function() {
        var newLen = (window.AppStore.publicDiscovery || []).length;
        window._log('[Discovery v0.16.60] re-fetch retornou', { newLen: newLen, oldLen: _curLen });
        // Re-render se ainda estamos no dashboard E o count mudou.
        // v1.9.94: preserva scroll + não re-dispara auto-scroll (sem "pulo").
        if (window.location.hash === '' || window.location.hash === '#' || window.location.hash.indexOf('#dashboard') === 0) {
          if (newLen !== _curLen) {
            _reRenderDashKeepScroll();
          }
        }
      }).catch(function(e) {
        window._error('[Discovery v0.16.60] re-fetch FAILED', e);
        window._lastDiscoveryError = String(e && e.message || e);
      });
    }
  }

  // v1.9.91: refresh PERIÓDICO do feed público de descoberta. O feed não é
  // tempo-real (é um fetch com throttle, disparado só em render). Resultado:
  // um torneio PÚBLICO novo criado por outra pessoa não aparecia pra quem
  // estava parado na dashboard até atualizar. Bug reportado: "criei um torneio
  // com o Nelson e o Rodrigo não enxerga". Agora, enquanto a dashboard está
  // aberta, re-busca a cada 25s e re-renderiza se o nº de torneios mudou.
  // Um único interval global (guard _discoveryPollStarted) — só age na dashboard.
  if (!window._discoveryPollStarted) {
    window._discoveryPollStarted = true;
    setInterval(function() {
      var _h = window.location.hash || '';
      var _onDash = _h === '' || _h === '#' || _h.indexOf('#dashboard') === 0;
      if (!_onDash) return;
      if (!window.AppStore || typeof window.AppStore.loadPublicDiscovery !== 'function') return;
      if (!window.AppStore.currentUser) return;
      var _prevLen = (window.AppStore.publicDiscovery || []).length;
      window.AppStore._publicDiscoveryLastFetch = Date.now();
      window.AppStore.loadPublicDiscovery().then(function() {
        var _newLen = (window.AppStore.publicDiscovery || []).length;
        if (_newLen === _prevLen) return;
        var _h2 = window.location.hash || '';
        if (_h2 === '' || _h2 === '#' || _h2.indexOf('#dashboard') === 0) {
          // v1.9.94: preserva scroll (poll a cada 25s não deve dar "pulo").
          _reRenderDashKeepScroll();
        }
      }).catch(function() {});
    }, 25000);
  }

  // v0.17.4: real-time listeners SUBSTITUEM o polling de 60s. Pedido do
  // usuário: "sempre que um amigo fizer alguma alteração nesse estado isso
  // deve imediatamente refletir para ele e para seus amigos. isso precisa
  // ocorrer independente do usuário ter que dar refresh na pagina."
  // onSnapshot do Firestore dispara em qualquer write — ms de latência,
  // não 60s. Cleanup quando dashboard sai do DOM.
  _setupPresenceListeners();
  // v0.17.4: também escuta profile-loaded pra cobrir a race onde o user
  // chega no dashboard antes do profile carregar (cu.friends undefined).
  // Quando profile chega, re-setup garante listeners com friends list correto.
  // v1.0.41-beta: também re-injeta o profile-completion nudge (que era
  // suprimido enquanto _profileLoaded !== true pra evitar race com dados
  // vazios).
  if (!window._dashProfileLoadedHandlerInstalled) {
    window._dashProfileLoadedHandlerInstalled = true;
    document.addEventListener('scoreplace:profile-loaded', function() {
      // Re-injeta o profile nudge agora que _profileLoaded === true.
      var nudgeSlot = document.getElementById('dash-profile-nudge-slot');
      if (nudgeSlot) {
        try { nudgeSlot.innerHTML = _buildProfileNudgeHtml(); } catch (e) {}
      }
      // Re-hydrate casual link banner now that notifications are available.
      _hydrateCasualLinkWidget();
      var box = document.getElementById('dashboard-presences-widget');
      if (!box) return;
      _setupPresenceListeners(true); // force re-setup with new friends list
      _hydrateFriendsPresenceWidget();
    });
  }

  // ─── Pending invite detection: auto-redirect to tournament with pending co-org or participation invite ───
  _checkPendingInvitesAndRedirect(visible);
}

// v0.17.4: real-time listeners. Mantém listener vivo enquanto o dashboard
// está no DOM. Cada snapshot do Firestore (write de qualquer pessoa que
// afeta minha visão — eu mesmo ou amigos) re-hidrata o widget. Substitui
// o setInterval de 60s — agora propagação é em ms.
function _setupPresenceListeners(forceReset) {
  var cu = window.AppStore && window.AppStore.currentUser;
  if (!cu || !cu.uid || !window.PresenceDB) return;
  if (cu.presenceMuteUntil && Number(cu.presenceMuteUntil) > Date.now()) return;

  // Já tem listener ativo pro mesmo uid + friends? Skip (idempotente).
  // Quando forceReset=true (ex: profile-loaded com friends novos), tira
  // os listeners antigos antes.
  var friends = Array.isArray(cu.friends)
    ? cu.friends.filter(function(u) { return u && u !== cu.uid && u.indexOf('@') === -1; })
    : [];
  var sig = cu.uid + '|' + friends.slice().sort().join(',');
  if (window._dashListenerSig === sig && !forceReset) return;
  if (window._dashListenerCleanup) {
    try { window._dashListenerCleanup(); } catch (e) {}
    window._dashListenerCleanup = null;
  }

  var ownUnsub = window.PresenceDB.listenMyActive(cu.uid, function(list) {
    var box = document.getElementById('dashboard-presences-widget');
    if (!box) {
      // Dashboard saiu — cleanup automático
      _teardownPresenceListeners();
      return;
    }
    if (!window._dashPresenceCache) window._dashPresenceCache = { own: [], friends: [], ts: 0 };
    window._dashPresenceCache.own = list;
    window._dashPresenceCache.ts = Date.now();
    _hydrateFriendsPresenceWidget();
  });

  var friendsUnsub = function() {};
  if (friends.length > 0) {
    friendsUnsub = window.PresenceDB.listenForFriends(friends, function(list) {
      var box = document.getElementById('dashboard-presences-widget');
      if (!box) { _teardownPresenceListeners(); return; }
      // filtra eu mesmo (defesa contra auto-amizade)
      var filtered = list.filter(function(p) { return p && p.uid !== cu.uid && p.placeId; });
      if (!window._dashPresenceCache) window._dashPresenceCache = { own: [], friends: [], ts: 0 };
      window._dashPresenceCache.friends = filtered;
      window._dashPresenceCache.ts = Date.now();
      _hydrateFriendsPresenceWidget();
    });
  }

  window._dashListenerSig = sig;
  window._dashListenerCleanup = function() {
    try { ownUnsub(); } catch (e) {}
    try { friendsUnsub(); } catch (e) {}
  };
}

function _teardownPresenceListeners() {
  if (window._dashListenerCleanup) {
    try { window._dashListenerCleanup(); } catch (e) {}
    window._dashListenerCleanup = null;
    window._dashListenerSig = null;
  }
}
window._teardownPresenceListeners = _teardownPresenceListeners;

// ─── Casual link request dashboard banner ─────────────────────────────────
// v1.3.73-beta: quando o organizador de uma partida casual sugere que um
// nome genérico (ex: "Kelly") é um usuário cadastrado (Kelly Barth), o
// sistema envia uma notificação casual_link_request para esse usuário.
// Antes, o único ponto de resposta era o ícone 🔔 de notificações — que
// muitos usuários nunca abrem. Agora exibe banner âmbar proeminente
// diretamente na dashboard com botões ✅/❌ inline.
// Reutiliza o mesmo handler window._confirmCasualLinkRequest de bracket-ui.js
// que já alimenta os botões na tela de notificações (single source of truth).
function _hydrateCasualLinkWidget() {
  var box = document.getElementById('dashboard-casual-link-widget');
  if (!box) return;
  var cu = window.AppStore && window.AppStore.currentUser;
  if (!cu || !cu.uid) { box.innerHTML = ''; return; }
  if (!window.FirestoreDB || !window.FirestoreDB.db) { box.innerHTML = ''; return; }

  var _safe = window._safeHtml || function(s) { return String(s || ''); };

  window.FirestoreDB.db
    .collection('users').doc(cu.uid).collection('notifications')
    .where('type', '==', 'casual_link_request')
    .where('read', '==', false)
    .limit(5)
    .get()
    .then(function(snap) {
      var pending = [];
      snap.forEach(function(doc) {
        var d = doc.data();
        d._id = doc.id;
        if (d.casualMatchDocId) pending.push(d);
      });

      var widgetBox = document.getElementById('dashboard-casual-link-widget');
      if (!widgetBox) return;

      if (pending.length === 0) { widgetBox.innerHTML = ''; return; }

      // Cache notifications keyed by id so the confirm handler can look
      // them up without DOM serialization.
      window._dashCasualLinkNotifCache = window._dashCasualLinkNotifCache || {};
      pending.forEach(function(n) { window._dashCasualLinkNotifCache[n._id] = n; });

      var cards = pending.map(function(n) {
        var guestName = _safe(n.casualGuestName || 'você');
        var sport = _safe(n.casualSport || '');
        var sportLabel = sport ? ' de <b>' + sport + '</b>' : '';
        var safeId = (n._id || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        var organizer = _safe(n.senderName || n.senderEmail || 'O organizador');
        var roomBadge = n.casualRoomCode
          ? ' · <span style="font-family:monospace;color:#fbbf24;letter-spacing:1px;font-size:0.78rem;">' + _safe(n.casualRoomCode) + '</span>'
          : '';

        return '<div style="display:flex;align-items:flex-start;gap:12px;padding:14px 16px;' +
          'background:linear-gradient(135deg,rgba(251,191,36,0.18),rgba(245,158,11,0.07));' +
          'border:1px solid rgba(251,191,36,0.45);border-radius:14px;flex-wrap:wrap;">' +
          '<span style="font-size:1.4rem;flex-shrink:0;margin-top:2px;">🤝</span>' +
          '<div style="flex:1;min-width:180px;">' +
            '<div style="font-weight:800;color:#fbbf24;font-size:0.92rem;margin-bottom:4px;">Você jogou esta partida?</div>' +
            '<div style="font-size:0.82rem;color:var(--text-bright);margin-bottom:10px;line-height:1.45;">' +
              organizer + ' sugeriu que <b>' + guestName + '</b>' + sportLabel + roomBadge +
              ' era você. Confirme para vincular as estatísticas ao seu perfil.' +
            '</div>' +
            '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
              '<button onclick="window._dashConfirmCasualLink(\'' + safeId + '\', true)" ' +
                'style="background:linear-gradient(135deg,#10b981,#059669);border:none;color:#fff;' +
                'border-radius:8px;padding:7px 16px;font-size:0.8rem;font-weight:700;cursor:pointer;' +
                'display:inline-flex;align-items:center;gap:5px;">' +
                '✅ Sim, era eu' +
              '</button>' +
              '<button onclick="window._dashConfirmCasualLink(\'' + safeId + '\', false)" ' +
                'style="background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.4);' +
                'color:#f87171;border-radius:8px;padding:7px 16px;font-size:0.8rem;font-weight:700;cursor:pointer;">' +
                '❌ Não, era outra pessoa' +
              '</button>' +
            '</div>' +
          '</div>' +
        '</div>';
      });

      widgetBox.innerHTML = '<div style="display:flex;flex-direction:column;gap:10px;">' + cards.join('') + '</div>';
    })
    .catch(function(e) {
      window._warn('[casual-link-widget] error loading notifs:', e);
      var widgetBox = document.getElementById('dashboard-casual-link-widget');
      if (widgetBox) widgetBox.innerHTML = '';
    });
}

// Confirm or deny a casual link request from the dashboard banner.
// Looks up the cached notification by id (set during _hydrateCasualLinkWidget)
// and delegates to window._confirmCasualLinkRequest (bracket-ui.js).
// After the action, re-hydrates the banner so it disappears immediately.
window._dashConfirmCasualLink = async function(notifId, accept) {
  if (!notifId) return;
  var cache = window._dashCasualLinkNotifCache || {};
  var notif = cache[notifId];
  if (!notif) {
    // Fallback: load directly from Firestore (cache miss / page reload case)
    var cu = window.AppStore && window.AppStore.currentUser;
    if (cu && cu.uid && window.FirestoreDB && window.FirestoreDB.db) {
      try {
        var docSnap = await window.FirestoreDB.db
          .collection('users').doc(cu.uid)
          .collection('notifications').doc(notifId).get();
        if (docSnap.exists) { notif = docSnap.data(); notif._id = docSnap.id; }
      } catch (e) {
        window._warn('[casual-link-widget] notif fallback load failed:', e);
      }
    }
  }
  if (!notif) {
    if (typeof showNotification === 'function') showNotification('Notificação não encontrada', 'Pode ter expirado.', 'warning');
    return;
  }
  if (typeof window._confirmCasualLinkRequest === 'function') {
    await window._confirmCasualLinkRequest(notif, accept);
  }
  // Clear banner immediately — don't wait for the next profile-loaded event
  _hydrateCasualLinkWidget();
};

// Load the user's OWN active presences (check-in ativo ou plan no futuro)
// e renderiza um pill status no topo da dashboard. Antes, o usuário fazia
// "Estou aqui" e ao voltar pra dashboard não tinha feedback visual do
// próprio check-in — agora aparece "📍 Você está em [Local] · expira em Xh"
// com botão "Cancelar". Pra plans mostra "🗓️ Você planejou em [Local]
// às HH:mm". Silent quando não há presença ativa (não polui a UI).
function _hydrateMyActivePresenceWidget() {
  var box = document.getElementById('dashboard-myactive-widget');
  if (!box || !window.AppStore) return;
  var cu = window.AppStore.currentUser;
  if (!cu || !cu.uid) return;
  var _safe = window._safeHtml || function(s) { return String(s || ''); };

  // v0.16.78: UNIFICAÇÃO. Antes este widget mostrava pills separados pra
  // check-in/plano + empty CTA — duplicando info que o widget Movimento já
  // mostra (chip "Você" no venue card + ✕ inline). Resultado: usuário via
  // "Sua presença" pill vazia EM CIMA de "Movimento nos seus locais"
  // também vazio = duas seções de presença mostrando a mesma coisa.
  // Agora este widget mostra APENAS a sala casual em andamento (conceito
  // separado, não mostrado em nenhum outro lugar). Toda presença
  // (plano/checkin) consolidada no widget Movimento com seu CTA único.
  if (cu.activeCasualRoom) {
    var safeRoom = String(cu.activeCasualRoom).replace(/\\/g, '\\\\').replace(/\'/g, "\\'");
    box.innerHTML =
      '<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:linear-gradient(135deg,rgba(56,189,248,0.15),rgba(14,165,233,0.06));border:1px solid rgba(56,189,248,0.35);border-radius:12px;flex-wrap:wrap;">' +
        '<span style="font-size:1.2rem;flex-shrink:0;">⚡</span>' +
        '<div style="flex:1;min-width:150px;">' +
          '<div style="font-weight:700;color:var(--text-bright);font-size:0.88rem;">Partida casual em andamento</div>' +
          '<div style="font-size:0.72rem;color:var(--text-muted);">Sala <b style="color:#38bdf8;font-family:monospace;letter-spacing:1px;">' + _safe(cu.activeCasualRoom) + '</b> · continue de onde parou</div>' +
        '</div>' +
        '<button onclick="window.location.hash=\'#casual/' + safeRoom + '\'" style="background:linear-gradient(135deg,#38bdf8,#0ea5e9);border:none;color:#fff;border-radius:8px;padding:6px 14px;font-size:0.78rem;font-weight:700;cursor:pointer;">⚡ Voltar</button>' +
      '</div>';
  } else {
    box.innerHTML = '';
  }
}

// Handler pro botão Cancelar do status de presença. Marca localmente pra
// evitar double-call e delega pro PresenceDB.cancelPresence. Re-renderiza
// o widget após sucesso.
window._dashCancelPresence = function(docId) {
  if (!docId || !window.PresenceDB) return;
  if (!confirm('Cancelar sua presença?')) return;
  window.PresenceDB.cancelPresence(docId).then(function() {
    if (typeof showNotification === 'function') showNotification('Presença cancelada.', '', 'info');
    _hydrateMyActivePresenceWidget();
  }).catch(function(e) {
    window._warn('Cancel presence failed:', e);
    if (typeof showNotification === 'function') showNotification('Erro ao cancelar.', '', 'error');
  });
};

// Load friends' active or upcoming presences and render a compact widget.
// Clicking a row pre-fills the presence view with the same venue+sport.
function _hydrateFriendsPresenceWidget() {
  var box = document.getElementById('dashboard-presences-widget');
  if (!box || !window.PresenceDB || !window.AppStore) return;
  var cu = window.AppStore.currentUser;
  if (!cu || !cu.uid) return;
  // Muted = don't fetch anyone's presences, consistent with Perfil → Presença.
  var muteUntil = Number(cu.presenceMuteUntil || 0);
  if (muteUntil > Date.now()) return;
  // Filtra o próprio uid do array de amigos como defesa contra auto-amizade
  // (dado corrompido via migração ou bug). Sem isso, o usuário veria a
  // própria presença APARECER TANTO no widget "Sua presença ativa" quanto
  // no widget "Amigos no local" — duplicidade confusa.
  // v0.16.43: também filtra entries com '@' (emails antigos não migrados pra
  // uid). Antes da v0.x.x todo amigo era salvo por email; uma migração roda
  // em login (auth.js:999) mas só atualiza o doc do *outro* lado quando o
  // OUTRO usuário faz login. Se o amigo nunca relogou, o array do usuário
  // atual ainda tem email — e `where('uid', 'in', emails)` no loadForFriends
  // nunca casa, fazendo o widget render "Nenhum amigo registrou presença".
  var friendsRaw = Array.isArray(cu.friends) ? cu.friends.filter(function(u) { return u && u !== cu.uid; }) : [];
  var friendsLikeUid = friendsRaw.filter(function(u) { return typeof u === 'string' && u.indexOf('@') === -1; });
  var friendsLikeEmail = friendsRaw.filter(function(u) { return typeof u === 'string' && u.indexOf('@') !== -1; });
  window._log('[FriendsWidget v0.16.43]', {
    uid: cu.uid,
    friendsRawCount: friendsRaw.length,
    friendsRaw: friendsRaw,
    friendsLikeUidCount: friendsLikeUid.length,
    friendsLikeEmailCount: friendsLikeEmail.length,
    friendsLikeEmail: friendsLikeEmail
  });
  var friends = friendsLikeUid;

  // v0.16.43: tenta resolver emails antigos → uid via query Firestore.
  // Faz best-effort: pra cada email no array friends, busca em users where
  // email_lower == email; se acha, adiciona o uid em `friends` E também
  // grava a migração no perfil do usuário (arrayUnion uid + arrayRemove email)
  // pra não precisar refazer a query toda vez.
  if (friendsLikeEmail.length > 0 && window.FirestoreDB && window.FirestoreDB.db) {
    var resolvePromises = friendsLikeEmail.map(function(em) {
      var emLower = String(em).toLowerCase();
      return window.FirestoreDB.db.collection('users').where('email_lower', '==', emLower).limit(1).get()
        .then(function(snap) {
          if (snap.empty) {
            // Fallback: alguns docs antigos usam 'email' em vez de 'email_lower'
            return window.FirestoreDB.db.collection('users').where('email', '==', em).limit(1).get();
          }
          return snap;
        })
        .then(function(snap) {
          if (snap.empty) {
            window._warn('[FriendsWidget] email não resolvido pra uid:', em);
            return null;
          }
          var doc = snap.docs[0];
          var resolvedUid = doc.id;
          window._log('[FriendsWidget] email resolvido:', em, '→', resolvedUid);
          // Persiste a migração no doc do usuário atual
          try {
            var FV = firebase.firestore.FieldValue;
            window.FirestoreDB.db.collection('users').doc(cu.uid).update({
              friends: FV.arrayUnion(resolvedUid)
            }).then(function() {
              return window.FirestoreDB.db.collection('users').doc(cu.uid).update({
                friends: FV.arrayRemove(em)
              });
            }).catch(function(e) { window._warn('[FriendsWidget] migrate persist falhou:', e); });
          } catch (e) {}
          return resolvedUid;
        })
        .catch(function(e) { window._warn('[FriendsWidget] resolve query falhou pra', em, e); return null; });
    });
    Promise.all(resolvePromises).then(function(resolved) {
      var added = resolved.filter(function(u) { return u && friends.indexOf(u) === -1; });
      if (added.length > 0) {
        window._log('[FriendsWidget] re-querying com uids resolvidos:', added);
        // Atualiza cache local também
        if (Array.isArray(cu.friends)) {
          added.forEach(function(u) { if (cu.friends.indexOf(u) === -1) cu.friends.push(u); });
        }
        // Re-dispara a hidratação com a lista completa — o caminho normal
        // abaixo já vai pegar (friends agora tem os uids resolvidos).
        setTimeout(_hydrateFriendsPresenceWidget, 100);
      }
    });
  }
  // v0.16.73: removido o diag block (DIAG_VERSION/SELF_PROBE_SLOT/_diagLine/
  // _diagBlock/_runSelfProbe) introduzido nas v0.16.43-64. Cumpriu a missão
  // (debug iterativo de email→uid migration, query empty, self-presence
  // rendering, dedup de venues) e a feature estabilizou. Diag em produção
  // poluía a UI sem propósito ativo. Caminhos de empty state agora são
  // limpos — só copy + CTA. Restaurar pelo histórico do git se regredir.

  // v0.16.77: SEMPRE carrega o próprio plano do user, INDEPENDENTE de ter
  // amigos ou de eles ainda estarem em formato email. Bug crítico anterior
  // (até v0.16.76): early-return em friendsRaw=0 OU friends=0 escondia o
  // plano do user. Nelson sem amigos cadastrados que planejava Paineiras
  // não via NADA na seção Movimento. Agora o fetch único cobre os 3 cenários
  // (friendsRaw=0, friends=email, friends ok) e renderiza o card do venue
  // do user em qualquer caso onde ele tem plano.
  // v0.16.77: fetch UNIFICADO compartilhado entre os dois widgets de
  // presença (Sua presença + Movimento). Antes cada um chamava loadMyActive
  // separadamente — duas idas ao Firestore, sem garantia de consistência
  // entre eles. Agora window._dashPresenceCache guarda o resultado e ambos
  // re-usam. Refresh invalida o cache.
  var fetchOwn = (window.PresenceDB && typeof window.PresenceDB.loadMyActive === 'function')
    ? window.PresenceDB.loadMyActive(cu.uid).catch(function() { return []; })
    : Promise.resolve([]);
  var fetchFriends = (friends.length > 0 && window.PresenceDB && typeof window.PresenceDB.loadForFriends === 'function')
    ? window.PresenceDB.loadForFriends(friends).catch(function() { return []; })
    : Promise.resolve([]);
  Promise.all([fetchFriends, fetchOwn]).then(function(results) {
    var friendsList = (results[0] || []).filter(function(p) { return p && p.uid !== cu.uid && p.placeId; });
    var ownList = (results[1] || []).filter(function(p) { return p && p.placeId; });
    // Cache compartilhado pra outros consumidores (myactive widget) re-usarem.
    window._dashPresenceCache = { own: ownList, friends: friendsList, ts: Date.now() };
    var list = friendsList.concat(ownList);
    if (list.length === 0) {
      // Empty state diferenciado: sem amigos vs sem movimento.
      var hasFriends = friendsRaw.length > 0;
      var msgTitle = hasFriends
        ? 'Nenhum movimento em seus locais agora'
        : '👥 Veja seus amigos jogando';
      var msgSub = hasFriends
        ? 'Quando você ou um amigo marcar "Estou aqui" ou planejar ida, aparece aqui.'
        : 'Adicione amigos em Pessoas pra acompanhar presenças nos locais que vocês frequentam.';
      var ctaText = hasFriends ? 'Minha presença →' : 'Encontrar amigos →';
      var ctaHref = hasFriends ? '#place' : '#explore';
      var bg = hasFriends ? 'var(--bg-card)' : 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(59,130,246,0.08))';
      var border = hasFriends ? 'var(--border-color)' : 'rgba(99,102,241,0.25)';
      box.innerHTML =
        '<div style="background:' + bg + ';border:1px solid ' + border + ';border-radius:14px;padding:12px 14px;">' +
          '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' +
            (hasFriends ? '<span style="font-size:1.1rem;opacity:0.65;">👥</span>' : '') +
            '<div style="flex:1;min-width:200px;">' +
              '<div style="font-size:' + (hasFriends ? '0.82rem' : '0.92rem') + ';color:var(--text-bright);font-weight:' + (hasFriends ? '600' : '700') + ';">' + msgTitle + '</div>' +
              '<div style="font-size:' + (hasFriends ? '0.72rem' : '0.78rem') + ';color:var(--text-muted);margin-top:2px;">' + msgSub + '</div>' +
            '</div>' +
            '<a href="' + ctaHref + '" style="font-size:0.78rem;color:var(--primary-color);text-decoration:none;font-weight:600;white-space:nowrap;">' + ctaText + '</a>' +
          '</div>' +
        '</div>';
      return;
    }

    // v0.16.48: ao invés de cards flat por amigo (com bug "·undefined" porque
    // p.sport não existe — schema tem sports[] array), renderiza UM CARD POR
    // VENUE com o trio "Agora no local" + "Próximas horas" + gráfico horário,
    // mesmo padrão usado no #place. Reusa os helpers de venues.js via
    // window._venuesHydrateAllPreferredMovement (que itera todos os
    // [data-pref-pid] no DOM e hidrata os 3 slots de cada um).
    // v0.16.63: dedup por NOME canônico do venue, não placeId. Usuário
    // reportou widget mostrando "Clube Paineiras do Morumby" duas vezes
    // (uma com placeId Google, outra com synthetic `pref_lat_lng` cadastrado
    // por amigo nos preferidos). Antes a chave era `p.placeId` direta —
    // 2 placeIds diferentes pro mesmo venue físico = 2 cards. Agora canon
    // key é `venueName.trim().toLowerCase()` (sem acentos, sem espaços
    // extras) com fallback pra placeId quando nome ausente. Pra `realPid`
    // do hidratador, prefere placeId que NÃO começa com `pref_` (synthetic
    // de preferidos) — Google placeId é mais estável e tem dados completos
    // no `loadVenue`.
    var venuesByPid = {};
    var _canonName = function(name) {
      return String(name || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    };
    var _isSyntheticPid = function(pid) {
      return typeof pid === 'string' && pid.indexOf('pref_') === 0;
    };
    list.forEach(function(p) {
      var canon = _canonName(p.venueName) || p.placeId || '';
      if (!canon) return;
      if (!venuesByPid[canon]) {
        venuesByPid[canon] = {
          placeId: p.placeId,
          venueName: p.venueName || 'Local',
          venueLat: p.venueLat,
          venueLon: p.venueLon
        };
      } else {
        // Já tem bucket. Se este doc tem placeId Google (não-synthetic) e
        // o bucket atual tem synthetic, troca pra usar o real.
        var existing = venuesByPid[canon];
        if (_isSyntheticPid(existing.placeId) && !_isSyntheticPid(p.placeId) && p.placeId) {
          existing.placeId = p.placeId;
        }
      }
    });
    var venueList = Object.keys(venuesByPid).map(function(k) { return venuesByPid[k]; });

    var _safe = window._safeHtml || function(s) { return String(s || ''); };
    var sanitizePid = function(pid) { return 'dash_' + String(pid || '').replace(/[^a-zA-Z0-9]/g, '_'); };

    var html =
      '<div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:14px;padding:14px;">' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;">' +
          '<span style="width:8px;height:8px;border-radius:50%;background:#10b981;box-shadow:0 0 8px #10b981;"></span>' +
          '<span style="font-weight:700;color:var(--text-bright);font-size:0.95rem;">Movimento nos seus locais</span>' +
          '<a href="#place" style="margin-left:auto;font-size:0.78rem;color:var(--primary-color);text-decoration:none;font-weight:600;">Ver tudo →</a>' +
        '</div>';

    // v0.16.78: banner prominente listando os planos/checkins do PRÓPRIO user
    // ANTES dos venue cards. Pedido do usuário: "aqui deveria aparecer que
    // nelson estara no paineiras tal horas (para o proprio nelson)". Antes,
    // o plano só aparecia como chip discreto em "Próximas horas" do venue
    // card — fácil de não ver. Agora aparece como linha destacada verde
    // (check-in) ou índigo (plano) com horário, esporte, e botão Cancelar
    // logo no topo da seção.
    var nowMs = Date.now();
    var ownActive = ownList.filter(function(p) { return p && !p.cancelled; });
    var ownCheckins = ownActive.filter(function(p) { return p.type === 'checkin' && p.startsAt <= nowMs && p.endsAt > nowMs; });
    var ownPlans = ownActive.filter(function(p) { return p.type === 'planned' && p.startsAt > nowMs; });
    ownPlans.sort(function(a, b) { return a.startsAt - b.startsAt; });
    if (ownCheckins.length > 0 || ownPlans.length > 0) {
      var myRows = '';
      ownCheckins.forEach(function(p) {
        var pVenue = _safe(p.venueName || 'Local');
        var pSports = Array.isArray(p.sports) && p.sports.length ? p.sports.join('/') : '';
        var docId = String(p._id || '').replace(/'/g, "\\'").replace(/\\/g, "\\\\");
        var endsAt = Number(p.endsAt) || 0;
        myRows +=
          '<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;background:linear-gradient(135deg,rgba(16,185,129,0.18),rgba(16,185,129,0.06));border:1px solid rgba(16,185,129,0.4);border-radius:10px;">' +
            '<span style="width:8px;height:8px;border-radius:50%;background:#10b981;box-shadow:0 0 8px #10b981;flex-shrink:0;"></span>' +
            '<div style="flex:1;min-width:0;">' +
              '<div style="font-weight:700;color:var(--text-bright);font-size:0.84rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">📍 Você está em <span style="color:#10b981;">' + pVenue + '</span>' + (pSports ? ' <span style="font-weight:500;color:var(--text-muted);">· ' + _safe(pSports) + '</span>' : '') + '</div>' +
              '<div style="font-size:0.7rem;color:var(--text-muted);">expira em <b data-countdown-target="' + endsAt + '">…</b></div>' +
            '</div>' +
            '<button onclick="window._dashCancelPresence(\'' + docId + '\')" style="background:transparent;color:#ef4444;border:none;padding:0;margin:0;font-weight:900;font-size:1.05rem;line-height:1;cursor:pointer;flex-shrink:0;" title="Sair do local">✕</button>' +
          '</div>';
      });
      ownPlans.slice(0, 3).forEach(function(p) {
        var pVenue = _safe(p.venueName || 'Local');
        var pSports = Array.isArray(p.sports) && p.sports.length ? p.sports.join('/') : '';
        var docId = String(p._id || '').replace(/'/g, "\\'").replace(/\\/g, "\\\\");
        var d = new Date(p.startsAt);
        var hhmm = window._formatHHMM(d);
        var dayLabel = (d.toDateString() === new Date().toDateString())
          ? 'hoje'
          : (d.toDateString() === new Date(nowMs + 86400000).toDateString() ? 'amanhã' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }));
        myRows +=
          '<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;background:rgba(99,102,241,0.10);border:1px solid rgba(99,102,241,0.35);border-radius:10px;">' +
            '<span style="font-size:1rem;flex-shrink:0;">🗓️</span>' +
            '<div style="flex:1;min-width:0;">' +
              '<div style="font-weight:700;color:var(--text-bright);font-size:0.84rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Você estará em <span style="color:#a5b4fc;">' + pVenue + '</span>' + (pSports ? ' <span style="font-weight:500;color:var(--text-muted);">· ' + _safe(pSports) + '</span>' : '') + '</div>' +
              '<div style="font-size:0.7rem;color:var(--text-muted);">' + _safe(dayLabel) + ' às <b>' + _safe(hhmm) + '</b></div>' +
            '</div>' +
            '<button onclick="window._dashCancelPresence(\'' + docId + '\')" style="background:transparent;color:#ef4444;border:none;padding:0;margin:0;font-weight:900;font-size:1.05rem;line-height:1;cursor:pointer;flex-shrink:0;" title="Cancelar plano">✕</button>' +
          '</div>';
      });
      html += '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px;">' + myRows + '</div>';
    }

    venueList.forEach(function(v, idx) {
      var safePid = sanitizePid(v.placeId);
      var realPid = _safe(v.placeId);
      var name = _safe(v.venueName);
      var separator = idx > 0 ? 'margin-top:14px;padding-top:14px;border-top:1px solid var(--border-color);' : '';
      // data-pref-pid + data-pref-placeid + data-pref-venuename = mesma assinatura
      // dos cards de #place. Quando _venuesHydrateAllPreferredMovement() roda,
      // ele encontra estes cards no DOM e hidrata os slots automaticamente.
      html +=
        '<div data-pref-pid="' + safePid + '" data-pref-placeid="' + realPid + '" data-pref-venuename="' + name + '" style="' + separator + '">' +
          '<div onclick="window.location.hash=\'#venues/' + realPid + '\'" style="cursor:pointer;font-weight:700;color:var(--text-bright);font-size:0.92rem;margin-bottom:8px;display:flex;align-items:center;gap:6px;">' +
            '📍 ' + name +
          '</div>' +
          '<div id="pref-chart-' + safePid + '" style="margin-bottom:8px;"></div>' +
          '<div id="pref-now-' + safePid + '" style="margin-bottom:8px;"></div>' +
          '<div id="pref-upcoming-' + safePid + '"></div>' +
        '</div>';
    });
    html += '</div>';
    box.innerHTML = html;
    // v0.16.48: dispara o ciclo de hidratação dos venues (chart + now +
    // upcoming) que vive em venues.js. Ele itera todos os [data-pref-pid]
    // no DOM — incluindo os que acabamos de inserir aqui no dashboard — e
    // popula os slots pref-chart-*, pref-now-*, pref-upcoming-*. Single
    // source of truth: nenhuma duplicação de lógica entre #place e #dashboard.
    if (typeof window._venuesHydrateAllPreferredMovement === 'function') {
      // Pequeno delay pra garantir que o DOM está pronto pra querySelectorAll.
      setTimeout(window._venuesHydrateAllPreferredMovement, 50);
    }
  }).catch(function(e) {
    window._warn('Erro ao carregar presenças de amigos:', e);
  });
}

// Check all tournaments for pending co-org invites or pending transfers targeting current user
function _checkPendingInvitesAndRedirect(allTournaments) {
  var cu = window.AppStore.currentUser;
  if (!cu || !cu.email) return;
  // Only auto-redirect once per session to avoid loop
  if (window._pendingInviteRedirected) return;

  var email = cu.email;
  var uid = cu.uid || '';

  for (var i = 0; i < allTournaments.length; i++) {
    var t = allTournaments[i];

    // Check co-host pending invite
    if (Array.isArray(t.coHosts)) {
      var pendingCohost = t.coHosts.find(function(ch) {
        return ch.status === 'pending' && (ch.email === email || (uid && ch.uid === uid));
      });
      if (pendingCohost) {
        window._pendingInviteRedirected = true;
        window._pendingInviteType = 'cohost';
        window._pendingInviteTournamentId = String(t.id);
        window.location.hash = '#tournaments/' + t.id;
        return;
      }
    }

    // Check pending transfer
    if (t.pendingTransfer && (t.pendingTransfer.targetEmail === email || (uid && t.pendingTransfer.targetUid === uid))) {
      window._pendingInviteRedirected = true;
      window._pendingInviteType = 'transfer';
      window._pendingInviteTournamentId = String(t.id);
      window.location.hash = '#tournaments/' + t.id;
      return;
    }
  }
}
