// Render e upload do arquivo original, independentes de nomes ou IDs de torneios.
(function () {
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  window._regulationControls = function(t, regulation) {
    if (!window._souOrganizador(t)) return '';
    return '<div class="card mb-3" data-regulation-controls><h3>Regulamento do torneio</h3>' +
      '<p>Envie um PDF ou JPEG de até 5 MB. O arquivo original será exibido com sua arte e fontes. Para corrigir, envie uma nova versão.</p>' +
      '<input data-regulation-input type="file" accept="application/pdf,image/jpeg,.pdf,.jpg,.jpeg" hidden>' +
      '<button type="button" class="btn btn-primary" data-regulation-upload>' + (regulation ? 'Substituir ou corrigir regulamento' : 'Enviar regulamento') + '</button>' +
      '<p data-regulation-status role="status" aria-live="polite"></p></div>';
  };
  let activeBlob = null;
  window._releaseRegulationBlob = function(container) {
    if (activeBlob && (!container || activeBlob.container === container)) {
      URL.revokeObjectURL(activeBlob.url); activeBlob = null;
    }
  };
  if (window.addEventListener) window.addEventListener('hashchange', () => {
    if (activeBlob && activeBlob.hash !== window.location.hash) window._releaseRegulationBlob();
  });
  window._validRegulationAttachment = function(t, r) {
    if (!r || r.version !== 1 || !uuid.test(r.revision || '') || !['application/pdf','image/jpeg'].includes(r.contentType)) return false;
    const ext = r.contentType === 'application/pdf' ? 'pdf' : 'jpg';
    return !r.url && r.storagePath === 'tournamentRegulations/' + t.id + '/' + r.revision + '.' + ext &&
      Number.isInteger(r.sizeBytes) && r.sizeBytes > 0 && r.sizeBytes <= 5 * 1024 * 1024 && /^[0-9a-f]{64}$/.test(r.sha256 || '');
  };
  window._renderRegulationAttachment = function(container, t, regulation, controls) {
    window._releaseRegulationBlob();
    const header = window._renderBackHeader({ href:'#tournaments/' + t.id, label:'Voltar' });
    if (!window._validRegulationAttachment(t, regulation)) {
      container.innerHTML = header + controls + '<p role="alert">O arquivo do regulamento não pôde ser validado. A organização pode substituir o arquivo.</p>';
      window._bindRegulationUpload(container, t, regulation); return;
    }
    container.innerHTML = header + controls + '<h2>Regulamento</h2><p>' + esc(regulation.fileName || 'Regulamento') + '</p>' +
      '<div data-regulation-reader role="status">Abrindo regulamento…</div>';
    window._bindRegulationUpload(container, t, regulation);
    const reader = container.querySelector('[data-regulation-reader]');
    window.FirestoreDB.loadTournamentRegulationFile(t.id, regulation.revision).then(async result => {
      if (container.querySelector('[data-regulation-reader]') !== reader) return;
      const r = result && result.regulation;
      if (!window._validRegulationAttachment(t, r) || r.revision !== regulation.revision || r.sha256 !== regulation.sha256 || typeof result.base64 !== 'string' || result.base64.length > 6990520) throw new Error('Arquivo do regulamento inválido.');
      const text = atob(result.base64), bytes = Uint8Array.from(text, c => c.charCodeAt(0));
      if (bytes.length !== r.sizeBytes) throw new Error('Arquivo do regulamento incompleto.');
      if (crypto.subtle) {
        const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2,'0')).join('');
        if (hash !== r.sha256) throw new Error('O arquivo não passou na conferência.');
      }
      if (container.querySelector('[data-regulation-reader]') !== reader) return;
      const url = URL.createObjectURL(new Blob([bytes], {type:r.contentType}));
      window._releaseRegulationBlob(); activeBlob = {container,url,hash:window.location.hash};
      const view = r.contentType === 'application/pdf'
        ? '<iframe data-regulation-document title="Regulamento do torneio" src="' + url + '#toolbar=1" style="display:block;width:100%;height:78vh;min-height:550px;border:1px solid var(--border-color);border-radius:12px;"></iframe>'
        : '<img data-regulation-document alt="Regulamento do torneio" src="' + url + '" style="display:block;width:100%;height:auto;">';
      reader.removeAttribute('role');
      reader.innerHTML = '<p><a class="btn btn-primary" href="' + url + '" target="_blank" rel="noopener">Abrir original</a> ' +
        '<a class="btn btn-secondary" href="' + url + '" download="' + esc(r.fileName || 'Regulamento') + '">Baixar arquivo</a></p>' + view;
    }).catch(() => {
      if (container.querySelector('[data-regulation-reader]') !== reader) return;
      reader.setAttribute('role','alert'); reader.innerHTML = '<p>Não foi possível abrir o regulamento. Recarregue para conferir a versão atual.</p><button class="btn btn-secondary" type="button" data-regulation-retry>Tentar novamente</button>';
      reader.querySelector('[data-regulation-retry]').onclick = () => renderRules(container, t.id);
    });
  };
  window._bindRegulationUpload = function(container, t, regulation) {
    if (!container.querySelector) return;
    const button = container.querySelector('[data-regulation-upload]'), input = container.querySelector('[data-regulation-input]');
    if (!button || !input) return;
    button.onclick = () => input.click();
    input.onchange = async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const status = container.querySelector('[data-regulation-status]');
      if (!['application/pdf','image/jpeg'].includes(file.type) || !file.size || file.size > 5 * 1024 * 1024) {
        status.textContent = 'Envie um PDF ou JPEG de até 5 MB.'; input.value = ''; return;
      }
      button.disabled = true; input.disabled = true; status.textContent = 'Enviando e conferindo o regulamento…';
      const epoch = {}; container._regulationEpoch = epoch;
      try {
        const dataUrl = await new Promise((resolve,reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
        const request = { tournamentId:t.id, sandbox:String(t.id).startsWith('sb_'), requestId:crypto.randomUUID(),
          expectedRevision:regulation && regulation.revision || '', fileName:file.name, dataUrl };
        const send = () => window._callCF('uploadTournamentRegulation', request, { unauth:'Entre na sua conta para enviar o regulamento.', falha:'Não foi possível enviar o regulamento.' });
        let reply;
        try { reply = await send(); }
        catch (error) {
          // Resposta perdida após commit: o mesmo requestId recupera o recibo sem duplicar a troca.
          if (!(error instanceof TypeError) && !['functions/internal','functions/unavailable','functions/deadline-exceeded'].includes(error && error.code)) throw error;
          reply = await send();
        }
        const result = reply && reply.data || reply;
        if (!result || result.ok !== true || !result.regulation) throw new Error('O servidor não confirmou o regulamento.');
        if (container._regulationEpoch !== epoch || !container.contains(button)) return;
        renderRules(container, t.id, { regulation:result.regulation });
        const nextStatus = container.querySelector('[data-regulation-status]');
        if (nextStatus) nextStatus.textContent = result.superseded ? 'Exibindo a versão atual, substituída por outro envio.' : 'Regulamento atualizado.';
      } catch (error) {
        if (container._regulationEpoch === epoch && container.contains(button)) status.textContent = error && error.message || 'Não foi possível enviar. O regulamento anterior continua disponível.';
      } finally { button.disabled = false; input.disabled = false; input.value = ''; }
    };
  };
})();

/* tabela de cor ausente (teste headless) => devolve a cor crua, como antes da 2.0.94 */
if (typeof window !== 'undefined' && !window._spCor) window._spCor = function (c) { return c; };
function renderRules(container, tournamentId, regulationState) {
  window._releaseRegulationBlob(container);
  const _t = window._t || function(k) { return k; };
  const tId = tournamentId || window._lastActiveTournamentId;
  const t = tId && window.AppStore ? window._findTournamentById(tId) : null;

  if (!t) {
    container.innerHTML = `
      <div class="card" style="text-align:center; padding: 3rem;">
        <h3 style="color: var(--text-bright);">${_t('rules.notFound')}</h3>
        <p class="text-muted">${_t('rules.selectTournament')}</p>
        <a href="#dashboard" class="btn btn-primary" style="margin-top:1rem; display:inline-block;">Dashboard</a>
      </div>`;
    return;
  }

  // A referência vem da subcoleção; nunca é guardada no objeto serializável do torneio.
  if (!regulationState && window.FirestoreDB && window.FirestoreDB.loadTournamentRegulation) {
    const epoch = {};
    container._regulationEpoch = epoch;
    container.innerHTML = window._renderBackHeader({ href: '#tournaments/' + t.id, label: _t('rules.back') }) +
      '<p data-regulation-loading role="status">Carregando regulamento…</p>';
    const loading = container.querySelector('[data-regulation-loading]');
    window.FirestoreDB.loadTournamentRegulation(t.id).then(regulation => {
      if (container._regulationEpoch === epoch && container.querySelector('[data-regulation-loading]') === loading) renderRules(container, t.id, { regulation });
    }).catch(() => {
      if (container._regulationEpoch !== epoch || !container.querySelector('[data-regulation-loading]')) return;
      container.innerHTML = window._renderBackHeader({ href: '#tournaments/' + t.id, label: _t('rules.back') }) +
        '<p role="alert">Não foi possível carregar o regulamento. Reabra esta página para tentar novamente.</p>';
    });
    return;
  }
  const regulation = regulationState && regulationState.regulation || null;
  const regulationControls = window._regulationControls(t, regulation);
  if (regulation) {
    window._renderRegulationAttachment(container, t, regulation, regulationControls);
    return;
  }

  const formatDate = (d) => {
    if (!d) return '—';
    try {
      const datePart = d.includes('T') ? d.split('T')[0] : d;
      const timePart = d.includes('T') ? d.split('T')[1] : '';
      const [y, m, dd] = datePart.split('-');
      let result = dd + '/' + m + '/' + y;
      if (timePart) result += ' ' + timePart.substring(0, 5);
      return result;
    } catch (e) { return d; }
  };

  const resultEntryLabel = {
    organizer: _t('rules.resultOrganizer'),
    players: _t('rules.resultPlayers'),
    referee: _t('rules.resultReferee')
  }[t.resultEntry || 'organizer'];

  const enrollmentLabel = {
    individual: _t('rules.enrollIndividual'),
    time: _t('rules.enrollTeams'),
    misto: _t('rules.enrollMixed')
  }[t.enrollmentMode || 'individual'];

  // A ficha descreve a configuração do torneio inteiro. Quando há fases
  // canônicas, o rótulo histórico do topo não pode decidir se há eliminatória
  // ou classificatória por pontos — um torneio pode conter ambas.
  const canonicalPhases = Array.isArray(t.phases) && t.phases.some((phase) => phase && phase.kind);
  const hasEliminationPhase = canonicalPhases
    ? t.phases.some((phase) => phase && phase.kind === 'elimination')
    : (t.format === 'Eliminatórias Simples' || t.format === 'Dupla Eliminatória');
  const hasRoundRobinPhase = canonicalPhases
    ? t.phases.some((phase) => phase && phase.kind === 'classification' && (!phase.classification || phase.classification.structure !== 'groups'))
    : t.format === 'Liga';

  const formatInfo = () => {
    const f = t.format || 'Eliminatórias Simples';
    let extra = '';
    if (f === 'Suíço Clássico') extra = `<span style="color:var(--text-muted);"> — ${t.swissRounds || 5} rodadas</span>`;
    if (f === 'Liga') {
      const per = { weekly: _t('rules.weekly'), biweekly: _t('rules.biweekly'), monthly: _t('rules.monthly'), custom: _t('rules.customPeriod') }[t.ligaPeriodicity] || '—';
      extra = `<span style="color:var(--text-muted);"> — Periodicidade: ${per}</span>`;
    }
    return f + extra;
  };

  const tiebreakersHtml = (t.tiebreakers && t.tiebreakers.length)
    ? t.tiebreakers.map((tb, i) => `<li style="padding:4px 0; color:var(--text-muted);">${i + 1}. ${tb}</li>`).join('')
    : `<li style="color:var(--text-muted);">${_t('rules.notConfigured')}</li>`;

  const categoriesText = (t.categories && t.categories.length) ? t.categories.join(', ') : _t('rules.singleCategory');

  // ── Scoring system block (documents how results are entered, including
  // the trigger score that reveals the tiebreak inputs) ─────────────────
  const scoringHtml = (() => {
    const sc = t.scoring || {};
    if (!sc.type) {
      return `<div style="color:var(--text-muted);font-size:0.85rem;">${_t('rules.scoringSimpleDesc')}</div>`;
    }
    if (sc.type === 'simple') {
      return `<div style="color:var(--text-muted);font-size:0.85rem;">${_t('rules.scoringSimpleDesc')}</div>`;
    }
    // GSM: sets with games
    const setsToWin = sc.setsToWin || 1;
    const gamesPerSet = sc.gamesPerSet || 6;
    const counting = sc.countingType === 'tennis' ? _t('rules.scoringCountingTennis') : _t('rules.scoringCountingNumeric');
    const adv = sc.advantageRule ? _t('rules.scoringAdvantageDeuce') : _t('rules.scoringAdvantageSudden');
    const tieRule = sc.tieRule || (sc.tiebreakEnabled === false ? 'extend' : 'tiebreak');
    const tbEnabled = tieRule === 'tiebreak';
    const tbPoints = sc.tiebreakPoints || 7;
    const tbMargin = sc.tiebreakMargin || 2;
    // TB is played when games tie at (gamesPerSet - 1) (e.g. 5-5); the final set
    // score after TB is gamesPerSet-(gamesPerSet-1) (e.g. 6-5).
    const tieAt = typeof window._tbLoserGames === 'function' ? window._tbLoserGames(sc, t.sport) : gamesPerSet - 1;
    const tbStart = tieAt + '-' + tieAt;
    const tbFinal = (tieAt + 1) + '-' + tieAt;
    const superTb = sc.superTiebreak;
    const superTbPts = sc.superTiebreakPoints || 10;
    const rows = [
      [_t('rules.scoringType'), _t('rules.scoringTypeGsm')],
      [_t('rules.scoringSetsToWin'), String(setsToWin)],
      [sc.customRulesVersion===1 && sc.fixedSet ? (sc.setTwoPointAdvantage!==false?'Mínimo de games disputados':'Total de games disputados') : _t('rules.scoringGamesPerSet'), String(sc.fixedSet && sc.customRulesVersion===1?sc.fixedSetGames||gamesPerSet:gamesPerSet)],
      [_t('rules.scoringCounting'), counting],
      [_t('rules.scoringAdvantage'), adv],
      [_t('rules.scoringTiebreak'), tbEnabled ? _t('rules.scoringTbEnabled', { trigger: tbStart, points: tbPoints, margin: tbMargin })
        : tieRule === 'decider' ? _t('rules.scoringDecider', { trigger: tbStart }) : _t('rules.scoringExtend')],
    ];
    if(sc.customRulesVersion===1){
      rows.push(['Exigir dois games de diferença',sc.setTwoPointAdvantage!==false?'Sim':'Não']);
      rows.push(['Exigir dois pontos no TB/STB',sc.tiebreakTwoPointAdvantage!==false?'Sim':'Não']);
      if(superTb && Number(setsToWin)===1)rows.push(['Super tie-break','Substitui o único set por '+superTbPts+' pontos']);
    }
    if (superTb) rows.push([_t('rules.scoringSuperTb'), _t('rules.scoringSuperTbEnabled', { points: superTbPts })]);
    const listHtml = rows.map(([label, value]) => `
      <li style="padding:0.6rem 0;border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;flex-wrap:wrap;">
        <span style="color:var(--text-muted);font-size:0.85rem;">${label}</span>
        <span style="font-weight:600;color:var(--text-bright);font-size:0.85rem;text-align:right;">${value}</span>
      </li>`).join('');
    const howToHtml = tbEnabled
      ? `<div style="margin-top:1rem;padding:0.9rem 1rem;background:rgba(168,85,247,0.08);border:1px solid rgba(168,85,247,0.2);border-radius:10px;">
          <div style="font-size:0.8rem;font-weight:700;color:var(--sp-c-c4b5fd,#c4b5fd);margin-bottom:6px;">💡 ${_t('rules.scoringHowTitle')}</div>
          <div style="font-size:0.82rem;color:var(--text-main);line-height:1.5;">${_t('rules.scoringHowManualTb', { trigger: tbFinal, points: tbPoints, margin: tbMargin })}</div>
        </div>`
      : `<div style="margin-top:1rem;padding:0.9rem 1rem;background:rgba(96,165,250,0.08);border:1px solid rgba(96,165,250,0.2);border-radius:10px;">
          <div style="font-size:0.8rem;font-weight:700;color:var(--sp-c-93c5fd,#93c5fd);margin-bottom:6px;">💡 ${_t('rules.scoringHowTitle')}</div>
          <div style="font-size:0.82rem;color:var(--text-main);line-height:1.5;">${tieRule === 'decider' ? _t('rules.scoringHowManualDecider', { trigger: tbFinal }) : _t('rules.scoringHowManualNoTb')}</div>
        </div>`;
    return `<ul style="list-style:none;padding:0;margin:0;">${listHtml}</ul>${howToHtml}`;
  })();

  // ── FASES COM FORMATO PRÓPRIO (v1.9.111) ────────────────────────────────────
  // O bloco acima descreve t.scoring — o formato da fase INICIAL. Desde que cada fase pode
  // ter o seu (cfg.eliminatoria.scoring → phases[i].scoring), esta tela mentiria sozinha:
  // diria "1 set" enquanto a eliminatória joga melhor de 3. Quem manda no jogo é
  // window._effectiveScoring(t, match); aqui só CONTAMOS isso a quem lê as regras.
  const fasesFormatoHtml = (() => {
    const fases = Array.isArray(t.phases) ? t.phases : [];
    const proprias = fases.map((p, i) => ({ p: p || {}, i }))
      .filter(x => x.p.scoring && x.p.scoring.type && x.p.scoring.type !== 'simple');
    if (!proprias.length) return '';
    const desc = (sc) => {
      if(sc.customRulesVersion===1 && window._gsmDescribeCustomRules)return window._gsmDescribeCustomRules(sc);
      if (typeof window._gsmBuildDescFromValues === 'function') {
        return window._gsmBuildDescFromValues(sc.setsToWin || 1, sc.gamesPerSet || 6, sc.tiebreakEnabled,
          sc.tiebreakPoints || 7, sc.superTiebreak, sc.superTiebreakPoints || 10, sc.tiebreakAt, sc.tieRule);
      }
      const s = sc.setsToWin || 1, g = sc.gamesPerSet || 6;
      return (s === 1) ? (g + ' games') : ((s * 2 - 1) + ' sets de ' + g + ' games');
    };
    const nomeFase = (ph, i) => window._safeHtml(ph.name || ('Fase ' + (i + 1)));
    const linhas = proprias.map(x => `
      <li style="padding:0.6rem 0;border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;flex-wrap:wrap;">
        <span style="color:var(--text-muted);font-size:0.85rem;">${nomeFase(x.p, x.i)}</span>
        <span style="font-weight:600;color:var(--text-bright);font-size:0.85rem;text-align:right;">${window._safeHtml(desc(x.p.scoring))}</span>
      </li>`).join('');
    // As demais fases seguem o formato do bloco de cima — dizer isso evita a leitura errada
    // de que a tabela acima virou irrelevante.
    const herdam = fases.map((p, i) => ({ p: p || {}, i }))
      .filter(x => !(x.p.scoring && x.p.scoring.type && x.p.scoring.type !== 'simple'));
    const notaHerda = herdam.length
      ? `<div style="font-size:0.78rem;color:var(--text-muted);margin-top:8px;line-height:1.45;">As demais fases (${herdam.map(x => nomeFase(x.p, x.i)).join(', ')}) jogam no formato descrito acima.</div>`
      : '';
    return `
      <div style="margin-top:1.25rem;padding:0.9rem 1rem;background:rgba(251,191,36,0.08);border:1px solid rgba(251,191,36,0.25);border-radius:10px;">
        <div style="font-size:0.8rem;font-weight:700;color:var(--sp-c-fbbf24,#fbbf24);margin-bottom:6px;">🎾 Formato por fase</div>
        <ul style="list-style:none;padding:0;margin:0;">${linhas}</ul>
        ${notaHerda}
      </div>`;
  })();

  const organizerFlowHtml = (() => {
    if (!(t.rulesContractVersion >= 2) || !t.fmt2) return '';
    const cfg = t.fmt2, e = cfg.eliminatoria || {}, safe = window._safeHtml || (x => String(x == null ? '' : x)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;'));
    const lines = [];
    lines.push(cfg.classifAtiva === false ? 'Entrada direta na eliminatória.' :
      ('Classificatória em ' + (cfg.grupos || 1) + ' grupo(s); ' +
        (e.ativa === false ? 'título pela classificação, sem disputa de 3º/4º.' : 'segue para eliminatória.')));
    if (cfg.classifAtiva !== false && e.ativa !== false) {
      lines.push(e.qualifyAll ? 'Todos avançam.' :
        ('Avançam ' + (cfg.classificados || 1) + ' por ' +
          (cfg.classifScope === 'per_group' ? 'grupo' : 'classificação geral') + '.'));
      const extras = e.bestNextByGroup || {};
      if (extras.count > 0) lines.push('Mais ' + extras.count + ' vaga(s) para os melhores colocados seguintes entre grupos; comparação por ' +
        ({ points_per_game: 'pontos por jogo', win_rate: 'aproveitamento de vitórias', total_points: 'pontos totais' }[extras.metric] || extras.metric) + '.');
    }
    if (e.ativa !== false) {
      const names = Array.isArray(e.nomes) ? e.nomes : [];
      lines.push((e.dupla ? 'Dupla eliminatória clássica' : 'Eliminatória simples') +
        ' com ' + (e.linhas || 1) + ' chave(s)' +
        (e.dupla ? '.' : ': ' + Array.from({ length: e.linhas || 1 }, (_, i) => names[i] || ('Chave ' + (i + 1))).join(', ') + '.'));
      if (e.lineAssignment === 'rank_ranges') (e.lineRankRanges || []).forEach((range, i) => {
        lines.push((names[i] || ('Chave ' + (i + 1))) + ': colocados do ' + range.from + 'º ao ' + range.to + 'º.');
      });
      if (e.dupla || Number(e.linhas || 1) > 1) lines.push(e.grandFinal === false
        ? 'As chaves encerram com campeões próprios.' : 'Os campeões das chaves disputam a final geral.');
      if (e.grandFinalReset === true) lines.push('A final da dupla eliminatória prevê partida de reinício se o vencedor da chave inferior ganhar a primeira.');
      if (Number(e.finalSeriesBestOf || 1) > 1) lines.push('A final é uma série de até ' + e.finalSeriesBestOf + ' partidas; vence quem atingir a maioria.');
    }
    if (cfg.rankingSitOutScoring && cfg.rankingSitOutScoring.mode) {
      const mode = cfg.rankingSitOutScoring;
      lines.push('Pontuação da folga no ranking: ' + (mode.mode === 'average' ? 'média dinâmica recalculada' :
        mode.mode === 'zero' ? 'zero' : String(mode.points || 0) + ' pontos fixos') + '.');
    }
    return '<div style="margin-top:1.25rem;padding:0.9rem 1rem;background:rgba(129,140,248,.08);border:1px solid rgba(129,140,248,.25);border-radius:10px;line-height:1.5;font-size:.85rem;">' +
      '<b>Fluxo definido pela organização</b><ul style="margin:7px 0 0;padding-left:19px;">' +
      lines.map(line => '<li>' + safe(line) + '</li>').join('') + '</ul></div>';
  })();

  const historyHtml = (t.history && t.history.length)
    ? [...t.history].reverse().slice(0, 20).map((log, i) => {
        let date = '—';
        if (log.date) {
          const dateObj = new Date(log.date);
          if (!isNaN(dateObj.getTime())) {
            date = dateObj.toLocaleString('pt-BR');
          }
        }
        const isFirst = i === (Math.min(t.history.length, 20) - 1);
        return `
          <div style="display:flex;gap:12px;margin-bottom:1.25rem;position:relative;">
            <div style="flex-shrink:0;width:10px;height:10px;border-radius:50%;background:${window._spCor(isFirst ? 'var(--text-muted)' : 'var(--primary-color)', 'background')};margin-top:5px;"></div>
            <div>
              <div style="font-size:0.8rem;font-weight:700;color:var(--text-bright);">${date}</div>
              <div style="font-size:0.85rem;color:var(--text-muted);margin-top:2px;">${window._safeHtml(log.message || log.action || '—')}</div>
            </div>
          </div>`;
      }).join('')
    : `<p style="color:var(--text-muted);font-size:0.85rem;">${_t('rules.noActions')}</p>`;

  const isOrg = window._souOrganizador(t);
  const isNeon = !!(window._isNeonTournament && window._isNeonTournament(t));

  // O documento aprovado pela organização é a fonte visual e textual única.
  // Não reconstruir o PDF em HTML: isso perde diagramação e pode divergir do original.
  if (isNeon) {
    const pdfUrl = '/assets/regulamento-neon-nightmare-2026.pdf';
    container.innerHTML = `
      ${window._renderBackHeader({ href: '#tournaments/' + t.id, label: _t('rules.back') })}
      ${regulationControls}
      <div class="d-flex justify-between align-center mb-4" style="flex-wrap:wrap;gap:1rem;">
        <h2 style="margin:0;">Regulamento</h2>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
          <a class="btn btn-primary" href="${pdfUrl}" target="_blank" rel="noopener">Abrir PDF original</a>
          <a class="btn btn-secondary" href="${pdfUrl}" download="Regulamento_NEON_NIGHTMARE_2026.pdf">Baixar PDF</a>
        </div>
      </div>
      <iframe data-neon-regulation title="Regulamento oficial NEON NIGHTMARE 2026" src="${pdfUrl}#toolbar=1" style="display:block;width:100%;height:min(78vh,1100px);min-height:600px;border:1px solid var(--border-color);border-radius:12px;background:#fff;"></iframe>`;
    window._bindRegulationUpload(container, t, regulation);
    return;
  }

  container.innerHTML = `
    ${window._renderBackHeader({ href: '#tournaments/' + t.id, label: _t('rules.back') })}
    ${regulationControls}

    <div class="d-flex justify-between align-center mb-4" style="flex-wrap:wrap;gap:1rem;">
      <div>
        <h2 style="margin:0;">${_t('rules.title')}</h2>
        <p class="text-muted" style="margin:4px 0 0;">${_t('rules.subtitle')}</p>
      </div>
      <span class="badge badge-info" style="font-size:0.85rem;padding:6px 14px;">${t.name}</span>
    </div>

    <div style="display:grid;grid-template-columns:2fr 1fr;gap:1.5rem;" class="rules-grid">

      <!-- Regras Atuais -->
      <div class="card">
        <h3 class="card-title mb-3">${_t('rules.currentParams')}</h3>

        <ul style="list-style:none;padding:0;margin:0;">
          ${[
            [_t('rules.format'), formatInfo()],
            [_t('rules.sport'), (t.sport ? t.sport.replace(/^[^\w\u00C0-\u024F]+/u, '').trim() : '') || '—'],
            [_t('rules.categories'), categoriesText],
            [_t('rules.enrollMode'), enrollmentLabel],
            [_t('rules.maxParticipants'), t.maxParticipants ? t.maxParticipants + ' ' + _t('rules.participants') : _t('rules.noLimit')],
            [_t('rules.enrollUntil'), formatDate(t.registrationLimit)],
            // v1.6.83: fim do TORNEIO (última fase), não t.endDate cru (= fim da fase inicial).
            [_t('rules.start'), formatDate(t.startDate)],
            [_t('rules.end'), formatDate(window._tournamentEndDate ? window._tournamentEndDate(t) : t.endDate)],
            [_t('rules.visibility'), t.isPublic ? _t('rules.public') : _t('rules.private')],
            [_t('rules.resultEntry'), resultEntryLabel],
          ].map(([label, value]) => `
            <li style="padding:0.85rem 0;border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;flex-wrap:wrap;">
              <span style="color:var(--text-muted);font-size:0.9rem;">${label}</span>
              <span style="font-weight:600;color:var(--text-bright);font-size:0.9rem;text-align:right;">${value}</span>
            </li>`).join('')}

          ${hasEliminationPhase ? `
            <li style="padding:0.85rem 0;border-bottom:1px solid var(--border-color);">
              <div style="color:var(--text-muted);font-size:0.9rem;margin-bottom:6px;">${_t('rules.finalRanking')}</div>
              <div style="font-weight:600;color:var(--text-bright);">${t.elimRankingType === 'blocks' ? _t('rules.rankBlocks') : _t('rules.rankIndividual')}</div>
            </li>
            <li style="padding:0.85rem 0;">
              <div style="color:var(--text-muted);font-size:0.9rem;margin-bottom:8px;">${_t('rules.tiebreakers')}</div>
              <ol style="padding-left:18px;margin:0;">${tiebreakersHtml}</ol>
            </li>` : ''}

          ${hasRoundRobinPhase ? `
            <li style="padding:0.85rem 0;border-bottom:1px solid var(--border-color);">
              <span style="color:var(--text-muted);font-size:0.9rem;">${_t('rules.ligaEnrollDuring')}</span>
              <span style="font-weight:600;color:var(--text-bright);">${t.ligaOpenEnrollment !== false ? _t('rules.ligaOpen') : _t('rules.ligaClosed')}</span>
            </li>
            <li style="padding:0.85rem 0;border-bottom:1px solid var(--border-color);">
              <span style="color:var(--text-muted);font-size:0.9rem;">${_t('rules.ligaNewPlayer')}</span>
              <span style="font-weight:600;color:var(--text-bright);">${
                { zero: _t('rules.scoreZero'), min: _t('rules.scoreMin'), avg: _t('rules.scoreAvg'), organizer: _t('rules.scoreOrg') }[t.ligaNewPlayerScore || 'zero']
              }</span>
            </li>
            <li style="padding:0.85rem 0;">
              <span style="color:var(--text-muted);font-size:0.9rem;">${_t('rules.ligaInactivity')}</span>
              <span style="font-weight:600;color:var(--text-bright);">${
                { keep: _t('rules.inactKeep'), decay: _t('rules.inactDecay'), remove: _t('rules.inactRemove', { rounds: t.ligaInactivityX || 3 }) }[t.ligaInactivity || 'keep']
              }</span>
            </li>` : ''}
        </ul>

        ${organizerFlowHtml}
        ${t.fmt2 && t.fmt2.tieResolution ? `<div style="margin-top:1.25rem;padding:0.9rem 1rem;background:rgba(129,140,248,.08);border:1px solid rgba(129,140,248,.25);border-radius:10px;line-height:1.5;font-size:.85rem;">
          <b>Empate residual na definição dos destinos</b><br>
          ${t.fmt2.tieResolution === 'singles_then_draw'
            ? 'Depois de todos os critérios de desempate, dois atletas ainda empatados podem jogar uma simples; três podem disputar um triangular de simples, em que todos se enfrentam. Cada jogo extra recebe o número do último jogo da classificação que gerou o empate, seguido de letras em sequência (A, B, C…). O triangular ordena por vitórias, saldo de sets e saldo de games. Na hora do avanço, se não houver tempo, a organização registra a dispensa dos jogos e usa a ordem do sorteio original. Se o triangular continuar empatado, essa mesma ordem original é o último recurso.'
            : 'Depois de todos os critérios de desempate, vale a ordem do sorteio original. Não há novo sorteio na hora do avanço.'}
        </div>` : ''}

        <div style="margin-top:1.5rem;padding-top:1.25rem;border-top:1px solid var(--border-color);">
          <h4 style="margin:0 0 0.75rem;color:var(--text-bright);font-size:1rem;">🎾 ${_t('rules.scoringTitle')}</h4>
          ${scoringHtml}
          ${fasesFormatoHtml}
        </div>

        ${isOrg ? `
          <div style="margin-top:1.25rem;padding-top:1.25rem;border-top:1px solid var(--border-color);">
            <button onclick="window.openEditTournamentModal('${t.id}')" style="background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.3);color:var(--sp-c-818cf8,#818cf8);padding:8px 18px;border-radius:8px;font-weight:600;cursor:pointer;font-size:0.85rem;">
              ${_t('rules.editRules')} ${window._editPencilHtml?.() || ''}
            </button>
          </div>` : ''}
      </div>

      <!-- Log de Transparência -->
      <div class="card">
        <h3 class="card-title mb-3">${_t('rules.transparencyLog')}</h3>
        <div style="border-left:2px solid var(--border-color);padding-left:1rem;margin-left:0.5rem;position:relative;max-height:500px;overflow-y:auto;">
          ${historyHtml}
        </div>
      </div>

    </div>

    <style>
      @media (max-width: 768px) {
        .rules-grid { grid-template-columns: 1fr !important; }
      }
    </style>
  `;
  window._bindRegulationUpload(container, t, regulation);
}
