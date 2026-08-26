/* tabela de cor ausente (teste headless) => devolve a cor crua, como antes da 2.0.94 */
if (typeof window !== 'undefined' && !window._spCor) window._spCor = function (c) { return c; };
// v0.16.93/94: handler de click no card de torneio na dashboard. Detecta
// se o click veio de dentro de um elemento que NÃO deve disparar navegação
// (ex: toggle Liga ativado/desativado, botão de inscrever, etc.) e ignora.
// Pedido do usuário: "quando clicarmos no togle ... não entre no detalhe
// do card" + "quando clicamos no togle ... mantenha tudo parado no lugar".
// Em vez de confiar em stopPropagation no toggle (que tem múltiplas camadas
// e às vezes falha em CSS toggle-switch), o handler do card próprio checa
// se event.target está dentro de um elemento "no-nav" via closest().
// ⚠️ A REGRA MORA NUMA PORTA SÓ (1.9.48): guardas de "não navega" + resposta ao toque
// vivem em `window._openTournamentCard` (store.js), porque a LISTA de torneios tinha
// cópia própria — e ficou sem o feedback quando a 1.9.46 consertou só este lado.
// Este nome continua existindo porque o HTML da dashboard já o chama.
window._dashCardClick = function(event, tournamentId) {
  if (!event || !tournamentId) return;
  window._openTournamentCard(event, tournamentId);
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
    var f = (window._formatLabel ? window._formatLabel(tour) : tour.format) || t('common.other');
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
        '<div class="stat-box"><div style="font-size:calc(var(--sp-u) * 1.6);font-weight:800;color:var(--sp-c-var-primary-color-,var(--primary-color));">' + total + '</div><div style="font-size:0.78rem;color:var(--text-muted);">' + t('analytics.totalTournaments') + '</div></div>' +
        '<div class="stat-box"><div style="font-size:calc(var(--sp-u) * 1.6);font-weight:800;color:var(--sp-c-var-primary-color-,var(--primary-color));">' + uniqueCount + '</div><div style="font-size:0.78rem;color:var(--text-muted);">' + t('analytics.uniqueParticipants') + '</div></div>' +
        '<div class="stat-box"><div style="font-size:calc(var(--sp-u) * 1.6);font-weight:800;color:var(--sp-c-var-primary-color-,var(--primary-color));">' + avgParts + '</div><div style="font-size:0.78rem;color:var(--text-muted);">' + t('analytics.avgParticipants') + '</div></div>' +
        '<div class="stat-box"><div style="font-size:calc(var(--sp-u) * 1.6);font-weight:800;color:var(--sp-c-var-primary-color-,var(--primary-color));">' + bestMonthLabel + '</div><div style="font-size:0.78rem;color:var(--text-muted);">' + t('analytics.bestMonth') + '</div></div>' +
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
  // v1.8.40: regra canônica (waitlist-core._enrollmentOpenState — a mesma do servidor).
  var _sorteio = window._phaseDrawDone ? window._phaseDrawDone(t)
    : ((Array.isArray(t.matches) && t.matches.length > 0) || (Array.isArray(t.rounds) && t.rounds.length > 0) || (Array.isArray(t.groups) && t.groups.length > 0));
  var _aberto = window._enrollmentOpenState ? window._enrollmentOpenState(t).open
    : ((t.status !== 'closed' && t.status !== 'finished' && !_sorteio));
  if (!_aberto) {
    // v1.5.3 (bug de produção, torneio ao vivo): esta regra era uma CÓPIA driftada que
    // ignorava a INSCRIÇÃO DURANTE A FASE. Com o sorteio feito e o toggle em Abertas
    // (standby/expand) ela dizia FECHADA e o clique respondia "Inscrições Encerradas" —
    // contradizendo o PRÓPRIO card, cujo `canEnroll` (abaixo) mostra o botão exatamente
    // nesse caso. Nada a ver com a R2: bastava o sorteio existir. Fonte ÚNICA agora é a
    // janela canônica (window._lateEnrollWindowOpen: aberta na R1 da fase, fecha no 1º
    // placar LANÇADO da R2) — e o fluxo é o de enrollCurrentUser, que pós-sorteio inscreve
    // na LISTA DE ESPERA (o servidor recusa, e deve recusar, inserção direta no roster).
    // Fallback fail-open igual ao _allowsLateEnrollment: sem a janela carregada, vale o
    // toggle. Ver [[project_late_enrollment_default_closed_live_toggle]].
    var _leDash = window._effectiveLateEnrollment ? window._effectiveLateEnrollment(t) : t.lateEnrollment;
    var _lateOpen = (typeof window._lateEnrollWindowOpen === 'function')
      ? window._lateEnrollWindowOpen(t)
      : (t.status !== 'closed' && (_leDash === 'standby' || _leDash === 'expand'));
    if (t.status !== 'finished' && _lateOpen) { window.enrollCurrentUser(tId); return; }
    if (typeof showAlertDialog === 'function') showAlertDialog(window._t('auth.enrollClosed'), window._t('auth.enrollClosedMsg'), null, { type: 'warning' });
    return;
  }

  // For team tournaments, skip the team modal — enroll as individual participant
  // (organizer enrolling from dashboard is always self-enrollment)
  var hasCats = (t.combinedCategories && t.combinedCategories.length > 0) ||
                (t.genderCategories && t.genderCategories.length > 0) ||
                (t.skillCategories && t.skillCategories.length > 0) ||
                (t.ageCategories && t.ageCategories.length > 0);
  if (hasCats) {
    // v2.4.9: FAIL-OPEN — ver enrollCurrentUser. Falha técnica na categoria
    // inscreve sem categoria (organizador ajusta depois), nunca deixa de fora.
    var _failOpenDash = function(reason) {
      window._warn('[enroll/dash] categoria não resolvida (' + reason + ') — inscrevendo sem categoria');
      window._doEnrollCurrentUser(tId, null);
      window.location.hash = '#tournaments/' + tId;
    };
    try {
      window._resolveEnrollmentCategory(tId, function(cats) {
        if (cats) {
          window._doEnrollCurrentUser(tId, cats);
          window.location.hash = '#tournaments/' + tId;
        } else {
          _failOpenDash('sem-categoria-resolvida');
        }
      });
    } catch (e) {
      if (typeof window._captureException === 'function') {
        try { window._captureException(e, { area: 'enroll-dash-resolveCategory', tournamentId: tId }); } catch (_ce) {}
      }
      _failOpenDash('exceção');
    }
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
// v2.8.61: persiste o estado aberto/fechado das seções colapsáveis da dashboard
// (Encerrados, Ocultados, descoberta) — antes resetavam a cada re-render/filtro.
// Devolve os atributos do <details>: ` open` (se ficou aberto) + ontoggle que grava
// no localStorage. defaultOpen = estado quando o usuário nunca tocou.
function _dashDetailsAttr(key, defaultOpen, lazyId) {
  var v = null; try { v = localStorage.getItem(key); } catch (e) {}
  var isOpen = (v === null) ? !!defaultOpen : (v === '1');
  // v1.8.94: com `lazyId`, o conteúdo é montado no primeiro ABRIR (ver _dashLazyOpen).
  // O ontoggle já existia pra lembrar o estado; agora ele também hidrata.
  var lazy = lazyId ? 'window._dashLazyOpen(this,\'' + lazyId + '\');' : '';
  return (isOpen ? ' open' : '') +
    ' ontoggle="' + lazy + 'try{localStorage.setItem(\'' + key + '\', this.open?\'1\':\'0\')}catch(e){}"';
}

// Monta o corpo de um bloco recolhível SEM pagar por ele enquanto está fechado.
// Aberto (estado lembrado do usuário) → monta agora, como sempre foi.
// Fechado → devolve um slot vazio; `_dashLazyOpen` preenche no primeiro toque.
function _dashLazyBody(gid, aberto, construir) {
  if (aberto) return '<div data-lazy-slot="' + gid + '" data-filled="1">' + construir() + '</div>';
  window._dashLazyGroups[gid] = construir;
  return '<div data-lazy-slot="' + gid + '"></div>';
}
function _dashDetailsAberto(key, defaultOpen) {
  var v = null; try { v = localStorage.getItem(key); } catch (e) {}
  return (v === null) ? !!defaultOpen : (v === '1');
}

// ── v1.8.94: BLOCO FECHADO NÃO SE MONTA ─────────────────────────────────────
// Relato do dono no app NATIVO (build 39): "fica lenta, tudo demora a responder" —
// toque no hambúrguer sem efeito, e depois de vários cliques abre. Não era travamento:
// era o WebView ocupado, derrubando os toques.
//
// MEDIDO na dashboard com a base real (16 torneios, 11 ocultos): **625 KB de HTML, e
// 437 KB (70%) DENTRO de `<details>` fechados** — cards construídos, inseridos no DOM e
// jamais vistos. O maior card sozinho tem 85 KB. Isso piorou muito na 1.8.89, quando
// "Todos" passou a varrer a plataforma inteira: a lista saiu de ~5 cards para 15, mais
// os 11 ocultos e os encerrados.
//
// Aqui o conteúdo do bloco só é montado quando ele ABRE (e uma vez só). Fechado, o
// custo é o cabeçalho. Não é otimização especulativa: é deixar de pagar por pixel que
// ninguém pediu — e protege o app conforme a plataforma cresce, que é justamente o
// caminho que a 1.8.89 abriu.
window._dashLazyGroups = window._dashLazyGroups || {};
window._dashLazyOpen = function (el, gid) {
  try {
    if (!el || !el.open) return;
    var alvo = el.querySelector('[data-lazy-slot="' + gid + '"]');
    if (!alvo || alvo.getAttribute('data-filled') === '1') return;
    var itens = window._dashLazyGroups[gid];
    if (!itens) return;
    alvo.setAttribute('data-filled', '1');
    alvo.innerHTML = itens();          // função: só executa agora
    if (typeof window._fitNames === 'function') window._fitNames(alvo);
  } catch (e) { if (window._warn) window._warn('[dash lazy]', e); }
};

// ── PEDIDO DE REPINTURA DA DASHBOARD — UMA PORTA, E ELA JUNTA (1.9.41) ───────
// Relato do dono: a dashboard "pisca 2x ao carregar". São dois pedidos legítimos que
// chegam separados no boot e cada um repinta a tela inteira:
//   1. a DESCOBERTA responde e o número de torneios públicos muda;
//   2. o snapshot do servidor chega depois do cache e o conteúdo muda.
// Cada um sozinho está certo; o que está errado é repintar duas vezes em cima da
// pessoa. Aqui os pedidos são JUNTADOS numa janela curta: quem chegar primeiro agenda,
// quem chegar depois entra na mesma repintura. Uma piscada, não duas.
// ⚠️ Não é "não repintar": some o motivo do v2.8.60 (torneio que chegou async nunca
// aparecia). É repintar UMA vez, um pouco depois — e o contador
// `window._dashRepinturas` existe pra isso ser MEDIDO, não achado.
window._dashRepinturas = 0;
window._dashPedirRepintura = function (motivo) {
  window._dashRepinturaMotivos = (window._dashRepinturaMotivos || []).concat(motivo || '?');
  if (window._dashRepinturaTimer) return;                 // já tem uma agendada — entra nela
  window._dashRepinturaTimer = setTimeout(function () {
    window._dashRepinturaTimer = null;
    var _hash = window.location.hash || '';
    var _naDash = (_hash === '' || _hash === '#' || _hash.indexOf('#dashboard') === 0);
    if (!_naDash) return;                                  // saiu da tela: não repinta nada
    window._dashRepinturas++;
    _reRenderDashKeepScroll();
  }, 450);
};

function _reRenderDashKeepScroll() {
  var c = document.getElementById('view-container');
  if (!c || typeof renderDashboard !== 'function') return;
  var _sy = window.scrollY || window.pageYOffset || 0;
  var _prevSR = window._isSoftRefresh;
  window._isSoftRefresh = true; // impede reset do guard _dashPendingScrolled
  try {
    if (window._medirTrecho) window._medirTrecho('dash-repintura', function () { renderDashboard(c); });
    else renderDashboard(c);
  } finally { window._isSoftRefresh = _prevSR; }
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
  // v2.8.40: torneios ocultados pelo usuário somem de TODAS as seções (filtro na
  // fonte) e reaparecem só na seção "Torneios ocultados" no fim.
  const _hidIds = (typeof window._getHidden === 'function') ? window._getHidden() : [];
  const _hidSet = {}; _hidIds.forEach(function(id){ _hidSet[String(id)] = 1; });
  // v2.8.46: a busca NÃO filtra mais no render (virou in-place, ver _setDashSearch /
  // _applyDashSearchInPlace) — só o filtro de ocultos roda aqui.
  const _allVisibleRaw = window.AppStore.getVisibleTournaments();
  const visible = _hidIds.length ? _allVisibleRaw.filter(function(t){ return !_hidSet[String(t.id)]; }) : _allVisibleRaw;

  // v1.7.53: o PRÉ-CARREGAMENTO de fotos foi REMOVIDO. Ele existia (v3.0.55) pra matar o
  // "pisca" do card entre os re-renders do boot, mas `t.venuePhotoUrl` é a URL crua do
  // places.googleapis.com/.../media?key=… — cada `new Image()` aqui era **uma chamada
  // COBRADA ao Google**, para TODO torneio visível, a cada render. Foi um dos três
  // caminhos que levaram o orçamento a 90% em 5 dias (R$91 de R$92 num SKU só).
  // O pisca não volta: a foto agora é um dataURL vindo de `venuePhotos/{placeId}`
  // (nosso Firestore), guardado em memória por sessão em `_venueFreshPhoto` — não há
  // rede no re-render. ⚠️ NÃO reintroduzir laço de preload sobre venuePhotoUrl.
  // v3.0.55: registra a assinatura dos dados RENDERIZADOS — o _softRefreshView
  // compara com isto e NÃO re-renderiza (nem re-pisca a foto) quando o snapshot
  // (cache→servidor no boot) traz os mesmos torneios.
  try {
    var _dtsR = (window.AppStore && window.AppStore.tournaments) || [];
    // ⚠️ FÓRMULA ÚNICA (1.9.35): carimbar aqui à mão foi o que quebrou — este lado ficou
    // em `ids` e o gate do _softRefreshView passou a comparar `ids+updatedAt` (v3.1.26).
    // Formatos diferentes nunca batem: o gate via "mudou" a cada snapshot e a dashboard
    // re-renderizava em loop (as piscadas pretas). Ver window._dashDataSigFor (store.js).
    window._dashDataSig = window._dashDataSigFor(_dtsR);
  } catch (e) {}

  // Filtros Básicos
  const torneiosCount = visible.length;
  const torneiosPublicos = visible.filter(t => t.isPublic).length;
  const inscricoesAbertas = visible.filter(t => {
    // v1.8.40: regra canônica (waitlist-core._enrollmentOpenState — a mesma do servidor).
    const _stF = window._enrollmentOpenState(t);
    // v2.1.4: late enrollment (Fechadas OFF) — inscrições seguem abertas após o
    // sorteio (e após iniciar) até o organizador encerrar. Mesma regra do detalhe.
    const _leD = window._effectiveLateEnrollment ? window._effectiveLateEnrollment(t) : t.lateEnrollment;
    const lateEnrollOpen = _stF.sorteio && t.status !== 'finished' && t.status !== 'closed' && (_leD === 'standby' || _leD === 'expand');
    return _stF.open || lateEnrollOpen;
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
  // v2.1.52: "rodando" = EFETIVAMENTE iniciado (não só sorteado). Liga com
  // sorteio = rodadas em andamento. Usado pra colocar os em andamento no topo,
  // acima dos que ainda não começaram (mesmo que já tenham sorteio).
  const _isRunning = t => {
    if (!t || t.status === 'finished') return false;
    if (t.tournamentStarted || t.status === 'in_progress' || t.status === 'started' || t.status === 'active') return true;
    var hasDraw = (Array.isArray(t.matches) && t.matches.length > 0) ||
                  (Array.isArray(t.rounds) && t.rounds.length > 0) ||
                  (Array.isArray(t.groups) && t.groups.length > 0);
    if (hasDraw && window._isLigaFormat && window._isLigaFormat(t)) return true;
    return false;
  };
  const sortByDate = (a, b) => {
    // v2.3.23: torneios ENCERRADOS sempre por último — abaixo de tudo, inclusive
    // dos em andamento que não acontecem nesta semana. Sem isso, o endDate no
    // passado fazia o finished vazar pro meio do sort cronológico.
    const finA = a.status === 'finished', finB = b.status === 'finished';
    if (finA && !finB) return 1;
    if (!finA && finB) return -1;
    // v2.1.52: torneios EFETIVAMENTE em andamento (iniciados) sempre no topo,
    // acima dos que ainda não começaram.
    const runA = _isRunning(a), runB = _isRunning(b);
    if (runA && !runB) return -1;
    if (!runA && runB) return 1;
    // v1.8.87: entre os não-iniciados, os com sorteio feito vêm antes
    const inA = _isInProgress(a) && a.status !== 'finished';
    const inB = _isInProgress(b) && b.status !== 'finished';
    if (inA && !inB) return -1;
    if (!inA && inB) return 1;

    const _hasDate = t => !!(t.startDate || t.registrationLimit || t.endDate);
    const hasA = _hasDate(a), hasB = _hasDate(b);
    if (hasA && !hasB) return -1;
    if (!hasA && hasB) return 1;
    const _time = t => {
      // Em andamento com data de término → usa o fim do TORNEIO (última fase, v1.6.83)
      var _e = window._tournamentEndDate ? window._tournamentEndDate(t) : t.endDate;
      if (_isInProgress(t) && _e) return new Date(_e).getTime();
      // Não iniciado → usa startDate
      if (t.startDate) return new Date(t.startDate).getTime();
      if (t.registrationLimit) return new Date(t.registrationLimit).getTime();
      return Infinity;
    };
    return _time(a) - _time(b);
  };

  // Ordenação MAIS RECENTE PRIMEIRO (descendente) pras seções categorizadas — Encerrados,
  // Ocultados, Favoritos, Em andamento (pedido do dono: "o mais recente fica na frente").
  // Recência = a data que representa QUANDO o torneio aconteceu: encerrado → finishedAt
  // (fallback endDate/startDate); demais → startDate (fallback registrationLimit/endDate).
  const _recencyMs = t => {
    if (!t) return 0;
    var val = (t.status === 'finished')
      ? (t.finishedAt || t.endDate || t.startDate)
      : (t.startDate || t.registrationLimit || t.endDate);
    if (val == null || val === '') return 0;
    var ms = (typeof val === 'number') ? val : new Date(val).getTime();
    return isNaN(ms) ? 0 : ms;
  };
  const sortByRecency = (a, b) => _recencyMs(b) - _recencyMs(a);

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
  // v1.8.40: regra canônica (waitlist-core._enrollmentOpenState — a mesma do servidor).
  const _isOpenEnrollment = (t) => !!(t && window._enrollmentOpenState(t).open);

  const _discoveryRaw = (window.AppStore && Array.isArray(window.AppStore.publicDiscovery))
    ? window.AppStore.publicDiscovery
    : [];
  const discovery = _hidIds.length ? _discoveryRaw.filter(function(t){ return !_hidSet[String(t.id)]; }) : _discoveryRaw;
  // v2.8.40: coleta os ocultados (dedup) pra renderizar na seção própria no fim.
  const hiddenTournaments = [];
  if (_hidIds.length) {
    var _seenHid = {};
    _allVisibleRaw.concat(_discoveryRaw).forEach(function(t){
      if (t && _hidSet[String(t.id)] && !_seenHid[String(t.id)]) { _seenHid[String(t.id)] = 1; hiddenTournaments.push(t); }
    });
    hiddenTournaments.sort(sortByRecency); // Ocultados: mais recente primeiro
  }

  // v0.16.57: helper que classifica um torneio em uma das 4 categorias do
  // discovery feed pra renderizar na ordem pedida pelo usuário:
  //   1. open       → inscrições abertas (topo)
  //   2. inProgress → já começou (sorteio realizado, !finished)
  //   3. closedNoStart → inscrições encerradas mas sem sorteio
  //   4. finished   → encerrados (sessão separada/colapsada)
  const _classifyDiscoveryTournament = (t) => {
    if (!t) return null;
    // TORNEIO PARADO SEM NENHUM JOGO some da vitrine (pedido do dono, 02/ago/2026: o
    // abandonado "fica aparecendo para todos os usuários novos"). É decisão de LEITURA —
    // nada é escrito, o torneio continua inteiro pro organizador. Encerrar quem nunca jogou
    // seria pior: viraria um "finished" de pódio vazio. Ver store._isTorneioParadoSemJogo.
    if (window._isTorneioParadoSemJogo && window._isTorneioParadoSemJogo(t)) return null;
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

    // v3.1.35: CANÔNICO — início da 1ª fase → fim da ÚLTIMA fase (mesmo helper do detalhe).
    const _tdr = (typeof window._tournamentDateRange === 'function') ? window._tournamentDateRange(t) : { start: t.startDate, end: t.endDate };
    const start = formatDateBr(_tdr.start);
    const end = formatDateBr(_tdr.end);
    const dates = start ? (end ? `${start} ${_t('tourn.dateTo')} ${end}` : `${start}`) : _t('tourn.dateTbd');
    // v2.6.24: data em grid — [🗓️ | data | hora] / ["A" | data | hora] com
    // tabular-nums → data e hora perfeitamente alinhadas entre as linhas.
    const _dateToLbl = _t('tourn.dateTo');
    const _splitDT = (s) => { var p = String(s || '').trim().split(' '); return { d: p[0] || '', t: p.slice(1).join(' ') }; };
    const _sDT = _splitDT(start), _eDT = _splitDT(end);
    const datesGridHtml = (start && end)
      ? `<span style="display:grid;grid-template-columns:auto auto auto;column-gap:9px;row-gap:3px;align-items:center;font-variant-numeric:tabular-nums;">`
          + `<span style="font-size:1.1rem;justify-self:center;line-height:1;">🗓️</span><span style="white-space:nowrap;">${_sDT.d}</span><span style="white-space:nowrap;">${_sDT.t}</span>`
          + `<span style="justify-self:center;opacity:0.8;font-weight:700;">${_dateToLbl}</span><span style="white-space:nowrap;">${_eDT.d}</span><span style="white-space:nowrap;">${_eDT.t}</span>`
        + `</span>`
      : `<span style="display:inline-flex;align-items:center;gap:8px;"><span style="font-size:1.1rem;">🗓️</span><span style="font-variant-numeric:tabular-nums;">${dates}</span></span>`;
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
    // v1.8.40: regra canônica (waitlist-core._enrollmentOpenState — a mesma do servidor).
    // A cópia daqui exigia sorteioRealizado no ligaAberta: Liga aberta pré-sorteio com
    // prazo vencido/status closed mostrava o card FECHADO enquanto o servidor aceitaria.
    const _openStD = window._enrollmentOpenState(t);
    const ligaAberta = _openStD.ligaOpen;
    // v2.1.4: late enrollment (Fechadas OFF) mantém inscrições abertas após o
    // sorteio e após iniciar, até o organizador encerrar. Mesma regra do detalhe.
    const _leD = window._effectiveLateEnrollment ? window._effectiveLateEnrollment(t) : t.lateEnrollment;
    const lateEnrollOpen = sorteioRealizado && !isFinished && t.status !== 'closed' && (_leD === 'standby' || _leD === 'expand');
    const isAberto = _openStD.open || lateEnrollOpen;
    // v1.3.35-beta: "Em Andamento" só com t.tournamentStarted setado pelo
    // botão Iniciar Torneio. Sorteio realizado mantém "Inscrições Encerradas".
    const tournamentStarted = !!(t.tournamentStarted || t.status === 'in_progress');
    const statusText = isFinished ? _t('status.finished') : (isAberto ? _t('status.open') : (tournamentStarted ? _t('status.active') : _t('status.closed')));
    const statusBg = isFinished ? 'rgba(251,191,36,0.15)' : (isAberto ? '#fbbf24' : (tournamentStarted ? 'rgba(16,185,129,0.2)' : 'rgba(0,0,0,0.3)'));
    const statusColor = isFinished ? '#fbbf24' : (isAberto ? '#78350f' : (tournamentStarted ? '#34d399' : '#fca5a5'));
    const statusFontWeight = isAberto ? '700' : '600';
    // v2.1.48: duração do torneio encerrado (início real → encerramento), exibida
    // logo abaixo do nome/logo no card.
    let _finDurStr = '';
    if (isFinished && t.tournamentStarted) {
      const _fEndMs = t.finishedAt ? (typeof t.finishedAt === 'number' ? t.finishedAt : new Date(t.finishedAt).getTime()) : null;
      if (_fEndMs && !isNaN(_fEndMs)) {
        const _fdMs = _fEndMs - (+t.tournamentStarted);
        if (_fdMs > 0 && typeof window._tProgFmtDur === 'function') _finDurStr = window._tProgFmtDur(_fdMs).replace(/\s\d+s$/, '');
      }
    }

    let enrollmentText = _t('enroll.modeMixed');
    if (t.enrollmentMode === 'individual') enrollmentText = _t('enroll.modeIndividual');
    else if (t.enrollmentMode === 'time' || t.enrollmentMode === 'teams') enrollmentText = _t('enroll.modeTeam');
    else if (t.enrollmentMode === 'misto') enrollmentText = _t('enroll.modeMixed');

    // v2.8.42: isOrg por UID (identidade primária) — email só como fallback legado
    // (torneios antigos sem creatorUid). Org por uid/telefone (sem email) agora conta.
    const _cuIsOrg = window.AppStore.currentUser;
    const isOrg = !!(_cuIsOrg && (
      (t.creatorUid && _cuIsOrg.uid && t.creatorUid === _cuIsOrg.uid) ||
      false   // ⛔ e-mail não identifica organizador (cânone do dono) — o uid acima decide
    ));

    // v2.1.95-beta: usa função centralizada (igual ao detalhe do torneio)
    // para detectar inscrição. A lógica inline anterior pulava duplas
    // (indexOf(' / ') return false) causando "Inscrever-se" em vez de
    // "Desinscrever-se" para participantes de torneios em dupla.
    // 2.0.90: pelo acessador — aceita o RESUMO (participantUids) ou o documento
    // completo, com o mesmo resultado. Ver _cardSouInscrito em tournaments-utils.js.
    let isParticipating = window._cardSouInscrito(t, window.AppStore.currentUser);

    // v2.1.5: detecta se o usuário está na lista de espera (standby/waitlist)
    // Usa _userMatchesParticipant centralizado para consistência com detalhes.
    // 2.0.90: idem — resumo (standbyUids) ou documento completo.
    let _isInStandby = window._cardSouEspera(t, window.AppStore.currentUser);

    // Card gradients adaptam ao tema via CSS variables
    // v0.17.32: dark themes (Noturno/Oceano) precisam de gradients DARK pros
    // 3 estados (default/participating/organizer) — antes participating/org
    // usavam tons médios saturados (teal-500, indigo-500, cyan-600) que
    // pareciam claros contra bg escuro. Agora usa deep tints (teal-950,
    // indigo-950, cyan-950, sky-900) que mantêm a identidade hue mas ficam
    // dark de verdade. Sunset agora é light cream desde v0.17.25 — gradients
    // antigos (brown-950) ficaram quebrados; corrigidos pra cream warm.
    var _theme = (document.documentElement.getAttribute('data-theme') || 'dark');
    var _isLight = (_theme === 'light');
    let bgGradient;
    if (_theme === 'light') {
      bgGradient = 'linear-gradient(135deg, #e2e8f0 0%, #f1f5f9 100%)';
      if (isParticipating) bgGradient = 'linear-gradient(135deg, #ccfbf1 0%, #99f6e4 100%)';
      else if (isOrg) bgGradient = 'linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%)';
    
    } else {
      bgGradient = 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)';
      if (isParticipating) bgGradient = 'linear-gradient(135deg, #0f3a36 0%, #0d2826 100%)';
      else if (isOrg) bgGradient = 'linear-gradient(135deg, #1e1b4b 0%, #161339 100%)';
    }

    // Card text color adapts to theme
    var _cardTextColor = _isLight ? '#1f2937' : 'white';

    // Venue photo background
    var overlayGrad = isOrg
      ? 'linear-gradient(135deg, rgba(67,56,202,0.5) 0%, rgba(99,102,241,0.42) 100%)'
      : isParticipating
        ? 'linear-gradient(135deg, rgba(15,118,110,0.5) 0%, rgba(20,184,166,0.42) 100%)'
        : 'linear-gradient(135deg, rgba(30,41,59,0.5) 0%, rgba(15,23,42,0.42) 100%)';
    let venuePhotoBg = '';
    if (window._tourCoverSrc(t)) {
      // v4.0.21: foto de fundo custom do organizador — substitui a do Google.
      // 1.9.50: a base64 NÃO entra mais na string (chegava a 194 KB num card só, e o
      // parser mastigava isso na thread principal). Fica o gradiente; quem pinta a foto
      // é `_hydrateTournamentPhotos`, do dado que JÁ está em memória — sem ida à rede.
      venuePhotoBg = overlayGrad ? ('background-image: ' + overlayGrad + ';') : '';
      _cardTextColor = 'white';
    } else if (t.venuePlaceId) {
      // v1.7.53: NÃO pinta mais `url(t.venuePhotoUrl)` — aquela URL é do
      // places.googleapis.com e cada render dela era 1 chamada COBRADA. Aqui fica só o
      // gradiente; quem pinta a foto é o hidratador, com o dataURL do nosso Firestore.
      _cardTextColor = 'white'; // Overlay sempre escuro, texto branco
    }
    // v1.7.53: gate passou a ser o placeId (era `venuePhotoUrl && venuePlaceId`) — o
    // placeId é a identidade do local; a URL velha do Google não é mais pré-requisito
    // pra ter foto, e torneio salvo sem ela também passa a mostrar.
    var vphotoAttrs = (!window._tourCoverSrc(t) && t.venuePlaceId)
      ? ' data-vphoto-pid="' + window._safeHtml(t.venuePlaceId) + '" data-vphoto-overlay="' + overlayGrad + '"'
      : '';
    // capa própria do torneio: marca o card pro hidratador (a imagem vem depois, do
    // AppStore) em vez de carregar a base64 dentro do HTML.
    if (window._tourCoverSrc(t)) {
      vphotoAttrs += ' data-tcover-tid="' + window._safeHtml(String(t.id)) + '" data-tcover-overlay="' + overlayGrad + '"';
    }

    // v3.0.x: usa a contagem CANÔNICA (mesma do detalhe) — antes a dashboard tinha
    // a própria lógica que EXCLUÍA os da lista de espera, dando números diferentes
    // do detalhe (100/50 vs 103/51). Agora INSCRITOS/EQUIPES batem em todo lugar, e
    // ESPERA conta PESSOAS (dupla na espera = 2).
    // v2.0.77: pelos acessadores — o cartão passa a aceitar TAMBÉM o resumo leve
    // (`tournaments_summary`), sem mudar um número sequer quando recebe o documento
    // completo. Ver `_cardCompetidores` & cia. em tournaments-utils.js.
    const _ccDash = window._cardCompetidores(t);
    let individualCount = _ccDash.people;
    let teamCount = _ccDash.teams;
    const _standbyCount = window._cardEspera(t);

    // Enroll/unenroll button: only when inscriptions are truly open
    // hasDraw = tournament already has matches/rounds/groups drawn
    const hasDraw = window._cardTemChave(t);
    const _leE = window._effectiveLateEnrollment ? window._effectiveLateEnrollment(t) : t.lateEnrollment;
    const canEnroll = isAberto && !isFinished && (!hasDraw || ligaAberta || _leE === 'standby' || _leE === 'expand');
    let enrollBtnHtml = '';
    if (_isInStandby && !isFinished) {
      enrollBtnHtml = `<div style="font-size: 0.6rem; font-weight: 800; color: var(--sp-c-fbbf24,#fbbf24); text-transform: uppercase; letter-spacing: 0.4px; background: rgba(251,191,36,0.15); padding: 2px 8px; border-radius: 6px;">⏳ ${_t('enroll.onWaitlist')}</div><button class="btn btn-sm btn-danger hover-lift" onclick="event.stopPropagation(); window._spinButton(this, '${_t('enroll.processing')}'); window._leaveStandby('${t.id}')">🛑 ${_t('enroll.leaveWaitlist')}</button>`;
    } else if (isParticipating && canEnroll) {
      // v1.7.24 — O GRUPO GERAL DO TORNEIO SAIU DAQUI (ordem do dono). Ele ficava
      // colado no "Desinscrever-se", verde, e era o ÚNICO botão de WhatsApp que o
      // participante encontrava sem abrir a chave — então virava o botão que ele
      // clicava querendo montar o grupo do próprio jogo, e caía no mural do evento.
      // O geral continua na PÁGINA do torneio (onde a pessoa está olhando o evento);
      // o do jogo mora na chave, que é onde ela está olhando o jogo dela.
      enrollBtnHtml = `<button class="btn btn-sm btn-danger hover-lift" onclick="event.stopPropagation(); window._spinButton(this, '${_t('enroll.processing')}'); window.deenrollCurrentUser('${t.id}')">🛑 ${_t('enroll.unenrollBtn')}</button>`;
    } else if (!isParticipating && canEnroll) {
      enrollBtnHtml = `<button class="btn btn-sm btn-success hover-lift" onclick="event.stopPropagation(); window._spinButton(this, '${_t('enroll.processing')}'); window._dashEnroll('${t.id}')">✅ ${_t('enroll.enrollBtn')}</button>`;
    } else if (isParticipating && !canEnroll && !isFinished) {
      enrollBtnHtml = `<div style="font-size: 0.65rem; font-weight: 700; color: var(--sp-c-fef08a,#fef08a); text-transform: uppercase; letter-spacing: 0.5px;">${_t('enroll.enrolled')} ✓</div>`;
    } else if (isFinished && (isParticipating || isOrg)) {
      enrollBtnHtml = `<div style="font-size: 0.65rem; font-weight: 700; color: var(--sp-c-fbbf24,#fbbf24); text-transform: uppercase; letter-spacing: 0.5px; background: rgba(251,191,36,0.12); padding: 3px 10px; border-radius: 10px; border: 1px solid rgba(251,191,36,0.25);">🏆 ${isOrg ? _t('dashboard.youOrganized') : _t('dashboard.youParticipated')}</div>`;
    }

    const _isFav = typeof window._isFavorite === 'function' && window._isFavorite(t.id);
    // v2.3.72: SEM box no card inteiro (não mata a foto). Caixas de leitura só
    // nos blocos de info pequena/cor fraca (datas, cronômetro, inscritos,
    // formato/acesso). _pReadBg = fundo escuro legível por bloco quando há foto.
    const _photoPanelD = '';
    // v2.6.43: read box theme-aware (escuro→box claro/texto escuro; claro→box escuro/texto claro)
    const _rb = (venuePhotoBg && typeof window._photoReadBox === 'function') ? window._photoReadBox() : null;
    const _pReadBg = _rb ? _rb.bg : '';
    const _pReadFg = _rb ? _rb.fg : '#f1f5f9';
    const _pReadBd = _rb ? _rb.border : 'rgba(255,255,255,0.12)';
    return `
        <div class="card mb-3${venuePhotoBg ? ' card-has-photo' : ''}"${vphotoAttrs}${_isOpenEnrollment(t) ? ' data-open-enrollment="1"' : ''} data-search-blob="${window._safeHtml(window._tournamentSearchBlob ? window._tournamentSearchBlob(t) : '')}" style="position: relative; overflow: hidden; ${venuePhotoBg ? venuePhotoBg : 'background: ' + window._spCor(bgGradient, 'background') + ';'} color: ${window._spCor(_cardTextColor, 'color')}; border: 1px solid ${_isLight ? 'rgba(0,0,0,0.08)' : 'transparent'}; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,${_isLight ? '0.06' : '0.1'}); cursor: pointer; transition: transform 0.2s;" onclick="window._dashCardClick(event, '${t.id}')" >
          ${isOrg ? `
             <div style="position: absolute; bottom: 6px; right: 8px; opacity: 0.9; pointer-events: none;" title="${window._genderWord ? window._genderWord(window.AppStore && window.AppStore.currentUser, 'Organizador', 'Organizadora') : 'Organizador'}">
               <svg width="28" height="28" viewBox="0 0 24 24" fill="rgba(251,191,36,0.95)"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
             </div>
          ` : ''}
          ${t.isSandbox ? `<div style="background:#b91c1c;color:#fff;text-align:center;font:800 11px/1.5 -apple-system,BlinkMacSystemFont,sans-serif;letter-spacing:1.5px;padding:5px 8px;">🧪 SANDBOX · TORNEIO DE TESTE</div>` : ''}
          <div class="card-body p-4" style="${_photoPanelD}${isOrg ? 'padding-bottom: 38px;' : ''}">

            <!-- Top Row: Icon/Modality | Status (same line, consistent with detail page) -->
            <!-- v1.7.83: era flex-wrap:nowrap — com a escala grande (até 1.7) a
                 pílula de status saía PELA DIREITA do card e sumia (+40/+40/+86px
                 medidos em 3 cards). Ordem do dono: "aqui podemos mudar de linha.
                 na 1a linha fica a modalidade e as inscricoes na linha seguinte.
                 assim a informacao fica na tela sem truncar." Reticência aqui
                 esconderia o STATUS do torneio, que é a informação da linha. -->
            <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; flex-wrap: wrap; gap: 6px;">
               <div style="display: flex; align-items: center; gap: 6px; opacity: 0.65; flex-shrink: 0;">
                  <span style="font-size: 1.1rem;">${getSportIcon(t.sport)}</span>
                  <span>${cleanSportName(t.sport) || _t('tournament.sport')}</span>
               </div>
               <div style="display: flex; flex-direction: column; align-items: flex-end; flex-shrink: 0; margin-left: auto;">
                  <div id="dash-regstatus-${t.id}"
                       ${isAberto && t.registrationLimit ? `data-regdeadline-tid="${t.id}" data-regdeadline-ts="${new Date(t.registrationLimit).getTime()}"` : ''}
                       style="color: ${window._spCor(statusColor, 'color')}; background: ${window._spCor(statusBg, 'background')}; padding: 4px 10px; border-radius: 12px; font-size: 0.7rem; font-weight: ${statusFontWeight}; white-space: nowrap;">
                    ${statusText}
                  </div>
               </div>
            </div>
            ${enrollBtnHtml ? `<div id="dash-enrollbtn-${t.id}" style="display: flex; flex-direction: column; align-items: flex-end; margin-top: 6px; gap: 4px;">
               ${enrollBtnHtml}
            </div>` : ''}

            <!-- Middle: Logo 1/3 + conteúdo 2/3 -->
            <div style="display:flex;align-items:flex-start;gap:14px;margin:1.4rem 0 1.2rem 0;">
              ${window._tourLogoSrc(t) ? `<div style="width:33%;min-width:80px;flex-shrink:0;"><img src="${window._tourLogoSrc(t)}" alt="Logo" style="width:100%;aspect-ratio:1/1;border-radius:${window._tournamentLogoRadius(t)};object-fit:cover;display:block;box-shadow:0 4px 16px rgba(0,0,0,0.4);"></div>` : ''}
              <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:0;">
                <div style="display:flex;align-items:flex-start;gap:6px;">
                  ${/* v1.8.85: o nome era CORTADO quando trazia um token que não quebra —
                        no relato, um torneio nomeado com o e-mail do organizador
                        ("…de viniciusna1@hotmail.com"): o texto ia até a borda e sumia.
                        ⚠️ `overflow-wrap:anywhere` (que já estava aqui) NÃO resolve num
                        flex: ele permite quebrar, mas a largura MÍNIMA do elemento continua
                        sendo a da palavra inteira, então o item não encolhe e o texto vaza.
                        Quem afeta a largura mínima é `anywhere` — com `min-width:0` no item.
                        E, quando mesmo quebrando não couber, a FONTE ENCOLHE: `.sp-name-fit`
                        é o encolhedor canônico do app (store.js), em rem por causa da escala
                        por área — nunca px. Ver project_name_fit_box_canonical. */''}
                  <h4 class="sp-name-fit" data-maxrem="1.5" data-minrem="0.95"
                      style="margin:0;font-size:1.5rem;font-weight:800;color:white;line-height:1.2;flex:1;min-width:0;overflow-wrap:anywhere;word-break:break-word;">
                    ${window._safeHtml(t.name)}
                  </h4>
                  <span data-fav-id="${t.id}" onclick="window._toggleFavorite('${t.id}', event)" title="${_isFav ? _t('fav.remove') : _t('fav.add')}" style="font-size:1.4rem;cursor:pointer;flex-shrink:0;color:${window._spCor(_isFav ? '#f43f5e' : 'rgba(255,255,255,0.4)', 'color')};transition:color 0.2s;line-height:1;margin-top:2px;" onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'">${_isFav ? '❤️' : '♡'}</span>
                </div>
                ${_finDurStr ? `<div style="font-size:0.78rem;color:var(--sp-c-fbbf24,#fbbf24);font-weight:600;margin-top:4px;">⏱️ durou ${_finDurStr}</div>` : ''}
                ${/* v2.8.67: enquete ativa → botão brilhante abaixo do nome */ ''}
                ${(typeof window._opButtonHtml === 'function') ? window._opButtonHtml(t) : ''}
              </div>
            </div>

            ${t.venueName ? `
            <!-- Local -->
            <div style="display: ${_pReadBg ? 'inline-flex' : 'flex'}; align-items: center; gap: 8px; font-size: 0.85rem; font-weight: 500; margin-top: -0.8rem; ${_pReadBg ? 'background:' + window._spCor(_pReadBg, 'background')+';color:'+_pReadFg+' !important;border-radius:10px;padding:6px 10px;max-width:100%;' : 'opacity: 0.6;'}">
               <span style="font-size: 1rem;">📍</span>
               <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${window._safeHtml(t.venueName)}</span>
            </div>
            ` : ''}

            <!-- Below Name: Calendário + Data + badge contextual (HOJE/AMANHÃ/Em Xd) + logo do local à direita (v4.0.19) -->
            <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
            <div style="display: ${_pReadBg ? 'inline-flex' : 'flex'}; align-items: center; gap: 8px; font-size: 0.9rem; font-weight: 500; ${_pReadBg ? 'background:' + window._spCor(_pReadBg, 'background')+';color:'+_pReadFg+' !important;border-radius:10px;padding:7px 11px;align-self:flex-start;' : 'opacity: 0.8;'} flex-wrap: wrap;">
               ${datesGridHtml}
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
                   var _label, _solid;
                   if (_dayDiff === 0) { _label = _t('tournament.startsToday'); _solid = '#10b981'; }
                   else if (_dayDiff === 1) { _label = _t('tournament.startsTomorrow'); _solid = '#f59e0b'; }
                   else { _label = _t('tournament.startsIn').replace('{days}', _dayDiff); _solid = '#6366f1'; }
                   // v2.6.21: em tarja escura (_pReadBg) → pílula SÓLIDA + texto branco
                   // (contraste). No fundo claro → tint suave + texto na cor.
                   var _bg = _pReadBg ? _solid : (_solid + '2e');
                   var _color = _pReadBg ? '#fff' : _solid;
                   var _bd = _pReadBg ? _solid : (_solid + '55');
                   return '<span style="font-size:0.68rem;font-weight:700;padding:2px 8px;border-radius:10px;background:' + window._spCor(_bg, 'background') + ';color:' + window._spCor(_color, 'color') + ';border:1px solid ' + window._spCor(_bd, 'borda') + ';white-space:nowrap;">' + _label + '</span>';
                 } catch(e) { return ''; }
               })()}
            </div>
            ${t.venuePlaceId ? '<span data-vlogo-pid="' + window._safeHtml(t.venuePlaceId) + '" title="Logo do local" style="flex-shrink:0;width:clamp(40px,13vw,58px);aspect-ratio:1/1;display:none;"></span>' : ''}
            </div>

            ${(() => {
              if (isFinished) return '';
              var _now = Date.now();
              var _isLiga = window._isLigaFormat && window._isLigaFormat(t);

              // Liga: um único countdown excludente (início → próximo sorteio → prazo da
              // rodada → fim da temporada)
              if (_isLiga) {
                // v1.6.85: FONTE ÚNICA do BOX INTEIRO — window._ligaCountdownBoxHtml
                // (tournaments-utils.js), o MESMO render do detalhe (tournaments.js). Aqui
                // só sobra o que é EXCLUSIVO do card: o toggle Liga (sempre à direita,
                // independente do countdown). Antes o markup era copiado nos dois lugares e
                // as cópias divergiram — o card caía no render genérico com o evento vazio
                // da "rodada em andamento" (ts/labelKey/icon = null) e imprimia "null null 0s".
                var _ligaToggleDash = (typeof window._buildLigaActiveToggleHtml === 'function')
                  ? window._buildLigaActiveToggleHtml(t)
                  : '';
                var _toggleRowDash = _ligaToggleDash
                  ? '<div style="display:flex;justify-content:flex-end;margin-top:6px;" onclick="event.stopPropagation();">' + _ligaToggleDash + '</div>'
                  : '';
                // com o toggle acima, o box encosta um pouco mais (4px em vez de 10px)
                var _boxD = (typeof window._ligaCountdownBoxHtml === 'function')
                  ? window._ligaCountdownBoxHtml(t, 'sm', _toggleRowDash ? '4px' : '10px') : '';
                if (!_boxD) return _toggleRowDash; // sem countdown → só o toggle (direita)
                // v1.8.82: a previsão do tempo também AQUI. Ela existia só na tela de
                // DETALHE, e o dono passou três mensagens procurando por ela na TELA
                // INICIAL — que é onde ele estava o tempo todo. "Abaixo de rodada em
                // andamento" quer dizer abaixo DESTE box, em qualquer tela onde ele apareça.
                return _toggleRowDash + _boxD +
                  ((typeof window._weatherSlotHtml === 'function') ? window._weatherSlotHtml(t, 'sm') : '');
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
              // v1.6.83: "🏆 Fim do torneio" conta pro fim da ÚLTIMA fase — com t.endDate cru
              // a contagem zerava no fim da classificatória, com a eliminatória ainda por vir.
              var _edRaw = window._tournamentEndDate ? window._tournamentEndDate(t) : t.endDate;
              if (_edRaw) {
                var _ed = new Date(_edRaw).getTime();
                if (!isNaN(_ed) && _ed > _now) _events.push({ ts: _ed, label: _t('event.tournamentEnd'), icon: '🏆', color: '#8b5cf6' });
              }
              if (_events.length === 0) return '';
              _events.sort(function(a,b) { return a.ts - b.ts; });
              var _next = _events[0];
              var _countdownText = window._formatCountdown ? window._formatCountdown(_next.ts - _now) : '';
              var _rgb2 = _next.color === '#f59e0b' ? '245,158,11' : _next.color === '#10b981' ? '16,185,129' : '139,92,246';
              var _rbCt2 = (typeof window._photoReadBox === 'function') ? window._photoReadBox() : { bg: 'rgba(0,0,0,0.5)', fg: '#f1f5f9', border: 'rgba(255,255,255,0.12)' };
              var _ctColor2 = _rbCt2.fg; // SEMPRE tarja escura + texto claro → legível em qualquer tema/foto
              return '<div style="margin-top:10px;display:flex;align-items:center;gap:10px;padding:10px 14px;background:' + window._spCor(_rbCt2.bg, 'background') + ';border:1px solid rgba(' + _rgb2 + ',0.55);border-radius:12px;">' +
                '<span style="font-size:1.3rem;">' + _next.icon + '</span>' +
                '<span style="font-size:0.85rem;font-weight:700;color:' + _ctColor2 + ' !important;">' + _next.label + '</span>' +
                '<span data-countdown-target="' + _next.ts + '" style="margin-left:auto;font-size:1.1rem;font-weight:900;color:' + _ctColor2 + ' !important;font-variant-numeric:tabular-nums;letter-spacing:0.3px;white-space:nowrap;flex-shrink:0;">' + _countdownText + '</span>' +
              '</div>';
            })()}

            ${(typeof window._buildDurationForecast === 'function') ? window._buildDurationForecast(t) : ''}

            ${(() => {
              // v2.1.52: box de progresso COMPLETO (mesmo do card de detalhes) no
              // lugar do pill simples de "tempo decorrido".
              // v2.3.14: Liga TAMBÉM usa a barra rica (com a barra roxa do torneio
              // inteiro). Antes era excluída — o que deixava só a barra simples.
              if (!sorteioRealizado || isFinished) return '';
              return (typeof window._renderTournamentProgress === 'function') ? window._renderTournamentProgress(t) : '';
            })()}

            <!-- Linha separadora -->
            <div style="height: 1px; background: var(--sp-g-255-255-255-01,rgba(255,255,255,0.1)); margin: 1.8rem 0;"></div>

            <!-- Bottom Section -->
            <div style="display: flex; gap: 1.5rem; flex-wrap: wrap; align-items: center; ${_pReadBg ? '' : 'opacity: 0.75;'}">

               <!-- Stats Column -->
               <div style="display: flex; flex-direction: column; gap: 8px; width: 100%;">
                   <div style="display: flex; flex-direction: row; gap: 8px; flex-wrap: wrap; align-items: flex-start;">
                       <div class="stat-box" style="flex-direction: column;${_pReadBg ? 'background:' + window._spCor(_pReadBg, 'background')+';color:'+_pReadFg+' !important;border:1px solid ' + window._spCor(_pReadBd, 'borda')+';' : ''}">
                          <div style="display: flex; align-items: center; gap: 4px;">
                             <span style="font-size: 1.1rem;">👤</span>
                             <span style="font-size: 1.4rem; font-weight: 800; line-height: 1; opacity: 0.95;">${individualCount}</span>
                          </div>
                          <span style="font-size: 0.65rem; text-transform: uppercase; letter-spacing: 1px; margin-top: 3px; opacity: 0.8;">${_t('dashboard.statEnrolled')}</span>
                       </div>
                       ${teamCount > 0 ? `
                       <div class="stat-box" style="flex-direction: column;${_pReadBg ? 'background:' + window._spCor(_pReadBg, 'background')+';color:'+_pReadFg+' !important;border:1px solid ' + window._spCor(_pReadBd, 'borda')+';' : ''}">
                          <div style="display: flex; align-items: center; gap: 4px;">
                             <span style="font-size: 1.1rem;">👥</span>
                             <span style="font-size: 1.4rem; font-weight: 800; line-height: 1; opacity: 0.95;">${teamCount}</span>
                          </div>
                          <span style="font-size: 0.65rem; text-transform: uppercase; letter-spacing: 1px; margin-top: 3px; opacity: 0.8;">${_t('dashboard.statTeams')}</span>
                       </div>
                       ` : ''}
                       ${/* v1.8.78 — o box de ESPERA era o ÚNICO dos três que não seguia a tarja.
                             `.stat-box` é tarja ESCURA com texto CLARO nos DOIS temas, mas aqui um
                             `background: rgba(251,191,36,0.08)` INLINE vencia a tarja. No tema escuro
                             isso passava (âmbar 8% sobre card escuro continua escuro); no CLARO virava
                             caixa quase branca segurando o texto `#f1f5f9` da tarja + âmbar claro —
                             ou seja claro sobre claro, que é o relato do dono.
                             Agora o fundo é o da tarja (igual a INSCRITOS/EQUIPES) e a identidade
                             âmbar vive na BORDA + no texto. O âmbar vem da classe `.stat-accent`, não
                             de style inline, de propósito: assim ele fica fora do remap de contraste
                             do tema claro — que só reescreve inline — e não é escurecido sobre a
                             tarja escura. Opacidade 0.8→0.95: o branco dos irmãos aguenta 0.8, o
                             âmbar rebaixado não. */''}
                       ${_standbyCount > 0 ? `
                       <div class="stat-box" style="flex-direction: column; border-color: rgba(251,191,36,0.45);${_pReadBg ? 'background:' + window._spCor(_pReadBg, 'background')+';color:'+_pReadFg+' !important;' : ''}">
                          <div style="display: flex; align-items: center; gap: 4px;">
                             <span style="font-size: 1.1rem;">⏱️</span>
                             <span class="stat-accent" style="font-size: 1.4rem; font-weight: 800; line-height: 1;">${_standbyCount}</span>
                          </div>
                          <span class="stat-accent" style="font-size: 0.65rem; text-transform: uppercase; letter-spacing: 1px; margin-top: 3px; opacity: 0.95;">${_t('dashboard.statWaiting')}</span>
                       </div>
                       ` : ''}
                   </div>
                   ${(typeof window._buildCategoryCountHtml === 'function') ? window._buildCategoryCountHtml(t) : ''}
               </div>

               <!-- Configuração Completa do Torneio (dinâmica, por formato) -->
               ${(typeof window._buildTournamentConfigBox === 'function')
                 ? window._buildTournamentConfigBox(t, { bg: _pReadBg || '', open: false })
                 : `<div class="info-box" ${_pReadBg ? 'style="background:' + window._spCor(_pReadBg, 'background')+';color:'+_pReadFg+' !important;border:1px solid ' + window._spCor(_pReadBd, 'borda')+';"' : ''}>
                  <div><strong>${_t('dashboard.labelFormat')}:</strong> ${window._formatLabel ? window._formatLabel(t) : t.format}</div>
                  <div><strong>${_t('dashboard.labelAccess')}:</strong> ${publicText}</div>
               </div>`}
            </div>

            ${(() => {
              var _html = '';
              // Progress bar for active tournaments
              if (typeof window._cardProgresso === 'function') {
                var _prog = window._cardProgresso(t);   // resumo ou documento completo
                // v2.1.55/v2.3.14: quando o box de progresso COMPLETO (rico) já
                // aparece (qualquer formato em andamento, não encerrado), não
                // mostrar a barra simples — evita duplicar. Agora inclui Liga.
                var _fullBoxShown = sorteioRealizado && !isFinished && _prog.total > 0;
                if (_prog.total > 0 && !_fullBoxShown) {
                  var _barColor = _prog.pct === 100 ? '#10b981' : (_prog.pct > 50 ? '#3b82f6' : '#f59e0b');
                  _html += '<div class="info-box" style="margin-top: 10px; padding: 8px 12px;">';
                  _html += '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">';
                  _html += '<span style="font-size: 0.65rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.7;">' + _t('dashboard.labelProgress') + '</span>';
                  _html += '<span style="font-size: 0.7rem; font-weight: 700;">' + _prog.pct + '%</span>';
                  _html += '</div>';
                  _html += '<div style="width: 100%; height: 5px; background: var(--sp-g-255-255-255-01,rgba(255,255,255,0.1)); border-radius: 3px; overflow: hidden;">';
                  _html += '<div style="width: ' + _prog.pct + '%; height: 100%; background: ' + window._spCor(_barColor, 'background') + '; border-radius: 3px;"></div>';
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
                  _html += '<div style="text-align:center;background:var(--sp-g-0-0-0-02,rgba(0,0,0,0.2));padding:6px 14px;border-radius:10px;">';
                  _html += '<div style="font-size:1.4rem;font-weight:900;color:var(--sp-c-a5b4fc,#a5b4fc);line-height:1;font-variant-numeric:tabular-nums;">' + _pTimeStr + '</div>';
                  _html += '<div style="font-size:0.55rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-top:2px;">' + _t('dashboard.remaining') + '</div>';
                  _html += '</div></div>';
                  _html += '<div style="margin-top:8px;font-size:0.65rem;color:var(--text-muted);opacity:0.7;">' + _t('enroll.suspended') + '</div>';
                  _html += '</div>';
                }
              }
              // v2.4.82: "Falar com o organizador" — só pra quem NÃO é o
              // organizador nem co-organizador. Botão canônico padronizado com
              // o detalhe do torneio (azul=e-mail / verde=WhatsApp via hidratação).
              var _cuD = window.AppStore.currentUser;
              var _amOrg = isOrg ||
                (_cuD && t.creatorUid && _cuD.uid === t.creatorUid) ||
                (_cuD && Array.isArray(t.coHosts) && t.coHosts.some(function(ch){ return ch.status === 'active' && ch.uid && ch.uid === _cuD.uid; }));
              if (!_amOrg && (t.creatorUid || t.organizerEmail) && typeof window._contactOrgButtonHtml === 'function') {
                _html += '<div style="margin-top:10px;">' + window._contactOrgButtonHtml(t, { fullWidth: true, marginTop: '0' }) + '</div>';
              }
              return _html;
            })()}

            ${(function(){
              // v2.8.40: "Ocultar" no rodapé de todo card que o usuário NÃO está
              // inscrito NEM organiza/co-organiza/criou. Na seção de ocultados vira
              // "Desocultar". isOrg (do card) só pega org por email — reforço aqui
              // com creatorUid + co-hosts (org por uid/telefone não tem email).
              var _hid = (typeof window._isHidden === 'function') && window._isHidden(t.id);
              if (_hid) return '<div style="margin-top:12px;text-align:center;"><button onclick="window._toggleHidden(\'' + t.id + '\', event)" title="Mostrar de novo na lista" style="background:var(--stat-box-bg);border:1px solid var(--border-color);color:var(--text-main);border-radius:8px;padding:6px 14px;font-size:0.74rem;font-weight:700;cursor:pointer;">👁 Desocultar</button></div>';
              var _cuX = window.AppStore && window.AppStore.currentUser;
              var _amOrgX = isOrg || (_cuX && t.creatorUid && _cuX.uid === t.creatorUid) ||
                (_cuX && Array.isArray(t.coHosts) && t.coHosts.some(function(ch){ return ch && ch.status === 'active' && ch.uid && ch.uid === _cuX.uid; }));
              if (!isParticipating && !_amOrgX) return '<div style="margin-top:12px;text-align:center;"><button onclick="window._toggleHidden(\'' + t.id + '\', event)" title="Ocultar este torneio da sua lista" style="background:transparent;border:1px solid var(--border-color);color:var(--text-muted);border-radius:8px;padding:6px 14px;font-size:0.74rem;font-weight:700;cursor:pointer;" onmouseover="this.style.color=\'var(--text-bright)\'" onmouseout="this.style.color=\'var(--text-muted)\'">🙈 Ocultar</button></div>';
              return '';
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
  // v2.8.44: o filtro cíclico percorre TODAS as modalidades canônicas (não só as
  // presentes nos torneios do usuário) — antes ciclava só "Todas ↔ Beach Tennis"
  // quando só havia BT. União: canônicas (_sportScoringDefaults, menos _default) +
  // quaisquer esportes presentes que não estejam na lista canônica (legado).
  var _canonSports = (window._sportScoringDefaults)
    ? Object.keys(window._sportScoringDefaults).filter(function(k){ return k && k !== '_default'; })
    : ['Beach Tennis', 'Pickleball', 'Tênis', 'Tênis de Mesa', 'Padel', 'Vôlei de Praia', 'Futevôlei'];
  var _sportUnion = _canonSports.slice();
  sportsArr.forEach(function(s){ if (s && _sportUnion.indexOf(s) === -1) _sportUnion.push(s); });
  window._dashSportsList = _sportUnion;
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
  // v2.8.60: filtro de modalidade PERSISTE (localStorage) — fica como o usuário deixou,
  // mesmo após reload/nova entrada.
  if (typeof window._dashSport === 'undefined') {
    try { window._dashSport = localStorage.getItem('scoreplace_dashSport') || ''; } catch (e) { window._dashSport = ''; }
  }
  if (!window._dashLocation) window._dashLocation = '';
  if (!window._dashFormat) window._dashFormat = '';
  // v3.0.91: estado da barra CANÔNICA (sort A-Z/🕒 + gênero) no dashboard de torneios.
  if (typeof window._dashGender === 'undefined') window._dashGender = 'all';
  if (typeof window._dashSort === 'undefined') window._dashSort = 'order-desc';

  // v2.8.60: modalidades FAVORITAS do perfil (limpas) — pro filtro "Favoritas".
  function _dashPrefSports() {
    var cu = window.AppStore && window.AppStore.currentUser;
    var raw = cu && cu.preferredSports;
    var arr = Array.isArray(raw) ? raw : (typeof raw === 'string' && raw.trim() ? raw.split(/[,;]/) : []);
    return arr.map(function (s) { return cleanSportName(s); }).filter(Boolean);
  }
  /* ══ A DASHBOARD É O SEU CÍRCULO (2.0.96) ═════════════════════════════════════
   *
   * Ordem do dono (25/ago/2026): _"apenas torneios organizados ou participando, ou em
   * locais favoritos, ou de amigos. por enquanto é isso. um botão explorar mostraria tudo
   * o que existe na plataforma"_ — e, na sequência: _"se entrar com convite, mesmo que
   * não tenha nada disso, aparece"_.
   *
   * ⛔ MODALIDADE FAVORITA NÃO ENTRA — e essa foi a decisão que os números mudaram.
   * A regra com modalidade parecia a certa, mas MEDIDA na base real ela mostrava 35 de
   * 39 e trazia de volta 31 dos 36 torneios que o dono tinha ocultado À MÃO. Motivo:
   * 34 dos 39 torneios são Beach Tennis, que é a modalidade favorita dele — "modalidade
   * favorita" hoje é quase "tudo". Modalidade diz que ESPORTE interessa, não que aquele
   * torneio é do mundo da pessoa; ela é filtro DENTRO do Explorar.
   * Com esta régua: 4 de 39 na dashboard, e nenhum dos ocultados volta.
   *
   * ⚠️ O CONVITE PASSA POR CIMA DE TUDO. Quem chegou por link quer VER aquele torneio —
   * esconder o que a pessoa acabou de abrir seria o app contradizendo o próprio link.
   */
  function _dashLocaisFavoritos() {
    var cu = window.AppStore && window.AppStore.currentUser;
    var raw = (cu && Array.isArray(cu.preferredLocations)) ? cu.preferredLocations : [];
    return raw.map(function (p) {
      return _dashChaveLocal(p && (p.name || p.label));
    }).filter(Boolean);
  }
  /* O local vem escrito de dois jeitos: o perfil guarda "Clube X — Av. Tal, 60" e o
   * torneio guarda "Clube X, São Paulo". Comparar cru dá ZERO casamento (medido).
   * A chave é o nome ANTES do travessão/vírgula, sem acento e sem pontuação. */
  function _dashChaveLocal(v) {
    return String(v == null ? '' : v)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .split('\u2014')[0].split(',')[0]
      .replace(/[^a-zA-Z0-9 ]/g, '').trim().toLowerCase();
  }
  function _dashAmigos() {
    var cu = window.AppStore && window.AppStore.currentUser;
    var raw = (cu && Array.isArray(cu.friends)) ? cu.friends : [];
    var out = {};
    raw.forEach(function (f) {
      var uid = (typeof f === 'string') ? f : (f && (f.uid || f.id));
      if (uid) out[String(uid)] = 1;
    });
    return out;
  }
  window._ehDoMeuCirculo = function (t, ctx) {
    if (!t) return false;
    ctx = ctx || {};
    var cu = window.AppStore && window.AppStore.currentUser;
    var uid = cu && cu.uid;
    // ① convite: passa por cima de tudo
    var conv = (window.AppStore && window.AppStore._invitedTournamentIds) || [];
    if (conv.indexOf(String(t.id)) !== -1) return true;
    if (!uid) return true;                       // deslogado não tem círculo: vê a plataforma
    // ② organizo ou participo
    if (String(t.creatorUid || '') === String(uid)) return true;
    if (Array.isArray(t.memberUids) && t.memberUids.indexOf(uid) !== -1) return true;
    if (Array.isArray(t.coHosts) && t.coHosts.some(function (c) {
      return c && String(c.uid || c) === String(uid);
    })) return true;
    // ③ em local favorito
    var locais = ctx.locais || _dashLocaisFavoritos();
    if (locais.length) {
      var v = _dashChaveLocal(t.venueName || t.venue);
      if (v && locais.some(function (x) { return x && (v.indexOf(x) !== -1 || x.indexOf(v) !== -1); })) return true;
    }
    // ④ de amigo
    var amigos = ctx.amigos || _dashAmigos();
    if (t.creatorUid && amigos[String(t.creatorUid)]) return true;
    return false;
  };

  function _persistDashSport(v) {
    window._dashSport = v || '';
    try { localStorage.setItem('scoreplace_dashSport', window._dashSport); } catch (e) {}
  }

  // Filter function
  window._applyDashFilter = function(filter) {
    window._dashFilter = filter;
    window._dashPage = 1;
    window._dashRerender();
  };
  window._applyDashSport = function(sport) {
    _persistDashSport(window._dashSport === sport ? '' : sport);
    window._dashRerender();
  };
  // v2.8.41/60: filtro CÍCLICO de modalidade — Todas → Favoritas (se o perfil tiver
  // modalidades preferidas) → cada modalidade presente → volta pra Todas. Persiste a
  // escolha. Lista vem de window._dashSportsList (gravada no render).
  window._cycleDashSport = function() {
    var list = Array.isArray(window._dashSportsList) ? window._dashSportsList : [];
    var cycle = (_dashPrefSports().length > 0) ? ['', '__fav__'].concat(list) : [''].concat(list);
    var cur = window._dashSport || '';
    var i = cycle.indexOf(cur); if (i === -1) i = 0;
    _persistDashSport(cycle[(i + 1) % cycle.length]);
    window._dashRerender();
  };
  // v2.8.46: busca IN-PLACE (sem re-render) — não pula a tela nem perde o foco.
  // Casa nome/local/participante/organizador via data-search-blob de cada card.
  window._setDashSearch = function(val) {
    window._dashSearch = val || '';
    if (typeof window._applyDashSearchInPlace === 'function') window._applyDashSearchInPlace();
    if (typeof window._buscaNoServidor === 'function') window._buscaNoServidor(window._dashSearch);
  };

  // ⭐ 2.0.91 — A BUSCA VAI AO SERVIDOR quando a tela não tem a resposta.
  // Filtrar o que já está desenhado nunca acha torneio antigo, de outra cidade ou que
  // a pessoa não participa — ele simplesmente nunca chegou ao aparelho. O resumo
  // (~2 KB) torna a consulta barata: o que voltar entra na vitrine e o filtro de
  // sempre passa a enxergá-lo.
  // ⚠️ ESPERA de 320ms: sem isso seria uma consulta POR TECLA digitada.
  // ⛔ Resultado NUNCA some com o que já estava: entra por id, sem duplicar.
  var _buscaTimer = null, _buscaUltima = '';
  window._buscaNoServidor = function (q) {
    var termo = String(q || '').trim();
    clearTimeout(_buscaTimer);
    if (termo.length < 3) return;
    if (termo === _buscaUltima) return;
    _buscaTimer = setTimeout(function () {
      _buscaUltima = termo;
      var DB = window.FirestoreDB;
      if (!DB || typeof DB.buscarTorneios !== 'function') return;
      DB.buscarTorneios(termo).then(function (achados) {
        if (!achados || !achados.length) return;
        // a pessoa já pode ter mudado a busca enquanto a consulta viajava
        if (String(window._dashSearch || '').trim() !== termo) return;
        var A = window.AppStore; if (!A) return;
        if (!Array.isArray(A.publicDiscovery)) A.publicDiscovery = [];
        var tem = {};
        (A.tournaments || []).forEach(function (t) { if (t && t.id != null) tem[String(t.id)] = 1; });
        A.publicDiscovery.forEach(function (t) { if (t && t.id != null) tem[String(t.id)] = 1; });
        var novos = achados.filter(function (t) { return t && t.id != null && !tem[String(t.id)]; });
        if (!novos.length) return;
        A.publicDiscovery = A.publicDiscovery.concat(novos);
        window._log('[busca] servidor trouxe', novos.length, 'torneio(s) que não estavam na tela');
        if (typeof window._dashRerender === 'function') window._dashRerender({ compact: true });
        if (typeof window._applyDashSearchInPlace === 'function') window._applyDashSearchInPlace();
      }).catch(function (e) { window._warn('[busca] servidor falhou:', e && e.message); });
    }, 320);
  };
  window._applyDashLocation = function(loc) {
    window._dashLocation = (window._dashLocation === loc) ? '' : loc;
    window._dashRerender();
  };
  window._applyDashFormat = function(fmt) {
    window._dashFormat = (window._dashFormat === fmt) ? '' : fmt;
    window._dashRerender();
  };
  window._setDashView = function(view) {
    window._dashView = view;
    try { localStorage.setItem('scoreplace_dashView', view); } catch(e) {}
    window._dashRerender();
  };
  // v3.0.91: onChange ÚNICO da barra CANÔNICA do dashboard (sort/gênero/modalidade/busca).
  // Diferencia BUSCA (in-place, sem re-render → não pula a tela nem perde o foco) de
  // sort/gênero/modalidade (re-render via _dashRerender, que preserva o scroll).
  window._dashApplyCanonical = function() {
    var gv = function(id){ var el = document.getElementById(id); return el ? el.value : ''; };
    var g  = gv('dash-gender')  || 'all';
    var sp = gv('dash-sport')   || 'all';
    var so = gv('dash-sort')    || 'order-desc';
    var q  = gv('dash-search-input') || '';
    var prev = window._dashCanonLast || {};
    var nonSearchChanged = (g !== prev.gender) || (sp !== prev.sport) || (so !== prev.sort);
    window._dashCanonLast = { gender: g, sport: sp, sort: so, search: q };
    window._dashGender = g;
    window._dashSort = so;
    _persistDashSport(sp === 'all' ? '' : sp);   // barra usa 'all'; dashboard usa '' p/ todas
    window._dashSearch = q;
    if (nonSearchChanged) {
      window._dashPage = 1;
      window._dashRerender();
    } else if (typeof window._applyDashSearchInPlace === 'function') {
      window._applyDashSearchInPlace();
    }
    // a barra canônica também vai ao servidor — senão buscar por ela acharia menos
    // que buscar pelo outro caminho, e "menos" aqui quer dizer "não achou".
    if (typeof window._buscaNoServidor === 'function') window._buscaNoServidor(q);
  };
  // v0.16.73: removidos handlers _dashForceFetchDiscovery e
  // _dashDiagnoseTournaments (v0.16.60-61) — eram acionados por botões do
  // diag inline removido junto. Discovery feed estável desde v0.16.62.
  // Restaurar pelo histórico do git se algum bug regredir.
  window._loadMoreDiscovery = function() {
    if (!window.AppStore || typeof window.AppStore.loadPublicDiscovery !== 'function') return;
    window.AppStore.loadPublicDiscovery({ append: true }).then(function() {
      window._dashRerender();
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
            '<div style="font-weight:800;color:var(--sp-c-fca5a5,#fca5a5);font-size:0.92rem;line-height:1.2;">Adicione seu nome ao perfil</div>' +
            '<div style="font-size:0.76rem;color:var(--text-muted);margin-top:4px;line-height:1.45;">' +
              'Sem um nome no perfil, você aparece como <b style="color:var(--sp-c-fca5a5,#fca5a5);font-family:monospace;">' + window._safeHtml(_fallbackShown || 'sem nome') + '</b> nos torneios e rankings. ' +
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
          '<div style="font-size:0.76rem;color:var(--text-muted);margin-top:3px;line-height:1.35;">' + filled + ' de ' + total + ' campos preenchidos · faltam <b style="color:var(--sp-c-fbbf24,#fbbf24);">' + window._safeHtml(missStr) + '</b></div>' +
          '<div style="margin-top:7px;height:5px;background:var(--sp-g-255-255-255-008,rgba(255,255,255,0.08));border-radius:3px;overflow:hidden;">' +
            '<div style="height:100%;background:linear-gradient(90deg,#fbbf24,#f59e0b);width:' + pct + '%;transition:width 0.4s ease;border-radius:3px;"></div>' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;gap:6px;flex-shrink:0;">' +
          '<button class="btn btn-primary btn-sm hover-lift" onclick="' + _openProfile + '" style="white-space:nowrap;background:linear-gradient(135deg,#f59e0b,#d97706);border:none;">Completar →</button>' +
          '<button type="button" class="cancel-x-btn" onclick="window._dismissProfileNudge()" style="--cx-size:20px;" title="Descartar nesta sessão">✕</button>' +
        '</div>' +
      '</div>';
  }

  window._dismissProfileNudge = function() {
    try { sessionStorage.setItem('scoreplace_profile_nudge_dismissed', '1'); } catch (e) {}
    var el = document.getElementById('dash-profile-nudge');
    if (el) el.remove();
  };

  // ── Meus Resultados ─────────────────────────────────────────────────────────
  // v1.8.2-beta: seção abaixo da hero box com (a) partidas pendentes de
  // resultado ou aprovação, (b) próximas partidas (unificado com "Suas Próximas
  // Partidas" em v1.9.0-beta), (c) últimos resultados confirmados.
  // v2.7.85: convites de DUPLA pendentes pro usuário CONVIDADO — banner âmbar no
  // dashboard com Confirmar/Cancelar (antes só aparecia dentro do torneio).
  function _buildPendingPairInvitesHtml() {
    var cu = window.AppStore.currentUser;
    if (!cu || !cu.uid) return '';
    var myUid = cu.uid;
    var tours = (typeof window.AppStore.getVisibleTournaments === 'function') ? (window.AppStore.getVisibleTournaments() || []) : (window.AppStore.tournaments || []);
    var items = [];
    (tours || []).forEach(function(t) {
      if (!t || !Array.isArray(t.pairRequests) || !t.pairRequests.length) return;
      var drawn = (Array.isArray(t.matches) && t.matches.length) || (Array.isArray(t.rounds) && t.rounds.length) || (Array.isArray(t.groups) && t.groups.length);
      if (drawn) return;
      t.pairRequests.forEach(function(r) { if (r && r.inviteeUid === myUid) items.push({ t: t, r: r }); });
    });
    if (!items.length) return '';
    var esc = function(s) { return window._safeHtml ? window._safeHtml(s) : String(s == null ? '' : s); };
    var sa = function(s) { return String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'"); };
    var rows = items.map(function(it) {
      var tIdA = sa(String(it.t.id)), rIdA = sa(it.r.id);
      return '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;background:rgba(251,191,36,0.1);border:1px solid rgba(251,191,36,0.3);border-radius:10px;padding:10px 12px;">'
        + '<div style="min-width:0;flex:1;"><div style="font-size:0.9rem;color:var(--text-bright);font-weight:600;">🤝 ' + esc(it.r.inviterName || 'Alguém') + ' quer formar dupla com você</div>'
        + '<div style="font-size:0.74rem;color:var(--text-muted);margin-top:2px;">' + esc(it.t.name || '') + '</div></div>'
        + '<div style="display:flex;gap:6px;flex-shrink:0;">'
        + '<button class="btn btn-success" style="min-height:0;height:30px;line-height:1;padding:0 12px;font-size:0.78rem;font-weight:800;" onclick="window._acceptPairRequest(\'' + tIdA + '\',\'' + rIdA + '\')">✅ Confirmar</button>'
        + '<button class="btn btn-danger" style="min-height:0;height:30px;line-height:1;padding:0 12px;font-size:0.78rem;font-weight:800;" onclick="window._cancelPairRequest(\'' + tIdA + '\',\'' + rIdA + '\')">❌ Cancelar</button>'
        + '</div></div>';
    }).join('');
    return '<div style="background:rgba(251,191,36,0.06);border:1px solid rgba(251,191,36,0.25);border-radius:14px;padding:14px 16px;margin-bottom:1rem;">'
      + '<h3 style="margin:0 0 12px;font-size:0.85rem;font-weight:700;color:var(--sp-c-fbbf24,#fbbf24);letter-spacing:0.04em;text-transform:uppercase;">🤝 Convites de Dupla (' + items.length + ')</h3>'
      + '<div style="display:flex;flex-direction:column;gap:8px;">' + rows + '</div></div>';
  }

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
      // v3.0.x: match EXATO de nome. O substring bidirecional anterior fazia "Ana"
      // casar "Ana Paula" → partidas de outra pessoa apareciam em "Meus Resultados"
      // com botões de aprovação pendente. A pertinência a duplas já é coberta por
      // p1Names.some(_isMe) (nome individual, exato) + _isMeByUid (dupla por uid).
      if (dName && l === dName) return true;
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
          ? '<b style="color:var(--sp-c-e2e8f0,#e2e8f0);">' + _sf(name) + '</b> <span style="color:var(--sp-c-a5b4fc,#a5b4fc);font-size:0.72em;">(você)</span>'
          : '<span style="color:var(--sp-c-94a3b8,#94a3b8);">' + _sf(name) + '</span>';
      }
      function formatTeam(raw) {
        var names = String(raw || '').split(/\s*\/\s*/).filter(Boolean);
        return names.map(markMe).join(' <span style="opacity:0.4;">/</span> ');
      }
      var side1 = formatTeam(p1raw);
      var side2 = formatTeam(p2raw);
      return side1 + ' <span style="color:var(--sp-c-64748b,#64748b);margin:0 6px;font-weight:500;">vs.</span> ' + side2;
    }

    var pendingForMe = [];   // m.pendingResult e sou time adversário (preciso agir)
    var pendingByMe = [];    // m.pendingResult e sou o proposer (aguardando adversário)
    var disputedMatches = []; // m.pendingResult.disputed — aguardando organizador (Fase 4)
    var noResult = [];       // match sem resultado, torneio ativo, sou participante
    var upcoming = [];       // próximas partidas (sem resultado, resultEntry = organizer)
    var recentConfirmed = []; // últimas partidas com resultado confirmado
    var othersResults = [];  // 📣 Novidades: jogos de OUTRAS pessoas, já com resultado

    // Carimbo → milissegundos. `resultAt` normalmente vem em ms (13 dígitos), mas há
    // dado gravado em SEGUNDOS na base (a mesma armadilha que o abandon-core encontrou),
    // e misturar as duas escalas põe um jogo de 2026 antes de um de hoje na ordenação.
    function _tsMs(v) {
      var n = Number(v);
      if (!n || isNaN(n) || n <= 0) return 0;
      return n < 1e12 ? Math.round(n * 1000) : Math.round(n);
    }

    // v1.8.78: separa "R1 Grupo S • Jogo 1" em { group:'R1 Grupo S', jogo:'Jogo 1' }.
    // ⚠️ FONTE ÚNICA: nasceu dentro do `if (recentConfirmed.length)` de "Seus últimos
    // resultados" e subiu pra cá quando as Novidades passaram a agrupar pelo MESMO
    // critério (grupo + torneio). Duas cópias divergiriam, e aí as duas seções
    // agrupariam diferente com o mesmo dado — [[feedback_unify_dual_entry_points]].
    function _splitFase(s) {
      s = String(s || '');
      var mm = s.match(/^(.*?)[\s·•\-]*\b([Jj][Oo][Gg][Oo]\s*\d+)\s*$/);
      if (mm && mm[1].trim()) return { group: mm[1].replace(/[\s·•\-]+$/, '').trim(), jogo: mm[2].trim() };
      return { group: s.trim(), jogo: '' };
    }

    // v1.8.78: cabeçalho de grupo em DUAS LINHAS (grupo em cima, torneio embaixo) —
    // pedido do dono. Ocupa a linha inteira da grade (`grid-column:1/-1`) de propósito:
    // com o rótulo dentro do card, só o 1º card de cada grupo teria cabeçalho e os
    // vizinhos da mesma linha subiriam desalinhados. Aparece UMA vez por (grupo+torneio)
    // e é omitido dos demais jogos do mesmo grupo — que é a outra metade do pedido.
    // `inline=true` desenha o mesmo bloco DENTRO de um card (usado no caso avulso de
    // "Seus últimos resultados", onde o rótulo não se repete e portanto não precisa
    // — nem deve — roubar uma linha inteira da grade).
    // v1.8.98: cada grupo ganha "Ir para o torneio" — ordem do dono: "tem que ter 1
    // botao por grupo. na mesma linha do titulo/torneio, mas alinhado na direita.
    // fazer a mesma coisa nos seus ultimos resultados".
    // Como este cabeçalho é a FONTE ÚNICA das duas seções (Novidades e Seus últimos
    // resultados), o botão nasce nas duas de uma vez — era exatamente o pedido.
    // ⚠️ Leva pra `#bracket/<id>`: é ali que mora a CLASSIFICAÇÃO do grupo. A chave já
    // rola sozinha até o jogo do próprio usuário, e como estes grupos são os DELE, o
    // destino cai na classificação certa sem precisar de âncora por grupo (que não
    // existe hoje na chave).
    function _grupoHeadHtml(grupo, tName, cor, attr, inline, tId) {
      // v1.8.99: leva o GRUPO junto — ordem do dono: "tem que ir com o grupo clicado
      // no topo e nao no topo do torneio". O rótulo vai por sessionStorage (não pela
      // URL) porque a chave é normalizada e nome de grupo tem espaço/acento; a chave é
      // consumida pelo bracket assim que ele rola até lá.
      var _grpK = (typeof window._grpKey === 'function') ? window._grpKey(grupo) : '';
      var _btn = tId
        ? '<a href="#bracket/' + String(tId).replace(/"/g, '&quot;') + '" ' +
          'onclick="event.stopPropagation();try{sessionStorage.setItem(\'sp_scrollToGroup\',\'' +
            String(_grpK).replace(/'/g, '') + '\')}catch(e){}" ' +
          'style="flex-shrink:0;margin-left:auto;align-self:center;font-size:0.62rem;font-weight:700;' +
          'text-decoration:none;color:var(--sp-c-7dd3fc,#7dd3fc);background:rgba(125,211,252,0.14);' +
          'border:1px solid rgba(125,211,252,0.45);border-radius:999px;padding:3px 9px;line-height:1.2;' +
          'text-transform:none;letter-spacing:0;white-space:nowrap;">Ir para o torneio ›</a>'
        : '';
      return '<div ' + (attr || '') + ' style="' + (inline ? '' : 'grid-column:1/-1;') + 'margin:' + (inline ? '0 0 2px' : '6px 0 -2px') + ';min-width:0;">' +
        '<div style="border-left:3px solid ' + window._spCor(cor, 'borda') + ';padding-left:8px;display:flex;align-items:center;gap:8px;">' +
          '<div style="min-width:0;flex:1;">' +
          '<div style="color:' + window._spCor(cor, 'color') + ';font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:2px;' +
            'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + _sf(grupo) + '</div>' +
          (tName ? '<div style="color:var(--text-muted);font-size:0.65rem;font-weight:400;text-transform:uppercase;' +
            'letter-spacing:0.03em;margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' +
            _sf(tName) + '</div>' : '') +
          '</div>' + _btn +
        '</div></div>';
    }

    // v1.8.78: o convite de abrir/fechar. Era um chevron (▸/▾) à ESQUERDA do título —
    // "muito discreto", disse o dono. Virou tag à DIREITA, fonte menor que o título
    // (0.7 contra 0.85rem) e no azul-céu que o app já usa pra dado clicável.
    // v1.8.79: virou TAG com box (pedido do dono) — texto solto num cabeçalho não lê como
    // coisa clicável, ainda mais ao lado de um título que também é clicável. O box em
    // azul-céu translúcido com borda dá o contorno de "isto é um controle".
    // v2.0.39: `extra` deixa a MESMA tag ser usada solta (no trilho sticky das Novidades)
    // sem virar um segundo desenho. Correção do dono, comparando as duas seções: _"o ver
    // menos ficou com uma aparência diferente"_ — a versão flutuante tinha ganhado fundo
    // opaco e sombra próprios. Desenho é UM só; o que muda é onde ele mora.
    function _verMaisTag(id, colapsado, extra) {
      return '<span id="' + id + '"' + ((extra && extra.attrs) || '') + ' style="margin-left:auto;flex-shrink:0;font-size:0.7rem;font-weight:700;' +
        'color:var(--sp-c-7dd3fc,#7dd3fc);background:rgba(125,211,252,0.14);border:1px solid rgba(125,211,252,0.45);' +
        'border-radius:999px;padding:3px 10px;line-height:1.2;text-transform:none;letter-spacing:0;' +
        ((extra && extra.style) || '') + '">' +
        (colapsado ? 'ver mais' : 'ver menos') + '</span>';
    }
    // O convite do RODAPÉ é o MESMO controle, então usa o MESMO desenho — só centralizado
    // e com a contagem, que é a informação que o cabeçalho não carrega.
    function _verMaisRodape(id, onclick, texto) {
      return '<p style="margin:8px 0 0;text-align:center;">' +
        '<span id="' + id + '" onclick="' + onclick + '" style="display:inline-block;cursor:pointer;user-select:none;' +
        'font-size:0.7rem;font-weight:700;color:var(--sp-c-7dd3fc,#7dd3fc);background:rgba(125,211,252,0.14);' +
        'border:1px solid rgba(125,211,252,0.45);border-radius:999px;padding:4px 12px;line-height:1.2;">' +
        texto + '</span></p>';
    }
    // v1.9.64 (pedido do dono, com print): "quando a largura da tela permitir, podemos
    // colocar 2 cards de jogo ou ate 3 na sessao novidades e seus ultimos resultados, em
    // vez de deixar o buraco ali. e o botao 'ver os X jogos...' ajustado de acordo."
    // A contagem do convite passou a ser CALCULADA depois da medicao (o build nao sabe
    // quantas colunas cabem), entao o texto virou funcao — e com singular de verdade: a
    // contagem existe pra dizer a verdade, e "ver os 1 jogos anteriores" (o que saia com
    // 2 cards) a quebrava. Exposta em window porque `_spSyncCollapsePreview` reescreve o
    // mesmo texto em runtime e as duas nao podem divergir — FONTE UNICA.
    function _spVerMaisTexto(n, comJogos) {
      if (n === 1) return comJogos ? 'ver o jogo anterior' : 'ver o anterior';
      return 'ver os ' + n + (comJogos ? ' jogos' : '') + ' anteriores';
    }
    window._spVerMaisTexto = _spVerMaisTexto;

    // ── PREVIA DA LINHA FECHADA — quem NAO entra leva `data-sp-extra` ──────────
    // Fechadas, as duas secoes mostravam UM card so, e numa tela larga (a grade e
    // `auto-fill minmax(280px,1fr)`, que abre 2, 3 ou 4 colunas) sobrava o buraco do
    // print. A regra agora e "preenche a linha": a previa vai ate o numero de COLUNAS
    // que a tela abriu — medido em `_spSyncCollapsePreview`, que reabre os que couberem.
    // O que nasce daqui e o estado de 1 COLUNA (identico ao de antes): e o 1o paint e o
    // fallback se a medicao falhar — errar mostrando de menos, nunca de mais.
    // ⚠️ `_spFull` e pros elementos de LINHA INTEIRA (cabecalho de grupo, `grid-column:1/-1`):
    // antes do 1o card ele entra (contextualiza o card a vista); depois dele, nao — e ele
    // que ENCERRA a linha, porque um cabecalho no meio quebraria a fileira em duas.
    // Mesma semantica do seletor posicional `[data-mr-card] ~ *` que isto substituiu.
    var _spCards = 0;
    function _spReset() { _spCards = 0; }
    function _spCard() { return (_spCards++ > 0) ? ' data-sp-extra="1"' : ''; }
    function _spFull() { return (_spCards > 0) ? ' data-sp-extra="1"' : ''; }

    // v1.8.67: chave de deduplicação desta seção — `_collectAllMatches` NÃO deduplica, e
    // um jogo que exista em `t.matches` E dentro de uma rodada entraria duas vezes.
    var _seenMatch = {};

    participacoes.forEach(function(t) {
      // ⚠️ v1.8.67: SANDBOX NÃO ENTRA. O SB é um CLONE do torneio real — mesmos jogos,
      // mesmos placares e os MESMOS ids de match. MEDIDO em produção (14/ago): o Confra e
      // o "(SB) Confra" tinham os 6 mesmos resultados, então cada jogo aparecia DUAS vezes
      // no painel do dev; em "Seus últimos resultados", que corta em 3, a cópia ainda
      // ROUBAVA uma das três vagas (o dono via 2 jogos reais + 1 clone). E o card da chave
      // usa `id="card-<m.id>"`: com o clone junto, o MESMO id ficava duas vezes no DOM —
      // `_editPendingResult`/`_approveResult` acham por id e agiriam no torneio errado.
      // O SB tem a chave dele pra ser testado; contaminar a tela inicial é justamente o
      // que o sandbox existe para NÃO fazer. `_isSandboxRef` é a fonte única já usada em
      // stats, histórico e Análise de Inscritos.
      if (window._isSandboxRef && window._isSandboxRef(t.id, t.name)) return;
      // v4.1.20: carimba a numeração GLOBAL "JOGO N" (fonte única, mesma do bracket) neste
      // torneio → os cards de Meus Resultados leem `m._gameNum` e mostram o número certo.
      try { if (typeof window._assignGlobalGameNumbers === 'function') window._assignGlobalGameNumbers(t); } catch (e) {}
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
        // v1.8.67: o MESMO jogo nunca entra duas vezes (ver `_seenMatch`). O id é a
        // identidade; o fallback só existe para jogo legado sem id.
        var _mKey = t.id + '|' + (m.id || ((m.label || '') + '|' + (m.p1 || '') + '|' + (m.p2 || '')));
        if (_seenMatch[_mKey]) return;
        _seenMatch[_mKey] = 1;
        if (m.isSitOut || m.p1 === 'FOLGA' || m.p2 === 'FOLGA') return; // folga não é jogo a disputar
        // v3.1.26: BYE = avanço automático (não é jogo a disputar). MAS o adversário
        // pode estar "a definir" (TBD/vazio) — nesse caso o jogo AINDA aparece em
        // "Próximos Jogos" (o check inP1/inP2 abaixo garante que o usuário está nele,
        // ou seja, o lado DELE está definido). Pedido do dono: sempre mostrar o próximo
        // jogo, mesmo com adversário a definir.
        if (m.isBye || m.p1 === 'BYE' || m.p2 === 'BYE') return;

        // Am I in this match?
        var p1Names = String(m.p1 || '').split(/\s*\/\s*/).filter(Boolean);
        var p2Names = String(m.p2 || '').split(/\s*\/\s*/).filter(Boolean);
        if (m.isMonarch && Array.isArray(m.team1)) p1Names = m.team1.slice();
        if (m.isMonarch && Array.isArray(m.team2)) p2Names = m.team2.slice();
        var inP1 = p1Names.some(_isMe) || _isMe(m.p1) || p1Names.some(function(n) { return _isMeByUid(n, t); });
        var inP2 = p2Names.some(_isMe) || _isMe(m.p2) || p2Names.some(function(n) { return _isMeByUid(n, t); });
        // Fase/rodada para exibir no card (igual ao "Próximas Partidas" antigo).
        // ⚠️ Calculado ANTES do desvio de "não sou deste jogo": desde a seção
        // "Novidades no seu torneio" os DOIS ramos precisam deste rótulo.
        var _phaseLabel = '';
        if (m.label) _phaseLabel = String(m.label);
        else if (m.roundLabel) _phaseLabel = String(m.roundLabel);
        else if (m.round != null) _phaseLabel = 'Rodada ' + window._matchRoundDisplayNum(t, m); // 1-based, nunca R0
        var _formatLabel = m.isMonarch ? 'Rei/Rainha' : ((window._formatDisplayName ? window._formatDisplayName(t.format) : t.format) || '');
        if (t.format === 'Liga' && t.ligaRoundFormat === 'rei_rainha' && m.isMonarch) _formatLabel = 'Pontos Corridos · Rei/Rainha';
        var _subLine = [_formatLabel, _phaseLabel].filter(Boolean).join(' · ');

        if (!inP1 && !inP2) {
          // ── 📣 Novidades no seu torneio ──────────────────────────────────────
          // Jogo de OUTRAS pessoas, num torneio em que EU estou inscrito. Só entra
          // quem JÁ TEM RESULTADO: `m.winner` é o que separa "jogado" de "marcado"
          // (jogo sorteado nasce sem winner). Sem placar não aparece — regra do dono.
          // ⚠️ SÓ TORNEIO EM ANDAMENTO. Regra do dono (13/ago): "torneios encerrados não
          // devem popular nada aqui". "Novidades" é o que está ACONTECENDO agora — jogo de
          // torneio terminado não é novidade, e sem este filtro um torneio antigo com
          // dezenas de jogos afogaria o que está em curso (a ordenação é por data do
          // lançamento, e torneio velho sem carimbo cai no desempate por rodada).
          // Encerrado = `finished`, inclusive o encerrado automaticamente por abandono.
          var _tEncerrado = (t.status === 'finished') || !!t.autoClosed;
          var _confirmado = !!m.winner && (m.scoreP1 != null || (Array.isArray(m.sets) && m.sets.length));
          // ⚠️ v1.8.67: LANÇAMENTO PENDENTE TAMBÉM É NOVIDADE. Exigir `m.winner` fazia a
          // seção ignorar justamente o que ACABOU de acontecer: placar lançado por um
          // jogador só ganha `winner` quando o outro lado confirma, o que pode levar horas.
          // MEDIDO (14/ago, 15h): os ÚNICOS lançamentos do dia na base inteira eram os 3
          // jogos do R1 Grupo T do Confra, lançados pela Elide às 12:43, 14:58 e 15:00 —
          // todos em `pendingResult`. Por isso o topo da lista mostrava um jogo de "há 18h"
          // e o dono via "novidade de ontem" com o torneio andando hoje.
          // Entra SEM mentir: o card é o mesmo da chave, que já desenha o estado pendente
          // (tag PENDENTE âmbar + "⏳ Aguardando aprovação" + "proposto por X") — ninguém
          // lê como placar final. O carimbo da ordenação é o `proposedAt`, que É a hora do
          // lançamento. Em disputa também entra: contestação é novidade do torneio.
          var _pnd = (!m.winner && m.pendingResult) ? m.pendingResult : null;
          var _pendente = !!_pnd && (_pnd.scoreP1 != null || (Array.isArray(_pnd.sets) && _pnd.sets.length) || !!_pnd.winner);
          if (!_tEncerrado && (_confirmado || _pendente)) {
            othersResults.push({
              tId: t.id, tName: t.name || '', m: m, pendente: _pendente,
              // MEDIDO em produção: `resultAt` é o carimbo do lançamento (7 de 8 jogos
              // do "Duplas Mistas" o têm), mas torneio antigo (BT Corpus Christi) não
              // tem carimbo NENHUM — daí a cadeia + o desempate por rodada/nº do jogo,
              // a mesma régua que "Meus Últimos Resultados" já usa.
              at: _pendente
                ? (_tsMs(_pnd.proposedAt) || _tsMs(m.updatedAt) || 0)
                : (_tsMs(m.resultAt) || _tsMs(m.updatedAt) || _tsMs(m.completedAt) || 0),
              roundNum: (m.round != null && !isNaN(Number(m.round))) ? Number(m.round) : 0,
              gameSeq: (m._gameNum != null) ? Number(m._gameNum)
                : (function(){ var g = String(m.label || '').match(/Jogo\s*(\d+)/i); return g ? Number(g[1]) : 0; })(),
              subLine: _subLine,
              // v1.8.78: o rótulo da FASE separado do formato. O agrupamento por
              // (grupo + torneio) das Novidades precisa de "R1 Grupo S • Jogo 1" puro —
              // `subLine` vem com o formato colado na frente ("Pontos Corridos · …") e
              // agrupar por ela juntaria grupos diferentes do mesmo formato.
              phaseLabel: _phaseLabel
            });
          }
          return;
        }

        var matchInfo = {
          tId: t.id, tName: t.name || '', sport: t.sport || '', m: m,
          opp: inP1 ? (m.p2 || '') : (m.p1 || ''),
          subLine: _subLine
        };

        if (m.winner) {
          // Confirmed result — up to 10 recent.
          // v2.4.77: além do timestamp, guarda rodada+jogo pra desempatar quando
          // os matches não têm updatedAt/proposedAt (caso comum em Liga/Suíço com
          // resultado lançado sem stamp por-match). Sem isto, todos ficam com
          // confirmedAt=0 e o sort vira no-op → a PRIMEIRA rodada inserida aparece
          // como "último resultado" (bug: R2 mostrada sendo a R5 a última jogada).
          var _rNum = (m.round != null && !isNaN(Number(m.round))) ? Number(m.round) : 0;
          if (!_rNum) {
            var _rm = String(m.label || m.roundLabel || '').match(/R(?:odada)?\s*(\d+)/i);
            if (_rm) _rNum = Number(_rm[1]);
          }
          var _gm = String(m.label || '').match(/Jogo\s*(\d+)/i);
          var _gSeq = _gm ? Number(_gm[1]) : 0;
          // ⚠️ `resultAt` PRIMEIRO — é o carimbo que `_applyApprovedResult` grava quando o
          // resultado é aprovado, ou seja O momento do lançamento. Faltava na cadeia: os 3
          // jogos do R1 do Confra têm resultAt e NÃO têm updatedAt/proposedAt (medido no
          // doc), então entravam com confirmedAt=0 e perdiam pra uma final ANTIGA que tinha
          // timestamp — a lista mostrava o velho no lugar do que acabou de ser jogado.
          // `_tsMs` normaliza segundos→ms (há dado gravado nas duas escalas na base).
          // Mesma régua da seção "Novidades no seu torneio", pra as duas não divergirem.
          recentConfirmed.push(Object.assign({
            confirmedAt: _tsMs(m.resultAt) || _tsMs(m.updatedAt) || _tsMs(m.proposedAt) || 0,
            roundNum: _rNum, gameSeq: _gSeq, inP1: inP1 }, matchInfo));
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

    // Recent confirmed: sort by confirmedAt desc, cap at 3 (últimos 3 jogos
    // jogados pelo usuário, somando todos os torneios). Pedido do usuário.
    // v2.4.77: empate de timestamp (inclusive quando ambos são 0, comum em
    // Liga/Suíço sem stamp por-match) cai pra rodada mais recente e, dentro da
    // mesma rodada, o jogo mais recente — assim a ÚLTIMA rodada jogada aparece.
    recentConfirmed.sort(function(a, b) {
      var ta = a.confirmedAt || 0, tb = b.confirmedAt || 0;
      if (ta !== tb) return tb - ta;
      var ra = a.roundNum || 0, rb = b.roundNum || 0;
      if (ra !== rb) return rb - ra;
      return (b.gameSeq || 0) - (a.gameSeq || 0);
    });
    recentConfirmed = recentConfirmed.slice(0, 3);

    // ⚠️ `othersResults` entra na conta: quem se inscreveu e AINDA NÃO JOGOU não tem
    // jogo nenhum nas outras listas, e sem isto o retorno antecipado levava junto a
    // seção "Novidades no seu torneio" — apagando exatamente para quem ela mais serve
    // (o recém-inscrito, que só tem os jogos dos outros para acompanhar).
    var totalSection = pendingForMe.length + pendingByMe.length + disputedMatches.length + noResult.length + upcoming.length + recentConfirmed.length + othersResults.length;
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

    // v3.1.24: "Próximos Jogos" vira seção SEPARADA, NÃO colapsável, renderizada ANTES
    // de "Meus Últimos Resultados" (colapsável). _upHtml acumula essa seção.
    var _upHtml = '';
    // A colapsável "Meus Últimos Resultados" só existe se há conteúdo de RESULTADO
    // (pendências + confirmados); próximos jogos saem dela.
    var _collapsibleHasContent = (pendingForMe.length + pendingByMe.length + disputedMatches.length + recentConfirmed.length) > 0;

    var _hasPendingApproval = (pendingForMe.length + pendingByMe.length + disputedMatches.length) > 0;
    // v3.1.24: COLAPSADA POR PADRÃO; lembra a escolha do usuário ('0' aberta | '1' fechada).
    // Chave estável (sem número de versão → sobrevive a deploy/cache).
    var _mrCollapsed = true;
    try { var _mrPref = localStorage.getItem('scoreplace_collapse_myresults'); if (_mrPref === '0') _mrCollapsed = false; else if (_mrPref === '1') _mrCollapsed = true; } catch (e) {}
    // v1.8.69: TOTAL de cards da seção — é o que decide o "▾ ver os N anteriores".
    // Cada item destas quatro listas vira exatamente um card no corpo.
    var _mrTotalCards = pendingForMe.length + pendingByMe.length + disputedMatches.length + recentConfirmed.length;
    // v1.8.69: marca o PRIMEIRO bloco renderizado. A ordem do corpo já é a de urgência
    // (aguardando você → aguardando o adversário → em disputa → resultados confirmados),
    // então o card que fica à mostra sai daí de graça: havendo pendência, aparece a
    // pendência (que pede ação sua); não havendo, aparece o último resultado.
    var _mrFirstBlockDone = false;
    function _mrBlockAttrs() {
      if (_mrFirstBlockDone) return ' data-mr-block="1"';
      _mrFirstBlockDone = true;
      return ' data-mr-block="1" data-mr-first="1"';
    }
    var html = '';
    if (_collapsibleHasContent) {
      html += '<div id="meus-resultados-section" data-mr-collapsed="' + (_mrCollapsed ? '1' : '0') + '"' + (_hasPendingApproval ? ' data-has-pending="1"' : '') + ' style="background:rgba(99,102,241,0.05);border:1px solid rgba(99,102,241,0.15);border-radius:14px;padding:14px 16px;margin-bottom:1rem;">';
      // v1.8.69: FECHADA NÃO É VAZIA — mesma regra de "📣 Novidades no seu torneio". Antes o
      // corpo inteiro sumia (`display:none`) e a seção fechada não mostrava NADA: pedido do
      // dono — "está discreto demais… apresenta o último com os outros colapsados, assim
      // chama mais a atenção sem ocupar muito espaço". Agora o corpo fica sempre no DOM e o
      // CSS esconde (a) todo bloco que não seja o primeiro e (b) dentro dele, tudo que vem
      // DEPOIS do primeiro card — `[data-mr-card] ~ *` pega também o cabeçalho de grupo do
      // 2º grupo, que senão ficaria órfão. O cabeçalho do bloco (ex.: "⏳ Aguardando sua
      // aprovação (2)") fica de fora do grid de propósito: ele contextualiza o card à mostra
      // e a contagem continua dizendo a verdade sobre o que existe.
      // ⚠️ `!important` NÃO é enfeite, e foi MEDIDO no navegador: os cards dos resultados
      // confirmados nascem com `style="...display:flex;..."` INLINE, e estilo inline vence
      // folha de estilo. Sem o `!important` o seletor casava (conferido com `.matches()`) e
      // mesmo assim os três cards apareciam — o teste estrutural passava verde e a tela
      // continuava errada. Novidades não precisou disto porque lá o card só traz `min-width`.
      // v1.9.64: o corte deixou de ser POSICIONAL (`[data-mr-card] ~ *`, que sempre
      // esconde do 2o card em diante) e virou o atributo `data-sp-extra`. Motivo: quantos
      // cards cabem na linha so se sabe MEDINDO a tela, e um seletor posicional nao tem
      // como ser afrouxado depois — `_spSyncCollapsePreview` tira o atributo dos que
      // couberem. O que sai daqui e o mesmo de antes (1 coluna): o 1o paint e o fallback.
      html += '<style>#meus-resultados-section[data-mr-collapsed="1"] #meus-resultados-body > *:not([data-mr-first]){display:none !important;}' +
        '#meus-resultados-section[data-mr-collapsed="1"] [data-mr-first] [data-sp-extra]{display:none !important;}</style>';
      html += '<h3 onclick="window._toggleMyResultsCollapse()" style="margin:0;font-size:0.85rem;font-weight:700;color:var(--sp-c-a5b4fc,#a5b4fc);letter-spacing:0.04em;text-transform:uppercase;cursor:pointer;display:flex;align-items:center;gap:8px;user-select:none;" title="Mostrar/ocultar">' +
        '🏅 Seus últimos resultados' +
        (_mrTotalCards > 1 ? _verMaisTag('mr-toggle-tag', _mrCollapsed) : '') +
        '</h3>';
      // ── ⭐ SÓ O BLOCO À VISTA NASCE (2.0.89) ───────────────────────────
      // Regra do dono: "nada que não estiver visível deve ser carregado". Fechada,
      // esta seção mostra UM bloco (`data-mr-first`) e escondia os demais com
      // `display:none` — construídos assim mesmo. Mesma confusão das janelas
      // (2.0.84), do histórico (2.0.86) e da chave (2.0.88).
      // A região abaixo tem ~630 linhas de `html +=`; em vez de reescrevê-las, a
      // saída dela é DESVIADA pra um acumulador e cortada no início do 2º bloco.
      var _mrAntes = html; html = '';
      html += '<div id="meus-resultados-body" style="margin-top:12px;">';
    }

    // Calcula label de fase para eliminatórias (FINAL, SEMI-FINAL etc.)
    function _elabFaseLabel(t, m) {
      // Liga/Suíço/Ranking e jogos Rei/Rainha NÃO têm fase de eliminatória
      // (Final/Semi/Quartas). Para esses, o rótulo correto é o label próprio do
      // jogo ("R1 Grupo F • Jogo 1") ou "Rodada N". Sem este guard, a derivação
      // abaixo (fromEnd = maxRound - curRound) aplicava nomes de mata-mata numa
      // Liga — ex.: card de Liga aparecia como "🏆 SEMIFINAL". (bug v2.3.x)
      var _isLiga = (typeof window._isLigaFormat === 'function')
        ? window._isLigaFormat(t)
        : (t && (t.format === 'Liga' || t.format === 'Ranking'));
      var _isSwiss = t && (t.format === 'Suíço' || t.format === 'Suico');
      if (_isLiga || _isSwiss || (m && m.isMonarch)) {
        if (m && m.label) return String(m.label);
        if (m && m.roundLabel) return String(m.roundLabel);
        if (m && m.round != null) return 'Rodada ' + window._matchRoundDisplayNum(t, m); // 1-based, nunca R0
        return '';
      }
      // Conta partidas totais do torneio (excluindo BYE/TBD) para estimar total de times
      var allM = (typeof window._collectAllMatches === 'function') ? window._collectAllMatches(t) : (t.matches || []);
      var realMatches = allM.filter(function(mm) {
        return mm && mm.p1 && mm.p2 && mm.p1 !== 'BYE' && mm.p2 !== 'BYE' && mm.p1 !== 'TBD' && mm.p2 !== 'TBD';
      });
      // v2.4.40: o TOTAL de rodadas vem do TAMANHO do bracket (nº de inscritos),
      // não do round máximo já gerado. Antes, um bracket só com R1 tinha maxRound=1
      // → fromEnd=0 → TODO jogo virava "Final" (bug do torneio da Vivi Hirata).
      // v1.3.9: nº de rodadas POSICIONAL (contagem de rodadas distintas do bracket do jogo),
      // não o maxRound CRU — a repescagem/play-in usa round 0, então maxRound subestimava o
      // total e o round cru gerava "Rodada 0"/"(R0)". curRound e totalRounds agora 1-based.
      var _bkR = m.bracket || 'main';
      var _rsetU = {};
      realMatches.forEach(function(mm) { if (mm && (mm.bracket || 'main') === _bkR && typeof mm.round === 'number') _rsetU[mm.round] = 1; });
      var _parts = Array.isArray(t.participants) ? t.participants : (t.participants ? Object.values(t.participants) : []);
      var _entries = _parts.length;
      var totalRounds = Object.keys(_rsetU).length;
      if (_entries >= 2) {
        var _byEntries = Math.ceil(Math.log2(_entries)); // bracket de N → log2(N) rodadas
        if (_byEntries > totalRounds) totalRounds = _byEntries;
      }
      var curRound = window._matchRoundDisplayNum(t, m); // 1-based (posição), nunca 0
      // fromEnd: 0 = final, 1 = semi, 2 = quartas, 3 = oitavas
      var fromEnd = totalRounds - curRound;
      var phaseStr = '';
      if (totalRounds > 0) {
        if (fromEnd === 0) phaseStr = 'Final';
        else if (fromEnd === 1) phaseStr = 'Semifinal';
        else if (fromEnd === 2) phaseStr = 'Quartas de Final';
        else if (fromEnd === 3) phaseStr = 'Oitavas de Final';
        else phaseStr = 'Rodada ' + curRound;
        // Sufixo (R<n>) só nas fases nomeadas Semi/Quartas/Oitavas — Final e
        // "Rodada N" não precisam (a Final é óbvia; Rodada N já tem o número).
        if (totalRounds > 1 && fromEnd >= 1 && fromEnd <= 3) phaseStr += ' (R' + curRound + ')';
      } else if (m.label) {
        phaseStr = m.label;
      } else if (m.roundLabel) {
        phaseStr = m.roundLabel;
      } else if (curRound) {
        phaseStr = 'Rodada ' + curRound;
      }
      return phaseStr;
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
      // v3.1.26: adversário "a definir" (TBD/vazio) → mostra "a definir" e NÃO permite
      // lançar placar/Ao Vivo (não há contra quem jogar ainda).
      var _isTbdSide = function(s) { return !s || s === 'TBD'; };
      var _hasTbdSide = _isTbdSide(p1) || _isTbdSide(p2);
      if (_hasTbdSide) canLaunch = false;

      // Fase label + cor da barra (igual às colunas do bracket)
      var tRef = participacoes.find(function(tt) { return tt.id === item.tId; });
      var faseStr = tRef ? _elabFaseLabel(tRef, item.m) : (item.subLine || '');
      // Cor baseada na fase — Semi=ciano, Quartas=verde, Oitavas/Rodada/Grupo=índigo,
      // Final=ouro. Default índigo (neutro) pra não pintar Liga/Rei-Rainha de ouro
      // como se fosse Final.
      var faseLower = faseStr.toLowerCase();
      var faseColor = '#818cf8'; // índigo (neutro) por padrão
      if (faseLower.indexOf('semi') !== -1) faseColor = '#06b6d4';
      else if (faseLower.indexOf('quarta') !== -1) faseColor = '#4ade80';
      else if (faseLower.indexOf('oitava') !== -1 || faseLower.indexOf('rodada') !== -1 || faseLower.indexOf('grupo') !== -1) faseColor = '#818cf8';
      else if (faseLower.indexOf('final') !== -1) faseColor = '#fbbf24'; // ouro só pra Final real

      // matchLabel — JOGO N GLOBAL (fonte única _assignGlobalGameNumbers, igual ao bracket).
      // v1.2.37: Rei/Rainha NÃO é mais exceção. Antes o `!isMonarch` mandava o monarch pro
      // `m.label` (que em Rei/Rainha é "Jogo 1/2/3" POR GRUPO) e um 2º numerador só dele
      // (_monarchGlobalJogoNum) — que espelhava um bracket ANTIGO ("grupo do usuário por
      // último" → Jogo 73) e divergiu do atual (numera na ordem dos grupos → Jogo 19).
      // Fonte única = m._gameNum, carimbado acima. Proibido 2º contador.
      var matchLabel = (item.m && item.m._gameNum != null)
        ? ('Jogo ' + item.m._gameNum)
        : (item.m.label || 'JOGO 1');
      var _gJogoNum = (item.m && item.m.isMonarch && item.m._gameNum != null) ? item.m._gameNum : null;
      var _monarchBoxLabel = (_gJogoNum != null) ? ('Jogo ' + _gJogoNum) : null;

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
      // ⭐ 2.0.35 · A GEOMETRIA DO NOME É A MESMA DA CHAVE. Ordem do dono: _"implemente em
      // todos os cards de forma canônica — não só no Novidades, ou nos Últimos Resultados,
      // ou nas chaves"_. Este card desenhava o jogador por conta própria: foto de 28px e
      // fonte de 0,8rem CRAVADAS, e — o pior — `text-overflow:ellipsis`, ou seja ele
      // CORTAVA o nome. O cânone da caixa invisível diz o contrário: o nome nunca é
      // cortado, a caixa é igual pra todo mundo e a FONTE é que cede.
      // O markup continua sendo daqui (este card tem "(você)", que a chave não tem); o que
      // passou a vir de fora são os NÚMEROS. [[project_name_fit_box_canonical]]
      var _geoMini = (typeof window._cardNomeGeo === 'function') ? window._cardNomeGeo(2) : null;
      // ⛔ O GRUPO É POR LADO, NUNCA POR CARD. Se fosse por card, os dois TIMES entrariam no
      // mesmo grupo e a quebra de um nome do time A forçaria a quebra no time B — que não
      // tem nada com isso. O que se iguala é a dupla, não o confronto. Por isso o contador
      // anda dentro de `_teamHtml`, uma vez por lado.
      var _grupoMini = '';
      // Um jogador (linha): avatar + nome
      function _playerRow(name, uid) {
        var isMe = _isMe(name);
        // ⭐ PONTO ÚNICO. O nome já hidratava por uid (span interno, logo abaixo) — o ÍCONE
        // não, e era ele que nascia mudo quando o perfil ainda não tinha chegado.
        var _av = _geoMini ? _geoMini.avatar : '28px';
        var avatarEl = window._personAvatarHtml(uid || '', name,
          'width:' + _av + ';height:' + _av + ';border-radius:50%;object-fit:cover;flex-shrink:0;');
        // v4.5.67: nome resolve VIVO por uid. data-uid-name fica no span INTERNO só do
        // nome (não no externo, senão a hidratação — textContent — apagaria o "(você)").
        var _disp = (uid && typeof window._displayName === 'function') ? window._displayName(uid, name) : name;
        var _uidAttr = uid ? (' data-uid-name="' + _sf(uid) + '"') : '';
        // ⛔ SEM `text-overflow:ellipsis` e sem `nowrap` no estilo: quem decide o tamanho é o
        // motor de ajuste (`.sp-name-fit` dentro de `.sp-mc-box`), e o `nowrap` vem do CSS
        // da classe — o motor conta com isso pra devolver a linha única.
        var _cor = isMe ? '#f1f5f9' : '#94a3b8';
        var _peso = isMe ? '700' : '500';
        var _interno = '<span' + _uidAttr + '>' + _sf(_disp) + '</span>' +
          (isMe ? ' <span style="font-size:0.65em;color:var(--sp-c-818cf8,#818cf8);font-weight:800;">(você)</span>' : '');
        if (!_geoMini) {
          return '<div style="display:flex;align-items:center;gap:6px;min-width:0;">' + avatarEl +
            '<span style="font-size:0.8rem;font-weight:' + _peso + ';color:' + window._spCor(_cor, 'color') + ';">' + _interno + '</span></div>';
        }
        var nameEl = '<div class="sp-mc-box" style="--sp-box-h:' + _geoMini.boxH + 'rem">' +
          '<span class="sp-name-fit sp-mc-nm" data-fit-group="' + _grupoMini + '"' +
          ' data-maxrem="' + _geoMini.maxRem + '" data-minrem="' + _geoMini.minRem + '"' +
          ' style="font-weight:' + _peso + ';color:' + window._spCor(_cor, 'color') + ';">' + _interno + '</span></div>';
        return '<div style="display:flex;align-items:center;gap:6px;min-width:0;">' + avatarEl + nameEl + '</div>';
      }
      // Time: jogadores EMPILHADOS verticalmente (um em cima do outro)
      function _teamHtml(teamStr, uids) {
        // v3.1.26: lado "a definir" (TBD/vazio) — placeholder discreto, sem avatar.
        if (!teamStr || teamStr === 'TBD') {
          return '<div style="flex:1;min-width:0;display:flex;align-items:center;gap:6px;color:var(--sp-c-64748b,#64748b);font-style:italic;font-size:0.82rem;">' +
            '<span style="width:28px;height:28px;border-radius:50%;background:var(--sp-g-255-255-255-005,rgba(255,255,255,0.05));border:1px dashed rgba(255,255,255,0.18);display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;font-size:0.9rem;font-style:normal;">⏳</span>' +
            '<span>a definir</span></div>';
        }
        var parts = String(teamStr).split(/\s*\/\s*/).filter(Boolean);
        window._fitGroupSeq = (window._fitGroupSeq || 0) + 1;
        _grupoMini = 'd' + window._fitGroupSeq;      // um grupo por LADO
        return '<div style="display:flex;flex-direction:column;gap:4px;flex:1;min-width:0;">' +
          parts.map(function(n, i) { return _playerRow(n, uids && uids[i]); }).join('') +
        '</div>';
      }
      // uid do slot (dupla → team1Uids/team2Uids; 1v1 → p1Uid/p2Uid) p/ resolver nome vivo.
      var _p1Uids = (Array.isArray(item.m.team1Uids) && item.m.team1Uids.length) ? item.m.team1Uids : (item.m.p1Uid ? [item.m.p1Uid] : null);
      var _p2Uids = (Array.isArray(item.m.team2Uids) && item.m.team2Uids.length) ? item.m.team2Uids : (item.m.p2Uid ? [item.m.p2Uid] : null);

      var rowStyle = 'display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;background:var(--sp-g-255-255-255-003,rgba(255,255,255,0.03));margin-bottom:4px;';
      var scoreInputStyle = 'width:52px;text-align:center;font-size:0.95rem;font-weight:700;background:var(--sp-g-255-255-255-006,rgba(255,255,255,0.06));border:1px solid var(--sp-b-255-255-255-015,rgba(255,255,255,0.15));color:var(--text-bright);border-radius:6px;padding:4px 6px;-moz-appearance:textfield;';
      var scorePlaceholder = '<div style="width:52px;height:30px;border-radius:6px;background:var(--sp-g-255-255-255-004,rgba(255,255,255,0.04));border:1px solid var(--sp-b-255-255-255-008,rgba(255,255,255,0.08));display:flex;align-items:center;justify-content:center;font-size:0.9rem;color:#475569;flex-shrink:0;">0</div>';

      // opts.pendingScores = {p1, p2} → mostra placar âmbar read-only (estado pendente)
      // opts.headerBtns → HTML dos botões no header (substitui Ao Vivo + Confirmar)
      // opts.cardBorder / opts.cardBg → override de estilo do card
      var opts = arguments[2] || {};
      var pendingScores = opts.pendingScores || null;
      var headerBtns = opts.headerBtns != null ? opts.headerBtns : null;
      var cardBorderStr = opts.cardBorder || 'rgba(99,102,241,0.6)';
      var cardBgStr = opts.cardBg || 'rgba(99,102,241,0.06)';
      var cardShadow = opts.cardShadow || '0 0 20px rgba(99,102,241,0.25),0 4px 12px rgba(0,0,0,0.15)';

      // ⭐ 2.0.35: o TAMANHO do número sai da classe canônica (.sp-mc-num → --sp-num-fs), a
      // mesma do card da chave. Aqui sobra só o que é DESTE estado: âmbar e itálico.
      var pendingScoreStyle = 'color:var(--sp-c-fbbf24,#fbbf24);font-style:italic;flex-shrink:0;';

      // ⚠️ CAMPOS DO TIE-BREAK também aqui. Este card já chamava _highlightWinner no oninput,
      // mas NUNCA renderizava `tb1-`/`tb2-` — e a função começa com `if (tb1El && tb2El)`, ou
      // seja virava no-op silencioso: lançar 6-5 pelo dashboard perdia os pontos do TB. Quem
      // salva aqui é o _saveResultInline (o mesmo do bracket), que lê os campos POR ID e já
      // exige/valida o TB — então basta eles existirem. [[feedback_sweep_all_render_sites]]
      var _dTb = '';
      try {
        var _dSc = (tRef && typeof window._effectiveScoring === 'function')
          ? window._effectiveScoring(tRef, item.m) : (tRef && tRef.scoring);
        if (_dSc && window._scoringUsesSets && window._scoringUsesSets(_dSc) && _dSc.tiebreakEnabled !== false) {
          _dTb = 'width:34px;text-align:center;font-size:0.72rem;font-weight:700;' +
            'background:rgba(168,85,247,0.1);border:1px solid rgba(168,85,247,0.4);' +
            'color:var(--text-bright);border-radius:5px;padding:2px 3px;';
        }
      } catch (e) {}
      var _dTbInput = function(n) {
        if (!_dTb) return '';
        return '<input id="tb' + n + '-' + mId + '" type="number" min="0" placeholder="tb" title="Tie-break"' +
          ' onclick="event.stopPropagation();"' +
          ' oninput="window._highlightWinner&&window._highlightWinner(\'' + _esc(mId) + '\')"' +
          ' style="' + _dTb + 'display:none;margin-left:3px;flex-shrink:0;">';
      };

      var p1ScoreHtml = pendingScores
        ? '<span class="sp-mc-num" style="' + pendingScoreStyle + '">' + (pendingScores.p1 != null ? pendingScores.p1 : '?') + '</span>'
        : canLaunch
          ? '<input id="s1-' + mId + '" type="number" min="0" placeholder="0" onclick="event.stopPropagation();" oninput="window._highlightWinner&&window._highlightWinner(\'' + _esc(mId) + '\')" style="' + scoreInputStyle + 'flex-shrink:0;">' + _dTbInput(1)
          : scorePlaceholder;
      var p2ScoreHtml = pendingScores
        ? '<span class="sp-mc-num" style="' + pendingScoreStyle + '">' + (pendingScores.p2 != null ? pendingScores.p2 : '?') + '</span>'
        : canLaunch
          ? '<input id="s2-' + mId + '" type="number" min="0" placeholder="0" onclick="event.stopPropagation();" oninput="window._highlightWinner&&window._highlightWinner(\'' + _esc(mId) + '\')" style="' + scoreInputStyle + 'flex-shrink:0;">' + _dTbInput(2)
          : scorePlaceholder;

      var defaultHeaderBtns = '';
      if (headerBtns === null) {
        // v2.7.56: botões no PADRÃO do app (.btn + variante de cor + .btn-micro =
        // sólido, com volume almofadado), não mais etiqueta flat com estilo inline.
        var liveBtnHtml = (!pendingScores && canLaunch)
          ? '<button class="btn btn-live btn-micro" onclick="event.stopPropagation();window._openLiveScoring(\'' + _esc(tId) + '\',\'' + _esc(mId) + '\')" style="flex-shrink:0;font-size:0.72rem;">📡 Ao Vivo</button>'
          : '';
        var confirmBtnHtml = (!pendingScores && canLaunch)
          ? '<button id="confirm-' + mId + '" class="btn btn-success btn-micro" onclick="event.stopPropagation();window._saveResultInline(\'' + _esc(tId) + '\',\'' + _esc(mId) + '\')" style="flex-shrink:0;font-size:0.72rem;">✓ Confirmar</button>'
          : '';
        defaultHeaderBtns = liveBtnHtml + confirmBtnHtml;
      }
      var finalHeaderBtns = headerBtns !== null ? headerBtns : defaultHeaderBtns;

      // v2.7.51: "Ir para Torneio" volta ao tamanho dos botões Ao Vivo/Confirmar
      // (mesma fonte/padding/raio, flat) só com a cor índigo — antes era .btn .btn-sm
      // (maior, com volume) e quebrava pra outra linha. Fica na MESMA linha dos outros
      // 2, FORA do #header-btns (que é reescrito in-place no fluxo de aprovação).
      var goToBtn = '<button class="btn btn-indigo btn-micro" onclick="event.stopPropagation();window._goToTournamentMatch(\'' + _esc(tId) + '\',\'' + _esc(mId) + '\')" style="flex-shrink:0;font-size:0.72rem;line-height:1.05;text-align:center;">Ir para<br>Torneio →</button>';

      // v1.7.83: o box era `min-width:300px;max-width:360px` — px CRAVADO. Com a
      // escala grande (até 1.7) os 3 botões do cabeçalho (Ao Vivo · Confirmar ·
      // Ir para Torneio) não cabiam em 360px e o último montava POR CIMA do
      // Confirmar (+11px medidos). Ordem do dono: "esse box deve usar a largura
      // da tela e com isso ter mais espaço para os botoes."
      // `flex:1 1 18.75rem` mantém o comportamento de fila em tela larga (vários
      // cards lado a lado) e ENCHE a largura no telefone; o teto vira 100%, que
      // é o container — nunca mais um número fixo que ignora a escala.
      return '<div style="flex:1 1 18.75rem;min-width:0;max-width:100%;display:flex;flex-direction:column;gap:0.6rem;">' +
        (opts.hideFaseHeader ? '' :
          '<div style="display:flex;align-items:center;gap:8px;">' +
            '<h4 style="color:' + window._spCor(faseColor, 'color') + ';font-size:0.75rem;text-transform:uppercase;letter-spacing:2px;margin:0;border-left:3px solid ' + window._spCor(faseColor, 'borda') + ';padding-left:8px;flex:1;">' +
              (faseLower.indexOf('final') !== -1 ? '🏆 ' : '') + _sf(faseStr) +
              '<span style="font-weight:400;color:var(--text-muted);font-size:0.65rem;margin-left:6px;">' + _sf(item.tName) + '</span>' +
            '</h4>' +
          '</div>') +
        '<div id="card-' + mId + '" style="background:' + window._spCor(cardBgStr, 'background') + ';border:2px solid ' + window._spCor(cardBorderStr, 'borda') + ';border-radius:12px;padding:14px;box-shadow:' + cardShadow + ';">' +
          '<div class="btn-row" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;border-bottom:1px solid var(--sp-b-255-255-255-008,rgba(255,255,255,0.08));padding-bottom:8px;gap:8px;flex-wrap:wrap;">' +
            '<span style="font-size:0.7rem;font-weight:700;color:var(--sp-c-38bdf8,#38bdf8);text-transform:uppercase;flex-shrink:0;display:inline-flex;align-items:center;">' + (item.m.isMonarch ? '<span style="font-size:1.05rem;line-height:1;margin-right:5px;">👑</span>' : '') + _sf(_monarchBoxLabel || opts.boxLabelOverride || matchLabel) + '</span>' +
            '<div style="display:flex;align-items:center;gap:6px;flex-wrap:nowrap;justify-content:flex-end;min-width:0;margin-left:auto;">' +
              '<div id="header-btns-' + mId + '" style="display:flex;align-items:center;gap:4px;flex-wrap:nowrap;">' + finalHeaderBtns + '</div>' +
              goToBtn +
            '</div>' +
          '</div>' +
          '<div style="' + rowStyle + '">' + _teamHtml(p1, _p1Uids) + '<div id="score-p1-' + mId + '" style="display:flex;align-items:center;flex-shrink:0;">' + p1ScoreHtml + '</div></div>' +
          '<div style="text-align:center;font-size:0.65rem;color:var(--text-muted);font-weight:800;letter-spacing:2px;padding:3px 0;">VS</div>' +
          '<div style="' + rowStyle + '">' + _teamHtml(p2, _p2Uids) + '<div id="score-p2-' + mId + '" style="display:flex;align-items:center;flex-shrink:0;">' + p2ScoreHtml + '</div></div>' +
        '</div>' +
      '</div>';
    }

    // ── Aguardando minha aprovação ──
    if (pendingForMe.length > 0) {
      html += '<div' + _mrBlockAttrs() + ' style="margin-bottom:10px;">';
      html += '<p style="margin:0 0 8px;font-size:0.72rem;font-weight:700;color:var(--sp-c-fbbf24,#fbbf24);text-transform:uppercase;letter-spacing:0.04em;">⏳ Aguardando sua aprovação (' + pendingForMe.length + ')</p>';
      _spReset();
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;align-items:start;">';
      var _pendTag = '<span style="font-size:0.58rem;font-weight:800;color:var(--sp-c-fbbf24,#fbbf24);background:rgba(251,191,36,0.15);padding:2px 5px;border-radius:4px;text-transform:uppercase;letter-spacing:0.03em;flex-shrink:0;">PENDENTE</span>';
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
        html += '<div data-mr-card="1"' + _spCard() + ' style="min-width:0;">' + _miniBracketCard(item, false, {
          pendingScores: {p1: s1, p2: s2},
          headerBtns: btns,
          cardBorder: 'rgba(251,191,36,0.6)',
          cardBg: 'rgba(251,191,36,0.06)',
          cardShadow: '0 0 14px rgba(251,191,36,0.18),0 4px 12px rgba(0,0,0,0.15)'
        }) + '</div>';
      });
      html += '</div></div>';
    }

    // ── Resultado proposto aguardando adversário ──
    if (pendingByMe.length > 0) {
      html += '<div' + _mrBlockAttrs() + ' style="margin-bottom:10px;">';
      html += '<p style="margin:0 0 8px;font-size:0.72rem;font-weight:700;color:var(--sp-c-94a3b8,#94a3b8);text-transform:uppercase;letter-spacing:0.04em;">🕐 Aguardando confirmação do adversário (' + pendingByMe.length + ')</p>';
      _spReset();
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;align-items:start;">';
      var _pendTag2 = '<span style="font-size:0.6rem;font-weight:800;color:var(--sp-c-fbbf24,#fbbf24);background:rgba(251,191,36,0.15);padding:2px 6px;border-radius:4px;text-transform:uppercase;letter-spacing:0.04em;">PENDENTE</span>';
      pendingByMe.forEach(function(item) {
        var pr = item.m.pendingResult || {};
        var s1 = pr.scoreP1, s2 = pr.scoreP2;
        var mid = String(item.m.id || '');
        var btns = _pendTag2 +
          '<button data-pending-action="edit" data-tid="' + _sf(item.tId) + '" data-mid="' + _sf(mid) + '" style="background:rgba(99,102,241,0.12);border:1px solid rgba(99,102,241,0.35);color:var(--sp-c-a78bfa,#a78bfa);border-radius:6px;padding:3px 8px;font-size:0.7rem;font-weight:700;cursor:pointer;margin-left:4px;">✏️ Editar</button>';
        html += '<div data-mr-card="1"' + _spCard() + ' style="min-width:0;">' + _miniBracketCard(item, false, {
          pendingScores: {p1: s1, p2: s2},
          headerBtns: btns,
          cardBorder: 'rgba(148,163,184,0.4)',
          cardBg: 'rgba(148,163,184,0.06)',
          cardShadow: '0 4px 12px rgba(0,0,0,0.15)'
        }) + '</div>';
      });
      html += '</div></div>';
    }

    // ── Em disputa — aguardando organizador (Fase 4) ──
    if (disputedMatches.length > 0) {
      html += '<div' + _mrBlockAttrs() + ' style="margin-bottom:10px;">';
      html += '<p style="margin:0 0 8px;font-size:0.72rem;font-weight:700;color:var(--sp-c-f87171,#f87171);text-transform:uppercase;letter-spacing:0.04em;">🚨 Em disputa — aguardando organizador (' + disputedMatches.length + ')</p>';
      _spReset();
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;align-items:start;">';
      var _dispTag = '<span style="font-size:0.6rem;font-weight:800;color:var(--sp-c-f87171,#f87171);background:rgba(239,68,68,0.15);padding:2px 6px;border-radius:4px;text-transform:uppercase;letter-spacing:0.04em;flex-shrink:0;">EM DISPUTA</span>';
      disputedMatches.forEach(function(item) {
        var pr = item.m.pendingResult || {};
        var s1 = pr.scoreP1, s2 = pr.scoreP2;
        // Sem botões de ação — o jogador não age mais, só o organizador (no bracket).
        html += '<div data-mr-card="1"' + _spCard() + ' style="min-width:0;">' + _miniBracketCard(item, false, {
          pendingScores: {p1: s1, p2: s2},
          headerBtns: _dispTag,
          cardBorder: 'rgba(239,68,68,0.5)',
          cardBg: 'rgba(239,68,68,0.06)',
          cardShadow: '0 0 14px rgba(239,68,68,0.18),0 4px 12px rgba(0,0,0,0.15)'
        }) + '</div>';
      });
      html += '</div></div>';
    }

    // ── Próximo Jogo (UM só — o mais imediato). v3.1.27 (pedido do dono): a seção
    // sempre mostra 1 jogo; em Rei/Rainha (3 jogos no grupo), mostra apenas o PRÓXIMO.
    // Header sem contador. Sub-header: nome do torneio / quebra / Rodada · Fase · Linha
    // (+ coroa se Rei/Rainha).
    var allUpcoming = [];
    noResult.forEach(function(i) { allUpcoming.push({ item: i, canLaunch: true }); });
    upcoming.forEach(function(i) { allUpcoming.push({ item: i, canLaunch: false }); });
    // ordena por rodada e, dentro da rodada, pelo nº do Jogo (o próximo a jogar primeiro)
    var _jogoSeqU = function(m) { if (m && m._gameNum != null) return Number(m._gameNum); var mm = String(m.label || '').match(/Jogo\s*(\d+)/i); return mm ? Number(mm[1]) : 0; };
    allUpcoming.sort(function(a, b) {
      var ra = (a.item.m.round || 0), rb = (b.item.m.round || 0);
      if (ra !== rb) return ra - rb;
      return _jogoSeqU(a.item.m) - _jogoSeqU(b.item.m);
    });

    if (allUpcoming.length > 0) {
      var _ngEntry = allUpcoming[0];
      var _ng = _ngEntry.item;
      var _ngM = _ng.m;
      var _ngT = participacoes.find(function(tt) { return tt.id === _ng.tId; });
      // meta: Rodada X · Fase Y (multi-fase) · Linha (Ouro/Prata) — coroa se Rei/Rainha
      var _meta = [];
      var _rdM = String(_ngM.label || '').match(/R(?:odada)?\s*(\d+)/i);
      var _rnum = _rdM ? Number(_rdM[1]) : ((_ngM.round != null && !isNaN(Number(_ngM.round))) ? window._matchRoundDisplayNum(_ngT || t, _ngM) : null); // 1-based, nunca R0
      if (_rnum != null) _meta.push('Rodada ' + _rnum);
      if (_ngT && window._isMultiPhase && window._isMultiPhase(_ngT) && _ngM.phaseIndex != null) {
        var _phN = (_ngT.phases && _ngT.phases[_ngM.phaseIndex] && _ngT.phases[_ngM.phaseIndex].name) || ('Fase ' + ((Number(_ngM.phaseIndex) || 0) + 1));
        _meta.push(_phN);
      } else if (_ngT && _ngT.format) {
        // Fase única: o "nome da fase" é o próprio formato (rótulo de exibição —
        // 'Liga'→'Pontos Corridos', 'Fase de Grupos + Eliminatórias'→'Fase de Grupos').
        var _fmtN = (typeof window._formatLabel === 'function') ? window._formatLabel(_ngT) : _ngT.format;
        if (_fmtN) _meta.push(_fmtN);
      }
      if (_ngM.tierLabel) _meta.push(String(_ngM.tierLabel).trim());
      // v4.0.2: a coroa fica SÓ ao lado do "JOGO N" (no card) — não repetir aqui.
      var _metaStr = _meta.join(' · ');
      // v4.1.20: "JOGO N" GLOBAL (fonte única). Antes parseava _ngM.label — que muitas
      // vezes não traz número → caía em "Jogo" pelado (bug reportado na dashboard).
      // v1.2.37: Rei/Rainha NÃO é exceção — o `!isMonarch` daqui era o bug do "JOGO 73"
      // (caía no parse do m.label, que em Rei/Rainha é o nº POR GRUPO/legado). Fonte única.
      var _boxU;
      if (_ngM && _ngM._gameNum != null) {
        _boxU = 'Jogo ' + _ngM._gameNum;
      } else {
        var _jgU = String(_ngM.label || '').match(/Jogo\s*\d+/i);
        _boxU = _jgU ? _jgU[0] : 'Jogo';
      }

      // v3.1.24: SEÇÃO SEPARADA, NÃO colapsável — renderizada ANTES de "Meus Últimos Resultados".
      _upHtml += '<div id="proximos-jogos-section" style="background:rgba(56,189,248,0.05);border:1px solid rgba(56,189,248,0.18);border-radius:14px;padding:14px 16px;margin-bottom:1rem;">';
      _upHtml += '<h3 style="margin:0 0 12px;font-size:0.85rem;font-weight:700;color:var(--sp-c-38bdf8,#38bdf8);letter-spacing:0.04em;text-transform:uppercase;display:flex;align-items:center;gap:8px;">⚔️ Seu próximo jogo</h3>';
      _upHtml += '<div style="border-left:3px solid #818cf8;padding-left:10px;margin-bottom:10px;">' +
        '<div style="font-weight:800;color:var(--text-bright);font-size:0.92rem;text-transform:uppercase;letter-spacing:0.5px;line-height:1.25;">' + _sf(_ng.tName) + '</div>' +
        (_metaStr ? '<div style="color:var(--sp-c-a5b4fc,#a5b4fc);font-size:0.72rem;margin-top:3px;font-weight:600;">' + _sf(_metaStr) + '</div>' : '') +
      '</div>';
      _upHtml += _miniBracketCard(_ng, _ngEntry.canLaunch, { hideFaseHeader: true, boxLabelOverride: _boxU });
      _upHtml += '</div>'; // fecha #proximos-jogos-section
    }

    // ── Últimos resultados confirmados — estilo chave (não card flat) ──
    if (recentConfirmed.length > 0) {
      html += '<div' + _mrBlockAttrs() + '>';
      _spReset();
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;align-items:start;">';
      // v2.3.52: agrupa resultados que compartilham GRUPO + TORNEIO. Quando
      // 2+ chaves repetem "R2 GRUPO A … TESTE DE LIGA", mostra esse rótulo uma
      // única vez numa linha e só "JOGO N" acima de cada chave.
      // v1.8.78: `_splitFase` subiu pro topo de _buildMyResultsHtml (fonte única —
      // as Novidades agrupam pelo mesmo critério e não podem ter outra cópia).
      var _units = [];
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
        // ⚰️ REMOVIDO (1.8.44): `_scoreDisplay` + `scoresHtml` eram montados aqui e
        // NUNCA consumidos — quem desenha o placar deste card é o bloco "VS" mais
        // abaixo, que lê m2.scoreP1/scoreP2. Ficavam como decoy: mexer neles parecia
        // mexer no placar e não mudava um pixel (foi o que aconteceu ao consertar o
        // subplacar do tie-break). O placar com tie-break vive em `_placarLado`.

        // Placar de UM lado, com o subplacar do tie-break quando houver (6⁽⁷⁾).
        // Ler m2.scoreP1 cru perdia o TB — o número dos games é o mesmo, o que some
        // é o (7). Fonte única de formatação: window._formatSetForPlayer.
        function _placarLado(n) {
          if (Array.isArray(m2.sets) && m2.sets.length > 0 && typeof window._formatSetForPlayer === 'function') {
            return m2.sets.map(function(s) { return window._formatSetForPlayer(s, n, { html: true }); }).join(' ');
          }
          var v = (n === 1 ? m2.scoreP1 : m2.scoreP2);
          return v == null ? '' : _sf(String(v));
        }

        // mesmo estilo de coluna que _miniBracketCard — JOGO N GLOBAL (fonte única).
        // v1.2.37: sem exceção pra Rei/Rainha (ver matchLabel acima).
        var matchLabel2 = (m2 && m2._gameNum != null)
          ? ('Jogo ' + m2._gameNum)
          : (m2.label || 'JOGO 1');
        var rowStyle2 = 'display:flex;align-items:center;gap:10px;padding:7px 10px;border-radius:8px;margin-bottom:4px;';

        var p1IsWinner = !m2.draw && window._matchWinnerSide(m2) === 1;
        var p2IsWinner = !m2.draw && window._matchWinnerSide(m2) === 2;
        // ⭐ 2.0.5 — A COR DO NÚMERO AQUI É A MESMA DA CHAVE. Relato do dono, olhando "Seus
        // últimos resultados": _"quando eu disse como os placares devem aparecer cobrimos todas
        // as situações. por que nos seus últimos resultados está diferente? sem número perdedor
        // vermelho?"_. Ele está certo: a regra da 1.9.112 (tarja diz o ESTADO, número diz QUEM
        // GANHOU) foi aplicada no card da CHAVE (renderMatchCard) e este bloco da dashboard é
        // OUTRO renderizador — ficou com o perdedor em CINZA. É a mesma doença das duas pontas.
        // Cânone, na letra do dono: sem resultado = tudo cinza; com resultado = vencedor VERDE,
        // perdedor VERMELHO. O cinza só sobra pra jogo sem vencedor resolvido (ou empate).
        var _temVencedor2 = !m2.draw && window._matchWinnerSide(m2) != null;
        var _corPlacar2 = function (venceu) {
          return venceu ? '#4ade80' : (_temVencedor2 ? '#f87171' : '#94a3b8');
        };

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
          _posBadge = '<div style="font-size:1.45rem;font-weight:900;color:' + window._spCor(_posCol, 'color') + ';margin:4px 0 8px;display:flex;align-items:center;gap:8px;line-height:1.1;">' +
            '<span>' + _fp + 'º lugar</span>' +
            '<span style="font-size:1.6rem;">' + _posMedal + '</span></div>';
        }

        var _fp2 = _splitFase(faseStr2);
        // v2.3.63: no header de cada box mostra só "JOGO N" (o grupo+torneio já
        // aparece no cabeçalho compartilhado). Fallback pro label completo
        // quando não há "jogo N" (ex.: eliminatórias "Final").
        // v1.2.37: Rei/Rainha usa o número GLOBAL da FONTE ÚNICA (m._gameNum), igual ao
        // bracket. Antes vinha do _monarchGlobalJogoNum (2º numerador, já removido).
        var _gJogoNum2 = (m2 && m2.isMonarch && m2._gameNum != null) ? m2._gameNum : null;
        var _boxLabel = (_gJogoNum2 != null) ? ('Jogo ' + _gJogoNum2) : (_fp2.jogo || matchLabel2);
        var _body = _posBadge +
          '<div onclick="window.location.hash=\'#bracket/' + _esc2(item.tId) + '\'" style="cursor:pointer;background:var(--bg-card);border:1px solid rgba(16,185,129,0.3);border-radius:12px;padding:14px;box-shadow:0 4px 12px rgba(0,0,0,0.15);">' +
            // Header: label + badge resultado
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;border-bottom:1px solid var(--sp-b-255-255-255-008,rgba(255,255,255,0.08));padding-bottom:5px;">' +
              '<span style="font-size:0.7rem;font-weight:700;color:var(--sp-c-38bdf8,#38bdf8);text-transform:uppercase;">' + _sf(_boxLabel) + '</span>' +
              '<span style="font-size:0.75rem;font-weight:800;color:' + window._spCor(resultColor, 'color') + ';">' + resultLabel + '</span>' +
            '</div>' +
            // P1 row com placar
            '<div style="' + rowStyle2 + (p1IsWinner ? 'background:rgba(16,185,129,0.12);border-left:3px solid #10b981;' : 'background:var(--sp-g-255-255-255-002,rgba(255,255,255,0.02));') + 'justify-content:space-between;">' +
              (function(){
                var parts3 = String(m2.p1||'').split(/\s*\/\s*/).filter(Boolean);
                var ph = '<div style="display:flex;flex-direction:column;gap:4px;flex:1;min-width:0;">';
                parts3.forEach(function(n, _pi){
                  // ⭐ O UID DO JOGO CHEGA AQUI, por índice: `m2.team1Uids` casa com a ordem
                  // de `p1` partida em ' / '. Antes o ícone era semeado só pelo NOME e, com o
                  // perfil ainda não resolvido, virava o mesmo círculo mudo pra todo mundo.
                  var isMe3=_isMe(n);
                  var _u3=(Array.isArray(m2.team1Uids)&&m2.team1Uids[_pi])||'';
                  var av3=window._personAvatarHtml(_u3, n, 'width:26px;height:26px;border-radius:50%;object-fit:cover;flex-shrink:0;');
                  ph+='<div style="display:flex;align-items:center;gap:6px;">'+av3+'<span style="font-size:0.78rem;font-weight:'+(isMe3?'700':'400')+';color:' + window._spCor((isMe3?'#f1f5f9':'#94a3b8'), 'color')+';">'+_sf(n)+(isMe3?' <span style="font-size:0.62em;color:var(--sp-c-818cf8,#818cf8);">(você)</span>':'')+'</span></div>';
                });
                ph+='</div>';
                var sc3 = m2.scoreP1 != null ? '<div class="sp-mc-num" style="color:' + window._spCor(_corPlacar2(p1IsWinner), 'color')+';flex-shrink:0;text-align:right;">'+_placarLado(1)+'</div>' : '';
                return ph+sc3;
              })() +
            '</div>' +
            '<div style="text-align:center;font-size:0.65rem;color:var(--text-muted);font-weight:800;letter-spacing:2px;padding:3px 0;">VS</div>' +
            // P2 row com placar
            '<div style="' + rowStyle2 + (p2IsWinner ? 'background:rgba(16,185,129,0.12);border-left:3px solid #10b981;' : 'background:var(--sp-g-255-255-255-002,rgba(255,255,255,0.02));') + 'justify-content:space-between;">' +
              (function(){
                var parts4 = String(m2.p2||'').split(/\s*\/\s*/).filter(Boolean);
                var ph = '<div style="display:flex;flex-direction:column;gap:4px;flex:1;min-width:0;">';
                parts4.forEach(function(n, _pi){
                  // ⭐ O UID DO JOGO CHEGA AQUI, por índice: `m2.team2Uids` casa com a ordem
                  // de `p2` partida em ' / '. Antes o ícone era semeado só pelo NOME e, com o
                  // perfil ainda não resolvido, virava o mesmo círculo mudo pra todo mundo.
                  var isMe4=_isMe(n);
                  var _u4=(Array.isArray(m2.team2Uids)&&m2.team2Uids[_pi])||'';
                  var av4=window._personAvatarHtml(_u4, n, 'width:26px;height:26px;border-radius:50%;object-fit:cover;flex-shrink:0;');
                  ph+='<div style="display:flex;align-items:center;gap:6px;">'+av4+'<span style="font-size:0.78rem;font-weight:'+(isMe4?'700':'400')+';color:' + window._spCor((isMe4?'#f1f5f9':'#94a3b8'), 'color')+';">'+_sf(n)+(isMe4?' <span style="font-size:0.62em;color:var(--sp-c-818cf8,#818cf8);">(você)</span>':'')+'</span></div>';
                });
                ph+='</div>';
                var sc4 = m2.scoreP2 != null ? '<div class="sp-mc-num" style="color:' + window._spCor(_corPlacar2(p2IsWinner), 'color')+';flex-shrink:0;text-align:right;">'+_placarLado(2)+'</div>' : '';
                return ph+sc4;
              })() +
            '</div>' +
          '</div>';
        _units.push({ group: _fp2.group, jogo: _fp2.jogo, tName: item.tName, color: faseColor2, faseStr2: faseStr2, body: _body, tId: item.tId });
      });

      // Agrupa por (grupo + torneio) preservando a ordem original.
      var _resGroups = [];
      var _resGIdx = {};
      _units.forEach(function(u) {
        var canGroup = !!(u.group && u.jogo);
        var key = (u.group || '').toLowerCase() + '||' + (u.tName || '').toLowerCase();
        if (canGroup && _resGIdx[key] != null) { _resGroups[_resGIdx[key]].units.push(u); return; }
        if (canGroup) _resGIdx[key] = _resGroups.length;
        _resGroups.push({ group: u.group, tName: u.tName, color: u.color, grouped: canGroup, units: [u], tId: u.tId });
      });
      _resGroups.forEach(function(g) {
        if (g.grouped && g.units.length >= 2) {
          // Cabeçalho compartilhado (linha inteira) + só "JOGO N" acima de cada chave.
          // v1.8.78: grupo e torneio em DUAS LINHAS (antes lado a lado, e o torneio
          // sumia no `ellipsis` em tela estreita). Mesmo desenho das Novidades.
          html += _grupoHeadHtml(g.group, g.tName, g.color, _spFull(), false, g.tId);
          // v2.3.62: o rótulo "JOGO N" com a barra colorida acima de cada chave
          // foi removido — essa info já aparece no header de cada box
          // ("R2 GRUPO A • JOGO N"). Só o cabeçalho do grupo (grupo + torneio)
          // fica uma vez no topo. Pequena margem entre os boxes via margin.
          g.units.forEach(function(u) {
            html += '<div data-mr-card="1"' + _spCard() + ' style="min-width:0;display:flex;flex-direction:column;margin-bottom:6px;">' +
              u.body +
            '</div>';
          });
        } else {
          // Singleton — cabeçalho completo (grupo · jogo + torneio), como antes.
          g.units.forEach(function(u) {
            // v1.8.78: também em duas linhas — mas INLINE, dentro do card: sendo avulso,
            // o rótulo não se repete em ninguém e um cabeçalho de linha inteira deixaria
            // o resto da linha vazio.
            html += '<div data-mr-card="1"' + _spCard() + ' style="min-width:0;display:flex;flex-direction:column;gap:0.6rem;">' +
              _grupoHeadHtml(
                (String(u.faseStr2 || '').toLowerCase().indexOf('final') !== -1 ? '🏆 ' : '') + u.faseStr2,
                u.tName, u.color, '', true, u.tId
              ) +
              u.body +
            '</div>';
          });
        }
      });
      html += '</div>';
      html += '</div>';
    }

    if (_collapsibleHasContent) {
      html += '</div>'; // fecha #meus-resultados-body
      // ⭐ corta no 2º `data-mr-block`: dali pra frente é o que a seção fechada
      // esconde. ⛔ Recorta a partir do `<div` que ABRE o bloco (os atributos vêm
      // logo depois de `<div`), senão o HTML sairia partido no meio de uma tag.
      var _mrCorpo = html; html = _mrAntes;
      window._mrExtraPend = '';
      if (_mrCollapsed) {
        var _m1 = _mrCorpo.indexOf('data-mr-block="1"');
        var _m2 = _m1 >= 0 ? _mrCorpo.indexOf('data-mr-block="1"', _m1 + 8) : -1;
        if (_m2 > 0) {
          var _abre = _mrCorpo.lastIndexOf('<div', _m2);
          if (_abre > _m1) {
            var _fecha = _mrCorpo.lastIndexOf('</div>');   // fecha o #meus-resultados-body
            if (_fecha > _abre) {
              window._mrExtraPend = _mrCorpo.slice(_abre, _fecha);
              _mrCorpo = _mrCorpo.slice(0, _abre) + _mrCorpo.slice(_fecha);
            }
          }
        }
      }
      html += _mrCorpo;
      // v1.8.69: o convite pra abrir, igual ao de Novidades. Só existe com 2+ cards —
      // com um só não há "anteriores" e a linha seria ruído.
      if (_mrTotalCards > 1) {
        html += _verMaisRodape('meus-resultados-hint', 'window._toggleMyResultsCollapse()',
          (_mrCollapsed ? _spVerMaisTexto(_mrTotalCards - 1, false) : 'ver menos'));
      }
      html += '</div>'; // fecha #meus-resultados-section
    }
    // v3.1.24: Próximos Jogos (não colapsável) PRIMEIRO, depois Meus Últimos Resultados (colapsável).
    // ── 📣 NOVIDADES NO SEU TORNEIO ──────────────────────────────────────────
    // Os últimos jogos JÁ JOGADOS dos torneios em que o usuário está inscrito, mas
    // de OUTRAS pessoas (os dele já têm as duas seções vizinhas). Ordem cronológica
    // INVERSA do lançamento do resultado — o mais recente no topo. Vem COLAPSADA com
    // apenas o jogo mais recente visível; abrindo, aparecem os anteriores.
    var _novHtml = '';
    if (othersResults.length > 0) {
      // mais recente primeiro. Sem carimbo (torneio antigo — MEDIDO: o BT Corpus
      // Christi não tem nenhum), desempata por rodada e nº do jogo, a mesma régua de
      // "Meus Últimos Resultados". Sem isso a ordem vira a de inserção e a seção
      // mentiria dizendo "mais recente".
      othersResults.sort(function(a, b) {
        if (b.at !== a.at) return b.at - a.at;
        if (b.roundNum !== a.roundNum) return b.roundNum - a.roundNum;
        return b.gameSeq - a.gameSeq;
      });
      var _NOV_MAX = 15;
      var _novTotal = othersResults.length;
      var _novList = othersResults.slice(0, _NOV_MAX);

      var _novCollapsed = true;
      try {
        var _nvPref = localStorage.getItem('scoreplace_collapse_novidades');
        if (_nvPref === '0') _novCollapsed = false;
      } catch (e) {}

      // "há X" — só quando existe carimbo de verdade; inventar tempo é pior que omitir.
      function _agoLabel(ms) {
        if (!ms) return '';
        var d = Date.now() - ms;
        if (d < 0) return '';
        var min = Math.floor(d / 60000);
        if (min < 1) return 'agora há pouco';
        if (min < 60) return 'há ' + min + 'min';
        var h = Math.floor(min / 60);
        if (h < 24) return 'há ' + h + 'h';
        var dias = Math.floor(h / 24);
        return dias === 1 ? 'ontem' : 'há ' + dias + ' dias';
      }

      // ⚠️ O CARD É O DA CHAVE — window.renderMatchCard, o MESMO renderizador do bracket
      // (foto de cada pessoa, os dois blocos de dupla, o "vs" no meio, vencedor em verde e
      // o subplacar do tie-break). Reclamação do dono (13/ago) sobre a 1ª versão: eu tinha
      // escrito um card PRÓPRIO (nome + placar em duas linhas), criando um TERCEIRO visual
      // pra a mesma coisa. `canEnterResult=false` deixa em leitura: medido, sai com ZERO
      // botão e ZERO input — é jogo de outra pessoa, não há o que lançar aqui.
      // Acima do card fica só o contexto que a chave não tem: de QUAL torneio é e QUANDO
      // o resultado saiu (esta seção cruza torneios; a chave é sempre de um só).
      function _novCard(it) {
        var _quando = _agoLabel(it.at);
        // v1.8.78: o contexto "de qual torneio/grupo" saiu daqui e virou o cabeçalho
        // compartilhado de duas linhas, mostrado UMA vez por (grupo + torneio). Aqui
        // sobra só o "quando", que muda de card pra card.
        // ⚠️ MEDIDO no navegador: pôr o "Jogo N" aqui imprimia o número DUAS VEZES,
        // uma coladinha na outra — o próprio card da chave já abre com "JOGO N" (é o
        // `_gameNum` da fonte única). Fica só o carimbo de tempo, que o card não tem.
        // v1.8.67: `{readOnly:true}` — `canEnterResult=false` sozinho NÃO calava os botões
        // de pendência/disputa/W.O., que têm gate próprio por PAPEL: como organizador, o
        // dono via "✏️ Editar" num card fora da chave, e o clique cai num caminho que
        // procura ids que só existem lá.
        // 1.9.109: `dashConsensus` reabre a linha de Confirmar/Contestar/Editar do jogo
        // PENDENTE — pedido do dono: quem podia aprovar tinha que ir ao torneio, e
        // "alguns não entendem isso". Quem vê o quê é a régua de papel do próprio card
        // (adversário / organizador / proponente / em disputa); pra quem não pode agir,
        // nada muda. O resto do card segue em somente-leitura.
        var _card = (typeof window.renderMatchCard === 'function')
          ? window.renderMatchCard(it.m, false, it.tId, (it.m && it.m._gameNum != null) ? it.m._gameNum : null, false, null, { readOnly: true, dashConsensus: true })
          : '';
        return '<div data-nov-card="1"' + _spCard() + ' style="min-width:0;">' +
          (_quando
            ? '<div data-nov-quando="1" style="display:flex;justify-content:flex-end;margin-bottom:5px;padding:0 2px;">' +
                '<span style="font-size:0.64rem;color:var(--sp-c-64748b,#64748b);font-weight:600;">' + _sf(_quando) + '</span>' +
              '</div>'
            : '') + _card +
        '</div>';
      }

      // ⚠️ v1.8.67: A MESMA GRADE de "Seus últimos resultados" — ordem do dono: "se cabe 1
      // jogo na largura da tela é 1 jogo, se cabem 3 são 3". Antes cada card ocupava uma
      // linha inteira (empilhados num `margin-bottom`), então em tela larga sobrava metade
      // da tela vazia enquanto a seção vizinha, com o MESMO conteúdo, usava 3 colunas.
      // `auto-fill` + `minmax(280px,1fr)` é a régua canônica do app.
      // ⚠️ O colapso passou a ser por ATRIBUTO na seção, não por um `<div>` separado com
      // os "anteriores": um wrapper no meio QUEBRA a grade (os cards de dentro dele
      // formariam outra grade, e o primeiro card ficaria sozinho numa linha própria).
      // Com `data-nov-collapsed`, os cards são todos irmãos na MESMA grade e o estado
      // fechado apenas esconde do 2º em diante — a grade reflui sozinha.
      _novHtml += '<div id="novidades-section" data-nov-collapsed="' + (_novCollapsed ? '1' : '0') + '" style="position:relative;scroll-margin-top:var(--scroll-anchor,120px);background:rgba(251,191,36,0.05);border:1px solid rgba(251,191,36,0.18);border-radius:14px;padding:14px 16px;margin-bottom:1rem;">';
      // ⚠️ v1.8.78: o corte do colapso deixou de ser `[data-nov-card]:nth-child(n+2)` e
      // passou a ser "tudo que vem DEPOIS do primeiro card" — mesmo `~` que "Seus últimos
      // resultados" já usa. Com os cabeçalhos de grupo dentro da grade, contar por
      // posição deixaria de fora o cabeçalho do 2º grupo, que ficaria ÓRFÃO na tela
      // fechada (um título anunciando cards que estão escondidos).
      // ── 2.0.44 · SÓ O "VER MENOS" VIAJA; O "VER MAIS" FICA PARADO ───────────────
      // Ordem do dono: _"apenas o ver menos deve scrollar. o ver mais fica fixo."_ E faz
      // sentido: fechada, a seção é curta — não há lista pra percorrer, então flutuar não
      // serve pra nada e ainda tira a etiqueta do lugar onde ela sempre esteve.
      //
      // São DOIS elementos que se revezam por CSS, no mesmo atributo que já governa o
      // aberto/fechado — sem listener, sem re-render:
      //   • ABERTA  → o trilho sticky mostra "ver menos"; a tag do cabeçalho fica
      //     `visibility:hidden`, virando o CALÇO que segura o espaço do título;
      //   • FECHADA → o trilho some e a tag do cabeçalho aparece, "ver mais", parada.
      // Cada uma tem texto FIXO (a que se vê aberta só diz "ver menos"; a que se vê fechada
      // só diz "ver mais"), então não há dois lugares dizendo a mesma coisa e discordando.
      _novHtml += '<style>#novidades-section[data-nov-collapsed="1"] #novidades-grid > [data-sp-extra]{display:none !important;}' +
        '#novidades-section[data-nov-collapsed="1"] [data-nov-extra]{display:none;}' +
        // `!important` porque o trilho carrega `display:flex` INLINE — sem isso a regra não
        // vence e o "ver menos" continuaria flutuando com a seção fechada (medido no
        // navegador: `display` seguia `flex`). Mesmo motivo do `[data-sp-extra]` acima.
        '#novidades-section[data-nov-collapsed="1"] #nov-toggle-rail{display:none !important;}' +
        '#novidades-section[data-nov-collapsed="0"] #nov-toggle-fixo{visibility:hidden;}' +
        // ⚠️ A COMPENSAÇÃO SÓ VALE COM O TRILHO EM CENA. O `<h3>` sobe o tanto que a margem do
        // trilho desce — mas FECHADA o trilho é `display:none` e essa margem não existe: o
        // negativo sobrava e COMIA a margem superior da caixa (bronca do dono, 2.0.44).
        // Por isso ela vive aqui, casada com o estado, e não no `style` do h3.
        // `!important` pelo MESMO motivo do trilho: o `<h3>` carrega `margin:0` INLINE e o
        // inline vence a folha. Sem isso a regra parseia, aparece no CSSOM e o computado sai
        // `0px` — medido. Duas vezes a mesma armadilha nesta seção; está anotada nas duas.
        '#novidades-section[data-nov-collapsed="0"] #nov-h3{margin-top:calc(-1 * ' + _pilulaH + ') !important;}' +
        '</style>';
      // ── 2.0.38 · O "VER MENOS" ACOMPANHA A ROLAGEM — DENTRO DESTA SEÇÃO ─────────
      // Pedido do dono (24/ago/2026): _"esse ver menos da sessão de novidades deve scrollar
      // junto com o scroll da página dentro da sessão. apenas o ver menos e apenas dentro da
      // sessão de novidades."_ Aberta, a seção fica longa: pra fechar era preciso rolar TODA
      // a lista de volta até o cabeçalho.
      //
      // COMO: um TRILHO de altura ZERO (não empurra nada) que é `position:sticky` e mora
      // direto na seção — o alcance de um sticky é o BOX DO PAI, então ele viaja do topo ao
      // fim de #novidades-section e para exatamente onde a seção acaba. Não é `fixed`: fora
      // da seção o botão não existe, que é a metade "apenas dentro da sessão" do pedido.
      // ⛔ O topo é `--scroll-anchor` (topbar + dropdown + back-header + barra sticky + 12px),
      // nunca px cravado — com número fixo metade do botão some sob a barra.
      // [[project_sticky_vertical_usa_scroll_anchor]]
      // O trilho é `pointer-events:none` pra não roubar o toque dos cards por baixo; só a
      // pílula recebe clique. `align-self:flex-start` impede o span de esticar na altura.
      // O id segue sendo `nov-toggle-tag` — quem escreve o texto continua sendo
      // `_spSyncHint` (uma decisão só sobre o que o convite diz).
      // ── 2.0.40 · A PÍLULA PARA COM A MESMA FOLGA EMBAIXO ────────────────────────
      // Correção do dono: _"o ver mais do box de novidades tem uma margem do seu topo ao topo
      // do box. ao rolar até a base da seção deve parar com a mesma margem da sua base à base
      // do box. agora está passando desse ponto."_
      //
      // POR QUÊ PASSAVA: o trilho tem altura ZERO (pra não empurrar o conteúdo), e o sticky só
      // garante que a CAIXA DELE fique dentro do pai. Caixa de altura 0 chega até a base do
      // pai — e a pílula, desenhada a partir dali pra baixo, sai 21px por fora. MEDIDO: 6,4px
      // além da borda do box.
      // A CORREÇÃO: uma margem INFERIOR do tamanho da pílula. O retângulo que prende um sticky
      // é o do pai DESCONTADAS as margens do próprio sticky — então essa margem sobe o limite
      // exatamente uma pílula, e a base dela pousa na base da caixa de conteúdo: a mesma folga
      // do topo (padding + borda), dos dois lados. O `<h3>` puxa o mesmo tanto de volta pra
      // essa margem não abrir buraco nenhum no fluxo (medido: h3 e altura da seção idênticos
      // ao de antes).
      // ⛔ NÃO usar margem NEGATIVA no trilho (foi a 1ª tentativa): ela ESTENDE o retângulo de
      // volta e a pílula torna a passar — medido, os mesmos 6,4px de sobra.
      // A altura da pílula é a caixa dela em rem, não um px cravado: 0.7rem × 1.2 de
      // line-height = 0.84rem, + 3px+3px de padding + 1px+1px de borda. Assim acompanha o
      // --ui-scale como o resto do card. [[feedback_maximize_screen_area_all_devices]]
      var _pilulaH = 'calc(0.84rem + 8px)';
      if (_novList.length > 1) {
        _novHtml += '<div id="nov-toggle-rail" style="position:sticky;top:var(--scroll-anchor,120px);height:0;margin-bottom:' + _pilulaH + ';z-index:6;display:flex;justify-content:flex-end;pointer-events:none;">' +
          _verMaisTag('nov-toggle-tag', _novCollapsed, {
            attrs: ' onclick="window._toggleNovidadesCollapse()" title="Mostrar/ocultar"',
            // só a posição e o gesto: fundo/cor/borda são os do desenho canônico, pra a
            // pílula das Novidades ser IGUAL à de "Seus últimos resultados".
            style: 'pointer-events:auto;cursor:pointer;user-select:none;align-self:flex-start;'
          }) +
        '</div>';
      }
      _novHtml += '<h3 id="nov-h3" onclick="window._toggleNovidadesCollapse()" style="margin:0;' +
        'font-size:0.85rem;font-weight:700;color:var(--sp-c-fbbf24,#fbbf24);letter-spacing:0.04em;text-transform:uppercase;cursor:pointer;display:flex;align-items:center;gap:8px;user-select:none;" title="Mostrar/ocultar">' +
        '📣 Novidades no seu torneio' +
        // ⚠️ O CALÇO. A pílula saiu do fluxo do cabeçalho (foi pro trilho sticky), então o
        // título passou a correr POR BAIXO dela — medido na tela estreita: "NOVIDADES NO SEU
        // TOR|ver menos". Este span invisível ocupa a MESMA caixa e devolve ao título o
        // limite que ele tinha; o texto é sempre "ver menos" (o mais largo dos dois estados),
        // então o calço é um TAMANHO FIXO, não um espelho do estado — nada pra sincronizar.
        // Em `em`/padding, não px: acompanha o --ui-scale como o resto do card.
        (_novList.length > 1
          ? _verMaisTag('nov-toggle-fixo', true, {
              // ⛔ SEM `onclick` PRÓPRIO. Ela mora DENTRO do `<h3>`, que já alterna — dar clique
              // aos dois fazia o toque disparar o dela E subir pro h3: DOIS toggles, e o
              // "ver mais" parecia morto (bronca do dono, 2.0.44). O h3 é a área clicável, ela
              // é só o rótulo. `data-tag-spacer-for`: some junto com a flutuante quando não
              // sobra nada a mostrar. [[feedback_unify_dual_entry_points]]
              attrs: ' data-tag-spacer-for="nov-toggle-tag"',
              style: 'cursor:pointer;user-select:none;'
            })
          : '') +
        '</h3>';
      _spReset();
      _novHtml += '<div id="novidades-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;align-items:start;margin-top:12px;">';
      // v1.8.78: agrupa por (grupo + torneio) preservando a ordem de PRIMEIRA aparição —
      // a mesma regra de "Seus últimos resultados", pra as duas não divergirem. A promessa
      // da seção ("o lançamento mais recente no topo") continua de pé: quem abre cada
      // grupo é o jogo mais recente dele, e os grupos entram na ordem em que apareceram.
      var _novGroups = [], _novGIdx = {};
      _novList.forEach(function(it) {
        var _fp = _splitFase(it.phaseLabel || it.subLine || '');
        var _key = _fp.group.toLowerCase() + '||' + String(it.tName || '').toLowerCase();
        var _can = !!_fp.group;
        if (_can && _novGIdx[_key] != null) { _novGroups[_novGIdx[_key]].items.push({ it: it, jogo: _fp.jogo }); return; }
        if (_can) _novGIdx[_key] = _novGroups.length;
        _novGroups.push({ grupo: _fp.group, tName: it.tName, tId: it.tId, items: [{ it: it, jogo: _fp.jogo }] });
      });
      // ── ⭐ O ESCONDIDO NEM NASCE (2.0.82) ──────────────────────────────────
      // Ordem do dono: _"tem o mostrar mais nos 2. poderia não carregar tudo antes
      // que alguém clicasse no mostrar mais."_ E ele está certo: recolhida, esta
      // seção montava os 15 resultados e deixava 14 em `display:none` esperando um
      // clique que quase nunca vem. MEDIDO na tela dele (1 torneio): a seção sozinha
      // era 639 dos 921 elementos do documento — 69% da tela inicial, invisível.
      // Agora o extra vira TEXTO guardado em memória e só entra no DOM ao abrir.
      // ⛔ O texto guardado é o MESMO que era gerado antes — nada muda na tela
      // depois de expandir; o que muda é QUANDO ele passa a existir.
      var _novVis = '', _novExt = '';
      var _guarda = function (html) {
        // `_spCards` é incrementado DENTRO de _spCard/_spFull enquanto o pedaço é
        // gerado: se antes de gerar já havia card, este pedaço é dos escondidos.
        if (_novAntes > 0) _novExt += html; else _novVis += html;
      };
      var _novAntes = 0;
      _novGroups.forEach(function(g) {
        _novAntes = _spCards;
        _guarda(_grupoHeadHtml(g.grupo, g.tName, '#fbbf24', 'data-nov-head="1"' + _spFull(), false, g.tId));
        g.items.forEach(function(u) { _novAntes = _spCards; _guarda(_novCard(u.it)); });
      });
      _novHtml += _novVis;
      // ⚠️ Só guarda pra depois quando a seção NASCE recolhida. Aberta, tudo entra
      // agora — senão a tela abriria faltando conteúdo.
      // ⛔ O TOTAL PASSA A VIR DAQUI, NÃO DO DOM. `_spSyncCollapsePreview` contava
      // `[data-nov-card]` dentro da grade pra escrever o "ver mais (N)" — e com o
      // extra fora do DOM esse número viraria 0 e o convite mentiria. A suíte pegou
      // isso na hora (novidades-grade-ordem / previa-fechada-preenche-a-linha).
      // Contado no TEXTO gerado: vale com a seção aberta ou fechada.
      window._novTotalCards = ((_novVis + _novExt).match(/data-nov-card/g) || []).length;
      if (_novCollapsed) { window._novExtraPend = _novExt; }
      else { _novHtml += _novExt; window._novExtraPend = ''; }
      _novHtml += '</div>';
      // teto DECLARADO — seção que corta em silêncio faz o usuário achar que viu tudo
      if (_novTotal > _NOV_MAX) {
        _novHtml += '<p data-nov-extra="1" style="margin:8px 0 0;font-size:0.68rem;color:var(--sp-c-64748b,#64748b);text-align:center;">' +
          'mostrando os ' + _NOV_MAX + ' mais recentes de ' + _novTotal + '</p>';
      }
      if (_novList.length > 1) {
        // v1.8.78: sem as setinhas (o dono achou o glifo discreto demais) e no mesmo
        // azul-céu da tag do cabeçalho — é o MESMO controle, em dois lugares.
        _novHtml += _verMaisRodape('novidades-hint', 'window._toggleNovidadesCollapse()',
          (_novCollapsed ? _spVerMaisTexto(_novList.length - 1, true) : 'ver menos'));
      }
      _novHtml += '</div>'; // fecha #novidades-section
    }

    return _upHtml + _novHtml + html;
  }

  const curFilter = window._dashFilter || 'todos';
  const curSport = window._dashSport || '';
  const curLocation = window._dashLocation || '';
  const curFormat = window._dashFormat || '';
  // v3.0.91: estado da barra canônica de torneios.
  const curGender = window._dashGender || 'all';
  const curSort = window._dashSort || 'order-desc';
  const _isDefaultSort = (curSort === 'order-desc');
  // Curadoria (faixas Em andamento/Aguardando/Favoritos + seções extras de descoberta)
  // só quando NÃO há filtro secundário ativo (modalidade/local/formato/gênero) E o sort
  // está no padrão cronológico. Sort/gênero explícitos → grade plana ordenada/filtrada.
  const _dashCurated = (curGender === 'all') && _isDefaultSort;
  // Gênero do TORNEIO = suas categorias de gênero (pedido do usuário). 'Masc'/'Fem' →
  // tem categoria daquele gênero; 'none' → torneio sem categoria de gênero alguma.
  const _tournGenderMatch = function(t, g) {
    if (!g || g === 'all') return true;
    var cats = [];
    if (Array.isArray(t.genderCategories)) cats = cats.concat(t.genderCategories);
    if (Array.isArray(t.combinedCategories)) cats = cats.concat(t.combinedCategories);
    var canon = cats.map(function(c){ return window._canonGender ? window._canonGender(c) : ''; });
    if (g === 'none') return canon.filter(function(c){ return c === 'Masc' || c === 'Fem' || c === 'Misto'; }).length === 0;
    return canon.indexOf(g) !== -1;
  };
  const _dashDateKey = function(t){ var d = t.startDate || t.registrationLimit || t.endDate; var ms = d ? new Date(d).getTime() : 0; return isNaN(ms) ? 0 : ms; };

  // EXPLORAR: o modo em que a régua do círculo é desligada e a plataforma inteira
  // aparece. É um MODO, não um filtro a mais — por isso mora ao lado de curFilter.
  const _explorando = (curFilter === 'explorar');

  // ── v1.8.89: TODOS / INSCRIÇÕES ABERTAS / ENCERRADOS = A PLATAFORMA INTEIRA ──
  // Ordem do dono: "aqui deve ser todos os que tem na plataforma, mesmo encerrados,
  // mesmo ocultos e mesmo de outros organizadores" — e, na sequência, o mesmo para
  // "inscrições abertas" e para "encerrados".
  //
  // Os três liam pools do USUÁRIO (organizados / participando / abertos-pra-você), e
  // esses saem de `visible` — que já vem com os OCULTOS removidos (v2.8.40) e é
  // escopado ao uid pelo listener em tempo real. Daí o contador marcar 3 num app com
  // dezenas de torneios: não era contagem errada, era a FONTE errada.
  //
  // Aqui o pool é a UNIÃO do que o usuário enxerga com a descoberta pública, ambos nas
  // versões CRUAS (`_allVisibleRaw` / `_discoveryRaw`, sem o corte de ocultos).
  // ⚠️ "Ocultar" continua valendo onde ele foi feito pra valer — nas seções curadas da
  // tela e na lista padrão —, mas não pode esconder nada de quem pediu explicitamente
  // TODOS. Esconder ali seria a tela contradizendo o próprio rótulo.
  const _poolPlataforma = (function () {
    const vistos = new Set(); const out = [];
    [].concat(_allVisibleRaw || [], _discoveryRaw || []).forEach(function (t) {
      if (!t || t.id == null) return;
      const k = String(t.id);
      if (vistos.has(k)) return;
      vistos.add(k); out.push(t);
    });
    return out;
  })();
  // v1.8.90: a LISTA mostra o pool sem os ocultos; os ocultos vão para a seção
  // "Torneios ocultados" (colapsável), que é onde o dono quer vê-los. Eles seguem
  // dentro de _poolPlataforma — ou seja, continuam CONTANDO como parte da
  // plataforma —, só não se misturam na lista.
  const _poolVisivel = _poolPlataforma.filter(function (t) { return t && !_hidSet[String(t.id)]; });

  // ── v1.8.90: os NÚMEROS dos pills contam a PLATAFORMA, não o pool do usuário ──
  // Os ocultos entram na conta: eles continuam na tela (na seção "Torneios
  // ocultados"), então contá-los não promete nada que a tela não entregue. O que
  // não pode é o pill dizer 3 quando existem 16 — o rótulo é "Todos".
  const _todosCount = _poolPlataforma.length;
  /* ⭐ 2.0.96 — quantos são DO SEU CÍRCULO. O pill padrão passa a contar isto; o total da
   * plataforma continua na tela, no pill Explorar (ordem do dono: "na dashboard deve
   * aparecer o número total de torneios na plataforma"). Assim a pessoa vê "4 pra você ·
   * 39 na plataforma" e sabe que o resto está a um toque. */
  const _circCtx = { locais: _dashLocaisFavoritos(), amigos: _dashAmigos() };
  const _circuloCount = _poolPlataforma.filter(function (t) { return window._ehDoMeuCirculo(t, _circCtx); }).length;
  const _abertosCount = _poolPlataforma.filter(_isOpenEnrollment).length;
  const _encerradosPillCount = _poolPlataforma.filter(t => t && t.status === 'finished').length;

  // Favorites count
  const favIds = typeof window._getFavorites === 'function' ? window._getFavorites() : [];
  const favoritosCount = allUnique.filter(t => favIds.indexOf(String(t.id)) !== -1).length;

  // Count finished tournaments
  const encerradosCount = allUnique.filter(t => t.status === 'finished').length;

  // Apply main filter
  let filtered = [];
  if (curFilter === 'organizados') filtered = [...organizadosSorted];
  else if (curFilter === 'participando') filtered = [...participacoesSorted];
  // v1.8.89: inscrições abertas de QUALQUER organizador, ocultos incluídos.
  // A regra de "aberto" continua sendo a canônica (_enrollmentOpenState, fonte única
  // desde a 1.8.40) — aqui muda só o CONJUNTO em que ela é aplicada.
  else if (curFilter === 'abertos') filtered = _poolVisivel.filter(_isOpenEnrollment).sort(sortByUrgency);
  else if (curFilter === 'favoritos') {
    const seen = new Set();
    [...organizadosSorted, ...participacoesSorted, ...abertosParaVoce].forEach(t => {
      if (!seen.has(t.id) && favIds.indexOf(String(t.id)) !== -1) { seen.add(t.id); filtered.push(t); }
    });
    filtered.sort(sortByRecency); // Favoritos: mais recente primeiro
  } else if (curFilter === 'encerrados') {
    // v1.8.89: encerrados da plataforma inteira, de outros organizadores e ocultos.
    filtered = _poolVisivel.filter(t => t && t.status === 'finished');
    filtered.sort(sortByRecency); // Encerrados: mais recente primeiro
  } else {
    // v1.8.89: TODOS = a plataforma inteira. Os próprios do usuário vêm primeiro
    // (são os que ele age em cima); o resto da plataforma vem depois.
    const seen = new Set();
    [...organizadosSorted, ...participacoesSorted, ...abertosParaVoce, ...encerradosVisiveis].forEach(t => {
      if (!seen.has(t.id)) { seen.add(t.id); filtered.push(t); }
    });
    _poolVisivel.forEach(t => { if (t && !seen.has(t.id)) { seen.add(t.id); filtered.push(t); } });
    /* ⭐ 2.0.96 — A LISTA PADRÃO É O CÍRCULO DA PESSOA, não a plataforma inteira.
     * Ver `_ehDoMeuCirculo`: organizo/participo, convite, local favorito ou de amigo.
     * O EXPLORAR (`curFilter === 'explorar'`) desliga esta régua e mostra tudo — é lá
     * que a pessoa filtra como quiser (modalidade, local, data).
     * ⛔ Só a lista PADRÃO é filtrada. Os pills explícitos (organizados, participando,
     * favoritos, encerrados, abertos) são pedido direto da pessoa: cortar ali seria a
     * tela contradizendo o botão que ela acabou de apertar.
     * ⛔ E OCULTAR CONTINUA VALENDO por cima disto (`_poolVisivel` já vem sem os ocultos,
     * e a seção "Torneios ocultados" segue no fim) — ordem do dono. */
    if (!_explorando) {
      const _ctxCirc = { locais: _dashLocaisFavoritos(), amigos: _dashAmigos() };
      filtered = filtered.filter(function (t) { return window._ehDoMeuCirculo(t, _ctxCirc); });
    }
    filtered.sort(sortByDate);
  }

  // Apply secondary filters
  if (curSport === '__fav__') {
    var _favSports = _dashPrefSports();
    if (_favSports.length > 0) filtered = filtered.filter(t => _favSports.indexOf(cleanSportName(t.sport)) !== -1);
  } else if (curSport) {
    filtered = filtered.filter(t => cleanSportName(t.sport) === curSport);
  }
  if (curLocation) filtered = filtered.filter(t => t.venueName === curLocation);
  if (curFormat) filtered = filtered.filter(t => t.format === curFormat);
  // v3.0.91: filtro de gênero (categorias do torneio) + ordenação explícita da barra.
  if (curGender && curGender !== 'all') filtered = filtered.filter(t => _tournGenderMatch(t, curGender));
  if (!_isDefaultSort) {
    if (curSort === 'name-asc') filtered.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'));
    else if (curSort === 'name-desc') filtered.sort((a, b) => String(b.name || '').localeCompare(String(a.name || ''), 'pt-BR'));
    else if (curSort === 'order-asc') filtered.sort((a, b) => _dashDateKey(a) - _dashDateKey(b));
  }

  // v2.1.54: torneios EM ANDAMENTO (seus + públicos de descoberta) saem das suas
  // posições normais e viram duas faixas:
  //   • TOPO  → só os que "acontecem esta semana": começaram nos últimos 7 dias
  //             OU terminam nos próximos 7 dias (inclui hoje).
  //   • RODAPÉ → os demais em andamento (ex.: rodando há 25 dias, sem término
  //             próximo) ficam numa seção "Em andamento" lá embaixo.
  // Só no filtro 'todos' sem filtros secundários. Removidos da lista principal e
  // da seção de descoberta pra não duplicar.
  let runningBandHtml = '';
  let runningBottomHtml = '';
  if (curFilter === 'todos' && !curSport && !curLocation && !curFormat && _dashCurated) {
    const _WK_MS = 7 * 86400000;
    const _nowMsBand = Date.now();
    const _runsThisWeek = function(t) {
      // começou nos últimos 7 dias?
      var st = t.tournamentStarted ? (+t.tournamentStarted) : null;
      if (st != null && !isNaN(st)) {
        var sinceStart = _nowMsBand - st;
        if (sinceStart >= 0 && sinceStart <= _WK_MS) return true;
      }
      // termina nos próximos 7 dias (inclui hoje)? — fim da ÚLTIMA fase (v1.6.83)
      var _etRaw = window._tournamentEndDate ? window._tournamentEndDate(t) : t.endDate;
      if (_etRaw) {
        var et = new Date(_etRaw).getTime();
        if (!isNaN(et)) {
          var untilEnd = et - _nowMsBand;
          if (untilEnd >= 0 && untilEnd <= _WK_MS) return true;
        }
      }
      return false;
    };
    const _bandSeen = new Set();
    const _allRunning = [];
    filtered.forEach(function(t) {
      if (_isRunning(t) && !_bandSeen.has(String(t.id))) { _bandSeen.add(String(t.id)); _allRunning.push(t); }
    });
    (discoveryByCategory.inProgress || []).forEach(function(t) {
      if (!_bandSeen.has(String(t.id))) { _bandSeen.add(String(t.id)); _allRunning.push(t); }
    });
    if (_allRunning.length) {
      // remove TODOS os em andamento da lista principal e zera a seção de descoberta
      filtered = filtered.filter(function(t) { return !(_isRunning(t) && _bandSeen.has(String(t.id))); });
      discoveryByCategory.inProgress = [];
      const _top = _allRunning.filter(_runsThisWeek).sort(sortByRecency);       // Em andamento: mais recente primeiro
      const _bottom = _allRunning.filter(function(t) { return !_runsThisWeek(t); }).sort(sortByRecency);
      const _sectionHtml = function(title, items, marginTop) {
        return '<div style="' + (marginTop ? 'margin-top:1.25rem;' : 'margin-bottom:1.25rem;') + '">' +
            '<div style="font-weight:800;font-size:0.95rem;color:var(--sp-c-10b981,#10b981);margin-bottom:0.6rem;border-left:3px solid #10b981;padding-left:10px;">' + title + ' <span style="font-weight:500;color:var(--text-muted);font-size:0.78rem;">(' + items.length + ')</span></div>' +
            _renderTGroup(items) +
          '</div>';
      };
      if (_top.length) runningBandHtml = _sectionHtml('🟢 Em andamento (esta semana)', _top, false);
      if (_bottom.length) runningBottomHtml = _sectionHtml('🟢 Em andamento', _bottom, true);
    }
  }

  // Torneios com sorteio feito mas ainda não iniciados pelo organizador.
  // Aparecem entre "Em andamento (esta semana)" e "Favoritos". Removidos do
  // filtrado principal para não duplicar.
  let awaitingStartHtml = '';
  if (curFilter === 'todos' && !curSport && !curLocation && !curFormat && _dashCurated) {
    const _hasDraw2 = function(t) {
      return (Array.isArray(t.matches) && t.matches.length > 0) ||
             (Array.isArray(t.rounds) && t.rounds.length > 0) ||
             (Array.isArray(t.groups) && t.groups.length > 0);
    };
    const _awaitList = filtered.filter(function(t) {
      if (t.status === 'finished' || t.status === 'closed') return false;
      if (_isRunning(t)) return false;
      if (!_hasDraw2(t)) return false;
      var started = !!(t.tournamentStarted || t.status === 'in_progress' || t.status === 'active' || t.status === 'started');
      return !started;
    });
    if (_awaitList.length) {
      _awaitList.sort(sortByDate);
      const _awaitIds = new Set(_awaitList.map(function(t) { return String(t.id); }));
      filtered = filtered.filter(function(t) { return !_awaitIds.has(String(t.id)); });
      awaitingStartHtml =
        '<div style="margin-bottom:1.25rem;">' +
          '<div style="font-weight:800;font-size:0.95rem;color:var(--sp-c-f59e0b,#f59e0b);margin-bottom:0.6rem;border-left:3px solid #f59e0b;padding-left:10px;">⏳ Sorteados — aguardando início <span style="font-weight:500;color:var(--text-muted);font-size:0.78rem;">(' + _awaitList.length + ')</span></div>' +
          _renderTGroup(_awaitList) +
        '</div>';
    }
  }

  // v2.1.56: logo ABAIXO da faixa "Em andamento (esta semana)" do topo, os
  // FAVORITOS (coração acionado) que ainda não estão em andamento. Removidos da
  // lista principal pra não duplicar. Só no filtro 'todos' sem filtros secundários.
  let favoritesBandHtml = '';
  if (curFilter === 'todos' && !curSport && !curLocation && !curFormat && _dashCurated) {
    const _favIds = (typeof window._getFavorites === 'function') ? window._getFavorites() : [];
    if (_favIds && _favIds.length) {
      const _favSet = new Set(_favIds.map(String));
      const _favList = filtered.filter(function(t) { return _favSet.has(String(t.id)) && t.status !== 'finished'; });
      if (_favList.length) {
        _favList.sort(sortByRecency); // faixa Favoritos: mais recente primeiro
        filtered = filtered.filter(function(t) { return !(_favSet.has(String(t.id)) && t.status !== 'finished'); });
        favoritesBandHtml =
          '<div style="margin-bottom:1.25rem;">' +
            '<div style="font-weight:800;font-size:0.95rem;color:var(--sp-c-fb7185,#fb7185);margin-bottom:0.6rem;border-left:3px solid #fb7185;padding-left:10px;">❤️ Favoritos <span style="font-weight:500;color:var(--text-muted);font-size:0.78rem;">(' + _favList.length + ')</span></div>' +
            _renderTGroup(_favList) +
          '</div>';
      }
    }
  }

  // ── v1.8.92: ENCERRADO NUNCA DIVIDE LISTA COM EM ANDAMENTO ──────────────────
  // Ordem do dono: "os encerrados nao devem aparecer com os em andamento (mesmo na
  // lista)." Ele estava vendo, logo abaixo da faixa "Em andamento (1)", três cards
  // marcados "Encerrado" na lista principal.
  //
  // A CAUSA É DE DESENHO, não um `if` errado: essa extração existia em TRÊS lugares,
  // cada um com um gate próprio — o ramo "todos" (gated em `encerradosCount > 0` e em
  // não haver filtro secundário), o ramo de "organizados/participando" (outro gate), e
  // nenhum para o resto. Basta um dos gates não fechar e o encerrado volta pra lista.
  // É a mesma classe do contador do sino: consertar um lugar e deixar o irmão.
  //
  // Aqui vira UMA regra só, aplicada ANTES de qualquer ramo de render: quem está
  // encerrado sai de `filtered` e vai para a seção própria. A única exceção é o filtro
  // "encerrados" — ali a lista É de encerrados, e extraí-los esvaziaria a tela.
  const _isRecentlyFinished = function (t) {
    // Encerrado há menos de 12h continua na lista principal de propósito (v2.1.48):
    // é a janela em que todo mundo quer ver o resultado/pódio fresco. Sem `finishedAt`
    // (dado legado) trata como antigo — na dúvida, vai pra seção.
    if (!t || t.status !== 'finished') return false;
    var fa = t.finishedAt ? new Date(t.finishedAt).getTime() : 0;
    if (!fa || isNaN(fa)) return false;
    return (Date.now() - fa) < 12 * 60 * 60 * 1000;
  };
  let _encerradosExtraidos = [];
  if (curFilter !== 'encerrados') {
    _encerradosExtraidos = filtered.filter(function (t) {
      return t && t.status === 'finished' && !_isRecentlyFinished(t);
    });
    if (_encerradosExtraidos.length) {
      var _encSet = new Set(_encerradosExtraidos.map(function (t) { return String(t.id); }));
      filtered = filtered.filter(function (t) { return !_encSet.has(String(t.id)); });
      _encerradosExtraidos.sort(sortByRecency); // mais recente primeiro
    }
  }

  // Pagination — show N items initially, with "load more" button
  const PAGE_SIZE = 12;
  const pageNum = window._dashPage || 1;
  const totalFiltered = filtered.length;

  // Separate active and finished when showing "Todos"
  let filteredHtml = '';
  // v4.4.x: a seção "Torneios Encerrados" é EXTRAÍDA da lista principal e renderizada só DEPOIS
  // do runningBottomHtml ("Em andamento" que não é desta semana) — encerrado só fica na frente
  // dos OCULTADOS (pedido do dono). Assim o de casais (em andamento) vem ANTES dos encerrados.
  let finishedSectionHtml = '';
  // v1.8.92: a seção de encerrados é montada UMA vez, para QUALQUER filtro (menos o
  // próprio "encerrados", onde não há extração). Antes ela só existia no ramo "todos",
  // e em "organizados"/"participando" havia uma segunda montagem, parecida mas separada
  // — duas versões do mesmo bloco que divergem na primeira mudança.
  (function () {
    const finishedList = _encerradosExtraidos;
    if (finishedList.length > 0) {
      // Separate: user's finished tournaments first, then others
      // v1.8.94: TUDO o que monta card fica dentro do fechamento — o custo só é
      // pago se o bloco abrir. Antes o `finishedCards` já vinha pronto e o adiamento
      // teria economizado só a inserção, que é a parte barata.
      var _abertoEnc = _dashDetailsAberto('scoreplace_dash_finished_open', false);
      var _montaEnc = function () {
      var _cu = window.AppStore.currentUser;
        var myFinished = finishedList.filter(function(t) {
          if (!_cu) return false;
          if (_cu.uid && t.creatorUid && t.creatorUid === _cu.uid) return true;
          // ⛔ e-mail não identifica organizador (cânone do dono) — só o uid, acima.
          // v3.0.x (Parte 10 uid sweep): inscrição via helper canônico uid-first + slot-aware
          // (p1Uid/p2Uid). Antes checava só p.uid top-level → o p2 de uma dupla (uid em p2Uid,
          // displayName = só o nome do p1) caía em "outros encerrados" em vez de "seus".
          if (typeof window._isUserEnrolledInTournament === 'function') return window._isUserEnrolledInTournament(_cu, t);
          return false;
        });
        var otherFinished = finishedList.filter(function(t) { return myFinished.indexOf(t) === -1; });
        var finishedCards = '';
        if (myFinished.length > 0) {
          finishedCards += '<div style="font-size:0.78rem;font-weight:700;color:var(--text-bright);margin-bottom:8px;opacity:0.85;">🏆 ' + _t('dashboard.yourFinished', {count: myFinished.length}) + '</div>';
          finishedCards += '<div style="margin-bottom:1rem;">' + _renderTGroup(myFinished) + '</div>';
        }
        if (otherFinished.length > 0) {
          if (myFinished.length > 0) finishedCards += '<div style="font-size:0.72rem;font-weight:600;color:var(--text-muted);margin-bottom:8px;opacity:0.7;">' + _t('dashboard.otherFinished', {count: otherFinished.length}) + '</div>';
          finishedCards += _renderTGroup(otherFinished);
        }
        var _abertoEnc = _dashDetailsAberto('scoreplace_dash_finished_open', false);
        return finishedCards;
      };
      finishedSectionHtml = '<div style="margin-top:1.25rem;"><details' + _dashDetailsAttr('scoreplace_dash_finished_open', false, 'enc') + '><summary style="cursor:pointer;font-weight:700;font-size:0.9rem;color:var(--text-muted);padding:8px 0;user-select:none;">' + _t('dashboard.finishedSection', {count: finishedList.length}) + '</summary><div style="margin-top:0.75rem;">' + _dashLazyBody('enc', _abertoEnc, _montaEnc) + '</div></details></div>';
    }
  })();

  // ── v1.8.93: "Nenhum torneio encontrado" só quando a TELA está mesmo vazia ──
  // Relato do dono (modo Lista): "essa de nenhum torneio encontrado nao deveria estar
  // ai. esta mostrando torneio, como assim nenhum encontrado."
  // A lista principal pode ficar legitimamente vazia com a tela CHEIA — as bandas
  // (Em andamento / Favoritos / Aguardando), a seção de Encerrados e a de Ocultados
  // são renderizadas FORA dela. O aviso de vazio precisa olhar a tela inteira, não só
  // o próprio bloco; era uma condição por ramo, e o modo Lista nem tinha condição.
  const _telaTemOutroConteudo = !!(runningBandHtml || runningBottomHtml ||
    favoritesBandHtml || awaitingStartHtml || finishedSectionHtml ||
    (hiddenTournaments && hiddenTournaments.length));
  const _vazioHtml = _telaTemOutroConteudo ? ''
    : '<div style="text-align:center;padding:1rem;color:var(--text-muted);opacity:0.6;">' + _t('tournament.emptyState') + '</div>';

  if (curFilter === 'todos' && !curSport && !curLocation && !curFormat) {
    // Os encerrados já saíram de `filtered`; aqui é só paginação da lista ativa.
    const activeList = filtered;
    const visibleActive = activeList.slice(0, pageNum * PAGE_SIZE);
    filteredHtml = visibleActive.length > 0
      ? visibleActive.map(t => renderTournamentCard(t, '')).join('')
      : _vazioHtml;
    if (activeList.length > visibleActive.length) {
      filteredHtml += '<div style="grid-column:1/-1;text-align:center;padding:1rem;"><button onclick="window._dashPage=(window._dashPage||1)+1;window._dashRerender();" class="btn hover-lift" style="background:rgba(99,102,241,0.15);color:var(--sp-c-a5b4fc,#a5b4fc);border:1px solid rgba(99,102,241,0.3);border-radius:12px;padding:10px 28px;font-weight:600;font-size:0.85rem;cursor:pointer;">' + _t('dashboard.loadMore', {count: activeList.length - visibleActive.length}) + '</button></div>';
    }
  } else {
    // When viewing "encerrados" filter, sort user's tournaments first
    var _sortedFiltered = filtered;
    if (curFilter === 'encerrados' && window.AppStore.currentUser) {
      var _cu2 = window.AppStore.currentUser;
      var _isMine = function(t) {
        if (_cu2.uid && t.creatorUid && t.creatorUid === _cu2.uid) return true;
        // ⛔ e-mail não identifica organizador (cânone do dono) — só o uid, acima.
        // v3.0.x (Parte 10 uid sweep): uid-first + slot-aware via helper canônico.
        if (typeof window._isUserEnrolledInTournament === 'function') return window._isUserEnrolledInTournament(_cu2, t);
        return false;
      };
      var _myEnc = filtered.filter(_isMine);
      var _otherEnc = filtered.filter(function(t) { return !_isMine(t); });
      _sortedFiltered = _myEnc.concat(_otherEnc);
    }
    // v1.8.92: aqui morava uma SEGUNDA extração de encerrados (v2.2.7), só para
    // "organizados"/"participando", montando uma seção própria e parecida. Ela foi
    // removida junto com a variável que a carregava: a regra agora é única e roda lá
    // em cima, para todo filtro. Era a divergência entre as duas que deixava encerrado
    // na lista quando um dos gates não fechava.
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
          '<div style="font-size:1.15rem;font-weight:800;color:var(--text-bright);margin-bottom:6px;">Seja ' + (window._welcomeWord ? window._welcomeWord().toLowerCase() : 'bem-vindo') + ' ao scoreplace!</div>' +
          '<div style="font-size:0.88rem;color:var(--text-muted);max-width:520px;margin:0 auto 1.25rem auto;line-height:1.5;">Aqui você organiza torneios, joga partidas casuais com placar ao vivo, descobre quadras próximas e marca presença, e acompanha seus amigos. Comece por um dos caminhos abaixo:</div>' +
          '<div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;max-width:600px;margin:0 auto;">' +
            '<button class="btn hover-lift" onclick="if(typeof window._openCasualMatch===\'function\')window._openCasualMatch()" style="background:linear-gradient(135deg,#38bdf8,#0ea5e9);color:#fff;border:none;font-weight:700;padding:10px 18px;font-size:0.85rem;border-radius:10px;">⚡ Partida Casual</button>' +
            '<button class="btn hover-lift" onclick="if(typeof openModal===\'function\')openModal(\'modal-quick-create\')" style="background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;font-weight:700;padding:10px 18px;font-size:0.85rem;border-radius:10px;">🏆 Criar torneio</button>' +
            '<button class="btn hover-lift" title="Procure lugares para seus jogos e marque presença" onclick="window.location.hash=\'#place\'" style="background:linear-gradient(135deg,#FFD700,#DAA520);color:#1a0f00;border:none;font-weight:800;padding:10px 18px;font-size:0.85rem;border-radius:10px;">📍 Presença</button>' +
            '<button class="btn hover-lift" onclick="window.location.hash=\'#explore\'" style="background:rgba(99,102,241,0.2);color:var(--sp-c-a5b4fc,#a5b4fc);border:1px solid rgba(99,102,241,0.4);font-weight:700;padding:10px 18px;font-size:0.85rem;border-radius:10px;">👥 Encontrar amigos</button>' +
          '</div>' +
          '<div style="margin-top:1.25rem;font-size:0.78rem;color:var(--text-muted);">Dica: se já existe um torneio público na sua cidade, ele vai aparecer aqui automaticamente.</div>' +
        '</div>';
    } else {
      filteredHtml = (runningBandHtml || runningBottomHtml || favoritesBandHtml || awaitingStartHtml) ? '' : '<div style="text-align:center;padding:2rem;color:var(--text-muted);opacity:0.6;">' + _t('tournament.emptyState') + '</div>';
    }
    if (_sortedFiltered.length > visibleItems.length) {
      filteredHtml += '<div style="grid-column:1/-1;text-align:center;padding:1rem;"><button onclick="window._dashPage=(window._dashPage||1)+1;window._dashRerender();" class="btn hover-lift" style="background:rgba(99,102,241,0.15);color:var(--sp-c-a5b4fc,#a5b4fc);border:1px solid rgba(99,102,241,0.3);border-radius:12px;padding:10px 28px;font-weight:600;font-size:0.85rem;cursor:pointer;">' + _t('dashboard.loadMore', {count: _sortedFiltered.length - visibleItems.length}) + '</button></div>';
    } else if (curFilter === 'abertos' && window.AppStore && window.AppStore._publicDiscoveryHasMore) {
      // When viewing the public discovery feed and the client has rendered
      // everything loaded, offer to fetch the next server page via cursor.
      filteredHtml += '<div style="grid-column:1/-1;text-align:center;padding:1rem;"><button onclick="window._loadMoreDiscovery()" class="btn hover-lift" style="background:rgba(16,185,129,0.15);color:var(--sp-c-6ee7b7,#6ee7b7);border:1px solid rgba(16,185,129,0.3);border-radius:12px;padding:10px 28px;font-weight:600;font-size:0.85rem;cursor:pointer;">🔍 ' + _t('dashboard.discoverMore') + '</button></div>';
    }
    // Seção de encerrados para filtros organizados/participando (v2.2.7)
  }

  // v2.8.43: pills de modalidade/local/formato removidas (substituídas pelo filtro
  // cíclico + busca na barra sticky). Os _apply* continuam definidos (usados pelo cíclico).

  // v2.8.43: pills de modalidade/formato/local REMOVIDAS do topo — substituídas pelo
  // filtro cíclico de modalidade + busca na barra sticky abaixo (pedido do usuário).
  const filterBarHtml = '';

  // Build compact list view
  // v2.8.81: function declaration (hoisted) pra que as BANDAS (Em andamento,
  // Favoritos, Aguardando, Encerrados — definidas acima) também possam renderizar
  // em lista quando o toggle "Lista" está ativo, via _renderTGroup.
  function _buildCompactList(items) {
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
      var hasDraw = window._cardTemChave(t);
      if (isFinished) { statusText = _t('status.finished'); statusColor = '#94a3b8'; }
      else if (tournamentStarted) { statusText = _t('status.active'); statusColor = '#4ade80'; }
      else if (isClosed) { statusText = _t('status.closed'); statusColor = '#fca5a5'; }
      else { statusText = _t('status.open'); statusColor = '#60a5fa'; }
      // CANÔNICO: PESSOAS inscritas (dupla=2), não entradas. Ver _countCompetitors.
      // v2.0.77: pelos acessadores (resumo leve OU documento completo, mesmo número).
      var pCount = window._cardCompetidores(t).people;
      var prog = window._cardProgresso(t);
      var dateStr = '';
      if (t.startDate) { try { dateStr = new Date(t.startDate).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }); } catch(e) {} }
      var isFav = typeof window._isFavorite === 'function' && window._isFavorite(t.id);

      var _lt = (document.documentElement.getAttribute('data-theme') === 'light');
      var _rowBg = _lt ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.03)';
      var _rowBgH = _lt ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.07)';
      var _rowBd = _lt ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.05)';
      var statusBadgeBgRgb = statusColor === '#4ade80' ? '16,185,129' : statusColor === '#60a5fa' ? '96,165,250' : '148,163,184';
      // A linha compacta é um <a> de verdade (o href navega sozinho); aqui só entra o
      // "Abrindo o torneio…" — a espera depois do toque é a MESMA do card grande.
      return '<a href="#tournaments/' + t.id + '" class="compact-row" data-search-blob="' + window._safeHtml(window._tournamentSearchBlob ? window._tournamentSearchBlob(t) : '') + '" style="display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:10px;background:' + window._spCor(_rowBg, 'background') + ';border:1px solid ' + window._spCor(_rowBd, 'borda') + ';text-decoration:none;color:inherit;transition:background 0.2s;" onclick="event.preventDefault();if(window._navTorneioComAviso)window._navTorneioComAviso(\'' + String(t.id).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + '\', event);else window.location.hash=\'#tournaments/' + t.id + '\';" onmouseover="this.style.background=\'' + _rowBgH + '\'" onmouseout="this.style.background=\'' + _rowBg + '\'">' +
        // 1.9.50: `src` vazio + marca — o hidratador põe a base64 depois que a linha
        // existe. Antes, cada linha carregava até 111 KB de texto dentro do HTML.
        (window._tourLogoSrc(t) ? '<img data-tlogo-tid="' + window._safeHtml(String(t.id)) + '" alt="" class="compact-logo" style="width:36px;height:36px;border-radius:' + window._tournamentLogoRadius(t) + ';object-fit:cover;flex-shrink:0;">' : '<div class="compact-logo" style="width:36px;height:36px;border-radius:8px;background:rgba(99,102,241,0.2);display:flex;align-items:center;justify-content:center;font-size:1rem;flex-shrink:0;">' + (getSportIcon(t.sport)) + '</div>') +
        '<div class="compact-info" style="flex:1;min-width:0;display:flex;align-items:center;gap:12px;">' +
          '<div class="compact-name-block" style="flex:1;min-width:0;">' +
            '<div style="font-weight:600;font-size:0.88rem;color:var(--text-bright);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + (isFav ? '❤️ ' : '') + window._safeHtml(t.name) + '</div>' +
            '<div class="compact-details" style="font-size:0.7rem;color:var(--text-muted);display:flex;gap:8px;margin-top:2px;flex-wrap:wrap;">' +
              '<span>' + (t.sport || '—') + '</span>' +
              '<span>' + ((window._formatLabel ? window._formatLabel(t) : t.format) || '—') + '</span>' +
              (dateStr ? '<span>' + dateStr + '</span>' : '') +
            '</div>' +
          '</div>' +
          '<div class="compact-badges" style="display:flex;align-items:center;gap:8px;flex-shrink:0;">' +
            (t.isSandbox ? '<span style="font-size:0.62rem;font-weight:700;padding:2px 6px;border-radius:5px;background:#b91c1c;color:#fff;letter-spacing:0.5px;white-space:nowrap;">🧪 SB</span>' : '') +
            '<span style="font-size:0.7rem;color:var(--text-muted);">👤 ' + pCount + '</span>' +
            (hasDraw && !isFinished ? '<span style="font-size:0.7rem;color:' + window._spCor((prog.pct === 100 ? '#10b981' : '#f59e0b'), 'color') + ';">' + prog.pct + '%</span>' : '') +
            '<span style="font-size:0.68rem;font-weight:600;padding:3px 8px;border-radius:6px;background:rgba(' + statusBadgeBgRgb + ',0.15);color:' + window._spCor(statusColor, 'color') + ';white-space:nowrap;">' + statusText + '</span>' +
            (isOrg ? '<span style="font-size:0.65rem;padding:2px 6px;border-radius:4px;background:rgba(251,191,36,0.15);color:var(--sp-c-fbbf24,#fbbf24);">' + _t('auth.orgShort') + '</span>' : '') +
          '</div>' +
        '</div>' +
      '</a>';
    }).join('') + '</div>';
  }

  // v2.8.81: renderiza um GRUPO de torneios respeitando o toggle Lista/Cards —
  // lista compacta quando _dashView==='compact', senão grid de cards. Usado por
  // TODAS as bandas (Em andamento/Favoritos/Aguardando/Encerrados) + lista principal.
  function _renderTGroup(items) {
    if (window._dashView === 'compact') return '<div class="compact-list">' + _buildCompactList(items) + '</div>';
    return '<div class="cards-grid">' + (items || []).map(function(t) { return renderTournamentCard(t, ''); }).join('') + '</div>';
  }

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
    // v1.7.83: com a escala grande (até 1.7) uma palavra só — "Organizados",
    // "Participando", "Encerrados" — passa da pill e INVADE a vizinha (medido:
    // +21/+22/+9px em 1.7). Ordem do dono: "nesses 3 casos vamos usar ...".
    // Reticência aqui é legítima: é RÓTULO DE FILTRO, não nome de pessoa — a
    // regra da caixa invisível (que reduz a fonte pra não cortar) vale pra
    // gente, e cortar "Organiz…" não perde identidade de ninguém.
    const _corta = _wrapLabel ? '' : 'overflow:hidden;text-overflow:ellipsis;max-width:100%;';
    // v1.7.88 — A PILL CRESCE PRA PREENCHER A LINHA.
    // Era `flex:0 1 92px`: o `0` PROÍBE crescer, então as pills ficavam travadas
    // em 92px com sobra de espaço nas duas laterais — e o rótulo cortava ("Organiza…",
    // "Participa…", "Encerrad…") tendo espaço livre logo ao lado. Print do dono no
    // celular: "aqui temos espaço para aumentar a largura dos box para nao precisar ...".
    // `flex:1 1 92px` mantém 92px como base (mesma quantidade de pills por linha) e
    // deixa cada uma dividir a sobra — o texto passa a caber sem tocar na reticência,
    // que fica só como rede pra nome muito longo em escala muito grande.
    // v1.7.96 — TRÊS POR LINHA (3x3 com a linha social de baixo).
    // Ordem do dono, com o print: "temos 4 box em cima e 2 embaixo. daria para fazer
    // 3 em cima e 3 embaixo deixando 3x3 sem mexer no ultimo que tem tamanho
    // diferente. com isso os 4 de cima teriam mais largura e poderiam caber melhor
    // o texto." Com base 92px cabiam 4 por linha e os rótulos de uma palavra só
    // ("Organizados", "Participando") batiam na reticência da v1.7.83 — havia
    // largura disponível, só não estava sendo distribuída.
    // A base passa a ser UM TERÇO da linha (o gap do container é 0.5rem, então 2
    // gaps = 1rem). Continua FLEX de propósito, não grid: com 4 ou 5 filtros (a
    // pill de Favoritos/Encerrados só existe com count > 0) a sobra da última linha
    // fica CENTRALIZADA — que foi exatamente o motivo de a v0.17.50 ter saído do
    // grid auto-fit, onde o item órfão colava à esquerda. `min-width:80px` segue
    // como piso: em tela muito estreita o wrap cai pra 2 sozinho.
    return `<div style="flex:1 1 calc((100% - 1rem) / 3);min-width:80px;background:${window._spCor(active ? 'var(--hero-pill-active-bg)' : 'var(--hero-pill-inactive-bg)', 'background')};padding:0.55rem 0.45rem;border-radius:10px;border:${active ? '2px solid var(--hero-pill-active-border)' : '1px solid var(--hero-pill-inactive-border)'};cursor:pointer;transition:transform 0.2s,box-shadow 0.2s,border 0.2s;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;${active ? 'box-shadow:0 0 14px var(--hero-pill-glow);transform:translateY(-2px);' : ''}" onclick="window._applyDashFilter('${key}')" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 4px 14px rgba(0,0,0,0.15)'" onmouseout="this.style.transform='${active ? 'translateY(-2px)' : 'none'}';this.style.boxShadow='${active ? '0 0 14px var(--hero-pill-glow)' : 'none'}'">
      <div style="font-size:1.1rem;margin-bottom:0.55rem;line-height:1;">${emoji}</div>
      <span style="font-size:1.3rem;font-weight:800;line-height:1;">${count}</span>
      <h3 style="margin:0.35rem 0 0 0;font-size:0.66rem;font-weight:600;opacity:0.9;line-height:1.15;white-space:${_ws};${_corta}">${label}</h3>
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
      return `<div${titleAttr}${pillDataAttrs ? ' ' + pillDataAttrs : ''} style="flex:1 1 ${flexBasis}px;min-width:${minWidth}px;background:var(--hero-pill-inactive-bg);padding:0.55rem 0.45rem;border-radius:10px;border:1px solid var(--hero-pill-inactive-border);cursor:pointer;transition:transform 0.2s,box-shadow 0.2s;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;" onclick="${onclickJs}" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 4px 14px rgba(0,0,0,0.15)'" onmouseout="this.style.transform='none';this.style.boxShadow='none'">
        <div style="font-size:1.1rem;margin-bottom:0.55rem;line-height:1;">${emoji}</div>
        <span${countAttr} style="font-size:1.3rem;font-weight:800;line-height:1;">${count}</span>
        <h3 style="margin:0.35rem 0 0 0;font-size:0.66rem;font-weight:600;opacity:0.9;line-height:1.1;">${label}</h3>
        ${subtitleHtmlTop}
      </div>`;
    }
    var subtitleHtml = opts.subtitle
      ? '<div' + subAttr + ' style="font-size:0.62rem;font-weight:700;color:var(--hero-text-soft,#94a3b8);line-height:1.1;margin-top:1px;font-variant-numeric:tabular-nums;letter-spacing:0.2px;white-space:nowrap;">' + opts.subtitle + '</div>'
      : (opts.subtitleDataAttr
          ? '<div' + subAttr + ' style="font-size:0.62rem;font-weight:700;color:var(--hero-text-soft,#94a3b8);line-height:1.1;margin-top:1px;font-variant-numeric:tabular-nums;letter-spacing:0.2px;white-space:nowrap;"></div>'
          : '');
    return `<div${titleAttr}${pillDataAttrs ? ' ' + pillDataAttrs : ''} style="flex:1 1 ${flexBasis}px;min-width:${minWidth}px;background:var(--hero-pill-inactive-bg);padding:0.55rem 0.45rem;border-radius:10px;border:1px solid var(--hero-pill-inactive-border);cursor:pointer;transition:transform 0.2s,box-shadow 0.2s;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;" onclick="${onclickJs}" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 4px 14px rgba(0,0,0,0.15)'" onmouseout="this.style.transform='none';this.style.boxShadow='none'">
      <div style="font-size:1.1rem;margin-bottom:0.55rem;line-height:1;">${emoji}</div>
      <span${countAttr} style="font-size:1.3rem;font-weight:800;line-height:1;">${count}</span>
      ${subtitleHtml}
      <h3 style="margin:0.35rem 0 0 0;font-size:0.66rem;font-weight:600;opacity:0.9;line-height:1.1;">${label}</h3>
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
  // v3.1.40: cache GLOBAL do último valor conhecido (Firestore-backed) pra ACABAR com o
  // pisca "71→0→71→0" nos vários re-renders do boot. Causa: o cache v2 local (só casuais)
  // dá 0/baixo pra quem joga torneio; o valor real (71) vem do Firestore async. Recomputar
  // do cache v2 a cada render mostrava 0 de novo. Agora o último valor conhecido persiste
  // entre renders — a pill nunca volta pra 0 depois de já saber 71.
  var _socialMatchesDisplay = (window._dashMatchesCache && window._dashMatchesCache.display) || '0';
  var _socialMatchesSubtitle = (window._dashMatchesCache && window._dashMatchesCache.subtitle) || '';
  var _socialMatchesTitle = (window._dashMatchesCache && window._dashMatchesCache.title) || 'Suas partidas casuais e em torneios — clique pra ver detalhes';
  var _socialMatchesClick = "if(typeof window._showPlayerStats==='function' && window.AppStore.currentUser){window._showPlayerStats(window.AppStore.currentUser.displayName||'')}";

  // Helper compartilhado: agrega W/L de uma lista de records.
  // v1.8.95: DELEGA pra conta canônica (`window._totaisVD`, store.js). Havia duas
  // implementações do mesmo V/D — esta e a da ficha do atleta — e elas divergiam:
  // na conta do dono o pill somava 13V/5D e a ficha 1V/2D. Duas contas para a mesma
  // pergunta é o defeito; a assinatura fica pra não mexer nos chamadores.
  function _aggregateWL(records, myUid, myDn) {
    if (typeof window._totaisVD === 'function') {
      var r = window._totaisVD(records, myUid, myDn);
      return { w: r.wins, l: r.losses };
    }
    return { w: 0, l: 0 };
  }

  function _formatMatchesPill(w, l) {
    var total = w + l;
    if (total === 0) return null;
    var pct = Math.round(w / total * 100);
    return {
      display: String(total),
      subtitle: '<span style="color:var(--sp-c-22c55e,#22c55e);">' + w + 'V</span> · <span style="color:var(--sp-c-ef4444,#ef4444);">' + l + 'D</span> · ' + pct + '%',
      title: w + 'V · ' + l + 'D · ' + pct + '% aproveitamento — clique pra ver detalhes'
    };
  }

  // Render inicial com cache local (v2 — mesma fonte do modal).
  var _myDn = ((_cuRef && _cuRef.displayName) || '').toLowerCase().trim();
  // Render inicial com cache local SÓ na 1ª vez (sem cache global ainda) — depois o
  // Firestore async vira a fonte de verdade e persiste em window._dashMatchesCache.
  if (!window._dashMatchesCache) {
    try {
      var _v2raw = localStorage.getItem('scoreplace_casual_history_v2') || '[]';
      var _v2 = JSON.parse(_v2raw);
      // v1.8.93: o cache local NÃO passa por loadUserMatchHistory, então a regra da
      // rajada precisa ser aplicada aqui também — senão o primeiro desenho da tela
      // mostraria o número contaminado e ele só se corrigiria quando o Firestore
      // respondesse (um "pisca" com dado errado é pior que esperar).
      if (Array.isArray(_v2) && typeof window._isPartidaEmRajada === 'function') {
        _v2 = _v2.filter(function (r) { return !window._isPartidaEmRajada(r); });
      }
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
  }

  // Refresh async do Firestore matchHistory. Cobre partidas em outros
  // devices que não estão no cache local v2. Substitui via data attrs.
  if (_myUid && window.FirestoreDB && typeof window.FirestoreDB.loadUserMatchHistory === 'function') {
    (async function() {
      try {
        var records = await window.FirestoreDB.loadUserMatchHistory(_myUid, { limit: 500 });
        // ── v1.8.96: MESMA ENTRADA que a ficha do atleta ───────────────────────
        // Relato do dono: "ainda divergente 54/54 contra 52/53". Unificar o CÁLCULO
        // (1.8.95) não bastou: os dois lados calculavam igual sobre entradas
        // DIFERENTES. A ficha funde o cache local de casuais (partida que ainda não
        // subiu pro Firestore); o pill usava esse cache só na primeira pintura e
        // depois o descartava. Agora os dois fundem — mesma conta, mesma entrada.
        var _base = Array.isArray(records) ? records.slice() : [];
        try {
          var _loc = JSON.parse(localStorage.getItem('scoreplace_casual_history_v2') || '[]');
          if (Array.isArray(_loc) && _loc.length) {
            var _vistos = {};
            _base.forEach(function (r) { if (r && r.matchId) _vistos[r.matchId] = 1; });
            _loc.forEach(function (r) {
              if (!r || (r.matchId && _vistos[r.matchId])) return;
              // o cache local não passa pelo loader → a regra da rajada vale aqui
              if (typeof window._isPartidaEmRajada === 'function' && window._isPartidaEmRajada(r)) return;
              _base.push(r);
            });
          }
        } catch (_e) {}
        var agg = _aggregateWL(_base, _myUid, _myDn);

        // ── v1.8.92: havendo letzplay, o total é letzplay + scoreplace ──────────
        // Relato do dono: "aqui o partidas esta divergente. vamos usar o
        // letzplay+scoreplace quando houver historico letzplay."
        // O pill contava só o scoreplace (27 partidas · 78%) enquanto a ficha do
        // atleta, na MESMA sessão, mostrava 40V–50D · 44% rotulado "letzplay +
        // scoreplace" — duas respostas para a mesma pergunta, na mesma tela.
        // A soma é a mesma do card (letzplay-profile.js): totais do letzplay mais o
        // V/D do scoreplace. Sem leitura do letzplay nada muda — segue só o
        // scoreplace, que é o comportamento anterior; por isso a falha é silenciosa.
        // ⚠️ O CAMINHO DO CAMPO FOI MEDIDO no doc real, não deduzido: em
        // `letzplayScans/{uid}` os totais vivem em `scan.totals` ({wins, losses,
        // matches}). Não existe `profile.totals` no documento — eu tinha escrito esse
        // caminho de cabeça e ele simplesmente não casaria com nada, somando zero em
        // silêncio (o pior tipo de erro: nada quebra, o número só continua errado).
        try {
          var _db = window.FirestoreDB && (window.FirestoreDB.db ||
            (window.FirestoreDB.ensureDb && window.FirestoreDB.ensureDb()));
          if (_db) {
            var _snap = await _db.collection('letzplayScans').doc(_myUid).get();
            if (_snap && _snap.exists) {
              var _d = _snap.data() || {};
              var _tot = (_d.scan && _d.scan.totals) || (_d.stats) ||
                         (_d.profile && _d.profile.totals) || null;
              if (_tot) {
                var _lw = parseInt(_tot.wins, 10) || 0;
                var _ll = parseInt(_tot.losses, 10) || 0;
                if (_lw + _ll > 0) { agg.w += _lw; agg.l += _ll; }
              }
            }
          }
        } catch (_lzErr) { /* sem letzplay → segue só com o scoreplace */ }

        var fmt = _formatMatchesPill(agg.w, agg.l);
        if (!fmt) return;
        window._dashMatchesCache = fmt; // v3.1.40: fonte de verdade — persiste entre re-renders
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

  // v3.0.91: barra de filtro/busca CANÔNICA (mesma de Pessoas/Inscritos) em modo
  // TORNEIOS — A-Z/🕒 + gênero (categorias do torneio) + modalidade cíclica (no lugar
  // de categoria) + busca. STICKY abaixo da topbar. Estado semeado a partir do estado
  // aplicado do dashboard pra refletir a seleção atual após cada re-render.
  const _dashSportList = Array.isArray(window._dashSportsList) ? window._dashSportsList : [];
  const _dashBarSport = (curSport && curSport !== '__fav__') ? curSport : 'all';
  window._filterBarState = window._filterBarState || {};
  window._filterBarState['dashTourn'] = { sort: curSort, gender: curGender, sport: _dashBarSport, search: window._dashSearch || '' };
  window._dashCanonLast = { sort: curSort, gender: curGender, sport: _dashBarSport, search: window._dashSearch || '' };
  const _dashFilterBar = (typeof window._inscritosFilterBar === 'function')
    ? window._inscritosFilterBar({
        stateKey: 'dashTourn', mode: 'tournaments', sticky: true,
        sportList: _dashSportList, sort: 'order-desc',
        searchId: 'dash-search-input', sortId: 'dash-sort', genderId: 'dash-gender', sportId: 'dash-sport',
        onChange: 'window._dashApplyCanonical()'
      })
    : '';

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
        <!-- CÂNONE fit-name-to-box DENTRO da escala por área: box de altura FIXA
             em --sp-u (escala por área) + a fonte encolhe (rem) pra caber nome
             longo em vez de estourar. Ver window._fitNames (store.js). -->
        <div style="flex:1; min-width:0; display:flex; flex-direction:column; justify-content:center;">
          <!-- v1.8.72 (dono): a saudação sai da linha do NOME e vem menor por cima.
               Numa linha só, "Bem-vindo, Rodrigo!" gastava toda a largura com a
               saudação e obrigava o ajuste automático a encolher o NOME — que é a
               única parte que a pessoa quer ler. Separados, o nome fica grande
               sempre. ⚠️ A caixa de altura FIXA continua sendo o PAI DIRETO do
               .sp-name-fit (o ajuste mede o parentElement — ver _fitOne no
               store.js): por isso o nome tem a sua própria caixa aqui dentro,
               senão ele mediria a altura das DUAS linhas e poderia vazar. -->
          <!-- v1.8.76 (dono): "o bem-vindo(a) não precisa ser tão pequeno" — 0.95rem
               → 1.35rem. A saudação continua MENOR que o nome de propósito (a
               hierarquia da 1.8.72 é o que mantém o nome grande), mas 0.95rem a
               deixava quase legenda. Ela segue com nowrap + reticência: a variante
               mais longa ("Bem-vindo(a),") tem que caber ao lado dos botões. -->
          <div style="font-size:1.35rem; font-weight:600; color:var(--hero-text); opacity:0.85; line-height:1.15; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%;">${_t('dashboard.welcomeGreeting', {greeting: (window._welcomeWord ? window._welcomeWord() : 'Bem-vindo')})}</div>
          <div style="height:calc(var(--sp-u) * 2.5); overflow:hidden; display:flex; align-items:center;">
            <h2 class="sp-name-fit" data-maxrem="2.3" data-minrem="1.1" style="margin:0; font-size:2.3rem; font-weight:700; color:var(--hero-text); line-height:1.1; white-space:nowrap; max-width:100%;">${_t('dashboard.welcomeName', {name: (window._firstNameOnly ? window._firstNameOnly(userName) : userName)})}${_proBadge}</h2>
          </div>
        </div>
        ${window.AppStore.currentUser ? '<div style="display:flex;flex-direction:column;gap:5px;align-items:stretch;"><button onclick="window.location.hash=\'#trofeus\'" style="background:var(--hero-glass-bg);border:1px solid var(--hero-glass-border);border-radius:12px;padding:6px 12px;cursor:pointer;display:flex;align-items:center;gap:5px;color:var(--hero-text);font-size:0.78rem;font-weight:600;white-space:nowrap;transition:background 0.2s;" onmouseover="this.style.background=\'var(--hero-glass-bg-hover)\'" onmouseout="this.style.background=\'var(--hero-glass-bg)\'"><span style="font-size:1rem;">🏆</span> Conquistas</button><button onclick="if(typeof window._showPlayerStats===\'function\')window._showPlayerStats(\'' + window._safeHtml((window.AppStore.currentUser.displayName || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")) + '\')" style="background:var(--hero-glass-bg);border:1px solid var(--hero-glass-border);border-radius:12px;padding:6px 12px;cursor:pointer;display:flex;align-items:center;gap:5px;color:var(--hero-text);font-size:0.78rem;font-weight:600;white-space:nowrap;transition:background 0.2s;" onmouseover="this.style.background=\'var(--hero-glass-bg-hover)\'" onmouseout="this.style.background=\'var(--hero-glass-bg)\'"><span style="font-size:1rem;">📊</span> ' + _t('dashboard.statistics') + '</button></div>' : ''}
      </div>
      <div style="text-align:center;margin-bottom:8px;font-size:0.75rem;color:var(--hero-text-soft);font-weight:600;letter-spacing:0.5px;">v${window.SCOREPLACE_VERSION || ''}</div>

      <div style="display: flex; flex-direction: column; align-items: center; gap: 12px; margin-bottom: 1.5rem;">
        <div style="display:flex;gap:8px;justify-content:center;flex-wrap:nowrap;width:100%;max-width:min(96%, calc(var(--sp-u) * 46));">
          <!-- v0.17.45: Row 1 mais alta — min-height 64→80px, ícone 1.4→1.7rem.
               v0.17.55: white-space:normal explícito no label pra OVERRIDE o
               white-space:nowrap herdado da classe .btn (components.css:192).
               Sem isso, o texto não quebrava E era cortado pelo overflow:hidden.
               Combinação completa: display:block; width:100%; white-space:normal
               + overflow:hidden no botão (defense-in-depth). -->
          <button class="btn btn-cta hover-lift" id="btn-casual-match" data-ensina style="background:linear-gradient(135deg,#38bdf8,#0ea5e9); color: #ffffff; flex:1;min-width:0; min-height: calc(var(--sp-u) * 5.6); font-size: calc(var(--sp-u) * 1.05); font-weight: 700; border-radius: 14px; border: 1px solid var(--sp-b-255-255-255-035,rgba(255,255,255,0.35)); letter-spacing: 0.02em;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:8px 6px;overflow:hidden;" onmouseover="this.style.filter='brightness(1.1)'" onmouseout="this.style.filter=''" onclick="if(typeof window._openCasualMatch==='function')window._openCasualMatch();">
            <span style="font-size:calc(var(--sp-u) * 1.9);line-height:1;">⚡</span>
            <span style="line-height:1.15;text-align:center;width:100%;display:block;white-space:normal;">${_t('dashboard.casualMatch')}</span>
          </button>
          <button class="btn btn-cta hover-lift" id="btn-create-tournament-in-box" data-ensina style="background: #1e40af; color: #ffffff; flex:1;min-width:0; min-height: calc(var(--sp-u) * 5.6); font-size: calc(var(--sp-u) * 1.05); font-weight: 700; border-radius: 14px; border: 1px solid var(--sp-b-255-255-255-035,rgba(255,255,255,0.35)); letter-spacing: 0.02em;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:8px 6px;overflow:hidden;" onmouseover="this.style.background='#1e3a8a'" onmouseout="this.style.background='#1e40af'" onclick="if(typeof openModal==='function')openModal('modal-quick-create');">
            <span style="font-size:calc(var(--sp-u) * 1.9);line-height:1;">🏆</span>
            <span style="line-height:1.15;text-align:center;width:100%;display:block;white-space:normal;">${_t('dashboard.newTournament')}</span>
          </button>
          <button class="btn btn-cta hover-lift" id="btn-place" data-ensina title="Procure lugares para seus jogos e marque presença" style="background:linear-gradient(135deg,#FFD700,#DAA520); color: #1a0f00; flex:1;min-width:0; min-height: calc(var(--sp-u) * 5.6); font-size: calc(var(--sp-u) * 1.05); font-weight: 800; border-radius: 14px; border: 1px solid var(--sp-b-255-255-255-035,rgba(255,255,255,0.35)); letter-spacing: 0.02em;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:8px 6px;overflow:hidden;" onmouseover="this.style.filter='brightness(1.1)'" onmouseout="this.style.filter=''" onclick="if(window._marcarFamiliaridade)window._marcarFamiliaridade('presenca'); window.location.hash='#place'">
            <span style="font-size:calc(var(--sp-u) * 1.9);line-height:1;">📍</span>
            <span style="line-height:1.15;text-align:center;width:100%;display:block;white-space:normal;">Presença</span>
          </button>
        </div>
        <!-- v2.3.87: ordem do hero box reorganizada — (1) Convidar + Pessoas,
             (2) Ler QR Code + Fale com o Desenvolvedor, (3) Apoie. O botão Pro
             saiu por ora (volta quando reativarmos o plano Pro). -->
        <!-- Linha: Convidar + Pessoas -->
        <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; align-items: center;">
          <button id="btn-invite-app" data-ensina class="btn btn-shine hover-lift" title="${_t('invite.appQrTitle')}" style="background: #7c3aed; color: #fff; border: 1px solid var(--sp-b-255-255-255-03,rgba(255,255,255,0.3)); font-size: 0.92rem; font-weight: 600; padding: 0 20px; height: 54px; border-radius: 12px;" onclick="window.location.hash='#invite'">✉️ ${_t('invite.inviteFriends')}</button>
          <button id="btn-people" data-ensina class="btn btn-shine hover-lift" title="Encontre jogadores e expanda sua rede" style="background: linear-gradient(135deg,#6366f1,#4f46e5); color: #fff; border: 1px solid var(--sp-b-255-255-255-03,rgba(255,255,255,0.3)); font-size: 0.92rem; font-weight: 600; padding: 0 20px; height: 54px; border-radius: 12px;" onclick="window.location.hash='#explore'">👥 ${_t('dashboard.people') || 'Pessoas'}</button>
        </div>
        <!-- Linha: Ler QR Code + Fale com o Desenvolvedor -->
        <div style="display:flex;justify-content:center;gap:10px;width:100%;flex-wrap:wrap;">
          <button id="btn-scan-qr" data-ensina class="btn btn-shine hover-lift" aria-label="Ler QR Code" title="Leia um QR code para entrar em uma partida casual ou em um torneio" style="background:linear-gradient(135deg,#a855f7,#7c3aed);color:#fff;border:1px solid var(--sp-b-255-255-255-03,rgba(255,255,255,0.3));font-size:0.92rem;font-weight:700;height:58px;padding:0 18px;border-radius:14px;display:inline-flex;align-items:center;gap:9px;letter-spacing:0.01em;" onclick="if(typeof window._openScanQR==='function')window._openScanQR();">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="flex-shrink:0;"><rect x="3" y="3" width="7" height="7" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="5.4" y="5.4" width="2.2" height="2.2" rx="0.4"/><rect x="14" y="3" width="7" height="7" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="16.4" y="5.4" width="2.2" height="2.2" rx="0.4"/><rect x="3" y="14" width="7" height="7" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="5.4" y="16.4" width="2.2" height="2.2" rx="0.4"/><rect x="13.5" y="13.5" width="2" height="2" rx="0.3"/><rect x="17.5" y="13.5" width="2" height="2" rx="0.3"/><rect x="15.5" y="15.5" width="2" height="2" rx="0.3"/><rect x="19.5" y="15.6" width="1.5" height="1.5" rx="0.3"/><rect x="13.5" y="17.5" width="2" height="2" rx="0.3"/><rect x="17.5" y="17.5" width="2" height="2" rx="0.3"/><rect x="19.5" y="19.5" width="1.5" height="1.5" rx="0.3"/></svg>
            <span style="display:flex;flex-direction:column;line-height:1.08;text-align:left;white-space:nowrap;"><span>Ler</span><span>QR Code</span></span>
          </button>
          ${(typeof window._devWhatsAppBtnHtml === 'function') ? window._devWhatsAppBtnHtml({ twoLine: true, extra: 'height:58px;padding:0 18px;font-size:0.92rem;letter-spacing:0.01em;border:1px solid var(--sp-b-255-255-255-025,rgba(255,255,255,0.25));' }) : ''}
        </div>
        <!-- Linha: Apoie -->
        <!-- 1.9.91 — o "Baixar na App Store" SAIU daqui. Ordem do dono: "na herobox
             tira tambem esse botao", junto com a virada de estratégia "vamos buscar
             sempre o nativo agora, nao mais o web".
             O convite pra baixar passa a viver SÓ na landing, e como SELO OFICIAL da
             loja (window._storeBadgesHtml). Aqui dentro ele nunca fez muito sentido:
             quem está no app nativo nem via o botão (ele se esconde sozinho), e quem
             está na web já entrou — o lugar de convidar pra baixar é a porta, não a
             sala. Uma linha a menos na tela que o dono já disse ser cheia demais.
             (Sem crases neste comentário: ele mora DENTRO de um template literal, onde a
             crase fecha a string e o texto vira código — trava própria pega isso.) -->
        <div style="display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; margin-top: -2px;">
          <button id="btn-support-pix" class="btn hover-lift" title="${_t('common.support')}" style="background: #047857; color: #fff; border: 1px solid var(--sp-b-255-255-255-03,rgba(255,255,255,0.3)); font-size: 0.78rem; font-weight: 600; padding: 0 14px; height: 34px; border-radius: 9px; opacity: 0.9;" onclick="window.location.hash='#support'">💚 ${_t('common.support')}</button>
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
        ${_fStyle('todos', '📋', _circuloCount, _t('dashboard.filterForYou'))}
        ${_fStyle('organizados', '🏆', organizadosCount, _t('dashboard.filterOrganized'))}
        ${_fStyle('participando', '👤', participacoesCount, _t('dashboard.filterParticipating'))}
        ${_fStyle('abertos', '🗓️', _abertosCount, _t('dashboard.filterOpen'))}
        ${favoritosCount > 0 ? _fStyle('favoritos', '❤️', favoritosCount, _t('dashboard.filterFavorites')) : ''}
        ${_encerradosPillCount > 0 ? _fStyle('encerrados', '🏆', _encerradosPillCount, _t('dashboard.filterFinished')) : ''}
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

    <!-- 🔴 Ao vivo agora (1.9.36) — a PRIMEIRA coisa abaixo da hero box, e só existe
         enquanto existir placar ao vivo rodando. O slot nasce vazio de propósito: sem
         partida ao vivo não há título órfão nem espaço em branco. Ver live-now.js. -->
    <div id="dashboard-live-widget"></div>

    <!-- v3.1.25: Movimento nos seus locais — logo abaixo da hero box (pedido do dono) -->
    <div id="dashboard-presences-widget" style="margin-bottom:1.25rem;">${window._dashMovementCache || ''}</div>

    <!-- v2.7.85: Convites de dupla pendentes (pro convidado) — banner âmbar prominente -->
    ${_buildPendingPairInvitesHtml()}

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

    <!-- v3.1.25: "Movimento nos seus locais" (#dashboard-presences-widget) movido pra
         logo abaixo da hero box — ver acima. -->

    <!-- v2.1.14: filtros de modalidade/formato/local movidos pra logo ACIMA do
         toggle Cards/Lista (pedido do usuário) — antes ficavam lá em cima, longe
         da lista que eles filtram. -->
    ${filterBarHtml}

    <!-- v2.8.43: toggle "Lista" (desligado=cards padrão / ligado=lista) — substitui os 2 botões -->
    <div style="display:flex;justify-content:flex-end;align-items:center;gap:8px;margin-bottom:0.75rem;">
      <!-- ⭐ 2.0.96 · EXPLORAR — a lista padrão é o CÍRCULO da pessoa (organizo/participo,
           convite, local favorito ou de amigo); aqui ela abre a plataforma inteira e filtra
           como quiser. O número é o TOTAL da plataforma, que o dono pediu sempre visível:
           assim a tela diz "4 pra você · 39 lá fora" em vez de parecer app vazio.
           Fica À ESQUERDA do toggle Lista por ordem do dono ("explorar ao lado do toggle
           lista") — e é botão, não pill de filtro: ele muda o ESCOPO, não a fatia. -->
      <button type="button" onclick="window._applyDashFilter('${_explorando ? 'todos' : 'explorar'}')"
        title="${_explorando ? 'Voltar pros seus torneios' : 'Ver todos os torneios da plataforma'}"
        style="margin-right:auto;display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:999px;cursor:pointer;
               font-size:0.8rem;font-weight:700;white-space:nowrap;
               border:1px solid ${_explorando ? '#6366f1' : window._spCor('rgba(255,255,255,0.18)', 'borda')};
               background:${_explorando ? 'rgba(99,102,241,0.18)' : window._spCor('rgba(255,255,255,0.06)', 'background')};
               color:${_explorando ? '#c7d2fe' : 'var(--text-main)'};">
        🔎 ${_t('dashboard.filterExplore')} <span style="opacity:0.75;font-weight:600;">${_todosCount}</span>
      </button>
      <span style="font-size:0.82rem;font-weight:600;color:var(--text-muted);user-select:none;">☰ ${_t('dashboard.compact') || 'Lista'}</span>
      <label class="toggle-switch" style="--toggle-on-bg:#6366f1;" title="Ver em lista (desligado = cards)"><input type="checkbox" ${window._dashView === 'compact' ? 'checked' : ''} onchange="window._setDashView(this.checked ? 'compact' : 'cards')"><span class="toggle-slider"></span></label>
    </div>
    <div class="dashboard-list" style="margin-bottom: 2rem;">
      <!-- v3.0.91: barra CANÔNICA (A-Z/🕒 + gênero + modalidade + busca), STICKY abaixo
           da topbar. Aparece com >1 torneio visível (pedido do usuário). -->
      ${allUnique.length > 1 ? _dashFilterBar : ''}
      ${runningBandHtml}
      ${runningBottomHtml}
      ${awaitingStartHtml}
      ${favoritesBandHtml}
      ${(window._dashView === 'compact')
        ? (filtered.length ? '<div class="compact-list">' + _buildCompactList(filtered) + '</div>' : _vazioHtml)
        : '<div class="cards-grid">' + filteredHtml + '</div>'}
    </div>
    <!-- v1.8.93: a seção "Encerrados" também aparece no modo LISTA. A supressão era
         resíduo de antes da v2.8.81, quando as bandas ainda não respeitavam o toggle;
         hoje _renderTGroup já monta lista compacta sozinho, então esconder a seção só
         fazia os encerrados sumirem da tela inteira em modo Lista (relato do dono:
         "na lista onde estao os encerrados? deveria estar no colapsavel"). -->
    ${finishedSectionHtml}
    ${(() => {
      // v0.16.60: diag SEMPRE visível, independente de filtro — usuário
      // reportou "nelson ainda nao ve torneio algum" mas o diag da v0.16.59
      // ficava escondido se tivesse filtro ativo. Agora o diag sempre
      // aparece; apenas as 3 seções extras (em andamento, fechadas-sem-início,
      // encerrados) ficam restritas ao filtro 'todos'.
      var _curFilter = window._dashFilter || 'todos';
      var _showExtraSections = (_curFilter === 'todos' && !curSport && !curLocation && !curFormat && _dashCurated);
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
      // ── v1.8.94: os encerrados NÃO podem sair DUAS vezes ────────────────────
      // MEDIDO: a dashboard montava "Torneios Encerrados (3)" (204 KB) E
      // "🏁 Encerrados (públicos) (3)" (204 KB) com OS MESMOS torneios — 408 KB do
      // total de 625 KB eram a mesma coisa, duas vezes, dentro de blocos fechados.
      // A colisão nasceu na 1.8.93, quando a seção unificada passou a valer para todo
      // filtro e encostou nesta, que é da descoberta pública. Quem já está na seção
      // unificada sai daqui: uma só lista, um só custo.
      var _jaNaSecaoUnificada = {};
      (_encerradosExtraidos || []).forEach(function (t) { if (t && t.id != null) _jaNaSecaoUnificada[String(t.id)] = 1; });
      var _finishedDiscovery = _filterByInterest(discoveryByCategory.finished)
        .filter(function (t) { return !(t && _jaNaSecaoUnificada[String(t.id)]); });
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
        var _cards = _renderTGroup(items);
        if (collapsed) {
          return '<details style="margin-top:1rem;"' + _dashDetailsAttr('scoreplace_dash_sec_' + title.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 24), false) + '><summary style="cursor:pointer;font-weight:700;font-size:0.92rem;color:' + window._spCor(color, 'color') + ';padding:8px 0;user-select:none;">' + title + ' (' + items.length + ')</summary><div style="margin-top:0.75rem;">' + _cards + '</div></details>';
        }
        return '<div style="margin-top:1.25rem;"><div style="font-weight:800;font-size:0.95rem;color:' + window._spCor(color, 'color') + ';margin-bottom:0.5rem;border-left:3px solid ' + window._spCor(color, 'borda') + ';padding-left:10px;">' + title + ' <span style="font-weight:500;color:var(--text-muted);font-size:0.78rem;">(' + items.length + ')</span></div>' + _cards + '</div>';
      };
      return '<div style="margin-top:0.5rem;">' +
        _interestNote +
        _section('🎮 Em andamento (públicos)', _inProgress, '#10b981', false) +
        _section('🚪 Inscrições encerradas (aguardando início)', _closedNoStart, '#fb923c', false) +
        _section('🏁 Encerrados (públicos)', _finishedDiscovery, '#94a3b8', true) +
      '</div>';
    })()}
    ${(function(){
      // v2.8.40: seção dos torneios que o usuário ocultou — colapsável, no fim de tudo.
      // v1.8.90: OCULTADO É OCULTADO — a seção lista TODOS os que o usuário ocultou,
      // em andamento ou encerrados, independente do filtro ativo (ordem do dono).
      // Uma tentativa anterior filtrou esta seção pelo filtro da tela; estava errado:
      // quem ocultou quer achar o torneio AQUI, e não depender de escolher o filtro
      // certo antes. A lista principal é que não os mostra — a separação é essa.
      var _ocultos = hiddenTournaments || [];
      if (!_ocultos.length) return '';
      return '<div style="margin-top:1.5rem;"><details' + _dashDetailsAttr('scoreplace_dash_hidden_open', false, 'ocultos') + '><summary style="cursor:pointer;font-weight:700;font-size:0.9rem;color:var(--text-muted);padding:10px 0;user-select:none;">🙈 Torneios ocultados (' + hiddenTournaments.length + ')</summary><div style="margin-top:0.75rem;">' + _dashLazyBody('ocultos', _dashDetailsAberto('scoreplace_dash_hidden_open', false), function () { return _renderTGroup(hiddenTournaments); }) + '</div></details></div>';
    })()}
  `;
  container.innerHTML = html;
  // v1.9.64: a prévia das seções fechadas preenche a LINHA — mede quantas colunas a grade
  // abriu e reabre os cards que couberem. Roda no MESMO task do innerHTML: assim o usuário
  // nunca chega a ver o estado de 1 coluna que sai do builder.
  try { window._spSyncCollapsePreview(); window._spWatchPreviewWidth(); } catch (_ePrev) {}
  // CÂNONE fit-name-to-box: ajusta a fonte dos nomes ao box fixo (saudação etc.).
  if (typeof window._fitNames === 'function') { try { window._fitNames(container); } catch (e) {} }
  // 1.9.88 — o brilho que ENSINA (um botão por vez) e a seta "encontre seu
  // torneio". Ambos entram DEPOIS da pintura, no próximo quadro: precisam medir
  // o que está visível, e medir antes de pintar dá retângulo zerado.
  try {
    requestAnimationFrame(function () {
      if (typeof window._aplicarShineDica === 'function') window._aplicarShineDica();
      if (typeof window._setaEncontreSeuTorneio === 'function') window._setaEncontreSeuTorneio();
    });
    setTimeout(function () {
      if (typeof window._aplicarShineDica === 'function') window._aplicarShineDica();
      if (typeof window._setaEncontreSeuTorneio === 'function') window._setaEncontreSeuTorneio();
    }, 120);   // rede: rAF não dispara em aba de fundo
  } catch (_eDica) {}
  // v2.8.46: re-aplica a busca in-place após qualquer re-render (ex.: trocar
  // modalidade com busca ativa) — sem isso a busca "sumiria" no re-render.
  if (window._dashSearch && typeof window._applyDashSearchInPlace === 'function') {
    try { window._applyDashSearchInPlace(); } catch (e) {}
  }

  // Regra "sempre usar foto do perfil para usuário cadastrado": o dashboard
  // não passa pelo bracket, então o _playerPhotoCache pode estar frio. Pré-
  // carrega as fotos reais (por uid) dos torneios em que o usuário participa
  // e troca os avatares iniciais pelas fotos de perfil. Mesmo padrão de
  // participants.js (swap por data-player-name).
  // v4.5.67: hidrata NOMES por uid (data-uid-name) — resolve do perfil vivo. Roda
  // PÓS-render (chained no preload de fotos). _preloadPlayerPhotos já popula
  // _profileNameByUid, que _nameForUid lê → nome vivo nos cards de Meus Resultados.
  function _dashHydrateNames() { if (typeof window._hydrateUidNames === 'function') { try { window._hydrateUidNames(container); } catch (e) {} } }
  // 🔴 Ao vivo agora — assina os placares abertos e pinta/apaga o slot sozinho.
  // A assinatura é trocada a cada render da dashboard (o render recria o slot), então
  // desinscreve a anterior: sem isso cada re-render deixaria um listener vivo pendurado.
  try {
    if (window.__dashLiveUnsub) { window.__dashLiveUnsub(); window.__dashLiveUnsub = null; }
    if (typeof window._renderLiveNowInto === 'function') {
      window.__dashLiveUnsub = window._renderLiveNowInto('dashboard-live-widget', {});
    }
  } catch (_eLive) {}

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
    }).catch(function() {}).then(_dashHydrateNames);
  } else { setTimeout(_dashHydrateNames, 0); }

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
      // v3.1.24: "Meus Últimos Resultados" é colapsada por padrão — mas se há pendência
      // pra mim, expande (sem gravar preferência) pra não esconder a ação necessária.
      // v1.8.69: o estado passou a ser o atributo `data-mr-collapsed` (o corpo não some
      // mais por `display:none`). Fechada, a seção já mostra o card da pendência — mas
      // havendo MAIS de uma, abrir continua sendo o certo: nenhuma ação fica escondida.
      var _mrSec = document.getElementById('meus-resultados-section');
      if (_mrSec && _mrSec.getAttribute('data-mr-collapsed') === '1') {
        _mrSec.setAttribute('data-mr-collapsed', '0');
        window._spSyncCollapsePreview();   // v1.9.64: a tag e o rodapé saem daqui (fonte única)
      }
      // v1.9.94: instantâneo (não 'smooth'). Com re-renders assíncronos na
      // entrada, a animação suave era interrompida no meio e parecia "pulo".
      // O guard + scroll preservado garantem que isto roda UMA vez e fica.
      _section.scrollIntoView({ behavior: 'auto', block: 'start' });
    }
  }, 350);

  /* Botões de resultado pendente — listener via JS (evita parsing issues de onclick em
   * HTML gerado dinamicamente no Safari mobile).
   *
   * ⛔ DELEGAÇÃO, NÃO UM OUVINTE POR BOTÃO — e isto foi um bug de produção.
   * Relato do dono (25/ago/2026): _"não consigo aprovar o jogo 63 … o botão aparece, mas
   * clicando nada acontece. organizador clicando. imagina o participante."_
   * CAUSA: desde a 2.0.86 a seção "Meus Resultados" é montada PREGUIÇOSA — o que passa do
   * 2º bloco fica guardado em `window._mrExtraPend` e só entra no DOM quando a pessoa abre
   * a seção (ou busca). Este trecho rodava UMA vez, no render, e ligava o clique só nos
   * botões que existiam NAQUELE instante. Todo botão inserido depois nascia morto: aparece,
   * está habilitado, e o clique não faz nada — sem erro, sem aviso, sem nada no Sentry.
   * Foi por isso que a investigação não achava falha: não havia falha, havia SILÊNCIO.
   *
   * Com delegação o ouvinte mora no CONTAINER e vale pra qualquer botão que exista agora
   * ou venha a existir. Some a classe inteira do problema — e ela ia voltar em toda seção
   * que eu tornasse preguiçosa. */
  // guarda pela FUNÇÃO (mesma razão da delegação em tournaments-categories.js): o
  // container em teste headless costuma ser um objeto de mentira, sem addEventListener.
  if (container && typeof container.addEventListener === 'function' && !container.__spPendDelegado) {
    container.__spPendDelegado = true;
    container.addEventListener('click', function (e) {
      var alvo = e && e.target;
      var btn = (alvo && alvo.closest) ? alvo.closest('[data-pending-action]') : null;
      if (!btn || !container.contains(btn)) return;
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
      } else if (action === 'goedit') {
        // 1.9.110: EDITAR do card já confirmado, no feed da tela inicial. Aqui NÃO se
        // tenta editar in-place: `_editResultInline` troca o placar do card por inputs,
        // e o card do feed tem os MESMOS ids do da chave — a edição abriria na tela
        // inicial. Carimba e navega; a chave abre a edição sozinha ao carregar.
        try { sessionStorage.setItem('sp_pendingEdit', JSON.stringify({tId: tId, matchId: mId})); } catch (e2) {}
        window.location.hash = '#bracket/' + tId;
      } else if (action === 'contest' && typeof window._contestResult === 'function') {
        window._contestResult(tId, mId);
      } else if (action === 'approve' && typeof window._approveResult === 'function') {
        window._approveResult(tId, mId);
      }
    });
  }

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

  // ─── v1.8.82: previsão do tempo dos cards de torneio ───
  // O slot nasce vazio e é preenchido aqui; ele mesmo se marca como feito, então
  // re-render por snapshot não gera requisição nova (uma por local, cache de 30 min).
  if (typeof window._hydrateWeatherSlots === 'function') { try { window._hydrateWeatherSlots(); } catch (e) {} }

  // v0.16.60: re-fetch do discovery feed sempre que renderiza dashboard.
  // Throttle de 15s (bem mais agressivo que v0.16.59 que era 30s) E ignora
  // throttle quando publicDiscovery está vazio (force fetch quando tem
  // motivo claro pra estar vazio — Nelson não vê NADA).
  if (window.AppStore && typeof window.AppStore.loadPublicDiscovery === 'function') {
    var _curLen = (window.AppStore.publicDiscovery || []).length;
    var _lastFetch = window.AppStore._publicDiscoveryLastFetch || 0;
    // ── ⛔ "SEM THROTTLE" VIRAVA ENXURRADA (2.0.73) ─────────────────────────
    // ESTA É A ÚNICA MUDANÇA DA LEVA, de propósito: ela NÃO encosta no caminho do
    // toque — mexer lá foi o que obrigou a reversão das levas 69-71.
    // MEDIDO no aparelho do dono: `tap: 4014/793ms` — QUATRO SEGUNDOS de atraso de
    // ENTRADA, isto é, o toque esperando a thread; e, na MESMA janela,
    // `Firestore read spike ~27,6/s em 10s (276 leituras, load-all-public=180)`.
    // A CAUSA: com a descoberta vazia, `_curLen === 0` removia o intervalo mínimo
    // por completo — então TODA renderização da dashboard (e ocultar, desocultar e
    // expandir SÃO renderizações) disparava a busca INTEIRA dos públicos. Cada
    // gesto virava ~180 leituras + parse + snapshot na thread principal, que é
    // justamente o que faz o toque esperar e a rolagem cortar.
    // A intenção original FICA ("sem dados = busca logo, o Nelson não vê NADA"):
    // vazio segue mais agressivo que o normal — 5s contra 15s. Sai só o "sem
    // intervalo nenhum", que transformava repetição de tela em enxurrada.
    // ⚠️ COMO SABER SE FUNCIONOU, sem instrumento novo: o rastro `tap:` JÁ reporta
    // o atraso de entrada. Era 4014ms — se cair, esta era a causa.
    var _force = _curLen === 0 && (Date.now() - _lastFetch > 5000);
    if (_force || Date.now() - _lastFetch > 15000) {
      window.AppStore._publicDiscoveryLastFetch = Date.now();
      // Contador de buscas de descoberta disparadas na sessão. Viaja junto na
      // telemetria de travada (`busca=` em store.js): foi ele que mostrou, em
      // 25/ago, que havia 2 buscas EM VOO durante uma travada de 4,7s ao rolar.
      // ⛔ Sem ele o campo reportaria 0 sempre — número que mente é pior que campo
      // ausente. Restaurado junto com a instrumentação de rolagem (2.0.79).
      window._discoveryFetches = (window._discoveryFetches || 0) + 1;
      window._log('[Discovery v0.16.60] re-fetch disparado', { curLen: _curLen, force: _force, msSinceLast: Date.now() - _lastFetch });
      window.AppStore.loadPublicDiscovery().then(function() {
        var newLen = (window.AppStore.publicDiscovery || []).length;
        window._log('[Discovery v0.16.60] re-fetch retornou', { newLen: newLen, oldLen: _curLen });
        // Re-render se ainda estamos no dashboard E o count MUDOU (preserva scroll).
        // v2.8.60: antes só re-renderizava ATRÁS do boot loader (v2.8.23) — com a
        // dashboard já mostrada, torneios novos da descoberta só apareciam ao navegar
        // ou ciclar o filtro (bug reportado). Agora re-renderiza também com a dashboard
        // visível, mas SÓ quando o count muda (raro) e preservando scroll → sem trava.
        var _onDash = (window.location.hash === '' || window.location.hash === '#' || window.location.hash.indexOf('#dashboard') === 0);
        if (_onDash && newLen !== _curLen) {
          window._dashPedirRepintura('descoberta');
        }
        // v2.4.84: marco pro boot splash — a descoberta (e o re-render que ela
        // dispara) já assentou. Só então o boot revela a dashboard.
        window._bootDiscoverySettled = true;
      }).catch(function(e) {
        window._error('[Discovery v0.16.60] re-fetch FAILED', e);
        window._lastDiscoveryError = String(e && e.message || e);
        window._bootDiscoverySettled = true; // erro também conta como "assentou"
      });
    } else {
      window._bootDiscoverySettled = true; // throttled (já tem dados) → nada a esperar
    }
  } else {
    window._bootDiscoverySettled = true; // sem descoberta → não há o que esperar
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
    // ── ⛔🔴 O RELÓGIO DE 25s ERA A CAUSA DAS TRAVADAS PERIÓDICAS (2.0.89) ─────
    // MEDIDO no aparelho do dono, com o carimbo de tempo desde a abertura:
    //   3270ms · pra-cima  · nos=739 · aberto=45s
    //   1014ms · pra-cima  · nos=739 · aberto=26s
    //    860ms · pra-cima  · nos=739 · aberto=25.2s
    // 25,2s · 26s · 45s — é ESTE relógio. E `loadPublicDiscovery` lê a coleção
    // `tournaments` com os DOCUMENTOS INTEIROS: a cada 25s o aparelho baixava e
    // desserializava dezenas de torneios completos na thread principal. Com 739
    // elementos na tela, a travada de 3,2s nunca foi peso de DOM — era isto.
    //
    // ⛔ E era REDUNDANTE: `startDiscoveryFeedListener` (store.js) já escuta
    // `discoveryFeed` em TEMPO REAL e re-busca quando algo muda de verdade. O poll
    // nasceu (v0.17.4) como rede pra quando o listener falha — virou imposto fixo.
    //
    // Fica como REDE, não como relógio: 5 minutos, e só se o listener não estiver
    // de pé. Frescor continua garantido pelo tempo real.
    setInterval(function() {
      var _h = window.location.hash || '';
      var _onDash = _h === '' || _h === '#' || _h.indexOf('#dashboard') === 0;
      if (!_onDash) return;
      if (!window.AppStore || typeof window.AppStore.loadPublicDiscovery !== 'function') return;
      if (!window.AppStore.currentUser) return;
      // ⭐ o tempo real está de pé ⇒ não há o que buscar. Buscar assim mesmo é
      // pagar o preço todo sem trazer nada novo.
      if (window.AppStore._discoveryUnsub) return;
      window.AppStore._publicDiscoveryLastFetch = Date.now();
      window.AppStore.loadPublicDiscovery().catch(function() {});
    }, 300000);
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

  // v2.8.84: pop-up da enquete pro INSCRITO que ainda não votou — agora dispara
  // na DASHBOARD (antes só ao abrir o detalhe do torneio, então quem só via a
  // lista nunca recebia). _opMaybePopup filtra por inscrição (_canVote) +
  // não-votou + 1x/sessão por enquete, então é seguro chamar pra cada torneio.
  if (typeof window._opActivePoll === 'function') {
    try {
      for (var _opi = 0; _opi < visible.length; _opi++) {
        if (!window._opActivePoll(visible[_opi])) continue;
        // inscrito não-votante → pop-up; CRIADOR com enquete não notificada → dispara (fundamental)
        if (typeof window._opMaybePopup === 'function') window._opMaybePopup(visible[_opi]);
        if (typeof window._opMaybeNotifyExisting === 'function') window._opMaybeNotifyExisting(visible[_opi]);
      }
    } catch (_ope) {}
  }

  // v2.3.24: jornada de coachmarks (menu → perfil). Atrasado pra dashboard
  // assentar e não competir com o boot loader. Self-guarda contra disabled/visto.
  if (window._coach && typeof window._coach.autoStartDashboard === 'function') {
    setTimeout(function () { try { window._coach.autoStartDashboard(); } catch (e) {} }, 1100);
  }
}

// v2.8.32: colapso da seção "Meus Últimos Resultados". Preferência persistida em
// chave ESTÁVEL (sem número de versão) → sobrevive a deploy/cache novo. Escopo de
// módulo (definido 1x), não dentro de renderDashboard.
// v2.8.45: re-render CANÔNICO da dashboard preservando o scroll. Substituir o
// innerHTML inteiro reseta a posição (a tela "pula"). Salva o scrollY, renderiza
// e restaura — inclusive num requestAnimationFrame (a altura pode mudar após o
// layout assentar). Todo clique que re-renderiza a dashboard (filtros, busca,
// toggle, ocultar) deve usar isto em vez de chamar renderDashboard direto.
window._dashRerender = function(opts) {
  opts = opts || {};
  var c = document.getElementById('view-container');
  if (!c || typeof window.renderDashboard !== 'function') return;
  var y = window.pageYOffset || window.scrollY || 0;
  // v4.0.62: modo COMPACTO (ocultar/desocultar) — a lista encurta e o conteúdo deve
  // JUNTAR, sem o spacer de keep-room (que deixava "tela preta" até os ocultados).
  // Em vez de prender o scroll, CLAMPA pro novo tamanho do conteúdo.
  if (opts.compact) {
    try { var _mvC = document.getElementById('dashboard-presences-widget'); if (_mvC && _mvC.innerHTML) window._dashMovementCache = _mvC.innerHTML; } catch (e0) {}
    window.renderDashboard(c);
    var _sp = document.getElementById('sp-sticky-spacer'); if (_sp) _sp.style.height = '0px';
    var _clamp = function () {
      try {
        var doc = document.scrollingElement || document.documentElement;
        var maxY = Math.max(0, doc.scrollHeight - window.innerHeight);
        window.scrollTo(0, Math.min(y, maxY));
      } catch (e1) {}
    };
    _clamp();
    try { requestAnimationFrame(_clamp); } catch (e2) {}
    return;
  }
  // v2.8.85: captura o HTML JÁ HIDRATADO da seção "Movimento nos seus locais"
  // antes de re-renderizar (toggle Lista/filtro/ocultar). renderDashboard re-injeta
  // esse cache no slot, e o sig guard em _hydrateFriendsPresenceWidget pula a
  // reconstrução (dados de presença iguais) → a seção NÃO some/reaparece nem
  // empurra o que está abaixo. Sem isto, o slot vinha vazio → reconstruía → flash.
  try { var _mv = document.getElementById('dashboard-presences-widget'); if (_mv && _mv.innerHTML) window._dashMovementCache = _mv.innerHTML; } catch (e) {}
  window.renderDashboard(c);
  try { window.scrollTo(0, y); } catch (e) {}
  // v3.0.97: mantém o documento alto o bastante pra NÃO pular a tela / a barra sticky
  // sair do lugar quando o filtro/sort encurta (ou zera) a lista.
  try { if (window._stickyFilterKeepRoom) window._stickyFilterKeepRoom(y); } catch (e4) {}
  try { requestAnimationFrame(function(){ try { window.scrollTo(0, y); if (window._stickyFilterKeepRoom) window._stickyFilterKeepRoom(y); } catch (e2) {} }); } catch (e3) {}
};

// v2.8.46: busca da dashboard = filtro IN-PLACE (esconde/mostra cards sem re-render)
// → digitar NÃO pula a tela nem perde o foco do input. Casa em qualquer parte do
// NOME do torneio, do LOCAL, e dos PARTICIPANTES/ORGANIZADOR. Cada card carrega o
// texto pesquisável em data-search-blob; aqui só alternamos display.
window._tournamentSearchBlob = function(t) {
  if (!t) return '';
  var parts = [t.name || '', t.venueName || '', t.organizerName || '', t.organizerEmail || ''];
  var pl = Array.isArray(t.participants) ? t.participants : (t.participants ? Object.values(t.participants) : []);
  for (var i = 0; i < pl.length; i++) {
    var p = pl[i];
    if (typeof p === 'string') parts.push(p);
    else if (p) { parts.push(p.displayName || ''); parts.push(p.name || ''); parts.push(p.p1Name || ''); parts.push(p.p2Name || ''); }
  }
  return parts.join(' ').toLowerCase();
};
// ⭐ 2.0.91 — BUSCAR É PEDIR PRA VER. Ordem do dono: _"as buscas e filtro precisam
// voltar a funcionar… achava, mas não mostrava, e achar e não mostrar é não achar"_.
//
// ⛔ A CAUSA, e ela era literal: esta função revela o que casou com
// `card.style.display = ''`. Só que as seções RECOLHIDAS escondem com
// `display:none !important` (novidades, últimos resultados) — e `!important` GANHA do
// estilo em linha. A busca marcava o card como encontrado e o CSS seguia escondendo.
// Achava e não mostrava.
// E desde que as seções passaram a nascer sob demanda (2.0.82/86/88), o que casa pode
// nem estar no DOM.
//
// Então buscar agora faz três coisas, nesta ordem:
//   ① MONTA o que estava guardado (novidades, últimos resultados);
//   ② ABRE as seções recolhidas — buscar é pedir pra ver, e seção fechada é a regra
//     que estava vencendo a busca;
//   ③ só então filtra.
// Ao limpar a busca, o estado de aberto/fechado volta ao que a pessoa tinha escolhido.
function _buscaAbreTudo(abrir) {
  try {
    // ① o guardado entra no DOM (senão o card nem existe pra ser achado)
    if (abrir) {
      var g = document.getElementById('novidades-grid');
      if (g && window._novExtraPend) { g.insertAdjacentHTML('beforeend', window._novExtraPend); window._novExtraPend = ''; }
      var b = document.getElementById('meus-resultados-body');
      if (b && window._mrExtraPend) { b.insertAdjacentHTML('beforeend', window._mrExtraPend); window._mrExtraPend = ''; }
    }
    // ② abre (ou devolve) as seções. ⛔ O estado ESCOLHIDO pela pessoa é guardado na
    // 1ª busca e devolvido ao limpar — buscar não pode reorganizar a tela dela.
    [['novidades-section', 'data-nov-collapsed'], ['meus-resultados-section', 'data-mr-collapsed']]
      .forEach(function (par) {
        var sec = document.getElementById(par[0]);
        if (!sec) return;
        if (abrir) {
          if (sec.getAttribute('data-sp-antes-busca') == null) {
            sec.setAttribute('data-sp-antes-busca', sec.getAttribute(par[1]) || '0');
          }
          sec.setAttribute(par[1], '0');
        } else if (sec.getAttribute('data-sp-antes-busca') != null) {
          sec.setAttribute(par[1], sec.getAttribute('data-sp-antes-busca'));
          sec.removeAttribute('data-sp-antes-busca');
        }
      });
  } catch (e) { if (window._warn) window._warn('[busca abre tudo]', e); }
}

window._applyDashSearchInPlace = function() {
  var docEl = document.scrollingElement || document.documentElement;
  var keepY = docEl.scrollTop;
  var q = (window._dashSearch || '').trim().toLowerCase();
  var root = document.getElementById('view-container');
  if (!root) return;
  _buscaAbreTudo(!!q);
  root.querySelectorAll('[data-search-blob]').forEach(function(card){
    var hit = !q || (card.getAttribute('data-search-blob') || '').indexOf(q) !== -1;
    card.style.display = hit ? '' : 'none';
  });
  // some o espaço de grids que ficaram sem nenhum card visível
  root.querySelectorAll('.cards-grid, .compact-list').forEach(function(grid){
    if (!q) { grid.style.display = ''; return; }
    var any = Array.prototype.some.call(grid.querySelectorAll('[data-search-blob]'), function(c){ return c.style.display !== 'none'; });
    grid.style.display = any ? '' : 'none';
  });
  // v3.0.97: não deixa a tela pular nem a barra sair do lugar quando a busca esvazia.
  try { if (window._stickyFilterKeepRoom) window._stickyFilterKeepRoom(keepY); } catch (e) {}
};

// ── PRÉVIA DAS SEÇÕES FECHADAS: PREENCHE A LINHA ──────────────────────────────
// Pedido do dono (19/ago/2026, com print): "quando a largura da tela permitir, podemos
// colocar 2 cards de jogo ou até 3 na sessão novidades e seus últimos resultados, em vez
// de deixar o buraco ali. e o botão 'ver os X jogos...' ajustado de acordo."
//
// A grade das duas seções é `repeat(auto-fill, minmax(280px,1fr))` — em tela larga ela
// abre 2, 3 ou 4 colunas. Fechada, a seção mostrava UM card e deixava o resto da linha
// vazio. Agora a prévia vai até o número de COLUNAS que a tela abriu: é a MESMA régua da
// seção aberta ("se cabe 1 jogo na largura da tela é 1 jogo, se cabem 3 são 3") e a mesma
// canônica de escala por ÁREA — nada de breakpoint chutado, o número sai da largura REAL.
//
// ⚠️ Por que medir em vez de resolver no CSS: a contagem do convite ("ver os X jogos
// anteriores") é TEXTO, e CSS não conta. Botão que promete contagem errada é pior que o
// buraco — então quem decide quantos cards ficam à vista tem que ser quem escreve o texto.
// ⚠️ Isto NÃO re-renderiza a dashboard ([[project_dashboard_no_rerender]]): mexe em UM
// atributo por card e no texto de dois convites. Nenhum card é recriado, nenhum alvo de
// toque muda de lugar. Nada de `content-visibility` aqui — o corte é `display:none`.

// PURA (e por isso testável): recebe a sequência da grade — 'card' pra cada jogo, 'full'
// pra cada elemento de linha inteira (cabeçalho de grupo) — e quantas colunas cabem.
// Devolve quantos ELEMENTOS do começo entram na prévia e quantos deles são cards.
// A linha termina no 1º de: (a) encheu as colunas; (b) apareceu um elemento de linha
// inteira DEPOIS de já haver card — um cabeçalho no meio parte a fileira em duas, e o
// jeito de não ter buraco é parar antes dele.
window._spPreviewLen = function(kinds, cols) {
  var n = Math.max(1, cols | 0), cards = 0, i = 0;
  for (; i < kinds.length; i++) {
    if (kinds[i] === 'card') { if (cards >= n) break; cards++; }
    else if (cards > 0) break;
  }
  return { els: i, cards: cards };
};

// Quantas colunas a grade abriu AGORA. Lê o valor computado (que vem resolvido em px,
// uma medida por trilha) — não há breakpoint escrito à mão em lugar nenhum.
// Grade não diagramada (seção escondida) devolve a fórmula crua com parênteses: aí não
// dá pra contar e o certo é assumir 1 — errar mostrando de menos, nunca de mais.
function _spGridCols(grid) {
  try {
    var tpl = (window.getComputedStyle(grid).gridTemplateColumns || '').trim();
    if (!tpl || tpl === 'none' || tpl.indexOf('(') !== -1) return 1;
    return Math.max(1, tpl.split(/\s+/).length);
  } catch (e) { return 1; }
}

// Teto da largura do card na prévia. A linha fechada tem N cards e a grade pode ter aberto
// MAIS colunas que isso (um grupo de 3 jogos numa tela de 4 colunas) — aí sobraria de novo
// um pedaço de linha vazio, que é exatamente a queixa do print. Os N cards passam a dividir
// a linha inteira, mas até este teto: sem ele, um grupo de 1 jogo viraria um card de 1250px
// com dois nomes e um placar dentro. Batendo no teto, a fileira fica CENTRADA — sobra igual
// dos dois lados, que lê como escolha, não como buraco.
var _SP_CARD_MAX = '460px';

// Aplica a prévia numa grade: tira `data-sp-extra` de quem entra na linha, põe em quem
// não entra, e faz os que entraram dividirem a linha. Devolve quantos ficaram à vista.
function _spFitGrid(grid, colapsada) {
  // ⚠️ Mede SEMPRE com a régua ORIGINAL da grade. Medindo com o `repeat(N,...)` da prévia,
  // a resposta seria o próprio N de antes — a linha nunca voltaria a crescer quando a tela
  // aumentasse. Guardar a régua é obrigatório porque ela mora no `style` INLINE da grade:
  // um `style.gridTemplateColumns = ''` apagaria o auto-fill em vez de restaurá-lo.
  if (grid.__spBase == null) grid.__spBase = grid.style.gridTemplateColumns || '';
  grid.style.gridTemplateColumns = grid.__spBase;
  grid.style.justifyContent = '';
  var kids = grid.children || [], kinds = [], i;
  for (i = 0; i < kids.length; i++) {
    kinds.push((kids[i].hasAttribute('data-nov-card') || kids[i].hasAttribute('data-mr-card')) ? 'card' : 'full');
  }
  var r = window._spPreviewLen(kinds, _spGridCols(grid));
  for (i = 0; i < kids.length; i++) {
    if (i < r.els) kids[i].removeAttribute('data-sp-extra');
    else kids[i].setAttribute('data-sp-extra', '1');
  }
  if (colapsada && r.cards > 0) {
    // ⚠️ O piso é 0, NÃO 280px. Se a janela encolher e a re-medição não chegar (aba em
    // segundo plano, evento perdido), `minmax(280px,…)` com N trilhas maiores que a tela
    // ESTOURA a linha na horizontal — e barra de rolagem lateral é quebra visível. Com
    // piso 0 o pior caso é card mais estreito por um instante, que ninguém percebe.
    grid.style.gridTemplateColumns = 'repeat(' + r.cards + ',minmax(0,' + _SP_CARD_MAX + '))';
    grid.style.justifyContent = 'center';
  }
  return r.cards;
}

// O convite (tag do cabeçalho + rodapé) tem que dizer o que REALMENTE sobrou. Sobrando
// zero, ele some dos dois lugares: "ver mais" que não mostra mais nada é ruído — e o
// título continua clicável pra quem quiser fechar.
function _spSyncHint(sec, attrColapso, tagId, hintId, resto, comJogos) {
  var colapsada = sec.getAttribute(attrColapso) === '1';
  var tag = document.getElementById(tagId);
  var hint = document.getElementById(hintId);
  var texto = (typeof window._spVerMaisTexto === 'function')
    ? window._spVerMaisTexto(resto, comJogos) : ('ver os ' + resto + ' anteriores');
  if (tag) {
    tag.textContent = colapsada ? 'ver mais' : 'ver menos'; tag.style.display = resto > 0 ? '' : 'none';
    // A tag do CABEÇALHO das Novidades se reveza com a flutuante (ver o <style> da seção):
    // fechada ela é o "ver mais" que se vê; aberta ela fica invisível segurando o espaço do
    // título. Quem escreve o texto é ESTE ponto, o mesmo da flutuante — assim o espaço
    // reservado é o do texto que está de fato em cena (e "ver menos" é mais largo que
    // "ver mais": deixar um fixo faria o título correr por baixo da pílula em um dos dois
    // estados). Some junto com ela quando não sobra nada a mostrar.
    try {
      document.querySelectorAll('[data-tag-spacer-for="' + tagId + '"]').forEach(function (sp) {
        sp.textContent = tag.textContent;
        sp.style.display = resto > 0 ? '' : 'none';
      });
    } catch (e) {}
  }
  if (hint) {
    hint.textContent = colapsada ? texto : 'ver menos';
    var p = hint.parentNode;   // o <p> centralizado do rodapé
    if (p && p.style) p.style.display = resto > 0 ? '' : 'none';
  }
}

// Ponto ÚNICO de sincronia das duas seções. Chamado: (a) logo depois do render, no MESMO
// task do innerHTML (então o usuário nunca vê o estado de 1 coluna); (b) a cada
// abre/fecha; (c) quando a largura da seção muda de verdade.
window._spSyncCollapsePreview = function() {
  try {
    var novSec = document.getElementById('novidades-section');
    var novGrid = document.getElementById('novidades-grid');
    if (novSec && novGrid) {
      // ⛔ O TOTAL VEM DO RENDER, NÃO DO DOM (2.0.82). Desde que o conteúdo escondido
      // passou a nascer só no clique, contar `[data-nov-card]` na grade daria 1 e o
      // convite prometeria "ver mais (0)". `_novTotalCards` é contado no texto
      // gerado — inclui o que ainda está guardado. Fallback no DOM pra render antigo.
      var novTotal = (typeof window._novTotalCards === 'number')
        ? window._novTotalCards
        : novGrid.querySelectorAll('[data-nov-card]').length;
      var novShown = _spFitGrid(novGrid, novSec.getAttribute('data-nov-collapsed') === '1');
      _spSyncHint(novSec, 'data-nov-collapsed', 'nov-toggle-tag', 'novidades-hint',
        Math.max(0, novTotal - novShown), true);
    }
  } catch (e) {}
  try {
    var mrSec = document.getElementById('meus-resultados-section');
    var mrBody = document.getElementById('meus-resultados-body');
    if (mrSec && mrBody) {
      // A seção fechada mostra UM bloco (o `data-mr-first`, o mais urgente) — a prévia é
      // da grade DELE. O total, porém, é de TODOS os blocos: é o que o convite promete.
      var mrTotal = mrBody.querySelectorAll('[data-mr-card]').length;
      var first = mrBody.querySelector('[data-mr-first]');
      var firstCard = first && first.querySelector('[data-mr-card]');
      var mrShown = firstCard
        ? _spFitGrid(firstCard.parentNode, mrSec.getAttribute('data-mr-collapsed') === '1')
        : 0;
      _spSyncHint(mrSec, 'data-mr-collapsed', 'mr-toggle-tag', 'meus-resultados-hint',
        Math.max(0, mrTotal - mrShown), false);
    }
  } catch (e) {}
};

// Reage à largura: girar o aparelho ou redimensionar a janela muda quantas colunas cabem.
// ⚠️ Observa a SEÇÃO, não a grade, e só dispara quando a LARGURA muda: esconder/mostrar
// card muda a ALTURA, e agir nisso seria laço (medir → esconder → medir de novo).
window._spWatchPreviewWidth = function() {
  try {
    if (window.__spPreviewRO) { window.__spPreviewRO.disconnect(); window.__spPreviewRO = null; }
    if (typeof window.ResizeObserver !== 'function') return;
    window.__spPreviewRO = new window.ResizeObserver(function(entries) {
      var mudou = false;
      entries.forEach(function(en) {
        var w = Math.round(en.contentRect.width);
        if (en.target.__spW !== w) { en.target.__spW = w; mudou = true; }
      });
      if (mudou) window._spSyncCollapsePreview();
    });
    ['novidades-section', 'meus-resultados-section'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) { el.__spW = Math.round(el.getBoundingClientRect().width); window.__spPreviewRO.observe(el); }
    });
  } catch (e) {}
  // Cinto E suspensório: o `resize` da janela cobre o caso mais comum (girar o aparelho,
  // redimensionar a janela) sem depender do ciclo de render que entrega o ResizeObserver.
  // Registrado UMA vez — a dashboard re-renderiza, e um listener por render iria empilhar.
  try {
    if (!window.__spPreviewResizeOn) {
      window.__spPreviewResizeOn = true;
      window.addEventListener('resize', function() {
        if (window.__spPreviewT) return;   // agrupa a rajada do arrasto num tique só
        window.__spPreviewT = setTimeout(function() {
          window.__spPreviewT = null;
          window._spSyncCollapsePreview();
        }, 120);
      });
    }
  } catch (e2) {}
};

// 📣 Novidades no seu torneio — todos os cards vivem na MESMA grade responsiva (a de
// "Seus últimos resultados"); o estado fechado esconde do 2º em diante por CSS, via o
// atributo `data-nov-collapsed` da seção. v1.8.67: era um `<div>` separado com os
// "anteriores", e um wrapper no meio quebrava a grade. A escolha é lembrada; o default
// é COLAPSADA (só o lançamento mais recente à vista).
window._toggleNovidadesCollapse = function() {
  try { if (window._marcarFamiliaridade) window._marcarFamiliaridade('novidades'); } catch (e) {}
  var sec = document.getElementById('novidades-section');
  if (!sec) return;
  var willCollapse = sec.getAttribute('data-nov-collapsed') !== '1';
  // ⚠️ MEDIR ANTES DE TROCAR O ATRIBUTO. Ao fechar, o CSS esconde o trilho (`display:none`) e
  // ele passa a medir zero — a conta de "o topo já saiu de vista?" ficaria dependendo de um
  // elemento que acabou de sair da tela. Aqui o retrato é tirado com a seção ainda aberta.
  var _grudado = false;
  try {
    var _railM = document.getElementById('nov-toggle-rail');
    var _topoM = sec.getBoundingClientRect().top;
    _grudado = _railM ? (_railM.getBoundingClientRect().top - _topoM > 24) : (_topoM < 0);
  } catch (e) {}
  // ── ⭐ O ESCONDIDO ENTRA AGORA (2.0.82) ─────────────────────────────────────
  // A seção nasce só com o que aparece; o resto ficou como TEXTO em memória
  // (`_novExtraPend`). Ao ABRIR, ele entra no DOM — uma vez só. Ordem do dono:
  // "poderia não carregar tudo antes que alguém clicasse no mostrar mais".
  // ⛔ ANTES de trocar o atributo: o CSS revela pelo atributo, e o conteúdo tem
  // que já estar lá quando isso acontece, senão a seção abre vazia e preenche
  // depois — que é exatamente o defeito que estamos perseguindo.
  if (!willCollapse && window._novExtraPend) {
    try {
      var _grid = document.getElementById('novidades-grid');
      if (_grid) { _grid.insertAdjacentHTML('beforeend', window._novExtraPend); window._novExtraPend = ''; }
    } catch (e) {}
  }
  sec.setAttribute('data-nov-collapsed', willCollapse ? '1' : '0');
  // v1.9.64: a contagem do convite saiu daqui — quem a escreve é `_spSyncCollapsePreview`,
  // que primeiro MEDE quantos cards cabem na linha. Duas contas para o mesmo número era o
  // caminho garantido pra o botão prometer uma coisa e a tela mostrar outra.
  window._spSyncCollapsePreview();
  // ── 2.0.39 · RECOLHER LEVA AO TOPO DA SEÇÃO ─────────────────────────────────
  // Correção do dono: _"quando clicamos nele deve parecer que escondeu o que ele mostrava,
  // mas não ficar na posição relativa em que estava (lá pra baixo). deve mostrar o topo das
  // novidades do seu torneio para o usuário não se perder."_
  //
  // Com a pílula flutuante dá pra fechar a seção lá do fim dela — e aí a página encolhe
  // debaixo do dedo: o conteúdo que estava sob o cursor sobe centenas de pixels e o usuário
  // é cuspido no meio do que vinha DEPOIS. Fechar tem que devolver a seção fechada à vista.
  // Só ao RECOLHER: abrir mantém a página onde está (o que aparece nasce abaixo, sem empurrar
  // nada pra cima). E só quando o topo da seção já saiu de vista — se ele está na tela, mexer
  // na rolagem seria um pulo gratuito.
  // O respiro é `--scroll-anchor` via `scroll-margin-top` (a mesma âncora do trilho e de todo
  // scrollIntoView do app), nunca px cravado. [[project_sticky_vertical_usa_scroll_anchor]]
  if (willCollapse) {
    // "o topo já saiu de vista?" foi medido no PRÓPRIO trilho, acima, com a seção ainda
    // aberta: grudado, ele está na linha da âncora, bem abaixo do topo da seção; solto, ele
    // fica a um padding dele. Assim a conta não depende de ler `--scroll-anchor` (que é um
    // `calc()`, não um número).
    try { if (_grudado) sec.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (e) {}
  }
  try { localStorage.setItem('scoreplace_collapse_novidades', willCollapse ? '1' : '0'); } catch (e) {}
};

// 🏅 Seus últimos resultados — v1.8.69: mesmo mecanismo de "📣 Novidades no seu torneio".
// O estado vive no atributo `data-mr-collapsed` da seção e quem esconde é o CSS; o corpo
// NUNCA mais some inteiro, senão a seção fechada não mostra nada (era a queixa do dono).
window._toggleMyResultsCollapse = function() {
  try { if (window._marcarFamiliaridade) window._marcarFamiliaridade('resultados'); } catch (e) {}
  var sec = document.getElementById('meus-resultados-section');
  if (!sec) return;
  var willCollapse = sec.getAttribute('data-mr-collapsed') !== '1';
  // ⭐ 2.0.89 — o escondido entra AGORA, ANTES de o CSS revelar. Fechada, a seção
  // nasce só com o bloco à vista; o resto ficou guardado em texto (regra do dono:
  // "nada que não estiver visível deve ser carregado").
  if (!willCollapse && window._mrExtraPend) {
    try {
      var _body = document.getElementById('meus-resultados-body');
      if (_body) { _body.insertAdjacentHTML('beforeend', window._mrExtraPend); window._mrExtraPend = ''; }
    } catch (e) {}
  }
  sec.setAttribute('data-mr-collapsed', willCollapse ? '1' : '0');
  window._spSyncCollapsePreview();   // v1.9.64: mede a linha e escreve o convite (fonte única)
  try { localStorage.setItem('scoreplace_collapse_myresults', willCollapse ? '1' : '0'); } catch (e) {}
};

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
          ? ' · <span style="font-family:monospace;color:var(--sp-c-fbbf24,#fbbf24);letter-spacing:1px;font-size:0.78rem;">' + _safe(n.casualRoomCode) + '</span>'
          : '';

        return '<div style="display:flex;align-items:flex-start;gap:12px;padding:14px 16px;' +
          'background:linear-gradient(135deg,rgba(251,191,36,0.18),rgba(245,158,11,0.07));' +
          'border:1px solid rgba(251,191,36,0.45);border-radius:14px;flex-wrap:wrap;">' +
          '<span style="font-size:1.4rem;flex-shrink:0;margin-top:2px;">🤝</span>' +
          '<div style="flex:1;min-width:180px;">' +
            '<div style="font-weight:800;color:var(--sp-c-fbbf24,#fbbf24);font-size:0.92rem;margin-bottom:4px;">Você jogou esta partida?</div>' +
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
                'color:var(--sp-c-f87171,#f87171);border-radius:8px;padding:7px 16px;font-size:0.8rem;font-weight:700;cursor:pointer;">' +
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
          '<div style="font-size:0.72rem;color:var(--text-muted);">Sala <b style="color:var(--sp-c-38bdf8,#38bdf8);font-family:monospace;letter-spacing:1px;">' + _safe(cu.activeCasualRoom) + '</b> · continue de onde parou</div>' +
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
  // v2.8.83: GUARDA anti-flash. listenMyActive/listenForFriends chamam isto a
  // cada snapshot de presença — muitos redundantes (mesmo estado). Reconstruir o
  // widget toda vez fazia a seção "Movimento" sumir/aparecer e empurrar o que
  // está abaixo. Se os dados de presença (cache dos listeners) + amigos não
  // mudaram E o box já está renderizado, NÃO reconstrói (o gráfico tem auto-tick
  // próprio pra deslizar a janela). Após um re-render da dashboard o box fica
  // vazio → reconstrói normalmente.
  try {
    var _pc = window._dashPresenceCache || { own: [], friends: [] };
    var _allP = (_pc.own || []).concat(_pc.friends || []);
    var _msig = _allP.map(function(p) { return p && (p.placeId + '|' + p.uid + '|' + p.type + '|' + p.startsAt + '|' + p.endsAt + '|' + (p.cancelled ? 1 : 0) + '|' + (Array.isArray(p.sports) ? p.sports.join(',') : '')); }).sort().join(';')
      + '|f:' + (Array.isArray(cu.friends) ? cu.friends.length : 0);
    if (_msig === window._dashMovementSig && box.innerHTML) return;
    window._dashMovementSig = _msig;
  } catch (e) {}
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
        .then(function(snap) { return window._userVivo(snap); })   // lápide guarda o mesmo e-mail
        .then(function(v) {
          if (!v) {
            window._warn('[FriendsWidget] email não resolvido pra uid:', em);
            return null;
          }
          var resolvedUid = v.uid;
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
    // v2.1.71: inclui torneios de HOJE em que VOCÊ (ou um amigo) está inscrito —
    // aparecem como "idas planejadas" mesmo sem presença real registrada (ex.:
    // inscrito antes do plano automático existir). Só adiciona o venue à lista;
    // o card hidrata o movimento, que já mostra o box do torneio + inscritos
    // (amigos nomeados, não-amigos no "+N") sem revelar estranhos.
    (function() {
      try {
        var todayKey = window.PresenceDB.dayKey(new Date());
        var fSet = {}; friends.forEach(function(u) { fSet[u] = true; });
        var tours = (window.AppStore && window.AppStore.tournaments) || [];
        tours.forEach(function(t) {
          if (!t || !t.startDate) return;
          var d = new Date(t.startDate);
          if (isNaN(d.getTime()) || window.PresenceDB.dayKey(d) !== todayKey) return;
          var pid = window.PresenceDB.venueKey(t.venuePlaceId || '', t.venue || '');
          if (!pid) return;
          var parts = Array.isArray(t.participants) ? t.participants : [];
          // v3.0.x (Parte 10 uid sweep): identidade por uid slot-aware — o p2 de uma
          // dupla (uid em p2Uid) também conta como "eu"/"amigo" no movimento do local.
          var _uidsOf = function(p) {
            if (p && typeof window._participantUids === 'function') { try { return window._participantUids(p) || []; } catch(e){} }
            return (p && p.uid) ? [p.uid] : [];
          };
          var meIn = parts.some(function(p) { return _uidsOf(p).indexOf(cu.uid) !== -1; });
          var frUid = null;
          parts.some(function(p) {
            var hit = _uidsOf(p).filter(function(u){ return u && fSet[u]; })[0];
            if (hit) { frUid = hit; return true; }
            return false;
          });
          if (!meIn && !frUid) return;
          if (list.some(function(p) { return p && p.placeId === pid; })) return; // já há presença nesse venue
          list.push({ uid: meIn ? cu.uid : frUid, placeId: pid, venueName: t.venue || 'Local', venueLat: t.venueLat, venueLon: t.venueLon, _fromTournament: true });
        });
      } catch (e) {}
    })();
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
        '<div style="background:' + window._spCor(bg, 'background') + ';border:1px solid ' + window._spCor(border, 'borda') + ';border-radius:14px;padding:12px 14px;">' +
          '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' +
            (hasFriends ? '<span style="font-size:1.1rem;opacity:0.65;">👥</span>' : '') +
            '<div style="flex:1;min-width:200px;">' +
              '<div style="font-size:' + (hasFriends ? '0.82rem' : '0.92rem') + ';color:var(--text-bright);font-weight:' + (hasFriends ? '600' : '700') + ';">' + msgTitle + '</div>' +
              '<div style="font-size:' + (hasFriends ? '0.72rem' : '0.78rem') + ';color:var(--text-muted);margin-top:2px;">' + msgSub + '</div>' +
            '</div>' +
            '<a href="' + ctaHref + '" style="font-size:0.78rem;color:var(--sp-c-var-primary-color-,var(--primary-color));text-decoration:none;font-weight:600;white-space:nowrap;">' + ctaText + '</a>' +
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
    var _bucketKeys = []; // ordem de criação dos buckets (canon names)
    var _canonName = function(name) {
      return String(name || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    };
    var _isSyntheticPid = function(pid) {
      return typeof pid === 'string' && pid.indexOf('pref_') === 0;
    };
    // v4.5.45: o canon puro deixava "Clube Paineiras do Morumby" e "Clube
    // Paineiras do Morumby, São Paulo" como DOIS cards (mesmo local físico, um
    // com sufixo de cidade). Agora dois nomes casam quando um é PREFIXO do outro
    // na fronteira de vírgula/espaço (Nome ⊂ "Nome, Cidade") OU quando as
    // coordenadas estão a menos de ~200m. Guard de 6 chars evita mesclar nomes
    // curtos por engano ("Clube A" vs "Clube AB").
    var _nameMatch = function(a, b) {
      if (!a || !b) return false;
      if (a === b) return true;
      var shorter = a.length <= b.length ? a : b;
      var longer  = a.length <= b.length ? b : a;
      if (shorter.length < 6) return false;
      if (longer.indexOf(shorter) !== 0) return false;
      var nextChar = longer.charAt(shorter.length);
      return nextChar === ',' || nextChar === ' ' || nextChar === '';
    };
    var _closeCoords = function(a, b) {
      if (a.venueLat == null || a.venueLon == null || b.venueLat == null || b.venueLon == null) return false;
      if (typeof window._haversineKm !== 'function') return false;
      return window._haversineKm(a.venueLat, a.venueLon, b.venueLat, b.venueLon) < 0.2; // ~200m
    };
    list.forEach(function(p) {
      var canon = _canonName(p.venueName) || p.placeId || '';
      if (!canon) return;
      // procura bucket existente por nome (exato/prefixo) OU coordenadas ~200m
      var matchKey = null;
      for (var bi = 0; bi < _bucketKeys.length; bi++) {
        var k = _bucketKeys[bi];
        if (_nameMatch(canon, k) || _closeCoords(venuesByPid[k], p)) { matchKey = k; break; }
      }
      if (matchKey == null) {
        venuesByPid[canon] = {
          placeId: p.placeId,
          venueName: p.venueName || 'Local',
          venueLat: p.venueLat,
          venueLon: p.venueLon
        };
        _bucketKeys.push(canon);
      } else {
        var existing = venuesByPid[matchKey];
        // placeId: prefere o Google (não-synthetic) — dados completos no loadVenue
        if (_isSyntheticPid(existing.placeId) && !_isSyntheticPid(p.placeId) && p.placeId) {
          existing.placeId = p.placeId;
        }
        // nome de exibição: prefere o MAIS CURTO (sem sufixo de cidade)
        if (p.venueName && _canonName(p.venueName).length < _canonName(existing.venueName).length) {
          existing.venueName = p.venueName;
        }
        // completa coords se faltavam (pra futuros matches por proximidade)
        if (existing.venueLat == null && p.venueLat != null) {
          existing.venueLat = p.venueLat; existing.venueLon = p.venueLon;
        }
      }
    });
    var venueList = _bucketKeys.map(function(k) { return venuesByPid[k]; });

    var _safe = window._safeHtml || function(s) { return String(s || ''); };
    var sanitizePid = function(pid) { return 'dash_' + String(pid || '').replace(/[^a-zA-Z0-9]/g, '_'); };

    var html =
      '<div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:14px;padding:14px;">' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;">' +
          '<span style="width:8px;height:8px;border-radius:50%;background:#10b981;box-shadow:0 0 8px #10b981;"></span>' +
          '<span style="font-weight:700;color:var(--text-bright);font-size:0.95rem;">Movimento nos seus locais</span>' +
          '<a href="#place" class="btn btn-sm btn-success hover-lift" style="margin-left:auto;text-decoration:none;">Ver tudo →</a>' +
        '</div>';

    // v0.16.78: banner prominente listando os planos/checkins do PRÓPRIO user
    // ANTES dos venue cards. Pedido do usuário: "aqui deveria aparecer que
    // nelson estara no paineiras tal horas (para o proprio nelson)". Antes,
    // o plano só aparecia como chip discreto em "Próximas horas" do venue
    // card — fácil de não ver. Agora aparece como linha destacada verde
    // (check-in) ou índigo (plano) com horário, esporte, e botão Cancelar
    // logo no topo da seção.
    var nowMs = Date.now();
    // v2.8.58/2.8.76: plano de presença vindo de TORNEIO (source:'tournament') só
    // aparece a partir de 24h antes do evento — antes mostrava "ida planejada" assim que
    // a pessoa se inscrevia (ex.: torneio dia 1/jul aparecia 9 dias antes). Pra valer "pra
    // todos" mesmo que a data mude, usa a data ATUAL do torneio (não o startsAt do doc,
    // que pode estar defasado): re-computa a janela pelo torneio vivo. Planos manuais
    // continuam aparecendo sempre que futuros.
    var ONE_DAY_MS = 24 * 3600000;
    var ownActive = ownList.filter(function(p) { return p && !p.cancelled; });
    var ownCheckins = ownActive.filter(function(p) { return p.type === 'checkin' && p.startsAt <= nowMs && p.endsAt > nowMs; });
    var ownPlans = ownActive.filter(function(p) {
      if (p.type !== 'planned') return false;
      if (p.source === 'tournament') {
        var liveT = (p.tournamentId && typeof window._findTournamentById === 'function') ? window._findTournamentById(p.tournamentId) : null;
        var w = (liveT && typeof window._computeTournamentPlanWindow === 'function') ? window._computeTournamentPlanWindow(liveT) : null;
        if (!w) return false; // torneio sem data/hora/local atual (ex.: virou Liga, multi-dia ou data removida)
        p.startsAt = w.startsAt; p.endsAt = w.endsAt; p.venueName = w.venueName || p.venueName; // mostra a data viva
        p._tournName = (liveT && liveT.name) || ''; // v2.8.59: nome do torneio no plano de ida
        if (p.startsAt <= nowMs) return false;
        return (p.startsAt - nowMs) <= ONE_DAY_MS; // só ≤24h antes
      }
      return p.startsAt > nowMs;
    });
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
              '<div style="font-weight:700;color:var(--text-bright);font-size:0.84rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">📍 Você está em <span style="color:var(--sp-c-10b981,#10b981);">' + pVenue + '</span>' + (pSports ? ' <span style="font-weight:500;color:var(--text-muted);">· ' + _safe(pSports) + '</span>' : '') + '</div>' +
              '<div style="font-size:0.7rem;color:var(--text-muted);">expira em <b data-countdown-target="' + endsAt + '">…</b></div>' +
            '</div>' +
            '<button type="button" class="cancel-x-btn" onclick="window._dashCancelPresence(\'' + docId + '\')" style="--cx-size:24px;" title="Sair do local">✕</button>' +
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
              '<div style="font-weight:700;color:var(--text-bright);font-size:0.84rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Você estará em <span style="color:var(--sp-c-a5b4fc,#a5b4fc);">' + pVenue + '</span>' + (pSports ? ' <span style="font-weight:500;color:var(--text-muted);">· ' + _safe(pSports) + '</span>' : '') + '</div>' +
              (p._tournName ? '<div style="font-size:0.7rem;color:var(--sp-c-fbbf24,#fbbf24);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">🏆 ' + _safe(p._tournName) + '</div>' : '') +
              '<div style="font-size:0.7rem;color:var(--text-muted);">' + _safe(dayLabel) + ' às <b>' + _safe(hhmm) + '</b></div>' +
            '</div>' +
            '<button type="button" class="cancel-x-btn" onclick="window._dashCancelPresence(\'' + docId + '\')" style="--cx-size:24px;" title="Cancelar plano">✕</button>' +
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
