/* tabela de cor ausente (teste headless) => devolve a cor crua, como antes da 2.0.94 */
if (typeof window !== 'undefined' && !window._spCor) window._spCor = function (c) { return c; };
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
          <div style="font-size:0.8rem;font-weight:700;color:var(--sp-c-c4b5fd,#c4b5fd);margin-bottom:6px;">💡 ${_t('rules.scoringHowTitle')}</div>
          <div style="font-size:0.82rem;color:var(--text-main);line-height:1.5;">${_t('rules.scoringHowManualTb', { trigger: tbFinal, points: tbPoints, margin: tbMargin })}</div>
        </div>`
      : `<div style="margin-top:1rem;padding:0.9rem 1rem;background:rgba(96,165,250,0.08);border:1px solid rgba(96,165,250,0.2);border-radius:10px;">
          <div style="font-size:0.8rem;font-weight:700;color:var(--sp-c-93c5fd,#93c5fd);margin-bottom:6px;">💡 ${_t('rules.scoringHowTitle')}</div>
          <div style="font-size:0.82rem;color:var(--text-main);line-height:1.5;">${_t('rules.scoringHowManualNoTb')}</div>
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
      if (typeof window._gsmBuildDescFromValues === 'function') {
        return window._gsmBuildDescFromValues(sc.setsToWin || 1, sc.gamesPerSet || 6, sc.tiebreakEnabled,
          sc.tiebreakPoints || 7, sc.superTiebreak, sc.superTiebreakPoints || 10, sc.tiebreakAt);
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

  // Regulamento publicado do Neon. Mudanças editoriais de 16/10/2026: 24 duplas
  // Fem Light (duas por time na quinta e a terceira na sexta), cinco outras
  // categorias com oito duplas cada. Isso NÃO altera o motor nem os dados.
  const neonRegulationHtml = isNeon ? `
    <section class="card" data-neon-regulation style="max-width:900px;margin:0 auto 1.5rem;color:var(--text-main);line-height:1.65;">
      <h3 style="color:var(--text-bright);margin:0 0 1rem;">NEON NIGHTMARE – THE TOURNAMENT</h3>
      <p>O NEON NIGHTMARE – THE TOURNAMENT é um torneio de Beach Tennis organizado pela Diretoria Social de Beach Tennis do Clube Paineiras do Morumby, exclusivo para sócios a partir de 14 anos.</p>

      <h4 style="color:var(--text-bright);margin:1.5rem 0 0.5rem;">DATAS</h4>
      <p>Quinta-feira, 22/10/2026: duplas femininas Light 1 e 2 de cada equipe, Power e Extreme.<br>
      Sexta-feira, 23/10/2026: dupla feminina Light 3 de cada equipe e duplas masculinas Light, Power e Extreme.<br>
      Início dos jogos: 18h<br>Chegada obrigatória: 17h30<br>Quadras: 4, 5, 6, 7, 8 e 9.</p>

      <h4 style="color:var(--text-bright);margin:1.5rem 0 0.5rem;">INSCRIÇÕES</h4>
      <p>As inscrições serão realizadas em duplas previamente formadas por atletas do mesmo sexo.</p>
      <p>Apenas um dos atletas deverá iniciar a inscrição pelo app TFSports e enviar o link ao parceiro, que terá 1 hora para concluir sua própria inscrição. A vaga da dupla somente estará garantida após a conclusão das inscrições dos dois atletas.</p>
      <p>Valor individual: R$ 149,90 + taxa de serviço de R$ 9,90.</p>

      <h4 style="color:var(--text-bright);margin:1.5rem 0 0.5rem;">CATEGORIAS</h4>
      <p>LIGHT – Iniciante/D<br>POWER – C/B<br>EXTREME – B/A</p>
      <p>Serão disponibilizadas 64 vagas para duplas: 24 Light Feminino, 8 Power Feminino, 8 Extreme Feminino, 8 Light Masculino, 8 Power Masculino e 8 Extreme Masculino.</p>
      <p>Na quinta-feira jogarão 32 duplas: 16 Light Feminino, 8 Power Feminino e 8 Extreme Feminino. Na sexta-feira jogarão 32 duplas: 8 Light Feminino e 8 de cada categoria masculina.</p>
      <p>Cada dupla competirá exclusivamente contra duplas da mesma categoria. As duplas Light Feminino de sexta-feira jogarão apenas entre si; não haverá jogos mistos.</p>
      <p>A escolha da categoria é de responsabilidade dos atletas no momento da inscrição. A organização reserva-se o direito de realocar atletas e/ou duplas para uma categoria superior ou inferior caso identifique incompatibilidade de nível ou sempre que necessário para garantir o equilíbrio técnico do torneio.</p>
      <p>Não será permitida a participação em mais de uma categoria.</p>

      <h4 style="color:var(--text-bright);margin:1.5rem 0 0.5rem;">EQUIPES</h4>
      <p>Após o encerramento das inscrições, os atletas serão distribuídos por sorteio em 8 equipes:</p>
      <p>BLACKOUT · BLAST · ECLIPSE · PANIC · PHANTOM · VENOM · VOLT · VORTEX</p>
      <p>Cada equipe será formada por 3 duplas Light Feminino e por 1 dupla de cada uma das outras categorias: Power Feminino, Extreme Feminino, Light Masculino, Power Masculino e Extreme Masculino. Ao final dos dois dias, cada equipe terá 8 duplas e 16 atletas: 10 mulheres e 6 homens.</p>

      <h4 style="color:var(--text-bright);margin:1.5rem 0 0.5rem;">FORMATO DE DISPUTA</h4>
      <p>As partidas serão disputadas em 1 set até 6 games. Em caso de 5x5, será disputado tie-break. Cada dupla disputará 3 jogos.</p>
      <p>A classificação será definida pelo SALDO DE GAMES, calculado pela diferença entre games ganhos e games perdidos.</p>
      <p>No dia 22/10, as duplas femininas Light 1 e 2, Power e Extreme iniciam o saldo de suas equipes. No dia 23/10, a terceira dupla Light Feminino de cada equipe e as duplas masculinas continuam a disputa a partir do saldo acumulado na quinta-feira.</p>
      <p>Ao final dos jogos de sexta-feira, será campeã a equipe que apresentar o maior saldo geral de games, considerando os resultados femininos e masculinos.</p>
      <p>Não haverá semifinal ou final. Haverá uma única equipe campeã.</p>
      <p>Em caso de empate no saldo geral de games, os critérios serão, nesta ordem:</p>
      <ol><li>Maior número total de vitórias</li><li>Maior número total de games vencidos</li><li>Sorteio realizado pela organização</li></ol>

      <h4 style="color:var(--text-bright);margin:1.5rem 0 0.5rem;">KIT ATLETA</h4>
      <p>Todos os participantes regularmente inscritos receberão o kit atleta oficial do evento. A retirada será realizada na Track&amp;Field Pátio Guedala, em data e horário a serem comunicados posteriormente.</p>
      <p>O uso da camiseta oficial do evento será obrigatório durante as partidas.</p>

      <h4 style="color:var(--text-bright);margin:1.5rem 0 0.5rem;">PREMIAÇÃO</h4>
      <p>A equipe campeã será formada por 16 atletas: 10 mulheres e 6 homens das categorias Light, Power e Extreme.</p>
      <p>A cerimônia de premiação acontecerá no sábado, 24/10, durante o THE HORROR EXPERIENCE – THE FINAL CHAPTER OF NEON NIGHTMARE: THE AWARDS.</p>

      <h4 style="color:var(--text-bright);margin:1.5rem 0 0.5rem;">IMPORTANTE</h4>
      <p>A inscrição implica a aceitação integral do regulamento e das decisões da organização e da arbitragem.</p>
      <p>O torneio preza pelo fair play, respeito e espírito esportivo. Casos omissos ou situações excepcionais serão resolvidos pela organização em conjunto com a arbitragem.</p>
    </section>` : '';

  container.innerHTML = `
    ${window._renderBackHeader({ href: '#tournaments/' + t.id, label: _t('rules.back') })}

    <div class="d-flex justify-between align-center mb-4" style="flex-wrap:wrap;gap:1rem;">
      <div>
        <h2 style="margin:0;">${isNeon ? 'Regulamento' : _t('rules.title')}</h2>
        ${isNeon ? '' : `<p class="text-muted" style="margin:4px 0 0;">${_t('rules.subtitle')}</p>`}
      </div>
      <span class="badge badge-info" style="font-size:0.85rem;padding:6px 14px;">${t.name}</span>
    </div>

    ${neonRegulationHtml}

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

        <div style="margin-top:1.5rem;padding-top:1.25rem;border-top:1px solid var(--border-color);">
          <h4 style="margin:0 0 0.75rem;color:var(--text-bright);font-size:1rem;">🎾 ${_t('rules.scoringTitle')}</h4>
          ${scoringHtml}
          ${fasesFormatoHtml}
        </div>

        ${isOrg ? `
          <div style="margin-top:1.25rem;padding-top:1.25rem;border-top:1px solid var(--border-color);">
            <button onclick="window.openEditTournamentModal('${t.id}')" style="background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.3);color:var(--sp-c-818cf8,#818cf8);padding:8px 18px;border-radius:8px;font-weight:600;cursor:pointer;font-size:0.85rem;">
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
