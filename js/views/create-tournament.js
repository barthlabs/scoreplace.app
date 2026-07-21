// ── Game Set Match Scoring Defaults by Sport ──
// DERIVADO da FONTE ÚNICA window.SPORT_RULES (js/views/sport-rules.js, carregado antes deste).
// Regra de uma modalidade mudou/estava errada? Mude LÁ, num lugar só — propaga pra cá (torneio)
// e pro _casualDefaults (casual). Dependência fixa (sem fallback): se não carregou, estoura.
window._sportScoringDefaults = window._sportScoringDefaultsMap();

function setupCreateTournamentModal() {
  // ═══ RENDER CANÔNICA DE CONFIG DE FASE (v2.6.61) — definida ANTES do template ═══
  // v4.4.x (Camada 2): SÓ existe a Fase 1 (idx 0). O ramo idx>=1 (construtor de fases 2+ /
  // _extraPhases) foi REMOVIDO. Gravam no hidden da Fase 1 (save/load do topo intocados).
  // — Bloco 1: W.O. (ausência) —
  window._phaseWoVal = function(idx) {
    var h = document.getElementById('wo-scope'); return (h && h.value) || 'individual';
  };
  window._setPhaseWo = function(idx, val) {
    var h = document.getElementById('wo-scope'); if (h) h.value = val; var box = document.getElementById('phase-wo-buttons-0'); if (box) box.outerHTML = window._woButtonsHtml(0);
  };
  // v2.6.71: W.O. volta a ser UM toggle único (igual à Fase 1 original): ligado = só o
  // ausente sai (Individual); desligado = time inteiro sai. Render canônica p/ todas as fases.
  window._woButtonsHtml = function(idx) {
    var T = window._t || function(k){ return k; };
    var indiv = window._phaseWoVal(idx) !== 'time';
    var icon = indiv ? '👤' : '👥';
    var title = indiv ? 'Individual' : (T('create.woTeam') || 'Time Inteiro');
    var desc = indiv ? T('create.woIndividualOnDesc') : T('create.woIndividualOffDesc');
    return '<div id="phase-wo-buttons-' + idx + '">'
      + '<div class="toggle-row" style="padding:8px 12px;border-radius:10px;border:1px solid rgba(239,68,68,0.25);background:rgba(239,68,68,0.08);">'
      + '<div class="toggle-row-label" style="gap:8px;"><span class="toggle-icon">' + icon + '</span><div><span style="font-weight:600;color:var(--text-color);font-size:0.88rem;">' + title + '</span><div class="toggle-desc" style="font-size:0.72rem;margin-top:2px;">' + desc + '</div></div></div>'
      + '<label class="toggle-switch" style="--toggle-on-bg:#f87171;--toggle-on-glow:rgba(248,113,113,0.3);--toggle-on-border:#f87171;"><input type="checkbox"' + (indiv ? ' checked' : '') + ' onchange="window._setPhaseWo(' + idx + ', this.checked ? \'individual\' : \'time\')"><span class="toggle-slider"></span></label>'
      + '</div></div>';
  };
  // — Bloco 2: Lançamento de Resultados (multi-seleção: organizador/jogadores/árbitro) —
  window._phaseReVal = function(idx) {
    var h = document.getElementById('select-result-entry');
    var raw = (h && h.value) || 'organizer';
    var arr; try { arr = JSON.parse(raw); } catch (e) { arr = raw; }
    if (!Array.isArray(arr)) arr = [arr];
    return arr.length ? arr : ['organizer'];
  };
  window._togglePhaseResultEntry = function(idx, role) {
    var arr = window._phaseReVal(idx);
    var p = arr.indexOf(role);
    if (p !== -1) arr.splice(p, 1); else arr.push(role);
    if (!arr.length) arr = ['organizer']; // nunca tudo-off
    var h = document.getElementById('select-result-entry');
    if (h) h.value = arr.length === 1 ? arr[0] : JSON.stringify(arr);
    var box = document.getElementById('phase-re-buttons-0');
    if (box) box.outerHTML = window._resultEntryButtonsHtml(0);
  };
  window._resultEntryButtonsHtml = function(idx) {
    var T = window._t || function(k){ return k; };
    var val = window._phaseReVal(idx);
    function rowt(role, icon, labelKey, descKey) {
      var on = val.indexOf(role) !== -1;
      return '<div class="toggle-row" style="padding:8px 12px;border-radius:10px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.03);">'
        + '<div class="toggle-row-label" style="gap:8px;"><span class="toggle-icon">' + icon + '</span><div><span style="font-weight:600;color:var(--text-color);font-size:0.88rem;">' + T(labelKey) + '</span><div class="toggle-desc" style="font-size:0.72rem;margin-top:2px;">' + T(descKey) + '</div></div></div>'
        + '<label class="toggle-switch" style="--toggle-on-bg:#3b82f6;--toggle-on-glow:rgba(59,130,246,0.3);--toggle-on-border:#3b82f6;"><input type="checkbox"' + (on ? ' checked' : '') + ' onchange="window._togglePhaseResultEntry(' + idx + ',\'' + role + '\')"><span class="toggle-slider"></span></label>'
        + '</div>';
    }
    var h = '<div id="phase-re-buttons-' + idx + '" style="display:flex;flex-direction:column;gap:8px;">';
    h += rowt('organizer', '📋', 'create.resultOrg', 'create.resultOrgDesc');
    h += rowt('players', '🏓', 'create.resultPlayersLabel', 'create.resultPlayersDesc');
    h += rowt('referee', '🧑‍⚖️', 'create.resultRefereeLabel', 'create.resultRefereeDesc');
    h += '</div>';
    return h;
  };
  // — Bloco 2b: Classificação (Personalizada × Em blocos) — grava no hidden #elim-ranking-type
  //   da Fase 1 (save `elimRankingType` intacto). Só existe a Fase 1 (idx 0).
  window._phaseRankingVal = function(idx) {
    var h = document.getElementById('elim-ranking-type'); return (h && h.value === 'blocks') ? 'blocks' : 'individual';
  };
  window._setPhaseRankingType = function(idx, val) {
    val = (val === 'blocks') ? 'blocks' : 'individual';
    var h = document.getElementById('elim-ranking-type'); if (h) h.value = val;
    var box = document.getElementById('phase-classif-0'); if (box) box.outerHTML = window._classifModeHtml(0);
  };
  window._classifModeHtml = function(idx) {
    var T = window._t || function(k){ return k; };
    var val = window._phaseRankingVal(idx);
    function btn(v, label) {
      var act = (val === v);
      return '<button type="button" onclick="window._setPhaseRankingType(' + idx + ',\'' + v + '\')" style="flex:1;padding:10px 14px;border-radius:10px;font-size:0.82rem;cursor:pointer;transition:all 0.15s;' + (act ? 'border:2px solid #f87171;background:rgba(248,113,113,0.12);color:#fca5a5;font-weight:600;' : 'border:2px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.05);color:var(--text-main);font-weight:500;') + 'text-align:center;">' + label + '</button>';
    }
    return '<div id="phase-classif-' + idx + '">'
      + (idx === 0 ? '<input type="hidden" id="elim-third-place" value="true"><input type="hidden" id="elim-ranking-type" value="' + val + '">' : '')
      + '<div style="display:flex;gap:8px;">' + btn('individual', T('create.rankingPersonalized')) + btn('blocks', T('create.rankingBlocks')) + '</div>'
      + '<small class="text-muted" style="display:block;margin-top:6px;">' + T('create.rankingTypeHint') + '</small>'
      + '</div>';
  };
  // — Bloco 3: Pontuação Avançada (GSM) da Fase 1. idx 0 = IDs sem sufixo (save/load/motor
  //   intactos). Construtor de fases 2+ removido (Camada 2) — só existe a Fase 1. —
  // Fonte ÚNICA dos valores/estados SUGERIDOS da Pontuação Avançada. O render (`row`) e o
  // reset (`_resetAdvScoring`) leem daqui — sem drift. `_applyLive` é o default do toggle
  // "Aplicar pontos de placar ao vivo".
  var _ADV_SCORING_DEFAULTS = {
    participation:  { value: 150,  enabled: true },
    match_won:      { value: 150,  enabled: true },
    game_won:       { value: 50,   enabled: true },
    game_lost:      { value: -20,  enabled: true },
    tiebreak_point: { value: 2,    enabled: true },
    wo_penalty:     { value: -100, enabled: true },
    killing_point:  { value: 10,   enabled: false },
    point_scored:   { value: 1,    enabled: false },
    _applyLive: true
  };
  window._ADV_SCORING_DEFAULTS = _ADV_SCORING_DEFAULTS;
  window._advScoringHtml = function(idx, initialDisplay, advData) {
    var T = window._t || function(k){ return k; };
    var s = idx === 0 ? '' : ('-' + idx);
    var disp = initialDisplay || 'none';
    var cats = (advData && advData.categories) || null;
    var enabledOn = !!(advData && advData.enabled);
    var applyLiveOn = !advData || advData.applyLiveScoring !== false;
    function row(key, label, desc, val, checked) {
      // Default canônico do mapa (fonte única); o arg literal só serve de fallback.
      var _d = _ADV_SCORING_DEFAULTS[key];
      if (_d) { val = _d.value; checked = _d.enabled; }
      if (cats && cats[key]) { checked = !!cats[key].enabled; val = (cats[key].value != null ? cats[key].value : val); }
      return '<div class="adv-row" data-adv-key="' + key + '" style="display:flex; align-items:center; gap:10px; padding:8px 10px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:8px;">'
        + '<label class="toggle-switch toggle-sm" style="flex-shrink:0;"><input type="checkbox" class="adv-enabled"' + (checked ? ' checked' : '') + '><span class="toggle-slider"></span></label>'
        + '<div style="flex:1; min-width:0;"><div style="font-size:0.82rem; font-weight:600;">' + T(label) + '</div><div style="font-size:0.68rem; color:var(--text-muted);">' + T(desc) + '</div></div>'
        + '<input type="number" class="adv-value form-control" value="' + val + '" style="width:70px; flex-shrink:0; text-align:center; padding:4px 6px; font-size:0.85rem;">'
        + '</div>';
    }
    var h = '<div id="adv-scoring-section' + s + '" style="display:' + disp + '; background: rgba(251,191,36,0.06); border: 1px solid rgba(251,191,36,0.2); border-radius: 12px; padding: 1rem; margin-bottom: 1rem;">';
    h += '<div class="toggle-row" style="padding:0; margin-bottom:10px;">';
    h += '<div class="toggle-row-label"><span style="font-size:0.85rem;font-weight:700;color:#fbbf24;">💯 ' + T('create.advScoringTitle') + '</span><div style="font-size:0.72rem;color:var(--text-muted);margin-top:2px;">' + T('create.advScoringDesc') + '</div></div>';
    h += '<label class="toggle-switch toggle-sm"><input type="checkbox" id="adv-scoring-enabled' + s + '"' + (enabledOn ? ' checked' : '') + ' onchange="window._onAdvScoringToggle(' + idx + ')"><span class="toggle-slider"></span></label>';
    h += '</div>';
    h += '<div id="adv-scoring-body' + s + '" style="display:' + (enabledOn ? 'block' : 'none') + '; margin-top:12px;">';
    h += '<div style="display:flex; justify-content:flex-end; margin-bottom:8px;"><button type="button" onclick="window._resetAdvScoring(' + idx + ')" style="padding:5px 12px; border-radius:8px; border:1px solid rgba(251,191,36,0.35); background:rgba(251,191,36,0.1); color:#fbbf24; font-size:0.74rem; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:5px;">↺ ' + T('create.advResetBtn') + '</button></div>';
    h += '<p style="font-size:0.7rem; color:#10b981; font-weight:600; text-transform:uppercase; letter-spacing:1px; margin:0 0 8px;">' + T('create.advScoringGroupA') + '</p>';
    h += '<div style="display:flex; flex-direction:column; gap:6px; margin-bottom:14px;">';
    h += row('participation', 'create.advParticipation', 'create.advParticipationDesc', '150', true);
    h += row('match_won', 'create.advMatchWon', 'create.advMatchWonDesc', '150', true);
    h += row('game_won', 'create.advGameWon', 'create.advGameWonDesc', '50', true);
    h += row('game_lost', 'create.advGameLost', 'create.advGameLostDesc', '-20', true);
    h += row('tiebreak_point', 'create.advTiebreakPoint', 'create.advTiebreakPointDesc', '2', true);
    h += row('wo_penalty', 'create.advWoPenalty', 'create.advWoPenaltyDesc', '-100', true);
    h += '</div>';
    h += '<p style="font-size:0.7rem; color:#f87171; font-weight:600; text-transform:uppercase; letter-spacing:1px; margin:0 0 8px;">' + T('create.advScoringGroupB') + '</p>';
    h += '<div style="font-size:0.7rem; color:var(--text-muted); margin-bottom:8px; padding:6px 10px; background:rgba(248,113,113,0.06); border-radius:6px; border-left:2px solid #f87171;">ⓘ ' + T('create.advScoringGroupBWarn') + '</div>';
    h += '<div style="display:flex; align-items:center; gap:10px; padding:9px 11px; background:rgba(248,113,113,0.08); border:1px solid rgba(248,113,113,0.25); border-radius:8px; margin-bottom:8px;">';
    h += '<label class="toggle-switch toggle-sm" style="flex-shrink:0;"><input type="checkbox" id="adv-apply-live' + s + '"' + (applyLiveOn ? ' checked' : '') + ' onchange="window._onAdvApplyLiveToggle(' + idx + ')"><span class="toggle-slider"></span></label>';
    h += '<div style="flex:1; min-width:0;"><div style="font-size:0.82rem; font-weight:700; color:#f87171;">' + T('create.advApplyLive') + '</div><div style="font-size:0.68rem; color:var(--text-muted);">' + T('create.advApplyLiveDesc') + '</div></div>';
    h += '</div>';
    h += '<div style="display:flex; flex-direction:column; gap:6px;">';
    h += row('killing_point', 'create.advKillingPoint', 'create.advKillingPointDesc', '10', false);
    h += row('point_scored', 'create.advPointScored', 'create.advPointScoredDesc', '1', false);
    h += '</div>';
    h += '<div style="font-size:0.7rem; color:var(--text-muted); margin-top:10px; font-style:italic;">' + T('create.advScoringFloorNote') + '</div>';
    h += '</div></div>';
    return h;
  };
  // Lê a Pontuação Avançada de uma fase a partir do DOM (idx 0 = Fase 1; idx>=1 = extra).
  window._readAdvScoring = function(idx) {
    var s = idx === 0 ? '' : ('-' + idx);
    var enEl = document.getElementById('adv-scoring-enabled' + s);
    if (!enEl) return null;
    var catsObj = {};
    Array.prototype.forEach.call(document.querySelectorAll('#adv-scoring-body' + s + ' .adv-row'), function(row){
      var key = row.dataset.advKey; if (!key) return;
      var en = row.querySelector('.adv-enabled'); var val = row.querySelector('.adv-value');
      catsObj[key] = { enabled: !!(en && en.checked), value: val ? (parseInt(val.value, 10) || 0) : 0 };
    });
    var apply = document.getElementById('adv-apply-live' + s);
    return { enabled: !!enEl.checked, categories: catsObj, applyLiveScoring: apply ? !!apply.checked : true };
  };
  // Restaura os VALORES/estados sugeridos da Pontuação Avançada (sem mexer no toggle mestre
  // "Sistema de Pontos Avançado" — isso é a escolha de usar ou não o sistema).
  window._resetAdvScoring = function(idx) {
    var T = window._t || function(k){ return k; };
    var s = idx === 0 ? '' : ('-' + idx);
    var body = document.getElementById('adv-scoring-body' + s);
    if (!body) return;
    Array.prototype.forEach.call(body.querySelectorAll('.adv-row'), function(rw){
      var key = rw.dataset.advKey; var d = _ADV_SCORING_DEFAULTS[key]; if (!d) return;
      var en = rw.querySelector('.adv-enabled'); var val = rw.querySelector('.adv-value');
      if (en) en.checked = !!d.enabled;
      if (val) val.value = d.value;
    });
    var apply = document.getElementById('adv-apply-live' + s);
    if (apply) apply.checked = _ADV_SCORING_DEFAULTS._applyLive !== false;
    if (window.showNotification) window.showNotification('💯 ' + T('create.advResetBtn'), T('create.advResetToast'), 'success');
  };
  if (!document.getElementById('modal-create-tournament')) {
    const modalHtml = `
      <div class="modal-overlay" id="modal-create-tournament">
        <div class="modal" style="max-width: 800px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 16px; max-height: 90%; overflow-y: auto; overflow-x: hidden;">
          <!-- Back header placeholder — populated by _renderBackHeader + action buttons in setupCreateTournamentModal -->
          <div id="create-tournament-header-host"></div>
          <h2 id="create-modal-title" style="display:none;">${_t('create.modalTitle')}</h2>
          <div class="modal-body" style="padding: 1.5rem; color: var(--text-main); overflow-x: hidden; max-width: 100%; box-sizing: border-box;">
            <form id="form-create-tournament" onsubmit="event.preventDefault();" style="max-width: 100%; overflow-x: hidden;">
              <input type="hidden" id="edit-tournament-id">

              <!-- Nome e Modalidade -->
              <div class="d-flex gap-2 mb-3">
                <div class="form-group full-width">
                  <label class="form-label">${_t('create.nameLabel')}</label>
                  <input type="text" class="form-control" id="tourn-name" placeholder="Ex: Copa de Inverno 2026" required>
                </div>
                <div class="form-group full-width">
                  <label class="form-label">${_t('create.sportLabel')}</label>
                  <!-- Hidden select for backward compatibility -->
                  <select class="form-control" id="select-sport" onchange="window._onSportChange()" style="display:none;">
                    <option>🎾 Beach Tennis</option>
                    <option>🥒 Pickleball</option>
                    <option>🎾 Tênis</option>
                    <option>🏓 Tênis de Mesa</option>
                    <option>🏸 Padel</option>
                    <option>🏐 Vôlei de Praia</option>
                    <option>⚽ Futevôlei</option>
                  </select>
                  <div id="sport-buttons" style="display:flex;gap:6px;flex-wrap:wrap;">
                    <button type="button" class="sport-btn sport-btn-active" data-sport="🎾 Beach Tennis" onclick="window._selectSport(this)" style="padding:6px 12px;border-radius:10px;font-size:0.8rem;cursor:pointer;transition:all 0.15s;white-space:nowrap;border:2px solid #fbbf24;background:rgba(251,191,36,0.15);color:#fbbf24;font-weight:600;">${(window._sportIcon && window._sportIcon('Beach Tennis')) || '🎾'} Beach Tennis</button>
                    <button type="button" class="sport-btn" data-sport="🥒 Pickleball" onclick="window._selectSport(this)" style="padding:6px 12px;border-radius:10px;font-size:0.8rem;cursor:pointer;transition:all 0.15s;white-space:nowrap;border:2px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.06);color:var(--text-main);font-weight:500;">${(window._sportIcon && window._sportIcon('Pickleball')) || '🥒'} Pickleball</button>
                    <button type="button" class="sport-btn" data-sport="🎾 Tênis" onclick="window._selectSport(this)" style="padding:6px 12px;border-radius:10px;font-size:0.8rem;cursor:pointer;transition:all 0.15s;white-space:nowrap;border:2px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.06);color:var(--text-main);font-weight:500;">${(window._sportIcon && window._sportIcon('Tênis')) || '🎾'} Tênis</button>
                    <button type="button" class="sport-btn" data-sport="🏓 Tênis de Mesa" onclick="window._selectSport(this)" style="padding:6px 12px;border-radius:10px;font-size:0.8rem;cursor:pointer;transition:all 0.15s;white-space:nowrap;border:2px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.06);color:var(--text-main);font-weight:500;">${(window._sportIcon && window._sportIcon('Tênis de Mesa')) || '🏓'} Tênis de Mesa</button>
                    <button type="button" class="sport-btn" data-sport="🏸 Padel" onclick="window._selectSport(this)" style="padding:6px 12px;border-radius:10px;font-size:0.8rem;cursor:pointer;transition:all 0.15s;white-space:nowrap;border:2px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.06);color:var(--text-main);font-weight:500;">${(window._sportIcon && window._sportIcon('Padel')) || '🏸'} Padel</button>
                    <button type="button" class="sport-btn" data-sport="🏐 Vôlei de Praia" onclick="window._selectSport(this)" style="padding:6px 12px;border-radius:10px;font-size:0.8rem;cursor:pointer;transition:all 0.15s;white-space:nowrap;border:2px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.06);color:var(--text-main);font-weight:500;">${(window._sportIcon && window._sportIcon('Vôlei de Praia')) || '🏐'} Vôlei de Praia</button>
                    <button type="button" class="sport-btn" data-sport="⚽ Futevôlei" onclick="window._selectSport(this)" style="padding:6px 12px;border-radius:10px;font-size:0.8rem;cursor:pointer;transition:all 0.15s;white-space:nowrap;border:2px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.06);color:var(--text-main);font-weight:500;">${(window._sportIcon && window._sportIcon('Futevôlei')) || '⚽'} Futevôlei</button>
                  </div>
                </div>
              </div>

              <!-- Logo do Torneio -->
              <div id="logo-section" style="background: rgba(99,102,241,0.06); border: 1px solid rgba(99,102,241,0.15); border-radius: 12px; padding: 1rem; margin-bottom: 1rem;">
                <p style="margin: 0 0 0.75rem; font-size: 0.8rem; color: #a5b4fc; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">${_t('create.logoSection')}</p>
                <div style="display: flex; align-items: flex-start; gap: 1rem; flex-wrap: wrap;">
                  <div id="logo-preview" style="width: 80px; height: 80px; border-radius: 16px; border: 2px dashed rgba(99,102,241,0.3); display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0; background: rgba(0,0,0,0.2);">
                    <span style="font-size: 0.7rem; color: var(--text-muted); text-align: center; padding: 4px;">${_t('create.noLogo')}</span>
                  </div>
                  <div style="display: flex; flex-direction: column; gap: 6px; flex: 1; min-width: 180px;">
                    <button type="button" onclick="window._generateTournamentLogo()" style="padding: 8px 16px; border-radius: 10px; border: 1px solid rgba(99,102,241,0.3); background: rgba(99,102,241,0.15); color: #a5b4fc; font-size: 0.8rem; font-weight: 600; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 6px; justify-content: center;" onmouseover="this.style.background='rgba(99,102,241,0.25)'" onmouseout="this.style.background='rgba(99,102,241,0.15)'">
                      🎨 ${_t('create.genLogo')}
                    </button>
                    <div style="display: flex; gap: 6px;">
                      <button type="button" onclick="window._generateTournamentLogo()" title="Regerar logo" style="padding: 8px 10px; border-radius: 10px; border: 1px solid rgba(99,102,241,0.2); background: rgba(99,102,241,0.08); color: #a5b4fc; font-size: 0.8rem; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(99,102,241,0.18)'" onmouseout="this.style.background='rgba(99,102,241,0.08)'">
                        🔄
                      </button>
                      <button type="button" id="btn-logo-lock" onclick="window._toggleLogoLock()" title="Travar logo (não regera ao salvar)" style="padding: 8px 10px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); color: var(--text-muted); font-size: 0.8rem; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='rgba(255,255,255,0.05)'">
                        🔓
                      </button>
                      <button type="button" onclick="window._downloadTournamentLogo()" title="Baixar logo" style="padding: 8px 10px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); color: var(--text-muted); font-size: 0.8rem; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='rgba(255,255,255,0.05)'">
                        ⬇️
                      </button>
                      <button type="button" onclick="document.getElementById('logo-file-input').click()" title="Upload de arquivo" style="padding: 8px 10px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); color: var(--text-muted); font-size: 0.8rem; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='rgba(255,255,255,0.05)'">
                        📁
                      </button>
                      <button type="button" onclick="window._clearTournamentLogo()" title="Remover logo" style="padding: 8px 10px; border-radius: 10px; border: 1px solid rgba(239,68,68,0.2); background: rgba(239,68,68,0.08); color: #f87171; font-size: 0.8rem; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(239,68,68,0.15)'" onmouseout="this.style.background='rgba(239,68,68,0.08)'">
                        ✕
                      </button>
                    </div>
                    <input type="hidden" id="tourn-logo-locked" value="">
                    <input type="file" id="logo-file-input" accept="image/*" style="display:none;" onchange="window._handleLogoUpload(event)">
                    <input type="hidden" id="tourn-logo-data" value="">
                  </div>
                </div>
                <!-- Forma do logo: 1 slider contínuo. Direita = quadrado;
                     arrastando pra esquerda arredonda as arestas até virar um
                     círculo perfeito no extremo esquerdo. -->
                <div id="logo-shape-row" style="margin-top:14px;">
                  <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.7rem; color:var(--text-muted); margin-bottom:5px;">
                    <span>⚫ Círculo</span>
                    <span style="font-weight:600;">Forma do logo</span>
                    <span>Quadrado ⬛</span>
                  </div>
                  <input type="range" id="logo-forma-range" min="0" max="50" value="36" oninput="window._setLogoForma(this.value)" style="width:100%; accent-color:#6366f1;">
                  <input type="hidden" id="tourn-logo-shape" value="square">
                  <input type="hidden" id="tourn-logo-radius" value="14">
                </div>
              </div>

              <!-- Foto de fundo do torneio (v4.0.21) — se definida, substitui a do Google -->
              <div id="cover-section" style="background: rgba(99,102,241,0.06); border: 1px solid rgba(99,102,241,0.15); border-radius: 12px; padding: 1rem; margin-bottom: 1rem;">
                <p style="margin: 0 0 0.35rem; font-size: 0.8rem; color: #a5b4fc; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">🖼️ Foto de fundo do torneio</p>
                <p style="margin: 0 0 0.75rem; font-size: 0.72rem; color: var(--text-muted); line-height: 1.35;">Opcional. Se você definir, ela substitui a foto do Google nos cards e no detalhe. Ao escolher, dá pra dar zoom e arrastar pra enquadrar (sem distorcer).</p>
                <div id="cover-preview" style="width: 100%; max-width: 300px; aspect-ratio: 2/1; border-radius: 12px; border: 2px dashed rgba(99,102,241,0.3); display: flex; align-items: center; justify-content: center; overflow: hidden; background: rgba(0,0,0,0.2); background-size: cover; background-position: center; margin-bottom: 8px;">
                  <span id="cover-placeholder" style="font-size: 0.72rem; color: var(--text-muted);">Sem foto de fundo</span>
                </div>
                <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                  <button type="button" onclick="document.getElementById('cover-file-input').click()" style="padding: 8px 16px; border-radius: 10px; border: 1px solid rgba(99,102,241,0.3); background: rgba(99,102,241,0.15); color: #a5b4fc; font-size: 0.8rem; font-weight: 600; cursor: pointer;">🖼️ Escolher foto</button>
                  <button type="button" id="btn-cover-clear" onclick="window._clearCoverPhoto()" title="Remover foto de fundo" style="padding: 8px 12px; border-radius: 10px; border: 1px solid rgba(239,68,68,0.2); background: rgba(239,68,68,0.08); color: #f87171; font-size: 0.8rem; cursor: pointer; display: none;">✕ Remover</button>
                </div>
                <input type="file" id="cover-file-input" accept="image/*" style="display:none;" onchange="window._handleCoverUpload(event)">
                <input type="hidden" id="tourn-cover-data" value="">
              </div>

              <!-- Público/Privado -->
              <div class="form-group mb-2">
                <input type="hidden" id="tourn-public" value="true">
                <div style="display:flex;align-items:center;gap:10px;">
                  <label class="toggle-switch" style="flex-shrink:0;">
                    <input type="checkbox" id="toggle-public" aria-label="Tornar torneio público" checked onchange="window._setVisibility(this.checked ? 'public' : 'private')">
                    <span class="toggle-slider"></span>
                  </label>
                  <span style="font-weight:600;font-size:0.9rem;color:var(--text-bright);">🌐 ${_t('create.publicLabel')}</span>
                </div>
                <small id="vis-desc" class="text-muted" style="display:block;margin-top:6px;">${_t('create.publicDesc')}</small>
              </div>

              <!-- ═══════════ BOX FASE 1 ═══════════
                   Agrupa: Formato · Modo de Sorteio · campos condicionais ·
                   Formato das Partidas (GSM) · Categorias · Classificação.
                   A Fase 1 é o formato escolhido aqui; fases extras vêm em
                   "+ Adicionar fase" logo abaixo do box. -->
              <div id="fase1-box" style="border:1px solid rgba(129,140,248,0.35); border-radius:14px; padding:1rem; margin-bottom:1rem; background:rgba(99,102,241,0.05);">
                <div id="fase1-header-row" style="display:flex;align-items:center;gap:8px;margin-bottom:14px;">
                  <button type="button" id="fase1-collapse-btn" onclick="window._toggleFase1Collapse()" title="Colapsar/expandir fase" style="flex-shrink:0;border:none;background:rgba(99,102,241,0.2);color:#a5b4fc;width:24px;height:24px;border-radius:6px;cursor:pointer;font-size:0.85rem;font-weight:700;line-height:1;">▾</button>
                  <span style="flex-shrink:0;font-size:0.7rem;font-weight:800;color:#a5b4fc;background:rgba(99,102,241,0.2);padding:4px 10px;border-radius:7px;letter-spacing:0.5px;">FASE 1</span>
                  <input type="text" id="phase1-name" placeholder="Nome da fase (opcional)" oninput="window._phase1Name=this.value" style="flex:1;min-width:0;padding:7px 11px;border-radius:9px;border:1px solid rgba(255,255,255,0.18);background:var(--bg-darker,rgba(0,0,0,0.25));color:var(--text-main);font-size:0.85rem;box-sizing:border-box;">
                </div>

              <!-- (Estimativa de tempo da fase movida pra DEPOIS do Formato + Datas — v2.6.46) -->

              <!-- Formato -->
              <div class="form-group mb-3">
                <label class="form-label">${_t('tournament.format')}</label>
                <!-- Hidden select for backward compatibility -->
                <!-- PR 4 of the Liga-unification (v0.14.52): Suíço is no
                     longer offered as a standalone format. New tournaments
                     pick Liga + temporada=off for finite-round / dynamic
                     behavior. Suíço also remains as a resolution option in
                     the power-of-2 Nash panel (separate code path). -->
                <select class="form-control" id="select-formato" onchange="window._onFormatoChange()" style="display:none;">
                  <option value="elim_simples">Eliminatórias Simples</option>
                  <option value="elim_dupla">Dupla Eliminatória</option>
                  <option value="grupos_mata">Fase de Grupos + Eliminatórias</option>
                  <option value="liga">Liga</option>
                </select>
                <div id="formato-buttons" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">
                  <button type="button" class="formato-btn" data-fmt="pontos" onclick="window._selectFormato(this)" style="display:flex;flex-direction:column;align-items:center;gap:6px;padding:12px 6px 10px;border-radius:12px;font-size:0.7rem;cursor:pointer;transition:all 0.2s;border:2px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.05);color:var(--text-main);font-weight:700;text-align:center;line-height:1.1;">
                    <svg width="40" height="36" viewBox="0 0 40 36" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><rect x="2" y="2" width="36" height="32" rx="3" opacity=".3" fill="currentColor" stroke="none"/><rect x="2" y="2" width="36" height="32" rx="3" fill="none" opacity=".6"/><line x1="2" y1="10" x2="38" y2="10" opacity=".4"/><line x1="2" y1="18" x2="38" y2="18" opacity=".25"/><line x1="2" y1="26" x2="38" y2="26" opacity=".25"/><line x1="14" y1="2" x2="14" y2="34" opacity=".25"/><line x1="26" y1="2" x2="26" y2="34" opacity=".25"/><text x="5" y="8" font-size="5" font-weight="700" fill="currentColor" stroke="none" opacity=".5">#</text><text x="17" y="8" font-size="5" font-weight="700" fill="currentColor" stroke="none" opacity=".5">V</text><text x="29" y="8" font-size="5" font-weight="700" fill="currentColor" stroke="none" opacity=".5">P</text><circle cx="7" cy="15" r="1.5" fill="currentColor" stroke="none" opacity=".5"/><circle cx="7" cy="23" r="1.5" fill="currentColor" stroke="none" opacity=".35"/><circle cx="7" cy="31" r="1.5" fill="currentColor" stroke="none" opacity=".25"/></svg>
                    ${_t('format.league')}</button>
                  <button type="button" class="formato-btn" data-fmt="grupos" onclick="window._selectFormato(this)" style="display:flex;flex-direction:column;align-items:center;gap:6px;padding:12px 6px 10px;border-radius:12px;font-size:0.7rem;cursor:pointer;transition:all 0.2s;border:2px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.05);color:var(--text-main);font-weight:700;text-align:center;line-height:1.1;">
                    <svg width="40" height="36" viewBox="0 0 40 36" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="1" y="2" width="15" height="14" rx="2" opacity=".45" fill="currentColor" stroke="none"/><rect x="1" y="2" width="15" height="14" rx="2" fill="none"/><line x1="4" y1="7" x2="13" y2="7" opacity=".5"/><line x1="4" y1="12" x2="13" y2="12" opacity=".5"/><rect x="1" y="20" width="15" height="14" rx="2" opacity=".45" fill="currentColor" stroke="none"/><rect x="1" y="20" width="15" height="14" rx="2" fill="none"/><line x1="4" y1="25" x2="13" y2="25" opacity=".5"/><line x1="4" y1="30" x2="13" y2="30" opacity=".5"/><line x1="20" y1="9" x2="20" y2="27"/><line x1="20" y1="9" x2="28" y2="9" opacity=".6"/><line x1="20" y1="27" x2="28" y2="27" opacity=".6"/><line x1="28" y1="9" x2="28" y2="27"/><line x1="28" y1="18" x2="36" y2="18"/><circle cx="38" cy="18" r="1.8" fill="currentColor" stroke="none" opacity=".6"/></svg>
                    ${_t('format.groupsShort')}</button>
                  <button type="button" class="formato-btn formato-btn-active" data-fmt="elim" onclick="window._selectFormato(this)" style="display:flex;flex-direction:column;align-items:center;gap:6px;padding:12px 6px 10px;border-radius:12px;font-size:0.7rem;cursor:pointer;transition:all 0.2s;border:2px solid #3b82f6;background:rgba(59,130,246,0.12);color:#60a5fa;font-weight:700;text-align:center;line-height:1.1;">
                    <svg width="40" height="36" viewBox="0 0 40 36" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="2" y1="4" x2="12" y2="4" opacity=".5"/><line x1="2" y1="14" x2="12" y2="14" opacity=".5"/><line x1="12" y1="4" x2="12" y2="14"/><line x1="12" y1="9" x2="22" y2="9"/><line x1="2" y1="22" x2="12" y2="22" opacity=".5"/><line x1="2" y1="32" x2="12" y2="32" opacity=".5"/><line x1="12" y1="22" x2="12" y2="32"/><line x1="12" y1="27" x2="22" y2="27"/><line x1="22" y1="9" x2="22" y2="27"/><line x1="22" y1="18" x2="32" y2="18"/><circle cx="36" cy="18" r="3" fill="currentColor" stroke="none" opacity=".6"/></svg>
                    ${_t('format.elimination')}</button>
                </div>
                <style>#formato-buttons{grid-template-columns:repeat(3,1fr)!important}@media(max-width:600px){#formato-buttons{grid-template-columns:repeat(3,1fr)!important}}#formato-buttons .formato-btn:hover{transform:translateY(-2px);box-shadow:0 4px 12px rgba(0,0,0,0.3)}</style>
                <!-- Dupla eliminatória: sub-toggle visível só quando Eliminatórias está ativo (v2.6.66) -->
                <div id="dupla-elim-row" style="display:flex;align-items:center;gap:10px;margin-top:8px;padding:8px 12px;border-radius:10px;border:1px solid rgba(59,130,246,0.25);background:rgba(59,130,246,0.06);">
                  <label class="toggle-switch" style="flex-shrink:0;">
                    <input type="checkbox" id="toggle-dupla-elim" aria-label="Dupla eliminatória" onchange="window._toggleDuplaElim(this.checked)">
                    <span class="toggle-slider"></span>
                  </label>
                  <div><span style="font-weight:600;font-size:0.85rem;color:var(--text-bright);">${_t('format.double')}</span><div style="font-size:0.72rem;color:var(--text-muted);margin-top:2px;">${_t('create.descElimDupla')}</div></div>
                </div>
                <small class="text-muted" style="display:block;margin-top:4px;" id="formato-desc">${_t('format.elimination')} — ${_t('create.descElimSimples')}</small>
              </div>

              <!-- Datas da fase (logo abaixo do Formato) — v2.6.46 -->
              <div id="phase-dates-box" style="background:rgba(99,102,241,0.04); border:1px solid rgba(129,140,248,0.18); border-radius:10px; padding:0.6rem 0.4rem; margin-bottom:1rem;">
                <div style="font-size:0.72rem; color:#a5b4fc; font-weight:700; text-transform:uppercase; letter-spacing:0.8px; margin-bottom:0.5rem; padding-left:0.35rem;">📅 ${_t('create.phaseDatesTitle')}</div>
                <div class="dates-row" style="display:flex; gap:8px; align-items:stretch; flex-wrap:wrap;">
                  <div id="reg-date-container" style="flex:1; min-width:0; display:flex; flex-direction:column; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:8px 6px;">
                    <div style="font-size:0.7rem; font-weight:600; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">${_t('create.phaseEnrollDeadline')}</div>
                    <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin-top:auto;">
                      <input type="date" class="form-control" id="tourn-reg-date" aria-label="Data limite das inscrições da fase" style="padding:5px 3px; font-size:0.68rem; flex:1 1 0; min-width:0; white-space:nowrap; box-sizing:border-box;" oninput="window._recalcDuration()">
                      <input type="time" class="form-control" id="tourn-reg-time" aria-label="Hora limite das inscrições da fase" style="padding:5px 3px; font-size:0.74rem; width:58px; flex-shrink:0; box-sizing:border-box;" oninput="window._recalcDuration()">
                    </div>
                  </div>
                  <div style="flex:1; min-width:0; display:flex; flex-direction:column; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:8px 6px;">
                    <div style="font-size:0.7rem; font-weight:600; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">${_t('create.phaseStart')}</div>
                    <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin-top:auto;">
                      <input type="date" class="form-control" id="tourn-start-date" aria-label="Data de início da fase" style="padding:5px 3px; font-size:0.68rem; flex:1 1 0; min-width:0; white-space:nowrap; box-sizing:border-box;" required oninput="window._recalcDuration(); window._checkWeather(); window._f2RecalcRoundsFromWindow && window._f2RecalcRoundsFromWindow()">
                      <input type="time" class="form-control" id="tourn-start-time" aria-label="Hora de início da fase" style="padding:5px 3px; font-size:0.74rem; width:58px; flex-shrink:0; box-sizing:border-box;" oninput="window._recalcDuration(); window._f2RecalcRoundsFromWindow && window._f2RecalcRoundsFromWindow()">
                    </div>
                  </div>
                  <div style="flex:1; min-width:0; display:flex; flex-direction:column; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:8px 6px;">
                    <div style="font-size:0.7rem; font-weight:600; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">${_t('create.phaseEnd')}</div>
                    <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin-top:auto;">
                      <input type="date" class="form-control" id="tourn-end-date" aria-label="Data de término da fase" style="padding:5px 3px; font-size:0.68rem; flex:1 1 0; min-width:0; white-space:nowrap; box-sizing:border-box;" required oninput="window._recalcDuration(); window._f2RecalcRoundsFromWindow && window._f2RecalcRoundsFromWindow()">
                      <input type="time" class="form-control" id="tourn-end-time" aria-label="Hora de término da fase" style="padding:5px 3px; font-size:0.74rem; width:58px; flex-shrink:0; box-sizing:border-box;" oninput="window._recalcDuration(); window._f2RecalcRoundsFromWindow && window._f2RecalcRoundsFromWindow()">
                    </div>
                  </div>
                </div>
              </div>

              <!-- Inscrições durante a fase — logo abaixo do Agendamento de Sorteios (v2.6.51) -->
              <div id="late-enroll-box" style="background: rgba(251,191,36,0.06); border: 1px solid rgba(251,191,36,0.15); border-radius: 12px; padding: 1rem; margin-bottom: 1rem;">
                <p style="margin: 0 0 0.75rem; font-size: 0.8rem; color: #fbbf24; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">⏱️ ${_t('create.lateEnrollSection')}</p>
                <input type="hidden" id="late-enrollment" value="closed">
                <input type="hidden" id="new-matchups" value="false">
                <div style="display:flex;flex-direction:column;gap:8px;" id="late-enrollment-buttons">
                  <div class="toggle-row" style="padding:8px 12px;border-radius:10px;border:1px solid rgba(251,191,36,0.25);background:rgba(251,191,36,0.08);">
                    <div class="toggle-row-label" style="gap:8px;"><span class="toggle-icon" id="late-closed-icon">🚫</span><div><span id="late-closed-title" style="font-weight:600;color:var(--text-color);font-size:0.88rem;">${_t('create.lateEnrollClosed')}</span><div class="toggle-desc" id="late-closed-desc" style="font-size:0.72rem;margin-top:2px;">${_t('create.lateEnrollClosedOnDesc')}</div></div></div>
                    <label class="toggle-switch" style="--toggle-on-bg:#fbbf24;--toggle-on-glow:rgba(251,191,36,0.3);--toggle-on-border:#fbbf24;"><input type="checkbox" id="late-toggle-closed" aria-label="Inscrições fora do prazo fechadas" checked onchange="window._syncLateEnrollment('closed')"><span class="toggle-slider"></span></label>
                  </div>
                  <div class="toggle-row" style="padding:8px 12px;border-radius:10px;border:1px solid rgba(251,191,36,0.25);background:rgba(251,191,36,0.08);">
                    <div class="toggle-row-label" style="gap:8px;"><span class="toggle-icon" id="late-expand-icon">➕</span><div><span id="late-expand-title" style="font-weight:600;color:var(--text-color);font-size:0.88rem;">${_t('create.lateEnrollExpand')}</span><div class="toggle-desc" id="late-expand-desc" style="font-size:0.72rem;margin-top:2px;">${_t('create.lateEnrollExpandDisabledDesc')}</div></div></div>
                    <label class="toggle-switch" style="--toggle-on-bg:#fbbf24;--toggle-on-glow:rgba(251,191,36,0.3);--toggle-on-border:#fbbf24;"><input type="checkbox" id="late-toggle-expand" aria-label="Inscrições fora do prazo expandem lista" onchange="window._syncLateEnrollment('expand')"><span class="toggle-slider"></span></label>
                  </div>
                </div>
              </div>

              <!-- Estimativa de tempo da fase (após Formato + Datas) -->
              <div id="time-estimates-container" style="background: rgba(245,158,11,0.06); border: 1px solid rgba(245,158,11,0.15); border-radius: 10px; padding: 0.6rem 0.75rem; margin-bottom: 1rem;">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom: 0.5rem;">
                  <span style="font-size: 0.72rem; color: #f59e0b; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px;">⏱ Estimativa de tempo da fase</span>
                  <span id="duration-estimate-inline" style="font-size: 0.8rem; font-weight: 700; color: var(--text-bright); white-space: nowrap;">—</span>
                </div>
                <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap: 6px; align-items:end;">
                  <label style="display:flex; flex-direction:column; gap:2px; margin:0; min-width:0;" title="${_t('create.callTimeDesc')}">
                    <span style="font-size:0.7rem; color:var(--text-muted); font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${_t('create.callTimeLabel')}</span>
                    <div style="display:flex; align-items:center; gap:4px; background:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.08); border-radius:6px; padding:2px 6px;">
                      <input type="number" id="tourn-call-time" min="0" max="60" value="5" oninput="window._recalcDuration()" style="flex:1; min-width:0; width:100%; background:transparent; border:none; color:var(--text-bright); font-size:0.9rem; font-weight:600; padding:4px 0; outline:none;">
                      <span style="font-size:0.7rem; color:var(--text-muted);">min</span>
                    </div>
                  </label>
                  <label style="display:flex; flex-direction:column; gap:2px; margin:0; min-width:0;" title="${_t('create.warmupDesc')}">
                    <span style="font-size:0.7rem; color:var(--text-muted); font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${_t('create.warmupLabel')}</span>
                    <div style="display:flex; align-items:center; gap:4px; background:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.08); border-radius:6px; padding:2px 6px;">
                      <input type="number" id="tourn-warmup-time" min="0" max="60" value="5" oninput="window._recalcDuration()" style="flex:1; min-width:0; width:100%; background:transparent; border:none; color:var(--text-bright); font-size:0.9rem; font-weight:600; padding:4px 0; outline:none;">
                      <span style="font-size:0.7rem; color:var(--text-muted);">min</span>
                    </div>
                  </label>
                  <label style="display:flex; flex-direction:column; gap:2px; margin:0; min-width:0;" title="${_t('create.gameDurDesc')}">
                    <span style="font-size:0.7rem; color:var(--text-muted); font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${_t('create.gameDurLabel')}</span>
                    <div style="display:flex; align-items:center; gap:4px; background:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.08); border-radius:6px; padding:2px 6px;">
                      <input type="number" id="tourn-game-duration" min="5" max="300" value="30" oninput="window._recalcDuration()" style="flex:1; min-width:0; width:100%; background:transparent; border:none; color:var(--text-bright); font-size:0.9rem; font-weight:600; padding:4px 0; outline:none;">
                      <span style="font-size:0.7rem; color:var(--text-muted);">min</span>
                    </div>
                  </label>
                </div>

                <!-- Escada de estimativa: 2 pot. de 2 abaixo + real + 2 acima -->
                <div id="phase-estimate-ladder" style="margin-top:8px;"></div>

                <!-- Extra diagnostics (shown only when relevant) -->
                <div id="duration-estimate-box" style="display:none; margin-top: 0.5rem;">
                  <div id="duration-estimate-text" style="display:none;">—</div>
                  <div id="duration-estimate-detail" style="display:none;"></div>
                  <div id="duration-warning" style="display:none; padding:6px 10px; background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.25); border-radius:6px; font-size:0.78rem; color:#f87171;">
                  </div>
                  <div id="capacity-warning" style="display:none; margin-top:6px; padding:6px 10px; border-radius:6px; font-size:0.78rem;">
                  </div>
                  <div id="suggestions-panel" style="display:none; margin-top:6px; flex-direction:column; gap:6px;">
                  </div>
                </div>
              </div>

              <!-- Modo de Sorteio -->
              <div class="form-group mb-3" id="draw-mode-container">
                <label class="form-label">${_t('create.drawMode')}</label>
                <input type="hidden" id="draw-mode" value="sorteio">
                <div id="draw-mode-buttons" style="display:flex;gap:6px;flex-wrap:wrap;">
                  <button type="button" class="draw-mode-btn draw-mode-active" data-value="sorteio" onclick="window._selectDrawMode(this)" style="padding:7px 13px;border-radius:10px;font-size:0.8rem;cursor:pointer;transition:all 0.15s;white-space:nowrap;border:2px solid #34d399;background:rgba(16,185,129,0.15);color:#34d399;font-weight:600;">🎲 ${_t('create.drawModeSorteio')}</button>
                  <button type="button" class="draw-mode-btn" data-value="rei_rainha" id="btn-draw-mode-monarch" onclick="window._selectDrawMode(this)" style="padding:7px 13px;border-radius:10px;font-size:0.8rem;cursor:pointer;transition:all 0.15s;white-space:nowrap;border:2px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.06);color:var(--text-main);font-weight:600;">👑 ${_t('format.monarchShort')}</button>
                  <button type="button" class="draw-mode-btn" data-value="round_robin" id="btn-draw-mode-rr" onclick="window._selectDrawMode(this)" style="display:none;padding:7px 13px;border-radius:10px;font-size:0.8rem;cursor:pointer;transition:all 0.15s;white-space:nowrap;border:2px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.06);color:var(--text-main);font-weight:600;">🔄 Todos contra todos</button>
                </div>
                <small class="text-muted" style="display:block;margin-top:4px;" id="draw-mode-desc">${_t('create.drawModeSorteioDesc')}</small>
              </div>

              <!-- Rei/Rainha da Praia (logo abaixo do formato, visível só quando rei_rainha selecionado) -->
              <div id="rei-rainha-fields" style="display:none; background: rgba(251,191,36,0.08); border: 1px solid rgba(251,191,36,0.2); border-radius: 12px; padding: 1rem; margin-bottom: 1rem;">
                <p style="margin: 0 0 0.75rem; font-size: 0.8rem; color: #fbbf24; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">👑 ${_t('format.monarch')}</p>
                <div style="font-size:0.78rem;color:var(--text-muted);">${_t('format.monarchDesc')}</div>
                <!-- v2.6.44: controles "Classificados por grupo" + "Formação dos grupos de 4"
                     e a linha de avanço REMOVIDOS daqui — são lógica de SUCESSÃO/transição
                     entre fases e serão redesenhados na configuração da transição. Inputs
                     ocultos mantidos só com defaults pra não quebrar save/estimativa/edição. -->
                <input type="hidden" id="monarch-groupsby" value="sorteio">
              </div>

              <!-- Campos específicos: Todos contra todos -->
              <div id="round-robin-fields" style="display:none; background: rgba(99,102,241,0.08); border: 1px solid rgba(99,102,241,0.2); border-radius: 12px; padding: 1rem; margin-bottom: 1rem;">
                <p style="margin: 0 0 0.75rem; font-size: 0.8rem; color: #818cf8; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">🔄 Todos contra todos</p>
                <div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:0.75rem;">A cada turno, todos os jogadores da categoria enfrentam todos os outros (grupos de 4). O sorteio de rodadas é pré-gerado automaticamente.</div>
                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                  <label class="form-label" style="margin:0;font-size:0.8rem;">Número de turnos:</label>
                  <input type="number" class="form-control" id="liga-turnos" min="1" max="20" value="1" style="width:70px;padding:6px 8px;font-size:0.9rem;text-align:center;">
                  <span style="font-size:0.75rem;color:var(--text-muted);">Ao fim de cada turno, todos terão se enfrentado.</span>
                </div>
              </div>

              <!-- Campos específicos: Fase de Grupos -->
              <div id="grupos-fields" style="display:none; background: rgba(245,158,11,0.08); border: 1px solid rgba(245,158,11,0.2); border-radius: 12px; padding: 1rem; margin-bottom: 1rem;">
                <p style="margin: 0 0 0.75rem; font-size: 0.8rem; color: #f59e0b; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">${_t('create.gruposConfig')}</p>
                <!-- v3.0.x: divisão por SLIDER (nº de grupos × tamanho), sugerida a
                     partir do nº de inscritos. O nº de classificados foi pra transição
                     entre fases (respeitando potência de 2), não fica mais aqui.
                     grupos-count / grupos-classified ficam ocultos só pra compat de save. -->
                <input type="hidden" id="grupos-count" value="4">
                <input type="hidden" id="grupos-classified" value="2">
                <div id="grupos-suggestions" style="margin-top:4px;"></div>
                <div style="display:flex;align-items:center;gap:10px;margin-top:14px;">
                  <label class="toggle-switch" style="--toggle-on-bg:#f59e0b;--toggle-on-glow:rgba(245,158,11,0.3);--toggle-on-border:#f59e0b;flex-shrink:0;"><input type="checkbox" id="grupos-equal-only" onchange="window._renderGruposSuggestions && window._renderGruposSuggestions(); window._syncLateEnrollment && window._syncLateEnrollment()"><span class="toggle-slider"></span></label>
                  <span style="font-size:0.84rem;color:var(--text-main);">Apenas grupos de mesmo tamanho</span>
                </div>
                <small id="grupos-equal-helper" class="text-muted" style="display:none;margin-top:6px;"></small>
                <!-- v3.1.11: 🎯 Cabeças de chave — os jogadores marcados como VIP viram cabeças e
                     são espalhados 1 por grupo (não se cruzam cedo). Desligado = grupos por sorteio. -->
                <div style="display:flex;align-items:center;gap:10px;margin-top:14px;">
                  <label class="toggle-switch" style="--toggle-on-bg:#f59e0b;--toggle-on-glow:rgba(245,158,11,0.3);--toggle-on-border:#f59e0b;flex-shrink:0;"><input type="checkbox" id="grupos-seed-vip"><span class="toggle-slider"></span></label>
                  <span style="font-size:0.84rem;color:var(--text-main);">🎯 Cabeças de chave <span style="color:var(--text-muted);font-size:0.78rem;">(VIPs espalhados em grupos diferentes)</span></span>
                </div>
                <!-- v3.1.12: equilibrar grupos por categoria/nível — espalha cada categoria
                     entre os grupos (evita um grupo só de fortes). Toggle do organizador. -->
                <div style="display:flex;align-items:center;gap:10px;margin-top:10px;">
                  <label class="toggle-switch" style="--toggle-on-bg:#f59e0b;--toggle-on-glow:rgba(245,158,11,0.3);--toggle-on-border:#f59e0b;flex-shrink:0;"><input type="checkbox" id="grupos-seed-category"><span class="toggle-slider"></span></label>
                  <span style="font-size:0.84rem;color:var(--text-main);">⚖️ Equilibrar por categoria <span style="color:var(--text-muted);font-size:0.78rem;">(cada nível espalhado entre os grupos)</span></span>
                </div>
              </div>

              <!-- Campos específicos: Suíço -->
              <div id="suico-fields" style="display:none; background: rgba(99,102,241,0.08); border: 1px solid rgba(99,102,241,0.2); border-radius: 12px; padding: 1rem; margin-bottom: 1rem;">
                <p style="margin: 0 0 0.75rem; font-size: 0.8rem; color: #818cf8; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">${_t('create.suicoConfig')}</p>
                <div class="d-flex gap-2">
                  <div class="form-group full-width">
                    <label class="form-label">${_t('create.suicoRounds')}</label>
                    <input type="number" class="form-control" id="suico-rounds" min="2" max="20" value="5" placeholder="Ex: 5">
                    <small class="text-muted" style="display:block;margin-top:4px;">${_t('create.suicoRecommendation')}</small>
                  </div>
                </div>
              </div>

              <!-- Campos específicos: Liga (unificado com antigo Ranking) -->
              <div id="liga-fields" style="display:none; background: rgba(16,185,129,0.08); border: 1px solid rgba(16,185,129,0.2); border-radius: 12px; padding: 1rem; margin-bottom: 1rem;">
                <p style="margin: 0 0 0.75rem; font-size: 0.8rem; color: #34d399; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">${_t('create.ligaConfig')}</p>
                <!-- v2.7.80: toggle "Ativado/Desativado dos inscritos" PROMOVIDO pro topo da
                     config da fase (antes ficava enterrado lá embaixo e o organizador não
                     achava). Controla o canon do "Ativado/Desativado" que aparece nos cards. -->
                <div class="toggle-row" style="margin-bottom:0.75rem;">
                  <div class="toggle-row-label"><div><span style="font-weight:bold; color:var(--text-color);">Deixar inscritos ficarem de fora (Ativado/Desativado)</span><div class="toggle-desc">Cada inscrito pode se marcar como <b>Desativado</b> pra ficar de fora de um sorteio. Desligue pra que ninguém fique de fora — todos sempre <b>Ativados</b> e o controle some dos cards.</div></div></div>
                  <label class="toggle-switch"><input type="checkbox" id="liga-allow-self-deactivation" checked><span class="toggle-slider"></span></label>
                </div>
                <!-- v2.6.56: "Temporada contínua" removida — início/fim da fase já definem a temporada
                     (t.temporada=true por padrão no save; sem elemento). -->
                <div class="form-group" style="margin-bottom:0.5rem;">
                  <div class="toggle-row">
                    <div class="toggle-row-label"><div><span style="font-weight:bold; color:var(--text-color);">${_t('create.ligaBalancedToggle')}</span><div class="toggle-desc">${_t('create.ligaBalancedDesc')}</div></div></div>
                    <label class="toggle-switch"><input type="checkbox" id="liga-balanced-toggle" checked onchange="window._onLigaBalancedToggle()"><span class="toggle-slider"></span></label>
                  </div>
                </div>
                <div id="liga-balanced-config" style="margin-bottom:0.75rem; padding: 8px 10px; background: rgba(16,185,129,0.06); border: 1px dashed rgba(16,185,129,0.25); border-radius: 8px;">
                  <div style="display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap;">
                    <div class="form-group" style="margin:0; flex:0 0 auto;">
                      <label class="form-label" style="font-size:0.7rem;margin-bottom:2px;">${_t('create.ligaClusterSize')}</label>
                      <input type="number" class="form-control" id="liga-cluster-size" min="2" max="32" value="8" style="width:70px;padding:6px 8px;font-size:0.85rem;text-align:center;">
                    </div>
                    <div class="form-group" style="margin:0; flex:1; min-width:180px;">
                      <label class="form-label" style="font-size:0.7rem;margin-bottom:2px;">${_t('create.ligaBalanceBy')}</label>
                      <input type="hidden" id="liga-balance-by" value="individual">
                      <div id="liga-balance-buttons" style="display:flex;gap:6px;">
                        <button type="button" class="liga-balance-btn liga-balance-active" data-value="individual" onclick="window._selectLigaBalance(this)" style="flex:1;min-width:0;padding:7px 8px;border-radius:10px;font-size:0.72rem;cursor:pointer;transition:all 0.15s;border:2px solid #34d399;background:rgba(16,185,129,0.15);color:#34d399;font-weight:600;text-align:center;white-space:normal;line-height:1.1;display:flex;align-items:center;justify-content:center;">${_t('create.ligaBalanceIndividual')}</button>
                        <button type="button" class="liga-balance-btn" data-value="team" onclick="window._selectLigaBalance(this)" style="flex:1;min-width:0;padding:7px 8px;border-radius:10px;font-size:0.72rem;cursor:pointer;transition:all 0.15s;border:2px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.06);color:var(--text-main);font-weight:600;text-align:center;white-space:normal;line-height:1.1;display:flex;align-items:center;justify-content:center;">${_t('create.ligaBalanceTeam')}</button>
                      </div>
                    </div>
                  </div>
                  <div style="font-size:0.7rem; color:var(--text-muted); margin-top:6px;">${_t('create.ligaClusterSizeHint')}</div>
                </div>
                <input type="hidden" id="liga-season-duration" value="indefinida">
                <div id="liga-custom-duration-container" style="display:none;"><input type="hidden" id="liga-custom-months" value="6"></div>
                <input type="hidden" id="liga-round-format" value="standard">
                <div class="form-group mb-3" id="liga-nps-container">
                  <label class="form-label" style="font-size:0.75rem;">${_t('create.ligaNewScore')}</label>
                  <input type="hidden" id="liga-new-player-score" value="zero">
                  <div id="liga-nps-buttons" style="display:flex;gap:6px;flex-wrap:wrap;">
                    <button type="button" class="liga-nps-btn liga-nps-active" data-value="zero" onclick="window._selectLigaNps(this)" style="flex:1;min-width:0;padding:7px 8px;border-radius:10px;font-size:0.72rem;cursor:pointer;transition:all 0.15s;border:2px solid #34d399;background:rgba(16,185,129,0.15);color:#34d399;font-weight:600;text-align:center;white-space:normal;line-height:1.1;display:flex;align-items:center;justify-content:center;">Zero</button>
                    <button type="button" class="liga-nps-btn" data-value="min" onclick="window._selectLigaNps(this)" style="flex:1;min-width:0;padding:7px 8px;border-radius:10px;font-size:0.72rem;cursor:pointer;transition:all 0.15s;border:2px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.06);color:var(--text-main);font-weight:600;text-align:center;white-space:normal;line-height:1.1;display:flex;align-items:center;justify-content:center;">Mínima</button>
                    <button type="button" class="liga-nps-btn" data-value="avg" onclick="window._selectLigaNps(this)" style="flex:1;min-width:0;padding:7px 8px;border-radius:10px;font-size:0.72rem;cursor:pointer;transition:all 0.15s;border:2px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.06);color:var(--text-main);font-weight:600;text-align:center;white-space:normal;line-height:1.1;display:flex;align-items:center;justify-content:center;">Média</button>
                    <button type="button" class="liga-nps-btn" data-value="organizer" onclick="window._selectLigaNps(this)" style="flex:1;min-width:0;padding:7px 8px;border-radius:10px;font-size:0.72rem;cursor:pointer;transition:all 0.15s;border:2px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.06);color:var(--text-main);font-weight:600;text-align:center;white-space:normal;line-height:1.1;display:flex;align-items:center;justify-content:center;">Org. decide</button>
                  </div>
                </div>
                <div class="form-group mb-3">
                  <label class="form-label" style="font-size:0.75rem;">${_t('create.ligaInactRule')}</label>
                  <input type="hidden" id="liga-inactivity" value="keep">
                  <div id="liga-inact-buttons" style="display:flex;gap:6px;flex-wrap:wrap;">
                    <button type="button" class="liga-inact-btn liga-inact-active" data-value="keep" onclick="window._selectLigaInact(this)" style="flex:1;min-width:0;padding:7px 8px;border-radius:10px;font-size:0.72rem;cursor:pointer;transition:all 0.15s;border:2px solid #34d399;background:rgba(16,185,129,0.15);color:#34d399;font-weight:600;text-align:center;white-space:normal;line-height:1.1;display:flex;align-items:center;justify-content:center;">Manter</button>
                    <button type="button" class="liga-inact-btn" data-value="decay" onclick="window._selectLigaInact(this)" style="flex:1;min-width:0;padding:7px 8px;border-radius:10px;font-size:0.72rem;cursor:pointer;transition:all 0.15s;border:2px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.06);color:var(--text-main);font-weight:600;text-align:center;white-space:normal;line-height:1.1;display:flex;align-items:center;justify-content:center;">Decaimento</button>
                    <button type="button" class="liga-inact-btn" data-value="remove" onclick="window._selectLigaInact(this)" style="flex:1;min-width:0;padding:7px 8px;border-radius:10px;font-size:0.72rem;cursor:pointer;transition:all 0.15s;border:2px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.06);color:var(--text-main);font-weight:600;text-align:center;white-space:normal;line-height:1.1;display:flex;align-items:center;justify-content:center;">Remover</button>
                  </div>
                </div>
                <div class="form-group" id="liga-inactivity-x-container" style="display:none;">
                  <label class="form-label">${_t('create.ligaInactRounds')}</label>
                  <input type="number" class="form-control" id="liga-inactivity-x" min="1" value="3">
                </div>
                <!-- v2.6.56: "Inscrições abertas durante toda a temporada" removida — redundante com
                     "Inscrições durante a fase" (Fechadas/Aberta). ligaOpenEnrollment é DERIVADO do
                     lateEnrollment no save. -->

                ${/* v2.6.29: toggle "Fase final (playoffs)" removido — a fase final agora
                      é uma fase do construtor de fases adicionada em sequência à Liga. */ ''}
                <!-- Agendamento de Sorteios movido pra logo abaixo das "Datas da fase" (v2.6.48) -->
              </div>
              <!-- ranking-fields removido em v0.2.6: unificado com liga-fields -->

              <!-- Game Set Match Config — Presets (Formato das Partidas) -->
              <div id="gsm-section" style="background: rgba(168,85,247,0.06); border: 1px solid rgba(168,85,247,0.15); border-radius: 12px; padding: 1rem; margin-bottom: 1rem;">
                <p style="margin: 0 0 10px 0; font-size: 0.8rem; color: #c084fc; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">🎾 ${_t('create.matchFormat')}</p>
                <div id="gsm-presets" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;margin-bottom:10px;"></div>
                <!-- Advantage toggle (auto-hidden for beach tennis/padel) -->
                <div id="gsm-advantage-section" style="display:none;margin-top:10px;padding:10px 12px;background:rgba(168,85,247,0.04);border-radius:10px;border:1px solid rgba(168,85,247,0.1);">
                  <div class="toggle-row" style="padding:0;">
                    <div class="toggle-row-label"><span style="font-size:0.82rem;font-weight:600;">${_t('create.gsmAdvantageLabel')}</span><div style="font-size:0.7rem;color:var(--text-muted);margin-top:2px;">${_t('create.gsmAdvantageDesc')}</div></div>
                    <label class="toggle-switch toggle-sm"><input type="checkbox" id="gsm-advantage-toggle" onchange="window._gsmAdvantageChanged()"><span class="toggle-slider"></span></label>
                  </div>
                </div>
                <!-- Summary -->
                <div id="gsm-summary" style="font-size:0.8rem;color:var(--text-muted);margin-top:10px;line-height:1.5;padding:8px 12px;background:rgba(255,255,255,0.03);border-radius:8px;display:none;"></div>
                <!-- Hidden fields to store config -->
                <input type="hidden" id="gsm-type" value="simple">
                <input type="hidden" id="gsm-setsToWin" value="1">
                <input type="hidden" id="gsm-gamesPerSet" value="6">
                <input type="hidden" id="gsm-tiebreakEnabled" value="true">
                <input type="hidden" id="gsm-tiebreakPoints" value="7">
                <input type="hidden" id="gsm-tiebreakMargin" value="2">
                <input type="hidden" id="gsm-tiebreakAt" value="">
                <input type="hidden" id="gsm-superTiebreak" value="false">
                <input type="hidden" id="gsm-superTiebreakPoints" value="10">
                <input type="hidden" id="gsm-countingType" value="numeric">
                <input type="hidden" id="gsm-advantageRule" value="false">
                <input type="hidden" id="gsm-fixedSet" value="false">
                <input type="hidden" id="gsm-fixedSetGames" value="6">
              </div>

              <!-- Categorias do Torneio (com o Rigor da inscrição no topo do box) -->
              <div style="background: rgba(168,85,247,0.06); border: 1px solid rgba(168,85,247,0.15); border-radius: 12px; padding: 1rem; margin-bottom: 1rem;">
                <!-- Rigor da inscrição (v1.15.28) — no topo do box de Categorias.
                     Espectro Casual ↔ Oficial; travas duras entram gradualmente. -->
                <div id="rigor-section" style="margin-bottom:14px; padding-bottom:14px; border-bottom:1px solid rgba(255,255,255,0.08);">
                  <p style="margin: 0 0 0.6rem; font-size: 0.8rem; color: #38bdf8; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">🎚️ Rigor da inscrição</p>
                  <div style="display:flex; justify-content:space-between; font-size:0.66rem; color:var(--text-muted); font-weight:700; margin-bottom:2px;">
                    <span>Casual</span><span>Moderado</span><span>Oficial</span>
                  </div>
                  <input type="range" id="tourn-rigor-slider" min="0" max="2" step="1" value="0" oninput="window._rigorLive(this.value)" style="width:100%; accent-color:#38bdf8;">
                  <input type="hidden" id="tourn-rigor" value="casual">
                  <div id="tourn-rigor-desc" style="font-size:0.74rem; color:var(--text-muted); margin-top:6px; line-height:1.45;">🎾 <b>Casual</b> — não verifica o histórico dos inscritos. Qualquer pessoa se inscreve; as categorias são só informativas.</div>
                  <!-- Informações exigidas (só quando o rigor não é Casual). Cada uma
                       vira requisito checado no "Inscrever-se". -->
                  <div id="rigor-require-block" style="display:none; margin-top:12px;">
                    <div style="font-size:0.72rem; color:var(--text-muted); font-weight:700; margin-bottom:6px;">Exigir dos inscritos:</div>
                    <div style="display:flex; flex-direction:column; gap:7px;">
                      <label style="display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:0.82rem;color:var(--text-main);cursor:pointer;"><span>⚧ Gênero</span><span class="toggle-switch" style="--toggle-on-bg:#38bdf8;--toggle-on-glow:rgba(56,189,248,0.3);--toggle-on-border:#38bdf8;"><input type="checkbox" id="rigor-req-gender"><span class="toggle-slider"></span></span></label>
                      <label style="display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:0.82rem;color:var(--text-main);cursor:pointer;"><span>🎯 Categoria (nível)</span><span class="toggle-switch" style="--toggle-on-bg:#38bdf8;--toggle-on-glow:rgba(56,189,248,0.3);--toggle-on-border:#38bdf8;"><input type="checkbox" id="rigor-req-category"><span class="toggle-slider"></span></span></label>
                      <label style="display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:0.82rem;color:var(--text-main);cursor:pointer;"><span>🎂 Idade</span><span class="toggle-switch" style="--toggle-on-bg:#38bdf8;--toggle-on-glow:rgba(56,189,248,0.3);--toggle-on-border:#38bdf8;"><input type="checkbox" id="rigor-req-age"><span class="toggle-slider"></span></span></label>
                      <label style="display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:0.82rem;color:var(--text-main);cursor:pointer;"><span>🎾 Histórico (letzplay)</span><span class="toggle-switch" style="--toggle-on-bg:#38bdf8;--toggle-on-glow:rgba(56,189,248,0.3);--toggle-on-border:#38bdf8;"><input type="checkbox" id="rigor-req-history"><span class="toggle-slider"></span></span></label>
                    </div>
                    <div style="font-size:0.7rem; color:var(--text-muted); margin-top:7px; line-height:1.4;">No <b>Oficial</b>, quem não tiver isso no perfil <b>não se inscreve</b>. No <b>Moderado</b>, entra mas é <b>avisado</b> a completar.</div>
                  </div>
                </div>
                <p style="margin: 0 0 0.75rem; font-size: 0.8rem; color: #a855f7; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">${_t('create.catSection')}</p>
                <div style="margin-bottom:0.75rem;">
                  <label class="form-label" style="margin-bottom:6px;">${_t('create.genderCatLabel')}</label>
                  <div style="display:flex; gap:8px; flex-wrap:wrap;" id="gender-cat-buttons">
                    <button type="button" id="btn-cat-fem" onclick="window._toggleGenderCat('fem')" style="display:inline-flex;align-items:center;gap:5px;padding:6px 14px; border-radius:8px; font-size:0.8rem; cursor:pointer; transition:all 0.15s; white-space:nowrap; border:2px solid rgba(255,255,255,0.18); background:rgba(255,255,255,0.06); color:var(--text-main); font-weight:500;"><span style="line-height:1;flex-shrink:0;">♀</span>${_t('create.catFem')}</button>
                    <button type="button" id="btn-cat-masc" onclick="window._toggleGenderCat('masc')" style="display:inline-flex;align-items:center;gap:5px;padding:6px 14px; border-radius:8px; font-size:0.8rem; cursor:pointer; transition:all 0.15s; white-space:nowrap; border:2px solid rgba(255,255,255,0.18); background:rgba(255,255,255,0.06); color:var(--text-main); font-weight:500;"><span style="line-height:1;flex-shrink:0;">♂</span>${_t('create.catMasc')}</button>
                    <button type="button" id="btn-cat-misto-ale" onclick="window._toggleGenderCat('misto_aleatorio')" style="display:inline-flex;align-items:center;gap:5px;padding:6px 14px; border-radius:8px; font-size:0.8rem; cursor:pointer; transition:all 0.15s; white-space:nowrap; border:2px solid rgba(255,255,255,0.18); background:rgba(255,255,255,0.06); color:var(--text-main); font-weight:500;"><span style="line-height:1;flex-shrink:0;">⚥</span>${_t('create.catMistoAle')}</button>
                    <button type="button" id="btn-cat-misto-obr" onclick="window._toggleGenderCat('misto_obrigatorio')" style="display:inline-flex;align-items:center;gap:5px;padding:6px 14px; border-radius:8px; font-size:0.8rem; cursor:pointer; transition:all 0.15s; white-space:nowrap; border:2px solid rgba(255,255,255,0.18); background:rgba(255,255,255,0.06); color:var(--text-main); font-weight:500;"><span style="line-height:1;flex-shrink:0;">⚤</span>${_t('create.catMistoObr')}</button>
                  </div>
                  <input type="hidden" id="tourn-gender-categories" value="">
                  <small class="text-muted" style="display:block;margin-top:6px;">${_t('create.genderCatHint')}</small>
                </div>
                <div>
                  <label class="form-label" style="margin-bottom:6px;">${_t('create.skillCatLabel')}</label>
                  <!-- v1.2.2-beta: pills A, B, C, D, FUN. Indigo, multi-select. -->
                  <div style="display:flex; gap:8px; flex-wrap:wrap;" id="skill-cat-buttons">
                    <button type="button" data-skill="A" data-active="0" onclick="window._toggleSkillCat('A')" style="padding:6px 14px; border-radius:8px; font-size:0.8rem; cursor:pointer; transition:all 0.15s; white-space:nowrap; border:2px solid rgba(255,255,255,0.18); background:rgba(255,255,255,0.06); color:var(--text-main); font-weight:500;">A</button>
                    <button type="button" data-skill="B" data-active="0" onclick="window._toggleSkillCat('B')" style="padding:6px 14px; border-radius:8px; font-size:0.8rem; cursor:pointer; transition:all 0.15s; white-space:nowrap; border:2px solid rgba(255,255,255,0.18); background:rgba(255,255,255,0.06); color:var(--text-main); font-weight:500;">B</button>
                    <button type="button" data-skill="C" data-active="0" onclick="window._toggleSkillCat('C')" style="padding:6px 14px; border-radius:8px; font-size:0.8rem; cursor:pointer; transition:all 0.15s; white-space:nowrap; border:2px solid rgba(255,255,255,0.18); background:rgba(255,255,255,0.06); color:var(--text-main); font-weight:500;">C</button>
                    <button type="button" data-skill="D" data-active="0" onclick="window._toggleSkillCat('D')" style="padding:6px 14px; border-radius:8px; font-size:0.8rem; cursor:pointer; transition:all 0.15s; white-space:nowrap; border:2px solid rgba(255,255,255,0.18); background:rgba(255,255,255,0.06); color:var(--text-main); font-weight:500;">D</button>
                    <button type="button" data-skill="FUN" data-active="0" onclick="window._toggleSkillCat('FUN')" style="padding:6px 14px; border-radius:8px; font-size:0.8rem; cursor:pointer; transition:all 0.15s; white-space:nowrap; border:2px solid rgba(255,255,255,0.18); background:rgba(255,255,255,0.06); color:var(--text-main); font-weight:500;">FUN</button>
                  </div>
                  <input type="hidden" id="tourn-skill-categories" value="">
                  <small class="text-muted" style="display:block;margin-top:6px;">A é o nível mais alto (avançado), D o mais iniciante. FUN = categoria iniciante.</small>
                </div>

                <!-- v1.2.0-beta: Categorias por Idade -->
                <div style="margin-top:0.75rem;">
                  <label class="form-label" style="margin-bottom:6px;">Categorias por Idade</label>
                  <div style="display:flex; gap:8px; flex-wrap:wrap;" id="age-cat-buttons">
                    <button type="button" data-age="40+" onclick="window._toggleAgeCat('40+')" style="padding:6px 14px; border-radius:8px; font-size:0.8rem; cursor:pointer; transition:all 0.15s; white-space:nowrap; border:2px solid rgba(255,255,255,0.18); background:rgba(255,255,255,0.06); color:var(--text-main); font-weight:500;">40+</button>
                    <button type="button" data-age="50+" onclick="window._toggleAgeCat('50+')" style="padding:6px 14px; border-radius:8px; font-size:0.8rem; cursor:pointer; transition:all 0.15s; white-space:nowrap; border:2px solid rgba(255,255,255,0.18); background:rgba(255,255,255,0.06); color:var(--text-main); font-weight:500;">50+</button>
                    <button type="button" data-age="60+" onclick="window._toggleAgeCat('60+')" style="padding:6px 14px; border-radius:8px; font-size:0.8rem; cursor:pointer; transition:all 0.15s; white-space:nowrap; border:2px solid rgba(255,255,255,0.18); background:rgba(255,255,255,0.06); color:var(--text-main); font-weight:500;">60+</button>
                    <button type="button" data-age="70+" onclick="window._toggleAgeCat('70+')" style="padding:6px 14px; border-radius:8px; font-size:0.8rem; cursor:pointer; transition:all 0.15s; white-space:nowrap; border:2px solid rgba(255,255,255,0.18); background:rgba(255,255,255,0.06); color:var(--text-main); font-weight:500;">70+</button>
                  </div>
                  <input type="hidden" id="tourn-age-categories" value="">
                  <small class="text-muted" style="display:block;margin-top:6px;">Sub-bracket por faixa etária. Inscritos podem competir na categoria de habilidade, na de idade, ou em ambas. Sub-bracket também é separado por gênero.</small>
                </div>

                <!-- v2.1.80-beta: Categorias personalizadas (livres) — funcionam como a
                     habilidade: cruzam com gênero e viram sub-bracket. O inscrito escolhe
                     na inscrição; o organizador atribui/reatribui no gerenciador. -->
                <div style="margin-top:0.75rem;">
                  <label class="form-label" style="margin-bottom:6px;">Categorias personalizadas</label>
                  <div id="custom-cat-chips" style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px;"></div>
                  <button type="button" id="btn-add-custom-cat" onclick="window._addCustomCat()" style="display:inline-flex;align-items:center;gap:6px;padding:6px 14px; border-radius:8px; font-size:0.8rem; cursor:pointer; transition:all 0.15s; white-space:nowrap; border:2px dashed rgba(20,184,166,0.5); background:rgba(20,184,166,0.08); color:#5eead4; font-weight:600;"><span style="line-height:1;">＋</span> Adicionar categoria</button>
                  <input type="hidden" id="tourn-custom-categories" value="">
                  <small class="text-muted" style="display:block;margin-top:6px;">Categoria livre (ex.: Estreante, Profissional). Cruza com gênero como a habilidade e gera sub-bracket próprio. O inscrito escolhe na inscrição; você pode reatribuir no gerenciador de categorias.</small>
                </div>

                <div id="category-preview" style="display:none; margin-top:0.75rem; padding:8px 12px; background:rgba(168,85,247,0.08); border:1px solid rgba(168,85,247,0.2); border-radius:8px;">
                  <div style="font-size:0.7rem; color:#a855f7; font-weight:600; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">${_t('create.catPreview')}</div>
                  <div id="category-preview-list" style="display:flex; flex-direction:column; gap:6px; font-size:0.8rem;"></div>
                </div>
              </div>

              <!-- BOX CANÔNICO (v3.1.34): "Formação de duplas" + "W.O. (ausência)" num box
                   só. O label antes solto "Formação das duplas" virou o cabeçalho do box, que
                   agora cobre as 2 funções. W.O. usa a render CANÔNICA _woButtonsHtml(0) (a
                   mesma de TODAS as fases). #manual-pairing-container interno mantém o id pra
                   continuar escondendo/mostrando só a parte de duplas em Simples. -->
              <div class="mb-3" style="background: rgba(167,139,250,0.06); border: 1px solid rgba(167,139,250,0.22); border-radius: 12px; padding: 1rem;" id="pairing-wo-box">
                <p style="margin: 0 0 0.75rem; font-size: 0.8rem; color: #a78bfa; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">🤝 Formação de duplas e ausências (W.O.)</p>
                <div id="manual-pairing-container">
                  <input type="hidden" id="manual-pairing" value="organizer_only">
                  <div class="toggle-row" style="padding:8px 12px;border-radius:10px;border:1px solid rgba(167,139,250,0.25);background:rgba(167,139,250,0.06);">
                    <div class="toggle-row-label" style="gap:8px;"><span class="toggle-icon">🤝</span><div><span style="font-weight:600;color:var(--text-color);font-size:0.88rem;">Participantes podem formar suas duplas</span><div class="toggle-desc" style="font-size:0.72rem;margin-top:2px;">Ligado: cada um arrasta seu card sobre o de outro e a dupla fica pendente até o outro aceitar. Desligado: só o organizador monta as duplas. (Só vale em duplas.)</div></div></div>
                    <label class="toggle-switch" style="--toggle-on-bg:#a78bfa;--toggle-on-glow:rgba(167,139,250,0.3);--toggle-on-border:#a78bfa;"><input type="checkbox" id="manual-pairing-toggle" aria-label="Participantes formam duplas" onchange="window._syncManualPairing()"><span class="toggle-slider"></span></label>
                  </div>
                  <!-- v2.6.91: aviso quando formação manual liga Times mas Individual segue marcado (misto) -->
                  <div id="manual-pairing-notice" style="display:none;margin-top:8px;"></div>
                </div>
                <!-- W.O. (Ausência) — movido pra cá, logo após formação de duplas (v3.1.34) -->
                <div id="wo-scope-container" style="margin-top:0.9rem;padding-top:0.85rem;border-top:1px solid rgba(255,255,255,0.08);">
                  <p style="margin: 0 0 0.6rem; font-size: 0.78rem; color: #f87171; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">⚠️ ${_t('create.woSection')}</p>
                  <input type="hidden" id="wo-scope" value="individual">
                  ${window._woButtonsHtml(0)}
                </div>
              </div>

              <!-- (Inscrições durante a fase movida pra logo abaixo do Agendamento de Sorteios — v2.6.51) -->

              <!-- v2.6.63: Pontuação Avançada agora usa a render CANÔNICA (mesma da Fase 1 e fases extras). -->
              ${window._advScoringHtml(0)}

              <!-- Lançamento de Resultados (toggles não-excludentes) -->
              <div style="background: rgba(59,130,246,0.06); border: 1px solid rgba(59,130,246,0.15); border-radius: 12px; padding: 1rem; margin-bottom: 1rem;">
                <p style="margin: 0 0 0.75rem; font-size: 0.8rem; color: #60a5fa; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">📋 ${_t('create.resultSection')}</p>
                ${window._resultEntryButtonsHtml(0)}
                <input type="hidden" id="select-result-entry" value="organizer">
              </div>

              <!-- Classificação (Personalizada × Em blocos) — logo após o Lançamento de
                   Resultados (v3.1.34). Render CANÔNICA _classifModeHtml(0), a MESMA das fases
                   extras. Visível só em Eliminatórias/Grupos (#elim-settings + visibilidade). -->
              <div id="elim-settings" style="display:none; background: rgba(239,68,68,0.06); border: 1px solid rgba(239,68,68,0.15); border-radius: 12px; padding: 1rem; margin-bottom: 1rem;">
                <p style="margin: 0 0 0.75rem; font-size: 0.8rem; color: #f87171; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">${_t('create.classificationSection')}</p>
                ${window._classifModeHtml(0)}
              </div>

              <!-- ═══════════ FIM BOX FASE 1 ═══════════ -->
              </div>

              <!-- + Adicionar fase (fases 2+ — cada uma com as mesmas configs da Fase 1) -->
              <div class="form-group mb-3" id="phases-section">
                <div id="phases-list"></div>
                <button type="button" id="add-phase-btn" onclick="window._addPhase()" style="margin-top:4px;padding:10px 16px;border-radius:10px;font-size:0.84rem;cursor:pointer;border:2px dashed rgba(129,140,248,0.55);background:rgba(99,102,241,0.08);color:#818cf8;font-weight:600;width:100%;transition:all 0.15s;">+ Adicionar fase</button>
                <small class="text-muted" style="display:block;margin-top:8px;">Adicione fases para criar etapas com formato e origem próprios (ex.: <em>Liga classificatória</em> → <em>Eliminatória Ouro/Prata</em>). Cada fase tem as mesmas configurações da Fase 1.</small>
              </div>

              <!-- Datas e Horários movidos pro box da Fase (sob o Formato, antes da Estimativa) — v2.6.46 -->


              <!-- Campos periocidade de sorteio: Suíço -->
              <div id="suico-draw-schedule-fields" style="display:none; background: rgba(99,102,241,0.05); border: 1px solid rgba(99,102,241,0.15); border-radius: 12px; padding: 1rem; margin-bottom: 1rem;">
                <p style="margin: 0 0 0.5rem; font-size: 0.8rem; color: #818cf8; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">${_t('create.swissDrawSchedule')}</p>
                <div style="display:flex;gap:6px;align-items:flex-end;flex-wrap:wrap;margin-bottom:0.5rem;">
                  <div class="form-group" style="margin:0;flex:0 0 auto;">
                    <label class="form-label" style="font-size:0.7rem;margin-bottom:2px;">${_t('create.dateLabel')}</label>
                    <input type="date" class="form-control" id="suico-first-draw-date" style="width:130px;padding:6px 8px;font-size:0.85rem;">
                  </div>
                  <div class="form-group" style="margin:0;flex:0 0 auto;">
                    <label class="form-label" style="font-size:0.7rem;margin-bottom:2px;">${_t('create.timeLabel')}</label>
                    <input type="time" class="form-control" id="suico-first-draw-time" value="19:00" style="width:100px;padding:6px 8px;font-size:0.85rem;">
                  </div>
                  <div class="form-group" style="margin:0;flex:0 0 auto;">
                    <label class="form-label" style="font-size:0.7rem;margin-bottom:2px;">${_t('create.repeatEvery')}</label>
                    <div style="display:flex;align-items:center;gap:4px;">
                      <input type="number" class="form-control" id="suico-draw-interval" min="1" max="90" value="7" style="width:55px;padding:6px 8px;font-size:0.85rem;text-align:center;">
                      <span style="font-size:0.8rem;color:var(--text-muted);white-space:nowrap;">${_t('create.daysUnit')}</span>
                    </div>
                  </div>
                </div>
                <div class="form-group" style="margin:0;">
                  <div class="toggle-row">
                    <div class="toggle-row-label"><div><span style="font-weight:bold; color:var(--text-color);">${_t('create.manualDraw')}</span><div class="toggle-desc">${_t('create.swissManualDrawDesc')}</div></div></div>
                    <label class="toggle-switch"><input type="checkbox" id="suico-manual-draw"><span class="toggle-slider"></span></label>
                  </div>
                </div>
              </div>

              <!-- (Fases do torneio movido para logo após o box FASE 1) -->

              <!-- Local e Quadras -->
              <div id="venue-photo-box" style="background: rgba(16,185,129,0.06); border: 1px solid rgba(16,185,129,0.15); border-radius: 12px; padding: 1rem; margin-bottom: 1rem;">
                <p style="margin: 0 0 0.75rem; font-size: 0.8rem; color: #34d399; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">${_t('create.venueSection')}</p>
                <div class="mb-2">
                  <div class="form-group" style="flex:1;">
                    <label class="form-label">${_t('create.venueLabel')}</label>
                    <div style="position:relative;display:flex;gap:6px;margin-bottom:8px;" id="venue-autocomplete-container">
                      <input type="text" class="form-control" id="tourn-venue" placeholder="${_t('create.venuePlaceholder')}"
                        style="flex:1;box-sizing:border-box;font-size:0.8rem;" autocomplete="off">
                      <button type="button" onclick="window._venueLocateMe()" class="btn btn-sm" style="background:var(--primary-color);color:#fff;border:none;white-space:nowrap;font-size:0.75rem;padding:6px 10px;" title="Usar minha localização">📍</button>
                      <div id="venue-suggestions" style="display:none; position:absolute; top:100%; left:0; right:0; z-index:9999; background:var(--bg-card);border:1px solid var(--border-color); border-radius:10px; margin-top:4px; max-height:220px; overflow-y:auto; box-shadow:0 8px 24px rgba(0,0,0,0.5);"></div>
                    </div>
                    ${typeof window._venuePrefChipsHtml === 'function' ? window._venuePrefChipsHtml() : ''}
                    <div id="venue-create-map" style="display:none;width:100%;height:180px;border-radius:10px;overflow:hidden;border:1px solid var(--border-color);margin-bottom:8px;background:#1a1a2e;"></div>
                    <div id="venue-osm-info" style="display:none; margin-top:5px; font-size:0.75rem; color:var(--text-muted); display:flex; align-items:center; gap:5px;"></div>
                    <div style="margin-top:8px;">
                      <div style="display:flex; align-items:center; gap:10px;">
                        <label class="toggle-switch" style="margin:0;">
                          <input type="checkbox" id="toggle-venue-public" aria-label="Local público" checked onchange="window._onVenueAccessToggle()">
                          <span class="toggle-slider"></span>
                        </label>
                        <span id="venue-access-label" style="font-size:0.82rem; font-weight:600; color:var(--text-bright);">${_t('create.accessOpen')}</span>
                      </div>
                      <div id="venue-access-desc" style="font-size:0.72rem; color:var(--text-muted); margin-top:4px; margin-left:52px;">${_t('create.openDesc')}</div>
                    </div>
                    <input type="hidden" id="tourn-venue-access" value="">
                    <input type="hidden" id="tourn-venue-lat" value="">
                    <input type="hidden" id="tourn-venue-lon" value="">
                    <input type="hidden" id="tourn-venue-address" value="">
                    <input type="hidden" id="tourn-venue-place-id" value="">
                    <input type="hidden" id="tourn-venue-photo-url" value="">
                  </div>
                </div>
                <div class="courts-row" style="display:flex; gap:10px; align-items:flex-start; margin-bottom:0.5rem;">
                  <div class="form-group courts-count-field" style="flex:0 0 100px;">
                    <label class="form-label">${_t('create.courtsLabel')}</label>
                    <input type="number" class="form-control" id="tourn-court-count" aria-label="Número de quadras" min="1" max="50" value="1" style="text-align:center;" oninput="window._onCourtCountChange()">
                  </div>
                  <div class="form-group" style="flex:1; min-width:0;">
                    <label class="form-label">${_t('create.courtNamesLabel')} <small style="opacity:0.6;">${_t('create.courtNamesSep')}</small></label>
                    <input type="text" class="form-control" id="tourn-court-names" placeholder="Ex: Quadra Central, Quadra 1, Quadra 2" style="width:100%;" oninput="window._onCourtNamesInput()">
                    <small class="text-muted" style="display:block;margin-top:4px;" id="court-names-hint">${_t('create.courtHint')}</small>
                  </div>
                </div>
              </div>

              <!-- Weather Forecast -->
              <div id="weather-forecast" style="display:none; margin-bottom:0.75rem; background:rgba(59,130,246,0.08); border:1px solid rgba(59,130,246,0.2); border-radius:10px; padding:10px 14px;">
                <div style="font-size:0.7rem; font-weight:600; color:#60a5fa; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">${_t('create.weatherSection')}</div>
                <div id="weather-content"></div>
              </div>

              <!-- (Estimativa de tempo movida para o topo do box FASE 1) -->

              <!-- (Formato das Partidas / GSM movido para o box FASE 1) -->

              <!-- Sistema de Pontos Avançado (apenas Liga / Suíço) -->

              <!-- Inscrição e Limite -->
              <div class="d-flex gap-2 mb-3">
                <div class="form-group full-width" id="cap-max-container">
                  <label class="form-label">${_t('create.maxParticipants')}</label>
                  <input type="number" class="form-control" id="tourn-max-participants" min="2" placeholder="${_t('create.noLimit')}" oninput="window._updateAutoCloseVisibility(); window._recalcDuration()">
                </div>
                <div class="form-group full-width">
                  <label class="form-label">${_t('create.gameType')}</label>
                  <input type="hidden" id="tourn-team-size" value="2">
                  <input type="hidden" id="tourn-game-types" value="duplas">
                  <div id="game-type-buttons" style="display:flex;flex-direction:column;gap:8px;">
                    <div class="toggle-row" style="padding:8px 12px;border-radius:10px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.03);">
                      <div class="toggle-row-label" style="gap:8px;"><span class="toggle-icon">🏸</span><div><span style="font-weight:600;color:var(--text-color);font-size:0.88rem;">${_t('create.gameSimples')}</span><div class="toggle-desc" style="font-size:0.72rem;margin-top:2px;">${_t('create.simplesSideDesc')}</div></div></div>
                      <label class="toggle-switch" style="--toggle-on-bg:#3b82f6;--toggle-on-glow:rgba(59,130,246,0.3);--toggle-on-border:#3b82f6;"><input type="checkbox" id="game-toggle-simples" aria-label="Modo simples" onchange="window._syncGameTypeToggles()"><span class="toggle-slider"></span></label>
                    </div>
                    <div class="toggle-row" style="padding:8px 12px;border-radius:10px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.03);">
                      <div class="toggle-row-label" style="gap:8px;"><span class="toggle-icon">🏖️</span><div><span style="font-weight:600;color:var(--text-color);font-size:0.88rem;">${_t('create.gameDuplas')}</span><div class="toggle-desc" style="font-size:0.72rem;margin-top:2px;">${_t('create.duplasSideDesc')}</div></div></div>
                      <label class="toggle-switch" style="--toggle-on-bg:#3b82f6;--toggle-on-glow:rgba(59,130,246,0.3);--toggle-on-border:#3b82f6;"><input type="checkbox" id="game-toggle-duplas" aria-label="Modo duplas" checked onchange="window._syncGameTypeToggles()"><span class="toggle-slider"></span></label>
                    </div>
                  </div>
                  <small class="text-muted" style="display:block;margin-top:6px;" id="game-type-desc">${_t('create.gameTypeHint')}</small>
                </div>
              </div>

              <!-- Modelo de inscrição: corrida (cap) vs sorteio de vagas (draw).
                   v2.6.87: só aparece quando há Máx. Participantes (= nº de vagas).
                   Sem limite → não há corrida nem sorteio (visibilidade em _updateAutoCloseVisibility). -->
              <div class="form-group mb-3" id="enroll-model-section">
                <label class="form-label">Modelo de inscrição</label>
                <input type="hidden" id="enrollment-limit-mode" value="cap">
                <div style="display:flex;flex-direction:column;gap:8px;" id="enroll-limit-mode-buttons">
                  <div class="toggle-row" id="elm-row-cap" style="padding:8px 12px;border-radius:10px;border:1px solid rgba(96,165,250,0.25);background:rgba(96,165,250,0.08);">
                    <div class="toggle-row-label" style="gap:8px;"><span class="toggle-icon">🏁</span><div><span style="font-weight:600;color:var(--text-color);font-size:0.88rem;">Limite com corrida</span><div class="toggle-desc" style="font-size:0.72rem;margin-top:2px;">As vagas enchem por ordem de inscrição — pode gerar corrida.</div></div></div>
                    <label class="toggle-switch" style="--toggle-on-bg:#60a5fa;--toggle-on-glow:rgba(96,165,250,0.3);--toggle-on-border:#60a5fa;"><input type="checkbox" id="elm-toggle-cap" aria-label="Limite com corrida" checked onchange="window._syncEnrollLimitMode('cap')"><span class="toggle-slider"></span></label>
                  </div>
                  <div class="toggle-row" id="elm-row-draw" style="padding:8px 12px;border-radius:10px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.03);">
                    <div class="toggle-row-label" style="gap:8px;"><span class="toggle-icon">🎲</span><div><span style="font-weight:600;color:var(--text-color);font-size:0.88rem;">Vagas com sorteio</span><div class="toggle-desc" style="font-size:0.72rem;margin-top:2px;">Inscrição aberta sem corrida; ao encerrar, um sorteio define quem entra e a lista de espera.</div></div></div>
                    <label class="toggle-switch" style="--toggle-on-bg:#a78bfa;--toggle-on-glow:rgba(167,139,250,0.3);--toggle-on-border:#a78bfa;"><input type="checkbox" id="elm-toggle-draw" aria-label="Vagas com sorteio" onchange="window._syncEnrollLimitMode('draw')"><span class="toggle-slider"></span></label>
                  </div>
                </div>
                <!-- Config do modo Vagas (oculto salvo no modo draw) -->
                <div id="draw-slots-container" style="display:none;margin-top:10px;padding:10px 12px;border-radius:10px;border:1px solid rgba(167,139,250,0.25);background:rgba(167,139,250,0.06);">
                  <label class="form-label" style="margin-bottom:4px;">Número de vagas</label>
                  <input type="number" class="form-control" id="tourn-target-slots" min="1" placeholder="Ex.: 24" oninput="window._recalcDuration()">
                  <small class="text-muted" style="display:block;margin-top:4px;" id="target-slots-hint">vagas = duplas/times</small>
                  <div style="margin-top:10px;">
                    <label class="form-label" style="margin-bottom:6px;">Chamada da lista de espera</label>
                    <input type="hidden" id="call-policy" value="present">
                    <div style="display:flex;flex-direction:column;gap:8px;" id="call-policy-buttons">
                      <div class="toggle-row" id="cp-row-present" style="padding:8px 12px;border-radius:10px;border:1px solid rgba(167,139,250,0.25);background:rgba(167,139,250,0.08);">
                        <div class="toggle-row-label" style="gap:8px;"><span class="toggle-icon">🏃</span><div><span style="font-weight:600;color:var(--text-color);font-size:0.84rem;">Quem chegar primeiro</span><div class="toggle-desc" style="font-size:0.7rem;margin-top:2px;">O próximo da fila é quem fizer check-in primeiro (presença).</div></div></div>
                        <label class="toggle-switch" style="--toggle-on-bg:#a78bfa;--toggle-on-glow:rgba(167,139,250,0.3);--toggle-on-border:#a78bfa;"><input type="checkbox" id="cp-toggle-present" aria-label="Chamada por presença" checked onchange="window._syncCallPolicy('present')"><span class="toggle-slider"></span></label>
                      </div>
                      <div class="toggle-row" id="cp-row-locked" style="padding:8px 12px;border-radius:10px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.03);">
                        <div class="toggle-row-label" style="gap:8px;"><span class="toggle-icon">🔒</span><div><span style="font-weight:600;color:var(--text-color);font-size:0.84rem;">Ordem do sorteio (travada)</span><div class="toggle-desc" style="font-size:0.7rem;margin-top:2px;">A fila segue a ordem sorteada; entra o próximo presente nela.</div></div></div>
                        <label class="toggle-switch" style="--toggle-on-bg:#a78bfa;--toggle-on-glow:rgba(167,139,250,0.3);--toggle-on-border:#a78bfa;"><input type="checkbox" id="cp-toggle-locked" aria-label="Ordem travada do sorteio" onchange="window._syncCallPolicy('locked')"><span class="toggle-slider"></span></label>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- (Categorias movido para o box FASE 1) -->

              <!-- v2.7.83: "Modo de Inscrição" REMOVIDO da UI — inscrição é sempre
                   INDIVIDUAL. O enrollmentMode é DERIVADO no save: 'misto' quando o
                   pareamento (Participantes podem formar duplas) está ligado, senão
                   'individual'. Os toggles Individual/Times ficam OCULTOS, só como
                   mecanismo da derivação (driven por _syncManualPairing). -->
              <div class="form-group mb-3" id="inscricao-section">
                <input type="hidden" id="select-inscricao" value="individual">
                <div id="enroll-mode-buttons" style="display:none;">
                  <div class="toggle-row" id="enroll-row-individual">
                    <label><input type="checkbox" id="enroll-toggle-individual" checked onchange="window._syncEnrollToggles()"></label>
                  </div>
                  <div class="toggle-row" id="enroll-row-team">
                    <label><input type="checkbox" id="enroll-toggle-team" onchange="window._syncEnrollToggles()"></label>
                  </div>
                </div>
                <small id="enroll-mode-desc" style="display:none;"></small>
                <!-- Times Sorteados Separados dos Montados (duas categorias) — só em Duplas
                     (visibilidade controlada por _syncGameTypeToggles). Ligar isto liga
                     automaticamente "Participantes podem formar duplas". -->
                <input type="hidden" id="mixed-pairing-separated" value="false">
                <div id="mixed-pairing-container" style="margin-top:8px;">
                  <label class="form-label">Categorias de duplas</label>
                  <div class="toggle-row" id="mixed-pairing-row" style="padding:8px 12px;border-radius:10px;border:1px solid rgba(167,139,250,0.25);background:rgba(167,139,250,0.06);">
                    <div class="toggle-row-label" style="gap:8px;"><span class="toggle-icon">🆚</span><div><span style="font-weight:600;color:var(--text-color);font-size:0.88rem;">Times Sorteados Separados dos Montados</span><div class="toggle-desc" id="mixed-pairing-desc" style="font-size:0.72rem;margin-top:2px;">Desligado: duplas montadas e sorteadas disputam juntas, numa categoria só.</div></div></div>
                    <label class="toggle-switch" style="--toggle-on-bg:#a78bfa;--toggle-on-glow:rgba(167,139,250,0.3);--toggle-on-border:#a78bfa;"><input type="checkbox" id="mixed-pairing-toggle" aria-label="Separar duplas montadas das sorteadas" onchange="window._syncMixedPairing()"><span class="toggle-slider"></span></label>
                  </div>
                </div>
              </div>

              <!-- (Formação das duplas movida pra dentro do box FASE 1 — v2.6.49) -->

              <!-- Auto-close (apenas eliminatórias) -->
              <div class="form-group mb-3" id="auto-close-container" style="display:none;">
                <div class="toggle-row">
                  <div class="toggle-row-label"><span class="toggle-icon">⚡</span><div><span style="font-weight:bold;color:var(--text-color);">${_t('create.autoCloseLabel')}</span><div class="toggle-desc">${_t('create.autoCloseDesc')}</div></div></div>
                  <label class="toggle-switch"><input type="checkbox" id="tourn-auto-close"><span class="toggle-slider"></span></label>
                </div>
              </div>


              <!-- (Inscrições durante a fase movida pra dentro do box FASE 1 — v2.6.49) -->


              <!-- (Classificação movido para o box FASE 1) -->

              <!-- Critérios de Desempate -->
              <div id="tiebreaker-section" style="background: rgba(88,166,255,0.06); border: 1px solid rgba(88,166,255,0.15); border-radius: 12px; padding: 1rem; margin-bottom: 1rem;">
                <p style="margin: 0 0 0.5rem; font-size: 0.8rem; color: #58a6ff; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">${_t('create.tiebreakerSection')}</p>
                <small class="text-muted" style="display:block;margin-bottom:0.5rem;">${_t('create.tiebreakerDesc')}</small>
                <div style="display:flex;justify-content:flex-end;margin-bottom:0.6rem;"><button type="button" onclick="window._resetTiebreakers()" style="padding:5px 12px;border-radius:8px;border:1px solid rgba(88,166,255,0.35);background:rgba(88,166,255,0.1);color:#58a6ff;font-size:0.74rem;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:5px;">↺ ${_t('create.tbResetBtn')}</button></div>
                <ul id="tiebreaker-list" style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:6px;">
                  <li draggable="true" data-tb="pontos_avancados" ontouchstart="window._onTiebreakerTouchStart(event)" ontouchmove="window._onTiebreakerTouchMove(event)" ontouchend="window._onTiebreakerTouchEnd(event)" style="background:rgba(251,191,36,0.06);border:1px solid rgba(251,191,36,0.2);border-radius:8px;padding:8px 12px;cursor:grab;display:flex;align-items:center;gap:8px;font-size:0.85rem;color:var(--text-bright);user-select:none;"><span style="opacity:0.4;">⠿</span> 💯 ${_t('create.tbAdvancedPoints')} <small style="opacity:0.5; font-size:0.75rem;">${_t('create.tbAdvancedPointsNote')}</small><span onclick="event.stopPropagation();event.preventDefault();window._showTiebreakInfo('pontos_avancados')" style="cursor:pointer;font-size:0.95rem;opacity:0.6;padding:0 4px;" title="${_t('create.tbInfoBtn')}">ℹ️</span><button type="button" data-tb-move class="cancel-x-btn" onclick="event.stopPropagation();event.preventDefault();window._tbMove(this)" style="--cx-size:20px;margin-left:auto;" title="${_t('create.tbRemoveBtn')}">✕</button></li>
                  <li draggable="true" data-tb="confronto_direto" ontouchstart="window._onTiebreakerTouchStart(event)" ontouchmove="window._onTiebreakerTouchMove(event)" ontouchend="window._onTiebreakerTouchEnd(event)" title="${_t('create.tbHeadToHeadTip')}" style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:8px 12px;cursor:grab;display:flex;align-items:center;gap:8px;font-size:0.85rem;color:var(--text-bright);user-select:none;"><span style="opacity:0.4;">⠿</span> 🆚 ${_t('create.tbHeadToHead')}<button type="button" data-tb-move class="cancel-x-btn" onclick="event.stopPropagation();event.preventDefault();window._tbMove(this)" style="--cx-size:20px;margin-left:auto;" title="${_t('create.tbRemoveBtn')}">✕</button></li>
                  <li draggable="true" data-tb="saldo_pontos" ontouchstart="window._onTiebreakerTouchStart(event)" ontouchmove="window._onTiebreakerTouchMove(event)" ontouchend="window._onTiebreakerTouchEnd(event)" title="${_t('create.tbPointDiffTip')}" style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:8px 12px;cursor:grab;display:flex;align-items:center;gap:8px;font-size:0.85rem;color:var(--text-bright);user-select:none;"><span style="opacity:0.4;">⠿</span> ⚖️ ${_t('create.tbPointDiff')}<button type="button" data-tb-move class="cancel-x-btn" onclick="event.stopPropagation();event.preventDefault();window._tbMove(this)" style="--cx-size:20px;margin-left:auto;" title="${_t('create.tbRemoveBtn')}">✕</button></li>
                  <li draggable="true" data-tb="vitorias" ontouchstart="window._onTiebreakerTouchStart(event)" ontouchmove="window._onTiebreakerTouchMove(event)" ontouchend="window._onTiebreakerTouchEnd(event)" title="${_t('create.tbWinsTip')}" style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:8px 12px;cursor:grab;display:flex;align-items:center;gap:8px;font-size:0.85rem;color:var(--text-bright);user-select:none;"><span style="opacity:0.4;">⠿</span> 🏆 ${_t('create.tbWins')}<button type="button" data-tb-move class="cancel-x-btn" onclick="event.stopPropagation();event.preventDefault();window._tbMove(this)" style="--cx-size:20px;margin-left:auto;" title="${_t('create.tbRemoveBtn')}">✕</button></li>
                  <li draggable="true" data-tb="buchholz" ontouchstart="window._onTiebreakerTouchStart(event)" ontouchmove="window._onTiebreakerTouchMove(event)" ontouchend="window._onTiebreakerTouchEnd(event)" title="${_t('create.tbBuchholzTip')}" style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:8px 12px;cursor:grab;display:flex;align-items:center;gap:8px;font-size:0.85rem;color:var(--text-bright);user-select:none;"><span style="opacity:0.4;">⠿</span> 💪 ${_t('create.tbBuchholz')} <small style="opacity:0.5; font-size:0.75rem;">(${_t('create.tbBuchholzAbbr')})</small> <span onclick="event.stopPropagation();event.preventDefault();window._showTiebreakInfo('buchholz')" style="cursor:pointer;font-size:0.95rem;opacity:0.6;padding:0 4px;" title="${_t('create.tbInfoBtn')}">ℹ️</span><button type="button" data-tb-move class="cancel-x-btn" onclick="event.stopPropagation();event.preventDefault();window._tbMove(this)" style="--cx-size:20px;margin-left:auto;" title="${_t('create.tbRemoveBtn')}">✕</button></li>
                  <li draggable="true" data-tb="sonneborn_berger" ontouchstart="window._onTiebreakerTouchStart(event)" ontouchmove="window._onTiebreakerTouchMove(event)" ontouchend="window._onTiebreakerTouchEnd(event)" title="${_t('create.tbSonnebornTip')}" style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:8px 12px;cursor:grab;display:flex;align-items:center;gap:8px;font-size:0.85rem;color:var(--text-bright);user-select:none;"><span style="opacity:0.4;">⠿</span> ⭐ ${_t('create.tbSonneborn')} <small style="opacity:0.5; font-size:0.75rem;">(${_t('create.tbSonnebornAbbr')})</small> <span onclick="event.stopPropagation();event.preventDefault();window._showTiebreakInfo('sonneborn_berger')" style="cursor:pointer;font-size:0.95rem;opacity:0.6;padding:0 4px;" title="${_t('create.tbInfoBtn')}">ℹ️</span><button type="button" data-tb-move class="cancel-x-btn" onclick="event.stopPropagation();event.preventDefault();window._tbMove(this)" style="--cx-size:20px;margin-left:auto;" title="${_t('create.tbRemoveBtn')}">✕</button></li>
                  <li draggable="true" data-tb="antiguidade" ontouchstart="window._onTiebreakerTouchStart(event)" ontouchmove="window._onTiebreakerTouchMove(event)" ontouchend="window._onTiebreakerTouchEnd(event)" style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:8px 12px;cursor:grab;display:flex;align-items:center;gap:8px;font-size:0.85rem;color:var(--text-bright);user-select:none;"><span style="opacity:0.4;">⠿</span> 👴 ${_t('create.tbOldest')} <small style="opacity:0.5; font-size:0.75rem;">${_t('create.tbOldestNote')}</small><button type="button" data-tb-move class="cancel-x-btn" onclick="event.stopPropagation();event.preventDefault();window._tbMove(this)" style="--cx-size:20px;margin-left:auto;" title="${_t('create.tbRemoveBtn')}">✕</button></li>
                  <li draggable="true" data-tb="sorteio" ontouchstart="window._onTiebreakerTouchStart(event)" ontouchmove="window._onTiebreakerTouchMove(event)" ontouchend="window._onTiebreakerTouchEnd(event)" style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:8px 12px;cursor:grab;display:flex;align-items:center;gap:8px;font-size:0.85rem;color:var(--text-bright);user-select:none;"><span style="opacity:0.4;">⠿</span> 🎲 ${_t('create.tbRandom')}<button type="button" data-tb-move class="cancel-x-btn" onclick="event.stopPropagation();event.preventDefault();window._tbMove(this)" style="--cx-size:20px;margin-left:auto;" title="${_t('create.tbRemoveBtn')}">✕</button></li>
                </ul>
                <p style="margin: 1rem 0 0.4rem; font-size: 0.78rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">${_t('create.tbExcludedSection')}</p>
                <small class="text-muted" style="display:block;margin-bottom:0.5rem;">${_t('create.tbExcludedDesc')}</small>
                <ul id="tiebreaker-excluded-list" style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:6px;min-height:40px;border:1px dashed rgba(255,255,255,0.12);border-radius:8px;padding:6px;">
                  <li draggable="true" data-tb="juventude" ontouchstart="window._onTiebreakerTouchStart(event)" ontouchmove="window._onTiebreakerTouchMove(event)" ontouchend="window._onTiebreakerTouchEnd(event)" style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:8px 12px;cursor:grab;display:flex;align-items:center;gap:8px;font-size:0.85rem;color:var(--text-bright);user-select:none;"><span style="opacity:0.4;">⠿</span> 👶 ${_t('create.tbYoungest')} <small style="opacity:0.5; font-size:0.75rem;">${_t('create.tbYoungestNote')}</small><button type="button" data-tb-move onclick="event.stopPropagation();event.preventDefault();window._tbMove(this)" style="margin-left:auto;background:none;border:none;cursor:pointer;color:#34d399;font-weight:700;font-size:0.95rem;padding:0 6px;line-height:1;" title="${_t('create.tbRestoreBtn')}">↩</button></li>
                </ul>
              </div>

            </form>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(createInteractiveElement(modalHtml));

    // v2.6.86: ordem do form — primeiro o que é de TODO o torneio (inscrição, desempate),
    // depois o que é particular das FASES. Move o box da Fase 1 + o construtor de fases
    // pra DEPOIS do critério de desempate (que é a última seção geral). Reorder único no
    // setup (a seção sobrevive ao move do .modal entre modal e #novo-torneio).
    (function () {
      var tb = document.getElementById('tiebreaker-section');
      var f1 = document.getElementById('fase1-box');
      var ps = document.getElementById('phases-section');
      if (tb && f1 && ps && tb.parentNode) {
        tb.parentNode.insertBefore(f1, tb.nextSibling);
        f1.parentNode.insertBefore(ps, f1.nextSibling);
      }
      // v4.4.15: CRITÉRIOS DE DESEMPATE = a ÚLTIMA coisa da edição (pedido do dono).
      if (tb && tb.parentNode) tb.parentNode.appendChild(tb);
    })();

    // Render the centralized back header with action buttons (Voltar + Carregar + Salvar Template + Descartar + Salvar)
    if (typeof window._renderCreateTournamentHeader === 'function') {
      window._renderCreateTournamentHeader();
    }

    // Add Google Places Autocomplete styling for dark theme
    if (!document.getElementById('google-places-style')) {
      const style = document.createElement('style');
      style.id = 'google-places-style';
      style.textContent = `
        .pac-container {
          background-color: var(--bg-card) !important;
          border: 1px solid var(--border-color) !important;
          border-radius: 10px !important;
          box-shadow: 0 8px 24px rgba(0,0,0,0.4) !important;
          color: var(--text-main) !important;
        }
        .pac-item {
          padding: 10px 14px !important;
          border-bottom: 1px solid rgba(255,255,255,0.05) !important;
          cursor: pointer !important;
          transition: background 0.1s !important;
        }
        .pac-item:hover {
          background-color: rgba(255,255,255,0.06) !important;
        }
        .pac-item-selected {
          background-color: rgba(99,102,241,0.2) !important;
        }
        .pac-item-query {
          font-size: 0.85rem !important;
          font-weight: 600 !important;
          color: var(--text-bright) !important;
        }
        .pac-matched {
          font-weight: 700 !important;
        }
      `;
      document.head.appendChild(style);
    }

    // Setup tiebreaker drag-and-drop
    const tbList = document.getElementById('tiebreaker-list');
    const tbExcluded = document.getElementById('tiebreaker-excluded-list');
    if (tbList) {
      // v2.2.47: helpers compartilhados pros dois boxes (ativo + não considerados)
      var _tbAllLis = function() { return Array.prototype.slice.call(document.querySelectorAll('#tiebreaker-list li, #tiebreaker-excluded-list li')); };
      var _tbClearMarks = function() { _tbAllLis().forEach(function(li) { li.style.borderTop = ''; }); };

      // Atualiza o botão ✕/↩ conforme o box em que o critério está
      // v1.2.39: o estado ATIVO usa o ✕ CANÔNICO (.cancel-x-btn — círculo vermelho, anel
      // branco, X branco); o estado EXCLUÍDO é ↩ (reativar), que NÃO é cancelamento e por
      // isso não leva o cânone. Alterna a CLASSE, não só a cor. cssText escreve o estilo
      // COMPLETO em cada estado (cssText substitui tudo — nunca contar com o que havia).
      window._tbUpdateRowControls = function(li) {
        if (!li) return;
        var btn = li.querySelector('[data-tb-move]');
        if (!btn) return;
        var inExcluded = li.parentNode && li.parentNode.id === 'tiebreaker-excluded-list';
        if (inExcluded) {
          btn.classList.remove('cancel-x-btn');
          btn.textContent = '↩';
          btn.style.cssText = 'margin-left:auto;background:none;border:none;cursor:pointer;color:#34d399;font-weight:700;font-size:0.95rem;padding:0 6px;line-height:1;';
          btn.title = (window._t ? window._t('create.tbRestoreBtn') : 'Reativar critério');
        } else {
          btn.classList.add('cancel-x-btn');
          btn.textContent = '✕';
          btn.style.cssText = '--cx-size:20px;margin-left:auto;';
          btn.title = (window._t ? window._t('create.tbRemoveBtn') : 'Não considerar este critério');
        }
      };

      // Antiguidade x Juventude são MUTUAMENTE EXCLUSIVOS — manter no máximo um
      // no box ativo; o outro vai pros não considerados.
      window._tbNormalizeAge = function(preferKey) {
        var active = document.getElementById('tiebreaker-list');
        var excluded = document.getElementById('tiebreaker-excluded-list');
        if (!active || !excluded) return;
        ['antiguidade', 'juventude'].forEach(function(k) {
          if (k === preferKey) return;
          var li = active.querySelector('li[data-tb="' + k + '"]');
          if (li) { excluded.appendChild(li); window._tbUpdateRowControls(li); }
        });
      };

      // Clique no ✕ (ativo→excluído) ou ↩ (excluído→ativo)
      window._tbMove = function(btn) {
        var li = btn.closest('li'); if (!li) return;
        var active = document.getElementById('tiebreaker-list');
        var excluded = document.getElementById('tiebreaker-excluded-list');
        if (!active || !excluded) return;
        var inActive = li.parentNode === active;
        var key = li.dataset.tb;
        if (inActive) {
          excluded.appendChild(li);
        } else {
          active.appendChild(li);
          if (key === 'antiguidade' || key === 'juventude') window._tbNormalizeAge(key);
        }
        window._tbUpdateRowControls(li);
      };

      // Arranjo SUGERIDO dos critérios (ordem ativa + excluídos). Fonte única do reset.
      // Bate com a ordem inicial dos <li> no HTML da seção de desempate.
      var _TB_DEFAULT_ACTIVE = ['pontos_avancados', 'confronto_direto', 'saldo_pontos', 'vitorias', 'buchholz', 'sonneborn_berger', 'antiguidade', 'sorteio'];
      var _TB_DEFAULT_EXCLUDED = ['juventude'];
      // Restaura os critérios de desempate pra ordem + divisão (ativo/excluído) sugeridas.
      // Reusa os <li> existentes (appendChild move o nó; iterar na ordem default reordena).
      window._resetTiebreakers = function() {
        var T = window._t || function(k){ return k; };
        var active = document.getElementById('tiebreaker-list');
        var excluded = document.getElementById('tiebreaker-excluded-list');
        if (!active || !excluded) return;
        var _find = function(key) { return document.querySelector('#tiebreaker-list li[data-tb="' + key + '"], #tiebreaker-excluded-list li[data-tb="' + key + '"]'); };
        _TB_DEFAULT_ACTIVE.forEach(function(key) {
          var li = _find(key);
          if (li) { active.appendChild(li); if (window._tbUpdateRowControls) window._tbUpdateRowControls(li); }
        });
        _TB_DEFAULT_EXCLUDED.forEach(function(key) {
          var li = _find(key);
          if (li) { excluded.appendChild(li); if (window._tbUpdateRowControls) window._tbUpdateRowControls(li); }
        });
        if (window.showNotification) window.showNotification('🎯 ' + T('create.tbResetBtn'), T('create.tbResetToast'), 'success');
      };

      let dragItem = null;
      var _attachTbDnd = function(listEl) {
        if (!listEl) return;
        listEl.addEventListener('dragstart', (e) => {
          dragItem = e.target.closest('li');
          if (dragItem) {
            dragItem.style.opacity = '0.4';
            e.dataTransfer.effectAllowed = 'move';
          }
        });
        listEl.addEventListener('dragend', (e) => {
          if (dragItem) dragItem.style.opacity = '1';
          dragItem = null;
          _tbClearMarks();
        });
        listEl.addEventListener('dragover', (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          const target = e.target.closest('li');
          _tbClearMarks();
          if (target && target !== dragItem) target.style.borderTop = '2px solid #58a6ff';
        });
        listEl.addEventListener('drop', (e) => {
          e.preventDefault();
          if (!dragItem) return;
          const target = e.target.closest('li');
          if (target && target !== dragItem) {
            target.parentNode.insertBefore(dragItem, target);
          } else if (!target) {
            listEl.appendChild(dragItem);
          }
          _tbClearMarks();
          window._tbUpdateRowControls(dragItem);
          var k = dragItem.dataset.tb;
          if ((k === 'antiguidade' || k === 'juventude') && dragItem.parentNode && dragItem.parentNode.id === 'tiebreaker-list') {
            window._tbNormalizeAge(k);
          }
        });
      };
      _attachTbDnd(tbList);
      _attachTbDnd(tbExcluded);

      // Touch drag-and-drop for tiebreaker criteria
      let _touchDragEl = null;
      let _touchDragClone = null;

      window._onTiebreakerTouchStart = function(e) {
        const item = e.target.closest('[draggable]');
        if (!item) return;
        _touchDragEl = item;
        _touchDragClone = item.cloneNode(true);
        _touchDragClone.style.position = 'fixed';
        _touchDragClone.style.opacity = '0.7';
        _touchDragClone.style.pointerEvents = 'none';
        _touchDragClone.style.zIndex = '9999';
        _touchDragClone.style.width = item.offsetWidth + 'px';
        document.body.appendChild(_touchDragClone);
        const touch = e.touches[0];
        _touchDragClone.style.left = touch.clientX + 'px';
        _touchDragClone.style.top = touch.clientY + 'px';
        item.style.opacity = '0.3';
      };

      window._onTiebreakerTouchMove = function(e) {
        if (!_touchDragEl) return;
        e.preventDefault();
        const touch = e.touches[0];
        if (_touchDragClone) {
          _touchDragClone.style.left = touch.clientX + 'px';
          _touchDragClone.style.top = (touch.clientY - 20) + 'px';
        }
        if (typeof window._dragAutoScrollOnTouchMove === 'function') window._dragAutoScrollOnTouchMove(e);
      };

      window._onTiebreakerTouchEnd = function(e) {
        if (!_touchDragEl) return;
        if (_touchDragClone) _touchDragClone.remove();
        _touchDragEl.style.opacity = '1';

        const touch = e.changedTouches[0];
        const target = document.elementFromPoint(touch.clientX, touch.clientY);
        const targetItem = target ? target.closest('[draggable]') : null;
        const targetList = target ? target.closest('#tiebreaker-list, #tiebreaker-excluded-list') : null;

        if (targetItem && targetItem !== _touchDragEl) {
          // insere relativo ao item alvo (mesmo que seja em outro box)
          const container = targetItem.parentNode;
          if (container === _touchDragEl.parentNode) {
            const items = Array.from(container.querySelectorAll('[draggable]'));
            const fromIdx = items.indexOf(_touchDragEl);
            const toIdx = items.indexOf(targetItem);
            if (fromIdx < toIdx) container.insertBefore(_touchDragEl, targetItem.nextSibling);
            else container.insertBefore(_touchDragEl, targetItem);
          } else {
            container.insertBefore(_touchDragEl, targetItem);
          }
        } else if (targetList && targetList !== _touchDragEl.parentNode) {
          // soltou num box vazio (ou área sem item) — move pro fim daquele box
          targetList.appendChild(_touchDragEl);
        }

        if (typeof window._tbUpdateRowControls === 'function') window._tbUpdateRowControls(_touchDragEl);
        var _tk = _touchDragEl.dataset.tb;
        if ((_tk === 'antiguidade' || _tk === 'juventude') && _touchDragEl.parentNode && _touchDragEl.parentNode.id === 'tiebreaker-list' && typeof window._tbNormalizeAge === 'function') {
          window._tbNormalizeAge(_tk);
        }

        _touchDragEl = null;
        _touchDragClone = null;
        if (typeof window._dragAutoScrollStop === 'function') window._dragAutoScrollStop();
      };
    }
  }

  // Tamanho de time por modalidade — DERIVADO da fonte única window.SPORT_RULES.
  const _sportTeamDefaults = window._sportTeamDefaultsMap();

  // ── Sport Button Selection ──
  window._selectSport = function(btn) {
    // Deselect all sport buttons
    var btns = document.querySelectorAll('#sport-buttons .sport-btn');
    btns.forEach(function(b) {
      b.classList.remove('sport-btn-active');
      b.style.border = '2px solid rgba(255,255,255,0.18)';
      b.style.background = 'rgba(255,255,255,0.06)';
      b.style.color = 'var(--text-main)';
    });
    // Select clicked
    btn.classList.add('sport-btn-active');
    btn.style.border = '2px solid #fbbf24';
    btn.style.background = 'rgba(251,191,36,0.15)';
    btn.style.color = '#fbbf24';
    // Sync hidden select
    var sel = document.getElementById('select-sport');
    if (sel) {
      var val = btn.getAttribute('data-sport');
      for (var i = 0; i < sel.options.length; i++) {
        if (sel.options[i].text === val || sel.options[i].value === val) { sel.selectedIndex = i; break; }
      }
    }
    window._onSportChange();
  };

  // ── Game Type (Simples/Duplas) Toggle ──
  window._syncGameTypeToggles = function() {
    var tgS = document.getElementById('game-toggle-simples');
    var tgD = document.getElementById('game-toggle-duplas');
    if (!tgS || !tgD) return;
    var sOn = tgS.checked;
    var dOn = tgD.checked;
    // Prevent both off
    if (!sOn && !dOn) { tgD.checked = true; dOn = true; }

    var gameTypesField = document.getElementById('tourn-game-types');
    var teamSizeField = document.getElementById('tourn-team-size');

    if (sOn && dOn) {
      if (gameTypesField) gameTypesField.value = 'simples,duplas';
      if (teamSizeField) teamSizeField.value = '2';
    } else if (dOn) {
      if (gameTypesField) gameTypesField.value = 'duplas';
      if (teamSizeField) teamSizeField.value = '2';
    } else {
      if (gameTypesField) gameTypesField.value = 'simples';
      if (teamSizeField) teamSizeField.value = '1';
    }
    // v2.7.83: "Participantes podem formar duplas" + "Times Sorteados Separados" só
    // valem em DUPLAS (dOn). Em Simples puro, escondem e desligam (cascata: pareamento
    // off → separados off + modo individual).
    var _mpc = document.getElementById('manual-pairing-container');
    var _sepc = document.getElementById('mixed-pairing-container');
    if (_mpc) _mpc.style.display = dOn ? '' : 'none';
    if (_sepc) _sepc.style.display = dOn ? '' : 'none';
    if (!dOn) {
      var _mp = document.getElementById('manual-pairing-toggle');
      if (_mp && _mp.checked) { _mp.checked = false; if (typeof window._syncManualPairing === 'function') window._syncManualPairing(); }
    }

    // Update description
    var descEl = document.getElementById('game-type-desc');
    if (descEl) {
      if (sOn && dOn) descEl.textContent = _t('create.singlesDoubles');
      else if (sOn) descEl.textContent = _t('create.singlesOnly');
      else descEl.textContent = _t('create.doublesOnly');
    }

    if (typeof window._updateCategoryPreview === 'function') window._updateCategoryPreview();
  };
  // Legacy compat
  window._toggleGameType = function(type) {
    var tgS = document.getElementById('game-toggle-simples');
    var tgD = document.getElementById('game-toggle-duplas');
    if (!tgS || !tgD) return;
    if (type === 'simples') { tgS.checked = true; tgD.checked = false; }
    else if (type === 'duplas') { tgS.checked = false; tgD.checked = true; }
    else if (type === 'ambos') { tgS.checked = true; tgD.checked = true; }
    window._syncGameTypeToggles();
  };

  // ── Formato Button Selection ──
  var _formatoDescs = {
    'elim_simples': _t('create.descElimSimples'),
    'elim_dupla': _t('create.descElimDupla'),
    'grupos_mata': _t('create.descGrupos'),
    'suico': _t('create.descSuico'),
    'liga': _t('create.descLiga')
  };
  var _drawModeDescs = {
    'sorteio': _t('create.drawModeSorteioDesc'),
    'rei_rainha': _t('create.drawModeMonarchDesc'),
    'round_robin': 'O sorteio é pré-gerado: ao fim de cada turno, todos os jogadores da categoria terão se enfrentado.'
  };
  var _enrollModeDescs = {
    'individual': _t('create.enrollModeIndividualDesc'),
    'time': _t('create.enrollModeTimeDesc'),
    'misto': _t('create.enrollModeMistoDesc')
  };
  // v2.6.66: o picker exibe 3 categorias (Pontos Corridos / Fase de Grupos /
  // Eliminatórias). A categoria é mapeada pro valor INTERNO de t.format (intocado):
  // pontos→'liga', grupos→'grupos_mata', elim→'elim_simples'|'elim_dupla' (toggle Dupla).
  window._selectFormato = function(btn) {
    var cat = btn.getAttribute('data-fmt');
    var btns = document.querySelectorAll('#formato-buttons .formato-btn');
    btns.forEach(function(b) {
      if (b.getAttribute('data-fmt') === cat) {
        b.classList.add('formato-btn-active');
        b.style.border = '2px solid #3b82f6';
        b.style.background = 'rgba(59,130,246,0.12)';
        b.style.color = '#60a5fa';
        b.style.fontWeight = '700';
        b.style.boxShadow = '0 0 12px rgba(59,130,246,0.2)';
      } else {
        b.classList.remove('formato-btn-active');
        b.style.border = '2px solid rgba(255,255,255,0.18)';
        b.style.background = 'rgba(255,255,255,0.05)';
        b.style.color = 'var(--text-main)';
        b.style.fontWeight = '700';
        b.style.boxShadow = 'none';
      }
    });
    var duplaEl = document.getElementById('toggle-dupla-elim');
    var value = (cat === 'pontos') ? 'liga'
              : (cat === 'grupos') ? 'grupos_mata'
              : (duplaEl && duplaEl.checked) ? 'elim_dupla' : 'elim_simples';
    // Sync hidden select (fonte única de verdade para todo o resto do form)
    var sel = document.getElementById('select-formato');
    if (sel) { sel.value = value; }
    // Update description
    var descEl = document.getElementById('formato-desc');
    if (descEl) descEl.textContent = _formatoDescs[value] || '';
    window._onFormatoChange();
  };

  // Toggle Dupla Eliminatória — alterna elim_simples ↔ elim_dupla mantendo
  // a categoria Eliminatórias ativa. Só age quando Eliminatórias está selecionado.
  window._toggleDuplaElim = function(checked) {
    var sel = document.getElementById('select-formato');
    if (!sel) return;
    var activeBtn = document.querySelector('#formato-buttons .formato-btn.formato-btn-active');
    if (activeBtn && activeBtn.getAttribute('data-fmt') !== 'elim') return;
    var value = checked ? 'elim_dupla' : 'elim_simples';
    sel.value = value;
    var descEl = document.getElementById('formato-desc');
    if (descEl) descEl.textContent = _formatoDescs[value] || '';
    window._onFormatoChange();
  };

  // ── Rigor da inscrição (Casual ↔ Oficial) — 3 stops ──
  window._RIGOR_LEVELS = ['casual', 'moderado', 'oficial'];
  window._RIGOR_DESCS = {
    casual: '🎾 <b>Casual</b> — não verifica o histórico dos inscritos. Qualquer pessoa se inscreve; as categorias são só informativas.',
    moderado: '🔎 <b>Moderado</b> — a pessoa <b>se inscreve, mas fica pendente</b> de ajuste do organizador: o histórico é puxado e divergências de categoria são sinalizadas (🚩) pra você revisar/ajustar antes de confirmar.',
    oficial: '🏆 <b>Oficial</b> — exige perfil e histórico <b>compatíveis</b> com as categorias do torneio (nível, idade, gênero). Sem histórico ou fora do perfil, a pessoa não se inscreve. <i>(as travas entram gradualmente)</i>'
  };
  window._rigorLive = function(v) {
    var lvl = window._RIGOR_LEVELS[+v] || 'casual';
    var hid = document.getElementById('tourn-rigor'); if (hid) hid.value = lvl;
    var d = document.getElementById('tourn-rigor-desc'); if (d) d.innerHTML = window._RIGOR_DESCS[lvl] || '';
    // toggles "Exigir dos inscritos" só valem fora do Casual
    var rb = document.getElementById('rigor-require-block'); if (rb) rb.style.display = (lvl === 'casual') ? 'none' : 'block';
  };
  window._setRigorFromValue = function(lvl) {
    var idx = window._RIGOR_LEVELS.indexOf(lvl); if (idx < 0) idx = 0;
    var sl = document.getElementById('tourn-rigor-slider'); if (sl) sl.value = String(idx);
    window._rigorLive(idx);
  };

  // ── Draw Mode Selection (Sorteio / Rei/Rainha) ──
  window._selectDrawMode = function(btn) {
    var value = btn.getAttribute('data-value');
    var btns = document.querySelectorAll('#draw-mode-buttons .draw-mode-btn');
    btns.forEach(function(b) {
      if (b.getAttribute('data-value') === value) {
        b.classList.add('draw-mode-active');
        b.style.border = '2px solid #34d399';
        b.style.background = 'rgba(16,185,129,0.15)';
        b.style.color = '#34d399';
        b.style.fontWeight = '600';
      } else {
        b.classList.remove('draw-mode-active');
        b.style.border = '2px solid rgba(255,255,255,0.18)';
        b.style.background = 'rgba(255,255,255,0.06)';
        b.style.color = 'var(--text-main)';
        b.style.fontWeight = '600';
      }
    });
    var hidden = document.getElementById('draw-mode');
    if (hidden) hidden.value = value;
    var descEl = document.getElementById('draw-mode-desc');
    if (descEl) descEl.textContent = _drawModeDescs[value] || '';
    // Show/hide Rei/Rainha config and update dependent fields
    var rrFields = document.getElementById('rei-rainha-fields');
    var _fmtVal = document.getElementById('select-formato').value;
    if (rrFields) rrFields.style.display = (value === 'rei_rainha' && _fmtVal !== 'liga') ? 'block' : 'none';
    // Show/hide "Todos contra todos" config (Liga only)
    var rrConfig = document.getElementById('round-robin-fields');
    if (rrConfig) rrConfig.style.display = (value === 'round_robin') ? 'block' : 'none';
    // Re-trigger format change to sync Liga round format toggle etc.
    window._onFormatoChange();
  };

  // ── Formato (configurador único format2) ──
  // v4.4.x (Camada 2): o antigo construtor de fases 2+ (window._extraPhases) foi REMOVIDO.
  // O configurador único window.FORMAT2 (format2.js + format2-ui.js) é a fonte única de
  // t.phases; a config crua vive em t.fmt2. Só resta o nome custom da Fase 1 (espelho).
  window._phase1Name = window._phase1Name || '';
  // ⚰️ v4.4.x DELETADO: _phaseLateEnrollHtml + _setPhaseDraw (construtor de fases fase-2+).
  // ⚰️ v4.4.x DELETADO: _updatePhaseDrawExplain / _recalcPhaseRounds / _applyPhaseRounds /
  // _phaseDrawScheduleHtml (agendamento de sorteio por fase — construtor fase-2+ morto).
  // ─── Sistema de Pontuação (GSM) por fase — modelo OVERRIDE — v2.6.69 ───
  // ph.scoring null = herda o padrão do torneio; senão = override da fase.
  // (Personalizado fica no padrão do torneio — o modal global é hardwired à Fase 1.)
  window._currentSportName = function() {
    var sportEl = document.getElementById('select-sport');
    if (!sportEl || !sportEl.options[sportEl.selectedIndex]) return '';
    return sportEl.options[sportEl.selectedIndex].text.replace(/^[^\wÀ-ɏ]+/u, '').trim();
  };
  // ⚰️ v4.4.x DELETADO: _phaseGsmSelectPreset / _phaseGsmAdvantage / _phaseGsmHtml (GSM por fase — construtor fase-2+ morto).
  // (removido v4.3.3: _phaseDests tinha rótulos "Ouro"/"Prata" hardcoded e zero callers —
  //  o nome de cada linha é 100% do organizador via mapping[i].label. Sem defaults de nome.)
  // ⚰️ v4.4.x DELETADO: _addPhase / _removePhase (construtor de empilhamento de fases fase-2+).
  // Stubs no-op: o botão #add-phase-btn é removido do DOM pelo _F2_REMOVE (format2); os stubs
  // só garantem que qualquer onclick residual não lance "is not a function".
  window._addPhase = function(){};
  window._removePhase = function(){};

  // v4.4.3: monta o CONFIGURADOR ÚNICO (format2) dentro do #fase1-box e ESCONDE os
  // controles de estrutura antigos (formato/modo/grupos/liga/elim/rei-rainha/etc.).
  // GSM, categorias, datas, W.O. e lançamento continuam do form. Idempotente: esconde
  // sempre; monta a config só 1× (não reinicia a cada _onFormatoChange).
  window._f2MountInEditForm = function () {
    var box = document.getElementById('fase1-box');
    if (!box || !window.FORMAT2 || typeof window._f2MountInForm !== 'function') return;
    // v4.4.18: ISOLAMENTO COMPLETO do construtor antigo (pedido do dono — "tira o fallback
    // de ação, senão não temos segurança de que o novo funciona"). Os controles de ESTRUTURA
    // que o format2 substitui inteiramente são REMOVIDOS do DOM (não só escondidos): assim não
    // há como o construtor antigo vazar nem dirigir o save. Se o format2 quebrar, some (óbvio)
    // em vez de silenciosamente cair no velho. Antes de remover, qualquer input/select COM id é
    // realocado escondido no #fase1-box (o save/_onFormatoChange acessam por id).
    var _F2_REMOVE = ['fase1-header-row', 'formato-buttons', 'formato-desc', 'dupla-elim-row',
      'elim-settings', 'grupos-fields', 'rei-rainha-fields', 'round-robin-fields',
      'phases-list', 'phases-section', 'draw-mode-buttons', 'draw-mode-desc'];
    _F2_REMOVE.forEach(function (id) {
      Array.prototype.forEach.call(document.querySelectorAll('#' + id), function (el) {
        if (el.querySelectorAll) Array.prototype.forEach.call(el.querySelectorAll('input[id],select[id],textarea[id]'), function (f) { f.style.display = 'none'; try { box.appendChild(f); } catch (e) {} });
        try { el.remove(); } catch (e) {}
      });
    });
    // Config específica de Liga/Suíço (season/inatividade/agendamento) que o format2 ainda não
    // cobre guarda inputs escondidos que _onFormatoChange toca → ESCONDE (não remove).
    ['suico-fields', 'liga-fields', 'suico-draw-schedule-fields', 'game-type-desc']
      .forEach(function (id) { Array.prototype.forEach.call(document.querySelectorAll('#' + id), function (el) { el.style.setProperty('display', 'none', 'important'); }); });
    // v4.4.9: os toggles de FORMAÇÃO DE DUPLAS ficam VISÍVEIS (o dono quer os detalhados):
    // "Times Sorteados Separados dos Montados" (#mixed-pairing-container) vai LOGO ABAIXO
    // de "Participantes podem formar suas duplas" (#manual-pairing-container). A visibilidade
    // por disputa (só duplas) é sincronizada pelo format2 (_syncTeamSize).
    var _mpc = document.getElementById('manual-pairing-container');
    var _mixc = document.getElementById('mixed-pairing-container');
    if (_mpc && _mixc && _mpc.parentElement) {
      try { _mpc.parentElement.insertBefore(_mixc, _mpc.nextSibling); } catch (e) {}
    }
    // Esconde os labels órfãos "Formato" e "Modo de Sorteio".
    var fb = document.getElementById('formato-buttons');
    if (fb) { var fg = fb.closest ? fb.closest('.form-group') : null; if (fg) { var l1 = fg.querySelector('label.form-label'); if (l1) l1.style.display = 'none'; } }
    var dmb = document.getElementById('draw-mode-buttons');
    if (dmb && dmb.parentElement) { var l2 = dmb.parentElement.querySelector('label.form-label'); if (l2) l2.style.display = 'none'; }
    // (cabeçalho "FASE 1" já escondido acima via #fase1-header-row — sincretismo, sem fases.)
    // v4.4.6: esconde o "Tipo de Jogo" (Simples/Duplas) antigo — o format2 "Disputa" já
    // faz isso, e só mostra o toggle onde o esporte permite singles (tênis/tênis de mesa).
    // O hidden #tourn-team-size fica no DOM (só oculto); o format2 sincroniza o value.
    var gtb = document.getElementById('game-type-buttons');
    if (gtb) { var gg = gtb.closest ? gtb.closest('.form-group') : null; (gg || gtb).style.display = 'none'; }
    var gtd = document.getElementById('game-type-desc'); if (gtd) gtd.style.display = 'none';
    // v4.4.53: "Modo de Sorteio" órfão — o wrapper #draw-mode-container só guarda o label
    // (os botões/desc já saíram no _F2_REMOVE); o format2 ("Formação das equipes") cobre isso.
    // Esconde a frase inteira.
    var _dmc = document.getElementById('draw-mode-container'); if (_dmc) _dmc.style.setProperty('display', 'none', 'important');
    // v4.4.53: "Formato da Partida" (GSM) e "Categorias" saem de DENTRO do #fase1-box e vão
    // pra ANTES dele — ficam entre "Máx. Participantes" (inscrição) e o Formato (fase
    // classificatória). Idempotente: mover nó já reposicionado é no-op. Save lê por id (posição
    // no DOM não importa).
    var _formParent = box.parentElement;
    if (_formParent) {
      var _gsm = document.getElementById('gsm-section');
      // Bloco de categorias (sem id próprio): sobe de #gender-cat-buttons até o filho DIRETO
      // de #fase1-box (posição inicial) OU de #formParent (já realocado numa render anterior) —
      // assim o achamos de novo mesmo depois de movido (senão a ordem invertia entre re-renders).
      var _catBlock = null, _gcb = document.getElementById('gender-cat-buttons');
      if (_gcb) {
        var _pp = _gcb;
        while (_pp && _pp.parentElement && _pp.parentElement.id !== 'fase1-box' && _pp.parentElement !== _formParent) _pp = _pp.parentElement;
        if (_pp && _pp.parentElement && (_pp.parentElement.id === 'fase1-box' || _pp.parentElement === _formParent)) _catBlock = _pp;
      }
      // Ordem final determinística (idempotente a cada render): … Máx. Participantes · GSM ·
      // Categorias · #fase1-box. Insere Categorias antes do box, depois GSM antes de Categorias.
      if (_catBlock && _catBlock.parentElement) { try { _formParent.insertBefore(_catBlock, box); } catch (e) {} }
      if (_gsm && _gsm.parentElement) { try { _formParent.insertBefore(_gsm, (_catBlock && _catBlock.parentElement === _formParent) ? _catBlock : box); } catch (e) {} }
      // v1.15.28: o Rigor da inscrição vive DENTRO do box de Categorias (no topo),
      // então acompanha a realocação do bloco de categorias — sem mover separado.
    }
    // Injeta o mount e inicia a config (default do esporte ou t.fmt2 do torneio em edição).
    // v4.4.17: editId-aware — se já há mount PRA ESTE torneio, mantém (não apaga config
    // em andamento). Se o torneio mudou (ou saiu de edição pra criação), reconstrói.
    var editId = (document.getElementById('edit-tournament-id') || {}).value || '';
    var _existing = document.getElementById('f2-config-mount');
    if (_existing) {
      if (_existing.getAttribute('data-f2-editid') === editId) return; // mesmo contexto → mantém
      try { _existing.remove(); } catch (e) {}
    }
    var mount = document.createElement('div');
    mount.id = 'f2-config-mount';
    mount.setAttribute('data-f2-editid', editId);
    mount.style.cssText = 'margin:2px 0 10px;';
    try { box.insertBefore(mount, box.children[1] || null); } catch (e) { box.appendChild(mount); }
    var sport = (typeof window._currentSportName === 'function' && window._currentSportName()) || 'Beach Tennis';
    var initCfg = null, tourn = null;
    if (editId && typeof window._findTournamentById === 'function') { tourn = window._findTournamentById(editId); if (tourn && tourn.fmt2) initCfg = tourn.fmt2; }
    // v4.4.x (Camada 2): torneio NOVO a partir de template — inicia da config do template.
    if (!initCfg && window._f2PendingTemplateCfg) { initCfg = window._f2PendingTemplateCfg; window._f2PendingTemplateCfg = null; }
    window._f2MountInForm(mount, sport, initCfg, tourn);
    // v4.4.59: "Sistema de Pontos Avançado" disponível na classificatória de QUALQUER formato.
    // Reposiciona logo abaixo do configurador (área da classificatória) e mostra quando há
    // classificatória (Fase de Grupos / Pontos Corridos); esconde na eliminação direta.
    try {
      var _advSec = document.getElementById('adv-scoring-section');
      if (_advSec) {
        var _f2adv = (typeof window._f2GetConfig === 'function') ? window._f2GetConfig() : null;
        var _hasClassif = !!(_f2adv && _f2adv.classifAtiva === true);
        if (mount && mount.parentNode === box) { box.insertBefore(_advSec, mount.nextSibling); }
        _advSec.style.display = _hasClassif ? 'block' : 'none';
      }
    } catch (e) {}
  };
  // ⚰️ v4.4.x DELETADO: _setPhaseField (setter do construtor de fases fase-2+). Stub no-op —
  // seus únicos call sites viviam em _phaseCardHtml/_phaseFormatGridHtml/_phaseDrawModeHtml
  // (HTML nunca mais gerado, pois _renderPhases virou no-op). O stub evita qualquer erro
  // "is not a function" caso um onclick residual seja alcançado.
  window._setPhaseField = function(){};
  // Fase 1 é HTML estático: colapsa escondendo tudo no #fase1-box menos o cabeçalho.
  // Via CSS (atributo data-collapsed) pra NÃO mexer no display inline dos filhos —
  // várias seções (suico/grupos/liga-fields…) têm display:none próprio que precisa
  // ser preservado ao reexpandir. Setar style.display='' os revelaria por engano.
  window._toggleFase1Collapse = function() {
    var box = document.getElementById('fase1-box'); if (!box) return;
    if (!document.getElementById('sp-fase1-collapse-css')) {
      var st = document.createElement('style'); st.id = 'sp-fase1-collapse-css';
      st.textContent = '#fase1-box[data-collapsed="1"] > *:not(:first-child){display:none !important;}';
      document.head.appendChild(st);
    }
    var collapsed = box.getAttribute('data-collapsed') !== '1';
    box.setAttribute('data-collapsed', collapsed ? '1' : '0');
    var btn = document.getElementById('fase1-collapse-btn'); if (btn) btn.textContent = collapsed ? '▸' : '▾';
  };
  // ⚰️ v4.4.x DELETADO: _phaseCardHtml (montava o card de fase-2+) — construtor de
  // empilhamento de fases substituído pelo configurador único window.FORMAT2 + #formato/:tId.
  // _renderPhases vira no-op: os helpers idx=0 vivos (_setPhaseWo/_togglePhaseResultEntry/
  // _setPhaseRankingType) ainda o chamam nos ramos idx>=1 — o no-op os deixa inócuos.
  window._renderPhases = function(){};

  // ── Enrollment Mode Toggles (non-exclusive) ──
  window._syncEnrollToggles = function() {
    var indiv = document.getElementById('enroll-toggle-individual');
    var team = document.getElementById('enroll-toggle-team');
    if (!indiv || !team) return;
    var iOn = indiv.checked;
    var tOn = team.checked;
    // Prevent both off — re-enable the one just toggled off
    if (!iOn && !tOn) {
      // Figure out which was just unchecked and re-check it
      indiv.checked = true;
      iOn = true;
    }
    var value = 'individual';
    if (iOn && tOn) value = 'misto';
    else if (tOn) value = 'time';
    else value = 'individual';
    var sel = document.getElementById('select-inscricao');
    if (sel) sel.value = value;
    var descEl = document.getElementById('enroll-mode-desc');
    if (descEl) descEl.textContent = _enrollModeDescs[value] || '';
    // v2.7.83: a visibilidade do "Times Sorteados Separados" passou a ser controlada
    // pelo TIPO DE JOGO (só em Duplas), em _syncGameTypeToggles — não mais pelo modo
    // de inscrição (que saiu da UI). Aqui só sincroniza o aviso.
    if (typeof window._updateManualPairingNotice === 'function') window._updateManualPairingNotice();
  };

  // Quem forma as duplas: 'organizer_only' (default) | 'open' (participantes também).
  window._syncManualPairing = function() {
    var tgl = document.getElementById('manual-pairing-toggle');
    var hidden = document.getElementById('manual-pairing');
    var on = !!(tgl && tgl.checked);
    if (hidden) hidden.value = on ? 'open' : 'organizer_only';
    // v2.7.83: inscrição é sempre individual. Pareamento LIGADO = duplas MONTADAS
    // possíveis → enrollmentMode 'misto' (montadas + sorteadas). DESLIGADO = só
    // sorteadas → 'individual'. O toggle interno "Times Montados" (oculto) espelha o
    // pareamento e é quem deriva o select-inscricao via _syncEnrollToggles.
    // inscrição é SEMPRE individual (toggle interno sempre ligado); team = pareamento.
    // Assim o enrollmentMode derivado é 'misto' (pareamento on) ou 'individual' (off),
    // nunca 'time' — migra torneios legados de "só times" também.
    var indiv = document.getElementById('enroll-toggle-individual');
    var team = document.getElementById('enroll-toggle-team');
    var _chg = false;
    if (indiv && !indiv.checked) { indiv.checked = true; _chg = true; }
    if (team && team.checked !== on) { team.checked = on; _chg = true; }
    if (_chg && typeof window._syncEnrollToggles === 'function') window._syncEnrollToggles();
    // "Times Sorteados Separados" só faz sentido com pareamento ligado.
    if (!on) {
      var sep = document.getElementById('mixed-pairing-toggle');
      if (sep && sep.checked) { sep.checked = false; if (typeof window._syncMixedPairing === 'function') window._syncMixedPairing(); }
    }
    window._updateManualPairingNotice();
  };
  // v2.6.91: formação manual pressupõe Times Montados (ligado automaticamente), mas NÃO
  // exclui Individual — o organizador decide. Quando os dois ficam ligados (misto), avisa
  // que Individual também está marcado pra ele manter (misto) ou desmarcar (só duplas montadas).
  window._updateManualPairingNotice = function() {
    var box = document.getElementById('manual-pairing-notice'); if (!box) return;
    var mp = document.getElementById('manual-pairing-toggle');
    var indiv = document.getElementById('enroll-toggle-individual');
    var show = !!(mp && mp.checked && indiv && indiv.checked);
    if (!show) { box.style.display = 'none'; box.innerHTML = ''; return; }
    box.style.display = '';
    box.innerHTML = '<div style="padding:8px 10px;border-radius:9px;border:1px solid rgba(251,191,36,0.3);background:rgba(251,191,36,0.08);font-size:0.74rem;color:#fbbf24;line-height:1.4;">⚠️ <strong>Inscrição individual</strong> também está selecionada — junto com Times Montados, isso é <strong>misto</strong> (indivíduos se inscrevem sozinhos e podem se juntar formando duplas). Mantenha assim, ou desmarque <strong>Individual</strong> no Modo de Inscrição pra aceitar <strong>só duplas montadas</strong>.</div>';
  };

  // v2.2.46: separar duplas formadas x sorteadas em chaveamentos próprios.
  window._syncMixedPairing = function() {
    var tgl = document.getElementById('mixed-pairing-toggle');
    var hidden = document.getElementById('mixed-pairing-separated');
    var desc = document.getElementById('mixed-pairing-desc');
    if (!tgl) return;
    var on = tgl.checked;
    if (hidden) hidden.value = on ? 'true' : 'false';
    if (desc) desc.textContent = on
      ? 'Duas categorias: duplas MONTADAS só enfrentam montadas; SORTEADAS só enfrentam sorteadas (montada costuma jogar melhor).'
      : 'Desligado: duplas montadas e sorteadas disputam juntas, numa categoria só.';
    // v2.7.83: separar pressupõe que existam duplas montadas → liga o pareamento.
    if (on) {
      var mp = document.getElementById('manual-pairing-toggle');
      if (mp && !mp.checked) { mp.checked = true; if (typeof window._syncManualPairing === 'function') window._syncManualPairing(); }
    }
  };

  // v2.1.65: avisa que faltam montar os times e leva pra edição do Modo de
  // Inscrição com os boxes brilhando. Mostra inscritos / equipes / sem equipe.
  window._warnTeamsNotFormed = function(tId) {
    var t = window.AppStore.tournaments.find(function(x) { return String(x.id) === String(tId); });
    var arr = t ? (Array.isArray(t.participants) ? t.participants : (t.participants ? Object.values(t.participants) : [])) : [];
    var equipes = 0, semEquipe = 0, pessoas = 0;
    arr.forEach(function(p) {
      var members = window._entryTeamMembers(p); // v3.0.x: time por ESTRUTURA (uid/slots), não por '/'
      if (members) { equipes++; pessoas += members.length; }
      else { semEquipe++; pessoas++; }
    });
    var _pill = function(label, n, color) {
      return '<div style="flex:1;min-width:86px;background:rgba(255,255,255,0.04);border:1px solid ' + color + '55;border-radius:10px;padding:8px 6px;text-align:center;">' +
        '<div style="font-size:1.35rem;font-weight:800;color:' + color + ';line-height:1;">' + n + '</div>' +
        '<div style="font-size:0.64rem;color:var(--text-muted);margin-top:3px;text-transform:uppercase;letter-spacing:0.3px;">' + label + '</div>' +
      '</div>';
    };
    var msg =
      '<div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;">' +
        _pill('Inscritos', pessoas, '#a5b4fc') +
        _pill('Equipes formadas', equipes, '#34d399') +
        _pill('Sem equipe', semEquipe, '#fbbf24') +
      '</div>' +
      '<div>As inscrições são <b>individuais</b>. As duplas/times são formados <b>arrastando o card de um jogador sobre o de outro</b> — isso pode ser feito por <b>você</b> ou pelos <b>próprios participantes</b>.</div>' +
      '<div style="margin-top:8px;">Se preferir, mude o <b>Modo de Inscrição</b> para <b>"Individual"</b> e o sorteio forma as duplas automaticamente.</div>';
    var _go = function() {
      if (typeof window.openEditModal === 'function') window.openEditModal(tId);
      setTimeout(function() { if (typeof window._glowEnrollModeBoxes === 'function') window._glowEnrollModeBoxes(); }, 700);
    };
    if (typeof showConfirmDialog === 'function') {
      showConfirmDialog('👥 Falta montar os times', msg, _go, null,
        { type: 'warning', confirmText: '✏️ Ajustar inscrição', cancelText: 'Fechar' });
    } else { _go(); }
  };
  // Brilho nos boxes do Modo de Inscrição + scroll até eles.
  window._glowEnrollModeBoxes = function() {
    var box = document.getElementById('enroll-mode-buttons');
    if (box && box.scrollIntoView) { try { box.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {} }
    ['enroll-row-team', 'enroll-row-individual'].forEach(function(id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.classList.remove('enroll-glow');
      void el.offsetWidth; // reinicia a animação
      el.classList.add('enroll-glow');
      setTimeout(function() { el.classList.remove('enroll-glow'); }, 6000);
    });
  };
  // Legacy compat: _selectEnrollMode still works for game-type sync
  window._selectEnrollMode = function(btn) {
    if (!btn) return;
    var value = btn.getAttribute ? btn.getAttribute('data-value') : btn;
    if (typeof value !== 'string') return;
    var indiv = document.getElementById('enroll-toggle-individual');
    var team = document.getElementById('enroll-toggle-team');
    if (!indiv || !team) return;
    if (value === 'individual') { indiv.checked = true; team.checked = false; }
    else if (value === 'time' || value === 'teams') { indiv.checked = false; team.checked = true; }
    else if (value === 'misto') { indiv.checked = true; team.checked = true; }
    window._syncEnrollToggles();
  };

  // ── Result Entry Toggles (non-exclusive, multiple can be active) ──
  window._syncResultEntryToggles = function() {
    var org = document.getElementById('re-toggle-organizer');
    var plr = document.getElementById('re-toggle-players');
    var ref = document.getElementById('re-toggle-referee');
    if (!org || !plr || !ref) return;

    // Prevent all-off: if none checked, re-check organizer
    if (!org.checked && !plr.checked && !ref.checked) {
      org.checked = true;
    }

    // Build array of active roles
    var active = [];
    if (org.checked) active.push('organizer');
    if (plr.checked) active.push('players');
    if (ref.checked) active.push('referee');

    // Save to hidden input (single value as string, multiple as JSON array)
    var hidden = document.getElementById('select-result-entry');
    if (hidden) hidden.value = active.length === 1 ? active[0] : JSON.stringify(active);

    // Build combined description
    var parts = [];
    if (org.checked) parts.push(_t('create.resultOrganizers'));
    if (plr.checked) parts.push(_t('create.resultPlayers'));
    if (ref.checked) parts.push(_t('create.resultReferee'));
    var descEl = document.getElementById('result-entry-desc');
    if (descEl) descEl.textContent = parts.length ? _t('create.resultWho', { list: parts.join(' + ') }) : '';
  };
  // ── W.O. Scope sync (single toggle) ──
  // ON  → 'individual' (only absent player eliminated; partner continues)
  // OFF → 'team'       (whole team eliminated on W.O.)
  // v0.17.77: label + ícone + aria-label dinâmicos. Antes só a description
  // (texto pequeno) mudava; o título "Individual" ficava hardcoded mesmo
  // quando o toggle estava OFF (semanticamente "Time"). Agora o label
  // alterna entre "Individual" 👤 e "Time Inteiro" 👥 conforme o estado.
  window._syncWoScope = function() {
    var indiv = document.getElementById('wo-toggle-individual');
    if (!indiv) return;
    var value = indiv.checked ? 'individual' : 'team';
    var hidden = document.getElementById('wo-scope');
    if (hidden) hidden.value = value;
    var row = document.querySelector('#wo-scope-buttons .toggle-row');
    if (row) {
      row.style.border = indiv.checked ? '1px solid rgba(239,68,68,0.25)' : '1px solid rgba(255,255,255,0.08)';
      row.style.background = indiv.checked ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.03)';
    }
    var desc = document.getElementById('wo-indiv-desc');
    if (desc) desc.textContent = _t(indiv.checked ? 'create.woIndividualOnDesc' : 'create.woIndividualOffDesc');
    var label = document.getElementById('wo-label');
    if (label) label.textContent = _t(indiv.checked ? 'create.enrollIndividual' : 'create.woTeam');
    var icon = document.getElementById('wo-icon');
    if (icon) icon.textContent = indiv.checked ? '👤' : '👥';
    // aria-label do input acompanha o estado pra screen readers
    indiv.setAttribute('aria-label', indiv.checked ? 'W.O. individual' : 'W.O. de time inteiro');
  };

  // ── Late Enrollment sync (mutually exclusive toggles) ──
  // Fechadas ON  → 'closed' (no one can enroll after deadline)
  // Fechadas OFF + Expand OFF → 'standby' (new enrollments go to waitlist, no auto-matchups)
  // Fechadas OFF + Expand ON  → 'expand' (waitlist auto-expands into new matchups)
  //
  // v0.17.76: tornados mutuamente exclusivos. Antes ambos podiam estar ON
  // simultaneamente, criando estado inconsistente — "Fechadas" (sem
  // inscrições) com "Novos Confrontos" (auto-expand) ativos juntos não fazia
  // sentido. Agora: ligar um desliga o outro automaticamente. Defaults pra
  // estado inicial: closed=ON, expand=OFF.
  // ── Rótulos canônicos dos toggles de "Inscrições durante a fase" (v3.1.20) ──
  // O título E o ícone de cada toggle acompanham a POSIÇÃO — mesma regra na Fase 1,
  // no construtor de fases e em qualquer formato que use este bloco:
  //   master ('closed'):  ligado → Fechadas (🚫) | desligado → Abertas (🔓)
  //   conf   ('expand'):  ligado → Novos Confrontos (➕) | desligado → Suplentes Apenas (🪑)
  // A descrição já é dinâmica (lateEnroll*OnDesc / *OffDesc) e explica cada posição.
  window._lateEnrollLabel = function(which, on) {
    var T = window._t || function(k){ return k; };
    if (which === 'master') return { title: T(on ? 'create.lateEnrollClosed' : 'create.lateEnrollOpen'), icon: on ? '🚫' : '🔓' };
    return { title: T(on ? 'create.lateEnrollExpand' : 'create.lateEnrollSuplentesOnly'), icon: on ? '➕' : '🪑' };
  };

  window._syncLateEnrollment = function(source) {
    var closed = document.getElementById('late-toggle-closed');
    var expand = document.getElementById('late-toggle-expand');
    if (!closed || !expand) return;

    // v1.3.x (dono): "Fechadas" (Abertas) e "Novos Confrontos" são INDEPENDENTES — não há mais
    // exclusão mútua. Fechadas = aceitar novos inscritos após o sorteio. Novos Confrontos = suplentes/
    // duplas formadas entram na chave na hora, MESMO com as inscrições fechadas. Ver _allowsNewMatchups.
    // lateEnrollment carrega o estado de INSCRIÇÃO (closed x open); new-matchups é o flag independente.
    var value;
    if (closed.checked) value = 'closed';
    else value = expand.checked ? 'expand' : 'standby';
    var hidden = document.getElementById('late-enrollment');
    if (hidden) hidden.value = value;
    var nmHidden = document.getElementById('new-matchups');
    if (nmHidden) nmHidden.value = expand.checked ? 'true' : 'false';
    // Update visual active state independently per toggle
    var rows = document.querySelectorAll('#late-enrollment-buttons .toggle-row');
    if (rows[0]) {
      rows[0].style.border = closed.checked ? '1px solid rgba(251,191,36,0.25)' : '1px solid rgba(255,255,255,0.08)';
      rows[0].style.background = closed.checked ? 'rgba(251,191,36,0.08)' : 'rgba(255,255,255,0.03)';
    }
    if (rows[1]) {
      var expandEffective = expand.checked; // v1.3.x: independente de "Fechadas"
      rows[1].style.border = expandEffective ? '1px solid rgba(251,191,36,0.25)' : '1px solid rgba(255,255,255,0.08)';
      rows[1].style.background = expandEffective ? 'rgba(251,191,36,0.08)' : 'rgba(255,255,255,0.03)';
      // v1.3.98 (dono, "inscrições durante a fase travadas"): "Novos Confrontos" SEMPRE visível —
      // antes sumia quando Fechadas estava ON (display:none), então o organizador via só "Fechadas"
      // e achava que não dava pra mudar. Agora as duas opções aparecem; ligar uma desliga a outra
      // (1 clique). Quando Fechadas está ON, esta fica dim (não-efetiva) mas VISÍVEL e clicável.
      rows[1].style.display = '';
      rows[1].style.opacity = '1'; // v1.3.x: sempre efetivo (independente de "Fechadas")
    }
    // Título + ícone canônicos acompanham a posição de cada toggle (v3.1.20).
    var mLbl = window._lateEnrollLabel('master', closed.checked);
    var closedTitle = document.getElementById('late-closed-title');
    if (closedTitle) closedTitle.textContent = mLbl.title;
    var closedIcon = document.getElementById('late-closed-icon');
    if (closedIcon) closedIcon.textContent = mLbl.icon;
    // v1.3.x: rótulo do 2º toggle segue SÓ o próprio estado (independente de "Fechadas").
    var cLbl = window._lateEnrollLabel('conf', expand.checked);
    var expandTitle = document.getElementById('late-expand-title');
    if (expandTitle) expandTitle.textContent = cLbl.title;
    var expandIcon = document.getElementById('late-expand-icon');
    if (expandIcon) expandIcon.textContent = cLbl.icon;
    var closedDesc = document.getElementById('late-closed-desc');
    if (closedDesc) closedDesc.textContent = _t(closed.checked ? 'create.lateEnrollClosedOnDesc' : 'create.lateEnrollClosedOffDesc');
    var expandDesc = document.getElementById('late-expand-desc');
    if (expandDesc) {
      // v3.0.x: na Fase de Grupos o "Novos Confrontos" tem comportamento próprio
      // (dupla da espera é sorteada pro grupo com menos gente e as chaves daquele
      // grupo são refeitas). E se "grupos de mesmo tamanho" estiver ligado, esta
      // opção PREVALECE e flexibiliza aquela — deixamos isso explícito.
      var _isGrupos = ((document.getElementById('select-formato') || {}).value === 'grupos_mata');
      var _eqOnly = !!(document.getElementById('grupos-equal-only') || {}).checked;
      if (closed.checked) {
        expandDesc.innerHTML = _t('create.lateEnrollExpandDisabledDesc');
      } else if (expand.checked) {
        if (_isGrupos) {
          var _txt = _t('create.lateEnrollExpandGruposOnDesc');
          if (_eqOnly) _txt += '<div style="margin-top:5px;color:#f59e0b;font-weight:600;">' + _t('create.lateEnrollGruposOverride') + '</div>';
          expandDesc.innerHTML = _txt;
        } else {
          expandDesc.innerHTML = _t('create.lateEnrollExpandOnDesc');
        }
      } else {
        expandDesc.innerHTML = _t(_isGrupos ? 'create.lateEnrollExpandGruposOffDesc' : 'create.lateEnrollExpandOffDesc');
      }
    }
    // v2.6.52: Fechadas ON → mostra prazo de encerramento das inscrições (DATAS DA FASE);
    // Aberta → esconde o prazo (inscrição segue durante a fase, sem corte fixo).
    var regBox = document.getElementById('reg-date-container');
    if (regBox) regBox.style.display = closed.checked ? 'flex' : 'none'; // 'flex' preserva o card em coluna
    // v2.6.56: "Pontuação de Novos Inscritos" só faz sentido com inscrição ABERTA durante a
    // fase (há novos inscritos pra pontuar). Fechadas → esconde.
    var npsBox = document.getElementById('liga-nps-container');
    if (npsBox) npsBox.style.display = closed.checked ? 'none' : '';
    // v3.0.x: o texto sob "grupos de mesmo tamanho" depende deste estado (expand)
    // — re-sincroniza pra mostrar/ocultar o aviso de override.
    if (typeof window._updateGruposEqualHelper === 'function') { try { window._updateGruposEqualHelper(); } catch (e) {} }
  };

  // Sorteio de Vagas: alterna entre o modelo "corrida" (cap, atual) e "vagas
  // com sorteio" (draw). No modo draw a inscrição fica aberta a janela inteira
  // e o organizador define um número de vagas; o sorteio roda no fechamento.
  window._syncEnrollLimitMode = function(source) {
    var capT = document.getElementById('elm-toggle-cap');
    var drawT = document.getElementById('elm-toggle-draw');
    if (!capT || !drawT) return;
    // Mutual exclusion (radio-like). Se source ausente (re-render), preserva.
    if (source === 'cap' && capT.checked) drawT.checked = false;
    else if (source === 'draw' && drawT.checked) capT.checked = false;
    if (!capT.checked && !drawT.checked) capT.checked = true; // nunca os dois off
    var mode = drawT.checked ? 'draw' : 'cap';
    var hidden = document.getElementById('enrollment-limit-mode');
    if (hidden) hidden.value = mode;
    // Visual das rows
    var capRow = document.getElementById('elm-row-cap');
    if (capRow) {
      capRow.style.border = capT.checked ? '1px solid rgba(96,165,250,0.25)' : '1px solid rgba(255,255,255,0.08)';
      capRow.style.background = capT.checked ? 'rgba(96,165,250,0.08)' : 'rgba(255,255,255,0.03)';
    }
    var drawRow = document.getElementById('elm-row-draw');
    if (drawRow) {
      drawRow.style.border = drawT.checked ? '1px solid rgba(167,139,250,0.25)' : '1px solid rgba(255,255,255,0.08)';
      drawRow.style.background = drawT.checked ? 'rgba(167,139,250,0.08)' : 'rgba(255,255,255,0.03)';
    }
    // Mostra/esconde o bloco de vagas e o limite por corrida
    var slotsBox = document.getElementById('draw-slots-container');
    if (slotsBox) slotsBox.style.display = (mode === 'draw') ? 'block' : 'none';
    var capBox = document.getElementById('cap-max-container');
    if (capBox) capBox.style.display = (mode === 'draw') ? 'none' : 'block';
    // Auto-close (corrida) é incompatível com vagas-por-sorteio
    window._updateAutoCloseVisibility();
    // Atualiza a unidade da vaga conforme o modo de inscrição
    var hint = document.getElementById('target-slots-hint');
    if (hint) {
      var enr = (document.getElementById('select-inscricao') || {}).value || 'individual';
      hint.textContent = (enr === 'individual') ? 'vagas = pessoas' : 'vagas = duplas/times';
    }
    window._recalcDuration();
  };

  // Política de chamada da lista de espera (só no modo Vagas).
  window._syncCallPolicy = function(source) {
    var pres = document.getElementById('cp-toggle-present');
    var lock = document.getElementById('cp-toggle-locked');
    if (!pres || !lock) return;
    if (source === 'present' && pres.checked) lock.checked = false;
    else if (source === 'locked' && lock.checked) pres.checked = false;
    if (!pres.checked && !lock.checked) pres.checked = true;
    var mode = lock.checked ? 'locked' : 'present';
    var hidden = document.getElementById('call-policy');
    if (hidden) hidden.value = mode;
    var presRow = document.getElementById('cp-row-present');
    if (presRow) {
      presRow.style.border = pres.checked ? '1px solid rgba(167,139,250,0.25)' : '1px solid rgba(255,255,255,0.08)';
      presRow.style.background = pres.checked ? 'rgba(167,139,250,0.08)' : 'rgba(255,255,255,0.03)';
    }
    var lockRow = document.getElementById('cp-row-locked');
    if (lockRow) {
      lockRow.style.border = lock.checked ? '1px solid rgba(167,139,250,0.25)' : '1px solid rgba(255,255,255,0.08)';
      lockRow.style.background = lock.checked ? 'rgba(167,139,250,0.08)' : 'rgba(255,255,255,0.03)';
    }
  };

  // Formação dos grupos Rei/Rainha: 'sorteio' (aleatório) | 'ranking' (classificação).
  window._selectMonarchGroupsBy = function(btn) {
    var value = btn.getAttribute('data-value');
    var btns = document.querySelectorAll('#monarch-groupsby-buttons .monarch-gb-btn');
    btns.forEach(function(b) {
      if (b.getAttribute('data-value') === value) {
        b.classList.add('monarch-gb-active');
        b.style.border = '2px solid #fbbf24';
        b.style.background = 'rgba(251,191,36,0.15)';
        b.style.color = '#fbbf24';
        b.style.fontWeight = '600';
      } else {
        b.classList.remove('monarch-gb-active');
        b.style.border = '2px solid rgba(255,255,255,0.18)';
        b.style.background = 'rgba(255,255,255,0.06)';
        b.style.color = 'var(--text-main)';
        b.style.fontWeight = '500';
      }
    });
    var hidden = document.getElementById('monarch-groupsby');
    if (hidden) hidden.value = value;
  };

  // ── Ranking Type Selection ── (v3.1.34: delega pro canônico _setPhaseRankingType(0,…),
  //   que sincroniza o hidden #elim-ranking-type e re-renderiza os botões da Fase 1.)
  window._selectRankingType = function(value) {
    if (typeof window._setPhaseRankingType === 'function') window._setPhaseRankingType(0, value);
  };

  // ── Logo Generator ──
  window._logoLocked = false;

  window._toggleLogoLock = function() {
    window._logoLocked = !window._logoLocked;
    var btn = document.getElementById('btn-logo-lock');
    var hiddenLock = document.getElementById('tourn-logo-locked');
    if (btn) {
      btn.textContent = window._logoLocked ? '🔒' : '🔓';
      btn.style.border = window._logoLocked ? '1px solid rgba(251,191,36,0.4)' : '1px solid rgba(255,255,255,0.1)';
      btn.style.background = window._logoLocked ? 'rgba(251,191,36,0.12)' : 'rgba(255,255,255,0.05)';
      btn.style.color = window._logoLocked ? '#fbbf24' : 'var(--text-muted)';
    }
    if (hiddenLock) hiddenLock.value = window._logoLocked ? '1' : '';
  };

  window._downloadTournamentLogo = function() {
    var hidden = document.getElementById('tourn-logo-data');
    var dataUrl = hidden ? hidden.value : '';
    if (!dataUrl) {
      if (typeof showNotification !== 'undefined') showNotification(window._t('create.noLogo'), window._t('create.noLogoMsg'), 'warning');
      return;
    }
    var nameEl = document.getElementById('tourn-name');
    var fileName = (nameEl && nameEl.value.trim()) ? nameEl.value.trim().replace(/[^a-zA-Z0-9À-ÿ\s-]/g, '').replace(/\s+/g, '_') + '_logo' : 'torneio_logo';
    var a = document.createElement('a');
    a.href = dataUrl;
    a.download = fileName + '.jpg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // v1.0.74-beta: Pollinations.ai como path principal, canvas como fallback.
  // User: 'criação desses logos está muito ruim. como podemos melhorar
  // usando desenhos com base nas palavras do nome do torneio'.
  // Estratégia: prompt enriquecido com keywords do nome + esporte → AI gera
  // desenho temático. Fallback pra canvas se API falhar (offline, rate limit).
  window._generateTournamentLogo = async function() {
    var nameEl = document.getElementById('tourn-name');
    var sportEl = document.getElementById('select-sport');
    var formatEl = document.getElementById('select-formato');
    var venueEl = document.getElementById('tourn-venue');
    var name = nameEl ? nameEl.value.trim() : '';
    if (!name) name = 'Torneio';
    var sport = sportEl ? sportEl.options[sportEl.selectedIndex].text : '';
    var formatValue = formatEl ? formatEl.value : 'elim_simples';
    var venue = venueEl ? venueEl.value.trim() : '';

    // ─── Try Pollinations.ai first ──────────────────────────────────────
    // v1.0.75-beta: prompt esporte-específico + estilo variado pra evitar
    // confusão (ex: AI desenhava raquete de tênis pra Beach Tennis).
    // Cada esporte tem descrição visual ICÔNICA e diferenciadora;
    // estilos rotam pra garantir variedade entre regenerações.
    var sportNameForAI = sport.replace(/^[^\wÀ-ɏ]+/u, '').trim();
    // Imagery específico por esporte — focado em equipamento + cenário
    var sportImagery = {
      'Beach Tennis':   'beach tennis paddle (solid wooden paddle with holes, NOT a tennis racket with strings), sand court, ocean, tropical beach setting',
      'Pickleball':     'pickleball paddle and yellow whiffle ball with holes, outdoor court',
      'Tênis':          'tennis racket with strings, fuzzy yellow tennis ball, hard court',
      'Tênis de Mesa':  'table tennis paddle (red rubber face), white celluloid ball, wooden table',
      'Padel':          'padel racket (perforated solid face), padel court with glass walls and metal mesh',
      'Vôlei de Praia': 'beach volleyball ball (white panels), sand court, volleyball net, sun',
      'Futevôlei':      'soccer ball on sand court, volleyball net, beach sunset, tropical'
    };
    var imagery = sportImagery[sportNameForAI] || ('sport theme ' + sportNameForAI.toLowerCase());
    // Estilos visuais — rotação aleatória pra variar entre regenerações
    var styleVariants = [
      'vintage emblem with ribbon banner, retro sports logo style, bold outline',
      'modern flat geometric badge, bold solid colors, clean shapes',
      'minimalist line art on circular crest, monoline style, simple shapes',
      'art deco shield design with gold accents, elegant geometry',
      'tropical sunset gradient circular emblem, vibrant colors',
      'hand-drawn style sports crest, organic lines, vibrant palette',
      'futuristic neon badge, glowing edges, dark background contrast'
    ];
    var style = styleVariants[Math.floor(Math.random() * styleVariants.length)];
    // Extract meaningful keywords from name (skip stopwords)
    var stopWords = ['de','da','do','dos','das','a','o','os','as','e','em','na','no','torneio','copa','campeonato','liga','open'];
    var keywordList = name.toLowerCase().split(/\s+/)
      .filter(function(w) { return w.length > 2 && stopWords.indexOf(w) === -1; })
      .slice(0, 3);
    var keywordsStr = keywordList.join(' ');
    var promptParts = [
      'sports tournament emblem',
      imagery,
      style,
      keywordsStr ? 'inspired by: ' + keywordsStr : '',
      'no text, no letters, no words, no typography, iconic visual only'
    ].filter(function(s) { return s; });
    var aiPrompt = promptParts.join(', ');
    var seed = Math.floor(Math.random() * 1000000);
    var pollinationsUrl = 'https://image.pollinations.ai/prompt/' +
      encodeURIComponent(aiPrompt) +
      '?width=400&height=400&seed=' + seed + '&nologo=true&model=flux';

    // Loading spinner no preview
    var previewEl = document.getElementById('logo-preview');
    if (previewEl) {
      previewEl.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;height:100%;gap:8px;color:#a5b4fc;font-size:0.7rem;font-weight:600;text-align:center;padding:8px;">' +
        '<div class="scoreplace-logo-spin" style="width:28px;height:28px;border:3px solid rgba(99,102,241,0.2);border-top-color:#6366f1;border-radius:50%;animation:scoreplace-spin 0.8s linear infinite;"></div>' +
        '<span>Gerando<br>logo IA…</span>' +
      '</div>';
      // Inject keyframes once
      if (!document.getElementById('scoreplace-logo-keyframes')) {
        var styleEl = document.createElement('style');
        styleEl.id = 'scoreplace-logo-keyframes';
        styleEl.textContent = '@keyframes scoreplace-spin { to { transform: rotate(360deg); } }';
        document.head.appendChild(styleEl);
      }
    }

    try {
      var response = await fetch(pollinationsUrl);
      if (!response.ok) throw new Error('HTTP ' + response.status);
      var blob = await response.blob();
      // Re-encode pra JPEG 400x400 (limite Firestore + consistência)
      var objectUrl = URL.createObjectURL(blob);
      var aiDataUrl = await new Promise(function(resolve, reject) {
        var img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function() {
          var c = document.createElement('canvas');
          c.width = 400; c.height = 400;
          var cctx = c.getContext('2d');
          cctx.drawImage(img, 0, 0, 400, 400);
          var url = c.toDataURL('image/jpeg', 0.85);
          URL.revokeObjectURL(objectUrl);
          resolve(url);
        };
        img.onerror = function() { URL.revokeObjectURL(objectUrl); reject(new Error('image load failed')); };
        img.src = objectUrl;
      });
      window._applyTournamentLogo(aiDataUrl);
      return; // sucesso — done
    } catch (aiErr) {
      window._warn('[logo] Pollinations.ai falhou, usando fallback canvas:', aiErr && aiErr.message);
      // segue pro fallback abaixo
    }

    // ─── FALLBACK: canvas-based logo (lógica original) ──────────────────

    // Get sport emoji
    var sportEmoji = '🏆';
    var emojiMap = {'🎾':'🎾','⚽':'⚽','🏐':'🏐','♟':'♟️','🃏':'🃏','🎮':'🎮','🏸':'🏸','🥒':'🥒','🏓':'🏓','🎴':'🎴'};
    Object.keys(emojiMap).forEach(function(k) { if (sport.includes(k)) sportEmoji = emojiMap[k]; });

    // Clean sport name (remove emoji prefix)
    var sportName = sport.replace(/^[^\w\u00C0-\u024F]+/u, '').trim();

    // Format label
    var formatMap = {
      liga: 'Pontos Corridos', suico: 'Suíço', elim_simples: 'Eliminatórias',
      elim_dupla: 'Dupla Elim.', grupos_mata: 'Fase de Grupos'
    };
    var formatLabel = formatMap[formatValue] || '';

    // Build initials (up to 3 chars from first letters of words)
    var words = name.split(/\s+/).filter(function(w) { return w.length > 0 && w[0] === w[0].toUpperCase(); });
    if (words.length === 0) words = name.split(/\s+/);
    var initials = words.slice(0, 3).map(function(w) { return w[0].toUpperCase(); }).join('');
    if (!initials) initials = name.substring(0, 2).toUpperCase();

    // Sport-themed color palettes (more variety)
    var sportPalettes = {
      'Beach Tennis':  [['#f59e0b', '#d97706'], ['#f97316', '#ea580c'], ['#eab308', '#ca8a04']],
      'Pickleball':    [['#15803d', '#86efac'], ['#166534', '#6ee7b7'], ['#047857', '#a7f3d0']],
      'Tênis':         [['#0369a1', '#38bdf8'], ['#0284c7', '#7dd3fc'], ['#1e40af', '#60a5fa']],
      'Tênis de Mesa': [['#b91c1c', '#ef4444'], ['#dc2626', '#f87171'], ['#991b1b', '#fca5a5']],
      'Padel':         [['#4338ca', '#6366f1'], ['#4f46e5', '#818cf8'], ['#3730a3', '#a5b4fc']],
      // Vôlei de Praia — areia/oceano (azul-esverdeado + amarelo-quente)
      'Vôlei de Praia':[['#0891b2', '#06b6d4'], ['#0e7490', '#22d3ee'], ['#f59e0b', '#fbbf24']],
      // Futevôlei — tons quentes de praia + verde (bola de futebol no espírito brasileiro)
      'Futevôlei':     [['#ea580c', '#fb923c'], ['#16a34a', '#4ade80'], ['#dc2626', '#f97316']],
    };
    var palettes = sportPalettes[sportName] || [
      ['#4338ca', '#6366f1'], ['#0f766e', '#14b8a6'], ['#b91c1c', '#ef4444'],
      ['#c2410c', '#f97316'], ['#15803d', '#22c55e'], ['#7c3aed', '#a78bfa'],
      ['#0369a1', '#38bdf8'], ['#be185d', '#ec4899'], ['#854d0e', '#eab308'],
      ['#1e40af', '#60a5fa']
    ];
    var pal = palettes[Math.floor(Math.random() * palettes.length)];

    // Create canvas
    var canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 400;
    var ctx = canvas.getContext('2d');

    // Background gradient (diagonal)
    var grad = ctx.createLinearGradient(0, 0, 400, 400);
    grad.addColorStop(0, pal[0]);
    grad.addColorStop(1, pal[1]);
    ctx.fillStyle = grad;
    // Rounded rect
    ctx.beginPath();
    ctx.moveTo(40, 0); ctx.lineTo(360, 0); ctx.quadraticCurveTo(400, 0, 400, 40);
    ctx.lineTo(400, 360); ctx.quadraticCurveTo(400, 400, 360, 400);
    ctx.lineTo(40, 400); ctx.quadraticCurveTo(0, 400, 0, 360);
    ctx.lineTo(0, 40); ctx.quadraticCurveTo(0, 0, 40, 0);
    ctx.closePath();
    ctx.fill();

    // Subtle pattern (diagonal lines)
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 2;
    for (var i = -400; i < 800; i += 20) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 400, 400); ctx.stroke();
    }

    // Sport emoji (large, semi-transparent, top-right)
    ctx.font = '120px serif';
    ctx.globalAlpha = 0.12;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(sportEmoji, 310, 100);
    ctx.globalAlpha = 1;

    // Second sport emoji bottom-left (smaller, more subtle)
    ctx.font = '80px serif';
    ctx.globalAlpha = 0.06;
    ctx.fillText(sportEmoji, 80, 340);
    ctx.globalAlpha = 1;

    // Initials (large centered text)
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold ' + (initials.length > 2 ? '110' : '130') + 'px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 4;
    ctx.fillText(initials, 200, 155);
    ctx.shadowColor = 'transparent';

    // Tournament name (below initials)
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    var nameFontSize = name.length > 25 ? 20 : name.length > 15 ? 24 : 28;
    ctx.font = '700 ' + nameFontSize + 'px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var maxWidth = 340;
    var words2 = name.split(' ');
    var lines = [];
    var line = '';
    words2.forEach(function(w) {
      var test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w; }
      else { line = test; }
    });
    if (line) lines.push(line);
    var lineH = nameFontSize + 6;
    var nameBlockY = 265 - ((lines.length - 1) * lineH) / 2;
    lines.forEach(function(l, i) { ctx.fillText(l, 200, nameBlockY + i * lineH); });

    // Info line: sport + format (subtle pill below name)
    var infoText = sportName;
    if (formatLabel) infoText += ' • ' + formatLabel;
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '500 16px -apple-system, BlinkMacSystemFont, sans-serif';
    var infoY = nameBlockY + lines.length * lineH + 10;
    ctx.fillText(infoText, 200, infoY);

    // Venue (if available, small at bottom)
    if (venue) {
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = '400 14px -apple-system, BlinkMacSystemFont, sans-serif';
      var venueDisplay = venue.length > 35 ? venue.substring(0, 33) + '…' : venue;
      ctx.fillText('📍 ' + venueDisplay, 200, infoY + 22);
    }

    // "scoreplace.app" watermark
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.font = '500 13px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('scoreplace.app', 200, 388);

    // Convert to data URL and apply (JPEG for smaller size in Firestore)
    var dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    window._applyTournamentLogo(dataUrl);
  };

  // ─── Foto de fundo do torneio (v4.0.21) ───────────────────────────────────
  // Sobe arquivo → cropper retangular 2:1 (zoom+pan sem distorção, recorte assado
  // no canvas) → salva o resultado já enquadrado em #tourn-cover-data. No render,
  // quando t.coverPhotoData existe, ela substitui a foto do Google.
  window._handleCoverUpload = function(event) {
    var file = event.target && event.target.files && event.target.files[0];
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) {
      if (typeof showNotification === 'function') showNotification('Arquivo muito grande', 'Escolha uma imagem de até 12MB.', 'error');
      event.target.value = '';
      return;
    }
    var reader = new FileReader();
    reader.onload = function(e) {
      if (typeof window._openImageCropEditor === 'function') {
        window._openImageCropEditor(e.target.result, { aspect: 2, cover: true, size: 1000, title: '🖼️ Enquadrar foto de fundo' }, function(croppedDataUrl) {
          window._applyCoverPhoto(croppedDataUrl);
        });
      } else {
        window._applyCoverPhoto(e.target.result);
      }
    };
    reader.readAsDataURL(file);
    event.target.value = ''; // permite re-escolher o mesmo arquivo
  };
  window._applyCoverPhoto = function(dataUrl) {
    var hidden = document.getElementById('tourn-cover-data');
    if (hidden) hidden.value = dataUrl || '';
    var prev = document.getElementById('cover-preview');
    var ph = document.getElementById('cover-placeholder');
    var clr = document.getElementById('btn-cover-clear');
    if (prev) { prev.style.backgroundImage = dataUrl ? 'url(' + dataUrl + ')' : ''; prev.style.borderStyle = dataUrl ? 'solid' : 'dashed'; }
    if (ph) ph.style.display = dataUrl ? 'none' : '';
    if (clr) clr.style.display = dataUrl ? '' : 'none';
  };
  window._clearCoverPhoto = function() { window._applyCoverPhoto(''); };

  window._handleLogoUpload = function(event) {
    var file = event.target.files && event.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      if (typeof showNotification !== 'undefined') showNotification(window._t('create.fileTooLarge'), window._t('create.fileTooLargeMsg'), 'warning');
      return;
    }
    var reader = new FileReader();
    reader.onload = function(e) {
      // Abrir editor de crop/zoom/forma antes de aplicar. radiusControl=true
      // adiciona o slider de Forma (quadrado ↔ círculo) e retorna o radius.
      if (typeof window._openImageCropEditor === 'function') {
        var _curR = (function(){ var el = document.getElementById('tourn-logo-radius'); var s = document.getElementById('tourn-logo-shape'); if (s && s.value === 'circle') return 50; var r = el ? Number(el.value) : 14; return isNaN(r) ? 14 : r; })();
        window._openImageCropEditor(e.target.result,
          { size: 400, title: '🎨 Ajustar logo do torneio', radiusControl: true, initialRadius: _curR },
          function(croppedDataUrl, radiusPct) {
            if (radiusPct != null && typeof window._setLogoFormaFromRadius === 'function') {
              window._setLogoFormaFromRadius(radiusPct, radiusPct >= 50);
            }
            window._applyTournamentLogo(croppedDataUrl);
          }
        );
      } else {
        // Fallback sem editor
        window._applyTournamentLogo(e.target.result);
      }
    };
    reader.readAsDataURL(file);
    // Reset input para permitir reselecionar o mesmo arquivo
    event.target.value = '';
  };

  // Calcula o border-radius atual a partir dos inputs ocultos de formato.
  window._currentLogoRadiusCss = function() {
    var shapeEl = document.getElementById('tourn-logo-shape');
    var radEl = document.getElementById('tourn-logo-radius');
    var shape = shapeEl ? shapeEl.value : 'square';
    if (shape === 'circle') return '50%';
    var r = radEl ? Number(radEl.value) : 14;
    if (isNaN(r)) r = 14;
    return Math.max(0, Math.min(50, r)) + '%';
  };

  window._applyTournamentLogo = function(dataUrl) {
    var preview = document.getElementById('logo-preview');
    var hidden = document.getElementById('tourn-logo-data');
    if (preview) {
      preview.innerHTML = '<img src="' + dataUrl + '" style="width:100%;height:100%;object-fit:cover;border-radius:' + window._currentLogoRadiusCss() + ';">';
      // o container tracejado também acompanha o formato (círculo fica redondo)
      var shape = (document.getElementById('tourn-logo-shape') || {}).value;
      preview.style.borderRadius = shape === 'circle' ? '50%' : window._currentLogoRadiusCss();
    }
    if (hidden) hidden.value = dataUrl;
  };

  // Atualiza só o border-radius do preview (sem re-injetar a imagem).
  window._updateLogoPreviewShape = function() {
    var preview = document.getElementById('logo-preview');
    if (!preview) return;
    var img = preview.querySelector('img');
    var shape = (document.getElementById('tourn-logo-shape') || {}).value;
    var css = window._currentLogoRadiusCss();
    if (img) img.style.borderRadius = css;
    preview.style.borderRadius = shape === 'circle' ? '50%' : css;
  };

  // Slider de Forma. value 0..50 (esquerda→direita). Direita (50) = quadrado
  // (radius 0); esquerda (0) = círculo (radius 50). radius = 50 - value.
  window._setLogoForma = function(v) {
    var radius = 50 - Math.max(0, Math.min(50, Number(v)));
    if (isNaN(radius)) radius = 14;
    var radEl = document.getElementById('tourn-logo-radius');
    var shapeEl = document.getElementById('tourn-logo-shape');
    if (radEl) radEl.value = radius;
    if (shapeEl) shapeEl.value = radius >= 50 ? 'circle' : 'square';
    window._updateLogoPreviewShape();
  };

  // Posiciona o slider de Forma a partir de um radius (0-50). circle => 0.
  window._setLogoFormaFromRadius = function(radius, isCircle) {
    var r = isCircle ? 50 : Math.max(0, Math.min(50, Number(radius)));
    if (isNaN(r)) r = 14;
    var shapeEl = document.getElementById('tourn-logo-shape');
    var radEl = document.getElementById('tourn-logo-radius');
    if (radEl) radEl.value = r;
    if (shapeEl) shapeEl.value = r >= 50 ? 'circle' : 'square';
    var slider = document.getElementById('logo-forma-range');
    if (slider) slider.value = 50 - r;
    window._updateLogoPreviewShape();
  };

  window._clearTournamentLogo = function() {
    var preview = document.getElementById('logo-preview');
    var hidden = document.getElementById('tourn-logo-data');
    if (preview) preview.innerHTML = '<span style="font-size:0.7rem;color:var(--text-muted);text-align:center;padding:4px;">' + _t('create.noLogo') + '</span>';
    if (hidden) hidden.value = '';
    // Reset lock
    window._logoLocked = false;
    var btn = document.getElementById('btn-logo-lock');
    if (btn) { btn.textContent = '🔓'; btn.style.border = '1px solid rgba(255,255,255,0.1)'; btn.style.background = 'rgba(255,255,255,0.05)'; btn.style.color = 'var(--text-muted)'; }
    var hiddenLock = document.getElementById('tourn-logo-locked');
    if (hiddenLock) hiddenLock.value = '';
  };

  // ── Visibility toggle ──
  window._setVisibility = function(vis) {
    var toggle = document.getElementById('toggle-public');
    var hidden = document.getElementById('tourn-public');
    var desc = document.getElementById('vis-desc');
    if (vis === 'public') {
      if (toggle) toggle.checked = true;
      if (hidden) hidden.value = 'true';
      if (desc) desc.textContent = _t('create.publicDesc');
    } else {
      if (toggle) toggle.checked = false;
      if (hidden) hidden.value = 'false';
      if (desc) desc.textContent = _t('create.privateDesc');
    }
  };

  window._onSportChange = function () {
    const sportSelect = document.getElementById('select-sport');
    if (!sportSelect) return;

    const sportName = sportSelect.options[sportSelect.selectedIndex] ? sportSelect.options[sportSelect.selectedIndex].text.replace(/^[^\w\u00C0-\u024F]+/u, '').trim() : '';
    const defaultSize = _sportTeamDefaults[sportName] || 2;

    // Set default team size for sport
    const teamSizeEl = document.getElementById('tourn-team-size');
    if (teamSizeEl) {
      teamSizeEl.value = defaultSize;
    }

    // Set default game type based on sport via toggles
    window._toggleGameType(defaultSize === 1 ? 'simples' : 'duplas');
  };

  window._onFormatoChange = function () {
    if (!document.getElementById('select-formato')) return; // form not in DOM (e.g. moved to #novo-torneio then navigated away)
    // v4.4.3: o CONFIGURADOR ÚNICO (format2) é montado dentro do #fase1-box e esconde os
    // controles de estrutura antigos. Deferido pra rodar DEPOIS deste _onFormatoChange
    // (que seta displays) — o mount re-esconde tudo. Idempotente (config monta 1×).
    setTimeout(function () { if (typeof window._f2MountInEditForm === 'function') { try { window._f2MountInEditForm(); } catch (e) { if (window._warn) window._warn('[f2 mount] ' + e); } } }, 0);
    const fmt = document.getElementById('select-formato').value;
    const isElim = fmt === 'elim_simples' || fmt === 'elim_dupla';
    const isSuico = fmt === 'suico';
    const isLiga = fmt === 'liga';
    const isGrupos = fmt === 'grupos_mata';
    const drawMode = document.getElementById('draw-mode').value;
    const isMonarch = drawMode === 'rei_rainha';
    // v4.4.18: os controles de ESTRUTURA antigos são REMOVIDOS do DOM pelo format2
    // (não só escondidos) — então todo toggle de display aqui precisa ser null-safe.
    var _sd = function (id, v) { var e = document.getElementById(id); if (e) e.style.display = v; };

    // v2.6.66: sub-toggle "Dupla eliminatória" só aparece na categoria Eliminatórias.
    var _duplaRow = document.getElementById('dupla-elim-row');
    if (_duplaRow) _duplaRow.style.display = isElim ? 'flex' : 'none';

    _sd('suico-fields', isSuico ? 'block' : 'none');
    _sd('liga-fields', isLiga ? 'block' : 'none');
    // v2.6.48: Agendamento de Sorteios foi extraído do #liga-fields pra logo abaixo
    _sd('suico-draw-schedule-fields', isSuico ? 'block' : 'none');
    _sd('elim-settings', (isElim || isGrupos) ? 'block' : 'none');
    _sd('grupos-fields', isGrupos ? 'block' : 'none');
    if (isGrupos && typeof window._renderGruposSuggestions === 'function') { try { window._renderGruposSuggestions(); } catch (e) {} }
    // v3.0.x: o texto de "Novos Confrontos" muda conforme o formato (grupos tem
    // comportamento próprio) — re-sincroniza ao trocar o formato.
    if (typeof window._syncLateEnrollment === 'function') { try { window._syncLateEnrollment(); } catch (e) {} }
    // Rei/Rainha classified config: hide for Liga (pontos corridos, sem fase eliminatória)
    _sd('rei-rainha-fields', (isMonarch && !isLiga) ? 'block' : 'none');

    // Grupos + Elim. incompatível com Rei/Rainha: esconder botão e forçar Sorteio
    var monarchDrawBtn = document.getElementById('btn-draw-mode-monarch');
    if (monarchDrawBtn) {
      if (isGrupos) {
        monarchDrawBtn.style.display = 'none';
        // Auto-select Sorteio if Rei/Rainha was active
        if (drawMode === 'rei_rainha') {
          var sorteioBtn = document.querySelector('#draw-mode-buttons .draw-mode-btn[data-value="sorteio"]');
          if (sorteioBtn) window._selectDrawMode(sorteioBtn);
        }
      } else {
        monarchDrawBtn.style.display = '';
      }
    }

    // "Todos contra todos" only available for Liga
    var rrDrawBtn = document.getElementById('btn-draw-mode-rr');
    if (rrDrawBtn) {
      rrDrawBtn.style.display = isLiga ? '' : 'none';
      // If Liga de-selected while round_robin was active, revert to sorteio
      if (!isLiga && drawMode === 'round_robin') {
        var sorteioBtn2 = document.querySelector('#draw-mode-buttons .draw-mode-btn[data-value="sorteio"]');
        if (sorteioBtn2) window._selectDrawMode(sorteioBtn2);
      }
    }
    var rrCfg = document.getElementById('round-robin-fields');
    if (rrCfg) rrCfg.style.display = (isLiga && drawMode === 'round_robin') ? 'block' : 'none';

    // Liga/Rei-Rainha (Pontos Corridos) usam parceiros ROTATIVOS — inscrição
    // individual. Duplas MONTADAS são incompatíveis (3 duplas fixas se enfrentando
    // = Fase de Grupos, não Liga/Rei-Rainha). Esconder o toggle "participantes
    // formam duplas" e forçá-lo desligado enquanto o formato for Pontos Corridos.
    // O guard equivalente no sorteio (tournaments-draw.js) bloqueia o caso residual.
    var _mpCont = document.getElementById('manual-pairing-container');
    if (_mpCont) _mpCont.style.display = isLiga ? 'none' : '';
    if (isLiga) {
      var _mpTglOff = document.getElementById('manual-pairing-toggle');
      if (_mpTglOff && _mpTglOff.checked) {
        _mpTglOff.checked = false;
        if (typeof window._syncManualPairing === 'function') { try { window._syncManualPairing(); } catch (e) {} }
      }
    }

    // Sync Liga internal round format hidden field with global draw mode
    if (isLiga) {
      var ligaRfHidden = document.getElementById('liga-round-format');
      if (ligaRfHidden) ligaRfHidden.value = isMonarch ? 'rei_rainha' : 'standard';
    }

    // Esconder estimativas de tempo para Liga e Suíço (não fazem sentido)
    var estimContainer = document.getElementById('time-estimates-container');
    if (estimContainer) estimContainer.style.display = (isLiga || isSuico) ? 'none' : '';

    // Sistema de Pontos Avançado: vale em QUALQUER classificatória com tabela de pontos.
    // v4.4.59 (pedido do dono): Liga/Suíço OU classificatória do format2 (Fase de Grupos /
    // Pontos Corridos). Só some quando não há classificatória (eliminação direta).
    var _f2cAdv = (typeof window._f2GetConfig === 'function') ? window._f2GetConfig() : null;
    var advScoringStandings = isLiga || isSuico || (_f2cAdv ? _f2cAdv.classifAtiva === true : false);
    var advSection = document.getElementById('adv-scoring-section');
    if (advSection) advSection.style.display = advScoringStandings ? 'block' : 'none';
    document.querySelectorAll('#tiebreaker-list li[data-tb="pontos_avancados"], #tiebreaker-excluded-list li[data-tb="pontos_avancados"]').forEach(function(tbAdv) {
      tbAdv.style.display = advScoringStandings ? '' : 'none';
    });

    window._updateAutoCloseVisibility();
    window._updateRegDateVisibility();
    // v2.6.52: aplica a visibilidade de "Novos Confrontos" + prazo conforme Fechadas
    // (no init e em toda troca de formato, não só no clique do toggle).
    if (typeof window._syncLateEnrollment === 'function') window._syncLateEnrollment();
    window._onInscricaoChange();
    window._recalcDuration();
    if (typeof window._renderPhases === 'function') window._renderPhases();
  };

  // v2.6.63: idx-aware (idx 0 = Fase 1 sem sufixo; idx>=1 = fase extra com sufixo -N).
  window._onAdvScoringToggle = function (idx) {
    idx = idx || 0;
    var s = idx === 0 ? '' : ('-' + idx);
    var enEl = document.getElementById('adv-scoring-enabled' + s);
    var on = enEl ? enEl.checked : false;
    var body = document.getElementById('adv-scoring-body' + s);
    if (body) body.style.display = on ? 'block' : 'none';
    if (typeof window._onAdvApplyLiveToggle === 'function') window._onAdvApplyLiveToggle(idx);
  };

  // v2.3.13: o toggle mestre "Aplicar pontos de placar ao vivo" controla os 2
  // toggles individuais do Grupo B (killing point, ponto marcado). Desligado,
  // desmarca e desabilita os dois (e o cálculo já os zera).
  window._onAdvApplyLiveToggle = function (idx) {
    idx = idx || 0;
    var s = idx === 0 ? '' : ('-' + idx);
    var master = document.getElementById('adv-apply-live' + s);
    var on = master ? master.checked : true;
    ['killing_point', 'point_scored'].forEach(function (key) {
      var row = document.querySelector('#adv-scoring-body' + s + ' .adv-row[data-adv-key="' + key + '"]');
      if (!row) return;
      var en = row.querySelector('.adv-enabled');
      var val = row.querySelector('.adv-value');
      if (en) { en.disabled = !on; if (!on) en.checked = false; }
      if (val) val.disabled = !on;
      row.style.opacity = on ? '1' : '0.45';
    });
  };

  // _onRankingManualChange mantida como alias para backward compat
  window._onRankingManualChange = function () {};

  // Liga: select exclusive NPS button
  window._selectLigaNps = function(btn) {
    var val = btn.getAttribute('data-value');
    document.getElementById('liga-new-player-score').value = val;
    var btns = document.querySelectorAll('#liga-nps-buttons .liga-nps-btn');
    btns.forEach(function(b) {
      if (b.getAttribute('data-value') === val) {
        b.classList.add('liga-nps-active');
        b.style.border = '2px solid #34d399'; b.style.background = 'rgba(16,185,129,0.15)'; b.style.color = '#34d399';
      } else {
        b.classList.remove('liga-nps-active');
        b.style.border = '2px solid rgba(255,255,255,0.18)'; b.style.background = 'rgba(255,255,255,0.06)'; b.style.color = 'var(--text-main)';
      }
    });
  };

  // Liga: select exclusive inactivity button
  window._selectLigaInact = function(btn) {
    var val = btn.getAttribute('data-value');
    document.getElementById('liga-inactivity').value = val;
    var btns = document.querySelectorAll('#liga-inact-buttons .liga-inact-btn');
    btns.forEach(function(b) {
      if (b.getAttribute('data-value') === val) {
        b.classList.add('liga-inact-active');
        b.style.border = '2px solid #34d399'; b.style.background = 'rgba(16,185,129,0.15)'; b.style.color = '#34d399';
      } else {
        b.classList.remove('liga-inact-active');
        b.style.border = '2px solid rgba(255,255,255,0.18)'; b.style.background = 'rgba(255,255,255,0.06)'; b.style.color = 'var(--text-main)';
      }
    });
    var xContainer = document.getElementById('liga-inactivity-x-container');
    if (xContainer) xContainer.style.display = val === 'remove' ? 'block' : 'none';
  };

  // Liga: balanced-draw toggle — shows/hides cluster config block
  window._onLigaBalancedToggle = function() {
    var chk = document.getElementById('liga-balanced-toggle');
    var cfg = document.getElementById('liga-balanced-config');
    if (chk && cfg) cfg.style.display = chk.checked ? 'block' : 'none';
  };

  // Liga: select balance-by (individual | team)
  window._selectLigaBalance = function(btn) {
    var val = btn.getAttribute('data-value');
    var hidden = document.getElementById('liga-balance-by');
    if (hidden) hidden.value = val;
    var btns = document.querySelectorAll('#liga-balance-buttons .liga-balance-btn');
    btns.forEach(function(b) {
      if (b.getAttribute('data-value') === val) {
        b.classList.add('liga-balance-active');
        b.style.border = '2px solid #34d399'; b.style.background = 'rgba(16,185,129,0.15)'; b.style.color = '#34d399';
      } else {
        b.classList.remove('liga-balance-active');
        b.style.border = '2px solid rgba(255,255,255,0.18)'; b.style.background = 'rgba(255,255,255,0.06)'; b.style.color = 'var(--text-main)';
      }
    });
  };

  // ─── Category management ──────────────────────────────────────────────────
  window._toggleGenderCat = function(cat) {
    var hidden = document.getElementById('tourn-gender-categories');
    var current = hidden.value ? hidden.value.split(',').filter(Boolean) : [];
    var idx = current.indexOf(cat);
    if (idx !== -1) {
      current.splice(idx, 1);
    } else {
      // v1.2.2-beta: Misto Aleatório e Misto Obrigatório são auto-excludentes —
      // tournament só pode usar uma das estratégias de formação de times mistos.
      if (cat === 'misto_aleatorio') {
        var i = current.indexOf('misto_obrigatorio');
        if (i !== -1) current.splice(i, 1);
      } else if (cat === 'misto_obrigatorio') {
        var j = current.indexOf('misto_aleatorio');
        if (j !== -1) current.splice(j, 1);
      }
      current.push(cat);
    }
    hidden.value = current.join(',');
    window._applyGenderCatUI(current);
    window._updateCategoryPreview();
  };

  // v1.2.0-beta: pills de idade — mesmo padrão das pills de gênero.
  // User: 'precisamos da possibilidade da categoria por idade em paralelo
  // a categoria por habilidade. as categorias por idade geralmente são
  // 40+, 50+, 60+ e 70+.'
  window._toggleAgeCat = function(cat) {
    var hidden = document.getElementById('tourn-age-categories');
    var current = hidden.value ? hidden.value.split(',').filter(Boolean) : [];
    var idx = current.indexOf(cat);
    if (idx !== -1) {
      current.splice(idx, 1);
    } else {
      current.push(cat);
    }
    hidden.value = current.join(',');
    window._applyAgeCatUI(current);
    window._updateCategoryPreview();
  };

  window._applyAgeCatUI = function(values) {
    if (!values) {
      var h = document.getElementById('tourn-age-categories');
      values = h && h.value ? h.value.split(',').filter(Boolean) : [];
    }
    var onStyle = 'padding:6px 14px;border-radius:8px;font-size:0.8rem;cursor:pointer;transition:all 0.15s;white-space:nowrap;border:2px solid #f59e0b;background:rgba(245,158,11,0.22);color:#fbbf24;font-weight:700;box-shadow:0 0 0 1px rgba(245,158,11,0.3);';
    var offStyle = 'padding:6px 14px;border-radius:8px;font-size:0.8rem;cursor:pointer;transition:all 0.15s;white-space:nowrap;border:2px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.06);color:var(--text-main);font-weight:500;';
    var btns = document.querySelectorAll('#age-cat-buttons button[data-age]');
    btns.forEach(function(btn) {
      var age = btn.getAttribute('data-age');
      btn.setAttribute('style', values.indexOf(age) !== -1 ? onStyle : offStyle);
    });
  };

  // v1.2.2-beta: pills de habilidade A, B, C, D, FUN — único caminho de entrada
  // (sem campo de texto livre — beta phase, não há legacy data pra suportar).
  // FUN = categoria iniciante. Indigo pra distinguir do roxo (gênero) e âmbar (idade).
  var SKILL_PILLS = ['A', 'B', 'C', 'D', 'FUN'];

  window._toggleSkillCat = function(level) {
    var btn = document.querySelector('#skill-cat-buttons [data-skill="' + level + '"]');
    if (!btn) return;
    var isOn = btn.getAttribute('data-active') === '1';
    btn.setAttribute('data-active', isOn ? '0' : '1');
    window._applySkillCatUI();
    window._syncSkillCategories();
  };

  window._applySkillCatUI = function() {
    var onStyle = 'padding:6px 14px;border-radius:8px;font-size:0.8rem;cursor:pointer;transition:all 0.15s;white-space:nowrap;border:2px solid #6366f1;background:rgba(99,102,241,0.22);color:#a5b4fc;font-weight:700;box-shadow:0 0 0 1px rgba(99,102,241,0.3);';
    var offStyle = 'padding:6px 14px;border-radius:8px;font-size:0.8rem;cursor:pointer;transition:all 0.15s;white-space:nowrap;border:2px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.06);color:var(--text-main);font-weight:500;';
    var btns = document.querySelectorAll('#skill-cat-buttons button[data-skill]');
    btns.forEach(function(btn) {
      btn.setAttribute('style', btn.getAttribute('data-active') === '1' ? onStyle : offStyle);
    });
  };

  // Recompute hidden field from pills (canonical order)
  window._syncSkillCategories = function() {
    var pills = [];
    SKILL_PILLS.forEach(function(p) {
      var btn = document.querySelector('#skill-cat-buttons [data-skill="' + p + '"]');
      if (btn && btn.getAttribute('data-active') === '1') pills.push(p);
    });
    var hidden = document.getElementById('tourn-skill-categories');
    if (hidden) hidden.value = pills.join(', ');
    window._updateCategoryPreview();
  };

  // LOAD path: array of pill values → populate UI
  window._loadSkillCategoriesFromArray = function(values) {
    if (!Array.isArray(values)) values = [];
    SKILL_PILLS.forEach(function(p) {
      var btn = document.querySelector('#skill-cat-buttons [data-skill="' + p + '"]');
      if (btn) btn.setAttribute('data-active', values.indexOf(p) !== -1 ? '1' : '0');
    });
    var hidden = document.getElementById('tourn-skill-categories');
    if (hidden) hidden.value = values.filter(function(v) { return SKILL_PILLS.indexOf(v) !== -1; }).join(', ');
    window._applySkillCatUI();
  };

  // ─── Categorias personalizadas (v2.1.80-beta) ───────────────────────────────
  // Valores livres digitados pelo organizador. Canônico vive no hidden
  // #tourn-custom-categories (CSV); os chips são renderizados a partir dele.
  // Cruzam com gênero IGUAL à habilidade (ver _getCreateFormCategoryData).
  window._getCustomCatList = function() {
    var h = document.getElementById('tourn-custom-categories');
    if (!h || !h.value) return [];
    return h.value.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
  };
  window._setCustomCatList = function(list) {
    var h = document.getElementById('tourn-custom-categories');
    if (h) h.value = (list || []).join(',');
    window._renderCustomCatChips();
    window._updateCategoryPreview();
  };
  window._addCustomCat = function() {
    if (typeof showInputDialog !== 'function') return;
    showInputDialog('Nova categoria personalizada', '', function(val) {
      if (!val) return;
      // vírgula é separador do CSV e "/" é separador de merge — troca por espaço.
      var label = String(val).replace(/[,\/]/g, ' ').replace(/\s+/g, ' ').trim();
      if (!label) return;
      if (label.length > 24) label = label.slice(0, 24).trim();
      var cur = window._getCustomCatList();
      var exists = cur.some(function(c) { return c.toLowerCase() === label.toLowerCase(); });
      if (exists) { if (window.showNotification) showNotification('Categoria já existe', label, 'warning'); return; }
      cur.push(label);
      window._setCustomCatList(cur);
    });
  };
  window._removeCustomCat = function(label) {
    var cur = window._getCustomCatList().filter(function(c) { return c !== label; });
    window._setCustomCatList(cur);
  };
  window._renderCustomCatChips = function() {
    var wrap = document.getElementById('custom-cat-chips');
    if (!wrap) return;
    var list = window._getCustomCatList();
    if (list.length === 0) {
      wrap.innerHTML = '<span style="font-size:0.75rem;color:var(--text-muted);opacity:0.7;">Nenhuma categoria personalizada ainda.</span>';
      return;
    }
    var _esc = window._safeHtml || function(s) { return s; };
    wrap.innerHTML = list.map(function(label) {
      var escAttr = String(label).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      return '<span style="display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:8px;font-size:0.8rem;border:2px solid #14b8a6;background:rgba(20,184,166,0.18);color:#5eead4;font-weight:700;">' +
        _esc(label) +
        '<button type="button" class="cancel-x-btn" title="Remover" onclick="window._removeCustomCat(\'' + escAttr + '\')" style="--cx-size:18px;">✕</button>' +
        '</span>';
    }).join('');
  };
  window._loadCustomCategoriesFromArray = function(values) {
    if (!Array.isArray(values)) values = [];
    var clean = values.map(function(s) { return String(s).trim(); }).filter(Boolean);
    var h = document.getElementById('tourn-custom-categories');
    if (h) h.value = clean.join(',');
    window._renderCustomCatChips();
  };

  window._applyGenderCatUI = function(values) {
    if (!values) {
      var h = document.getElementById('tourn-gender-categories');
      values = h && h.value ? h.value.split(',').filter(Boolean) : [];
    }
    var map = { fem: 'btn-cat-fem', masc: 'btn-cat-masc', misto_aleatorio: 'btn-cat-misto-ale', misto_obrigatorio: 'btn-cat-misto-obr' };
    var onStyle = 'display:inline-flex;align-items:center;gap:5px;padding:6px 14px;border-radius:8px;font-size:0.8rem;cursor:pointer;transition:all 0.15s;white-space:nowrap;border:2px solid #a855f7;background:rgba(168,85,247,0.22);color:#d8b4fe;font-weight:700;box-shadow:0 0 0 1px rgba(168,85,247,0.3);';
    var offStyle = 'display:inline-flex;align-items:center;gap:5px;padding:6px 14px;border-radius:8px;font-size:0.8rem;cursor:pointer;transition:all 0.15s;white-space:nowrap;border:2px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.06);color:var(--text-main);font-weight:500;';
    Object.keys(map).forEach(function(k) {
      var btn = document.getElementById(map[k]);
      if (btn) btn.style.cssText = values.indexOf(k) !== -1 ? onStyle : offStyle;
    });
  };

  window._updateCategoryPreview = function() {
    // v2.1.80: chips de categorias personalizadas re-renderizam junto do preview
    // (cobre abertura do form, edição e mudança de game type — todos chamam aqui).
    if (typeof window._renderCustomCatChips === 'function') window._renderCustomCatChips();
    // Categorias dividem o campo em sub-chaves → atualiza a estimativa de tempo da fase.
    if (window._renderPhaseEstimate) { try { window._renderPhaseEstimate(); } catch (e) {} }
    var genderVals = ((document.getElementById('tourn-gender-categories') || {}).value || '').split(',').filter(Boolean);
    var skillText = ((document.getElementById('tourn-skill-categories') || {}).value || '').trim();
    var skillCats = skillText ? skillText.split(',').map(function(s) { return s.trim(); }).filter(Boolean) : [];
    // v2.1.80: categorias personalizadas — entram como "skill-like" (cruzam com gênero igual à habilidade).
    var customCats = ((document.getElementById('tourn-custom-categories') || {}).value || '').split(',').map(function(s) { return s.trim(); }).filter(Boolean);
    var skillLike = skillCats.concat(customCats);

    // v1.2.0-beta: ler ageCategories
    var ageText = (document.getElementById('tourn-age-categories') || {}).value || '';
    var ageCats = ageText ? ageText.split(',').filter(Boolean) : [];

    // Game type dimension
    var gameTypesVal = (document.getElementById('tourn-game-types') || {}).value || '';
    var gameTypes = [];
    if (gameTypesVal === 'simples,duplas') { gameTypes = ['Simples', 'Duplas']; }
    else if (gameTypesVal === 'simples') { gameTypes = ['Simples']; }
    else if (gameTypesVal === 'duplas') { gameTypes = ['Duplas']; }

    var preview = document.getElementById('category-preview');
    var list = document.getElementById('category-preview-list');
    if (!preview || !list) return;

    var genderLabels = { fem: 'Fem', masc: 'Masc', misto_aleatorio: 'Misto Aleat.', misto_obrigatorio: 'Misto Obrig.' };
    var baseCats = [];

    if (genderVals.length > 0 && skillLike.length > 0) {
      genderVals.forEach(function(g) {
        skillLike.forEach(function(s) {
          baseCats.push((genderLabels[g] || g) + ' ' + s);
        });
      });
    } else if (genderVals.length > 0) {
      genderVals.forEach(function(g) { baseCats.push(genderLabels[g] || g); });
    } else if (skillLike.length > 0) {
      skillLike.forEach(function(s) { baseCats.push(s); });
    }

    // Cross with game types only if both types selected AND there are gender/skill categories
    var combined = [];
    if (gameTypes.length === 2 && baseCats.length > 0) {
      baseCats.forEach(function(c) {
        gameTypes.forEach(function(gt) { combined.push(c + ' ' + gt); });
      });
    } else {
      combined = baseCats;
    }

    // v1.2.0-beta: gerar pills de idade (cruzadas com gênero quando há gênero + cruzadas com gameType)
    // Idade roda em PARALELO com habilidade — não cruza skill × age. Mas cruza com gênero e gameType.
    var ageBaseCats = [];
    if (ageCats.length > 0) {
      if (genderVals.length > 0) {
        genderVals.forEach(function(g) {
          ageCats.forEach(function(a) {
            ageBaseCats.push((genderLabels[g] || g) + ' ' + a);
          });
        });
      } else {
        ageCats.forEach(function(a) { ageBaseCats.push(a); });
      }
    }
    var ageCombined = [];
    if (gameTypes.length === 2 && ageBaseCats.length > 0) {
      ageBaseCats.forEach(function(c) {
        gameTypes.forEach(function(gt) { ageCombined.push(c + ' ' + gt); });
      });
    } else {
      ageCombined = ageBaseCats;
    }

    if (combined.length === 0 && ageCombined.length === 0) {
      preview.style.display = 'none';
      return;
    }

    var _dnPreview = (typeof window._displayCategoryName === 'function') ? window._displayCategoryName : function(c) { return c; };

    // v1.2.3-beta: agrupar por gênero — uma linha por Fem/Masc/Misto, com skill+age
    // misturados na mesma linha. Misto Aleat./Obrig. colapsam para "Misto" via
    // _displayCategoryName. Ordem fixa: Fem → Masc → Misto → outros.
    var GENDER_PREFIX_ORDER = ['Fem', 'Masc', 'Misto', '_other'];
    var buckets = { Fem: { skill: [], age: [] }, Masc: { skill: [], age: [] }, Misto: { skill: [], age: [] }, _other: { skill: [], age: [] } };

    function getBucket(displayName) {
      // Match prefix exact word: "Fem", "Masc", "Misto" — must be followed by space or end of string
      for (var i = 0; i < 3; i++) {
        var p = GENDER_PREFIX_ORDER[i];
        if (displayName === p || displayName.indexOf(p + ' ') === 0) return p;
      }
      return '_other';
    }

    combined.forEach(function(c) {
      var dn = _dnPreview(c);
      buckets[getBucket(dn)].skill.push(dn);
    });
    ageCombined.forEach(function(c) {
      var dn = _dnPreview(c);
      buckets[getBucket(dn)].age.push(dn);
    });

    function dedup(arr) {
      var seen = {}; var out = [];
      arr.forEach(function(x) { if (!seen[x]) { seen[x] = 1; out.push(x); } });
      return out;
    }

    var rows = [];
    GENDER_PREFIX_ORDER.forEach(function(b) {
      var skill = dedup(buckets[b].skill);
      var age = dedup(buckets[b].age);
      if (skill.length === 0 && age.length === 0) return;
      var rowHtml = '<div style="display:flex; flex-wrap:wrap; gap:4px; align-items:center;">';
      skill.forEach(function(c) {
        rowHtml += '<span style="padding:3px 10px;background:rgba(168,85,247,0.15);border:1px solid rgba(168,85,247,0.25);border-radius:6px;color:#d8b4fe;font-weight:600;">' + c + '</span>';
      });
      age.forEach(function(c) {
        rowHtml += '<span style="padding:3px 10px;background:rgba(245,158,11,0.15);border:1px solid rgba(245,158,11,0.30);border-radius:6px;color:#fbbf24;font-weight:600;">' + c + '</span>';
      });
      rowHtml += '</div>';
      rows.push(rowHtml);
    });

    list.innerHTML = rows.join('');
    preview.style.display = '';
  };

  window._getCreateFormCategoryData = function() {
    var genderVals = (document.getElementById('tourn-gender-categories').value || '').split(',').filter(Boolean);
    var skillText = (document.getElementById('tourn-skill-categories').value || '').trim();
    var skillCats = skillText ? skillText.split(',').map(function(s) { return s.trim(); }).filter(Boolean) : [];
    // v2.1.80: categorias personalizadas — "skill-like" (cruzam com gênero igual à habilidade).
    var customCats = (document.getElementById('tourn-custom-categories').value || '').split(',').map(function(s) { return s.trim(); }).filter(Boolean);
    var skillLike = skillCats.concat(customCats);
    var genderLabels = { fem: 'Fem', masc: 'Masc', misto_aleatorio: 'Misto Aleat.', misto_obrigatorio: 'Misto Obrig.' };

    // Game type dimension
    var gameTypesVal = (document.getElementById('tourn-game-types') || {}).value || '';
    var gameTypes = [];
    if (gameTypesVal === 'simples,duplas') { gameTypes = ['Simples', 'Duplas']; }

    var baseCats = [];
    if (genderVals.length > 0 && skillLike.length > 0) {
      genderVals.forEach(function(g) {
        skillLike.forEach(function(s) { baseCats.push((genderLabels[g] || g) + ' ' + s); });
      });
    } else if (genderVals.length > 0) {
      genderVals.forEach(function(g) { baseCats.push(genderLabels[g] || g); });
    } else if (skillLike.length > 0) {
      baseCats = skillLike.slice();
    }

    // Cross with game types only if both types selected AND there are categories
    var combined = [];
    if (gameTypes.length === 2 && baseCats.length > 0) {
      baseCats.forEach(function(c) {
        gameTypes.forEach(function(gt) { combined.push(c + ' ' + gt); });
      });
    } else {
      combined = baseCats;
    }

    // v1.2.0-beta: ler ageCategories também
    var ageCats = (document.getElementById('tourn-age-categories') || {}).value || '';
    ageCats = ageCats ? ageCats.split(',').filter(Boolean) : [];
    return { genderCategories: genderVals, skillCategories: skillCats, ageCategories: ageCats, customCategories: customCats, combinedCategories: combined };
  };

  window._onInscricaoChange = function () {
    // Team size is always visible — enrollment mode does not affect it
  };

  window._updateRegDateVisibility = function () {
    const regBox = document.getElementById('reg-date-container');
    if (!regBox) return;
    // v2.6.52: o prazo de encerramento das inscrições é regido por "Inscrições durante
    // a fase": só aparece quando FECHADAS está ligado. Aberta = inscrição segue durante
    // a fase, sem data de corte (e o toggle "Novos Confrontos" aparece). Vale p/ todos
    // os formatos — antes era escondido só pra Liga com inscrições abertas.
    var lateVal = (document.getElementById('late-enrollment') || {}).value || 'closed';
    // 'flex' (não '') preserva o layout coluna do card — '' apagaria o display:flex inline.
    regBox.style.display = (lateVal === 'closed') ? 'flex' : 'none';
  };

  window._onVenueAccessToggle = function () {
    var toggle = document.getElementById('toggle-venue-public');
    var hiddenEl = document.getElementById('tourn-venue-access');
    var label = document.getElementById('venue-access-label');
    var desc = document.getElementById('venue-access-desc');
    if (!toggle || !hiddenEl) return;
    if (toggle.checked) {
      hiddenEl.value = 'public';
      if (label) label.innerHTML = _t('create.accessOpen');
      if (desc) desc.textContent = _t('create.openDesc');
    } else {
      hiddenEl.value = 'members';
      if (label) label.innerHTML = _t('create.accessRestricted');
      if (desc) desc.textContent = _t('create.restrictedDesc');
    }
  };

  window._applyVenueAccessUI = function (values) {
    var toggle = document.getElementById('toggle-venue-public');
    var label = document.getElementById('venue-access-label');
    var desc = document.getElementById('venue-access-desc');
    var hiddenEl = document.getElementById('tourn-venue-access');
    if (!toggle) return;
    var isPublic = values.length === 0 || (values.length === 1 && values[0] === 'public');
    toggle.checked = isPublic;
    if (hiddenEl) hiddenEl.value = isPublic ? 'public' : 'members';
    if (label) label.innerHTML = isPublic ? _t('create.accessOpen') : _t('create.accessRestricted');
    if (desc) desc.textContent = isPublic ? _t('create.openDesc') : _t('create.restrictedDesc');
  };

  // --- Google Places venue search (programmatic — no Google UI elements injected) ---
  let _placesLibLoaded = false;
  let _placesInitialized = false;
  let _venueSearchTimer = null;
  const OPENWEATHER_API_KEY = ['8fc3ddd6','9fcd76f8','0ba767c3','0ebd8b9d'].join('');

  window._initPlacesAutocomplete = function () {
    if (_placesInitialized) return;

    var input = document.getElementById('tourn-venue');
    var suggestionsDiv = document.getElementById('venue-suggestions');
    if (!input || !suggestionsDiv) return;

    _placesInitialized = true;

    // Load the Google Places library in the background (non-blocking)
    if (typeof google !== 'undefined' && google.maps && google.maps.importLibrary) {
      google.maps.importLibrary('places').then(function () {
        _placesLibLoaded = true;
        // Google Places library loaded
      }).catch(function (err) {
        window._warn('Google Places library load failed:', err.message);
      });
    } else {
      // Retry loading after 2s if Google Maps base not ready yet
      _placesInitialized = false;
      setTimeout(window._initPlacesAutocomplete, 2000);
      return;
    }

    // --- Debounced search on input ---
    input._lastSelectedVenue = input.value || '';
    input.addEventListener('input', function () {
      clearTimeout(_venueSearchTimer);
      var query = input.value.trim();

      // If user changed the venue text, clear old venue data and photo
      if (query !== input._lastSelectedVenue) {
        var latEl = document.getElementById('tourn-venue-lat');
        var lonEl = document.getElementById('tourn-venue-lon');
        var addrEl = document.getElementById('tourn-venue-address');
        var placeIdEl = document.getElementById('tourn-venue-place-id');
        var photoUrlEl = document.getElementById('tourn-venue-photo-url');
        if (latEl) latEl.value = '';
        if (lonEl) lonEl.value = '';
        if (addrEl) addrEl.value = '';
        if (placeIdEl) placeIdEl.value = '';
        if (photoUrlEl) photoUrlEl.value = '';
        window._applyVenuePhoto('');
        var mapEl = document.getElementById('venue-create-map');
        if (mapEl) mapEl.style.display = 'none';
        var infoEl = document.getElementById('venue-osm-info');
        if (infoEl) { infoEl.style.display = 'none'; infoEl.innerHTML = ''; }
      }

      if (query.length < 3) {
        suggestionsDiv.style.display = 'none';
        suggestionsDiv.innerHTML = '';
        return;
      }
      _venueSearchTimer = setTimeout(function () {
        window._searchVenue(query);
      }, 350);
    });

    // Close suggestions on blur (with delay for click to register)
    input.addEventListener('blur', function () {
      setTimeout(function () { suggestionsDiv.style.display = 'none'; }, 200);
    });

    // Reopen on focus if there's text
    input.addEventListener('focus', function () {
      if (input.value.trim().length >= 3 && suggestionsDiv.children.length > 0) {
        suggestionsDiv.style.display = 'block';
      }
    });
  };

  // --- Search venue using Google Places AutocompleteSuggestion (New API) ---
  window._searchVenue = async function (query) {
    var suggestionsDiv = document.getElementById('venue-suggestions');
    if (!suggestionsDiv) return;

    // Wait for library
    if (!_placesLibLoaded) {
      suggestionsDiv.innerHTML = '<div style="padding:10px 14px; color:#94a3b8; font-size:0.8rem;">' + _t('create.loadingPlaces') + '</div>';
      suggestionsDiv.style.display = 'block';
      return;
    }

    try {
      var request = {
        // v4.0.42: sem includedRegionCodes — busca de local não é restrita ao BR.
        input: query,
        includedPrimaryTypes: ['establishment', 'geocode'],
        language: 'pt-BR'
      };

      var result = await google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
      var suggestions = result.suggestions || [];

      if (suggestions.length === 0) {
        suggestionsDiv.innerHTML = '<div style="padding:10px 14px; color:#94a3b8; font-size:0.8rem;">' + _t('create.noResults') + '</div>';
        suggestionsDiv.style.display = 'block';
        return;
      }

      suggestionsDiv.innerHTML = '';
      suggestions.forEach(function (suggestion) {
        if (!suggestion.placePrediction) return;
        var pred = suggestion.placePrediction;
        var mainText = pred.mainText ? pred.mainText.text : '';
        var secondaryText = pred.secondaryText ? pred.secondaryText.text : '';

        var item = document.createElement('div');
        item.style.cssText = 'padding:10px 14px; cursor:pointer; border-bottom:1px solid rgba(255,255,255,0.06); transition:background 0.15s;';
        item.innerHTML = '<div style="color:#e2e8f0; font-size:0.85rem; font-weight:500;">📍 ' +
          window._safeHtml(mainText) + '</div>' +
          (secondaryText ? '<div style="color:#94a3b8; font-size:0.75rem; margin-top:2px;">' + window._safeHtml(secondaryText) + '</div>' : '');

        item.addEventListener('mouseenter', function () { item.style.background = 'rgba(129,140,248,0.15)'; });
        item.addEventListener('mouseleave', function () { item.style.background = 'transparent'; });
        item.addEventListener('mousedown', function (e) {
          e.preventDefault(); // Prevent blur
          window._selectVenueSuggestion(pred);
        });

        suggestionsDiv.appendChild(item);
      });

      suggestionsDiv.style.display = 'block';
    } catch (err) {
      window._error('Venue search error:', err);
      suggestionsDiv.innerHTML = '<div style="padding:10px 14px; color:#f87171; font-size:0.8rem;">Erro na busca: ' + window._safeHtml(err.message || 'API indisponível') + '</div>';
      suggestionsDiv.style.display = 'block';
    }
  };

  // --- Select a venue suggestion and fetch place details ---
  window._selectVenueSuggestion = async function (prediction) {
    var suggestionsDiv = document.getElementById('venue-suggestions');
    if (suggestionsDiv) { suggestionsDiv.style.display = 'none'; suggestionsDiv.innerHTML = ''; }

    try {
      var place = prediction.toPlace();
      await place.fetchFields({
        fields: ['displayName', 'formattedAddress', 'location', 'types', 'addressComponents', 'id', 'photos']
      });

      var input = document.getElementById('tourn-venue');
      var infoEl = document.getElementById('venue-osm-info');
      var latEl = document.getElementById('tourn-venue-lat');
      var lonEl = document.getElementById('tourn-venue-lon');

      // Extract city
      var city = '';
      if (place.addressComponents) {
        for (var i = 0; i < place.addressComponents.length; i++) {
          var comp = place.addressComponents[i];
          if (comp.types && (comp.types.includes('administrative_area_level_2') || comp.types.includes('locality'))) {
            city = comp.longText || '';
            break;
          }
        }
      }

      var name = place.displayName || '';
      var displayName = name + (city ? ', ' + city : '');
      var fullAddress = place.formattedAddress || displayName;

      if (input) {
        input.value = displayName;
        // Update the tracked venue name so input listener doesn't clear it
        input._lastSelectedVenue = displayName;
      }
      if (latEl && place.location) latEl.value = place.location.lat();
      if (lonEl && place.location) lonEl.value = place.location.lng();
      var addrEl = document.getElementById('tourn-venue-address');
      if (addrEl) addrEl.value = fullAddress;
      var placeIdEl = document.getElementById('tourn-venue-place-id');
      if (placeIdEl) placeIdEl.value = place.id || '';

      // Extract venue photo from Google Places
      var venuePhotoUrl = '';
      var photoUrlEl = document.getElementById('tourn-venue-photo-url');
      if (place.photos && place.photos.length > 0) {
        try {
          venuePhotoUrl = place.photos[0].getURI({ maxWidth: 800, maxHeight: 400 });
        } catch (photoErr) {
          window._warn('Could not get photo URI:', photoErr);
        }
      }
      if (photoUrlEl) photoUrlEl.value = venuePhotoUrl;
      window._applyVenuePhoto(venuePhotoUrl);

      if (infoEl) {
        infoEl.style.display = 'flex';
        var encodedName = encodeURIComponent(name);
        var mapsUrl = place.id
          ? 'https://www.google.com/maps/search/?api=1&query=' + encodedName + '&query_place_id=' + place.id
          : 'https://www.google.com/maps/search/?api=1&query=' + place.location.lat() + ',' + place.location.lng();
        infoEl.innerHTML = '<span style="display:flex; flex-direction:column; gap:2px;">' +
          '<span style="font-weight:500; color:#e2e8f0;">📍 ' + window._safeHtml(name) + '</span>' +
          '<span style="color:#94a3b8; font-size:0.7rem;">' + window._safeHtml(fullAddress) + '</span>' +
          '</span>' +
          ' &nbsp;<a href="' + mapsUrl + '" target="_blank" title="Ver no mapa" style="color:#818cf8; text-decoration:none; font-size:1.1rem; line-height:1; flex-shrink:0;">🗺️</a>';
      }

      // Infer access from types
      var types = place.types || [];
      var suggested = [];
      if (types.includes('gym') || types.includes('stadium') || types.includes('sports_complex')) {
        suggested.push('members');
      } else {
        suggested.push('public');
      }
      var accessEl = document.getElementById('tourn-venue-access');
      if (accessEl) accessEl.value = suggested.join(',');
      window._applyVenueAccessUI(suggested);
      if (typeof showNotification === 'function') {
        var accessLabel = suggested.includes('members') ? _t('create.accessRestrictedShort') : _t('create.accessOpenShort');
        showNotification(window._t('create.venueFound'), window._t('create.venueFoundMsg', {access: accessLabel}), 'success');
      }

      window._checkWeather();

      // v2.1.44: se o local está cadastrado na plataforma, puxa nº de quadras e
      // acesso reais (sobrepõe o acesso inferido pelos tipos do Google acima).
      if (typeof window._pullRegisteredVenueData === 'function') window._pullRegisteredVenueData(place.id || '', name);

      // Show map with the selected venue
      window._initVenueCreateMap(place.location.lat(), place.location.lng(), name);
    } catch (err) {
      window._error('Place details fetch error:', err);
      if (typeof showNotification === 'function') {
        showNotification(window._t('auth.error'), window._t('create.venueDetailError', {msg: err.message || ''}), 'error');
      }
    }
  };

  // Auto-show map with user location when form opens (if no venue set)
  window._autoShowVenueMap = function() {
    var latEl = document.getElementById('tourn-venue-lat');
    var lonEl = document.getElementById('tourn-venue-lon');
    // If venue already has coordinates, show that map
    if (latEl && latEl.value && lonEl && lonEl.value) {
      window._initVenueCreateMap(parseFloat(latEl.value), parseFloat(lonEl.value), '');
      return;
    }
    // Otherwise try user geolocation silently
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(function(pos) {
      var lat = pos.coords.latitude;
      var lng = pos.coords.longitude;
      window._initVenueCreateMap(lat, lng, '');
    }, function() {
      // Geolocation denied/failed — show default Brazil center
      window._initVenueCreateMap(-15.78, -47.93, '');
    }, { enableHighAccuracy: false, timeout: 5000 });
  };

  // ── Venue map in create/edit modal ──
  var _venueCreateMap = null;
  var _venueCreateMarker = null;

  window._initVenueCreateMap = async function(lat, lng, venueName) {
    var container = document.getElementById('venue-create-map');
    if (!container) return;
    if (isNaN(lat) || isNaN(lng)) { container.style.display = 'none'; return; }

    container.style.display = 'block';

    if (!window.google || !window.google.maps) {
      container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);font-size:0.75rem;">' + _t('create.mapUnavailable') + '</div>';
      return;
    }

    try {
      var { Map } = await google.maps.importLibrary('maps');
      var { AdvancedMarkerElement } = await google.maps.importLibrary('marker');

      _venueCreateMap = new Map(container, {
        center: { lat: lat, lng: lng },
        zoom: 15,
        mapId: 'scoreplace-venue-create-map',
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: 'cooperative',
        clickableIcons: false,
        colorScheme: 'DARK'
      });

      var pin = document.createElement('div');
      pin.style.cssText = 'width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#10b981,#34d399);border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;font-size:14px;cursor:pointer;';
      pin.textContent = '📍';

      if (_venueCreateMarker) {
        try { _venueCreateMarker.map = null; } catch(e) {}
      }
      _venueCreateMarker = new AdvancedMarkerElement({
        map: _venueCreateMap,
        position: { lat: lat, lng: lng },
        content: pin,
        title: venueName || ''
      });
    } catch (e) {
      window._warn('[venue-create-map] init error:', e);
      container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);font-size:0.75rem;">' + _t('create.mapUnavailable') + '</div>';
    }
  };

  window._venueLocateMe = function() {
    if (!navigator.geolocation) {
      if (typeof showNotification === 'function') showNotification(window._t('auth.error'), window._t('create.geoUnavailable'), 'error');
      return;
    }
    if (typeof showNotification === 'function') showNotification(window._t('create.locating'), window._t('create.locatingMsg'), 'info');
    navigator.geolocation.getCurrentPosition(function(pos) {
      var lat = pos.coords.latitude;
      var lng = pos.coords.longitude;
      // Set lat/lon in hidden fields
      var latEl = document.getElementById('tourn-venue-lat');
      var lonEl = document.getElementById('tourn-venue-lon');
      if (latEl) latEl.value = lat;
      if (lonEl) lonEl.value = lng;
      // Reverse geocode to fill venue name
      if (window.google && window.google.maps) {
        var geocoder = new google.maps.Geocoder();
        geocoder.geocode({ location: { lat: lat, lng: lng } }, function(results, status) {
          if (status === 'OK' && results && results[0]) {
            var input = document.getElementById('tourn-venue');
            var addrEl = document.getElementById('tourn-venue-address');
            var label = results[0].formatted_address || '';
            if (input) { input.value = label; input._lastSelectedVenue = label; }
            if (addrEl) addrEl.value = label;
          }
          window._initVenueCreateMap(lat, lng, '');
        });
      } else {
        window._initVenueCreateMap(lat, lng, '');
      }
    }, function(err) {
      window._warn('Geolocation error:', err);
      if (typeof showNotification === 'function') showNotification(window._t('auth.error'), window._t('create.geoFailed'), 'error');
    }, { enableHighAccuracy: true, timeout: 10000 });
  };

  // Apply venue photo as background on the Local e Quadras box
  window._applyVenuePhoto = function (photoUrl) {
    // Find the "Local e Quadras" section box by ID
    var box = document.getElementById('venue-photo-box');
    if (!box) return;

    if (photoUrl) {
      box.style.backgroundImage = 'linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.7) 100%), url(' + photoUrl + ')';
      box.style.backgroundSize = 'cover';
      box.style.backgroundPosition = 'center';
      box.style.backgroundRepeat = 'no-repeat';
      box.style.borderColor = 'rgba(16,185,129,0.3)';
    } else {
      box.style.backgroundImage = '';
      box.style.backgroundSize = '';
      box.style.backgroundPosition = '';
      box.style.backgroundRepeat = '';
      box.style.borderColor = '';
    }
  };

  // --- Weather forecast ---
  let _checkWeatherTimer = null;

  window._checkWeather = function () {
    clearTimeout(_checkWeatherTimer);
    _checkWeatherTimer = setTimeout(() => {
      const lat = document.getElementById('tourn-venue-lat').value;
      const lon = document.getElementById('tourn-venue-lon').value;
      const startDate = document.getElementById('tourn-start-date').value;
      const weatherDiv = document.getElementById('weather-forecast');
      const weatherContent = document.getElementById('weather-content');

      if (!lat || !lon || !startDate || !weatherDiv || !weatherContent) {
        if (weatherDiv) weatherDiv.style.display = 'none';
        return;
      }

      // If no API key, hide weather
      if (!OPENWEATHER_API_KEY) {
        weatherDiv.style.display = 'none';
        return;
      }

      // Fetch weather data
      fetch('https://api.openweathermap.org/data/2.5/forecast?lat=' + lat + '&lon=' + lon +
        '&appid=' + OPENWEATHER_API_KEY + '&units=metric&lang=pt_br')
        .then(r => r.json())
        .then(data => {
          if (!data.list || !Array.isArray(data.list)) {
            weatherDiv.style.display = 'none';
            return;
          }

          // Parse start date
          const startTs = new Date(startDate).getTime();
          const now = new Date().getTime();

          // Check if date is within 5 days
          if (startTs - now > 5 * 24 * 60 * 60 * 1000) {
            weatherDiv.style.display = 'block';
            weatherContent.innerHTML = '<div style="font-size:0.8rem; color:#cbd5e1;">' + _t('create.weatherFuture') + '</div>';
            return;
          }

          // Find closest forecast entry
          let closest = null;
          let minDiff = Infinity;
          for (const entry of data.list) {
            const entryTs = entry.dt * 1000;
            const diff = Math.abs(entryTs - startTs);
            if (diff < minDiff) {
              minDiff = diff;
              closest = entry;
            }
          }

          if (!closest) {
            weatherDiv.style.display = 'none';
            return;
          }

          const weather = closest.main || {};
          const weatherInfo = (closest.weather && closest.weather[0]) || {};
          const temp = Math.round(weather.temp || 0);
          const tempMin = Math.round(weather.temp_min || 0);
          const tempMax = Math.round(weather.temp_max || 0);
          const humidity = weather.humidity || 0;
          const description = weatherInfo.description || '';
          const icon = weatherInfo.icon || '01d';

          const iconUrl = 'https://openweathermap.org/img/wn/' + icon + '@2x.png';
          const tempDisplay = tempMin + '°C - ' + tempMax + '°C';

          weatherDiv.style.display = 'block';
          weatherContent.innerHTML = '<div style="display:flex; gap:10px; align-items:flex-start;">' +
            '<img src="' + iconUrl + '" alt="weather" style="width:40px; height:40px;">' +
            '<div style="flex:1;">' +
            '<div style="font-size:0.85rem; font-weight:600; color:#a5b4fc;">' + tempDisplay + '</div>' +
            '<div style="font-size:0.75rem; color:#cbd5e1; text-transform:capitalize; margin-top:2px;">' + description + '</div>' +
            '<div style="font-size:0.75rem; color:#94a3b8; margin-top:4px;">' + _t('create.humidity') + ': ' + humidity + '%</div>' +
            '</div></div>';
        })
        .catch(() => {
          weatherDiv.style.display = 'none';
        });
    }, 500);
  };

  // _onLigaInactivityChange kept as alias — now handled by _selectLigaInact onclick
  window._onLigaInactivityChange = function () {
    var val = document.getElementById('liga-inactivity').value;
    var xContainer = document.getElementById('liga-inactivity-x-container');
    if (xContainer) xContainer.style.display = val === 'remove' ? 'block' : 'none';
  };

  // Wire up liga event listeners
  setTimeout(() => {
    const openEnrollEl = document.getElementById('liga-open-enrollment');
    if (openEnrollEl) openEnrollEl.addEventListener('change', window._updateRegDateVisibility);
  }, 100);

  window._updateAutoCloseVisibility = function () {
    const fmt = document.getElementById('select-formato');
    const maxEl = document.getElementById('tourn-max-participants');
    // v2.6.87: "Modelo de inscrição" (corrida/sorteio) só faz sentido com Máx.
    // Participantes definido — sem limite não há vagas pra disputar nem sortear.
    var _enrollSec = document.getElementById('enroll-model-section');
    if (_enrollSec && maxEl) {
      var _maxV = parseInt(maxEl.value, 10);
      var _hasMax = !isNaN(_maxV) && _maxV >= 2;
      _enrollSec.style.display = _hasMax ? '' : 'none';
      // Máx. Participantes É o nº de vagas a sortear (modo draw) — mantém em sincronia.
      var _slots = document.getElementById('tourn-target-slots');
      if (_slots && _hasMax) _slots.value = _maxV;
    }
    const container = document.getElementById('auto-close-container');
    if (!fmt || !maxEl || !container) return;
    // Modo Vagas-por-sorteio é incompatível com encerrar-ao-lotar (não há corrida).
    var _elm = (document.getElementById('enrollment-limit-mode') || {}).value || 'cap';
    if (_elm === 'draw') { container.style.display = 'none'; return; }
    const isElim = fmt.value === 'elim_simples' || fmt.value === 'elim_dupla';
    const maxVal = parseInt(maxEl.value);
    const isPow2 = maxVal > 0 && (maxVal & (maxVal - 1)) === 0;
    container.style.display = (isElim && isPow2) ? 'block' : 'none';
  };

  // --- Court count change: auto-generate placeholder names ---
  window._onCourtCountChange = function () {
    const count = parseInt(document.getElementById('tourn-court-count').value) || 1;
    const namesEl = document.getElementById('tourn-court-names');
    if (!namesEl) return;
    const placeholder = [];
    for (let i = 1; i <= count; i++) placeholder.push('Quadra ' + i);
    namesEl.placeholder = placeholder.join(', ');
    window._recalcDuration();
  };

  // --- Court names input: sync count from named courts ---
  window._onCourtNamesInput = function () {
    const namesEl = document.getElementById('tourn-court-names');
    const countEl = document.getElementById('tourn-court-count');
    const hintEl = document.getElementById('court-names-hint');
    if (!namesEl || !countEl) return;
    const names = namesEl.value.split(',').map(s => s.trim()).filter(s => s.length > 0);
    if (names.length > 0) {
      countEl.value = names.length;
      if (hintEl) hintEl.textContent = names.length + ' quadra' + (names.length > 1 ? 's' : '') + ' definida' + (names.length > 1 ? 's' : '') + ': ' + names.join(', ');
    } else {
      if (hintEl) hintEl.textContent = _t('create.courtHint');
    }
    window._recalcDuration();
  };

  // --- Duration estimation calculator ---
  // ── Estimativa de tempo da FASE (escada de potências de 2 em torno do nº real) ──
  // Considera: formato, modo de sorteio (sorteio/rei-rainha), categorias (dividem o
  // campo em sub-chaves) e os tempos médios que o organizador informa (chamada +
  // aquecimento + duração). O formato da partida (GSM) entra via a duração média.
  // v2.6.68: núcleo da estimativa extraído — parametrizado por formato/modo/monarch/
  // grupos/N, pra ser reusado pela Fase 1 E por cada fase extra (mesma lógica).
  // slot/courts/categorias (K) são do TORNEIO (compartilhados); o resto vem da fase.
  window._buildPhaseEstimate = function (o) {
    o = o || {};
    var call = o.call || 0, warm = o.warm || 0, dur = o.dur || 0;
    var courts = Math.max(o.courts || 1, 1);
    var slot = call + warm + dur; // minutos por slot de partida
    var fmt = o.fmt || 'elim_simples';
    var drawMode = o.drawMode || 'sorteio';
    var K = Math.max(o.K || 1, 1);
    var ageCats = o.ageCats || 0;
    var N = o.N || 0;
    var isReal = !!o.isReal;
    // Classificados/grupo agora vêm da transição de fases (mapping.rankTo), não de
    // um campo dedicado. Para a estimativa usamos 2 (Rei+Vice), o caso típico.
    var monarchCls = 2;
    var gruposN = Math.max(o.gruposCount || 4, 1);

    // Jogos por RODADA de UMA sub-chave (categoria). Rodadas são sequenciais —
    // dentro de uma rodada os jogos correm em paralelo até a capacidade de quadras.
    function elimRounds(n) {
      var arr = [], cur = n;
      while (cur > 1) { arr.push(Math.floor(cur / 2)); cur = Math.ceil(cur / 2); }
      return arr; // ex.: 103 → [51,26,13,6,3,2,1] (soma = n-1)
    }
    function roundsArrayFor(n) {
      if (n < 2) return [];
      if (drawMode === 'rei_rainha') {
        // Rei/Rainha coroa um campeão: grupos de 4 (3 sub-rodadas, 1 jogo/grupo
        // cada) → classificados avançam → ELIMINATÓRIA até a final. Conta TUDO.
        var groups = Math.max(Math.ceil(n / 4), 1);
        var cls = monarchCls; // classificados por grupo
        return [groups, groups, groups].concat(elimRounds(groups * cls));
      }
      if (fmt === 'liga') return [Math.floor(n / 2)]; // UMA rodada de pontos corridos
      if (fmt === 'grupos_mata') {
        var g = gruposN;   // nº de grupos
        var gs = Math.ceil(n / g);                    // tamanho do grupo
        var rnds = Math.max(gs - 1, 1);               // rodadas round-robin no grupo
        var perRound = Math.max(Math.floor(gs / 2) * g, 1);
        var arr = []; for (var i = 0; i < rnds; i++) arr.push(perRound);
        return arr;                                   // fase de grupos completa
      }
      return elimRounds(n);                           // elim_simples
    }
    function perCat(n) { return Math.max(Math.round(n / K), 1); }
    // Tempo de um conjunto de rodadas: em cada rodada global há K×jogos (as K
    // categorias dividem o campo mas COMPARTILHAM as quadras) → teto por quadras.
    function roundsTime(arr) {
      var mins = 0;
      for (var r = 0; r < arr.length; r++) mins += Math.ceil((arr[r] * K) / Math.max(courts, 1)) * slot;
      return mins;
    }
    function totalMatches(n) {
      if (n < 2) return 0;
      var pc = perCat(n);
      // Dupla Eliminatória: ~2(n-1)+1 jogos (upper + lower + grande final).
      if (drawMode !== 'rei_rainha' && fmt === 'elim_dupla') return ((pc - 1) * 2 + 1) * K;
      var arr = roundsArrayFor(pc), sum = 0;
      for (var i = 0; i < arr.length; i++) sum += arr[i];
      return sum * K;
    }
    function timeFor(n) {
      if (slot <= 0) return -1;
      if (n < 2) return 0;
      var pc = perCat(n);
      // Dupla Elim.: lower bracket roda em paralelo ao upper → ~1.9× a simples.
      if (drawMode !== 'rei_rainha' && fmt === 'elim_dupla') return Math.round(1.9 * roundsTime(elimRounds(pc)));
      return roundsTime(roundsArrayFor(pc));
    }
    function fmtMin(m) {
      if (m < 0) return '—';
      var h = Math.floor(m / 60), mm = Math.round(m % 60);
      if (h > 0 && mm > 0) return h + 'h' + (mm < 10 ? '0' : '') + mm;
      if (h > 0) return h + 'h';
      return mm + 'min';
    }
    function isPow2(v) { return v > 0 && (v & (v - 1)) === 0; }
    function below(v) { var p = 1; while (p * 2 <= v) p *= 2; return p; }

    // escada: 2 pot. de 2 abaixo + real/planejado + 2 acima
    var counts;
    if (N >= 2) {
      if (isPow2(N)) counts = [N / 4, N / 2, N, N * 2, N * 4];
      else { var prev = below(N); counts = [prev / 2, prev, N, prev * 2, prev * 4]; }
    } else {
      counts = [8, 16, 32, 64, 128]; // sem inscritos: simulação genérica
    }
    var seen = {};
    counts = counts.filter(function (c) { return c >= 2; })
                   .filter(function (c) { if (seen[c]) return false; seen[c] = 1; return true; })
                   .sort(function (a, b) { return a - b; });

    var fmtLabel = ({ elim_simples: 'Eliminatória', elim_dupla: 'Dupla Elim.', grupos_mata: 'Fase de Grupos', liga: 'Pontos Corridos', suico: 'Suíço' })[fmt] || fmt;
    var headLabel = (drawMode === 'rei_rainha') ? '👑 Rei/Rainha (grupos de 4)' : fmtLabel;
    var catLabel = K > 1 ? (' · ' + K + ' categorias') : '';
    var h = '';
    h += '<div style="font-size:0.68rem;color:var(--text-muted);margin-bottom:6px;">' + headLabel + catLabel + ' · ' + courts + (courts > 1 ? ' quadras' : ' quadra') + ' · ' + slot + 'min/jogo</div>';
    if (slot <= 0) h += '<div style="font-size:0.72rem;color:#f59e0b;margin-bottom:6px;">Preencha chamada/aquecimento/duração pra estimar o tempo.</div>';
    if (!isReal && N < 2) h += '<div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:6px;">Sem inscritos ainda — simulação genérica. Edite um torneio com inscritos pra ver o nº real.</div>';

    h += '<div style="display:flex;flex-direction:column;gap:4px;">';
    counts.forEach(function (c) {
      var real = isReal && c === N;
      var m = totalMatches(c);
      var bg = real ? 'rgba(59,130,246,0.18)' : 'rgba(255,255,255,0.03)';
      var bd = real ? '1px solid rgba(59,130,246,0.4)' : '1px solid rgba(255,255,255,0.06)';
      var lc = real ? '#60a5fa' : 'var(--text-muted)';
      h += '<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:' + bg + ';border:' + bd + ';border-radius:8px;flex-wrap:wrap;">';
      h += '<span style="font-size:0.78rem;font-weight:' + (real ? '700' : '600') + ';color:' + lc + ';min-width:104px;">' + c + ' inscritos' + (real ? ' <span style="font-size:0.62rem;">(real)</span>' : '') + '</span>';
      h += '<span style="font-size:0.74rem;color:var(--text-muted);opacity:0.65;">' + m + ' jogos</span>';
      h += '<span style="font-size:0.85rem;font-weight:700;color:' + (real ? '#e2e8f0' : 'rgba(255,255,255,0.7)') + ';margin-left:auto;">' + fmtMin(timeFor(c)) + '</span>';
      h += '</div>';
    });
    h += '</div>';
    if (drawMode === 'rei_rainha') h += '<div style="font-size:0.64rem;color:var(--text-muted);margin-top:6px;opacity:0.8;">Grupos de 4 + eliminatória dos classificados <strong>até a final</strong>.</div>';
    else if (fmt === 'liga') h += '<div style="font-size:0.64rem;color:var(--text-muted);margin-top:6px;opacity:0.8;">Estimativa de <strong>uma rodada</strong> de pontos corridos.</div>';
    else if (fmt === 'grupos_mata') h += '<div style="font-size:0.64rem;color:var(--text-muted);margin-top:6px;opacity:0.8;">Estimativa da <strong>fase de grupos</strong> completa (sem mata-mata).</div>';
    if (ageCats > 0) h += '<div style="font-size:0.64rem;color:var(--text-muted);margin-top:4px;opacity:0.8;">⚠️ Categorias por idade criam sub-chaves extras não incluídas nesta estimativa.</div>';
    return h;
  };

  // Fase 1: colhe os inputs (torneio + Fase 1) e injeta no #phase-estimate-ladder.
  window._renderPhaseEstimate = function () {
    var ladder = document.getElementById('phase-estimate-ladder');
    if (!ladder) return;
    var gv = function (id) { var e = document.getElementById(id); return e ? e.value : ''; };
    var iv = function (id, d) { var v = parseInt(gv(id), 10); return isNaN(v) ? d : v; };
    var K = 1, ageCats = 0;
    try {
      var catData = (window._getCreateFormCategoryData ? window._getCreateFormCategoryData() : {}) || {};
      if (catData.combinedCategories && catData.combinedCategories.length) K = catData.combinedCategories.length;
      ageCats = (catData.ageCategories || []).length;
    } catch (e) { K = 1; }
    var N = 0, isReal = false;
    var editId = gv('edit-tournament-id');
    if (editId && window.AppStore && Array.isArray(window.AppStore.tournaments)) {
      var t = window.AppStore.tournaments.find(function (x) { return String(x.id) === String(editId); });
      if (t && Array.isArray(t.participants) && t.participants.length > 0) { N = t.participants.length; isReal = true; }
    }
    if (!isReal) {
      var elm = gv('enrollment-limit-mode') || 'cap';
      if (elm === 'draw') N = iv('tourn-target-slots', 0);
      if (!N) N = iv('tourn-max-participants', 0);
    }
    ladder.innerHTML = window._buildPhaseEstimate({
      call: iv('tourn-call-time', 0), warm: iv('tourn-warmup-time', 0), dur: iv('tourn-game-duration', 0),
      courts: iv('tourn-court-count', 1), fmt: gv('select-formato') || 'elim_simples', drawMode: gv('draw-mode') || 'sorteio',
      K: K, ageCats: ageCats, N: N, isReal: isReal,
      gruposCount: iv('grupos-count', 4)
    });
  };


  // v3.0.x: divisão da Fase de Grupos por SLIDER. Esquerda = mais grupos menores,
  // direita = menos grupos maiores. Sugerido a partir do nº de inscritos (real ao
  // editar, ou planejado: máx/vagas). Toggle "apenas grupos de mesmo tamanho" força
  // grupos iguais excluindo o resto (lista de espera). O nº de classificados NÃO fica
  // mais aqui — vai pra transição entre fases (respeitando potência de 2).
  window._gruposFmtMin = function (m) { var h = Math.floor(m / 60), mm = Math.round(m % 60); if (h > 0 && mm > 0) return h + 'h' + (mm < 10 ? '0' : '') + mm; if (h > 0) return h + 'h'; return mm + 'min'; };
  window._gruposEstLine = function (c) {
    var gi = function (id, d) { var e = document.getElementById(id); var v = e ? parseInt(e.value, 10) : NaN; return isNaN(v) ? d : v; };
    var slot = gi('tourn-call-time', 5) + gi('tourn-warmup-time', 5) + gi('tourn-game-duration', 30);
    var courts = Math.max(gi('tourn-court-count', 1), 1);
    var teamSize = gi('tourn-team-size', 1);
    var comb = function (n) { return n * (n - 1) / 2; }; // round-robin: jogos = C(n,2)
    var large = c.large || 0; // grupos com 1 a mais (maxS); resto tem minS
    var games = large > 0 ? (large * comb(c.maxS) + (c.g - large) * comb(c.minS)) : (c.g * comb(c.minS));
    var p = c.maxS, rounds = Math.max(p - 1, 1), perRound = Math.max(Math.floor(p / 2) * c.g, 1);
    var mins = rounds * Math.ceil(perRound / courts) * slot;
    var parts = ['<strong style="color:var(--text-main);">' + games + ' jogos</strong>', '~' + window._gruposFmtMin(mins)];
    // Rei/Rainha só faz sentido com inscrição individual (grupos de 4 que rodam
    // parceiros). Em duplas/equipes o sorteio já forma os pares — sem Rei/Rainha.
    if (teamSize < 2 && c.minS <= 4 && c.maxS >= 4) parts.push('👑 pode ser Rei/Rainha');
    if (c.excl > 0) parts.push('<span style="color:#f59e0b;">' + c.excl + ' suplente' + (c.excl > 1 ? 's' : '') + '</span>');
    return parts.join(' · ');
  };
  window._gruposComputeCands = function () {
    var gv = function (id) { var e = document.getElementById(id); return e ? e.value : ''; };
    var iv = function (id, d) { var v = parseInt(gv(id), 10); return isNaN(v) ? d : v; };
    var N = 0;
    var ed = gv('edit-tournament-id');
    if (ed && window.AppStore && Array.isArray(window.AppStore.tournaments)) {
      var t = window.AppStore.tournaments.find(function (x) { return String(x.id) === String(ed); });
      if (t && Array.isArray(t.participants) && t.participants.length > 1) N = t.participants.length;
    }
    if (!N) { var elm = gv('enrollment-limit-mode') || 'cap'; if (elm === 'draw') N = iv('tourn-target-slots', 0); if (!N) N = iv('tourn-max-participants', 0); }
    var teamSize = iv('tourn-team-size', 1);
    var units = (teamSize >= 2) ? Math.floor(N / 2) : N; // duplas → nº de times
    var unitLbl = (teamSize >= 2) ? 'duplas' : 'jogadores';
    var equalOnly = !!(document.getElementById('grupos-equal-only') || {}).checked;
    var out = { units: units, unitLbl: unitLbl, equalOnly: equalOnly, cands: [] };
    if (!units || units < 4) return out;
    // g de muitos→poucos (esquerda→direita); tamanho-base 3 a 6 por grupo.
    for (var g = Math.floor(units / 3); g >= 2; g--) {
      var base = Math.floor(units / g), rem = units % g;
      if (base < 3 || base > 6) continue;
      if (equalOnly) out.cands.push({ g: g, minS: base, maxS: base, excl: rem, large: 0 });
      else out.cands.push({ g: g, minS: base, maxS: (rem > 0 ? base + 1 : base), excl: 0, large: rem });
    }
    return out;
  };
  // v3.0.x: texto sob o toggle "grupos de mesmo tamanho". Só aparece com o toggle
  // LIGADO; e quando "Novos Confrontos" (inscrição aberta + expand) também está
  // ligado, mostra o aviso de que esta opção PREVALECE sobre os grupos iguais.
  window._updateGruposEqualHelper = function () {
    var helper = document.getElementById('grupos-equal-helper'); if (!helper) return;
    var isGrupos = ((document.getElementById('select-formato') || {}).value === 'grupos_mata');
    var eqOnly = !!(document.getElementById('grupos-equal-only') || {}).checked;
    if (!isGrupos || !eqOnly) { helper.innerHTML = ''; helper.style.display = 'none'; return; }
    var lateVal = (document.getElementById('late-enrollment') || {}).value || 'closed';
    helper.style.display = 'block';
    if (lateVal === 'expand') {
      helper.innerHTML = '<span style="color:#f59e0b;font-weight:600;">' + _t('create.lateEnrollGruposOverride') + '</span>';
    } else {
      helper.innerHTML = 'Ninguém é desativado — todos entram no sorteio. Os que sobram pra igualar os grupos ficam como <strong>suplentes</strong> (lista de espera) e entram por substituição.';
    }
  };
  window._renderGruposSuggestions = function () {
    if (window._updateGruposEqualHelper) window._updateGruposEqualHelper();
    var box = document.getElementById('grupos-suggestions'); if (!box) return;
    var info = window._gruposComputeCands();
    window._gruposCands = info.cands;
    if (!info.units || info.units < 4) {
      box.innerHTML = '<div style="font-size:0.74rem;color:var(--text-muted);">Defina o <strong>Máx. Participantes</strong> (ou aguarde inscritos) pra dividir os grupos.</div>';
      return;
    }
    if (!info.cands.length) {
      box.innerHTML = '<div style="font-size:0.74rem;color:var(--text-muted);">' + info.units + ' ' + info.unitLbl + ' — sem divisão em grupos de 3 a 6. Ajuste o nº de inscritos.</div>';
      return;
    }
    var gc = document.getElementById('grupos-count');
    var curG = gc ? parseInt(gc.value, 10) : NaN;
    var exact = -1;
    info.cands.forEach(function (c, i) { if (c.g === curG) exact = i; });
    var idx = exact >= 0 ? exact : Math.floor(info.cands.length / 2);
    var c = info.cands[idx];
    if (gc) gc.value = c.g;
    var sizeLbl = (c.minS === c.maxS) ? String(c.minS) : (c.minS + '–' + c.maxS);
    var h = '';
    h += '<div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:8px;">' + info.units + ' ' + info.unitLbl + ' — arraste pra dividir <span style="opacity:0.8;">(← mais grupos menores · menos grupos maiores →)</span>:</div>';
    h += '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px;">';
    h += '<div style="text-align:center;min-width:64px;"><div id="grupos-lbl-g" style="font-size:1.6rem;font-weight:800;color:#fbbf24;line-height:1;">' + c.g + '</div><div style="font-size:0.68rem;color:var(--text-muted);margin-top:2px;">grupos</div></div>';
    h += '<div style="text-align:center;min-width:64px;"><div id="grupos-lbl-p" style="font-size:1.6rem;font-weight:800;color:#fbbf24;line-height:1;">' + sizeLbl + '</div><div style="font-size:0.68rem;color:var(--text-muted);margin-top:2px;">por grupo</div></div>';
    h += '</div>';
    h += '<input type="range" id="grupos-slider" min="0" max="' + (info.cands.length - 1) + '" step="1" value="' + idx + '" oninput="window._onGruposSlider(this.value)" style="width:100%;accent-color:#f59e0b;margin:2px 0;">';
    h += '<div id="grupos-lbl-est" style="font-size:0.72rem;color:var(--text-muted);margin-top:4px;text-align:center;">' + window._gruposEstLine(c) + '</div>';
    box.innerHTML = h;
  };
  window._onGruposSlider = function (val) {
    var c = (window._gruposCands || [])[parseInt(val, 10)]; if (!c) return;
    var gc = document.getElementById('grupos-count'); if (gc) gc.value = c.g;
    var lg = document.getElementById('grupos-lbl-g'); if (lg) lg.textContent = c.g;
    var lp = document.getElementById('grupos-lbl-p'); if (lp) lp.textContent = (c.minS === c.maxS) ? String(c.minS) : (c.minS + '–' + c.maxS);
    var le = document.getElementById('grupos-lbl-est'); if (le) le.innerHTML = window._gruposEstLine(c);
    if (window._renderPhaseEstimate) { try { window._renderPhaseEstimate(); } catch (e) {} }
  };
  window._recalcDuration = function () {
    if (window._renderGruposSuggestions) { try { window._renderGruposSuggestions(); } catch (e) {} }
    if (window._renderPhaseEstimate) { try { window._renderPhaseEstimate(); } catch (e) {} }
    // v2.6.37: a escada de estimativa (_renderPhaseEstimate) é a ÚNICA estimativa.
    // O box de diagnóstico legado (capacidade/sugestões/"max feasible") mostrava
    // números absurdos derivados da janela de datas — desativado de vez.
    var _legBox = document.getElementById('duration-estimate-box');
    if (_legBox) _legBox.style.display = 'none';
    var _legInline = document.getElementById('duration-estimate-inline');
    if (_legInline) _legInline.textContent = '';
    return;
    const box = document.getElementById('duration-estimate-box');
    if (!box) return;

    const callTime = parseInt(document.getElementById('tourn-call-time').value) || 0;
    const warmup = parseInt(document.getElementById('tourn-warmup-time').value) || 0;
    const gameDur = parseInt(document.getElementById('tourn-game-duration').value) || 0;
    const courts = parseInt(document.getElementById('tourn-court-count').value) || 1;
    // No modo Vagas-por-sorteio o número de participantes vem de targetSlots
    // (em unidade de entidade). Converte pra pessoas via teamSize p/ o cálculo.
    const _elmDur = (document.getElementById('enrollment-limit-mode') || {}).value || 'cap';
    let maxParts = parseInt(document.getElementById('tourn-max-participants').value) || 0;
    if (_elmDur === 'draw') {
      const _slots = parseInt((document.getElementById('tourn-target-slots') || {}).value) || 0;
      const _tsDur = parseInt((document.getElementById('tourn-team-size') || {}).value) || 1;
      maxParts = _slots * _tsDur;
    }
    const fmt = document.getElementById('select-formato').value;
    const startDateStr = document.getElementById('tourn-start-date').value || '';
    const startTimeStr = document.getElementById('tourn-start-time').value || '';
    const endDateStr = document.getElementById('tourn-end-date').value || '';
    const endTimeStr = document.getElementById('tourn-end-time').value || '';
    const startStr = startTimeStr ? startDateStr + 'T' + startTimeStr : startDateStr;
    const endStr = endTimeStr ? endDateStr + 'T' + endTimeStr : endDateStr;

    const slotTime = callTime + warmup + gameDur; // total minutes per match slot

    // Helper to mirror the main duration text into the compact header badge.
    const _setInlineBadge = (html) => {
      const inline = document.getElementById('duration-estimate-inline');
      if (inline) inline.innerHTML = html || '—';
    };

    if (slotTime <= 0) { box.style.display = 'none'; _setInlineBadge('—'); return; }

    const n = maxParts || 0;

    // Helper: calculate match count for a given format key + participant count
    const _calcMatchesFor = (fmtKey, pCount) => {
      if (pCount < 2) return 0;
      if (fmtKey === 'elim_simples') return pCount - 1;
      if (fmtKey === 'elim_dupla') return (pCount - 1) * 2 + 1;
      if (fmtKey === 'suico') {
        const sr = parseInt(document.getElementById('suico-rounds').value) || 5;
        return sr * Math.floor(pCount / 2);
      }
      if (fmtKey === 'liga') return pCount * (pCount - 1) / 2;
      if (fmtKey === 'grupos_mata') {
        const groups = parseInt(document.getElementById('grupos-count').value) || 4;
        const classified = parseInt(document.getElementById('grupos-classified').value) || 2;
        const pg = Math.ceil(pCount / groups);
        const gm = groups * (pg * (pg - 1) / 2);
        const km = groups * classified > 0 ? groups * classified - 1 : 0;
        return gm + km;
      }
      return 0;
    };
    const _calcMatches = (pCount) => _calcMatchesFor(fmt, pCount);

    // Helper: for elimination, calc play-in matches needed to reach power of 2
    const _isPow2 = (v) => v > 0 && (v & (v - 1)) === 0;
    const _nextPow2 = (v) => { let p = 1; while (p < v) p *= 2; return p; };
    const _prevPow2 = (v) => { let p = 1; while (p * 2 <= v) p *= 2; return p; };

    const _elimDetail = (pCount) => {
      // Returns { totalMatches, playInMatches, mainMatches, playInParticipants, nextP2 }
      if (pCount < 2) return { totalMatches: 0, playInMatches: 0, mainMatches: 0, playInParticipants: 0, nextP2: 0 };
      if (_isPow2(pCount)) return { totalMatches: pCount - 1, playInMatches: 0, mainMatches: pCount - 1, playInParticipants: 0, nextP2: pCount };
      const next = _nextPow2(pCount);
      const playInNeeded = pCount - next / 2; // how many play-in matches to reduce to next/2
      // Actually: with N participants, next power = nextPow2(N). Excess = N - next/2.
      // PlayIn matches = excess (those excess players play to reduce field to next/2)
      // But that means 2*excess players participate in play-in, and excess winners join the rest
      // Wait — standard approach: excess = N - prevPow2(N). PlayIn = excess matches. 2*excess players play, excess advance.
      const prev = _prevPow2(pCount);
      const excess = pCount - prev; // number of play-in matches
      return {
        totalMatches: pCount - 1, // always N-1 for single elim
        playInMatches: excess,
        mainMatches: prev - 1,
        playInParticipants: excess * 2,
        nextP2: prev
      };
    };

    // Helper: calc time for a participant count considering play-in rounds
    const _calcTimeFor = (fmtKey, pCount) => {
      const matches = _calcMatchesFor(fmtKey, pCount);
      const rnds = Math.ceil(matches / courts);
      return rnds * slotTime;
    };

    // Helper: for elimination, calc time considering play-in as extra round(s)
    const _calcElimTimeDetailed = (pCount) => {
      const detail = _elimDetail(pCount);
      if (detail.playInMatches === 0) {
        const rnds = Math.ceil(detail.mainMatches / courts);
        return { total: rnds * slotTime, playInRounds: 0, mainRounds: rnds };
      }
      const playInRnds = Math.ceil(detail.playInMatches / courts);
      const mainRnds = Math.ceil(detail.mainMatches / courts);
      return { total: (playInRnds + mainRnds) * slotTime, playInRounds: playInRnds, mainRounds: mainRnds };
    };

    // Calculate available time
    let availableMin = 0;
    let hasTimeWindow = false;
    if (startStr && endStr) {
      const startDt = new Date(startStr);
      const endDt = new Date(endStr);
      availableMin = (endDt - startDt) / 60000;
      if (availableMin > 0) hasTimeWindow = true;
    }

    const warnEl = document.getElementById('duration-warning');
    const capEl = document.getElementById('capacity-warning');
    const sugEl = document.getElementById('suggestions-panel');
    warnEl.style.display = 'none';
    capEl.style.display = 'none';
    sugEl.style.display = 'none';
    sugEl.innerHTML = '';

    // Helper: format minutes to Xh Ymin
    const _fmtMin = (m) => {
      const h = Math.floor(m / 60); const mm = Math.round(m % 60);
      if (h > 0 && mm > 0) return h + 'h ' + mm + 'min';
      if (h > 0) return h + 'h';
      return mm + 'min';
    };

    // Helper: powers of 2 up to val (>= 4)
    const _nearPow2 = (val) => {
      const results = [];
      let p = 4;
      while (p <= 1024) {
        if (p <= val) results.push(p);
        p *= 2;
      }
      return results.slice(-3);
    };

    // Helper: calc max feasible for a given format key
    const _calcMaxForFmt = (fmtKey, totalSlots) => {
      if (totalSlots <= 0) return 0;
      if (fmtKey === 'elim_simples') return totalSlots + 1;
      if (fmtKey === 'elim_dupla') return Math.floor((totalSlots + 1) / 2);
      if (fmtKey === 'liga') return Math.floor((1 + Math.sqrt(1 + 8 * totalSlots)) / 2);
      if (fmtKey === 'suico') {
        const sr = parseInt(document.getElementById('suico-rounds').value) || 5;
        return Math.floor(totalSlots / sr) * 2;
      }
      if (fmtKey === 'grupos_mata') {
        const groups = parseInt(document.getElementById('grupos-count').value) || 4;
        const classified = parseInt(document.getElementById('grupos-classified').value) || 2;
        for (let test = totalSlots + 1; test >= 2; test--) {
          const pg = Math.ceil(test / groups);
          const gm = groups * (pg * (pg - 1) / 2);
          const km = groups * classified - 1;
          if (gm + km <= totalSlots) return test;
        }
        return 2;
      }
      return 0;
    };
    const _calcMaxFeasible = (totalSlots) => _calcMaxForFmt(fmt, totalSlots);

    // Helper: describe a participant option with match count + p2 info
    const _descOption = (fmtKey, pCount) => {
      const matches = _calcMatchesFor(fmtKey, pCount);
      const time = _calcTimeFor(fmtKey, pCount);
      let desc = '<strong>' + pCount + '</strong> inscritos → <strong>' + matches + ' jogos</strong> (~' + _fmtMin(time) + ')';
      if ((fmtKey === 'elim_simples' || fmtKey === 'elim_dupla') && !_isPow2(pCount) && pCount > 2) {
        const det = _elimDetail(pCount);
        desc += ' <span style="opacity:0.7;">[' + det.playInMatches + ' classificatória' + (det.playInMatches > 1 ? 's' : '') + ' + ' + det.mainMatches + ' chave principal]</span>';
      }
      return desc;
    };

    // Helper: for elimination, build power-of-2 options table within a slot budget
    const _buildP2Table = (maxSlots) => {
      const isElim = fmt === 'elim_simples' || fmt === 'elim_dupla';
      if (!isElim) return '';
      const pows = _nearPow2(_calcMaxFeasible(maxSlots));
      if (pows.length === 0) return '';
      let rows = pows.map(p => {
        const m = _calcMatchesFor(fmt, p);
        const t = _calcTimeFor(fmt, p);
        return '<div style="display:flex; justify-content:space-between; padding:2px 0; border-bottom:1px solid rgba(255,255,255,0.04);">' +
          '<span><strong>' + p + '</strong> ' + _t('create.enrollees') + '</span>' +
          '<span style="opacity:0.7;">' + _t('create.matchesTime', { matches: m, time: _fmtMin(t) }) + '</span></div>';
      }).join('');
      return '<div style="margin-top:4px; font-size:0.75rem;">' +
        '<div style="opacity:0.6; margin-bottom:2px;">' + _t('create.pow2TableHeader') + '</div>' + rows + '</div>';
    };

    // Helper: for non-p2, describe fastest resolution
    const _p2Resolution = (pCount) => {
      const isElim = fmt === 'elim_simples' || fmt === 'elim_dupla';
      if (!isElim || _isPow2(pCount) || pCount < 3) return '';
      const prev = _prevPow2(pCount);
      const next = _nextPow2(pCount);
      const excess = pCount - prev;
      const byes = next - pCount;

      // Option A: play-in to reduce to prev (excess matches)
      const playInTime = Math.ceil(excess / courts) * slotTime;
      // Option B: add BYEs to reach next (no extra matches, but bracket is next size)
      const matchesWithByes = (fmt === 'elim_simples') ? next - 1 : (next - 1) * 2 + 1;
      const matchesPlayIn = (fmt === 'elim_simples') ? pCount - 1 : (pCount - 1) * 2 + 1;
      const timeWithByes = Math.ceil(matchesWithByes / courts) * slotTime;
      const timePlayIn = _calcTimeFor(fmt, pCount);

      let html = '<div style="margin-top:6px; padding:6px 8px; background:rgba(245,158,11,0.08); border:1px solid rgba(245,158,11,0.15); border-radius:6px; font-size:0.75rem;">';
      html += '<div style="font-weight:600; color:#fbbf24; margin-bottom:4px;">' + _t('create.notPow2Title', { n: pCount }) + '</div>';

      // Play-in
      html += '<div style="display:flex; justify-content:space-between; padding:3px 0; border-bottom:1px solid rgba(255,255,255,0.04);">' +
        '<span>' + _t('create.playinRow', { excess: excess, players: excess * 2, prev: prev }) + '</span>' +
        '<span style="opacity:0.7;">' + _t('create.matchesTime', { matches: matchesPlayIn, time: _fmtMin(timePlayIn) }) + '</span></div>';

      // BYEs
      html += '<div style="display:flex; justify-content:space-between; padding:3px 0;">' +
        '<span>' + _t('create.byeRow', { byes: byes, s: byes > 1 ? 's' : '', next: next }) + '</span>' +
        '<span style="opacity:0.7;">' + _t('create.matchesTime', { matches: matchesWithByes, time: _fmtMin(timeWithByes) }) + '</span></div>';

      // Recommendation
      if (timePlayIn <= timeWithByes) {
        html += '<div style="margin-top:4px; color:#34d399;">' + _t('create.playinFaster', { time: _fmtMin(timeWithByes - timePlayIn) }) + '</div>';
      } else {
        html += '<div style="margin-top:4px; color:#34d399;">' + _t('create.byeFaster', { time: _fmtMin(timePlayIn - timeWithByes) }) + '</div>';
      }
      html += '</div>';
      return html;
    };

    // Helper: build a suggestion card html
    const _sugCard = (icon, title, body, btnText, btnAction) => {
      return '<div style="padding:8px 10px; background:rgba(99,102,241,0.08); border:1px solid rgba(99,102,241,0.2); border-radius:8px; font-size:0.8rem; color:var(--text-main);">' +
        '<div style="display:flex; align-items:flex-start; gap:8px;">' +
        '<span style="font-size:1rem; flex-shrink:0;">' + icon + '</span>' +
        '<div style="flex:1;">' +
        '<div style="font-weight:600; color:var(--text-bright); margin-bottom:2px;">' + title + '</div>' +
        '<div style="color:var(--text-muted); line-height:1.4;">' + body + '</div>' +
        (btnText ? '<button onclick="' + btnAction + '" style="margin-top:6px; padding:4px 12px; background:rgba(99,102,241,0.2); border:1px solid rgba(99,102,241,0.3); border-radius:6px; color:#818cf8; font-size:0.75rem; font-weight:600; cursor:pointer; transition:all 0.15s;">' + btnText + '</button>' : '') +
        '</div></div></div>';
    };

    // Case 1: No participant count but we have a time window → suggest max participants
    if (n < 2 && hasTimeWindow) {
      const maxSlots = Math.floor(availableMin / slotTime) * courts;
      const maxFeasible = _calcMaxFeasible(maxSlots);

      box.style.display = 'block';
      document.getElementById('duration-estimate-text').textContent = _t('create.minPerMatch', { n: slotTime });
      _setInlineBadge(_t('create.minPerMatch', { n: slotTime }));
      document.getElementById('duration-estimate-detail').innerHTML =
        courts + ' ' + _t('create.court') + (courts > 1 ? 's' : '') + ' | ' + _t('create.timeAvailable') + ': ' + _fmtMin(availableMin);

      if (maxFeasible > 1) {
        capEl.style.display = 'block';
        capEl.style.background = 'rgba(16,185,129,0.1)';
        capEl.style.borderColor = 'rgba(16,185,129,0.25)';
        capEl.style.color = '#34d399';
        const matchesMax = _calcMatchesFor(fmt, maxFeasible);
        let capHtml = _t('create.capWith', { time: _fmtMin(availableMin), courts: courts + ' ' + _t('create.court') + (courts > 1 ? 's' : ''), desc: _descOption(fmt, maxFeasible) });
        capHtml += _buildP2Table(maxSlots);
        capEl.innerHTML = capHtml;
      }
      return;
    }

    // Case 2: No participant count and no time window → just show slot info
    if (n < 2) {
      box.style.display = 'block';
      document.getElementById('duration-estimate-text').textContent = _t('create.minPerMatch', { n: slotTime });
      _setInlineBadge(_t('create.minPerMatch', { n: slotTime }));
      document.getElementById('duration-estimate-detail').innerHTML = _t('create.durationDetail', { call: callTime, warmup: warmup, game: gameDur });
      return;
    }

    // Case 3: Have participant count → full calculation
    const numMatches = _calcMatches(n);
    const isElimFmt = fmt === 'elim_simples' || fmt === 'elim_dupla';
    let totalMinutes, roundCount;

    if (isElimFmt && !_isPow2(n)) {
      const det = _calcElimTimeDetailed(n);
      totalMinutes = det.total;
      roundCount = det.playInRounds + det.mainRounds;
    } else {
      roundCount = Math.ceil(numMatches / courts);
      totalMinutes = roundCount * slotTime;
    }

    let durationText = _fmtMin(totalMinutes);

    box.style.display = 'block';
    let mainEstimate = durationText + ' · ' + numMatches + ' ' + _t('create.matchCount');
    if (isElimFmt && !_isPow2(n) && n > 2) {
      const det = _elimDetail(n);
      mainEstimate += ' <span style="font-size:0.85rem; opacity:0.7;">(' + det.playInMatches + ' ' + _t('create.qualifier') + (det.playInMatches > 1 ? 's' : '') + ' + ' + det.mainMatches + ' ' + _t('create.bracket') + ')</span>';
    }
    document.getElementById('duration-estimate-text').innerHTML = mainEstimate;
    _setInlineBadge(durationText + ' · ' + numMatches + ' ' + _t('create.matchCount'));
    document.getElementById('duration-estimate-detail').innerHTML =
      courts + ' ' + _t('create.court') + (courts > 1 ? 's' : '') + ' | ' +
      slotTime + _t('create.minSlot') + ' | ' +
      roundCount + ' ' + _t('create.round') + (roundCount > 1 ? 's' : '') + ' ' + _t('create.sequential');

    if (hasTimeWindow) {
      const maxSlots = Math.floor(availableMin / slotTime) * courts;
      const maxFeasible = _calcMaxFeasible(maxSlots);
      const usage = availableMin > 0 ? totalMinutes / availableMin : 0;

      // ---- OVERFLOW: exceeds time ----
      if (totalMinutes > availableMin) {
        const overMin = totalMinutes - availableMin;
        warnEl.style.display = 'block';
        warnEl.innerHTML = _t('create.overflowWarning', { time: _fmtMin(overMin) });

        capEl.style.display = 'block';
        capEl.style.background = 'rgba(239,68,68,0.1)';
        capEl.style.borderColor = 'rgba(239,68,68,0.25)';
        capEl.style.color = '#f87171';
        let capHtml = 'Com <strong>' + _fmtMin(availableMin) + '</strong> e <strong>' + courts +
          ' ' + _t('create.court') + (courts > 1 ? 's' : '') + '</strong>, ' + _t('create.capacityMax') + _descOption(fmt, maxFeasible) + '.';
        capEl.innerHTML = capHtml;

        // P2 resolution info
        if (isElimFmt && !_isPow2(n) && n > 2) {
          capEl.innerHTML += _p2Resolution(n);
        }

        // Build smart suggestions
        const suggestions = [];

        // Suggestion 1: Limit enrollments — with p2 options for elimination
        if (isElimFmt) {
          const pows = _nearPow2(maxFeasible);
          let limBody = '';
          if (pows.length > 0) {
            limBody = pows.map(p => _descOption(fmt, p)).join('<br>');
            const bestPow = pows[pows.length - 1];
            suggestions.push(_sugCard('🔒', _t('create.limitEnrollPow2'),
              limBody,
              _t('create.applyN', { n: bestPow }),
              'document.getElementById(\\\'tourn-max-participants\\\').value=' + bestPow + '; window._recalcDuration()'));
          }
          // Also show non-p2 max as option
          if (!_isPow2(maxFeasible) && maxFeasible > 2) {
            suggestions.push(_sugCard('🔒', _t('create.limitEnrollWith', { n: maxFeasible }),
              _descOption(fmt, maxFeasible) + _p2Resolution(maxFeasible),
              _t('create.applyN', { n: maxFeasible }),
              'document.getElementById(\\\'tourn-max-participants\\\').value=' + maxFeasible + '; window._recalcDuration()'));
          }
        } else {
          suggestions.push(_sugCard('🔒', _t('create.limitEnroll', { n: maxFeasible }),
            _descOption(fmt, maxFeasible),
            _t('create.applyN', { n: maxFeasible }),
            'document.getElementById(\\\'tourn-max-participants\\\').value=' + maxFeasible + '; window._recalcDuration()'));
        }

        // Suggestion 2: Extend time
        const extraNeeded = totalMinutes - availableMin;
        const newEndDt = new Date(new Date(endStr).getTime() + extraNeeded * 60000);
        const newEndHHMM = window._formatHHMM(newEndDt);
        const newEndDate = window._formatYYYYMMDD(newEndDt);
        const endDateEl = document.getElementById('tourn-end-date').value || '';
        const sameDay = newEndDate === endDateEl;
        const extLabel = sameDay ? _t('create.closeAt', { time: newEndHHMM }) : _t('create.extendUntil', { date: newEndDate.split('-').reverse().join('/'), time: newEndHHMM });
        suggestions.push(_sugCard('⏰', _t('create.extendTime'),
          _t('create.extendTimeBody', { time: _fmtMin(extraNeeded), desc: _descOption(fmt, n) + ' ' + _t('create.fitsInTime') }) + (sameDay ? '' : _t('create.spansMultipleDays')),
          extLabel,
          'document.getElementById(\\\'tourn-end-date\\\').value=\\\'' + newEndDate + '\\\'; document.getElementById(\\\'tourn-end-time\\\').value=\\\'' + newEndHHMM + '\\\'; window._recalcDuration()'));

        // Suggestion 3: Add extra day
        const extraDayMin = availableMin + 480;
        const slotsExtraDay = Math.floor(extraDayMin / slotTime) * courts;
        const maxExtraDay = _calcMaxFeasible(slotsExtraDay);
        if (maxExtraDay > maxFeasible) {
          suggestions.push(_sugCard('📅', _t('create.addExtraDay'),
            _t('create.extraDayBody', { desc: _descOption(fmt, Math.min(n, maxExtraDay)) }) + (n <= maxExtraDay ? _t('create.fitsSuffix') : _t('create.maxSuffix', { max: _descOption(fmt, maxExtraDay) })),
            _t('create.addDay'),
            'var d=document.getElementById(\\\'tourn-end-date\\\'); var dt=new Date(d.value); dt.setDate(dt.getDate()+1); d.value=dt.toISOString().split(\\\'T\\\')[0]; window._recalcDuration()'));
        }

        // Suggestion 4: Change format
        const fmtOptions = [
          { key: 'elim_simples', label: 'Eliminatórias Simples', optVal: 'elim_simples' },
          { key: 'suico', label: 'Suíço Clássico', optVal: 'suico' }
        ];
        fmtOptions.forEach(opt => {
          if (opt.key === fmt) return;
          const maxForAlt = _calcMaxForFmt(opt.key, maxSlots);
          if (maxForAlt > maxFeasible && maxForAlt >= n) {
            suggestions.push(_sugCard('🔄', _t('create.switchTo', { label: opt.label }),
              _descOption(opt.key, n) + _t('create.fitsTimeSuffix'),
              _t('create.changeFormat'),
              'document.getElementById(\\\'select-formato\\\').value=\\\'' + opt.optVal + '\\\'; window._onFormatoChange()'));
          }
        });

        if (suggestions.length > 0) {
          sugEl.style.display = 'flex';
          sugEl.innerHTML = '<div style="font-size:0.75rem; font-weight:600; color:#818cf8; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:2px;">' + _t('create.systemSuggestions') + '</div>' + suggestions.join('');
        }

      // ---- NEAR LIMIT: >75% usage ----
      } else if (usage > 0.75) {
        capEl.style.display = 'block';
        capEl.style.background = 'rgba(245,158,11,0.1)';
        capEl.style.borderColor = 'rgba(245,158,11,0.25)';
        capEl.style.color = '#fbbf24';
        const remaining = maxFeasible - n;
        let capHtml = _t('create.nearLimitCap', { pct: Math.round(usage * 100), n: remaining, max: _descOption(fmt, maxFeasible) });

        if (isElimFmt && !_isPow2(n) && n > 2) {
          capHtml += _p2Resolution(n);
        }
        capHtml += _buildP2Table(maxSlots);
        capEl.innerHTML = capHtml;

        // Light suggestions
        const suggestions = [];
        if (isElimFmt) {
          const pows = _nearPow2(maxFeasible);
          const bestPow = pows.length > 0 ? pows[pows.length - 1] : null;
          if (bestPow && bestPow >= n) {
            suggestions.push(_sugCard('🔒', _t('create.closeEnrollAt', { n: bestPow }),
              _descOption(fmt, bestPow) + ' — ' + _t('create.noExtraQualifiers'),
              _t('create.applyN', { n: bestPow }),
              'document.getElementById(\\\'tourn-max-participants\\\').value=' + bestPow + '; window._recalcDuration()'));
          }
        } else {
          suggestions.push(_sugCard('🔒', _t('create.closeEnrollAt', { n: maxFeasible }),
            _descOption(fmt, maxFeasible),
            _t('create.applyN', { n: maxFeasible }),
            'document.getElementById(\\\'tourn-max-participants\\\').value=' + maxFeasible + '; window._recalcDuration()'));
        }
        if (suggestions.length > 0) {
          sugEl.style.display = 'flex';
          sugEl.innerHTML = '<div style="font-size:0.75rem; font-weight:600; color:#818cf8; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:2px;">' + _t('create.systemSuggestions') + '</div>' + suggestions.join('');
        }

      // ---- OK: within limits ----
      } else {
        capEl.style.display = 'block';
        capEl.style.background = 'rgba(16,185,129,0.1)';
        capEl.style.borderColor = 'rgba(16,185,129,0.25)';
        capEl.style.color = '#34d399';
        let okHtml = _t('create.okCapacity', { desc: _descOption(fmt, maxFeasible), n: n });
        if (isElimFmt && !_isPow2(n) && n > 2) {
          okHtml += _p2Resolution(n);
        }
        capEl.innerHTML = okHtml;
      }
    } else if (isElimFmt && !_isPow2(n) && n > 2) {
      // No time window but show p2 resolution anyway
      capEl.style.display = 'block';
      capEl.style.background = 'rgba(245,158,11,0.08)';
      capEl.style.borderColor = 'rgba(245,158,11,0.2)';
      capEl.style.color = '#fbbf24';
      capEl.innerHTML = _p2Resolution(n);
    }
  };

  window.openEditTournamentModal = function (tId, skipNav) {
    const t = window._findTournamentById(tId);
    if (!t) return;

    // v1.6.2-beta: defensive reinit — modal may not exist if setupCreateTournamentModal
    // was skipped at boot (script load race on iOS). Sentry #7475975789 (count=2).
    if (!document.getElementById('modal-create-tournament') && typeof setupCreateTournamentModal === 'function') {
      setupCreateTournamentModal();
    }
    var _titleEl = document.getElementById('create-modal-title');
    if (!_titleEl) {
      window._warn('[openEditTournamentModal] create-modal-title not found — modal init failed');
      return;
    }
    _titleEl.innerText = _t('create.editTournament');
    document.getElementById('edit-tournament-id').value = tId;
    document.getElementById('tourn-name').value = t.name || '';
    // Match sport option even if stored value lacks emoji prefix (legacy data)
    const sportSelect = document.getElementById('select-sport');
    const sportVal = t.sport || 'Beach Tennis';
    const sportOpt = Array.from(sportSelect.options).find(o => o.value === sportVal || o.value.includes(sportVal) || sportVal.includes(o.text.replace(/^[^\w]*/, '').trim()));
    sportSelect.value = sportOpt ? sportOpt.value : sportSelect.options[sportSelect.options.length - 1].value;

    // Determine format value and draw mode from stored data
    let fmtValue = 'elim_simples';
    var drawModeVal = t.drawMode || 'sorteio';
    if (t.format === 'Liga') fmtValue = 'liga';
    else if (t.format === 'Suíço Clássico') fmtValue = 'suico';
    else if (t.format === 'Ranking') fmtValue = 'liga'; // Ranking unificado com Liga
    else if (t.format === 'Eliminatórias Simples') fmtValue = 'elim_simples';
    else if (t.format === 'Dupla Eliminatória') fmtValue = 'elim_dupla';
    else if (t.format === 'Fase de Grupos + Eliminatórias' && t.drawMode === 'rei_rainha') {
      // Modelo antigo do monarch standalone (pré-campanha kill-monarch-format): era
      // gravado como Grupos+Elim + drawMode rei_rainha. Mapear pra seleção standalone
      // (elim + 👑) — SEM isso, o form caía em grupos_mata, que esconde o botão 👑 e
      // auto-trocava pra Sorteio, stripando o monarch silenciosamente no save.
      fmtValue = 'elim_simples';
      drawModeVal = 'rei_rainha';
    }
    else if (t.format === 'Fase de Grupos + Eliminatórias') fmtValue = 'grupos_mata';
    // Liga draw mode
    if (fmtValue === 'liga' && t.ligaDrawMode === 'round_robin') {
      drawModeVal = 'round_robin';
    } else if (fmtValue === 'liga' && t.ligaRoundFormat === 'rei_rainha') {
      drawModeVal = 'rei_rainha';
    }
    document.getElementById('select-formato').value = fmtValue;
    document.getElementById('draw-mode').value = drawModeVal;
    // Monarch config
    if (drawModeVal === 'rei_rainha') {
      var _gbVal = (t.reiRainhaGroupsBy === 'ranking') ? 'ranking' : 'sorteio';
      var _gbBtn = document.querySelector('#monarch-groupsby-buttons .monarch-gb-btn[data-value="' + _gbVal + '"]');
      if (_gbBtn && window._selectMonarchGroupsBy) window._selectMonarchGroupsBy(_gbBtn);
    }
    // Sync draw mode buttons
    var dmBtns = document.querySelectorAll('#draw-mode-buttons .draw-mode-btn');
    dmBtns.forEach(function(b) {
      if (b.getAttribute('data-value') === drawModeVal) {
        b.classList.add('draw-mode-active');
        b.style.border = '2px solid #34d399'; b.style.background = 'rgba(16,185,129,0.15)'; b.style.color = '#34d399'; b.style.fontWeight = '600';
      } else {
        b.classList.remove('draw-mode-active');
        b.style.border = '2px solid rgba(255,255,255,0.18)'; b.style.background = 'rgba(255,255,255,0.06)'; b.style.color = 'var(--text-main)'; b.style.fontWeight = '600';
      }
    });
    var dmDescEl = document.getElementById('draw-mode-desc');
    if (dmDescEl && typeof _drawModeDescs !== 'undefined') dmDescEl.textContent = _drawModeDescs[drawModeVal] || '';
    // Sync formato buttons with loaded value (v2.6.66: categoria, não valor cru).
    var fmtBtns = document.querySelectorAll('#formato-buttons .formato-btn');
    var _loadCat = (fmtValue === 'liga' || fmtValue === 'suico') ? 'pontos'
                 : (fmtValue === 'grupos_mata') ? 'grupos' : 'elim';
    var _duplaTgl = document.getElementById('toggle-dupla-elim');
    if (_duplaTgl) _duplaTgl.checked = (fmtValue === 'elim_dupla');
    fmtBtns.forEach(function(b) {
      if (b.getAttribute('data-fmt') === _loadCat) {
        b.classList.add('formato-btn-active');
        b.style.border = '2px solid #3b82f6';
        b.style.background = 'rgba(59,130,246,0.15)';
        b.style.color = '#60a5fa';
        b.style.fontWeight = '600';
      } else {
        b.classList.remove('formato-btn-active');
        b.style.border = '2px solid rgba(255,255,255,0.18)';
        b.style.background = 'rgba(255,255,255,0.06)';
        b.style.color = 'var(--text-main)';
        b.style.fontWeight = '500';
      }
    });
    var fmtDescEl = document.getElementById('formato-desc');
    if (fmtDescEl && typeof _formatoDescs !== 'undefined') fmtDescEl.textContent = _formatoDescs[fmtValue] || '';
    // Sincroniza visibilidade das seções (inclui dupla-elim-row) com o formato carregado.
    if (typeof window._onFormatoChange === 'function') window._onFormatoChange();

    // Split stored datetime values (YYYY-MM-DD or YYYY-MM-DDTHH:MM) into date + time fields
    const _splitDT = (v) => {
      if (!v) return ['', ''];
      if (v.includes('T')) { const parts = v.split('T'); return [parts[0], parts[1].substring(0, 5)]; }
      return [v, ''];
    };
    const [regD, regT] = _splitDT(t.registrationLimit);
    const [startD, startT] = _splitDT(t.startDate);
    const [endD, endT] = _splitDT(t.endDate);
    document.getElementById('tourn-reg-date').value = regD;
    document.getElementById('tourn-reg-time').value = regT;
    document.getElementById('tourn-start-date').value = startD;
    document.getElementById('tourn-start-time').value = startT;
    document.getElementById('tourn-end-date').value = endD;
    document.getElementById('tourn-end-time').value = endT;
    var _enrollMode = t.enrollmentMode || 'individual';
    document.getElementById('select-inscricao').value = _enrollMode;
    // Sync enrollment mode toggles
    var _indivTgl = document.getElementById('enroll-toggle-individual');
    var _teamTgl = document.getElementById('enroll-toggle-team');
    if (_indivTgl && _teamTgl) {
      _indivTgl.checked = (_enrollMode === 'individual' || _enrollMode === 'misto');
      _teamTgl.checked = (_enrollMode === 'time' || _enrollMode === 'teams' || _enrollMode === 'misto');
      window._syncEnrollToggles();
    }
    // v2.2.46: restaura toggle de separação por origem (modo misto)
    var _mpTgl = document.getElementById('mixed-pairing-toggle');
    if (_mpTgl) {
      _mpTgl.checked = !!t.mixedPairingSeparated;
      if (typeof window._syncMixedPairing === 'function') window._syncMixedPairing();
    }
    // restaura toggle "participantes formam duplas"
    var _mpairTgl = document.getElementById('manual-pairing-toggle');
    if (_mpairTgl) {
      _mpairTgl.checked = (t.manualPairing === 'open');
      if (typeof window._syncManualPairing === 'function') window._syncManualPairing();
    }
    if (t.teamSize) document.getElementById('tourn-team-size').value = t.teamSize;

    // Restore game types (Simples/Duplas) via toggles
    var _gt = t.gameTypes || '';
    var _tgS = document.getElementById('game-toggle-simples');
    var _tgD = document.getElementById('game-toggle-duplas');
    if (_tgS && _tgD) {
      var hasSim = _gt.indexOf('simples') !== -1;
      var hasDup = _gt.indexOf('duplas') !== -1;
      // Fallback from legacy teamSize
      if (!hasSim && !hasDup) {
        hasDup = parseInt(t.teamSize) >= 2;
        hasSim = parseInt(t.teamSize) <= 1;
      }
      _tgS.checked = hasSim;
      _tgD.checked = hasDup;
      window._syncGameTypeToggles();
    }

    // Restore sport button
    var _sportBtns = document.querySelectorAll('#sport-buttons .sport-btn');
    _sportBtns.forEach(function(sb) {
      var sportText = sb.getAttribute('data-sport') || '';
      var sportCleanBtn = sportText.replace(/^[^\w\u00C0-\u024F]+/u, '').trim();
      if (sportCleanBtn === (t.sport || '').replace(/^[^\w\u00C0-\u024F]+/u, '').trim()) {
        sb.classList.add('sport-btn-active'); sb.style.border='2px solid #fbbf24'; sb.style.background='rgba(251,191,36,0.15)'; sb.style.color='#fbbf24';
      } else {
        sb.classList.remove('sport-btn-active'); sb.style.border='2px solid rgba(255,255,255,0.18)'; sb.style.background='rgba(255,255,255,0.06)'; sb.style.color='var(--text-main)';
      }
    });

    // Restore ranking type (v3.1.34: render CANÔNICA — seta hidden + re-renderiza botões).
    if (typeof window._setPhaseRankingType === 'function') window._setPhaseRankingType(0, (t.elimRankingType || t.rankingType || 'individual'));
    document.getElementById('tourn-max-participants').value = t.maxParticipants || '';
    document.getElementById('tourn-auto-close').checked = !!t.autoCloseOnFull;
    // Sorteio de Vagas (read defensivo: ausente ⇒ 'cap', idêntico ao legado)
    var _elmEdit = t.enrollmentLimitMode || 'cap';
    var _capT = document.getElementById('elm-toggle-cap');
    var _drawT = document.getElementById('elm-toggle-draw');
    if (_capT) _capT.checked = _elmEdit === 'cap';
    if (_drawT) _drawT.checked = _elmEdit === 'draw';
    var _slotsEl = document.getElementById('tourn-target-slots');
    if (_slotsEl) _slotsEl.value = t.targetSlots || '';
    var _cpEdit = t.callPolicy || 'present';
    var _cpPres = document.getElementById('cp-toggle-present');
    var _cpLock = document.getElementById('cp-toggle-locked');
    if (_cpPres) _cpPres.checked = _cpEdit === 'present';
    if (_cpLock) _cpLock.checked = _cpEdit === 'locked';
    if (typeof window._syncCallPolicy === 'function') window._syncCallPolicy();
    if (typeof window._syncEnrollLimitMode === 'function') window._syncEnrollLimitMode();
    window._setVisibility(t.isPublic !== false ? 'public' : 'private');
    // W.O. Scope — v2.6.61: render canônica (botões). Normaliza legado 'team' → 'time'.
    var _woScope = t.woScope || 'individual';
    if (_woScope === 'team') _woScope = 'time';
    if (typeof window._setPhaseWo === 'function') window._setPhaseWo(0, _woScope);
    // Late Enrollment (Fechadas + Novos Confrontos)
    var _lateEnroll = t.lateEnrollment || 'closed';
    // v1.3.x: "Novos Confrontos" é INDEPENDENTE de "Fechadas". Vem de t.newMatchups; compat: torneios
    // antigos só têm lateEnrollment ('expand' implicava Novos Confrontos ON).
    var _newMatch = (t.newMatchups != null) ? (t.newMatchups === true) : (_lateEnroll === 'expand');
    document.getElementById('late-enrollment').value = _lateEnroll;
    document.getElementById('late-toggle-closed').checked = _lateEnroll === 'closed';
    document.getElementById('late-toggle-expand').checked = _newMatch;
    var _nmEl0 = document.getElementById('new-matchups'); if (_nmEl0) _nmEl0.value = _newMatch ? 'true' : 'false';
    window._syncLateEnrollment();
    // Lançamento de Resultados — v2.6.62: render canônica. Grava no hidden + re-renderiza botões.
    var _reVal = t.resultEntry || 'organizer';
    var _reArr = Array.isArray(_reVal) ? _reVal : [_reVal];
    if (!_reArr.length) _reArr = ['organizer'];
    var _reHidden = document.getElementById('select-result-entry');
    if (_reHidden) _reHidden.value = _reArr.length === 1 ? _reArr[0] : JSON.stringify(_reArr);
    var _reBox = document.getElementById('phase-re-buttons-0');
    if (_reBox && typeof window._resultEntryButtonsHtml === 'function') _reBox.outerHTML = window._resultEntryButtonsHtml(0);

    // Venue / Courts / Time
    document.getElementById('tourn-venue').value = t.venue || '';
    document.getElementById('tourn-venue-lat').value = t.venueLat || '';
    document.getElementById('tourn-venue-lon').value = t.venueLon || '';
    document.getElementById('tourn-venue-address').value = t.venueAddress || '';
    document.getElementById('tourn-venue-place-id').value = t.venuePlaceId || '';
    document.getElementById('tourn-venue-photo-url').value = t.venuePhotoUrl || '';
    // Apply saved venue photo as background
    if (t.venuePhotoUrl) {
      setTimeout(function() { window._applyVenuePhoto(t.venuePhotoUrl); }, 50);
    }
    // v4.0.21: foto de fundo custom do torneio
    if (typeof window._applyCoverPhoto === 'function') {
      setTimeout(function() { window._applyCoverPhoto(t.coverPhotoData || ''); }, 50);
    }
    // Show venue map if lat/lon available
    if (t.venueLat && t.venueLon) {
      setTimeout(function() { window._initVenueCreateMap(parseFloat(t.venueLat), parseFloat(t.venueLon), t.venue || ''); }, 300);
    }
    // Restore logo shape/radius BEFORE applying logo (preview usa esses inputs)
    var _isCircle = (t.logoShape === 'circle');
    var _radVal = (t.logoRadius != null && t.logoRadius !== '') ? t.logoRadius : 14;
    if (typeof window._setLogoFormaFromRadius === 'function') window._setLogoFormaFromRadius(_radVal, _isCircle);
    // Restore logo
    document.getElementById('tourn-logo-data').value = t.logoData || '';
    if (t.logoData) {
      window._applyTournamentLogo(t.logoData);
    } else {
      window._clearTournamentLogo();
    }
    // Restore lock state
    window._logoLocked = !!t.logoLocked;
    document.getElementById('tourn-logo-locked').value = t.logoLocked ? '1' : '';
    var lockBtn = document.getElementById('btn-logo-lock');
    if (lockBtn) {
      lockBtn.textContent = window._logoLocked ? '🔒' : '🔓';
      lockBtn.style.border = window._logoLocked ? '1px solid rgba(251,191,36,0.4)' : '1px solid rgba(255,255,255,0.1)';
      lockBtn.style.background = window._logoLocked ? 'rgba(251,191,36,0.12)' : 'rgba(255,255,255,0.05)';
      lockBtn.style.color = window._logoLocked ? '#fbbf24' : 'var(--text-muted)';
    }
    const venueAccessStored = t.venueAccess || '';
    document.getElementById('tourn-venue-access').value = venueAccessStored;
    window._applyVenueAccessUI(venueAccessStored ? venueAccessStored.split(',') : []);
    // Show venue info with address and map link
    const infoEl = document.getElementById('venue-osm-info');
    if (infoEl && t.venue && t.venueLat && t.venueLon) {
      const mapsUrl = t.venuePlaceId
        ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(t.venue) + '&query_place_id=' + t.venuePlaceId
        : 'https://www.google.com/maps/search/?api=1&query=' + t.venueLat + ',' + t.venueLon;
      var addrText = t.venueAddress || t.venue;
      infoEl.style.display = 'flex';
      infoEl.innerHTML = '<span style="display:flex; flex-direction:column; gap:2px;">' +
        '<span style="font-weight:500; color:#e2e8f0;">📍 ' + (t.venue || '') + '</span>' +
        '<span style="color:#94a3b8; font-size:0.7rem;">' + addrText + '</span>' +
        '</span>' +
        ' &nbsp;<a href="' + mapsUrl + '" target="_blank" title="Ver no mapa" style="color:#818cf8; text-decoration:none; font-size:1.1rem; line-height:1; flex-shrink:0;">🗺️</a>';
    } else if (infoEl) {
      infoEl.style.display = 'none';
      infoEl.innerHTML = '';
    }
    document.getElementById('tourn-court-count').value = t.courtCount || 1;
    document.getElementById('tourn-court-names').value = t.courtNames ? t.courtNames.join(', ') : '';
    document.getElementById('tourn-call-time').value = t.callTime != null ? t.callTime : 5;
    document.getElementById('tourn-warmup-time').value = t.warmupTime != null ? t.warmupTime : 5;
    document.getElementById('tourn-game-duration').value = t.gameDuration || 30;
    window._onCourtCountChange();

    // GSM scoring config
    if (t.scoring) {
      document.getElementById('gsm-type').value = t.scoring.type || 'simple';
      document.getElementById('gsm-setsToWin').value = t.scoring.setsToWin || 1;
      document.getElementById('gsm-gamesPerSet').value = t.scoring.gamesPerSet || 6;
      document.getElementById('gsm-tiebreakEnabled').value = t.scoring.tiebreakEnabled || false;
      document.getElementById('gsm-tiebreakPoints').value = t.scoring.tiebreakPoints || 7;
      document.getElementById('gsm-tiebreakMargin').value = t.scoring.tiebreakMargin || 2;
      document.getElementById('gsm-tiebreakAt').value = t.scoring.tiebreakAt || '';
      document.getElementById('gsm-superTiebreak').value = t.scoring.superTiebreak || false;
      document.getElementById('gsm-superTiebreakPoints').value = t.scoring.superTiebreakPoints || 10;
      document.getElementById('gsm-countingType').value = t.scoring.countingType || 'numeric';
      document.getElementById('gsm-advantageRule').value = t.scoring.advantageRule || false;
      document.getElementById('gsm-fixedSet').value = t.scoring.fixedSet || false;
      document.getElementById('gsm-fixedSetGames').value = t.scoring.fixedSetGames || 6;
      // Update detailed summary display
      if (typeof window._updateGSMSummaryFromHidden === 'function') window._updateGSMSummaryFromHidden();
    }

    // Suíço
    if (t.swissRounds) document.getElementById('suico-rounds').value = t.swissRounds;
    // Suíço draw schedule
    if (t.drawFirstDate) document.getElementById('suico-first-draw-date').value = t.drawFirstDate;
    if (t.drawFirstTime) document.getElementById('suico-first-draw-time').value = t.drawFirstTime;
    if (t.drawIntervalDays) document.getElementById('suico-draw-interval').value = t.drawIntervalDays;
    if (t.drawManual) document.getElementById('suico-manual-draw').checked = t.drawManual;

    // Liga (unificado — carrega dados de Liga e antigo Ranking)
    // Backward compat: migrar campos ranking* → liga* se necessário
    var _nps = t.ligaNewPlayerScore || t.rankingNewPlayerScore;
    var _inact = t.ligaInactivity || t.rankingInactivity;
    var _inactX = t.ligaInactivityX || t.rankingInactivityX;
    var _season = t.ligaSeasonMonths || t.rankingSeasonMonths;

    // NPS: activate correct button
    if (_nps) {
      var _npsBtn = document.querySelector('#liga-nps-buttons .liga-nps-btn[data-value="' + _nps + '"]');
      if (_npsBtn) window._selectLigaNps(_npsBtn);
    }
    // Inactivity: activate correct button
    if (_inact) {
      var _inactBtn = document.querySelector('#liga-inact-buttons .liga-inact-btn[data-value="' + _inact + '"]');
      if (_inactBtn) window._selectLigaInact(_inactBtn);
    }
    if (_inactX) document.getElementById('liga-inactivity-x').value = _inactX;
    // v2.6.56: toggle "Inscrições abertas durante a temporada" removido — ligaOpenEnrollment
    // agora vem de "Inscrições durante a fase" (derivado no save).
    // v2.6.29: liga-playoff-toggle removido (fase final → construtor de fases).

    // v0.14.52: Temporada + Equilibrado toggles
    var _seasonLoad = document.getElementById('liga-season-toggle');
    if (_seasonLoad) _seasonLoad.checked = (t.temporada !== false);
    var _balLoad = document.getElementById('liga-balanced-toggle');
    if (_balLoad) _balLoad.checked = (t.equilibrado !== false);
    // v2.7.38: permitir auto-desativação (default true).
    var _adLoad = document.getElementById('liga-allow-self-deactivation');
    if (_adLoad) _adLoad.checked = (t.allowSelfDeactivation !== false);
    if (t.clusterSize) {
      var _clusterLoad = document.getElementById('liga-cluster-size');
      if (_clusterLoad) _clusterLoad.value = t.clusterSize;
    }
    if (t.balanceBy) {
      var _balBtn = document.querySelector('#liga-balance-buttons .liga-balance-btn[data-value="' + t.balanceBy + '"]');
      if (_balBtn) window._selectLigaBalance(_balBtn);
    }
    if (typeof window._onLigaBalancedToggle === 'function') window._onLigaBalancedToggle();

    // Agendamento (drawFirstDate/Time/IntervalDays/Manual): restaurado pelo format2 a partir
    // de t.fmt2 (_f2MountInEditForm) — os campos legados escondidos de Liga foram extirpados.
    // Liga round format (derive from drawMode, keep hidden field in sync)
    if (t.ligaRoundFormat) {
      var _rfEl = document.getElementById('liga-round-format');
      if (_rfEl) _rfEl.value = t.ligaRoundFormat;
    }
    // Restore round-robin mode and turno count
    if (t.ligaDrawMode === 'round_robin') {
      var _rrBtn = document.getElementById('btn-draw-mode-rr');
      if (_rrBtn) { _rrBtn.style.display = ''; window._selectDrawMode(_rrBtn); }
      var _turnosEl = document.getElementById('liga-turnos');
      if (_turnosEl && t.ligaTurnos) _turnosEl.value = t.ligaTurnos;
    }

    // Elim settings
    // elimThirdPlace is always true — no toggle needed
    var _ertEl = document.getElementById('elim-ranking-type'); if (_ertEl) _ertEl.value = t.elimRankingType || 'individual';

    // Grupos
    if (t.gruposCount) document.getElementById('grupos-count').value = t.gruposCount;
    if (t.gruposClassified) document.getElementById('grupos-classified').value = t.gruposClassified;
    var _eqEl = document.getElementById('grupos-equal-only'); if (_eqEl) _eqEl.checked = !!t.gruposEqualOnly;
    var _svEl = document.getElementById('grupos-seed-vip'); if (_svEl) _svEl.checked = !!t.gruposSeedVip; // v3.1.11
    var _scEl = document.getElementById('grupos-seed-category'); if (_scEl) _scEl.checked = !!t.gruposSeedCategory; // v3.1.12

    // v4.4.x (Camada 2): a estrutura de fases é restaurada pelo format2 a partir de t.fmt2
    // (_f2MountInEditForm lê tourn.fmt2). Aqui só populamos o nome custom da Fase 1 (espelho
    // top-level) pra que um re-save não apague o nome.
    var _p0 = (Array.isArray(t.phases) && t.phases[0]) ? t.phases[0] : {};
    window._phase1Name = _p0.name || t.phase1Name || '';
    var _p1NameInput = document.getElementById('phase1-name');
    if (_p1NameInput) _p1NameInput.value = window._phase1Name || '';

    // Restore tiebreaker order + excluded box (v2.2.47)
    {
      const tbList = document.getElementById('tiebreaker-list');
      const tbExcl = document.getElementById('tiebreaker-excluded-list');
      if (tbList && tbExcl) {
        // mapa de todos os <li> por chave (em qualquer um dos boxes)
        var _allTbItems = {};
        Array.prototype.slice.call(document.querySelectorAll('#tiebreaker-list li, #tiebreaker-excluded-list li')).forEach(function(li) {
          if (li.dataset.tb) _allTbItems[li.dataset.tb] = li;
        });
        // 1) ativos na ordem salva
        if (Array.isArray(t.tiebreakers)) {
          t.tiebreakers.forEach(function(tb) {
            var item = _allTbItems[tb];
            if (item) { tbList.appendChild(item); if (window._tbUpdateRowControls) window._tbUpdateRowControls(item); }
          });
        }
        // 2) excluídos salvos (se houver) pro box de não considerados
        if (Array.isArray(t.tiebreakersExcluded)) {
          t.tiebreakersExcluded.forEach(function(tb) {
            var item = _allTbItems[tb];
            if (item) { tbExcl.appendChild(item); if (window._tbUpdateRowControls) window._tbUpdateRowControls(item); }
          });
        }
        // 3) garante exclusividade idade (caso dados antigos tragam ambos ativos)
        if (tbList.querySelector('li[data-tb="antiguidade"]') && tbList.querySelector('li[data-tb="juventude"]') && window._tbNormalizeAge) {
          window._tbNormalizeAge('antiguidade');
        }
      }
    }

    // Restore Advanced Scoring config
    if (t.advancedScoring && t.advancedScoring.categories) {
      var _advEnEl = document.getElementById('adv-scoring-enabled');
      if (_advEnEl) {
        _advEnEl.checked = !!t.advancedScoring.enabled;
        window._onAdvScoringToggle();
      }
      // v2.3.12: restaura o toggle de placar ao vivo (default true)
      var _applyLiveLoad = document.getElementById('adv-apply-live');
      if (_applyLiveLoad) _applyLiveLoad.checked = (t.advancedScoring.applyLiveScoring !== false);
      // v2.3.13: reflete o estado do toggle mestre nos 2 toggles do Grupo B
      if (typeof window._onAdvApplyLiveToggle === 'function') window._onAdvApplyLiveToggle();
      Object.keys(t.advancedScoring.categories).forEach(function(key) {
        var row = document.querySelector('#adv-scoring-body .adv-row[data-adv-key="' + key + '"]');
        if (!row) return;
        var cfg = t.advancedScoring.categories[key] || {};
        var en = row.querySelector('.adv-enabled');
        var val = row.querySelector('.adv-value');
        if (en && typeof cfg.enabled === 'boolean') en.checked = cfg.enabled;
        if (val && typeof cfg.value === 'number') val.value = cfg.value;
      });
    }

    // v1.15.25: rigor da inscrição (default casual pra torneios antigos sem o campo)
    if (typeof window._setRigorFromValue === 'function') window._setRigorFromValue(t.rigor || 'casual');
    // v1.15.31: informações exigidas
    var _rr = t.rigorRequire || {};
    [['rigor-req-gender', _rr.gender], ['rigor-req-category', _rr.category], ['rigor-req-age', _rr.age], ['rigor-req-history', _rr.history]].forEach(function (p) {
      var el = document.getElementById(p[0]); if (el) el.checked = !!p[1];
    });

    // Categorias (gênero + habilidade + idade)
    if (t.genderCategories && t.genderCategories.length > 0) {
      document.getElementById('tourn-gender-categories').value = t.genderCategories.join(',');
      window._applyGenderCatUI(t.genderCategories);
    }
    if (t.skillCategories && t.skillCategories.length > 0) {
      // v1.2.1-beta: use new pills+custom loader
      if (typeof window._loadSkillCategoriesFromArray === 'function') {
        window._loadSkillCategoriesFromArray(t.skillCategories);
      } else {
        // fallback (shouldn't trigger — helper is defined in same file)
        document.getElementById('tourn-skill-categories').value = t.skillCategories.join(', ');
      }
    }
    // v1.2.0-beta: load age categories
    if (t.ageCategories && t.ageCategories.length > 0) {
      var _ageHidden = document.getElementById('tourn-age-categories');
      if (_ageHidden) _ageHidden.value = t.ageCategories.join(',');
      if (typeof window._applyAgeCatUI === 'function') window._applyAgeCatUI(t.ageCategories);
    }
    // v2.1.80: load custom categories
    if (typeof window._loadCustomCategoriesFromArray === 'function') {
      window._loadCustomCategoriesFromArray(t.customCategories || []);
    }
    window._updateCategoryPreview();

    window._onFormatoChange();
    window._onLigaInactivityChange();
    window._updateRegDateVisibility();
    window._recalcDuration();
    // v1.3.13-beta: navega pra rota #novo-torneio. Pre-population já rolou
    // acima — renderCreateTournamentPage move .modal pro view-container
    // preservando valores. Post-init (GSM, places, venue map) roda lá.
    // v4.4.17: skipNav=true quando a repopulação vem do próprio render (refresh
    // com #novo-torneio/<tId>) — evita re-navegar/loopar.
    if (!skipNav) {
      if (typeof window._navigateToCreateTournament === 'function') {
        window._navigateToCreateTournament(tId);
      } else {
        openModal('modal-create-tournament');
      }
    }
    if (typeof window._refreshTemplateBtn === 'function') window._refreshTemplateBtn();
  };

  // NOTE: btn-create-tournament não existe no HTML.
  // A criação é feita via btn-create-tournament-in-box (dashboard.js) → modal-quick-create → main.js.
  // Bloco de dead code removido em v0.2.4-alpha.

  // ── v2.4.11: Engine de reconciliação de edição — TROCA DE PONTUAÇÃO ──────────
  // Princípio do dono: editar config NUNCA bloqueia. Aceita, recalcula o derivado
  // e regrava como se sempre fosse assim, preservando o histórico (jogos jogados,
  // V/D, classificados). Antes de aplicar uma troca de pontuação num torneio que
  // já tem resultados, mostra "vai ficar assim" + Aplicar / Manter anterior.
  // (Standings já recalculam pontos ao vivo de m.winner — V/D/pontos preservados;
  // só o desempate por sets/games muda. Jogo sem sets contribui 0 nesses critérios,
  // sem corromper nem travar — verificado em bracket-logic _accumulateGSM.)
  window._scoringIsSets = function(s) { return !!(s && s.type && s.type !== 'simple'); };

  window._readScoringFromForm = function() {
    var g = function(id) { var e = document.getElementById(id); return e ? e.value : undefined; };
    if (g('gsm-type') === undefined) return null; // form de GSM não está no DOM
    return {
      type: g('gsm-type') || 'simple',
      setsToWin: parseInt(g('gsm-setsToWin')) || 1,
      gamesPerSet: parseInt(g('gsm-gamesPerSet')) || 6,
      tiebreakEnabled: g('gsm-tiebreakEnabled') === 'true',
      tiebreakPoints: parseInt(g('gsm-tiebreakPoints')) || 7,
      tiebreakMargin: parseInt(g('gsm-tiebreakMargin')) || 2,
      // regra do TB: 'g-1' (5-5→6-5) ou 'g' (6-6→7-6); vazio = default do esporte (_sportTiebreakAt)
      tiebreakAt: g('gsm-tiebreakAt') || undefined,
      superTiebreak: g('gsm-superTiebreak') === 'true',
      superTiebreakPoints: parseInt(g('gsm-superTiebreakPoints')) || 10,
      countingType: g('gsm-countingType') || 'numeric',
      advantageRule: g('gsm-advantageRule') === 'true',
      fixedSet: g('gsm-fixedSet') === 'true',
      fixedSetGames: parseInt(g('gsm-fixedSetGames')) || 6
    };
  };

  window._writeScoringToForm = function(s) {
    if (!s) return;
    var set = function(id, v) { var e = document.getElementById(id); if (e) e.value = String(v); };
    set('gsm-type', s.type || 'simple');
    set('gsm-setsToWin', s.setsToWin != null ? s.setsToWin : 1);
    set('gsm-gamesPerSet', s.gamesPerSet != null ? s.gamesPerSet : 6);
    set('gsm-tiebreakEnabled', s.tiebreakEnabled ? 'true' : 'false');
    set('gsm-tiebreakPoints', s.tiebreakPoints != null ? s.tiebreakPoints : 7);
    set('gsm-tiebreakMargin', s.tiebreakMargin != null ? s.tiebreakMargin : 2);
    set('gsm-superTiebreak', s.superTiebreak ? 'true' : 'false');
    set('gsm-superTiebreakPoints', s.superTiebreakPoints != null ? s.superTiebreakPoints : 10);
    set('gsm-countingType', s.countingType || 'numeric');
    set('gsm-advantageRule', s.advantageRule ? 'true' : 'false');
    set('gsm-fixedSet', s.fixedSet ? 'true' : 'false');
    set('gsm-fixedSetGames', s.fixedSetGames != null ? s.fixedSetGames : 6);
  };

  window._scoringMeaningfullyChanged = function(o, n) {
    o = o || {}; n = n || {};
    var keys = ['type','setsToWin','gamesPerSet','tiebreakEnabled','tiebreakPoints','tiebreakMargin','superTiebreak','superTiebreakPoints','countingType','advantageRule','fixedSet','fixedSetGames'];
    return keys.some(function(k) { return String(o[k] == null ? '' : o[k]) !== String(n[k] == null ? '' : n[k]); });
  };

  window._tournamentPlayedMatches = function(t) {
    var played = [];
    var scan = function(m) { if (m && m.winner && m.winner !== 'BYE' && !m.isBye && !m.isSitOut) played.push(m); };
    if (typeof window._collectAllMatches === 'function') {
      window._collectAllMatches(t).forEach(scan);
    } else {
      (t.matches || []).forEach(scan);
      (t.rounds || []).forEach(function(r) { (r.matches || []).forEach(scan); });
      (t.groups || []).forEach(function(g) { if (g && Array.isArray(g.matches)) g.matches.forEach(scan); });
    }
    return played;
  };

  window._scoringReconcileImpact = function(t, oldS, newS) {
    var played = window._tournamentPlayedMatches(t);
    var oldSets = window._scoringIsSets(oldS), newSets = window._scoringIsSets(newS);
    var noSetData = 0;
    if (newSets) {
      played.forEach(function(m) { if (!(Array.isArray(m.sets) && m.sets.length > 0)) noSetData++; });
    }
    return {
      playedCount: played.length,
      paradigm: (!oldSets && newSets) ? 'toSets' : (oldSets && !newSets ? 'toSimple' : 'same'),
      noSetDataCount: noSetData
    };
  };

  window._showScoringChangePreview = function(t, oldS, newS, impact, onApply, onRevert) {
    var modalId = 'modal-scoring-reconcile';
    var old = document.getElementById(modalId); if (old) old.remove();
    var esc = window._safeHtml || function(x){ return x; };
    var lines = '';
    lines += '<li style="margin-bottom:6px;"><b>Vencedores, vitórias/derrotas e pontos não mudam.</b> O histórico dos ' + impact.playedCount + ' jogo(s) já disputado(s) é preservado.</li>';
    lines += '<li style="margin-bottom:6px;">Os critérios de <b>desempate</b> (saldo de sets/games) são recalculados pela nova regra.</li>';
    if (impact.paradigm === 'toSets' && impact.noSetDataCount > 0) {
      lines += '<li style="margin-bottom:6px;color:#fbbf24;">⚠️ ' + impact.noSetDataCount + ' jogo(s) foram lançados como <b>placar simples</b> (sem sets). Eles continuam contando o resultado, mas <b>não entram</b> nos critérios de desempate por sets/games. Não dá pra convertê-los em sets — ficam como estão.</li>';
    }
    var html =
      '<div class="modal-overlay active" id="' + modalId + '" style="display:flex;align-items:center;justify-content:center;z-index:10045;">' +
      '<div class="modal" style="max-width:440px;width:92%;background:var(--bg-card,#1a2235);color:var(--text-main,#fff);border-radius:15px;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,0.45);box-sizing:border-box;">' +
        '<h2 style="margin:0 0 6px;font-size:1.12rem;">⚙️ Mudança no sistema de pontuação</h2>' +
        '<p style="margin:0 0 12px;opacity:0.82;font-size:0.9rem;">Vai ficar assim:</p>' +
        '<ul style="margin:0 0 16px;padding-left:1.1rem;font-size:0.88rem;line-height:1.5;">' + lines + '</ul>' +
        '<div style="display:flex;flex-direction:column;gap:9px;">' +
          '<button class="btn btn-primary" id="scoring-rec-apply" style="cursor:pointer;">Aplicar nova pontuação</button>' +
          '<button class="btn btn-outline" id="scoring-rec-revert" style="cursor:pointer;">Manter a pontuação anterior</button>' +
          '<button class="btn btn-ghost" id="scoring-rec-cancel" style="cursor:pointer;opacity:0.8;">Voltar a editar</button>' +
        '</div>' +
      '</div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
    var close = function() { var m = document.getElementById(modalId); if (m) m.remove(); };
    document.getElementById('scoring-rec-apply').addEventListener('click', function() { close(); onApply(); });
    document.getElementById('scoring-rec-revert').addEventListener('click', function() { close(); onRevert(); });
    document.getElementById('scoring-rec-cancel').addEventListener('click', function() { close(); });
  };

  // Retorna true se mostrou o preview (e o save deve abortar e esperar a decisão).
  window._maybeShowScoringReconcile = function(t) {
    if (!t) return false;
    var newS = window._readScoringFromForm();
    if (!newS) return false;
    var oldS = t.scoring || { type: 'simple' };
    if (!window._scoringMeaningfullyChanged(oldS, newS)) return false;
    var impact = window._scoringReconcileImpact(t, oldS, newS);
    if (impact.playedCount === 0) return false; // sem resultados → nada a preservar, aplica direto
    window._showScoringChangePreview(t, oldS, newS, impact,
      function onApply() { window._scoringReconcileConfirmed = true; window._saveTournamentClickHandler(); },
      function onRevert() { window._writeScoringToForm(oldS); window._scoringReconcileConfirmed = true; window._saveTournamentClickHandler(); }
    );
    return true;
  };

  // Helper: o torneio já foi sorteado? (usado por checks de compat, ex.: monarch legado).
  window._tournamentHasDraw = function(t) {
    return (Array.isArray(t.matches) && t.matches.length > 0) ||
           (Array.isArray(t.rounds) && t.rounds.length > 0) ||
           (Array.isArray(t.groups) && t.groups.length > 0) ||
           (Array.isArray(t.rodadas) && t.rodadas.length > 0);
  };

  // v4.4.56: _writeFormatToForm / _showFormatChangePreview / _maybeShowFormatReconcile
  // (o diálogo "🔀 Mudança de formato") REMOVIDOS — pedido do dono. A trava de fase do
  // format2 já garante que não há edição incompatível a reconciliar.

  // v1.4.20-beta: expose handler on window so _renderCreateTournamentHeader can
  // re-attach it after each host.innerHTML call (innerHTML destroys the old element
  // and its listener — the new btn-save-tournament needs a fresh attachment).
  window._saveTournamentClickHandler = function() {
      try {
        const editId = document.getElementById('edit-tournament-id').value;
        const name = document.getElementById('tourn-name').value.trim();
        if (!name) { showAlertDialog(window._t('create.nameRequired'), window._t('create.nameRequiredMsg'), null, { type: 'warning' }); return; }

        // Impede nome duplicado (ignora o próprio torneio em edição)
        const nomeDuplicado = window.AppStore.tournaments.some(function(t) {
          if (editId && String(t.id) === String(editId)) return false;
          return t.name && t.name.trim().toLowerCase() === name.toLowerCase();
        });
        if (nomeDuplicado) { showAlertDialog(window._t('create.nameDupe'), window._t('create.nameDupeMsg'), null, { type: 'warning' }); return; }

        // v2.4.11: reconciliação de pontuação. Se o organizador trocou o sistema
        // de pontuação num torneio que JÁ tem resultados, mostra "vai ficar assim"
        // + Aplicar/Manter anterior antes de gravar. O flag _scoringReconcileConfirmed
        // é setado pelos botões do preview, que re-invocam este handler. Consumido
        // (zerado) imediatamente pra não vazar pro próximo save.
        if (editId && window._scoringReconcileConfirmed !== true && typeof window._maybeShowScoringReconcile === 'function') {
          var _tForScoring = window.AppStore.tournaments.find(function(x) { return String(x.id) === String(editId); });
          if (_tForScoring && window._maybeShowScoringReconcile(_tForScoring)) return;
        }

        const formatValue = document.getElementById('select-formato').value;
        const drawModeValue = document.getElementById('draw-mode').value;
        const formatMap = {
          liga: 'Liga',
          suico: 'Suíço Clássico',
          elim_simples: 'Eliminatórias Simples',
          elim_dupla: 'Dupla Eliminatória',
          grupos_mata: 'Fase de Grupos + Eliminatórias'
        };
        // When draw mode is Rei/Rainha and format is compatible (eliminatórias
        // simples/dupla ou suíço), save as standalone Rei/Rainha format.
        // EXCLUSÕES (v0.17.75 — bug reportado pelo usuário 29-Abr-2026):
        //   - Liga: drawMode controla ligaRoundFormat (rei_rainha vs standard),
        //     mas o format permanece 'Liga'.
        //   - grupos_mata (Grupos + Eliminatórias): incompatível com Rei/Rainha
        //     conceitualmente — grupos têm round-robin, não rotação de parceiros.
        //     Antes, se o user mudasse format de Rei/Rainha pra Grupos+Elim
        //     SEM antes desabilitar drawMode='rei_rainha', o form auto-corrigia
        //     visualmente mas o save handler ainda gravava format='Rei/Rainha
        //     da Praia', criando torneio Grupos+Elim com matches Rei/Rainha
        //     (rotação de parceiros). Agora a save-handler é defensiva.
        var format;
        var monarchIncompatible = formatValue === 'liga' || formatValue === 'grupos_mata';
        var isMonarchStandalone = drawModeValue === 'rei_rainha' && !monarchIncompatible;
        if (isMonarchStandalone) {
          // Rei/Rainha NÃO é formato: é MODO de sorteio do PONTOS CORRIDOS (parceiro
          // rotativo, rodadas incrementais em t.rounds). Grava format='Liga' +
          // ligaRoundFormat='rei_rainha' (campanha project_kill_monarch_format_campaign;
          // antes gravava 'Fase de Grupos + Eliminatórias'). Torneio JÁ SORTEADO no modelo
          // antigo NÃO migra no save — mantém o format gravado (compat de leitura: o render
          // legado lê t.groups/t.matches) e evita o prompt de reconciliação de formato.
          format = 'Liga';
          if (editId && window.AppStore && Array.isArray(window.AppStore.tournaments)) {
            var _tMonOld = window.AppStore.tournaments.find(function(x) { return String(x.id) === String(editId); });
            if (_tMonOld && _tMonOld.format !== 'Liga' &&
                (typeof window._isMonarchFormat !== 'function' || window._isMonarchFormat(_tMonOld)) &&
                typeof window._tournamentHasDraw === 'function' && window._tournamentHasDraw(_tMonOld)) {
              format = _tMonOld.format; // sorteado no modelo antigo → não migra
            }
          }
        } else {
          format = formatMap[formatValue] || 'Eliminatórias Simples';
        }
        // true = monarch standalone gravando no modelo NOVO (Liga+rei_rainha) — liga os
        // campos mínimos de Liga abaixo e protege-os da limpeza de "não-Liga".
        var monarchAsLiga = isMonarchStandalone && format === 'Liga';

        // v4.4.56: reconciliação de FORMATO REMOVIDA (pedido do dono — "essa página eu nunca
        // pedi"). A trava de fase do format2 (classificatória trava ao sortear; eliminatória
        // editável até avançar) já impede edições incompatíveis: os controles incompatíveis
        // ficam travados/cinzas, então mexer na config da eliminatória antes de avançar é OK e
        // não há "mudança de formato" a reconciliar. A reconciliação de PONTUAÇÃO continua.
        window._scoringReconcileConfirmed = false;

        // Captura TODOS os valores do formulário antes de qualquer outra operação
        const sportRaw = document.getElementById('select-sport').value || '';
        const sportClean = sportRaw.replace(/^[^\w\u00C0-\u024F]+/u, '').trim();
        const startDateRaw = document.getElementById('tourn-start-date').value || '';
        const startTimeRaw = document.getElementById('tourn-start-time').value || '';
        const startDateVal = startTimeRaw ? startDateRaw + 'T' + startTimeRaw : startDateRaw;
        const endDateRaw = document.getElementById('tourn-end-date').value || '';
        const endTimeRaw = document.getElementById('tourn-end-time').value || '';
        const endDateVal = endTimeRaw ? endDateRaw + 'T' + endTimeRaw : endDateRaw;
        const regDateRaw = document.getElementById('tourn-reg-date').value || '';
        const regTimeRaw = document.getElementById('tourn-reg-time').value || '';
        const regDateVal = regTimeRaw ? regDateRaw + 'T' + regTimeRaw : regDateRaw;
        const enrollmentVal = document.getElementById('select-inscricao').value || 'individual';
        const teamSizeVal = parseInt(document.getElementById('tourn-team-size').value) || 1;
        const maxPartsVal = parseInt(document.getElementById('tourn-max-participants').value) || null;
        const autoCloseVal = document.getElementById('tourn-auto-close').checked;
        // Sorteio de Vagas: modelo de inscrição + vagas + chamada da fila
        const enrollLimitModeVal = (document.getElementById('enrollment-limit-mode') || {}).value || 'cap';
        const targetSlotsVal = parseInt((document.getElementById('tourn-target-slots') || {}).value) || null;
        const callPolicyVal = (document.getElementById('call-policy') || {}).value || 'present';
        const isDrawMode = enrollLimitModeVal === 'draw';
        var _reRaw = document.getElementById('select-result-entry').value || 'organizer';
        var resultEntryVal;
        try { resultEntryVal = JSON.parse(_reRaw); } catch(e) { resultEntryVal = _reRaw; }
        // Normalize single-element array to string for backward compat
        if (Array.isArray(resultEntryVal) && resultEntryVal.length === 1) resultEntryVal = resultEntryVal[0];
        const isPublicVal = document.getElementById('tourn-public').value === 'true';

        // Venue / Courts / Time
        const venueVal = document.getElementById('tourn-venue').value.trim();
        const venueAccessVal = document.getElementById('tourn-venue-access').value || '';
        const venueLatVal = document.getElementById('tourn-venue-lat').value || '';
        const venueLonVal = document.getElementById('tourn-venue-lon').value || '';
        const venueAddressVal = document.getElementById('tourn-venue-address').value || '';
        const venuePlaceIdVal = document.getElementById('tourn-venue-place-id').value || '';
        const venuePhotoUrlVal = document.getElementById('tourn-venue-photo-url').value || '';
        const coverPhotoDataVal = (document.getElementById('tourn-cover-data') || {}).value || '';
        const logoDataVal = document.getElementById('tourn-logo-data').value || '';
        const logoLockedVal = document.getElementById('tourn-logo-locked').value === '1';
        const logoShapeVal = (document.getElementById('tourn-logo-shape') || {}).value === 'circle' ? 'circle' : 'square';
        const logoRadiusVal = parseInt((document.getElementById('tourn-logo-radius') || {}).value, 10);
        const courtCountVal = parseInt(document.getElementById('tourn-court-count').value) || 1;
        const courtNamesRaw = document.getElementById('tourn-court-names').value.trim();
        const courtNamesVal = courtNamesRaw ? courtNamesRaw.split(',').map(c => c.trim()).filter(c => c) : [];
        const callTimeVal = parseInt(document.getElementById('tourn-call-time').value) || 0;
        const warmupTimeVal = parseInt(document.getElementById('tourn-warmup-time').value) || 0;
        const gameDurationVal = parseInt(document.getElementById('tourn-game-duration').value) || 30;

        // Validação de datas
        if (startDateRaw && endDateRaw) {
          const _startD = new Date(startDateVal);
          const _endD = new Date(endDateVal);
          if (_endD <= _startD) {
            showAlertDialog(window._t('create.datesInvalid'), window._t('create.datesInvalidMsg'), null, { type: 'warning' });
            return;
          }
        }
        // v2.1.21: Liga tem inscrições sempre abertas (temporada contínua) — o
        // prazo de inscrição NÃO se aplica. Não valida (e o campo fica oculto pra
        // Liga). Bug: ao trocar pra Liga, o prazo residual ainda era validado.
        if (regDateRaw && startDateRaw && format !== 'Liga') {
          const _regD = new Date(regDateVal);
          const _startD2 = new Date(startDateVal);
          if (_regD >= _startD2) {
            showAlertDialog(window._t('create.deadlineInvalid'), window._t('create.deadlineInvalidMsg'), null, { type: 'warning' });
            return;
          }
        }

        const tourData = {
          name,
          isPublic: isPublicVal,
          format,
          sport: sportClean,
          startDate: startDateVal,
          endDate: endDateVal,
          // v2.1.21: Liga ignora prazo de inscrição (sempre aberta) — limpa o residual.
          registrationLimit: (format === 'Liga' ? '' : regDateVal),
          enrollmentMode: enrollmentVal,
          // v2.2.46: separar duplas formadas x sorteadas (só vale no modo misto)
          mixedPairingSeparated: enrollmentVal === 'misto' && (document.getElementById('mixed-pairing-separated') || {}).value === 'true',
          // Quem forma as duplas: 'organizer_only' (default) | 'open' (participantes também)
          manualPairing: (document.getElementById('manual-pairing') || {}).value === 'open' ? 'open' : 'organizer_only',
          teamSize: teamSizeVal,
          gameTypes: (document.getElementById('tourn-game-types') || {}).value || 'duplas',
          thirdPlace: true,
          // No modo Vagas-por-sorteio nunca há corrida: zera limite/auto-close
          // pra que os gatilhos de fechamento automático fiquem inertes.
          maxParticipants: isDrawMode ? null : maxPartsVal,
          autoCloseOnFull: isDrawMode ? false : autoCloseVal,
          enrollmentLimitMode: enrollLimitModeVal,
          targetSlots: isDrawMode ? targetSlotsVal : null,
          callPolicy: isDrawMode ? callPolicyVal : 'present',
          resultEntry: resultEntryVal,
          woScope: (document.getElementById('wo-scope') || {}).value || 'individual',
          lateEnrollment: (document.getElementById('late-enrollment') || {}).value || 'closed',
          newMatchups: ((document.getElementById('new-matchups') || {}).value === 'true'), // v1.3.x: independente de Abertas
          venue: venueVal,
          venueAccess: venueAccessVal,
          venueLat: venueLatVal,
          venueLon: venueLonVal,
          venueAddress: venueAddressVal,
          venuePlaceId: venuePlaceIdVal,
          venuePhotoUrl: venuePhotoUrlVal,
          coverPhotoData: coverPhotoDataVal,
          logoData: logoDataVal,
          logoLocked: logoLockedVal,
          logoShape: logoShapeVal,
          logoRadius: isNaN(logoRadiusVal) ? 14 : logoRadiusVal,
          courtCount: courtCountVal,
          courtNames: courtNamesVal,
          callTime: callTimeVal,
          warmupTime: warmupTimeVal,
          gameDuration: gameDurationVal,
          scoring: {
            type: document.getElementById('gsm-type').value || 'simple',
            setsToWin: parseInt(document.getElementById('gsm-setsToWin').value) || 1,
            gamesPerSet: parseInt(document.getElementById('gsm-gamesPerSet').value) || 6,
            tiebreakEnabled: document.getElementById('gsm-tiebreakEnabled').value === 'true',
            tiebreakPoints: parseInt(document.getElementById('gsm-tiebreakPoints').value) || 7,
            tiebreakMargin: parseInt(document.getElementById('gsm-tiebreakMargin').value) || 2,
            superTiebreak: document.getElementById('gsm-superTiebreak').value === 'true',
            superTiebreakPoints: parseInt(document.getElementById('gsm-superTiebreakPoints').value) || 10,
            countingType: document.getElementById('gsm-countingType').value || 'numeric',
            // Vantagem (deuce) = derivada do esporte (só Tênis), nunca escolha manual.
            advantageRule: (typeof window._gsmGetAdvantageForSport === 'function') ? window._gsmGetAdvantageForSport() : (document.getElementById('gsm-advantageRule').value === 'true'),
            fixedSet: document.getElementById('gsm-fixedSet').value === 'true',
            fixedSetGames: parseInt(document.getElementById('gsm-fixedSetGames').value) || 6
          },
          organizerEmail: window.AppStore.currentUser ? window.AppStore.currentUser.email : 'visitante@local',
          organizerName: window.AppStore.currentUser ? (window.AppStore.currentUser.displayName || window.AppStore.currentUser.email) : 'visitante',
          creatorEmail: window.AppStore.currentUser ? window.AppStore.currentUser.email : 'visitante@local',
          creatorUid: window.AppStore.currentUser ? window.AppStore.currentUser.uid : '',
          coHosts: []
        };

        // Suíço
        if (formatValue === 'suico') {
          tourData.swissRounds = parseInt(document.getElementById('suico-rounds').value) || 5;
          tourData.drawFirstDate = document.getElementById('suico-first-draw-date').value || '';
          tourData.drawFirstTime = document.getElementById('suico-first-draw-time').value || '19:00';
          tourData.drawIntervalDays = parseInt(document.getElementById('suico-draw-interval').value) || 7;
          tourData.drawManual = document.getElementById('suico-manual-draw').checked;
        }

        // Liga (unificado — inclui antigo Ranking)
        if (formatValue === 'liga') {
          // Novos toggles (v0.14.52): Temporada + Equilibrado
          var _seasonEl = document.getElementById('liga-season-toggle');
          var _balEl = document.getElementById('liga-balanced-toggle');
          tourData.temporada = _seasonEl ? !!_seasonEl.checked : true;
          tourData.equilibrado = _balEl ? !!_balEl.checked : true;
          var _clusterEl = document.getElementById('liga-cluster-size');
          tourData.clusterSize = _clusterEl ? (parseInt(_clusterEl.value) || 8) : 8;
          var _balByEl = document.getElementById('liga-balance-by');
          tourData.balanceBy = (_balByEl && _balByEl.value) ? _balByEl.value : 'individual';
          // Configurações
          tourData.ligaNewPlayerScore = document.getElementById('liga-new-player-score').value;
          tourData.ligaInactivity = document.getElementById('liga-inactivity').value;
          tourData.ligaInactivityX = parseInt(document.getElementById('liga-inactivity-x').value) || 3;
          // v2.7.38: permitir auto-desativação (default true). Off → controle some + todos ativos.
          // v3.0.x: se o toggle NÃO está no DOM (save de um contexto que não renderizou a
          // config), PRESERVA o valor já gravado em vez de resetar pra true — senão a
          // config "se perdia" num save parcial. Só usa o default true se for criação nova.
          var _adEl = document.getElementById('liga-allow-self-deactivation');
          if (_adEl) {
            tourData.allowSelfDeactivation = !!_adEl.checked;
          } else {
            var _adPrev = true;
            if (editId && window.AppStore && Array.isArray(window.AppStore.tournaments)) {
              var _adT = window.AppStore.tournaments.find(function (x) { return String(x.id) === String(editId); });
              if (_adT && _adT.allowSelfDeactivation === false) _adPrev = false;
            }
            tourData.allowSelfDeactivation = _adPrev;
          }
          // v2.6.56: derivado de "Inscrições durante a fase" (Fechadas → inscrição fechada;
          // Aberta → aberta). O toggle dedicado foi removido por ser redundante.
          var _lateForLiga = (document.getElementById('late-enrollment') || {}).value || 'closed';
          tourData.ligaOpenEnrollment = (_lateForLiga !== 'closed');
          // v2.6.29: Fase Final de temporada não é mais marcada na criação. Agora é
          // uma fase do construtor de fases adicionada em sequência à Liga. Não
          // escrevemos playoffEnabled aqui — preserva o valor existente em ligas legadas.
          // Agendamento (drawFirstDate/Time/IntervalDays/Manual): DERIVADO do format2 via
          // Object.assign(tourData, _f2out.topLevel) mais abaixo — não se lê mais os campos
          // legados escondidos de Liga (extirpados; o configurador único é o format2).
          tourData.ligaRoundFormat = document.getElementById('liga-round-format').value || 'standard';
          // Todos contra todos (round-robin) mode
          if (drawModeValue === 'round_robin') {
            tourData.ligaDrawMode = 'round_robin';
            tourData.ligaTurnos = parseInt(document.getElementById('liga-turnos').value) || 1;
            tourData.ligaRoundFormat = 'rei_rainha'; // uses same display/match format
          } else {
            tourData.ligaDrawMode = 'standard';
            tourData.ligaTurnos = null;
            // Invalidate pre-generated schedule when mode changes
            tourData.ligaRRSchedule = null;
          }
          // Limpeza de campos legados do formato Ranking (migrados para liga-*)
          tourData.rankingNewPlayerScore = null;
          tourData.rankingInactivity = null;
          tourData.rankingInactivityX = null;
          tourData.rankingSeasonMonths = null;
          tourData.rankingOpenEnrollment = null;
          tourData.ligaSeasonMonths = null;
        }

        // Limpar campos exclusivos de Liga quando o formato NÃO é Liga.
        // Sem isso, ao editar um torneio que já foi Liga e mudar o formato,
        // drawFirstDate/drawIntervalDays etc. ficam no Firestore e o display
        // mostra "1º Sorteio" e "Intervalo" em torneios que não são mais Liga.
        if (formatValue !== 'liga' && !monarchAsLiga) {
          tourData.drawFirstDate = null;
          tourData.drawFirstTime = null;
          tourData.drawIntervalDays = null;
          tourData.drawManual = null;
          tourData.ligaRoundFormat = null;
          tourData.ligaNewPlayerScore = null;
          tourData.ligaInactivity = null;
          tourData.ligaInactivityX = null;
          tourData.ligaOpenEnrollment = null;
          tourData.ligaSeasonMonths = null;
          tourData.temporada = null;
          tourData.equilibrado = null;
          tourData.clusterSize = null;
          tourData.balanceBy = null;
        }
        // Limpar campos exclusivos de Suíço quando não é Suíço
        if (formatValue !== 'suico') {
          tourData.swissRounds = null;
        }

        // Eliminatórias
        if (formatValue === 'elim_simples' || formatValue === 'elim_dupla' || formatValue === 'grupos_mata') {
          tourData.elimThirdPlace = true;
          tourData.elimRankingType = document.getElementById('elim-ranking-type').value;
        }

        // Fase de Grupos
        if (formatValue === 'grupos_mata') {
          tourData.gruposCount = parseInt(document.getElementById('grupos-count').value) || 4;
          tourData.gruposClassified = parseInt(document.getElementById('grupos-classified').value) || 2;
          tourData.gruposEqualOnly = !!(document.getElementById('grupos-equal-only') || {}).checked;
          tourData.gruposSeedVip = !!(document.getElementById('grupos-seed-vip') || {}).checked; // v3.1.11: cabeças de chave por VIP
          tourData.gruposSeedCategory = !!(document.getElementById('grupos-seed-category') || {}).checked; // v3.1.12: equilibrar por categoria
        }

        if (drawModeValue === 'rei_rainha' || drawModeValue === 'round_robin') {
          tourData.drawMode = 'rei_rainha'; // both use Rei/Rainha match format
          var _gbEl = document.getElementById('monarch-groupsby');
          tourData.reiRainhaGroupsBy = (_gbEl && _gbEl.value === 'ranking') ? 'ranking' : 'sorteio';
          // Liga: pontos corridos, sem fase eliminatória — não salvar classificados
          if (formatValue === 'liga') {
            tourData.ligaRoundFormat = 'rei_rainha';
            tourData.monarchAdvanceToElim = false;
          } else if (monarchAsLiga) {
            // Standalone (👑 com formato eliminatória no form): o torneio É Pontos Corridos
            // + modo rei/rainha, mas o form não renderizou os campos de Liga → config mínima
            // explícita: rodadas MANUAIS (Sortear + Rodada Extra; sem poller de auto-draw),
            // sem temporada. A Eliminatória entra pelo preset de 2 fases abaixo
            // (avanço via advanceMultiPhase — monarchAdvanceToElim legado fica false).
            tourData.ligaRoundFormat = 'rei_rainha';
            tourData.ligaDrawMode = 'standard';
            tourData.drawManual = true;
            tourData.drawFirstDate = null; tourData.drawFirstTime = null; tourData.drawIntervalDays = null;
            tourData.temporada = false;
            tourData.ligaOpenEnrollment = (((document.getElementById('late-enrollment') || {}).value || 'closed') !== 'closed');
            tourData.monarchAdvanceToElim = false;
          } else {
            tourData.monarchAdvanceToElim = true; // legado (write-only; avanço real é multi-fase)
          }
        } else {
          tourData.drawMode = 'sorteio';
        }

        // ── Formato via CONFIGURADOR ÚNICO (format2) ──
        // v4.4.x (Camada 2): o CONFIGURADOR ÚNICO (format2) é a FONTE ÚNICA de t.phases +
        // dos campos top-level de ESTRUTURA (format/drawMode/teamSize/grupos/liga/…). Está
        // sempre montado no form (_f2MountInEditForm no único ponto de render) → sempre
        // presente aqui. GSM, categorias, datas, W.O. e lançamento continuam do form (top-level).
        // SEM FALLBACK (decisão do dono): se a config não puder ser lida/compilada, ABORTA o
        // save (loud) — nada é gravado. É a garantia de que só o NOVO dirige.
        var _f2cfg = (typeof window._f2GetConfig === 'function') ? window._f2GetConfig() : null;
        if (!_f2cfg || !window.FORMAT2 || typeof window.FORMAT2.compileToPhases !== 'function') {
          if (typeof showNotification === 'function') showNotification('Formato não pôde ser lido', 'O configurador de formato não carregou. Recarregue a página — nada foi salvo.', 'error');
          if (window._warn) window._warn('[save] format2 indisponível (_f2GetConfig/FORMAT2 nulo) — save ABORTADO (sem fallback)');
          return;
        }
        try {
          var _f2sport = (typeof window._currentSportName === 'function' && window._currentSportName()) || tourData.sport;
          var _f2out = window.FORMAT2.compileToPhases(_f2cfg, { sport: _f2sport, resultEntry: tourData.resultEntry, lateEnrollment: tourData.lateEnrollment });
          Object.assign(tourData, _f2out.topLevel);
          tourData.phases = _f2out.phases;
          tourData.fmt2 = _f2cfg;
          tourData._allowConfigReset = true;
          if (tourData.format === 'Fase de Grupos') { tourData.ligaRoundFormat = 'standard'; tourData.ligaDrawMode = 'standard'; }
          if (window._log) window._log('[save] format2: ' + window.FORMAT2.summary(_f2cfg) + ' | phases=' + _f2out.phases.length);
        } catch (_f2e) {
          if (typeof showNotification === 'function') showNotification('Erro no formato', 'Não foi possível compilar o formato. Recarregue a página — nada foi salvo.', 'error');
          if (window._warn) window._warn('[save] format2 compile falhou: ' + _f2e);
          return; // sem fallback silencioso — aborta
        }
        // v2.6.49: nome custom da Fase 1 persiste SEMPRE. Gravado como espelho top-level
        // (as fases compiladas pelo format2 já trazem seus próprios nomes canônicos).
        var _p1NameAll = document.getElementById('phase1-name');
        tourData.phase1Name = (_p1NameAll && _p1NameAll.value.trim()) || '';

        // Tiebreakers (ordem configurada pelo organizador)
        const tbList = document.getElementById('tiebreaker-list');
        if (tbList) {
          tourData.tiebreakers = Array.from(tbList.querySelectorAll('li')).map(li => li.dataset.tb).filter(Boolean);
        }
        // v2.2.47: critérios movidos pra "não considerados" (inclui antiguidade/juventude por padrão)
        const tbExcl = document.getElementById('tiebreaker-excluded-list');
        if (tbExcl) {
          tourData.tiebreakersExcluded = Array.from(tbExcl.querySelectorAll('li')).map(li => li.dataset.tb).filter(Boolean);
        }

        // Sistema de Pontos Avançado: vale em qualquer CLASSIFICATÓRIA (tem tabela de pontos).
        // v4.4.59 (pedido do dono): antes só Liga/Suíço; agora também Fase de Grupos / Pontos
        // Corridos do format2 — o motor de classificação já aplica advancedScoring em qualquer
        // formato (bracket-logic). Gate pela config do format2 (classifAtiva), não pelo
        // #select-formato (que é legado/instável no fluxo format2). Sem classificatória
        // (eliminação direta) → sem pontos avançados.
        var _f2cForAdv = (typeof window._f2GetConfig === 'function') ? window._f2GetConfig() : null;
        var _advStandings = (formatValue === 'liga' || formatValue === 'suico') ||
                            (_f2cForAdv ? _f2cForAdv.classifAtiva === true : false);
        var _advEnabled = document.getElementById('adv-scoring-enabled');
        if (_advStandings && _advEnabled) {
          var _advCats = {};
          Array.from(document.querySelectorAll('#adv-scoring-body .adv-row')).forEach(function(row) {
            var key = row.dataset.advKey;
            if (!key) return;
            var en = row.querySelector('.adv-enabled');
            var val = row.querySelector('.adv-value');
            _advCats[key] = {
              enabled: !!(en && en.checked),
              value: val ? (parseInt(val.value, 10) || 0) : 0
            };
          });
          var _applyLiveEl = document.getElementById('adv-apply-live');
          tourData.advancedScoring = {
            enabled: !!_advEnabled.checked,
            categories: _advCats,
            // v2.3.12: default true (aplica); false = pontos de placar ao vivo não contam
            applyLiveScoring: _applyLiveEl ? !!_applyLiveEl.checked : true
          };
        } else {
          tourData.advancedScoring = null;
        }

        // Categorias (gênero + habilidade) — todos os formatos
        var catData = window._getCreateFormCategoryData ? window._getCreateFormCategoryData() : {};
        tourData.genderCategories = catData.genderCategories || [];
        tourData.skillCategories = catData.skillCategories || [];
        // v1.15.25: rigor da inscrição (casual/moderado/oficial) — política geral do torneio.
        var _rigorEl = document.getElementById('tourn-rigor');
        tourData.rigor = (_rigorEl && _rigorEl.value) || 'casual';
        // v1.15.31: informações exigidas dos inscritos (só valem fora do casual).
        var _rchk = function (id) { var e = document.getElementById(id); return !!(e && e.checked); };
        tourData.rigorRequire = { gender: _rchk('rigor-req-gender'), category: _rchk('rigor-req-category'), age: _rchk('rigor-req-age'), history: _rchk('rigor-req-history') };
        tourData.ageCategories = catData.ageCategories || []; // v1.2.0
        tourData.customCategories = catData.customCategories || []; // v2.1.80
        tourData.combinedCategories = catData.combinedCategories || [];

        if (editId) {
          const idx = window.AppStore.tournaments.findIndex(tour => tour.id.toString() === editId.toString());
          if (idx !== -1) {
            const t = window.AppStore.tournaments[idx];
            // Detect meaningful changes to notify participants
            var _changes = [];
            var _checkFields = {
              name: _t('create.fieldName'), startDate: _t('create.fieldStartDate'), endDate: _t('create.fieldEndDate'),
              venue: _t('create.fieldVenue'), format: _t('create.fieldFormat'), maxParticipants: _t('create.fieldMaxParts'),
              enrollmentMode: _t('create.fieldEnrollMode'), registrationLimit: _t('create.fieldRegLimit')
            };
            Object.keys(_checkFields).forEach(function(k) {
              if (tourData[k] !== undefined && String(tourData[k] || '') !== String(t[k] || '')) {
                _changes.push(_checkFields[k]);
              }
            });
            // Aplica cada campo explicitamente.
            // v2.3.79: NÃO sobrescrever co-organizadores nem a posse do torneio
            // na edição. tourData traz coHosts:[] (default de criação) e
            // creator/organizer derivados do currentUser — copiá-los apagava os
            // co-organizadores já cadastrados (bug reportado: "sumiram") e poderia
            // trocar o dono. Esses campos têm fluxo próprio (host-transfer.js).
            var _editPreserve = { coHosts: true, creatorUid: true, creatorEmail: true, organizerEmail: true, organizerName: true };
            Object.keys(tourData).forEach(k => { if (_editPreserve[k]) return; t[k] = tourData[k]; });
            // v3.1.62: bumpa o "Atualizado em" na EDIÇÃO. tourData não traz updatedAt,
            // então sem isto a edição salvava os campos mas o carimbo de atualização
            // ficava de uma ação anterior (parecia fuso errado, mas era valor velho).
            t.updatedAt = new Date().toISOString();
            window.AppStore.logAction(editId, `Regras atualizadas: formato ${format}, lançamento por ${resultEntryVal}`);
            // v2.1.67: se a data/hora/local mudou, sincroniza o "Planejar ida" do
            // próprio organizador (os demais participantes sincronizam ao abrir o
            // torneio). Só atualiza a própria presença — respeita as regras.
            try {
              var _cuEdit = window.AppStore && window.AppStore.currentUser;
              if (_cuEdit && _cuEdit.uid && typeof window._syncTournamentPresencePlan === 'function') window._syncTournamentPresencePlan(t, _cuEdit);
            } catch (_se) {}

            // Notify enrolled participants about changes
            if (_changes.length > 0 && window._notifyTournamentParticipants) {
              var changeMsg = 'O torneio "' + name + '" foi atualizado: ' + _changes.join(', ') + '.';
              window._notifyTournamentParticipants(t, {
                type: 'tournament_updated',
                message: changeMsg,
                level: 'important'
              }, t.organizerEmail);
            }
          }
          showNotification(window._t('create.tournamentUpdated'), '', 'success');
        } else {
          // Feature gate: limite de torneios no plano Free
          if (!window._canCreateTournament()) {
            // v1.0.59-beta: GA4 — sinal forte de monetização
            try {
              if (typeof window._trackFreeTierLimitHit === 'function') window._trackFreeTierLimitHit('tournaments_active');
            } catch (_e) {}
            window._showUpgradeModal('tournaments');
            return;
          }
          window.AppStore.addTournament(tourData);
          showNotification(window._t('create.tournamentCreated'), window._t('create.tournamentCreatedMsg', {name: name}), 'success');
          // v1.0.59-beta: GA4 — tournament_created
          try {
            if (typeof window._trackTournamentCreated === 'function') window._trackTournamentCreated(tourData);
          } catch (_e) {}
          // Trophy hook — tournament created milestone
          setTimeout(function() {
            try { if (typeof window._trophyOnTournamentCreated === 'function') window._trophyOnTournamentCreated(tourData); } catch(_te) {}
          }, 500);
        }

        // Persiste no localStorage
        window.AppStore.sync();

        // Auto-assign categories to uncategorized participants based on profile (gender, age, skill)
        var _autoAssignTid = editId || (window.AppStore.tournaments.length > 0 ? window.AppStore.tournaments[window.AppStore.tournaments.length - 1].id : null);
        if (_autoAssignTid && window._autoAssignCategories) {
          var _autoCount = window._autoAssignCategories(_autoAssignTid);
          if (_autoCount > 0) {
            showNotification(window._t('create.autoAssigned'), window._t('create.autoAssignedMsg', {n: _autoCount}), 'info');
          }
          // Also enrich via Firestore for participants missing profile data (fire-and-forget)
          if (window._autoAssignCategoriesAsync) {
            window._autoAssignCategoriesAsync(_autoAssignTid).then(function(n) {
              if (n > 0) showNotification(window._t('create.autoAssigned'), window._t('create.autoAssignedMsg', {n: n}), 'info');
            }).catch(function() {});
          }
        }

        // Notify friends about new tournament (only for new, not edit)
        if (!editId && typeof window._sendUserNotification === 'function') {
          var _cu = window.AppStore.currentUser;
          var _newTour = window.AppStore.tournaments[window.AppStore.tournaments.length - 1];
          if (_cu && _newTour && Array.isArray(_cu.friends) && _cu.friends.length > 0) {
            var _tFnCreate = window._t || function(k) { return k; };
            var _createMsg = _tFnCreate('notif.newTournamentByFriend').replace('{friend}', _cu.displayName || 'Um amigo').replace('{name}', _newTour.name || 'Torneio');
            // v0.17.8: dedup pra evitar duplicatas (email + uid pra mesma
            // pessoa) e self-notification (auto-amizade via bug histórico).
            var _ctFriends = (typeof window._dedupFriendsForNotify === 'function')
              ? window._dedupFriendsForNotify(_cu.friends, _cu.uid)
              : _cu.friends;
            _ctFriends.forEach(function(friendUid) {
              window._sendUserNotification(friendUid, {
                type: 'tournament_created',
                message: _createMsg,
                tournamentId: String(_newTour.id),
                tournamentName: _newTour.name || '',
                level: 'all'
              });
            });
          }
        }

        if (typeof window.updateViewModeVisibility === 'function') window.updateViewModeVisibility();
        // v1.3.13-beta: a navegação pra hash logo abaixo já tira o user da
        // rota #novo-torneio. closeModal continua sendo chamado pra cobrir
        // o caminho legacy (caso algum call-site ainda faça openModal).
        closeModal('modal-create-tournament');

        // Re-render: força atualização completa da view
        if (!editId) {
          const newId = window.AppStore.tournaments[window.AppStore.tournaments.length - 1].id;
          window.location.hash = `#tournaments/${newId}`;
        } else {
          // v1.6.5-beta: navega de volta ao card do torneio após edição
          window.location.hash = '#tournaments/' + editId;
        }
      } catch (err) {
        window._error('Erro ao salvar torneio:', err);
        showNotification(window._t('auth.error'), window._t('create.saveError', {msg: err.message}), 'error');
      }
  };
  const btnSave = document.getElementById('btn-save-tournament');
  if (btnSave) btnSave.addEventListener('click', window._saveTournamentClickHandler);
}

// ─── v2.1.33: datas/horários NUNCA são sugeridos — ficam em branco por padrão.
// Limpa os 6 campos de data/hora. Chamado ao abrir torneio NOVO e ao aplicar
// template (templates não carregam datas — são específicas de cada evento).
window._blankTournamentDates = function() {
  ['tourn-reg-date', 'tourn-reg-time', 'tourn-start-date', 'tourn-start-time', 'tourn-end-date', 'tourn-end-time'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.value = '';
  });
};

// ─── v2.1.32: Locais preferidos do organizador (1 clique no Criar Torneio) ──
// Se o usuário tem locais preferidos no perfil, mostra chips abaixo do campo de
// local — clicar preenche todos os campos do local de uma vez.
// v2.1.50: o container é SEMPRE renderizado no build do form (mesmo vazio); o
// conteúdo é preenchido por _hydrateVenuePrefChips() depois que o perfil carrega
// (preferredLocations pode chegar async → antes ficava vazio "pra sempre").
window._venuePrefChipsHtml = function() {
  return '<div id="venue-pref-chips" style="margin-bottom:8px;"></div>';
};
window._hydrateVenuePrefChips = function() {
  var box = document.getElementById('venue-pref-chips');
  if (!box) return;
  var cu = window.AppStore && window.AppStore.currentUser;
  var locs = (cu && Array.isArray(cu.preferredLocations)) ? cu.preferredLocations : [];
  if (!locs.length) { box.innerHTML = ''; return; }
  var _sh = window._safeHtml || function(s) { return String(s == null ? '' : s); };
  var chips = locs.map(function(loc, i) {
    var full = (loc && (loc.label || loc.name)) || ('Local ' + (i + 1));
    var nm = window._venueNameOnly(full); // v2.1.44: só o nome, sem endereço
    return '<button type="button" data-pref-chip="' + i + '" onclick="window._venuePickPreferred(' + i + ')" ' +
      'style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.25);color:#34d399;border-radius:999px;padding:5px 12px;font-size:0.76rem;font-weight:700;cursor:pointer;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis;box-sizing:border-box;">⭐ ' + _sh(nm) + '</button>';
  }).join('');
  box.innerHTML = '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;max-width:100%;overflow:hidden;">' +
    '<span style="font-size:0.72rem;color:var(--text-muted);flex-shrink:0;">Preferidos:</span>' + chips +
  '</div>';
};
// v2.1.44: extrai só o NOME do local (descarta o endereço após " — "/" - ").
window._venueNameOnly = function(label) {
  var s = String(label == null ? '' : label).trim();
  var m = s.split(/\s+[—–-]\s+/);
  return (m && m[0] ? m[0] : s).trim();
};
// v2.1.59: detecta label tipo "−23.6021, −46.7124" (coordenadas) — o usuário
// prefere nome/endereço, então esses são substituídos no backfill.
window._looksLikeCoordsLabel = function(label) {
  var s = String(label == null ? '' : label).trim();
  if (!s) return true; // vazio também é candidato a receber nome
  return /^-?\d{1,3}\.\d+\s*,\s*-?\d{1,3}\.\d+$/.test(s);
};
// v2.1.44: extrai o ENDEREÇO (parte após o separador), se houver.
window._venueAddrOnly = function(label) {
  var s = String(label == null ? '' : label).trim();
  var idx = s.search(/\s+[—–-]\s+/);
  return idx >= 0 ? s.slice(idx).replace(/^\s+[—–-]\s+/, '').trim() : '';
};
window._venuePickPreferred = function(idx) {
  var cu = window.AppStore && window.AppStore.currentUser;
  var locs = (cu && Array.isArray(cu.preferredLocations)) ? cu.preferredLocations : [];
  var loc = locs[idx];
  if (!loc) return;
  var full = loc.label || loc.name || '';
  var name = window._venueNameOnly(full);
  var addr = loc.address || window._venueAddrOnly(full) || '';
  var lon = (loc.lng != null) ? loc.lng : (loc.lon != null ? loc.lon : '');
  var _set = function(id, v) { var el = document.getElementById(id); if (el) el.value = (v == null ? '' : v); };
  _set('tourn-venue', name);              // só o nome no campo
  _set('tourn-venue-lat', loc.lat != null ? loc.lat : '');
  _set('tourn-venue-lon', lon);
  _set('tourn-venue-address', addr);
  _set('tourn-venue-place-id', loc.placeId || '');
  var vEl = document.getElementById('tourn-venue');
  if (vEl) vEl._lastSelectedVenue = name;
  // realça o chip escolhido
  var chips = document.querySelectorAll('[data-pref-chip]');
  Array.prototype.forEach.call(chips, function(c) {
    var on = c.getAttribute('data-pref-chip') === String(idx);
    c.style.background = on ? 'rgba(16,185,129,0.28)' : 'rgba(16,185,129,0.08)';
    c.style.borderColor = on ? '#34d399' : 'rgba(16,185,129,0.25)';
  });
  if (typeof showNotification === 'function') showNotification('📍 Local definido', name, 'success');
  // puxa quadras + acesso do cadastro (resolve por placeId OU nome) e, se o
  // preferido estava sem placeId, grava de volta no perfil (corrige o banco).
  if (typeof window._pullRegisteredVenueData === 'function') window._pullRegisteredVenueData(loc.placeId || '', name, idx);
};

// v2.1.59: cache único da lista de venues (1 read por abertura do form).
window._allVenuesCache = null;
window._loadAllVenuesOnce = async function() {
  if (Array.isArray(window._allVenuesCache)) return window._allVenuesCache;
  if (!window.VenueDB || typeof window.VenueDB.listVenues !== 'function') { window._allVenuesCache = []; return []; }
  try { window._allVenuesCache = (await window.VenueDB.listVenues({}, { limit: 1000 })) || []; }
  catch (e) { window._allVenuesCache = []; }
  return window._allVenuesCache;
};

// v2.1.59: resolve o DOC do venve cadastrado por placeId OU por NOME (sem usar
// coordenadas). Cobre o caso em que o preferido do perfil não tem placeId mas o
// local está cadastrado na plataforma sob o placeId do Google (ou custom:slug).
window._resolveRegisteredVenueDoc = async function(placeId, name) {
  if (!window.VenueDB || typeof window.VenueDB.loadVenue !== 'function') return null;
  try {
    // 1) chave por placeId
    if (placeId && typeof window.VenueDB.venueKey === 'function') {
      var v = await window.VenueDB.loadVenue(window.VenueDB.venueKey(placeId, name || ''));
      if (v) return v;
    }
    // 2) chave por nome-slug (custom:<slug>)
    if (name && typeof window.VenueDB.venueKey === 'function') {
      var k = window.VenueDB.venueKey('', name);
      if (k) { var v2 = await window.VenueDB.loadVenue(k); if (v2) return v2; }
    }
    // 3) varredura por NOME limpo: exato primeiro, depois "contém" (com guarda
    //    de tamanho ≥6 pra evitar match frouxo).
    var target = (window._cleanVenueName ? window._cleanVenueName(name || '') : String(name || '')).trim().toLowerCase();
    if (target) {
      var all = await window._loadAllVenuesOnce();
      var _cn = function(v) { return (window._cleanVenueName ? window._cleanVenueName(v.name || '') : String(v.name || '')).trim().toLowerCase(); };
      for (var i = 0; i < all.length; i++) { if (_cn(all[i]) === target) return all[i]; }
      if (target.length >= 6) {
        for (var j = 0; j < all.length; j++) {
          var cn = _cn(all[j]);
          if (cn && cn.length >= 6 && (cn.indexOf(target) !== -1 || target.indexOf(cn) !== -1)) return all[j];
        }
      }
    }
  } catch (e) {}
  return null;
};

// Persiste preferredLocations corrigidos no perfil (Firestore).
window._persistPreferredLocations = async function() {
  var cu = window.AppStore && window.AppStore.currentUser;
  if (!cu || !cu.uid || !window.FirestoreDB || !window.FirestoreDB.db) return;
  try {
    await window.FirestoreDB.db.collection('users').doc(cu.uid).update({ preferredLocations: cu.preferredLocations || [] });
  } catch (e) { window._warn && window._warn('[pref backfill] persist falhou:', e && e.message); }
};

// v2.1.59: se o local está cadastrado, puxa nº de quadras e acesso. Resolve por
// placeId OU nome. Se o preferido (prefIdx) estava sem placeId, grava o
// placeId/_id + endereço de volta no perfil — corrige o banco.
// v2.1.60: modalidade selecionada no form (sem o emoji do botão).
window._currentFormSport = function() {
  var active = document.querySelector('.sport-btn-active');
  var raw = active ? active.getAttribute('data-sport') : '';
  if (!raw) { var ss = document.getElementById('select-sport'); raw = (ss && ss.value) ? ss.value : ''; }
  return String(raw || '').replace(/^[^\wÀ-ɏ]+/u, '').trim();
};
// v2.1.62: nº de quadras do venve EXCLUSIVAMENTE da MODALIDADE escolhida.
// courts[] é um array de GRUPOS por modalidade, cada um com `count` (ex.: Beach
// Tennis=9, Tênis=14). Soma SÓ os grupos que incluem a modalidade. Se o local
// não oferece a modalidade, retorna 0 (NÃO usa total genérico — não se joga
// beach tennis em quadra de tênis).
window._venueCourtsForSport = function(v, sport) {
  var courts = Array.isArray(v && v.courts) ? v.courts : [];
  var sportLow = String(sport || '').trim().toLowerCase();
  if (!courts.length || !sportLow) return 0;
  var sumSport = 0;
  courts.forEach(function(c) {
    var sps = Array.isArray(c && c.sports) ? c.sports.map(function(s) { return String(s).trim().toLowerCase(); }) : [];
    if (sps.indexOf(sportLow) !== -1) { var cnt = parseInt(c && c.count, 10); sumSport += (isNaN(cnt) || cnt < 1) ? 1 : cnt; }
  });
  return sumSport;
};
// v2.1.62: re-puxa o nº de quadras (e reaplica acesso) do local atualmente
// selecionado no form, para a modalidade atual. Chamado ao trocar a modalidade.
window._refreshVenueCourtsForSport = async function() {
  var pidEl = document.getElementById('tourn-venue-place-id');
  var nameEl = document.getElementById('tourn-venue');
  var placeId = pidEl ? pidEl.value : '';
  var name = nameEl ? (nameEl._lastSelectedVenue || nameEl.value) : '';
  if (!placeId && !name) return;
  try {
    var v = await window._resolveRegisteredVenueDoc(placeId, name);
    if (!v) return;
    var sport = window._currentFormSport();
    var count = window._venueCourtsForSport(v, sport);
    var cc = document.getElementById('tourn-court-count');
    if (count > 0) {
      if (cc) { cc.value = count; if (window._onCourtCountChange) { try { window._onCourtCountChange(); } catch (e) {} } }
      if (typeof showNotification === 'function') showNotification('🏟️ ' + count + ' quadra(s) de ' + sport, 'No ' + (v.name || 'local') + '.', 'info');
    } else if (typeof showNotification === 'function') {
      showNotification('⚠️ Sem quadras de ' + sport, (v.name || 'Esse local') + ' não tem quadras dessa modalidade cadastradas — confira o nº de quadras.', 'warning');
    }
    // acesso não muda com a modalidade, mas reaplica pra garantir
    if (v.accessPolicy) {
      var arr = (v.accessPolicy === 'public') ? ['public'] : ['members'];
      var ae = document.getElementById('tourn-venue-access');
      if (ae) ae.value = arr.join(',');
      if (window._applyVenueAccessUI) { try { window._applyVenueAccessUI(arr); } catch (e) {} }
    }
  } catch (e) {}
};
window._pullRegisteredVenueData = async function(placeId, name, prefIdx) {
  try {
    var v = await window._resolveRegisteredVenueDoc(placeId, name);
    if (!v) return null;
    var count = window._venueCourtsForSport(v, window._currentFormSport());
    if (count > 0) {
      var ccEl = document.getElementById('tourn-court-count');
      if (ccEl) { ccEl.value = count; if (typeof window._onCourtCountChange === 'function') { try { window._onCourtCountChange(); } catch (e) {} } }
    }
    if (v.accessPolicy) {
      var arr = (v.accessPolicy === 'public') ? ['public'] : ['members'];
      var accessEl = document.getElementById('tourn-venue-access');
      if (accessEl) accessEl.value = arr.join(',');
      if (typeof window._applyVenueAccessUI === 'function') { try { window._applyVenueAccessUI(arr); } catch (e) {} }
    }
    if ((count > 0 || v.accessPolicy) && typeof showNotification === 'function') {
      showNotification('🏟️ Local cadastrado', (count > 0 ? count + ' quadra(s)' : '') + (v.accessPolicy ? (count > 0 ? ' · ' : '') + (v.accessPolicy === 'public' ? 'aberto' : 'restrito') : '') + ' — preenchido do cadastro.', 'info');
    }
    // backfill: grava placeId/_id + endereço no preferido que estava sem
    var realId = v.placeId || v._id || '';
    if (realId && (prefIdx != null) && !placeId) {
      var cu = window.AppStore && window.AppStore.currentUser;
      var loc = (cu && Array.isArray(cu.preferredLocations)) ? cu.preferredLocations[prefIdx] : null;
      if (loc && !loc.placeId) {
        loc.placeId = realId;
        if (v.address && !loc.address) loc.address = v.address;
        if (v.name && !loc.name) loc.name = v.name;
        if (v.name && window._looksLikeCoordsLabel(loc.label)) loc.label = v.name + (v.address ? ' — ' + v.address : '');
        var hid = document.getElementById('tourn-venue-place-id'); if (hid) hid.value = realId;
        await window._persistPreferredLocations();
      }
    }
    return v;
  } catch (e) { return null; }
};

// v2.1.59: percorre TODOS os preferidos do perfil; pra cada um sem placeId,
// resolve o venve cadastrado por nome e grava placeId/_id + endereço de volta
// (corrige o banco de uma vez). Roda ao abrir o form de criar/editar torneio.
window._backfillPreferredVenueIds = async function() {
  var cu = window.AppStore && window.AppStore.currentUser;
  if (!cu || !cu.uid || !Array.isArray(cu.preferredLocations) || !cu.preferredLocations.length) return;
  var changed = false;
  for (var i = 0; i < cu.preferredLocations.length; i++) {
    var loc = cu.preferredLocations[i];
    if (!loc || loc.placeId) continue; // já tem placeId
    var nm = window._venueNameOnly ? window._venueNameOnly(loc.label || loc.name || '') : (loc.name || loc.label || '');
    if (!nm) continue;
    var v = await window._resolveRegisteredVenueDoc('', nm);
    var realId = v && (v.placeId || v._id);
    if (realId) {
      loc.placeId = realId;
      if (v.address && !loc.address) loc.address = v.address;
      if (v.name && !loc.name) loc.name = v.name;
      if (v.name && window._looksLikeCoordsLabel(loc.label)) loc.label = v.name + (v.address ? ' — ' + v.address : '');
      changed = true;
    }
  }
  if (changed) {
    await window._persistPreferredLocations();
    if (typeof window._hydrateVenuePrefChips === 'function') window._hydrateVenuePrefChips();
  }
};

// ── GSM Config Modal and Functions ──
// ─── Preset-based scoring format system ───────────────────────────────────
// Presets define common match formats. Each preset maps to hidden field values.
window._gsmPresets = {
  'set1': { label: '1 Set', icon: '⚡', setsToWin: 1, gamesPerSet: 6, tiebreakEnabled: true, tiebreakPoints: 7, tiebreakMargin: 2, superTiebreak: false, superTiebreakPoints: 10, countingType: 'tennis', advantageRule: false, fixedSet: false },
  'best3': { label: 'Melhor de 3', icon: '🏆', setsToWin: 2, gamesPerSet: 6, tiebreakEnabled: true, tiebreakPoints: 7, tiebreakMargin: 2, superTiebreak: true, superTiebreakPoints: 10, countingType: 'tennis', advantageRule: false, fixedSet: false },
  'best5': { label: 'Melhor de 5', icon: '🎯', setsToWin: 3, gamesPerSet: 6, tiebreakEnabled: true, tiebreakPoints: 7, tiebreakMargin: 2, superTiebreak: true, superTiebreakPoints: 10, countingType: 'tennis', advantageRule: false, fixedSet: false },
  'custom': { label: 'Personalizado', icon: '⚙️', setsToWin: 1, gamesPerSet: 6, tiebreakEnabled: true, tiebreakPoints: 7, tiebreakMargin: 2, superTiebreak: false, superTiebreakPoints: 10, countingType: 'tennis', advantageRule: false, fixedSet: false }
};

// Build dynamic description from config values
window._gsmBuildPresetDesc = function(key, cfg) {
  if (key === 'custom') {
    // Read current hidden field values for live description
    var hS = document.getElementById('gsm-setsToWin');
    var hG = document.getElementById('gsm-gamesPerSet');
    var hTb = document.getElementById('gsm-tiebreakEnabled');
    var hTbP = document.getElementById('gsm-tiebreakPoints');
    var hStb = document.getElementById('gsm-superTiebreak');
    var hStbP = document.getElementById('gsm-superTiebreakPoints');
    if (hS && hG) {
      var cs = parseInt(hS.value) || 1, cg = parseInt(hG.value) || 6;
      var ctb = hTb && hTb.value === 'true', ctbP = parseInt(hTbP ? hTbP.value : 7) || 7;
      var cstb = hStb && hStb.value === 'true', cstbP = parseInt(hStbP ? hStbP.value : 10) || 10;
      // Only show dynamic desc if selected
      if (window._gsmSelectedPreset === 'custom') {
        return window._gsmBuildDescFromValues(cs, cg, ctb, ctbP, cstb, cstbP);
      }
    }
    return 'Configure manualmente';
  }
  return window._gsmBuildDescFromValues(cfg.setsToWin, cfg.gamesPerSet, cfg.tiebreakEnabled, cfg.tiebreakPoints, cfg.superTiebreak, cfg.superTiebreakPoints);
};

window._gsmBuildDescFromValues = function(s, g, tb, tbP, stb, stbP) {
  var tie = g - 1;
  if (s === 1) {
    return g + ' games' + (tb ? ' + TB' + tbP + ' em ' + tie + '-' + tie : '');
  }
  var totalSets = s * 2 - 1;
  var normalSets = totalSets - (stb ? 1 : 0);
  var parts = [normalSets + ' sets de ' + g + ' games'];
  if (stb) parts.push('Super TB ' + stbP + ' no ' + totalSets + '\u00BA set');
  else if (tb) parts.push('TB' + tbP + ' em ' + tie + '-' + tie);
  return parts.join(' + ');
};

// Which sports lock noAd (no advantage)
// DERIVADOS da fonte única window.SPORT_RULES: AD só onde advantageRule é true (Tênis);
// "no-ad travado" = todas as modalidades sem vantagem. Mude a regra em sport-rules.js.
window._gsmNoAdLocked = window._gsmNoAdLockedMap();
window._gsmAdvantageDefault = window._gsmAdvantageDefaultMap();

// Currently selected preset
window._gsmSelectedPreset = 'set1';

// Render preset buttons into #gsm-presets container
window._gsmRenderPresets = function() {
  var container = document.getElementById('gsm-presets');
  if (!container) return;
  var presets = window._gsmPresets;
  var selected = window._gsmSelectedPreset || 'set1';
  var html = '';
  Object.keys(presets).forEach(function(key) {
    var p = presets[key];
    var isActive = key === selected;
    html += '<button type="button" onclick="window._gsmSelectPreset(\'' + key + '\')" style="' +
      'display:flex;flex-direction:column;align-items:center;gap:4px;padding:12px 8px;border-radius:12px;cursor:pointer;transition:all 0.2s;' +
      'border:2px solid ' + (isActive ? 'rgba(168,85,247,0.7)' : 'rgba(255,255,255,0.1)') + ';' +
      'background:' + (isActive ? 'rgba(168,85,247,0.15)' : 'rgba(255,255,255,0.03)') + ';' +
      'box-shadow:' + (isActive ? '0 0 12px rgba(168,85,247,0.2)' : 'none') + ';' +
      '">' +
      '<span style="font-size:1.3rem;">' + p.icon + '</span>' +
      '<span style="font-size:0.78rem;font-weight:700;color:' + (isActive ? '#c084fc' : 'var(--text-bright)') + ';">' + p.label + '</span>' +
      '<span style="font-size:0.65rem;color:var(--text-muted);text-align:center;line-height:1.3;">' + window._gsmBuildPresetDesc(key, p) + '</span>' +
    '</button>';
  });
  container.innerHTML = html;
};

// Select a preset — apply its values to hidden fields
window._gsmSelectPreset = function(key) {
  var presets = window._gsmPresets;
  var p = presets[key];
  if (!p) return;
  window._gsmSelectedPreset = key;
  // Clear forced custom when user explicitly picks a named preset
  if (key !== 'custom') window._gsmForcedCustom = false;

  if (key !== 'custom') {
    // Apply preset values to hidden fields
    document.getElementById('gsm-type').value = 'sets';
    document.getElementById('gsm-setsToWin').value = String(p.setsToWin);
    document.getElementById('gsm-gamesPerSet').value = String(p.gamesPerSet);
    document.getElementById('gsm-tiebreakEnabled').value = p.tiebreakEnabled ? 'true' : 'false';
    document.getElementById('gsm-tiebreakPoints').value = String(p.tiebreakPoints);
    document.getElementById('gsm-tiebreakMargin').value = String(p.tiebreakMargin);
    document.getElementById('gsm-superTiebreak').value = p.superTiebreak ? 'true' : 'false';
    document.getElementById('gsm-superTiebreakPoints').value = String(p.superTiebreakPoints);
    document.getElementById('gsm-countingType').value = p.countingType;
    // Advantage: use sport-specific logic
    var advVal = window._gsmGetAdvantageForSport();
    document.getElementById('gsm-advantageRule').value = advVal ? 'true' : 'false';
    document.getElementById('gsm-fixedSet').value = 'false';
    document.getElementById('gsm-fixedSetGames').value = '6';
  }

  // Re-render presets to show selection
  window._gsmRenderPresets();
  // Update advantage section visibility
  window._gsmUpdateAdvantageUI();
  // Update summary
  window._gsmUpdateMainSummary();

  // If custom, open config overlay
  if (key === 'custom') {
    window._openGSMConfig();
  }
};

// Get advantage value based on current sport
window._gsmGetAdvantageForSport = function() {
  var sportEl = document.getElementById('select-sport');
  if (!sportEl) return false;
  var sport = sportEl.options[sportEl.selectedIndex] ? sportEl.options[sportEl.selectedIndex].text.replace(/^[^\w\u00C0-\u024F]+/u, '').trim() : '';
  // Vantagem (deuce 40-40) é DERIVADA DO ESPORTE — não é mais escolha manual.
  // Só o Tênis tem AD (window._gsmAdvantageDefault); esportes travados e todos os
  // demais = sem vantagem. (O "ganhar por 2" do vôlei/futevôlei é set-level, outra coisa.)
  if (window._gsmNoAdLocked[sport]) return false;
  return !!window._gsmAdvantageDefault[sport];
};

// Update advantage UI based on sport
window._gsmUpdateAdvantageUI = function() {
  // Vantagem (deuce 40-40) deixou de ser escolha manual \u2014 deriva do esporte (s\u00F3 T\u00EAnis).
  // A se\u00E7\u00E3o do toggle fica SEMPRE oculta; aqui s\u00F3 sincronizamos o campo oculto que o save l\u00EA.
  var section = document.getElementById('gsm-advantage-section');
  if (section) section.style.display = 'none';
  var hidden = document.getElementById('gsm-advantageRule');
  if (hidden) hidden.value = window._gsmGetAdvantageForSport() ? 'true' : 'false';
};

window._gsmAdvantageChanged = function() {
  window._gsmAdvantageUserSet = true;
  var toggle = document.getElementById('gsm-advantage-toggle');
  document.getElementById('gsm-advantageRule').value = toggle && toggle.checked ? 'true' : 'false';
  window._gsmUpdateMainSummary();
};

// Update the inline summary below presets
window._gsmUpdateMainSummary = function() {
  var summaryEl = document.getElementById('gsm-summary');
  if (!summaryEl) return;
  var s = parseInt(document.getElementById('gsm-setsToWin').value) || 1;
  var g = parseInt(document.getElementById('gsm-gamesPerSet').value) || 6;
  var tbOn = document.getElementById('gsm-tiebreakEnabled').value === 'true';
  var tbPts = document.getElementById('gsm-tiebreakPoints').value || '7';
  var stbOn = document.getElementById('gsm-superTiebreak').value === 'true';
  var stbPts = document.getElementById('gsm-superTiebreakPoints').value || '10';
  var counting = document.getElementById('gsm-countingType').value;
  var advOn = (typeof window._gsmGetAdvantageForSport === 'function') ? window._gsmGetAdvantageForSport() : (document.getElementById('gsm-advantageRule').value === 'true');
  var tbMargin = parseInt(document.getElementById('gsm-tiebreakMargin').value) || 2;
  var fsOn = document.getElementById('gsm-fixedSet').value === 'true';
  var fsGames = parseInt(document.getElementById('gsm-fixedSetGames').value) || 6;

  var lines = [];
  if (fsOn && counting !== 'numeric') {
    var half = Math.floor(fsGames / 2);
    var isEven = fsGames % 2 === 0;
    lines.push(isEven && tbOn ? _t('create.gsmFixedSetTb', { n: fsGames, pts: tbPts }) : _t('create.gsmFixedSet', { n: fsGames }));
  } else if (counting === 'numeric') {
    lines.push(_t('create.gsmPoints', { s: s, g: g }));
  } else {
    var tie = g - 1;
    if (s === 1) {
      lines.push(tbOn ? _t('create.gsm1SetTb', { g: g, pts: tbPts, tie: tie }) : _t('create.gsm1Set', { g: g }));
    } else {
      var totalSets = s * 2 - 1;
      lines.push(_t('create.gsmBestOf', { total: totalSets, s: s, g: g }));
      if (stbOn) lines.push(_t('create.gsmDeciderTb', { pts: stbPts }));
      else if (tbOn) lines.push(_t('create.gsmTb', { pts: tbPts, tie: tie }));
    }
    if (advOn) lines.push(_t('create.gsmAdvantage'));
  }

  summaryEl.style.display = lines.length > 0 ? 'block' : 'none';
  summaryEl.innerHTML = lines.join(' · ');
};

// Detect which preset matches current hidden field values
window._gsmDetectPreset = function() {
  // If user explicitly saved from Personalizado, keep it as custom
  if (window._gsmForcedCustom) return 'custom';
  var s = parseInt(document.getElementById('gsm-setsToWin').value) || 1;
  var g = parseInt(document.getElementById('gsm-gamesPerSet').value) || 6;
  var tbOn = document.getElementById('gsm-tiebreakEnabled').value === 'true';
  var tbPts = parseInt(document.getElementById('gsm-tiebreakPoints').value) || 7;
  var tbMargin = parseInt(document.getElementById('gsm-tiebreakMargin').value) || 2;
  var stb = document.getElementById('gsm-superTiebreak').value === 'true';
  var stbPts = parseInt(document.getElementById('gsm-superTiebreakPoints').value) || 10;
  var fs = document.getElementById('gsm-fixedSet').value === 'true';
  if (fs) return 'custom';
  var presets = window._gsmPresets;
  var keys = ['set1', 'best3', 'best5'];
  for (var i = 0; i < keys.length; i++) {
    var p = presets[keys[i]];
    if (p.setsToWin === s && p.gamesPerSet === g && p.tiebreakEnabled === tbOn &&
        p.tiebreakPoints === tbPts && p.tiebreakMargin === tbMargin &&
        p.superTiebreak === stb && p.superTiebreakPoints === stbPts) {
      return keys[i];
    }
  }
  return 'custom';
};

// Initialize presets on form load
window._gsmInitPresets = function() {
  window._gsmSelectedPreset = window._gsmDetectPreset();
  window._gsmRenderPresets();
  window._gsmUpdateAdvantageUI();
  window._gsmUpdateMainSummary();
};

// Legacy-compatible _openGSMConfig — now opens "Personalizado" overlay
window._openGSMConfig = function(targetPhase) {
  // v4.4.x (Camada 2): GSM por fase (construtor fase-2+) removido — o modal é sempre o
  // "Personalizado" global (Fase 1/torneio). targetPhase mantido só por compat de assinatura.
  window._gsmConfigTargetPhase = null;
  var _ps = null;
  // Read current values — dos campos globais (Fase 1/torneio).
  var setsToWin = _ps ? String(_ps.setsToWin) : document.getElementById('gsm-setsToWin').value;
  var gamesPerSet = _ps ? String(_ps.gamesPerSet) : document.getElementById('gsm-gamesPerSet').value;
  var tbEnabled = _ps ? !!_ps.tiebreakEnabled : document.getElementById('gsm-tiebreakEnabled').value === 'true';
  var tbPoints = _ps ? String(_ps.tiebreakPoints) : document.getElementById('gsm-tiebreakPoints').value;
  var tbMargin = _ps ? String(_ps.tiebreakMargin) : document.getElementById('gsm-tiebreakMargin').value;
  var stb = _ps ? !!_ps.superTiebreak : document.getElementById('gsm-superTiebreak').value === 'true';
  var stbPoints = _ps ? String(_ps.superTiebreakPoints) : document.getElementById('gsm-superTiebreakPoints').value;
  var counting = _ps ? (_ps.countingType || 'tennis') : document.getElementById('gsm-countingType').value;
  var advantage = _ps ? !!_ps.advantageRule : document.getElementById('gsm-advantageRule').value === 'true';
  var fixedSet = _ps ? !!_ps.fixedSet : document.getElementById('gsm-fixedSet').value === 'true';
  var fixedSetGames = _ps ? String(_ps.fixedSetGames || 6) : (document.getElementById('gsm-fixedSetGames').value || '6');
  // Regra do tie-break (5-5 vs 6-6): valor gravado no torneio (gsm-tiebreakAt) OU default do esporte.
  var _hTbAt = document.getElementById('gsm-tiebreakAt');
  var _sport = (typeof window._currentSportName === 'function') ? window._currentSportName() : '';
  var tbAt = (_hTbAt && _hTbAt.value) || ((typeof window._sportTiebreakAt === 'function') ? window._sportTiebreakAt(_sport) : 'g');
  var _gm1 = (parseInt(gamesPerSet) || 6) - 1, _gg = (parseInt(gamesPerSet) || 6);

  var existing = document.getElementById('gsm-config-overlay');
  if (existing) existing.remove();

  var overlay = document.createElement('div');
  overlay.id = 'gsm-config-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);backdrop-filter:blur(8px);z-index:100000;display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:2rem 1rem;';

  overlay.innerHTML = '<div style="background:var(--bg-card,#1e293b);width:94%;max-width:600px;border-radius:20px;border:1px solid rgba(168,85,247,0.25);box-shadow:0 20px 60px rgba(0,0,0,0.5);overflow:hidden;margin:auto 0;max-height:90%;display:flex;flex-direction:column;">' +
    '<div style="background:linear-gradient(135deg,#6d28d9 0%,#a855f7 100%);padding:1rem 1.5rem;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">' +
      '<h3 style="margin:0;color:#f5f3ff;font-size:1.1rem;font-weight:800;">⚙️ Personalizado</h3>' +
      '<div style="display:flex;gap:8px;">' +
        '<button type="button" onclick="window._gsmConfigTargetPhase=null;document.getElementById(\'gsm-config-overlay\').remove();" class="btn btn-sm" style="background:rgba(239,68,68,0.10);color:#ef4444;font-weight:700;border:1px solid rgba(239,68,68,0.45);">Cancelar</button>' +
        '<button type="button" onclick="window._gsmSaveConfig();" class="btn btn-sm" style="background:#fff;color:#6d28d9;font-weight:700;border:none;">Aplicar</button>' +
      '</div>' +
    '</div>' +
    '<div style="padding:1.25rem 1.5rem;display:flex;flex-direction:column;gap:1.2rem;overflow-y:auto;overflow-x:hidden;flex:1;-webkit-overflow-scrolling:touch;">' +
      // Sets/games
      '<div id="gsm-sets-config" style="display:flex;flex-direction:column;gap:1rem;background:rgba(168,85,247,0.06);border:1px solid rgba(168,85,247,0.12);border-radius:12px;padding:1rem;">' +
        '<div style="display:flex;gap:12px;flex-wrap:wrap;">' +
          '<div style="flex:1;min-width:120px;">' +
            '<label style="font-size:0.75rem;color:var(--text-muted);font-weight:600;display:block;margin-bottom:4px;">Sets para vencer</label>' +
            '<select id="gsm-cfg-setsToWin" class="form-control" style="font-size:0.85rem;" onchange="window._gsmUpdateSummary()">' +
              '<option value="1"' + (setsToWin==='1'?' selected':'') + '>1</option>' +
              '<option value="2"' + (setsToWin==='2'?' selected':'') + '>2</option>' +
              '<option value="3"' + (setsToWin==='3'?' selected':'') + '>3</option>' +
            '</select>' +
          '</div>' +
          '<div style="flex:1;min-width:120px;">' +
            '<label style="font-size:0.75rem;color:var(--text-muted);font-weight:600;display:block;margin-bottom:4px;">Games por set</label>' +
            '<input type="number" id="gsm-cfg-gamesPerSet" class="form-control" min="1" max="99" value="' + gamesPerSet + '" style="font-size:0.85rem;" oninput="window._gsmUpdateSummary()">' +
          '</div>' +
        '</div>' +
        // Fixed set toggle
        '<div class="toggle-row" style="padding:6px 0;">' +
          '<div class="toggle-row-label"><span style="font-size:0.82rem;">Games fixos</span><br><span id="gsm-fixedset-desc" style="font-size:0.68rem;color:var(--text-muted);">Disputa de ' + gamesPerSet + ' games fixos (quem vence mais ganha)</span></div>' +
          '<label class="toggle-switch toggle-sm"><input type="checkbox" id="gsm-cfg-fixedSet" ' + (fixedSet ? 'checked' : '') + ' onchange="window._gsmToggleFixedSet()"><span class="toggle-slider"></span></label>' +
        '</div>' +
        // Vantagem (deuce 40-40): NÃO é escolha manual — derivada do esporte (só Tênis). Sem toggle.
        // Tiebreak
        '<div id="gsm-tb-section" style="border-top:1px solid var(--border-color);padding-top:1rem;">' +
          '<div class="toggle-row" style="padding:6px 0;margin-bottom:8px;">' +
            '<div class="toggle-row-label"><span style="font-size:0.82rem;font-weight:600;" id="gsm-tb-label">Tie-break em ' + (tbAt === 'g-1' ? _gm1 : _gg) + '-' + (tbAt === 'g-1' ? _gm1 : _gg) + '</span></div>' +
            '<label class="toggle-switch toggle-sm"><input type="checkbox" id="gsm-cfg-tiebreak" ' + (tbEnabled ? 'checked' : '') + ' onchange="window._gsmToggleTiebreak()"><span class="toggle-slider"></span></label>' +
          '</div>' +
          '<div id="gsm-tb-details" style="display:' + (tbEnabled ? 'flex' : 'none') + ';gap:12px;flex-wrap:wrap;padding-left:26px;">' +
            '<div><label style="font-size:0.72rem;color:var(--text-muted);display:block;margin-bottom:3px;">Pontos</label><input type="number" id="gsm-cfg-tbPoints" class="form-control" min="5" max="15" value="' + tbPoints + '" style="font-size:0.82rem;width:70px;" oninput="window._gsmUpdateSummary()"></div>' +
            '<div><label style="font-size:0.72rem;color:var(--text-muted);display:block;margin-bottom:3px;">Diferenca min.</label><input type="number" id="gsm-cfg-tbMargin" class="form-control" min="1" max="5" value="' + tbMargin + '" style="font-size:0.82rem;width:70px;" oninput="window._gsmUpdateSummary()"></div>' +
            // Quando o tie-break acontece: em (g-1)-(g-1) [set curto, ex. 6-5] ou em g-g [padrão, ex. 7-6].
            '<div style="flex:1 1 100%;"><label style="font-size:0.72rem;color:var(--text-muted);display:block;margin-bottom:4px;">Tie-break no empate</label>' +
              '<div id="gsm-tbat-seg" data-tbat="' + tbAt + '" style="display:flex;gap:6px;">' +
                '<button type="button" id="gsm-tbat-g1" onclick="window._gsmSetTbAt(\'g-1\')" style="flex:1;padding:8px;border-radius:8px;font-size:0.8rem;font-weight:700;cursor:pointer;border:2px solid ' + (tbAt === 'g-1' ? '#a855f7' : 'rgba(255,255,255,0.12)') + ';background:' + (tbAt === 'g-1' ? 'rgba(168,85,247,0.18)' : 'transparent') + ';color:var(--text-bright,#f1f5f9);">' + _gm1 + '-' + _gm1 + ' <span style="font-size:0.66rem;color:var(--text-muted);">(set curto · ' + _gg + '-' + _gm1 + ')</span></button>' +
                '<button type="button" id="gsm-tbat-g" onclick="window._gsmSetTbAt(\'g\')" style="flex:1;padding:8px;border-radius:8px;font-size:0.8rem;font-weight:700;cursor:pointer;border:2px solid ' + (tbAt === 'g' ? '#a855f7' : 'rgba(255,255,255,0.12)') + ';background:' + (tbAt === 'g' ? 'rgba(168,85,247,0.18)' : 'transparent') + ';color:var(--text-bright,#f1f5f9);">' + _gg + '-' + _gg + ' <span style="font-size:0.66rem;color:var(--text-muted);">(padrão · ' + (_gg + 1) + '-' + _gg + ')</span></button>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        // Super tiebreak
        '<div id="gsm-super-tb-section" style="display:' + (parseInt(setsToWin) > 1 ? 'block' : 'none') + ';">' +
          '<div class="toggle-row" style="padding:6px 0;margin-bottom:8px;">' +
            '<div class="toggle-row-label"><span style="font-size:0.82rem;font-weight:600;">Super tie-break no set decisivo</span></div>' +
            '<label class="toggle-switch toggle-sm"><input type="checkbox" id="gsm-cfg-superTb" ' + (stb ? 'checked' : '') + ' onchange="window._gsmToggleSuperTb()"><span class="toggle-slider"></span></label>' +
          '</div>' +
          '<div id="gsm-stb-details" style="display:' + (stb ? 'flex' : 'none') + ';gap:12px;padding-left:26px;">' +
            '<div><label style="font-size:0.72rem;color:var(--text-muted);display:block;margin-bottom:3px;">Pontos</label><input type="number" id="gsm-cfg-stbPoints" class="form-control" min="7" max="21" value="' + stbPoints + '" style="font-size:0.82rem;width:70px;" oninput="window._gsmUpdateSummary()"></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      // Summary
      '<div id="gsm-summary-box" style="background:rgba(168,85,247,0.08);border:1px solid rgba(168,85,247,0.2);border-radius:10px;padding:12px 16px;">' +
        '<p style="margin:0;font-size:0.78rem;color:#c084fc;font-weight:600;margin-bottom:6px;">Resumo</p>' +
        '<div id="gsm-summary-text" style="font-size:0.85rem;color:var(--text-main);line-height:1.5;"></div>' +
      '</div>' +
    '</div>' +
  '</div>';

  document.body.appendChild(overlay);
  window._gsmUpdateSummary();
};

// Legacy: _gsmSetType always sets 'sets' now (simple/advanced toggle removed)
window._gsmSetType = function(type) {
  document.getElementById('gsm-type').value = 'sets';
  document.getElementById('gsm-sets-config').style.display = 'flex';
  window._gsmUpdateSummary();
};

window._gsmToggleFixedSet = function() {
  var checked = document.getElementById('gsm-cfg-fixedSet').checked;
  var gamesLabel = document.querySelector('label[for="gsm-cfg-gamesPerSet"]') || document.getElementById('gsm-cfg-gamesPerSet').previousElementSibling;
  if (gamesLabel) gamesLabel.textContent = checked ? 'Games por set (fixo)' : 'Games por set';
  // Update tiebreak label for fixed sets: empate at half-half
  var g = parseInt(document.getElementById('gsm-cfg-gamesPerSet').value) || 6;
  var tbLabel = document.getElementById('gsm-tb-label');
  if (tbLabel) {
    if (checked) {
      var half = Math.floor(g / 2);
      tbLabel.textContent = _t('create.tiebreakWhenTied', { n: half });
    } else {
      tbLabel.textContent = _t('create.tiebreakAt', { n: g - 1 });
    }
  }
  window._gsmUpdateSummary();
};

window._gsmToggleTiebreak = function() {
  var checked = document.getElementById('gsm-cfg-tiebreak').checked;
  document.getElementById('gsm-tb-details').style.display = checked ? 'flex' : 'none';
  window._gsmUpdateSummary();
};

// Regra do tie-break: 'g-1' (empate em (g-1)-(g-1) → set curto, ex. 6-5) ou 'g' (empate g-g,
// ex. 7-6). Grava no segmento (data-tbat), atualiza pills + label. _gsmSaveConfig lê e persiste.
window._gsmSetTbAt = function(v) {
  var seg = document.getElementById('gsm-tbat-seg'); if (!seg) return;
  seg.dataset.tbat = v;
  var g1 = document.getElementById('gsm-tbat-g1'), gg = document.getElementById('gsm-tbat-g');
  if (g1) { g1.style.borderColor = (v === 'g-1') ? '#a855f7' : 'rgba(255,255,255,0.12)'; g1.style.background = (v === 'g-1') ? 'rgba(168,85,247,0.18)' : 'transparent'; }
  if (gg) { gg.style.borderColor = (v === 'g') ? '#a855f7' : 'rgba(255,255,255,0.12)'; gg.style.background = (v === 'g') ? 'rgba(168,85,247,0.18)' : 'transparent'; }
  var _ge = document.getElementById('gsm-cfg-gamesPerSet') || document.getElementById('gsm-gamesPerSet');
  var g = (parseInt(_ge && _ge.value) || 6);
  var n = (v === 'g-1') ? (g - 1) : g;
  var lbl = document.getElementById('gsm-tb-label'); if (lbl) lbl.textContent = 'Tie-break em ' + n + '-' + n;
  if (typeof window._gsmUpdateSummary === 'function') window._gsmUpdateSummary();
};

window._gsmToggleSuperTb = function() {
  var checked = document.getElementById('gsm-cfg-superTb').checked;
  document.getElementById('gsm-stb-details').style.display = checked ? 'flex' : 'none';
  window._gsmUpdateSummary();
};

window._gsmUpdateSummary = function() {
  var type = document.getElementById('gsm-type').value;
  var el = document.getElementById('gsm-summary-text');
  if (!el) return;

  if (type === 'simple') {
    el.innerHTML = '<strong>Placar simples</strong> — cada partida decidida por placar direto (gols, pontos, etc.)';
    return;
  }

  var sets = parseInt(document.getElementById('gsm-cfg-setsToWin').value) || 1;
  var games = parseInt(document.getElementById('gsm-cfg-gamesPerSet').value) || 6;
  var tbOn = document.getElementById('gsm-cfg-tiebreak').checked;
  var tbPts = parseInt(document.getElementById('gsm-cfg-tbPoints').value) || 7;
  var tbMargin = parseInt(document.getElementById('gsm-cfg-tbMargin').value) || 2;
  var stbOn = document.getElementById('gsm-cfg-superTb') ? document.getElementById('gsm-cfg-superTb').checked : false;
  var stbPts = parseInt(document.getElementById('gsm-cfg-stbPoints').value) || 10;
  var counting = document.getElementById('gsm-countingType').value;
  var advOn = (typeof window._gsmGetAdvantageForSport === 'function') ? window._gsmGetAdvantageForSport() : false;

  // Show/hide super tiebreak section based on sets
  var stbSection = document.getElementById('gsm-super-tb-section');
  if (stbSection) stbSection.style.display = sets > 1 ? 'block' : 'none';

  // Check for fixed set mode — uses gamesPerSet as the fixed game count
  var fsOn = document.getElementById('gsm-cfg-fixedSet') ? document.getElementById('gsm-cfg-fixedSet').checked : false;
  var fsGames = fsOn ? games : (parseInt(document.getElementById('gsm-cfg-fixedSetGames') ? document.getElementById('gsm-cfg-fixedSetGames').value : 0) || 6);

  var lines = [];
  if (fsOn && counting === 'tennis') {
    var half = Math.floor(fsGames / 2);
    var isEven = fsGames % 2 === 0;
    lines.push(_t('create.gsmFixedSetTitle', { n: fsGames }));
    lines.push(_t('create.gsmFixedSetDesc', { n: fsGames }));
    if (isEven && tbOn) {
      lines.push(_t('create.gsmTieWithTb', { n: half, pts: tbPts, margin: tbMargin }));
    } else if (isEven && !tbOn) {
      lines.push(_t('create.gsmTieNoTb', { n: half }));
    }
    if (isEven && tbOn) {
      lines.push(_t('create.gsmResultsWithTb', { a: fsGames, b: fsGames - 1, c: fsGames - 2, n: half }));
    } else {
      lines.push(isEven ? _t('create.gsmResultsEven', { a: fsGames, b: fsGames - 1, c: fsGames - 2, n: half }) : _t('create.gsmResultsNoTb', { a: fsGames, b: fsGames - 1, c: fsGames - 2 }));
    }
  } else if (counting === 'numeric') {
    lines.push(_t('create.gsmNumericPts', { s: sets }));
    lines.push(_t('create.gsmNumericTime', { g: games }));
  } else {
    lines.push(_t('create.gsmSets', { s: sets, pl: sets > 1 ? 's' : '', g: games }));
    lines.push(advOn ? _t('create.gsmCountingAdv') : _t('create.gsmCounting'));
    if (tbOn) {
      var _tbTie = games - 1;
      var _tbDraw = tbPts - tbMargin;
      lines.push(_t('create.gsmTbDetail', { tie: _tbTie, pts: tbPts, draw: _tbDraw, margin: tbMargin }));
    }
    if (stbOn && sets > 1) {
      var _stbDraw = stbPts - tbMargin;
      lines.push(_t('create.gsmSuperTb', { pts: stbPts, draw: _stbDraw, margin: tbMargin }));
    }
  }

  // Show/hide super tiebreak section based on sets
  var stbSection = document.getElementById('gsm-super-tb-section');
  if (stbSection) stbSection.style.display = sets > 1 ? 'block' : 'none';

  // Update dynamic labels
  var fsDesc = document.getElementById('gsm-fixedset-desc');
  if (fsDesc) fsDesc.textContent = _t('create.fixedGamesDesc', { n: games });
  var tbLabel = document.getElementById('gsm-tb-label');
  if (tbLabel) {
    if (fsOn) {
      var _half = Math.floor(games / 2);
      tbLabel.textContent = _t('create.tiebreakWhenTied', { n: _half });
    } else {
      tbLabel.textContent = _t('create.tiebreakAt', { n: games - 1 });
    }
  }

  el.innerHTML = lines.join('<br>');
};

window._gsmSaveConfig = function() {
  // v4.4.x (Camada 2): GSM por fase removido — o modal grava sempre nos campos globais
  // (Fase 1/torneio). Sem branch de _gsmConfigTargetPhase.
  // Mark that user explicitly chose custom — preserved until a preset is clicked
  window._gsmForcedCustom = true;
  // Always save as type 'sets'
  document.getElementById('gsm-type').value = 'sets';
  document.getElementById('gsm-countingType').value = 'tennis';

  var sets = document.getElementById('gsm-cfg-setsToWin') ? document.getElementById('gsm-cfg-setsToWin').value : '1';
  var games = document.getElementById('gsm-cfg-gamesPerSet') ? document.getElementById('gsm-cfg-gamesPerSet').value : '6';
  var tbOn = document.getElementById('gsm-cfg-tiebreak') ? document.getElementById('gsm-cfg-tiebreak').checked : true;
  var tbPts = document.getElementById('gsm-cfg-tbPoints') ? document.getElementById('gsm-cfg-tbPoints').value : '7';
  var tbMargin = document.getElementById('gsm-cfg-tbMargin') ? document.getElementById('gsm-cfg-tbMargin').value : '2';
  var stbOn = document.getElementById('gsm-cfg-superTb') ? document.getElementById('gsm-cfg-superTb').checked : false;
  var stbPts = document.getElementById('gsm-cfg-stbPoints') ? document.getElementById('gsm-cfg-stbPoints').value : '10';
  var advantage = (typeof window._gsmGetAdvantageForSport === 'function') ? window._gsmGetAdvantageForSport() : false;

  document.getElementById('gsm-setsToWin').value = sets;
  document.getElementById('gsm-gamesPerSet').value = games;
  document.getElementById('gsm-tiebreakEnabled').value = tbOn ? 'true' : 'false';
  document.getElementById('gsm-tiebreakPoints').value = tbPts;
  document.getElementById('gsm-tiebreakMargin').value = tbMargin;
  var _seg = document.getElementById('gsm-tbat-seg');
  document.getElementById('gsm-tiebreakAt').value = (_seg && _seg.dataset.tbat) || '';
  document.getElementById('gsm-superTiebreak').value = stbOn ? 'true' : 'false';
  document.getElementById('gsm-superTiebreakPoints').value = stbPts;
  document.getElementById('gsm-advantageRule').value = advantage ? 'true' : 'false';
  var fsOn = document.getElementById('gsm-cfg-fixedSet') ? document.getElementById('gsm-cfg-fixedSet').checked : false;
  document.getElementById('gsm-fixedSet').value = fsOn ? 'true' : 'false';
  document.getElementById('gsm-fixedSetGames').value = fsOn ? games : '6';

  // Update detailed summary in main form
  if (typeof window._updateGSMSummaryFromHidden === 'function') window._updateGSMSummaryFromHidden();

  // Save to user preferences for this sport
  var sportEl = document.getElementById('select-sport');
  if (sportEl && window.AppStore && window.AppStore.currentUser) {
    var sport = sportEl.options[sportEl.selectedIndex] ? sportEl.options[sportEl.selectedIndex].text.replace(/^[^\w\u00C0-\u024F]+/u, '').trim() : '';
    try {
      var prefs = JSON.parse(localStorage.getItem('scoreplace_gsm_prefs') || '{}');
      prefs[sport] = {
        type: document.getElementById('gsm-type') ? document.getElementById('gsm-type').value : 'sets',
        setsToWin: document.getElementById('gsm-setsToWin').value,
        gamesPerSet: document.getElementById('gsm-gamesPerSet').value,
        tiebreakEnabled: document.getElementById('gsm-tiebreakEnabled').value,
        tiebreakPoints: document.getElementById('gsm-tiebreakPoints').value,
        tiebreakMargin: document.getElementById('gsm-tiebreakMargin').value,
        superTiebreak: document.getElementById('gsm-superTiebreak').value,
        superTiebreakPoints: document.getElementById('gsm-superTiebreakPoints').value,
        countingType: document.getElementById('gsm-countingType').value,
        advantageRule: ((typeof window._gsmGetAdvantageForSport === 'function') ? window._gsmGetAdvantageForSport() : (document.getElementById('gsm-advantageRule').value === 'true')) ? 'true' : 'false',
        fixedSet: document.getElementById('gsm-fixedSet').value,
        fixedSetGames: document.getElementById('gsm-fixedSetGames').value
      };
      localStorage.setItem('scoreplace_gsm_prefs', JSON.stringify(prefs));
    } catch(e) {}
  }

  // Close overlay
  var ov = document.getElementById('gsm-config-overlay');
  if (ov) ov.remove();

  // Refresh preset selection and summary
  window._gsmSelectedPreset = window._gsmDetectPreset ? window._gsmDetectPreset() : 'custom';
  if (typeof window._gsmRenderPresets === 'function') window._gsmRenderPresets();
  if (typeof window._gsmUpdateMainSummary === 'function') window._gsmUpdateMainSummary();

  if (typeof showNotification !== 'undefined') {
    showNotification(window._t('create.scoringConfigured'), window._t('create.scoringConfiguredMsg'), 'success');
  }
};

// Update GSM summary from hidden fields (no overlay needed) — now delegates to preset system
window._updateGSMSummaryFromHidden = function() {
  // Refresh preset detection and main summary
  if (typeof window._gsmDetectPreset === 'function') {
    window._gsmSelectedPreset = window._gsmDetectPreset();
  }
  if (typeof window._gsmRenderPresets === 'function') window._gsmRenderPresets();
  if (typeof window._gsmUpdateAdvantageUI === 'function') window._gsmUpdateAdvantageUI();
  if (typeof window._gsmUpdateMainSummary === 'function') window._gsmUpdateMainSummary();
};

// Auto-apply sport defaults when sport changes
window._onSportChange = window._onSportChange || function() {};
var _origOnSportChange = window._onSportChange;
window._onSportChange = function() {
  if (typeof _origOnSportChange === 'function') _origOnSportChange();
  var sportEl = document.getElementById('select-sport');
  if (!sportEl) return;
  var sport = sportEl.options[sportEl.selectedIndex] ? sportEl.options[sportEl.selectedIndex].text.replace(/^[^\w\u00C0-\u024F]+/u, '').trim() : '';

  // Check user preferences first, then sport defaults
  var config = null;
  try {
    var prefs = JSON.parse(localStorage.getItem('scoreplace_gsm_prefs') || '{}');
    if (prefs[sport]) config = prefs[sport];
  } catch(e) {}

  if (!config) {
    config = window._sportScoringDefaults[sport] || window._sportScoringDefaults['_default'];
  }

  // Apply to hidden fields (always use strings for .value)
  document.getElementById('gsm-type').value = config.type || 'simple';
  document.getElementById('gsm-setsToWin').value = String(config.setsToWin || 1);
  document.getElementById('gsm-gamesPerSet').value = String(config.gamesPerSet || 6);
  document.getElementById('gsm-tiebreakEnabled').value = config.tiebreakEnabled ? 'true' : 'false';
  document.getElementById('gsm-tiebreakPoints').value = String(config.tiebreakPoints || 7);
  document.getElementById('gsm-tiebreakMargin').value = String(config.tiebreakMargin || 2);
  document.getElementById('gsm-superTiebreak').value = config.superTiebreak ? 'true' : 'false';
  document.getElementById('gsm-superTiebreakPoints').value = String(config.superTiebreakPoints || 10);
  document.getElementById('gsm-countingType').value = config.countingType || 'numeric';
  document.getElementById('gsm-advantageRule').value = config.advantageRule ? 'true' : 'false';

  // Reset advantage user choice on sport change so defaults apply
  window._gsmAdvantageUserSet = false;

  // Update detailed summary and presets
  if (typeof window._updateGSMSummaryFromHidden === 'function') window._updateGSMSummaryFromHidden();

  // v2.1.62: ao trocar a MODALIDADE, re-puxa o nº de quadras do local cadastrado
  // PARA ESSA modalidade (quadras são por modalidade — não se joga beach tennis
  // em quadra de tênis). Só roda se já há um local selecionado.
  if (typeof window._refreshVenueCourtsForSport === 'function') { try { window._refreshVenueCourtsForSport(); } catch (e) {} }

  // Garante que o campo oculto da vantagem fica coerente com o esporte (deriva — só Tênis).
  if (typeof window._gsmUpdateAdvantageUI === 'function') window._gsmUpdateAdvantageUI();
};

// ─── Pre-fill form from a saved template ──────────────────────────────────
window._prefillFromTemplate = function(tpl) {
  if (!tpl) return;

  // v2.1.33: template não traz datas — garante campos de data/hora em branco
  // (evita herdar datas de um torneio editado antes nesta mesma sessão).
  if (typeof window._blankTournamentDates === 'function') window._blankTournamentDates();

  // Sport
  var sportSel = document.getElementById('select-sport');
  if (sportSel && tpl.sport) {
    var opt = Array.from(sportSel.options).find(function(o) { return o.value === tpl.sport || o.text === tpl.sport; });
    if (opt) sportSel.value = opt.value;
    if (typeof window._onSportChange === 'function') window._onSportChange();
  }

  // Format — click the matching format button
  if (tpl.format) {
    var fmtBtns = document.querySelectorAll('.formato-btn');
    fmtBtns.forEach(function(btn) {
      if (btn.getAttribute('data-format') === tpl.format) btn.click();
    });
  }

  // Enrollment mode
  var enrollSel = document.getElementById('select-inscricao');
  if (enrollSel && tpl.enrollmentMode) {
    enrollSel.value = tpl.enrollmentMode;
    window._selectEnrollMode(tpl.enrollmentMode);
  }
  // v2.2.46: separar duplas por origem (modo misto)
  var _mpTplTgl = document.getElementById('mixed-pairing-toggle');
  if (_mpTplTgl) {
    _mpTplTgl.checked = !!tpl.mixedPairingSeparated;
    if (typeof window._syncMixedPairing === 'function') window._syncMixedPairing();
  }

  // Max participants
  var maxP = document.getElementById('tourn-max-participants');
  if (maxP && tpl.maxParticipants) maxP.value = tpl.maxParticipants;

  // Courts
  var courts = document.getElementById('tourn-court-count');
  if (courts && tpl.courtCount) courts.value = tpl.courtCount;

  // Game duration
  var dur = document.getElementById('tourn-game-duration');
  if (dur && tpl.gameDuration) dur.value = tpl.gameDuration;

  // Team size
  var ts = document.getElementById('tourn-team-size');
  if (ts && tpl.teamSize && tpl.teamSize > 1) ts.value = tpl.teamSize;

  // Venue
  var venueInput = document.getElementById('tourn-venue');
  if (venueInput && tpl.venue) venueInput.value = tpl.venue;

  // Scoring (GSM)
  if (tpl.scoring && tpl.scoring.type === 'gsm' && typeof window._gsmApplyConfig === 'function') {
    window._gsmApplyConfig(tpl.scoring);
  }

  // W.O. Scope — v2.6.61: render canônica (botões); normaliza legado 'team' → 'time'.
  if (tpl.woScope && typeof window._setPhaseWo === 'function') {
    window._setPhaseWo(0, tpl.woScope === 'team' ? 'time' : tpl.woScope);
  }

  // Late Enrollment (Fechadas + Novos Confrontos)
  if (tpl.lateEnrollment) {
    document.getElementById('late-enrollment').value = tpl.lateEnrollment;
    document.getElementById('late-toggle-closed').checked = tpl.lateEnrollment === 'closed';
    var _tplNM = (tpl.newMatchups != null) ? (tpl.newMatchups === true) : (tpl.lateEnrollment === 'expand'); // v1.3.x independente
    document.getElementById('late-toggle-expand').checked = _tplNM;
    var _nmElT = document.getElementById('new-matchups'); if (_nmElT) _nmElT.value = _tplNM ? 'true' : 'false';
    if (typeof window._syncLateEnrollment === 'function') window._syncLateEnrollment();
  }

  // v2.1.32: restaura ABSOLUTAMENTE TODAS as configs salvas no template.
  var _setV = function(id, v) { var el = document.getElementById(id); if (el && v !== undefined && v !== null && v !== '') el.value = v; };
  var _setC = function(id, v) { var el = document.getElementById(id); if (el) el.checked = !!v; };

  // Modo de sorteio (Sorteio vs Rei/Rainha)
  if (tpl.drawMode) {
    _setV('draw-mode', tpl.drawMode);
    if (typeof window._selectDrawMode === 'function') { try { window._selectDrawMode(tpl.drawMode); } catch (e) {} }
  }
  // Público/privado
  if (tpl.isPublic !== undefined) {
    _setV('tourn-public', tpl.isPublic ? 'true' : 'false');
  }
  // Tipo de jogo, lotação, lançamento de resultado, W.O. já tratado, encerrar ao lotar
  _setV('tourn-game-types', tpl.gameTypes);
  // Lançamento de Resultados — v2.6.62: hidden + render canônica.
  if (tpl.resultEntry != null) {
    var _tplRe = Array.isArray(tpl.resultEntry) ? tpl.resultEntry : [tpl.resultEntry];
    if (!_tplRe.length) _tplRe = ['organizer'];
    var _tplReH = document.getElementById('select-result-entry');
    if (_tplReH) _tplReH.value = _tplRe.length === 1 ? _tplRe[0] : JSON.stringify(_tplRe);
    var _tplReBox = document.getElementById('phase-re-buttons-0');
    if (_tplReBox && typeof window._resultEntryButtonsHtml === 'function') _tplReBox.outerHTML = window._resultEntryButtonsHtml(0);
  }
  if (tpl.autoCloseOnFull !== undefined) _setC('tourn-auto-close', tpl.autoCloseOnFull);
  // Sorteio de Vagas: modelo de inscrição + vagas + chamada da fila
  if (tpl.enrollmentLimitMode) {
    var _elmTpl = tpl.enrollmentLimitMode;
    _setC('elm-toggle-cap', _elmTpl === 'cap');
    _setC('elm-toggle-draw', _elmTpl === 'draw');
    _setV('tourn-target-slots', tpl.targetSlots);
    var _cpTpl = tpl.callPolicy || 'present';
    _setC('cp-toggle-present', _cpTpl === 'present');
    _setC('cp-toggle-locked', _cpTpl === 'locked');
    if (typeof window._syncCallPolicy === 'function') { try { window._syncCallPolicy(); } catch (e) {} }
    if (typeof window._syncEnrollLimitMode === 'function') { try { window._syncEnrollLimitMode(); } catch (e) {} }
  }
  // Tempos
  _setV('tourn-call-time', tpl.callTime);
  _setV('tourn-warmup-time', tpl.warmupTime);
  _setV('tourn-court-names', tpl.courtNames);
  // Local (todos os campos ocultos)
  _setV('tourn-venue-access', tpl.venueAccess);
  _setV('tourn-venue-lat', tpl.venueLat);
  _setV('tourn-venue-lon', tpl.venueLon);
  _setV('tourn-venue-address', tpl.venueAddress);
  _setV('tourn-venue-place-id', tpl.venuePlaceId);
  _setV('tourn-venue-photo-url', tpl.venuePhotoUrl);
  if (typeof window._applyCoverPhoto === 'function') window._applyCoverPhoto(tpl.coverPhotoData || '');
  // Logo
  if (typeof window._setLogoFormaFromRadius === 'function') { try { window._setLogoFormaFromRadius((tpl.logoRadius != null && tpl.logoRadius !== '') ? tpl.logoRadius : 14, tpl.logoShape === 'circle'); } catch (e) {} }
  if (tpl.logoData) { _setV('tourn-logo-data', tpl.logoData); _setV('tourn-logo-locked', tpl.logoLocked ? '1' : '0'); if (typeof window._applyTournamentLogo === 'function') { try { window._applyTournamentLogo(tpl.logoData); } catch (e) {} } }
  // Liga / Suíço — formato de rodada, temporada, intervalo de sorteio, manual
  _setV('liga-round-format', tpl.ligaRoundFormat);
  _setV('liga-season-months', tpl.ligaSeasonMonths);
  _setV('liga-draw-interval', tpl.drawIntervalDays);
  _setV('suico-draw-interval', tpl.drawIntervalDays);
  if (tpl.drawManual !== undefined) { _setC('liga-draw-manual', tpl.drawManual); _setC('suico-draw-manual', tpl.drawManual); }

  // Categorias do template — restaura TODAS as 4 dimensões (gênero, habilidade,
  // idade, personalizadas) nos hidden inputs E nos pills/chips, igual ao caminho
  // de edição de torneio. v2.1.81: antes só idade era restaurada — gênero e
  // habilidade do template eram silenciosamente perdidos (o save recomputava
  // combinedCategories sem eles). _templateCategories ficou só como snapshot.
  if ((tpl.genderCategories && tpl.genderCategories.length > 0) || (tpl.skillCategories && tpl.skillCategories.length > 0) || (tpl.ageCategories && tpl.ageCategories.length > 0) || (tpl.customCategories && tpl.customCategories.length > 0)) {
    window._templateCategories = {
      gender: tpl.genderCategories || [],
      skill: tpl.skillCategories || [],
      age: tpl.ageCategories || [],
      custom: tpl.customCategories || [],
      combined: tpl.combinedCategories || []
    };
    // Gênero: hidden + pills
    var _tplGender = tpl.genderCategories || [];
    _setV('tourn-gender-categories', _tplGender.join(','));
    if (typeof window._applyGenderCatUI === 'function') { try { window._applyGenderCatUI(_tplGender); } catch (e) {} }
    // Habilidade: hidden + pills (loader cuida de ambos)
    if (typeof window._loadSkillCategoriesFromArray === 'function') { try { window._loadSkillCategoriesFromArray(tpl.skillCategories || []); } catch (e) {} }
    // Idade: hidden + pills
    _setV('tourn-age-categories', (tpl.ageCategories || []).join(','));
    if (typeof window._applyAgeCatUI === 'function') { try { window._applyAgeCatUI(tpl.ageCategories || []); } catch (e) {} }
    // Personalizadas: hidden + chips
    if (typeof window._loadCustomCategoriesFromArray === 'function') { try { window._loadCustomCategoriesFromArray(tpl.customCategories || []); } catch (e) {} }
    // Recalcula o preview com tudo restaurado
    if (typeof window._updateCategoryPreview === 'function') { try { window._updateCategoryPreview(); } catch (e) {} }
  }

  // v4.4.x (Camada 2): CONFIG DE FORMATO — restaura a config do configurador único (format2)
  // salva em tpl.fmt2. É a fonte única de t.phases. Setamos como config pendente e remontamos
  // o format2 pra ele iniciar a partir dela (torneio NOVO a partir de template = sem editId).
  if (tpl.fmt2) {
    window._f2PendingTemplateCfg = tpl.fmt2;
    var _fm = document.getElementById('f2-config-mount'); if (_fm) { try { _fm.remove(); } catch (e) {} }
  }
  if (tpl.phase1Name != null) {
    window._phase1Name = tpl.phase1Name;
    var _p1nEl = document.getElementById('phase1-name');
    if (_p1nEl) _p1nEl.value = tpl.phase1Name;
  }
  if (tpl.gruposCount != null) _setV('grupos-count', tpl.gruposCount);
  if (tpl.gruposClassified != null) _setV('grupos-classified', tpl.gruposClassified);
  if (tpl.gruposEqualOnly !== undefined) _setC('grupos-equal-only', tpl.gruposEqualOnly);
  if (tpl.gruposSeedVip !== undefined) _setC('grupos-seed-vip', tpl.gruposSeedVip);
  if (tpl.gruposSeedCategory !== undefined) _setC('grupos-seed-category', tpl.gruposSeedCategory);
  if (tpl.allowSelfDeactivation !== undefined) _setC('liga-allow-self-deactivation', tpl.allowSelfDeactivation);
  if (tpl.reiRainhaGroupsBy) _setV('reirainha-groups-by', tpl.reiRainhaGroupsBy);
  if (typeof window._f2MountInEditForm === 'function') { try { window._f2MountInEditForm(); } catch (e) {} }
  if (typeof window._renderGruposSuggestions === 'function') { try { window._renderGruposSuggestions(); } catch (e) {} }
};

// ─── Discard create/edit tournament ───────────────────────────────────────
// v1.3.13-beta: detecta rota — page-route vs modal-overlay.
// v1.6.5-beta: se estiver editando, volta ao card do torneio com toast
// "Alterações descartadas". Se for criação nova, vai pro dashboard.
window._discardCreateTournament = function() {
  var _t = window._t || function(k) { return k; };
  var editId = (document.getElementById('edit-tournament-id') || {}).value || '';
  if (window.location.hash === '#novo-torneio') {
    if (editId) {
      showNotification(_t('create.discarded'), '', 'info');
      window.location.hash = '#tournaments/' + editId;
    } else {
      window.location.hash = '#dashboard';
    }
    return;
  }
  // Legacy modal-overlay path
  if (editId) {
    showNotification(_t('create.discarded'), '', 'info');
    window.location.hash = '#tournaments/' + editId;
  } else {
    if (typeof closeModal === 'function') closeModal('modal-create-tournament');
    else {
      var modal = document.getElementById('modal-create-tournament');
      if (modal) modal.classList.remove('active');
    }
  }
};

// ─── Navigation helper + page renderer (v1.3.13-beta) ────────────────────
// ── ANCORAGEM DE SCROLL DO CRIAR/EDITAR (invariante do dono) ──────────────────
// REGRA: ao alterar QUALQUER configuração no criar/editar torneio, a tela NUNCA
// pode pular/rolar/mudar de posição — o usuário não pode se perder. Os toggles
// dão show/hide em seções acima do controle clicado, mudando a altura do documento
// → o controle "salta". Solução geral (sem tocar handler por handler): um listener
// em fase de CAPTURA registra a posição do controle ANTES dos handlers rodarem;
// no rAF seguinte (após a mutação do DOM, ANTES do paint) compensa o scroll do
// container pra manter o controle exatamente onde estava. Vale pra clique e change,
// em modo modal (#modal-create-tournament) e page-route (#novo-torneio).
(function _attachCreateFormScrollAnchor() {
  if (typeof document === 'undefined' || window._createFormAnchorAttached) return;
  window._createFormAnchorAttached = true;
  function _scrollParent(el) {
    for (var p = el && el.parentElement; p; p = p.parentElement) {
      var oy = '';
      try { oy = getComputedStyle(p).overflowY; } catch (e) {}
      if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight + 1) return p;
    }
    return null; // null → usar window
  }
  function _onInteract(e) {
    var form = document.getElementById('form-create-tournament');
    if (!form || !e.target || !form.contains(e.target)) return;
    var anchor = (e.target.closest && e.target.closest('button, label, .form-group, .toggle-switch, input, select, .formato-btn, .draw-mode-btn')) || e.target;
    if (!anchor || !anchor.getBoundingClientRect) return;
    var cont = _scrollParent(anchor);
    var beforeTop = anchor.getBoundingClientRect().top;
    // Captura roda ANTES dos onclick/onchange inline (bubble). O rAF roda DEPOIS
    // deles mutarem o DOM e ANTES do paint → compensa sem flicker.
    requestAnimationFrame(function () {
      if (!document.body || !document.body.contains(anchor)) return;
      var delta = anchor.getBoundingClientRect().top - beforeTop;
      if (Math.abs(delta) < 1) return;
      if (cont && cont.scrollBy) cont.scrollBy(0, delta);
      else window.scrollBy(0, delta);
    });
  }
  document.addEventListener('click', _onInteract, true);
  document.addEventListener('change', _onInteract, true);
})();

// Padrão centralizado: criar/editar torneio é page-route #novo-torneio.
// Topbar visível, hamburger funcional, URL bookmarkable.
//
// Pre-população dos campos (form.reset, set sport, prefill venue, etc.)
// continua acontecendo nos call-sites ANTES da navegação — DOM moves
// preservam valores quando renderCreateTournamentPage move .modal pro
// view-container.
window._navigateToCreateTournament = function (editId) {
  // v4.4.17: editId vai NA URL (#novo-torneio/<tId>) — assim um refresh reabre o
  // MESMO torneio em edição em vez de cair num torneio novo sem nome.
  var target = editId ? ('#novo-torneio/' + editId) : '#novo-torneio';
  if (window.location.hash === target) {
    if (typeof window.initRouter === 'function') window.initRouter();
  } else {
    window.location.hash = target;
  }
};

window.renderCreateTournamentPage = function (container, editId) {
  if (!container) return;
  // Garantir que setupCreateTournamentModal já criou a estrutura DOM
  if (!document.getElementById('modal-create-tournament') && typeof window.setupCreateTournamentModal === 'function') {
    window.setupCreateTournamentModal();
  }
  var modalEl = document.getElementById('modal-create-tournament');
  var modalInner = modalEl ? modalEl.querySelector('.modal') : null;
  if (!modalInner) {
    if (modalEl) modalEl.remove();
    if (typeof window.setupCreateTournamentModal === 'function') window.setupCreateTournamentModal();
    modalEl = document.getElementById('modal-create-tournament');
    modalInner = modalEl ? modalEl.querySelector('.modal') : null;
  }
  if (!modalInner) return;

  // v4.4.17: deep-link/refresh em #novo-torneio/<tId> → repopula o form ANTES de
  // mover pro container (o wrapper #modal-create-tournament ainda existe, então
  // openEditTournamentModal não recria um form duplicado). skipNav evita re-navegar.
  if (editId && (document.getElementById('edit-tournament-id') || {}).value !== editId
      && typeof window.openEditTournamentModal === 'function'
      && typeof window._findTournamentById === 'function') {
    if (window._findTournamentById(editId)) {
      try { window.openEditTournamentModal(editId, true); } catch (e) {}
      modalEl = document.getElementById('modal-create-tournament');
      modalInner = modalEl ? modalEl.querySelector('.modal') : null;
      if (!modalInner) return;
    } else if (!window._f2EditRetry) {
      // Torneios ainda não carregaram do Firestore — tenta de novo em 600ms.
      window._f2EditRetry = true;
      setTimeout(function () {
        window._f2EditRetry = false;
        if (window.location.hash === '#novo-torneio/' + editId && typeof window.initRouter === 'function') window.initRouter();
      }, 600);
    }
  }

  container.innerHTML = '';
  container.appendChild(modalInner);
  if (modalEl && modalEl.parentNode === document.body) modalEl.remove();

  // Re-render header on every navigation so button labels/padding reflect actual
  // viewport (the CSS media query handles layout, but the DOM must exist in-situ).
  if (typeof window._renderCreateTournamentHeader === 'function') window._renderCreateTournamentHeader();

  // v4.4.17: monta o configurador format2 no ÚNICO ponto de render — garante que
  // TODO torneio (criar OU editar, navegação OU refresh) mostra o mesmo configurador
  // e nunca o construtor de fases antigo (que fica só escondido). Idempotente por editId.
  if (typeof window._f2MountInEditForm === 'function') { try { window._f2MountInEditForm(); } catch (e) {} }

  // Re-rodar setup async que depende de DOM visível (places, venue map, GSM)
  setTimeout(function () {
    if (typeof window._f2MountInEditForm === 'function') { try { window._f2MountInEditForm(); } catch (e) {} }
    if (typeof window._gsmInitPresets === 'function') window._gsmInitPresets();
    else if (typeof window._updateGSMSummaryFromHidden === 'function') window._updateGSMSummaryFromHidden();
    if (typeof window._initPlacesAutocomplete === 'function') window._initPlacesAutocomplete();
    if (typeof window._autoShowVenueMap === 'function') window._autoShowVenueMap();
    if (typeof window._hydrateVenuePrefChips === 'function') window._hydrateVenuePrefChips();
    // Estimativa de tempo da fase: render inicial no open (create e edit). O wiring
    // de mudança (formato/sorteio/categoria/tempos) cobre depois; aqui é o 1º paint.
    if (typeof window._renderPhaseEstimate === 'function') { try { window._renderPhaseEstimate(); } catch (e) {} }
  }, 50);
  // v2.1.50: o perfil (preferredLocations) pode chegar async depois do render —
  // re-hidrata os chips de locais preferidos quando ele tiver carregado.
  // v2.1.59: e corrige no banco os preferidos sem placeId (match por nome com
  // os locais cadastrados na plataforma).
  setTimeout(function () {
    if (typeof window._hydrateVenuePrefChips === 'function') window._hydrateVenuePrefChips();
    if (typeof window._backfillPreferredVenueIds === 'function') { try { window._backfillPreferredVenueIds(); } catch (e) {} }
  }, 900);

  if (typeof window._reflowChrome === 'function') window._reflowChrome();
};

// Expor setupCreateTournamentModal pra que renderCreateTournamentPage possa
// rebuildar quando o user navega pra fora e volta (router clear destrói o
// .modal que estava no view-container).
window.setupCreateTournamentModal = setupCreateTournamentModal;

// ─── Render the sticky back-header for the create/edit tournament modal ──
// Uses the centralized window._renderBackHeader helper with action buttons
// (Carregar Template, Salvar Template, Descartar, Salvar) wired into the
// rightHtml slot. The Voltar button's onClickOverride closes the modal —
// equivalent to Descartar. This keeps ONE single back-header in the whole
// app (avoids the "2 Voltar" duplicate users reported).
window._renderCreateTournamentHeader = function() {
  var host = document.getElementById('create-tournament-header-host');
  if (!host || typeof window._renderBackHeader !== 'function') return;
  var _t = window._t || function(k) { return k; };

  // Template buttons: icon-only on narrow screens via CSS (not JS), so they
  // respond to actual viewport at display time — not at render-call time.
  var tplPad  = 'padding:5px 10px;font-size:0.75rem;';
  var loadLbl = ' <span class="tpl-label">' + (_t('create.loadTemplate') || 'Carregar Template') + '</span>';
  var saveLbl = ' <span class="tpl-label">' + (_t('create.saveTemplate') || 'Salvar Template') + '</span>';

  // Descartar and Salvar: text-only (no icon), minimum width needed for their words
  var actPad  = 'padding:5px 12px;font-size:0.8rem;';

  var actionsHtml =
    '<div class="create-hdr-actions" style="display:flex;align-items:center;gap:6px;flex-shrink:0;flex-wrap:nowrap;">' +
      '<button class="btn btn-tool-amber btn-sm" id="btn-save-template-create" type="button" ' +
              'onclick="window._saveCurrentFormAsTemplate()" ' +
              'style="' + tplPad + 'flex-shrink:0;border-radius:10px;" ' +
              'title="' + (_t('create.saveTemplate') || 'Salvar Template') + '">💾' + saveLbl + '</button>' +
      '<button class="btn btn-tool-indigo btn-sm" id="btn-load-template-create" type="button" ' +
              'onclick="window._showTemplatePickerInCreate()" ' +
              'style="' + tplPad + 'flex-shrink:0;border-radius:10px;" ' +
              'title="' + (_t('create.loadTemplate') || 'Carregar Template') + '">⭐' + loadLbl + '</button>' +
      '<button class="btn btn-danger-ghost btn-sm hover-lift" id="btn-discard-tournament" type="button" ' +
              'onclick="window._discardCreateTournament()" ' +
              'style="' + actPad + 'flex-shrink:0;border-radius:10px;" ' +
              'title="' + (_t('btn.discard') || 'Descartar') + '">' + (_t('btn.discard') || 'Descartar') + '</button>' +
      '<button class="btn btn-primary btn-sm hover-lift" id="btn-save-tournament" type="button" ' +
              'style="' + actPad + 'font-weight:700;flex-shrink:0;border-radius:10px;" ' +
              'title="' + (_t('btn.save') || 'Salvar') + '">' + (_t('btn.save') || 'Salvar') + '</button>' +
    '</div>';

  host.innerHTML = window._renderBackHeader({
    href: '#dashboard',
    label: _t('btn.back') || 'Voltar',
    onClickOverride: window._discardCreateTournament,
    rightHtml: actionsHtml
  });

  // v1.4.20-beta: innerHTML destroys the old btn-save-tournament and its listener.
  // Re-attach the save handler to the freshly created button every time.
  var _saveBtn = host.querySelector('#btn-save-tournament');
  if (_saveBtn && typeof window._saveTournamentClickHandler === 'function') {
    _saveBtn.addEventListener('click', window._saveTournamentClickHandler);
  }

  // Override header padding via JS (bypasses CSS specificity entirely — guaranteed to apply)
  var hdr = host.querySelector('.sticky-back-header');
  if (hdr) {
    hdr.style.setProperty('padding-left',  '12px', 'important');
    hdr.style.setProperty('padding-right', '12px', 'important');
    hdr.style.setProperty('padding-top',   '6px',  'important');
    hdr.style.setProperty('padding-bottom','6px',  'important');
  }

  // Responsive overrides via CSS media query — CSS always reflects actual viewport,
  // JS innerWidth at call time would be wrong when header is built at startup on desktop.
  // Always remove + recreate so the fix is never stuck behind a cached old version.
  var existingSt = document.getElementById('create-tournament-header-style');
  if (existingSt) existingSt.remove();
  var st = document.createElement('style');
  st.id = 'create-tournament-header-style';
  st.textContent =
    // Modal-context: keep header sticky when opened as overlay
    '#modal-create-tournament .sticky-back-header{position:sticky;top:0;' +
      'background:var(--bg-card);padding:0.5rem 0.75rem;' +
      'border-bottom:1px solid var(--border-color);z-index:10;}' +
    // Fix: responsive.css has .view-container .btn-primary{width:100%} at ≤767px.
    // Override for header buttons — they must size to content, never fill-width.
    '#create-tournament-header-host .btn-primary,' +
    '#create-tournament-header-host .btn-secondary{width:auto!important;}' +
    // Mobile: hide "Voltar" label + template labels, shrink paddings, tighten gap
    '@media (max-width:600px){' +
      '#create-tournament-header-host [data-back-nav]{padding-left:8px!important;padding-right:8px!important;}' +
      '#create-tournament-header-host .back-btn-label{display:none!important;}' +
      '#create-tournament-header-host .tpl-label{display:none!important;}' +
      '#create-tournament-header-host .create-hdr-actions{gap:4px!important;}' +
      '#create-tournament-header-host .btn-tool-amber,' +
      '#create-tournament-header-host .btn-tool-indigo{padding:4px 7px!important;font-size:0.72rem!important;}' +
      '#create-tournament-header-host #btn-discard-tournament,' +
      '#create-tournament-header-host #btn-save-tournament{padding:4px 8px!important;font-size:0.75rem!important;}' +
    '}';
  document.head.appendChild(st);
};

// ─── Hide/restore underlying sticky-back-headers when the modal is open ───
// The app keeps the view's Voltar at z-index 1001 (ABOVE modal at 1000) so
// Voltar is always clickable. But when a modal provides its own back header
// we must hide the underlying one to avoid a duplicate Voltar on-screen.
(function() {
  var KEY = '_ctSuspendedBackHeaders';
  function suspend() {
    var modal = document.getElementById('modal-create-tournament');
    if (!modal) return;
    var suspended = [];
    document.querySelectorAll('.sticky-back-header').forEach(function(h) {
      if (modal.contains(h)) return; // skip the modal's own back header
      suspended.push({ el: h, prev: h.style.display });
      h.style.display = 'none';
    });
    window[KEY] = suspended;
  }
  function restore() {
    var suspended = window[KEY] || [];
    suspended.forEach(function(s) { s.el.style.display = s.prev || ''; });
    window[KEY] = null;
  }
  var _oOpen = window.openModal;
  window.openModal = function(id) {
    if (typeof _oOpen === 'function') _oOpen(id);
    if (id === 'modal-create-tournament') suspend();
  };
  var _oClose = window.closeModal;
  window.closeModal = function(id) {
    if (id === 'modal-create-tournament') restore();
    if (typeof _oClose === 'function') _oClose(id);
  };
})();

// ─── Save current form as template ────────────────────────────────────────
// Reads the current create-tournament form values and saves them as a
// reusable template via window._saveTemplate.
window._saveCurrentFormAsTemplate = function() {
  var _t = window._t || function(k) { return k; };
  if (!window.AppStore || !window.AppStore.currentUser || !window.AppStore.currentUser.uid) {
    if (typeof showNotification === 'function') showNotification(_t('template.loginRequired') || 'Faça login para salvar templates', '', 'warning');
    return;
  }
  var get = function(id) { var el = document.getElementById(id); return el ? el.value : ''; };
  var getChecked = function(id) { var el = document.getElementById(id); return el ? !!el.checked : false; };
  var name = (get('tourn-name') || '').trim();
  var defaultName = name || _t('create.newTournament') || 'Novo Torneio';
  var sportRaw = get('select-sport') || '';
  var sportClean = sportRaw.replace(/^[^\w\u00C0-\u024F]+/u, '').trim();
  var formatValue = get('select-formato');
  var drawModeValue = get('draw-mode');
  var formatMap = { liga:'Liga', suico:'Suíço Clássico', elim_simples:'Eliminatórias Simples', elim_dupla:'Dupla Eliminatória', grupos_mata:'Fase de Grupos + Eliminatórias' };
  var format;
  // Rei/Rainha é MODO do Pontos Corridos (campanha kill-monarch-format) → template
  // grava Liga + drawMode='rei_rainha' (mesma regra do save do torneio).
  if (drawModeValue === 'rei_rainha' && formatValue !== 'liga') format = 'Liga';
  else format = formatMap[formatValue] || 'Eliminatórias Simples';
  var genderCats = (get('tourn-gender-categories') || '').split(',').map(function(s){return s.trim();}).filter(Boolean);
  var skillCats = (get('tourn-skill-categories') || '').split(',').map(function(s){return s.trim();}).filter(Boolean);
  // v2.1.80: categorias personalizadas — "skill-like".
  var customCats = (get('tourn-custom-categories') || '').split(',').map(function(s){return s.trim();}).filter(Boolean);
  var skillLike = skillCats.concat(customCats);
  var combinedCats = [];
  if (genderCats.length && skillLike.length) {
    genderCats.forEach(function(g) { skillLike.forEach(function(s) { combinedCats.push(g + ' ' + s); }); });
  } else if (genderCats.length) combinedCats = genderCats.slice();
  else if (skillLike.length) combinedCats = skillLike.slice();
  var scoring = {
    type: get('gsm-type') || 'simple',
    setsToWin: parseInt(get('gsm-setsToWin')) || 1,
    gamesPerSet: parseInt(get('gsm-gamesPerSet')) || 6,
    tiebreakEnabled: get('gsm-tiebreakEnabled') === 'true',
    tiebreakPoints: parseInt(get('gsm-tiebreakPoints')) || 7,
    tiebreakMargin: parseInt(get('gsm-tiebreakMargin')) || 2,
    superTiebreak: get('gsm-superTiebreak') === 'true',
    superTiebreakPoints: parseInt(get('gsm-superTiebreakPoints')) || 10,
    countingType: get('gsm-countingType') || 'numeric',
    advantageRule: (typeof window._gsmGetAdvantageForSport === 'function') ? window._gsmGetAdvantageForSport() : (get('gsm-advantageRule') === 'true'),
    fixedSet: get('gsm-fixedSet') === 'true',
    fixedSetGames: parseInt(get('gsm-fixedSetGames')) || 6
  };
  // v2.1.32: o template grava ABSOLUTAMENTE TODAS as configs (menos dados de
  // instância: nome do torneio, datas, organizador, inscritos, logo gerada).
  var ageCats = (get('tourn-age-categories') || '').split(',').map(function(s){return s.trim();}).filter(Boolean);
  if (typeof showInputDialog !== 'function') return;
  showInputDialog(_t('template.namePrompt') || 'Nome do template', defaultName, function(templateName) {
    if (!templateName || !templateName.trim()) return;
    var tname = templateName.trim();
    var template = {
      name: tname,
      sport: sportClean,
      format: format,
      drawMode: drawModeValue || 'sorteio',
      isPublic: get('tourn-public') === 'true',
      scoring: scoring,
      genderCategories: genderCats,
      skillCategories: skillCats,
      ageCategories: ageCats,
      customCategories: customCats,
      combinedCategories: combinedCats,
      enrollmentMode: get('select-inscricao') || 'individual',
      mixedPairingSeparated: get('mixed-pairing-separated') === 'true',
      teamSize: parseInt(get('tourn-team-size')) || 1,
      gameTypes: get('tourn-game-types') || 'duplas',
      maxParticipants: parseInt(get('tourn-max-participants')) || '',
      autoCloseOnFull: getChecked('tourn-auto-close'),
      enrollmentLimitMode: get('enrollment-limit-mode') || 'cap',
      targetSlots: parseInt(get('tourn-target-slots')) || '',
      callPolicy: get('call-policy') || 'present',
      resultEntry: get('select-result-entry') || 'organizer',
      woScope: get('wo-scope') || 'individual',
      lateEnrollment: get('late-enrollment') || 'closed',
      newMatchups: (get('new-matchups') === 'true'), // v1.3.x: "Novos Confrontos" independente de "Abertas"
      courtCount: parseInt(get('tourn-court-count')) || '',
      courtNames: (get('tourn-court-names') || '').trim(),
      callTime: parseInt(get('tourn-call-time')) || 0,
      warmupTime: parseInt(get('tourn-warmup-time')) || 0,
      gameDuration: parseInt(get('tourn-game-duration')) || '',
      venue: (get('tourn-venue') || '').trim(),
      venueAccess: get('tourn-venue-access') || '',
      venueLat: get('tourn-venue-lat') || null,
      venueLon: get('tourn-venue-lon') || null,
      venueAddress: get('tourn-venue-address') || '',
      venuePlaceId: get('tourn-venue-place-id') || '',
      venuePhotoUrl: get('tourn-venue-photo-url') || '',
      coverPhotoData: (document.getElementById('tourn-cover-data') || {}).value || '',
      logoData: get('tourn-logo-data') || '',
      logoLocked: get('tourn-logo-locked') === '1',
      logoShape: get('tourn-logo-shape') === 'circle' ? 'circle' : 'square',
      logoRadius: (function(){ var r = parseInt(get('tourn-logo-radius'), 10); return isNaN(r) ? 14 : r; })(),
      ligaRoundFormat: get('liga-round-format') || '',
      ligaSeasonMonths: get('liga-season-months') || '',
      drawIntervalDays: get('liga-draw-interval') || get('suico-draw-interval') || '',
      drawManual: getChecked('liga-draw-manual') || getChecked('suico-draw-manual'),
      // v4.4.x (Camada 2): CONFIG DE FORMATO COMPLETA = a config do configurador único
      // (format2). É a MESMA fonte que o save lê pra montar t.phases → guardar a config crua
      // round-trips 100%. Fase 1 (nome) + toggles top-level completam.
      fmt2: (function () { try { return (typeof window._f2GetConfig === 'function') ? window._f2GetConfig() : null; } catch (e) { return null; } })(),
      phase1Name: (function () { var el = document.getElementById('phase1-name'); return el ? el.value.trim() : ''; })(),
      allowSelfDeactivation: (function () { var el = document.getElementById('liga-allow-self-deactivation'); return el ? !!el.checked : true; })(),
      gruposCount: parseInt(get('grupos-count')) || 4,
      gruposClassified: parseInt(get('grupos-classified')) || 2,
      gruposEqualOnly: getChecked('grupos-equal-only'),
      gruposSeedVip: getChecked('grupos-seed-vip'),
      gruposSeedCategory: getChecked('grupos-seed-category'),
      reiRainhaGroupsBy: get('reirainha-groups-by') || ''
    };
    if (typeof window._saveTemplate !== 'function') return;
    var _doSave = function() {
      window._saveTemplate(template).then(function(result) {
        if (result === 'ok') {
          if (typeof showNotification === 'function') showNotification(_t('template.saved') || 'Template salvo', template.name, 'success');
        } else if (result === 'limit') {
          if (typeof showNotification === 'function') showNotification(_t('template.limitFree') || 'Limite de templates atingido', '', 'warning');
        } else {
          if (typeof showNotification === 'function') showNotification(_t('template.saveError') || 'Erro ao salvar', '', 'error');
        }
      });
    };
    // v2.1.33: nome duplicado → confirma substituir (atualiza por cima) ou cancela.
    var _existing = (typeof window._getTemplates === 'function' ? window._getTemplates() : []).find(function(x) {
      return x && (x.name || '').trim().toLowerCase() === tname.toLowerCase();
    });
    if (_existing) {
      var _overwrite = function() {
        // remove o antigo e grava o novo no lugar
        if (typeof window._deleteTemplate === 'function' && _existing._id) {
          var _p = window._deleteTemplate(_existing._id);
          if (_p && typeof _p.then === 'function') _p.then(_doSave); else _doSave();
        } else { _doSave(); }
      };
      if (typeof showConfirmDialog === 'function') {
        showConfirmDialog(
          'Atualizar template?',
          'Já existe um template chamado "' + tname + '". Deseja substituí-lo pelas configurações atuais?',
          _overwrite,
          { confirmText: 'Atualizar', cancelText: 'Cancelar', type: 'warning' }
        );
      } else if (window.confirm('Já existe um template "' + tname + '". Substituir?')) {
        _overwrite();
      }
      return;
    }
    _doSave();
  });
};

// ─── Template picker inside create-tournament modal ───────────────────────
// Show/hide the "Template" button based on template availability
window._refreshTemplateBtn = function() {
  // Buttons are always visible now — no-op kept for backward compat
};

window._showTemplatePickerInCreate = function() {
  // If cache not loaded yet, load from Firestore first
  if (window._templateCache === null && typeof window._loadTemplates === 'function') {
    window._loadTemplates().then(function() { window._showTemplatePickerInCreate(); });
    return;
  }
  var templates = typeof window._getTemplates === 'function' ? window._getTemplates() : [];

  if (templates.length === 0) {
    var emptyHtml = '<div style="padding:1.5rem;text-align:center;">' +
      '<p style="font-size:1.2rem;margin-bottom:8px;">📁</p>' +
      '<p style="color:var(--text-muted);font-size:0.9rem;margin-bottom:12px;">Nenhum template salvo.</p>' +
      '<p style="color:var(--text-muted);font-size:0.8rem;">Para salvar um template, abra um torneio existente e clique em <b>"💾 Salvar como Template"</b> nas Ferramentas do Organizador.</p>' +
    '</div>';
    if (typeof showAlertDialog === 'function') showAlertDialog('💾 Templates', emptyHtml);
    return;
  }

  var html = '<div style="max-height:300px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;padding:1rem;">';
  html += '<h3 style="margin:0 0 8px;font-size:1rem;color:var(--text-bright);">Carregar Template</h3>';
  templates.forEach(function(tpl, i) {
    var sportIcon = tpl.sport ? tpl.sport.split(' ')[0] : '🏆';
    // v3.0.54: subtítulo reflete MULTIFASE. Antes mostrava só o formato da Fase 1
    // (ex.: "Liga") mesmo num torneio multifase. Agora, se há fases extras, lista
    // TODAS as fases pelo nome de exibição (Liga→Pontos Corridos etc.).
    var _fmtCodeMap = { liga:'Liga', suico:'Suíço Clássico', elim_simples:'Eliminatórias Simples', elim_dupla:'Dupla Eliminatória', grupos_mata:'Fase de Grupos + Eliminatórias' };
    var _disp = function(canon){ return (typeof window._formatDisplayName === 'function') ? (window._formatDisplayName(canon) || canon || '') : (canon || ''); };
    var _fmtLabel;
    if (Array.isArray(tpl.extraPhases) && tpl.extraPhases.length > 0) {
      var _phaseParts = [_disp(tpl.format || '')];
      tpl.extraPhases.forEach(function(ph){ _phaseParts.push(_disp(_fmtCodeMap[ph && ph.format] || (ph && ph.format) || '')); });
      _fmtLabel = '🧩 Multifase · ' + _phaseParts.filter(Boolean).join(' → ');
    } else {
      _fmtLabel = _disp(tpl.format || '');
    }
    html += '<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:rgba(255,255,255,0.04);border:1px solid var(--border-color);border-radius:12px;cursor:pointer;transition:background 0.15s;" ' +
      'onmouseenter="this.style.background=\'rgba(99,102,241,0.15)\'" onmouseleave="this.style.background=\'rgba(255,255,255,0.04)\'" ' +
      'onclick="window._applyTemplateInCreate(' + i + ')">' +
      '<span style="font-size:1.4rem;">' + sportIcon + '</span>' +
      '<div style="flex:1;min-width:0;">' +
        '<div style="font-weight:700;font-size:0.9rem;color:var(--text-bright);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + window._safeHtml(tpl.name) + '</div>' +
        '<div style="font-size:0.75rem;color:var(--text-muted);">' + window._safeHtml(_fmtLabel) +
          (tpl.venue ? ' · ' + window._safeHtml(tpl.venue) : '') + '</div>' +
      '</div>' +
      '<button type="button" class="cancel-x-btn" onclick="event.stopPropagation();window._deleteTemplateInCreate(\'' + window._safeHtml(tpl._id || String(i)) + '\')" title="Apagar" style="--cx-size:20px;">✕</button>' +
    '</div>';
  });
  html += '</div>';
  if (typeof showAlertDialog === 'function') showAlertDialog('💾 Templates', html);
};

window._applyTemplateInCreate = function(index) {
  var tpl = typeof window._applyTemplate === 'function' ? window._applyTemplate(index) : null;
  if (!tpl) return;
  // Close the alert dialog
  var overlay = document.querySelector('.alert-dialog-overlay');
  if (overlay) overlay.remove();
  // Reset form and apply template
  var form = document.getElementById('form-create-tournament');
  if (form) form.reset();
  if (typeof window._prefillFromTemplate === 'function') window._prefillFromTemplate(tpl);
  if (typeof showNotification === 'function') showNotification(window._t('create.templateApplied'), window._safeHtml(tpl.name), 'success');
  setTimeout(function() {
    if (typeof window._updateGSMSummaryFromHidden === 'function') window._updateGSMSummaryFromHidden();
  }, 100);
};

window._deleteTemplateInCreate = async function(templateId) {
  if (typeof window._deleteTemplate === 'function') await window._deleteTemplate(templateId);
  if (typeof showNotification === 'function') showNotification(window._t('create.templateDeleted'), '', 'info');
  // Refresh picker
  var overlay = document.querySelector('.alert-dialog-overlay');
  if (overlay) overlay.remove();
  window._showTemplatePickerInCreate();
  window._refreshTemplateBtn();
};

// v0.17.41: explicação detalhada dos critérios de desempate em layout rico
// — overlay próprio (não usa showAlertDialog estreito) com cabeçalho padrão
// (título + X), 5 seções em cards distribuídos verticalmente, max-width
// 640px. Pedido do usuário: "melhore a apresentação dos tooltip (distribua
// melhor na pagina e mantenha os cabecalhos padrao)".
window._showTiebreakInfo = function(criterion) {
  // Conteúdo estruturado em 5 seções: cada seção tem icon, title, body.
  const sections = (function() {
    if (criterion === 'buchholz') {
      return {
        icon: '📚',
        title: 'Força dos Adversários',
        subtitle: 'Buchholz',
        accent: '#3b82f6', // blue
        accentRgb: '59,130,246',
        sections: [
          {
            icon: '📖',
            title: 'O que é',
            body: 'Soma dos pontos de <b>TODOS</b> os adversários que você enfrentou no torneio.'
          },
          {
            icon: '🎯',
            title: 'Pra que serve',
            body: 'Recompensa quem teve adversários <b>fortes</b>. Se você empata em pontos com outro jogador mas seus adversários somaram mais pontos no torneio (ou seja, foram melhores), você fica à frente — porque seu caminho foi mais difícil.'
          },
          {
            icon: '🔢',
            title: 'Exemplo numérico',
            body: 'Você (8 pts) e João (8 pts) empataram.<br>Seus 5 adversários somaram <b>30 pts</b> no torneio.<br>Os adversários do João somaram <b>22 pts</b>.<br><br><b style="color:#10b981;">Buchholz seu = 30 → fica à frente.</b>'
          },
          {
            icon: '📜',
            title: 'De onde veio',
            body: 'Criado por <b>Bruno Buchholz</b> em <b>1932</b> pra torneios de xadrez no Sistema Suíço, onde jogadores não enfrentam todos os outros. Hoje é o critério <b>#1 da FIDE</b> pra desempate em Suíço.'
          },
          {
            icon: '🎲',
            title: 'Quando aplicar',
            body: 'Principalmente em <b>Sistema Suíço</b> (cada jogador enfrenta sub-conjuntos diferentes de adversários).<br><br>Em <b>Liga round-robin</b> todos enfrentam todos, então o Buchholz tende a ser parecido pra todos os empatados — menos discriminante.'
          }
        ]
      };
    } else if (criterion === 'sonneborn_berger') {
      return {
        icon: '🏅',
        title: 'Qualidade das Vitórias',
        subtitle: 'Sonneborn-Berger',
        accent: '#a855f7', // purple
        accentRgb: '168,85,247',
        sections: [
          {
            icon: '📖',
            title: 'O que é',
            body: 'Soma dos pontos dos adversários que você <b>venceu</b>, mais <b>metade</b> dos pontos dos adversários com quem você <b>empatou</b>.<br><br>Adversários que você <b>perdeu não contam</b>.'
          },
          {
            icon: '🎯',
            title: 'Pra que serve',
            body: 'Recompensa quem venceu adversários <b>fortes</b> — não só a quantidade de vitórias, mas a <b>qualidade</b> delas. Se você bateu jogadores que terminaram com alto pontos, vale mais que bater jogadores fracos.'
          },
          {
            icon: '🔢',
            title: 'Exemplo numérico',
            body: 'Você venceu 3 jogadores que somaram <b>20 pts</b> no torneio + empatou com 1 que fez <b>6 pts</b>.<br><b style="color:#10b981;">SB seu = 20 + (6 ÷ 2) = 23</b><br><br>João venceu 3 jogadores fracos que somaram <b>9 pts</b>.<br><b style="color:#f87171;">SB do João = 9</b><br><br>→ <b>Você fica à frente.</b>'
          },
          {
            icon: '📜',
            title: 'De onde veio',
            body: 'Criado por <b>William Sonneborn</b> e <b>Johann Berger</b> entre <b>1873-1886</b> pra torneios de xadrez round-robin. Originalmente chamado <i>"Neustadtl score"</i>.<br><br>É o critério <b>#2 da FIDE</b> pra desempate em Suíço e round-robin.'
          },
          {
            icon: '🎲',
            title: 'Quando aplicar',
            body: 'Útil quando <b>Buchholz</b> ainda empata (o que é raro).<br><br>Mais relevante em <b>torneios longos</b> onde a diferença entre vencer um adversário forte e vencer um fraco é significativa.'
          }
        ]
      };
    } else if (criterion === 'pontos_avancados') {
      return {
        icon: '💯',
        title: 'Pontos Avançados',
        subtitle: 'Sistema de pontuação por eventos',
        accent: '#fbbf24', // amber
        accentRgb: '251,191,36',
        sections: [
          {
            icon: '📖',
            title: 'O que é',
            body: 'Um sistema de pontuação por <b>eventos</b> que roda em paralelo ao placar. Em vez de só contar vitória/derrota, soma pontos por coisas que aconteceram em cada partida (participação, vitória, games ganhos/perdidos, etc.) com <b>valores que você configura</b>. O total vira o número usado pra desempatar.<br><br>Só funciona se você <b>ligar o "Sistema de Pontos Avançado"</b> logo acima, na criação do torneio.'
          },
          {
            icon: '🧮',
            title: 'Como é calculado',
            body: 'Pra cada jogador, somam-se os eventos de <b>todas as partidas</b> que ele jogou (ignora BYE e jogos sem resultado). Valores padrão (todos configuráveis):<br><br>• Participação: <b>+150</b> por jogo<br>• Vitória na partida: <b>+150</b><br>• Game ganho: <b>+50</b> cada<br>• Game perdido: <b>−20</b> cada<br>• Ponto de tie-break: <b>+2</b> cada<br><br><b>Requerem placar ao vivo</b> (ponto a ponto):<br>• Killing point: <b>+10</b> cada<br>• Ponto marcado: <b>+1</b> cada'
          },
          {
            icon: '🔢',
            title: 'Exemplo numérico',
            body: 'Beach Tennis, valores padrão. Você venceu por <b>6–4</b>:<br>Participação +150 · Vitória +150 · 6 games ×50 = +300 · 4 games ×(−20) = −80<br><br><b style="color:#10b981;">Total da partida = 520.</b><br>Somando todas as suas partidas, dá o número que aparece na coluna <b>💯 PA</b> da classificação (clicável pra ver o detalhamento).'
          },
          {
            icon: '🛡️',
            title: 'Piso de segurança',
            body: 'Nenhuma partida pode resultar em total <b>negativo</b>. Se os games perdidos (−20) superarem o que você ganhou num jogo, o resultado daquela partida trava em <b>0</b> — nunca puxa seu total geral pra baixo.'
          },
          {
            icon: '🎲',
            title: 'Quando aplicar',
            body: 'Ideal pra circuitos e rankings estilo Beach Tennis e tênis, onde se ganha pontos por participar e por desempenho. Disponível em <b>todos os formatos</b> (eliminatórias, grupos, Liga, Suíço e Rei/Rainha).<br><br>Como costuma ser bem granular, quando ativo normalmente vai pro <b>topo</b> da ordem de desempate.'
          }
        ]
      };
    }
    return null;
  })();

  if (!sections) return;

  // Remove overlay anterior se existir
  const prev = document.getElementById('tiebreak-info-overlay');
  if (prev) prev.remove();

  // Build sections HTML
  const sectionsHtml = sections.sections.map(s =>
    '<div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:14px 16px;">' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">' +
        '<span style="font-size:1.1rem;">' + s.icon + '</span>' +
        '<h4 style="margin:0;font-size:0.85rem;font-weight:700;color:' + sections.accent + ';text-transform:uppercase;letter-spacing:0.5px;">' + s.title + '</h4>' +
      '</div>' +
      '<div style="font-size:0.9rem;line-height:1.55;color:var(--text-main);">' + s.body + '</div>' +
    '</div>'
  ).join('');

  const overlay = document.createElement('div');
  overlay.id = 'tiebreak-info-overlay';
  overlay.style.cssText =
    'position:fixed;top:0;left:0;width:100%;height:100%;' +
    'background:rgba(0,0,0,0.78);backdrop-filter:blur(6px);' +
    'display:flex;align-items:flex-start;justify-content:center;' +
    'z-index:100020;padding:5vh 1rem;overflow-y:auto;';

  overlay.innerHTML =
    '<div style="background:var(--bg-card,#1c1c1e);border:1px solid var(--border-color,rgba(255,255,255,0.1));border-radius:18px;max-width:640px;width:100%;box-shadow:0 24px 80px rgba(0,0,0,0.6);overflow:hidden;">' +
      // Standard header: title left, X close right
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:1.25rem 1.5rem;border-bottom:1px solid var(--border-color,rgba(255,255,255,0.08));background:linear-gradient(135deg,rgba(' + (sections.accentRgb || '88,166,255') + ',0.12),rgba(255,255,255,0.02));">' +
        '<div style="display:flex;align-items:center;gap:12px;min-width:0;flex:1;">' +
          '<span style="font-size:2rem;flex-shrink:0;">' + sections.icon + '</span>' +
          '<div style="min-width:0;">' +
            '<h3 style="margin:0;font-size:1.1rem;font-weight:700;color:var(--text-bright,#fff);line-height:1.2;">' + sections.title + '</h3>' +
            '<div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px;font-weight:500;">' + sections.subtitle + '</div>' +
          '</div>' +
        '</div>' +
        '<button onclick="document.getElementById(\'tiebreak-info-overlay\').remove()" aria-label="Fechar" ' +
          'style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);color:var(--text-bright,#fff);' +
          'width:36px;height:36px;border-radius:50%;font-size:1.2rem;font-weight:700;cursor:pointer;flex-shrink:0;' +
          'display:flex;align-items:center;justify-content:center;transition:background 0.2s;" ' +
          'onmouseover="this.style.background=\'rgba(255,255,255,0.16)\'" ' +
          'onmouseout="this.style.background=\'rgba(255,255,255,0.08)\'">×</button>' +
      '</div>' +
      // Body — sections distribuídas verticalmente
      '<div style="padding:1.25rem 1.5rem;display:flex;flex-direction:column;gap:12px;max-height:calc(90vh - 120px);overflow-y:auto;">' +
        sectionsHtml +
      '</div>' +
    '</div>';

  // Click backdrop to close
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) overlay.remove();
  });

  // ESC to close
  const escHandler = function(e) {
    if (e.key === 'Escape') {
      overlay.remove();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);

  document.body.appendChild(overlay);
};
