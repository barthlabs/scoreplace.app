function renderRules(container, tournamentId) {
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
    const tbEnabled = sc.tiebreakEnabled;
    const tbPoints = sc.tiebreakPoints || 7;
    const tbMargin = sc.tiebreakMargin || 2;
    // TB is played when games tie at (gamesPerSet - 1) (e.g. 5-5); the final set
    // score after TB is gamesPerSet-(gamesPerSet-1) (e.g. 6-5).
    const tbStart = (gamesPerSet - 1) + '-' + (gamesPerSet - 1);
    const tbFinal = gamesPerSet + '-' + (gamesPerSet - 1);
    const superTb = sc.superTiebreak;
    const superTbPts = sc.superTiebreakPoints || 10;
    const rows = [
      [_t('rules.scoringType'), _t('rules.scoringTypeGsm')],
      [_t('rules.scoringSetsToWin'), String(setsToWin)],
      [_t('rules.scoringGamesPerSet'), String(gamesPerSet)],
      [_t('rules.scoringCounting'), counting],
      [_t('rules.scoringAdvantage'), adv],
      [_t('rules.scoringTiebreak'), tbEnabled ? _t('rules.scoringTbEnabled', { trigger: tbStart, points: tbPoints, margin: tbMargin }) : _t('rules.scoringTbDisabled')],
    ];
    if (superTb) rows.push([_t('rules.scoringSuperTb'), _t('rules.scoringSuperTbEnabled', { points: superTbPts })]);
    const listHtml = rows.map(([label, value]) => `
      <li style="padding:0.6rem 0;border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;flex-wrap:wrap;">
        <span style="color:var(--text-muted);font-size:0.85rem;">${label}</span>
        <span style="font-weight:600;color:var(--text-bright);font-size:0.85rem;text-align:right;">${value}</span>
      </li>`).join('');
    const howToHtml = tbEnabled
      ? `<div style="margin-top:1rem;padding:0.9rem 1rem;background:rgba(168,85,247,0.08);border:1px solid rgba(168,85,247,0.2);border-radius:10px;">
          <div style="font-size:0.8rem;font-weight:700;color:#c4b5fd;margin-bottom:6px;">💡 ${_t('rules.scoringHowTitle')}</div>
          <div style="font-size:0.82rem;color:var(--text-main);line-height:1.5;">${_t('rules.scoringHowManualTb', { trigger: tbFinal, points: tbPoints, margin: tbMargin })}</div>
        </div>`
      : `<div style="margin-top:1rem;padding:0.9rem 1rem;background:rgba(96,165,250,0.08);border:1px solid rgba(96,165,250,0.2);border-radius:10px;">
          <div style="font-size:0.8rem;font-weight:700;color:#93c5fd;margin-bottom:6px;">💡 ${_t('rules.scoringHowTitle')}</div>
          <div style="font-size:0.82rem;color:var(--text-main);line-height:1.5;">${_t('rules.scoringHowManualNoTb')}</div>
        </div>`;
    return `<ul style="list-style:none;padding:0;margin:0;">${listHtml}</ul>${howToHtml}`;
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
            <div style="flex-shrink:0;width:10px;height:10px;border-radius:50%;background:${isFirst ? 'var(--text-muted)' : 'var(--primary-color)'};margin-top:5px;"></div>
            <div>
              <div style="font-size:0.8rem;font-weight:700;color:var(--text-bright);">${date}</div>
              <div style="font-size:0.85rem;color:var(--text-muted);margin-top:2px;">${window._safeHtml(log.message || log.action || '—')}</div>
            </div>
          </div>`;
      }).join('')
    : `<p style="color:var(--text-muted);font-size:0.85rem;">${_t('rules.noActions')}</p>`;

  const isOrg = typeof window.AppStore.isOrganizer === 'function' && window.AppStore.isOrganizer(t);

  container.innerHTML = `
    ${window._renderBackHeader({ href: '#tournaments/' + t.id, label: _t('rules.back') })}

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
            [_t('rules.start'), formatDate(t.startDate)],
            [_t('rules.end'), formatDate(t.endDate)],
            [_t('rules.visibility'), t.isPublic ? _t('rules.public') : _t('rules.private')],
            [_t('rules.resultEntry'), resultEntryLabel],
          ].map(([label, value]) => `
            <li style="padding:0.85rem 0;border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;flex-wrap:wrap;">
              <span style="color:var(--text-muted);font-size:0.9rem;">${label}</span>
              <span style="font-weight:600;color:var(--text-bright);font-size:0.9rem;text-align:right;">${value}</span>
            </li>`).join('')}

          ${(t.format === 'Eliminatórias Simples' || t.format === 'Dupla Eliminatória') ? `
            <li style="padding:0.85rem 0;border-bottom:1px solid var(--border-color);">
              <div style="color:var(--text-muted);font-size:0.9rem;margin-bottom:6px;">${_t('rules.finalRanking')}</div>
              <div style="font-weight:600;color:var(--text-bright);">${t.elimRankingType === 'blocks' ? _t('rules.rankBlocks') : _t('rules.rankIndividual')}</div>
            </li>
            <li style="padding:0.85rem 0;">
              <div style="color:var(--text-muted);font-size:0.9rem;margin-bottom:8px;">${_t('rules.tiebreakers')}</div>
              <ol style="padding-left:18px;margin:0;">${tiebreakersHtml}</ol>
            </li>` : ''}

          ${t.format === 'Liga' ? `
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

        <div style="margin-top:1.5rem;padding-top:1.25rem;border-top:1px solid var(--border-color);">
          <h4 style="margin:0 0 0.75rem;color:var(--text-bright);font-size:1rem;">🎾 ${_t('rules.scoringTitle')}</h4>
          ${scoringHtml}
        </div>

        ${isOrg ? `
          <div style="margin-top:1.25rem;padding-top:1.25rem;border-top:1px solid var(--border-color);">
            <button onclick="window.openEditTournamentModal('${t.id}')" style="background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.3);color:#818cf8;padding:8px 18px;border-radius:8px;font-weight:600;cursor:pointer;font-size:0.85rem;">
              ✏️ ${_t('rules.editRules')}
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
}
