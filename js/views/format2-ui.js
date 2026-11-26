/* tabela de cor ausente (teste headless) => devolve a cor crua, como antes da 2.0.94 */
if (typeof window !== 'undefined' && !window._spCor) window._spCor = function (c) { return c; };
// ─────────────────────────────────────────────────────────────────────────────
// format2-ui.js — UI do CONFIGURADOR ÚNICO (reescrita v4.4.x)
//
// Renderiza os controles de window.FORMAT2 em DOIS modos:
//   • FORM (v4.4.3+): embutido no #fase1-box do editar/criar torneio — o formato
//     é configurado AQUI, no lugar dos seletores antigos. O save do form lê
//     window._f2GetConfig() e compila via compileToPhases.
//   • PAGE (legado): página #formato/:tId (mantida como fallback; o botão foi removido).
//
// Estado compartilhado S; handlers globais mutam S.cfg + normalizam + re-renderizam
// no mount atual (form container OU view-container).
// ─────────────────────────────────────────────────────────────────────────────
(function () {
  'use strict';
  var S = null; // { mode:'form'|'page', mountEl, tId, t, sport, cfg }
  var _safe = function (s) { return (window._safeHtml || function (x) { return x; })(s == null ? '' : String(s)); };

  function _tid() { var h = (location.hash || '').replace(/^#/, '').split('/'); return h[1] || ''; }
  function _norm() { if (S) S.cfg = window.FORMAT2.normalize(S.cfg, S.sport,category=>_sliderPopulation(category,false)); }
  function _faseLockState(state) {
    var t = state && state.t, cfg = state && state.cfg;
    var p0Drawn = !!(t && ((Array.isArray(t.matches) && t.matches.some(function (m) { return (m.phaseIndex || 0) === 0; })) ||
      (Array.isArray(t.rounds) && t.rounds.length > 0)));
    var elimAdvanced = !!(t && ((Array.isArray(t.matches) && t.matches.some(function (m) { return (m.phaseIndex || 0) >= 1; })) ||
      ((t.currentPhaseIndex || 0) >= 1)));
    return { p0Drawn: p0Drawn, classifLocked: p0Drawn && !!cfg.classifAtiva,
      classifToggleLocked: p0Drawn,
      elimLocked: (cfg.classifAtiva ? elimAdvanced : p0Drawn) && !!cfg.eliminatoria.ativa };
  }
  function _teamTiebreakersBlock(tc) {
    var labels = { vitorias: 'Número de vitórias', games_vencidos: 'Games vencidos', saldo_games: 'Saldo de games', pontos: 'Pontos', sorteio: 'Sorteio da organização' };
    var list = Array.isArray(tc.tiebreakers) ? tc.tiebreakers : null;
    var out = '<div style="margin-top:12px;padding-top:10px;border-top:1px solid rgba(129,140,248,.22);">' +
      '<div style="font-size:.78rem;font-weight:600;color:var(--text-main);">Desempates por time, nesta ordem</div>' +
      '<div style="font-size:.72rem;color:var(--text-muted);margin:4px 0 8px;">Só são aplicados após empate no critério principal acima.</div>';
    if (!list) return out + '<button type="button" class="btn btn-secondary btn-sm" onclick="window._f2TeamTiebreakStart()">Configurar desempates</button>' +
      '<div style="font-size:.72rem;color:var(--text-muted);margin-top:5px;">Sem configuração: permanece a ordem dos torneios anteriores.</div></div>';
    out += list.map(function (key, index) {
      return '<div style="display:flex;align-items:center;gap:7px;margin:5px 0;color:var(--text-main);">' +
        '<span style="min-width:1.3rem;">' + (index + 1) + 'º</span><span style="flex:1;">' + (labels[key] || key) + '</span>' +
        '<button type="button" class="btn btn-secondary btn-sm" title="Subir" aria-label="Subir ' + (labels[key] || key) + '" onclick="window._f2TeamTiebreakMove(' + index + ',-1)">↑</button>' +
        '<button type="button" class="btn btn-secondary btn-sm" title="Descer" aria-label="Descer ' + (labels[key] || key) + '" onclick="window._f2TeamTiebreakMove(' + index + ',1)">↓</button>' +
        '<button type="button" class="cancel-x-btn" style="--cx-size:22px;" title="Remover" aria-label="Remover ' + (labels[key] || key) + '" onclick="window._f2TeamTiebreakRemove(' + index + ')">×</button></div>';
    }).join('');
    var available = Object.keys(labels).filter(function (key) {
      return list.indexOf(key) < 0 && (key !== 'sorteio' || tc.classificationUnit !== 'pair');
    });
    if (available.length) out += _sec('Adicionar critério de desempate por time', available.map(function (key) {
      return _pill(false, "window._f2TeamTiebreakAdd('" + key + "')", labels[key]);
    }).join(''));
    if (list.indexOf('sorteio') >= 0) out += '<div style="font-size:.72rem;color:var(--text-muted);margin-top:8px;">O sorteio só desempata quando a organização registra a ordem dos times. Sem ordem registrada, a posição continua empatada pelos critérios esportivos.</div>';
    return out + '</div>';
  }
  function _syncTeamSize() {
    if (!S) return;
    var cfg = S.cfg;
    var ts = document.getElementById('tourn-team-size');
    if (ts) ts.value = window.FORMAT2.teamSizeFor(cfg.disputa); // mantém o form (estimativa/categorias) coerente
    // Toggles de FORMAÇÃO DE DUPLAS (participantes montam · times sorteados vs montados) só
    // fazem sentido com DUPLAS FIXAS — não em singles nem em parceria rotativa (Rei/Rainha /
    // sorteio-a-cada-rodada). Sincroniza a visibilidade conforme a config.
    ['manual-pairing-container', 'mixed-pairing-container'].forEach(function (id) {
      var el = document.getElementById(id); if (el) el.style.setProperty('display', 'none', 'important');
    });
    // Pontuação Avançada (💯 pontos individuais custom) é feature de PONTOS CORRIDOS (1 grupo).
    var adv = document.getElementById('adv-scoring-section');
    if (adv) adv.style.display = (cfg.grupos === 1) ? '' : 'none';
  }
  // As seções "Datas da fase" (#phase-dates-box) e "Inscrições durante a fase"
  // (#late-enroll-box) são DO FORM — relocadas pra dentro do box da Fase Classificatória
  // (slot #f2-classif-extra). Como o mount reescreve innerHTML a cada mudança, movo pra
  // fora (pro pai do mount) ANTES de reescrever e de volta DEPOIS — preserva valores/listeners.
  // v1.9.111: '#gsm-section' (🎾 Formato da Partida) entra nessa lista — ele deixou de ser
  // "do torneio inteiro" e passou a ser o formato da FASE INICIAL (classificatória; ou a
  // própria eliminatória, quando é eliminação direta). O slot #f2-classif-extra já muda de
  // lugar conforme a fase inicial, então o bloco acompanha sozinho. A fase eliminatória
  // POSTERIOR tem a sua própria seção (_gsmElimBlock), gravada em cfg.eliminatoria.scoring.
  var _EXT_IDS = ['gsm-section', 'adv-scoring-section', 'tiebreaker-section', 'estimated-games-mode-section',
    'phase-dates-box', 'estimated-games-window-section', 'time-estimates-container',
    'phase-call-order-editor', 'round-bounds-toggle-row', 'round-bounds-box',
    'late-enroll-box', 'gender-ratio-box'];
  function _stashExt() {
    var mount = document.getElementById('f2-config-mount');
    var holder = mount && mount.parentNode;
    if (!holder) return;
    _restoreSliderCapacities();
    var capacity=document.getElementById('category-capacity-section');
    if (capacity && mount.contains(capacity)) holder.insertBefore(capacity,mount);
    _EXT_IDS.forEach(function (id) { var el = document.getElementById(id); if (el && el.parentNode !== holder) holder.appendChild(el); });
  }
  function _placeExt() {
    var slot = document.getElementById('f2-classif-extra');
    var modeSlot = document.getElementById('f2-hours-mode-slot');
    var datesSlot = document.getElementById('f2-phase-dates-slot');
    var hoursSlot = document.getElementById('f2-hours-slot');
    var capacity=document.getElementById('category-capacity-section'), capacitySlot=document.getElementById('f2-category-capacity-slot');
    if (capacity && capacitySlot && !_hasDrawnGames()) { capacitySlot.appendChild(capacity); _placeSliderCapacities(); }
    if (modeSlot) { var mode = document.getElementById('estimated-games-mode-section'); if (mode) modeSlot.appendChild(mode); }
    if (datesSlot) { var dates = document.getElementById('phase-dates-box'); if (dates) datesSlot.appendChild(dates); }
    if (hoursSlot) ['estimated-games-window-section', 'time-estimates-container', 'phase-call-order-editor', 'round-bounds-toggle-row', 'round-bounds-box'].forEach(function (id) {
      var el = document.getElementById(id); if (el) hoursSlot.appendChild(el);
    });
    if (!slot) return;
    _EXT_IDS.filter(function (id) { return ['estimated-games-mode-section', 'phase-dates-box', 'estimated-games-window-section', 'time-estimates-container', 'phase-call-order-editor', 'round-bounds-toggle-row', 'round-bounds-box'].indexOf(id) < 0; }).forEach(function (id) {
      var el = document.getElementById(id); if (el) slot.appendChild(el);
    });
    _lockDrawnStandings();
  }
  function _hasDrawnGames() {
    var t = S && S.t;
    return !!(t && (Number(t._nJogos || 0) > 0 ||
      Number(t._nPartes && t._nPartes.matches || 0) > 0 ||
      (Array.isArray(t.rounds) && t.rounds.length) ||
      (Array.isArray(t.matches) && t.matches.length) ||
      (Array.isArray(t.groups) && t.groups.length)));
  }
  function _lockDrawnStandings() {
    var locked = _hasDrawnGames();
    ['adv-scoring-section', 'ranking-primary-choice', 'tie-resolution-section', 'tiebreaker-criteria-section'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.inert = locked;
      el.setAttribute('aria-disabled', locked ? 'true' : 'false');
      el.style.opacity = locked ? '0.65' : '';
    });
  }
  window._f2RefreshScoring=function(){if(S) _rerender();};
  window._f2StashExtSections = _stashExt;
  window._f2PlaceExtSections = _placeExt; // pra chamar de fora após o mount

  function _rerender() {
    if (!S) return;
    if(S.rendering){S.rerenderPending=true;return;}
    var renderingState=S;renderingState.rendering=true;
    try {
    if (S.mode === 'form') {
      _syncTeamSize();
      _stashExt();
      var el = document.getElementById('f2-config-mount');
      if (el) el.innerHTML = _bodyControls();
      _placeExt();
      if (typeof window._renderPhaseGridEditor === 'function') window._renderPhaseGridEditor();
      _mountElimRoundBounds();
      _renderTieResolution();
      _lockDrawnStandings();
      if (typeof window._updateRankingRecommendations === 'function') window._updateRankingRecommendations();
    } else {
      var c = document.getElementById('view-container');
      if (c) window.renderFormatoPage(c);
    }
    } finally {
      renderingState.rendering=false;
      if(S===renderingState && renderingState.rerenderPending){renderingState.rerenderPending=false;_rerender();}
    }
  }

  /* ── ⛔ NÃO REPINTAR COM O CAMPO EM FOCO ───────────────────────────────────────────
   * Relato do dono (12/set/2026): _"você clica na hora e quer escrever 23 e ele fica 02
   * apenas"_. Não é o teclado: é o REPINTE.
   * O `change` de um `<input type=time>` (e de `type=date`) dispara ASSIM QUE o valor fica
   * completo — não no blur. Com "23:00" já no campo, digitar o `2` da hora já forma
   * "02:00" → `change` → `_rerender()` → o `<input>` é DESTRUÍDO e recriado → o `3` que vinha
   * a seguir cai num elemento que não existe mais. O valor congela no primeiro dígito.
   * A regra: enquanto o campo está em foco, o modelo é atualizado e a tela NÃO é repintada;
   * o repinte fica armado pro `blur`, quando a pessoa já terminou de digitar.
   * ⚠️ `{ once: true }` + trava própria: `change` dispara a cada dígito e sem a trava
   * empilharíamos um ouvinte por tecla. */
  function _rerenderSemAtrapalhar(el) {
    if (el && document.activeElement === el && typeof el.addEventListener === 'function') {
      if (el._f2BlurArmado) return;
      el._f2BlurArmado = true;
      el.addEventListener('blur', function () { _norm(); _rerender(); }, { once: true });
      return;
    }
    _rerender();
  }


  function _pill(active, onclick, label, value, disabled) {
    var on = 'border:2px solid #818cf8;background:rgba(99,102,241,0.22);color:var(--sp-c-c7d2fe,#c7d2fe);';
    var off = 'border:2px solid var(--sp-b-255-255-255-016,rgba(255,255,255,0.16));background:var(--sp-g-255-255-255-005,rgba(255,255,255,0.05));color:var(--text-main);';
    return '<button type="button" aria-pressed="' + !!active + '"' + (value ? ' data-value="' + value + '"' : '') +
      (disabled ? ' disabled' : '') + ' onclick="' + onclick + '" style="padding:8px 14px;border-radius:10px;font-size:0.85rem;font-weight:600;cursor:pointer;white-space:nowrap;margin:0 4px 4px 0;' + (active ? on : off) + '">' + label + '</button>';
  }
  function _binaryChoice(left, right, rightActive, onchange, ariaLabel) {
    return '<label class="sp-binary-choice">' +
      '<span class="sp-binary-option' + (rightActive ? '' : ' is-active') + '">' + left + '</span>' +
      '<span class="toggle-switch"><input type="checkbox" aria-label="' + ariaLabel + '"' + (rightActive ? ' checked' : '') + ' onchange="' + onchange + '"><span class="toggle-slider"></span></span>' +
      '<span class="sp-binary-option' + (rightActive ? ' is-active' : '') + '">' + right + '</span></label>';
  }
  function _sec(title, inner) {
    return '<div style="margin-bottom:16px;"><div style="font-size:0.72rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:7px;">' + title + '</div>' + inner + '</div>';
  }
  function _num(val, min, max, onchange) {
    return '<input type="number" min="' + min + '" max="' + max + '" value="' + val + '" onchange="' + onchange + '" style="width:60px;text-align:center;padding:6px;border-radius:8px;border:1px solid var(--sp-b-255-255-255-02,rgba(255,255,255,0.2));background:var(--bg-darker,rgba(0,0,0,0.25));color:var(--text-main);">';
  }
  // Toggle padrão do app (.toggle-switch) com rótulo à direita do controle.
  function _toggle(label, checked, onchange) {
    return '<label style="display:inline-flex;align-items:center;gap:10px;cursor:pointer;font-size:0.9rem;color:var(--text-main);">' +
      '<span class="toggle-switch"><input type="checkbox"' + (checked ? ' checked' : '') + ' onchange="' + onchange + '"><span class="toggle-slider"></span></span>' +
      '<span>' + label + '</span></label>';
  }
  // Toggle em linha cheia: rótulo à ESQUERDA, controle alinhado à DIREITA.
  function _toggleRight(label, checked, onchange, disabled) {
    return '<label style="display:flex;align-items:center;justify-content:space-between;gap:12px;cursor:' + (disabled ? 'not-allowed' : 'pointer') + ';font-size:0.9rem;color:var(--text-main);width:100%;">' +
      '<span>' + label + '</span>' +
      '<span class="toggle-switch"><input type="checkbox"' + (checked ? ' checked' : '') + (disabled ? ' disabled' : '') + ' onchange="' + onchange + '"><span class="toggle-slider"></span></span></label>';
  }
  // ── "ABRIR COM RODADA REI/RAINHA" — bloco ÚNICO, usado nos DOIS contextos ─────────
  // A eliminatória pode começar por uma rodada Rei/Rainha (grupos de 4 que FORMAM as duplas
  // pelo resultado). Isso vale nos dois arranjos do modelo, e a diferença é só de onde vêm
  // as pessoas:
  //   • sem classificatória → do quadro de inscritos;
  //   • com classificatória → dos CLASSIFICADOS, e aí a colocação anterior vira cabeça de
  //     chave (os melhores caem em grupos diferentes).
  // ⚠️ Este bloco vivia DENTRO do ramo "sem classificatória" — era por isso que a segunda
  // forma não existia na tela, mesmo com o motor pronto pra ela. É a duplicidade que o dono
  // apontou: "esse toggle da fase eliminatória veio depois e deve ser assim".
  function _blocoAbrirComRR(cfg, temClassif) {
    var on = !!cfg.eliminatoria.openReiRainha;
    var s = _toggleRight('Abrir com rodada Rei/Rainha', on, 'window._f2ElimOpenRR(this.checked)') +
      '<div style="font-size:0.72rem;color:var(--text-muted);margin:6px 0 12px;line-height:1.45;">' + (on
        ? ('A eliminatória começa por <b>uma rodada Rei/Rainha</b>: grupos de 4' +
           (temClassif ? ' formados com os <b>classificados</b> (os melhores da fase anterior viram <b>cabeças de chave</b> e caem em grupos diferentes)' : ' sorteados') +
           ', e as <b>duplas se formam dentro de cada grupo</b> pelo resultado.')
        : ('Ative para a eliminatória <b>começar por uma rodada Rei/Rainha</b> (grupos de 4 que formam as duplas' +
           (temClassif ? ', semeados pela classificação' : '') + ').')) + '</div>';
    if (!on) return s;
    var cut = cfg.eliminatoria.reiRainhaCut === 2 ? 2 : 4;
    s += '<div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:6px;">Quantos de cada grupo de 4 avançam</div>' +
      _pill(cut === 4, 'window._f2ElimRRCut(4)', '4 · todos (2 duplas)') +
      _pill(cut === 2, 'window._f2ElimRRCut(2)', '2 · os melhores (1 dupla)') + '<div style="height:12px;"></div>';
    var fx = (cfg.eliminatoria.formacao === 'equilibrio') ? 'equilibrio' : 'performance';
    s += '<div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:5px;">Como formar as duplas no grupo</div>' +
      _pill(fx === 'performance', 'window._f2Formacao(\'performance\')', '📈 Performance') +
      _pill(fx === 'equilibrio', 'window._f2Formacao(\'equilibrio\')', '⚖️ Equilíbrio') +
      '<div style="font-size:0.72rem;color:var(--text-muted);margin:6px 0 12px;line-height:1.45;">' + (fx === 'performance'
        ? 'Performance: os melhores do grupo jogam juntos (1º+2º, depois 3º+4º).'
        : 'Equilíbrio: forte com fraco (1º+4º, 2º+3º) — duplas mais parelhas.') + '</div>';
    if (!temClassif && S.mode !== 'form') s += _sec('Desempate da rodada Rei/Rainha',
      _pill(cfg.tieResolution !== 'singles_then_draw', "window._f2TieResolution('draw_order')", '🎲 Ordem do sorteio original') +
      _pill(cfg.tieResolution === 'singles_then_draw', "window._f2TieResolution('singles_then_draw')", '🎾 Simples / triangular') +
      (cfg.tieResolution === 'singles_then_draw' ? _tieSinglesControls(cfg) : ''));
    return s;
  }

  function _tieSinglesControls(cfg) {
    return '<div class="sp-tie-singles-options">' +
      '<label class="sp-tie-points-label" for="sp-tie-points">Pontos para vencer' +
      '<span class="sp-tie-points-field"><input id="sp-tie-points" type="number" min="1" max="99" step="1" inputmode="numeric" value="' + _safe(cfg.tieSinglesPoints || 5) +
      '" onchange="window._f2TieSinglesPoints(this.value)"><span>pontos</span></span></label>' +
      '<div class="sp-tie-margin-choice" role="group" aria-label="Regra para vencer a simples">' +
      _pill(cfg.tieSinglesMargin !== 2, 'window._f2TieSinglesMargin(1)', 'Quem chega primeiro') +
      _pill(cfg.tieSinglesMargin === 2, 'window._f2TieSinglesMargin(2)', 'Vantagem de 2 pontos') + '</div></div>';
  }

  function _renderTieResolution() {
    var el = document.getElementById('tie-resolution-section');
    if (!el || !S || S.mode !== 'form') return;
    var cfg = S.cfg;
    var individual = cfg._scoreBy === 'individual' && !(cfg.teamCompetition && cfg.teamCompetition.enabled);
    var directReiRainha = !!(cfg.eliminatoria && cfg.eliminatoria.openReiRainha && !cfg.classifAtiva);
    var section = document.getElementById('tiebreaker-section');
    if (section) section.style.display = (cfg.classifAtiva || directReiRainha) ? '' : 'none';
    var primary = document.getElementById('ranking-primary-choice');
    if (primary) primary.style.display = cfg.classifAtiva ? '' : 'none';
    if (!(cfg.classifAtiva && individual) && !directReiRainha) {
      el.innerHTML = '';
      return;
    }
    var singles = cfg.tieResolution === 'singles_then_draw';
    var drawTwo = cfg.tieResolution === 'singles_draw_two';
    var criteria = document.getElementById('tiebreaker-criteria-section');
    if (criteria) criteria.style.display = singles ? 'none' : '';
    el.innerHTML = '<section style="padding:12px;margin:8px 0 14px;border:1px solid var(--sp-b-255-255-255-016,rgba(255,255,255,.16));border-radius:10px;background:var(--sp-g-255-255-255-005,rgba(255,255,255,.05));">' +
      '<h4 style="margin:0 0 5px;color:var(--text-main);">Empate na classificação</h4>' +
      '<p style="margin:0 0 10px;font-size:.8rem;color:var(--text-muted);">Escolha como resolver um empate que afete a classificação.</p>' +
      '<div class="sp-tie-mode-choices" role="group" aria-label="Como desempatar a classificação">' +
      _pill(singles, "window._f2TieResolution('singles_then_draw')", 'Simples / triangular direto') +
      _pill(drawTwo, "window._f2TieResolution('singles_draw_two')", 'Aplicar critérios; depois simples') +
      _pill(!singles && !drawTwo, "window._f2TieResolution('draw_order')", 'Critérios de desempate') + '</div>' +
      (singles ? '<p style="margin:6px 0 2px;font-size:.76rem;color:var(--text-muted);">Esta opção vai direto à simples após o critério principal e não usa a lista de critérios secundários. Para dois, joga-se uma simples; para três, uma triangular.</p>' + _tieSinglesControls(cfg) : '') +
      (drawTwo ? '<p style="margin:6px 0 2px;font-size:.76rem;color:var(--text-muted);">Depois do critério principal, o sistema aplica os critérios secundários acima, na ordem exibida. Só se o empate continuar: duas pessoas jogam uma simples; com três ou mais, sorteia duas para a simples. Se outra posição relevante continuar empatada, sorteia novamente entre as restantes. Pontos e vantagem da simples são configuráveis abaixo.</p>' + _tieSinglesControls(cfg) : '') +
      '</section>';
    _lockDrawnStandings();
  }

  // Painel "Inscrições durante a fase" DA ELIMINATÓRIA (2ª fase). Espelha visualmente o bloco do
  // form (#late-enroll-box), mas grava em cfg.eliminatoria.lateEnrollment (não em t.lateEnrollment,
  // que é da fase inicial). Mesma semântica de 2 toggles → 3 valores: closed | standby | expand.
  //   inscrição: desligado = Fechadas · ligado = Abertas
  //   espera:    desligado = Suplentes · ligado = Novos Confrontos
  function _lateEnrollElimBlock(e) {
    var T = window._t || function (k) { return k; };
    // 'inherit' (default) = a elim SEGUE a inscrição da fase inicial (#late-enrollment do form).
    // Exibe o valor herdado + aviso; tocar num toggle grava um valor EXPLÍCITO (regra própria).
    var _explicit = ['closed', 'standby', 'expand'].indexOf(e.lateEnrollment) >= 0;
    var _inh = (function () { var el = document.getElementById('late-enrollment'); var val = el && el.value; return (['closed', 'standby', 'expand'].indexOf(val) >= 0) ? val : 'expand'; })();
    var v = _explicit ? e.lateEnrollment : _inh;
    var isClosed = v === 'closed';
    // A preferência de novos confrontos continua independente e é preservada, mas só é
    // configurável com inscrições abertas. [[regression_closed_phase_has_no_late_entry_choice]]
    var _nmInh = (function () { var el = document.getElementById('new-matchups'); if (el) return el.value === 'true'; return _inh === 'expand'; })();
    var isExpand = !isClosed && ((e.newMatchups === true || e.newMatchups === false) ? e.newMatchups : _nmInh);
    // A mesma estrutura de dois rótulos existe no form e no atalho da chave.
    // `on` é sempre o estado da direita: Abertas / Novos Confrontos.
    // Alguns testes de render carregam esta tela sem o construtor completo. A
    // página real sempre recebe a fábrica canônica de create-tournament; este
    // fallback conserva a mesma marcação até ela estar disponível.
    var modeSwitch = window._lateEnrollmentModeSwitchHtml || function (opts) {
      opts = opts || {};
      var on = !!opts.on;
      return '<div' + (opts.id ? ' id="' + opts.id + '"' : '') + ' class="sp-late-mode-row" data-late-mode="' + (opts.mode || 'late-mode') + '" data-late-active="' + (on ? 'right' : 'left') + '" style="--late-left:' + (opts.leftColor || '#f87171') + ';--late-right:' + (opts.rightColor || '#4ade80') + ';--toggle-off-bg:' + (opts.leftToggleBg || 'rgba(248,113,113,0.28)') + ';--toggle-off-border:' + (opts.leftColor || '#f87171') + ';--toggle-on-bg:' + (opts.rightColor || '#4ade80') + ';--toggle-on-border:' + (opts.rightColor || '#4ade80') + ';--toggle-on-glow:' + (opts.rightGlow || 'rgba(74,222,128,0.36)') + ';">'
        + '<span class="sp-late-mode-label sp-late-mode-left">' + (opts.left || '') + '</span><label class="toggle-switch sp-late-mode-switch"><input type="checkbox"' + (opts.inputId ? ' id="' + opts.inputId + '"' : '') + (on ? ' checked' : '') + (opts.onchange ? ' onchange="' + opts.onchange + '"' : '') + '><span class="toggle-slider"></span></label><span class="sp-late-mode-label sp-late-mode-right">' + (opts.right || '') + '</span>'
        + (opts.desc ? '<div class="sp-late-mode-desc">' + opts.desc + '</div>' : '') + '</div>';
    };
    var masterRow = modeSwitch({
      id: 'f2-late-mode-enrollment', mode: 'enrollment', on: !isClosed,
      left: T('create.lateEnrollClosed'), right: T('create.lateEnrollOpen'),
      leftColor: '#f87171', rightColor: '#4ade80', leftToggleBg: 'rgba(248,113,113,0.28)', rightGlow: 'rgba(74,222,128,0.36)',
      ariaPrefix: 'Inscrições durante a eliminatória', onchange: 'window._f2ElimLateMaster(this.checked)',
      desc: T(isClosed ? 'create.lateEnrollClosedOnDesc' : 'create.lateEnrollClosedOffDesc')
    });
    var confRow = !isClosed ? modeSwitch({
      id: 'f2-late-mode-matchups', mode: 'matchups', on: isExpand,
      left: T('create.lateEnrollSuplentesOnly'), right: T('create.lateEnrollExpand'),
      leftColor: '#fbbf24', rightColor: '#60a5fa', leftToggleBg: 'rgba(251,191,36,0.24)', rightGlow: 'rgba(96,165,250,0.36)',
      ariaPrefix: 'Entradas da lista de espera', onchange: 'window._f2ElimLateConf(this.checked)',
      desc: T(isExpand ? 'create.lateEnrollExpandOnDesc' : 'create.lateEnrollExpandOffDesc')
    }) : '';
    var inheritHint = _explicit ? '' : ('<div style="font-size:0.72rem;color:var(--sp-c-93c5fd,#93c5fd);margin:0 0 8px;display:flex;align-items:flex-start;gap:5px;line-height:1.4;"><span>🔗</span><span>' + T('create.lateEnrollInheritHint') + '</span></div>');
    return '<div style="background:rgba(251,191,36,0.06);border:1px solid rgba(251,191,36,0.15);border-radius:12px;padding:1rem;margin-top:14px;">' +
      '<p style="margin:0 0 0.75rem;font-size:0.8rem;color:var(--sp-c-fbbf24,#fbbf24);font-weight:600;text-transform:uppercase;letter-spacing:1px;">⏱️ ' + T('create.lateEnrollSection') + '</p>' +
      inheritHint + '<div class="sp-late-mode-stack">' + masterRow + confRow + '</div></div>';
  }

  // TÉRMINO da fase eliminatória (v1.6.80). Só existe quando ela é 2ª fase: o box "📅 Datas
  // da fase" do form é realocado pra DENTRO da fase INICIAL (#f2-classif-extra) e grava
  // t.startDate/t.endDate — a eliminatória ficava sem janela nenhuma, e o fim do TORNEIO
  // (card de convite, dashboard, detalhe) era o fim da classificatória. Grava em
  // cfg.eliminatoria.endDate/endTime → phases[última].endDate/endTime.
  // Vazio = sem término próprio (o torneio termina com a classificatória, como antes).
  // ── 🎾 FORMATO DA PARTIDA DA FASE ELIMINATÓRIA ───────────────────────────────
  // A fase inicial usa o bloco #gsm-section do form (t.scoring). A eliminatória, quando é
  // fase POSTERIOR, pode ter o SEU: cfg.eliminatoria.scoring → phases[elim].scoring, que é
  // exatamente o que window._effectiveScoring(t, match) lê na hora do jogo.
  // Pedido do dono: Rei/Rainha 1 set na classificatória e duplas fixas melhor-de-3 com super
  // tie-break na eliminatória.
  //
  // Os presets são os MESMOS do form (window._gsmPresets) — uma fonte só de "1 Set / Melhor
  // de 3 / Melhor de 5 / Personalizado". Se create-tournament.js ainda não montou (modo page),
  // a seção simplesmente não aparece em vez de inventar uma segunda tabela de presets.
  // ⭐ 2.1: o gatilho do empate DESTA fase. Com formato próprio, é o dela; herdando, é o da
  // classificatória — que é o que o jogo vai usar de verdade. Ordem do dono: "isso nas duas
  // fases possíveis do torneio. tudo igual podendo ser configurado diferente em cada fase."
  function _elimTieAtAtual(e) {
    var scoring = e && e.scoring || (window._gsmReadHidden ? window._gsmReadHidden() : null);
    if(scoring && scoring.tiebreakAt)return scoring.tiebreakAt;
    var games = parseInt(scoring && scoring.gamesPerSet, 10) || 6;
    return games <= 1 ? '' : 'g-1';
  }
  function _elimScoringDesc(sc) {
    if (!sc) return '';
    if(sc.customRulesVersion===1 && window._gsmDescribeCustomRules)return window._gsmDescribeCustomRules(sc);
    if(sc.fixedSet) return (Number(sc.fixedSetGames || sc.gamesPerSet) || 6)+' games disputados no total; vence quem ganhar mais games.';
    if (typeof window._gsmBuildDescFromValues !== 'function') return '';
    return window._gsmBuildDescFromValues(sc.setsToWin, sc.gamesPerSet, sc.tiebreakEnabled,
      sc.tiebreakPoints, sc.superTiebreak, sc.superTiebreakPoints, _elimTieAtAtual({ scoring: sc }), sc.tieRule);
  }
  // Qual preset o scoring atual representa (pra acender o botão certo). 'custom' quando não
  // bate com nenhum — é o mesmo critério de igualdade que o form usa nos campos ocultos.
  function _elimPresetKey(sc) {
    var P = window._gsmPresets || {};
    if (!sc) return null;
    if (sc.fixedSet) return 'fixedGames';
    var keys = ['set1', 'best3', 'best5'];
    for (var i = 0; i < keys.length; i++) {
      var p = P[keys[i]];
      if (!p) continue;
      if (p.setsToWin === sc.setsToWin && p.gamesPerSet === sc.gamesPerSet &&
        !!p.tiebreakEnabled === !!sc.tiebreakEnabled && p.tiebreakPoints === sc.tiebreakPoints &&
        !!p.superTiebreak === !!sc.superTiebreak && p.superTiebreakPoints === sc.superTiebreakPoints) return keys[i];
    }
    return 'custom';
  }
  // Formato EFETIVO desta fase: o PRÓPRIO (cfg.eliminatoria.scoring) ou, na falta dele, o da
  // fase inicial (campos ocultos do form = t.scoring, fonte única _gsmReadHidden). É o mesmo
  // que window._effectiveScoring(t, match) resolve na hora do jogo.
  function _elimEffScoring(e) {
    if (S && S.cfg && S.cfg.classifAtiva && e.scoring && e.scoring.type) return e.scoring;
    return (typeof window._gsmReadHidden === 'function') ? window._gsmReadHidden() : null;
  }
  // v2.0.74: `tourn-game-duration` é o tempo POR SET (ver sport-rules.js). Aqui o
  // torneio ainda está no FORMULÁRIO, então o formato de cada fase vem do form:
  // a classificatória de `_gsmReadHidden()`, a eliminatória de `_elimEffScoring`.
  // As duas podem ser diferentes — é o caso do dono (Rei/Rainha depois melhor de 3).
  function _minPartidaForm(gi, scoring) {
    var porSet = parseInt((document.getElementById('tourn-game-duration') || {}).value, 10)
      || 25;
    return Math.round(porSet * (window._setsEsperadosDe(scoring && scoring.setsToWin) || 1));
  }
  function _scoringInicial() {
    return (typeof window._gsmReadHidden === 'function') ? window._gsmReadHidden() : null;
  }
  // Qual preset ACENDE. Com formato próprio, o critério é o do próprio objeto. HERDANDO, quem
  // decide é a MESMA função que acende o bloco do form (_gsmDetectPreset) — dois critérios pro
  // mesmo formato acenderiam botões diferentes nos dois blocos.
  // ⚠️ NÃO filtrar por `type`: torneio novo nasce com `gsm-type = 'simple'` e valores de 1 set.
  // Filtrar por type deixava a grade da eliminatória SEM NENHUM botão aceso e sem resumo.
  function _elimSelKey(e) {
    if (S && S.cfg && S.cfg.classifAtiva && e.scoring && e.scoring.type) return _elimPresetKey(e.scoring);
    try { return (typeof window._gsmDetectPreset === 'function') ? window._gsmDetectPreset() : null; } catch (x) { return null; }
  }
  // O preset que a FASE INICIAL está acendendo — usado pra decidir se a escolha da eliminatória
  // é "seguir a fase anterior" (scoring null) ou um formato próprio.
  function _initPresetKey() {
    try { return (typeof window._gsmDetectPreset === 'function') ? window._gsmDetectPreset() : null; } catch (x) { return null; }
  }
  // ⚠️ v1.9.116 — SEM TOGGLE (ordem do dono: "quem pediu essa merda desse toggle? é só pra ter
  // o formato como é o da fase anterior apenas com as cores"). O bloco é o ESPELHO do
  // #gsm-section do form: mesma caixa, mesma grade de 4 presets, mesma tira de resumo — só a
  // cor muda (âmbar aqui, roxo lá). Sem formato próprio, acende o preset HERDADO da fase
  // inicial: a tela mostra o que a eliminatória VAI jogar, não um campo vazio.
  function _gsmElimBlock(e) {
    var P = window._gsmPresets;
    if (!P) return '';
    var eff = _elimEffScoring(e);
    var selKey = _elimSelKey(e);
    var grid = '';
    ['set1', 'best3', 'best5', 'custom'].forEach(function (k) {
      var p = P[k]; if (!p) return;
      var active = (selKey === k || k==='custom' && selKey==='fixedGames');
      var desc = (k === 'fixedGames')
        ? ((Number(eff && eff.fixedSetGames) || Number(eff && eff.gamesPerSet) || 6) + ' games jogados; vence quem ganhar mais')
        : (k === 'custom')
        ? (active ? (_elimScoringDesc(eff) || 'Configure manualmente') : 'Configure manualmente')
        : (typeof window._gsmBuildDescFromValues === 'function'
          // o preset da fase 2 desenha com o GATILHO da fase 2 — cada fase tem o seu
          ? window._gsmBuildDescFromValues(p.setsToWin, p.gamesPerSet, p.tiebreakEnabled, p.tiebreakPoints, p.superTiebreak, p.superTiebreakPoints, _elimTieAtAtual(e), eff && eff.tieRule)
          : '');
      grid += '<button type="button" onclick="window._f2ElimScoringPreset(\'' + k + '\')" style="' +
        'display:flex;flex-direction:column;align-items:center;gap:4px;padding:12px 8px;border-radius:12px;cursor:pointer;transition:all 0.2s;' +
        'border:2px solid ' + window._spCor((active ? 'rgba(251,191,36,0.7)' : 'rgba(255,255,255,0.1)'), 'borda') + ';' +
        'background:' + window._spCor((active ? 'rgba(251,191,36,0.15)' : 'rgba(255,255,255,0.03)'), 'background') + ';' +
        'box-shadow:' + (active ? '0 0 12px rgba(251,191,36,0.2)' : 'none') + ';">' +
        '<span style="font-size:1.3rem;">' + p.icon + '</span>' +
        '<span style="font-size:0.78rem;font-weight:700;color:' + window._spCor((active ? '#fbbf24' : 'var(--text-bright)'), 'color') + ';">' + _safe(p.label) + '</span>' +
        '<span style="font-size:0.65rem;color:var(--text-muted);text-align:center;line-height:1.3;">' + _safe(desc) + '</span>' +
        '</button>';
    });
    var resumo = _elimScoringDesc(eff);
    return '<div style="background:rgba(251,191,36,0.06);border:1px solid rgba(251,191,36,0.15);border-radius:12px;padding:1rem;margin-top:14px;">' +
      '<p style="margin:0 0 10px 0;font-size:0.8rem;color:var(--sp-c-fbbf24,#fbbf24);font-weight:600;text-transform:uppercase;letter-spacing:1px;">\uD83C\uDFBE Formato da Partida</p>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;">' + grid + '</div>' +
      // A eliminatória pode herdar ou escolher seus próprios games e regra de empate.
      ((typeof window._tieAtToggleHtml === 'function' && eff)
        ? window._tieAtToggleHtml({ customRulesVersion:eff.customRulesVersion,games: (eff && eff.fixedSet ? (eff.fixedSetGames || eff.gamesPerSet) : eff.gamesPerSet) || 6, fixedGames: !!eff.fixedSet, countingType:eff.countingType, at: _elimTieAtAtual(e),
            rule: eff.tieRule || (eff.tiebreakEnabled !== false ? 'tiebreak' : 'extend'),
            setsToWin:eff.setsToWin, tiebreakPoints:eff.tiebreakPoints, superTiebreak:eff.superTiebreak, superTiebreakPoints:eff.superTiebreakPoints,
            setTwoPointAdvantage: eff.setTwoPointAdvantage !== undefined ? eff.setTwoPointAdvantage : (eff.twoPointAdvantage !== undefined ? eff.twoPointAdvantage : Number(eff.tiebreakMargin || 2) >= 2),
            tiebreakTwoPointAdvantage: eff.tiebreakTwoPointAdvantage !== undefined ? eff.tiebreakTwoPointAdvantage : (eff.twoPointAdvantage !== undefined ? eff.twoPointAdvantage : Number(eff.tiebreakMargin || 2) >= 2),
            cor: '251,191,36', pfx: 'f2elim', onGames: 'window._f2ElimSetGames', onRule: 'window._f2ElimSetRule', onTieAt: 'window._f2ElimSetTieAt', onSetTwoPoint: 'window._f2ElimSetTwoPoint', onTbTwoPoint: 'window._f2ElimSetTbTwoPoint', phaseIndex: 1 })
        : '') +
      (resumo
        ? ('<div style="font-size:0.8rem;color:var(--text-muted);margin-top:10px;line-height:1.5;padding:8px 12px;background:var(--sp-g-255-255-255-003,rgba(255,255,255,0.03));border-radius:8px;">' +
           _safe(resumo) + (e.scoring ? '' : ' <span style="opacity:0.75;">\u00b7 mesmo formato da classificat\u00f3ria</span>') + '</div>')
        : '') +
      '</div>';
  }

  function _elimEndDateBlock(e) {
    var d = e.endDate || '', h = e.endTime || '';
    return '<div style="background:rgba(129,140,248,0.05);border:1px solid rgba(129,140,248,0.18);border-radius:12px;padding:1rem;margin-top:14px;">' +
      '<p style="margin:0 0 0.6rem;font-size:0.8rem;color:var(--sp-c-a5b4fc,#a5b4fc);font-weight:600;text-transform:uppercase;letter-spacing:1px;">📅 Término da fase</p>' +
      // ⭐ 2.0.1 (dono): o ✕ fica na MESMA LINHA da data e da hora — "dá pra diminuir um pouco
      // os campos para ele caber ali". Com `flex-wrap:wrap` ele descia sozinho pra segunda
      // linha em tela estreita, virando um botão vermelho solto embaixo do campo. Agora:
      // `nowrap` (nunca desce), os dois campos com `min-width:0` (podem encolher de verdade)
      // e o ✕ com `flex-shrink:0` (é o único que não encolhe — é alvo de toque).
      '<div class="sp-dt-tight" style="display:flex;gap:4px;align-items:center;flex-wrap:nowrap;min-width:0;">' +
        '<input type="date" class="form-control" id="f2-elim-end-date" value="' + d + '" aria-label="Data de término da fase eliminatória" style="padding:6px 6px;font-size:0.78rem;flex:1 1 0;min-width:0;box-sizing:border-box;" onchange="window._f2ElimEndDate(this.value,this)">' +
        '<input type="time" class="form-control" id="f2-elim-end-time" value="' + h + '" aria-label="Hora de término da fase eliminatória" style="padding:6px 4px;font-size:0.78rem;flex:0 1 78px;min-width:0;box-sizing:border-box;" onchange="window._f2ElimEndTime(this.value,this)">' +
        // ✕ canônico (project_cancel_x_canonical) — nunca ✕ solto estilizado à mão.
        (d && typeof window._cancelXBtn === 'function'
          ? '<span style="flex-shrink:0;display:inline-flex;">' + window._cancelXBtn("window._f2ElimEndDate('')", 'Limpar término da eliminatória') + '</span>'
          : '') +
      '</div>' +
      '<div style="font-size:0.72rem;color:var(--text-muted);margin-top:7px;line-height:1.45;">' + (d
        ? 'O torneio termina aqui — é esta data que aparece no <b>convite</b>, no <b>card</b> e na ficha do torneio.'
        : 'Em branco, o torneio termina junto com a <b>fase classificatória</b>. Preencha para que o convite e o card mostrem até quando vai a eliminatória.') + '</div>' +
      '</div>';
  }
  // A eliminatória tem prazo e divisões próprios. O início é carimbado no AVANÇO
  // (`phaseStartedAt[idx]`); o fim vem da configuração da eliminatória. Não se reutiliza
  // nem a data nem o número de rodadas da classificatória.
  function _elimPhaseIndex() { return (S && S.t && Array.isArray(S.t.phases)) ? Math.max(1, S.t.phases.length - 1) : 1; }
  function _elimRoundCount() {
    if (!S || !S.t) return 1;
    var i = _elimPhaseIndex();
    var observed = (typeof window._rodadasVisiveisDaFase === 'function') ? window._rodadasVisiveisDaFase(S.t, i) : 0;
    var ph = (S.t.phases || [])[i] || {};
    return Math.max(observed || 0, parseInt(ph.rounds, 10) || 0, 1);
  }
  function _elimBoundsWindow() {
    if (!S || !S.cfg || !S.t) return null;
    var i = _elimPhaseIndex(), e = S.cfg.eliminatoria || {}, ph = (S.t.phases || [])[i] || {};
    var started = (S.t.phaseStartedAt || {})[String(i)] || '';
    var sd = String(started).slice(0, 10), st = String(started).indexOf('T') >= 0 ? String(started).slice(11, 16) : '00:00';
    var ed = e.endDate || ph.endDate || '', et = e.endTime || ph.endTime || '23:59';
    var a = window._rbMs ? window._rbMs(sd + 'T' + st) : NaN;
    var b = window._rbMs ? window._rbMs(ed + 'T' + et) : NaN;
    return (a > 0 && b > a) ? { startMs: a, endMs: b } : null;
  }
  // A régua é o editor visual do prazo: o rótulo curto pertence ao trecho e a data/hora
  // fica imediatamente abaixo do respectivo divisor. Não duplicamos os horários em cartões.
  function _elimRoundLabel(localIdx, n) {
    if (n === 6) return ['R2', 'R3', 'OF', 'QF', 'SF', 'F'][localIdx] || ('R' + (localIdx + 2));
    var fromEnd = n - localIdx;
    if (fromEnd === 1) return 'F';
    if (fromEnd === 2) return 'SF';
    if (fromEnd === 3) return 'QF';
    if (fromEnd === 4) return 'OF';
    return 'R' + (localIdx + 2);
  }
  function _elimRoundPresentation(win, rawCuts) {
    var n = _elimRoundCount();
    var cuts = (rawCuts || []).slice();
    if (cuts.length !== n - 1 && typeof window._rbIguais === 'function') cuts = window._rbIguais(win.start, win.end, n);
    cuts = cuts.concat([win.end]);
    return {
      roundLabel: function (idx) { return _elimRoundLabel(idx, n); },
      deadlineHtml: function (ms, idx) {
        var time = window._rbIso(ms).slice(11, 16);
        return '<span>' + window._rbDDMM(ms) + '</span>' +
          // ⛔ A CLASSE, NÃO O STYLE: a régua canônica de `input[type=time]` (components.css)
          // é `!important` e engolia o `font:0.62rem` inline — o campo saía com 0,9rem e 92px
          // de piso, encavalando os rótulos vizinhos. `.rb-time` é a exceção escrita no CSS.
          '<input type="time" class="rb-time" value="' + time + '" aria-label="Horário de encerramento de ' + _elimRoundLabel(idx, n) + '" ' +
          'onchange="window._f2ElimRoundEndTime(' + idx + ',this.value,this)" style="border:1px solid rgba(251,191,36,0.48);border-radius:5px;background:var(--sp-g-0-0-0-025,rgba(0,0,0,0.25));color:var(--sp-c-fbbf24,#fbbf24);font-weight:800;text-align:center;color-scheme:dark;">';
      },
      // A legenda permanece completa mesmo quando uma final de um dia é estreita demais
      // para comportar texto dentro da faixa.
      summaryHtml: function (allCuts) {
        var pills = '';
        for (var i = 0; i < n; i++) {
          var begin = allCuts[i], finish = allCuts[i + 1];
          var days = (typeof window._rbDias === 'function') ? window._rbDias(finish - begin) : '';
          pills += '<span style="text-align:center;white-space:nowrap;font-size:0.61rem;font-weight:800;color:var(--text-muted);">' + _elimRoundLabel(i, n) + ' · ' + days + 'd</span>';
        }
        return '<div aria-label="Duração de cada rodada" style="display:flex;justify-content:space-between;gap:5px;flex-wrap:wrap;margin-top:7px;">' + pills + '</div>';
      }
    };
  }
  function _elimRoundBoundsHtml() {
    return '<div style="display:flex;align-items:center;gap:10px;margin-top:12px;padding-top:10px;border-top:1px solid var(--sp-b-255-255-255-008,rgba(255,255,255,0.08));"><label class="toggle-switch" style="--toggle-on-bg:#60a5fa;--toggle-on-glow:rgba(96,165,250,0.3);--toggle-on-border:#60a5fa;flex-shrink:0;"><input type="checkbox" ' + ((S && S.cfg && S.cfg.eliminatoria && S.cfg.eliminatoria.roundBoundsEditorEnabled) ? 'checked ' : '') + 'onchange="window._f2ElimRoundBoundsEnabled(this.checked)"><span class="toggle-slider"></span></label><span style="font-size:0.82rem;color:var(--text-main);">Definir prazos por rodada</span></div>' +
      '<div id="f2-elim-round-bounds-box" style="display:none;margin-top:12px;">' +
      '<div style="font-size:0.7rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">⏱️ Divisão das rodadas <span style="text-transform:none;font-weight:500;opacity:0.8;">— arraste para esticar ou encurtar</span></div>' +
      '<div id="f2-elim-round-bounds-mount"></div>' +
      '<div style="text-align:right;margin-top:2px;"><button type="button" onclick="window._f2ElimRoundBoundsReset()" style="background:none;border:0;color:var(--text-muted);font-size:0.66rem;font-weight:700;cursor:pointer;text-decoration:underline;padding:2px 4px;">voltar ao padrão (dias iguais)</button></div>' +
    '</div>';
  }
  function _mountElimRoundBounds() {
    var box = document.getElementById('f2-elim-round-bounds-box');
    var mount = document.getElementById('f2-elim-round-bounds-mount');
    if (!box || !mount || typeof window._rbMount !== 'function') return;
    var n = _elimRoundCount(), win = _elimBoundsWindow();
    if (!S.cfg.eliminatoria.roundBoundsEditorEnabled || n < 2 || !win) { box.style.display = 'none'; return; }
    box.style.display = '';
    window._rbMount(mount, {
      startMs: function () { var w = _elimBoundsWindow(); return w ? w.startMs : NaN; },
      endMs: function () { var w = _elimBoundsWindow(); return w ? w.endMs : NaN; },
      rodadas: _elimRoundCount,
      valor: function () { return ((S.cfg.eliminatoria && S.cfg.eliminatoria.roundBounds) || []).map(window._rbMs).filter(function (v) { return !isNaN(v); }); },
      onChange: function (v) { S.cfg.eliminatoria.roundBounds = (v || []).map(window._rbIso); },
      presentation: function (state, limits) { return _elimRoundPresentation(state, limits); }
    });
  }
  window._f2ElimRoundBoundsReset = function () { if (S && S.cfg && S.cfg.eliminatoria) { S.cfg.eliminatoria.roundBounds = []; _mountElimRoundBounds(); } };
  // [[regression_round_deadlines_are_opt_in]] Sem a escolha explícita, não há prazos
  // intermediários escondidos no evento. Ao reativar, a régua volta em dias iguais.
  window._f2ElimRoundBoundsEnabled = function (enabled) {
    if (!S || !S.cfg || !S.cfg.eliminatoria) return;
    S.cfg.eliminatoria.roundBoundsEditorEnabled = !!enabled;
    if (!enabled) S.cfg.eliminatoria.roundBounds = [];
    _mountElimRoundBounds();
  };
  // Cada divisor já é uma data/hora ISO. Este editor muda somente a HORA, preserva a
  // data escolhida no arraste e mantém o último prazo no endTime canônico da fase.
  window._f2ElimRoundEndTime = function (idx, value, el) {
    if (!S || !S.cfg || !S.cfg.eliminatoria || !value) return;
    var n = _elimRoundCount(), win = _elimBoundsWindow();
    if (!win || idx < 0 || idx >= n || typeof window._rbIso !== 'function') return;
    var e = S.cfg.eliminatoria;
    var raw = (e.roundBounds || []).map(window._rbMs).filter(function (v) { return !isNaN(v); });
    var cuts = (raw.length === n - 1 && typeof window._rbNormaliza === 'function')
      ? window._rbNormaliza(raw, win.startMs, win.endMs, n) : null;
    if (!cuts) cuts = (typeof window._rbIguais === 'function') ? window._rbIguais(win.startMs, win.endMs, n) : [];
    if (idx < n - 1) {
      var date = window._rbIso(cuts[idx]).slice(0, 10);
      e.roundBounds = cuts.map(window._rbIso);
      e.roundBounds[idx] = date + 'T' + String(value).slice(0, 5);
    } else {
      e.endTime = String(value).slice(0, 5);
    }
    _norm(); _rerenderSemAtrapalhar(el);
  };

  // Janela da fase em dias: (término − 1º sorteio). Base da via de mão dupla rodadas↔repetir.
  // v4.4.62: CONSIDERA O HORÁRIO de cada campo (não meia-noite). 1º sorteio = data+hora do
  // agendamento (sem data, cai no início da fase); fim = data+hora de término da fase.
  function _windowDays() {
    if (!S) return null;
    var _v = function (id) { var el = document.getElementById(id); return el ? (el.value || '') : ''; };
    var firstDate = S.cfg.rodadas.drawFirstDate || _v('tourn-start-date') || '';
    var firstTime = (S.cfg.rodadas.drawFirstDate ? (S.cfg.rodadas.drawFirstTime || '') : _v('tourn-start-time')) || '19:00';
    var endDate = _v('tourn-end-date');
    var endTime = _v('tourn-end-time') || '23:59';
    if (!firstDate || !endDate) return null;
    var d1 = new Date(firstDate + 'T' + firstTime), d2 = new Date(endDate + 'T' + endTime);
    if (isNaN(d1.getTime()) || isNaN(d2.getTime()) || d2 <= d1) return null;
    return (d2 - d1) / 86400000; // dias FRACIONÁRIOS — o horário conta na janela
  }
  // O modo manual vem primeiro: ele determina se os campos de agenda aparecem.
  // Na agenda automática, a repetição vem antes da quantidade de rodadas derivada.
  function _schedBlock(r) {
    var inp = 'padding:8px 10px;border-radius:8px;border:1px solid var(--sp-b-255-255-255-02,rgba(255,255,255,0.2));background:var(--bg-darker,rgba(0,0,0,0.25));color:var(--text-main);box-sizing:border-box;font-size:0.85rem;';
    var manual = !!r.drawManual;
    var singleSuper8 = S.cfg.parceria === 'super_eight' && S.cfg.superEightDrawMode === 'single';
    var ivVal = (parseInt(r.drawIntervalDays, 10) >= 1) ? parseInt(r.drawIntervalDays, 10) : '';
    // v4.4.62: título com white-space:nowrap — evita que "Repetir a cada (dias)" quebre em 2
    // linhas em telas estreitas (o que, com align-items:flex-end, empurrava o "Nº de rodadas"
    // pra baixo). Se não couber lado a lado, a coluna inteira quebra pra linha de baixo (limpo).
    var fld = function (lbl, html) { return '<label style="display:flex;flex-direction:column;gap:5px;"><span style="font-size:0.72rem;color:var(--text-muted);white-space:nowrap;">' + lbl + '</span>' + html + '</label>'; };
    // v4.4.27: mesma apresentação dos campos de Início/Término da fase — usam class="form-control".
    var row1 = '<div style="display:flex;flex-wrap:wrap;gap:14px;align-items:flex-end;margin-bottom:12px;">' +
      fld('Data do 1º sorteio', '<input type="date" class="form-control" value="' + _safe(r.drawFirstDate || '') + '" onchange="window._f2SchedDate(this.value)" style="flex:1 1 0;min-width:0;">') +
      fld('Hora', '<input type="time" class="form-control" value="' + _safe(r.drawFirstTime || '19:00') + '" onchange="window._f2SchedTime(this.value)" style="flex:0 0 auto;">') +
    '</div>';
    // A repetição pode derivar o número de rodadas abaixo, mas o número de
    // rodadas nunca altera a repetição ou as datas já percorridas acima.
    // v4.4.71: ids estáveis + ✕ SEMPRE no DOM (display alternado) → _f2SchedRefresh
    // atualiza os valores derivados sem reconstruir os inputs (preserva a digitação nativa).
    var ivInput = '<span style="display:inline-flex;align-items:center;gap:6px;">' +
      '<input id="f2-sched-iv" type="number" min="1" max="60" value="' + ivVal + '" placeholder="—" onchange="window._f2SchedInterval(this.value)" style="' + inp + 'width:90px;text-align:center;">' +
      // v1.2.38: usa o ✕ CANÔNICO (.cancel-x-btn — círculo vermelho, borda branca, X branco).
      // Era um "✕ solto colorido", que o cânone proíbe explicitamente (components.css:555).
      '<button type="button" id="f2-sched-ivx" class="cancel-x-btn" title="Sem repetição" onclick="window._f2SchedInterval(\'\')" style="--cx-size:20px;' + (ivVal ? '' : 'display:none;') + '">✕</button>' +
    '</span>';
    var drawn = _hasDrawnGames();
    var singleLocked = drawn && S.cfg.parceria === 'super_eight' && singleSuper8;
    var alreadyDrawn = drawn ? Math.max((S.t.rounds || []).length, (S.t.swissRoundsData || []).length,
      (S.t.matches || []).reduce(function (max, match) {
        return match && Number(match.phaseIndex || 0) === 0 ? Math.max(max, Number(match.round) || 0) : max;
      }, 0), 1) : 1;
    var roundsLabel = S.cfg.parceria === 'super_eight' ? 'Partidas por atleta no grupo' : 'Nº de rodadas';
    var rounds = fld(roundsLabel, '<input id="f2-sched-n" type="number" min="' + alreadyDrawn + '" max="' + (S.cfg.parceria === 'super_eight' ? 7 : 30) + '" value="' + (r.n || '') + '" placeholder="—" onchange="window._f2Rn(this.value)"' + (singleLocked ? ' disabled title="Rodadas definidas pelo sorteio único"' : '') + ' style="' + inp + 'width:90px;text-align:center;">');
    if (S.cfg.parceria === 'super_eight') {
      rounds = fld(roundsLabel, '<input id="f2-sched-n" type="number" min="' + (drawn ? alreadyDrawn : 1) + '" max="7" value="' + (r.n || 7) + '" onchange="window._f2Rn(this.value)" style="' + inp + 'width:90px;text-align:center;">') +
        '<div style="font-size:.72rem;color:var(--text-muted);margin-top:6px;">Cada rodada tem 2 jogos: cada atleta joga uma vez e recebe um parceiro diferente. Sorteio único prepara todas as rodadas escolhidas.</div>';
    }
    var maxPeople = Number((document.getElementById('tourn-max-participants') || {}).value) ||
      (S.t ? _peopleCount(S.t) : 0);
    var eligible = S.cfg.disputa === 'dupla' && S.cfg.grupos === 1 &&
      (maxPeople === 8 || S.cfg.parceria === 'super_eight') &&
      Number(r.n) === 7 && (S.cfg.parceria === 'sorteio_rodada' || S.cfg.parceria === 'super_eight');
    var unique = eligible ? '<div style="margin-top:12px;">' +
      _toggleRight('Não repetir parceiro', S.cfg.parceria === 'super_eight', 'window._f2UniquePartner(this.checked)') + '</div>' : '';
    var drawMode = S.cfg.parceria === 'super_eight' ? _sec('Quando sortear',
      '<div' + (drawn ? ' inert aria-disabled="true" style="opacity:.65"' : '') + '>' +
      _binaryChoice('A cada rodada', 'Todas as rodadas de uma vez', singleSuper8,
        'window._f2SuperEightDrawMode(this.checked)', 'Modo de sorteio das rodadas') + '</div>') : '';
    var tgl = _toggleRight('Sortear manualmente', manual, 'window._f2SchedManual(this.checked)');
    var automatic = manual ? '' : '<div style="margin-top:12px;">' + row1 +
      (singleSuper8 ? '' : fld('Repetir a cada (dias)', ivInput)) + '</div>';
    // v1.4.12/15 — "Deixar inscritos ficarem de fora (Ativado/Desativado)". O controle existia
    // no #liga-fields do form antigo e SUMIU quando o configurador novo (format2) assumiu a
    // config da fase. Mora aqui porque é decisão da MESMA fase que o agendamento define.
    // Mantém o id 'liga-allow-self-deactivation' — o save/load do form lê por ele.
    // RODADA ÚNICA (n=1) → vem DESLIGADO por padrão: não há próximo sorteio pra ficar de fora.
    // ⚠️ É DEFAULT, NÃO CADEADO (v1.4.15): o dono pediu a configuração desativada, não o
    // controle travado — travar foi invenção minha. O organizador liga se quiser.
    var _oneRound = (parseInt(r.n, 10) || 0) === 1;
    var _adOn = (r.allowSelfDeactivation != null) ? (r.allowSelfDeactivation !== false) : !_oneRound;
    var _adTgl = '<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--sp-b-255-255-255-008,rgba(255,255,255,0.08));">' +
      '<label style="display:flex;align-items:center;justify-content:space-between;gap:12px;cursor:pointer;font-size:0.9rem;color:var(--text-main);width:100%;">' +
        '<span>Deixar inscritos ficarem de fora <span style="color:var(--text-muted);font-size:0.78rem;">(Ativado/Desativado)</span></span>' +
        '<span class="toggle-switch"><input type="checkbox" id="liga-allow-self-deactivation"' +
          (_adOn ? ' checked' : '') +
          ' onchange="window._f2AllowSelfDeact(this.checked)"><span class="toggle-slider"></span></span>' +
      '</label>' +
      '<div style="font-size:0.72rem;color:var(--text-muted);margin-top:6px;line-height:1.4;">' +
        'Cada inscrito pode se marcar como <b>Desativado</b> pra ficar de fora de um sorteio. ' +
        'Desligue pra que ninguém fique de fora — todos sempre <b>Ativados</b> e o controle some dos cards.' +
        (_oneRound ? ' <span style="color:var(--sp-c-94a3b8,#94a3b8);">(Rodada única: já vem desligado, porque não há próximo sorteio pra ficar de fora.)</span>' : '') +
      '</div>' +
    '</div>';
    var note = '<div id="f2-sched-note" style="font-size:0.72rem;color:var(--text-muted);margin-top:8px;">' + _f2SchedNote(r) + '</div>';
    return '<div style="margin-top:14px;padding:12px 13px;border-radius:10px;background:var(--sp-g-255-255-255-003,rgba(255,255,255,0.03));border:1px solid var(--sp-b-255-255-255-01,rgba(255,255,255,0.1));">' +
      '<div style="font-size:0.72rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:12px;">Rodadas e sorteio</div>' +
      rounds + unique + drawMode + '<div style="margin-top:12px;">' + tgl + '</div>' + automatic +
      (S.cfg.parceria === 'super_eight'
        ? ''
        : _adTgl) + note + '</div>';
  }

  // Conta PESSOAS inscritas (dupla-entry = 2; senão 1). project_count_people_not_entries.
  function _peopleCount(t) {
    // O formulário de edição precisa usar exatamente a mesma contagem da tela
    // de inscritos. `_personCount` deduplica a projeção canônica por UID/ID
    // manual e expande cada dupla para seus dois membros.
    if (typeof window._personCount === 'function') return window._personCount(t);
    // Fallback de carregamento: replica a mesma identidade estrutural do
    // contador canônico, para não voltar ao antigo "uma linha = uma pessoa"
    // enquanto store.js termina de carregar.
    var ps = Array.isArray(t && t.participants) ? t.participants : [];
    var seen = Object.create(null), n = 0, placeholderSeq = 0;
    function add(o, name) {
      var uid = o && typeof o === 'object' && o.uid ? String(o.uid).trim() : '';
      var manual = o && typeof o === 'object' && o.manualParticipantId ? String(o.manualParticipantId).trim() : '';
      var ph = !!(o && typeof o === 'object' && (o.isPlaceholder === true || o.genericPlaceholderReservation === true));
      var label = String(name == null ? '' : name).trim();
      var key = uid ? 'u:' + uid : (manual ? 'm:' + manual : 'n:' + label.toLocaleLowerCase());
      if (!uid && !manual && ph) key = 'placeholder:' + (++placeholderSeq);
      if (key && key !== 'n:' && !seen[key]) { seen[key] = true; n++; }
    }
    ps.forEach(function (p) {
      if (!p) return;
      if (typeof p === 'string') {
        (p.indexOf(' / ') !== -1 ? p.split(' / ') : [p]).forEach(function (name) { add(null, name); });
      } else if (Array.isArray(p.participants) && p.participants.length) {
        p.participants.forEach(function (slot) { add(slot, slot && (slot.displayName || slot.name)); });
      } else if (p.p1Uid || p.p1ManualId || p.p1Name || p.p2Uid || p.p2ManualId || p.p2Name) {
        add({ uid: p.p1Uid, manualParticipantId: p.p1ManualId, isPlaceholder: p.isPlaceholder === true }, p.p1Name || p.p1Uid);
        add({ uid: p.p2Uid, manualParticipantId: p.p2ManualId, isPlaceholder: p.isPlaceholder === true }, p.p2Name || p.p2Uid);
      } else {
        add(p, p.displayName || p.name || p.uid);
      }
    });
    return n;
  }
  // Divisão em grupos a partir dos inscritos + slider.
  function _groupInfo(cfg) {
    var t = S && S.t;
    var people = _peopleCount(t);
    var isDupla = cfg.disputa === 'dupla';
    var units = isDupla && !window.FORMAT2.isGroupRotation(cfg.parceria) ? Math.floor(people / 2) : people;
    if (cfg.teamCompetition && cfg.teamCompetition.enabled && t && typeof window._diagnoseAll === 'function') {
      var diagnosis = window._diagnoseAll(t);
      if (diagnosis && Number.isFinite(Number(diagnosis.effectiveTeams))) units = Math.max(0, Number(diagnosis.effectiveTeams));
    }
    var resolved = window.FORMAT2.resolveTurnos(cfg, units);
    var equalOnly = cfg.gruposEqualOnly != null ? cfg.gruposEqualOnly : !!(t && t.gruposEqualOnly);
    var assessment = window.FORMAT2.assessGroupSchedule(units, resolved.groups, cfg.classificationSchedule,
      equalOnly, resolved.turnos === 'ida_volta');
    var ng = resolved.groups == null ? assessment.groups : resolved.groups;
    var base = assessment.base, rem = assessment.remainder;
    var small = base, big = base + (rem > 0 ? 1 : 0);
    var perU = units > 0 ? (small + (rem ? '–' + big : '')) : '—';
    var perP = units > 0 ? (isDupla ? (small * 2 + (rem ? '–' + big * 2 : '')) : perU) : '—';
    return { t: t, people: people, isDupla: isDupla, units: units, ng: ng, base: base, rem: rem, perU: perU, perP: perP, assessment: assessment, formation: resolved };
  }
  function _effectiveGroupCount(cfg, gi) {
    var resolved = window.FORMAT2.resolveTurnos(cfg || {}, gi && gi.units);
    if (resolved.groups != null) return Math.max(1, Number(resolved.groups) || 1);
    return cfg && cfg.parceria === 'rotation_groups_8'
      ? Math.ceil(Math.max(0, Number(gi && gi.units) || 0) / 8)
      : Math.max(1, Number(cfg && cfg.grupos) || 1);
  }
  window._f2ProjectCurrentPhases=function(capacities) {
    if(!S || !window.ScoreplacePhaseGridPlan) return null;
    var cats=_sliderCategories(), limits=capacities || Object.fromEntries(cats.map(cat=>[cat,_sliderPopulation(cat,0)]));
    var val=function(id,fallback){var e=document.getElementById(id);return e ? Number(e.value)||0 : fallback || 0;};
    var t=Object.assign({},S.t || {},{sport:S.sport,fmt2:S.cfg,participants:[],matches:[],rounds:[],groups:[],
      combinedCategories:cats.filter(Boolean),maxParticipantsByCategory:limits,maxParticipantsPerCategory:0,
      maxParticipants:cats.reduce((n,cat)=>n+Number(limits[cat] || 0),0),
      courtCount:Math.max(1,val('tourn-court-count',S.t?.courtCount || 1)),
      gameDuration:val('tourn-game-duration',S.t?.gameDuration || 30) || 25,callTime:val('tourn-call-time',S.t?.callTime),
      warmupTime:val('tourn-warmup-time',S.t?.warmupTime),scoring:_scoringInicial() || S.t?.scoring});
    var setup=document.getElementById('setup-first-round-only');
    if(setup) t.setupScope=setup.checked?'first_round':'every_game';
    var result=window.ScoreplacePhaseGridPlan.project(t,window);
    return Object.assign(result,{tournament:t});
  };
  function _categoryProjection(cfg,capacities) {
    try {
      var result=window._f2ProjectCurrentPhases(capacities);
      if(!result) return null;
      var groupGames=0,elimGames=0;
      result.jobs.forEach(function(job){if(result.phases[job.phaseIndex].kind==='classification') groupGames+=job.games;else elimGames+=job.games;});
      return {groupGames:groupGames,elimGames:elimGames};
    }catch(_){return null;}
  }
  window._f2ProjectedRotation=function(capacities){return S ? _categoryProjection(S.cfg,capacities) : null;};
  window._f2GroupFormatLabels=function(){
    if(!S || !S.cfg.classifAtiva) return ['Eliminatória'];
    return [...new Set(_sliderRules(0).map(rule=>_sliderData(rule,0).preview.split(' · ')[0]))];
  };
  // Linha de estimativa (inscritos + tempo de jogos).
  function _estimateLine(cfg) {
    var gi = _groupInfo(cfg);
    if (!gi.people) return '<div style="margin-top:8px;font-size:0.72rem;color:var(--text-muted);">Sem inscritos ainda — a divisão dos grupos e o tempo aparecem quando houver gente inscrita.</div>';
    if (cfg.parceria === 'super_eight' && gi.people !== 8) return '<div role="status" style="margin-top:8px;font-size:0.72rem;color:var(--sp-c-fbbf24,#fbbf24);">Super 8 individual exige exatamente oito atletas ativos; inscritos agora: ' + gi.people + '.</div>';
    var groupGames = cfg.parceria === 'super_eight' ? 14 : cfg.parceria === 'rotation_groups_8'
      ? _effectiveGroupCount(cfg, gi) * Math.max(1, parseInt(cfg.rodadas.n, 10) || 5) * 2 : gi.assessment.matches;
    var elimGames = 0;
    if (cfg.eliminatoria.ativa) {
      var q = _effectiveGroupCount(cfg, gi) > 1 ? _effectiveGroupCount(cfg, gi) * cfg.classificados : cfg.classificados;
      q = Math.min(q, gi.units);
      if (q >= 2) elimGames = (q - 1) + (q >= 4 ? 1 : 0);   // 3º lugar sempre (≥4 tem 2 semis)
    }
    if (cfg.rotationCategoryRules || (cfg.groupCategoryRules && cfg.groupCategoryRules.length)) {
      var projection = _categoryProjection(cfg);
      if (!projection) return '<div role="status">A estimativa depende da formação dos grupos por categoria e da chave projetada.</div>';
      groupGames = projection.groupGames;
      elimGames = projection.elimGames;
    }
    var cc = parseInt((document.getElementById('tourn-court-count') || {}).value, 10) || (gi.t && gi.t.courtCount) || 1;
    // ⛔ grupos e eliminatória podem ter formatos DIFERENTES: cada metade usa o
    // tempo da SUA partida em vez de um minuto único pro total.
    var gdG = _minPartidaForm(gi, _scoringInicial());
    var gdE = _minPartidaForm(gi, _elimEffScoring(cfg.eliminatoria || {}));
    var totalGames = Math.round(groupGames + elimGames);
    var mins = Math.ceil((Math.round(groupGames) * gdG + Math.round(elimGames) * gdE) / Math.max(1, cc));
    var hh = Math.floor(mins / 60), mm = mins % 60;
    var timeStr = hh > 0 ? (hh + 'h' + (mm ? ' ' + mm + 'min' : '')) : (mm + 'min');
    var gdTxt = (gdG === gdE) ? (gdG + 'min') : (gdG + '/' + gdE + 'min');
    return '<div style="margin-top:8px;font-size:0.78rem;color:var(--sp-c-a5b4fc,#a5b4fc);background:rgba(99,102,241,0.08);border-radius:8px;padding:9px 11px;line-height:1.5;">' +
      '👥 <b>' + gi.people + '</b> inscritos' + (gi.isDupla && cfg.parceria !== 'rotation_groups' && cfg.parceria !== 'rotation_groups_8' ? (' → <b>' + gi.units + '</b> duplas') : '') +
      ' · ⏱️ ~<b>' + timeStr + '</b> de jogos <span style="opacity:0.8;">(' + totalGames + ' jogos · ' + gdTxt + ' · ' + cc + ' quadra' + (cc > 1 ? 's' : '') + ')</span></div>';
  }
  // Resumo da eliminatória (abaixo do slider de classificados): pessoas/equipes, jogos, tempo.
  function _elimSummary(cfg) {
    if (!cfg.eliminatoria || !cfg.eliminatoria.ativa) return '';
    var gi = _groupInfo(cfg);
    var isDupla = cfg.disputa === 'dupla';
    if (cfg.rotationCategoryRules || (cfg.groupCategoryRules && cfg.groupCategoryRules.length)) {
      var projection = _categoryProjection(cfg);
      return projection ? '<div>' + projection.elimGames + (projection.elimGames === 1 ? ' jogo' : ' jogos') + ' na eliminatória</div>' : '';
    }
    var effectiveGroups = _effectiveGroupCount(cfg, gi);
    var perGroupScope = (effectiveGroups > 1 || cfg.parceria === 'rotation_groups_8' || (cfg.groupCategoryRules && cfg.groupCategoryRules.length)) && cfg.classifScope !== 'overall';
    // v4.4.40: "Todos" → o total é o nº REAL de inscritos (não o classificados). Sem inscritos,
    // não dá pra saber quantos "todos" são → mensagem em vez de número fixo.
    if (cfg.eliminatoria.qualifyAll) {
      if (gi.units <= 0) {
        return '<div style="margin-top:8px;font-size:0.78rem;color:var(--sp-c-fde68a,#fde68a);background:rgba(251,191,36,0.09);border:1px solid rgba(251,191,36,0.18);border-radius:8px;padding:9px 11px;line-height:1.5;">👥 <b>Todos</b> os inscritos entram na eliminatória — o total (duplas · jogos · tempo) aparece quando houver gente inscrita.</div>';
      }
    }
    var rankedIndividuals = isDupla && cfg._scoreBy === 'individual';
    var available = rankedIndividuals ? gi.people : gi.units;
    var extras = (!cfg.eliminatoria.qualifyAll && perGroupScope && cfg.eliminatoria.bestNextByGroup)
      ? Number(cfg.eliminatoria.bestNextByGroup.count || 0) : 0;
    var q = cfg.eliminatoria.qualifyAll ? available : (perGroupScope ? effectiveGroups * cfg.classificados : cfg.classificados) + extras;
    if (available > 0) q = Math.min(q, available);
    var teams = Math.max(0, rankedIndividuals ? Math.floor(q / 2) : q);
    var people = rankedIndividuals ? q : teams * (isDupla ? 2 : 1);
    var games = (teams >= 2) ? (teams - 1) + (teams >= 4 ? 1 : 0) : 0;   // 3º lugar sempre
    // v2.0.74: tempo POR SET × sets da partida DESTA fase (a eliminatória).
    var gd = _minPartidaForm(gi, _elimEffScoring(cfg.eliminatoria || {}));
    var cc = parseInt((document.getElementById('tourn-court-count') || {}).value, 10) || (gi.t && gi.t.courtCount) || 1;
    var mins = Math.ceil(games * gd / Math.max(1, cc));
    var hh = Math.floor(mins / 60), mm = mins % 60;
    var timeStr = hh > 0 ? (hh + 'h' + (mm ? ' ' + mm + 'min' : '')) : (mm + 'min');
    var who = isDupla
      ? ('👥 <b>' + people + '</b> ' + (people === 1 ? 'pessoa' : 'pessoas') + ' → <b>' + teams + '</b> ' + (teams === 1 ? 'dupla' : 'duplas'))
      : ('👥 <b>' + teams + '</b> ' + (teams === 1 ? 'jogador' : 'jogadores'));
    return '<div style="margin-top:8px;font-size:0.78rem;color:var(--sp-c-fde68a,#fde68a);background:rgba(251,191,36,0.09);border:1px solid rgba(251,191,36,0.18);border-radius:8px;padding:9px 11px;line-height:1.5;">' +
      who + ' na eliminatória · 🎯 <b>' + games + '</b> ' + (games === 1 ? 'jogo' : 'jogos') +
      (games > 0 ? ' · ⏱️ ~<b>' + timeStr + '</b>' : '') + '</div>';
  }
  // Apresentação abaixo do slider: rótulo (1 grupo) OU números grandes (N grupos).
  function _estruturaBlock(cfg) {
    var gi = _groupInfo(cfg);
    if (cfg.rotationCategoryRules || (cfg.groupCategoryRules && cfg.groupCategoryRules.length)) return _estimateLine(cfg);
    var superEight = window.FORMAT2.superEightVariant(cfg,
      cfg.parceria === 'super_eight' ? gi.people : gi.units);
    // Categorias distintas geram grades separadas; oito duplas no total não
    // provam oito duplas elegíveis dentro de cada grade.
    if (superEight === 'pairs' && gi.t && Array.isArray(gi.t.categories) && gi.t.categories.length > 1) superEight = null;
    if (gi.formation && gi.formation.invalid) return '<div role="status" style="font-size:0.78rem;color:var(--sp-c-f87171,#f87171);">Essa divisão precisa ter pelo menos duas unidades em cada grupo. Ajuste o número de grupos ou o tamanho.</div>' + _estimateLine(cfg);
    if (gi.formation && gi.formation.groups == null) {
      return '<div style="font-size:0.78rem;color:var(--text-muted);margin-top:6px;">Tamanho definido: <b>' + gi.formation.value + ' unidades por grupo</b>. O número e a distribuição dos grupos serão calculados quando os inscritos estiverem disponíveis.</div>' + _estimateLine(cfg);
    }
    if (gi.ng === 1) {
      return '<div style="font-size:0.78rem;color:var(--text-muted);margin-top:6px;">1 grupo — <b>' +
        (cfg.parceria === 'super_eight' ? 'Super 8 individual' : superEight === 'pairs' ? 'Super 8 de duplas' : 'Pontos Corridos') +
        '</b> (tabela única, classificação geral)</div>' +
        (superEight === 'pairs' ? '<div style="font-size:0.72rem;color:var(--text-muted);margin-top:6px;">Oito duplas fixas, montadas ou sorteadas; sete jogos por dupla, sem repetir adversária.</div>' : '') +
        _estimateLine(cfg);
    }
    var col = function (n, lbl) { return '<div style="text-align:center;min-width:62px;"><div style="font-size:1.7rem;font-weight:800;color:var(--sp-c-c7d2fe,#c7d2fe);line-height:1;">' + n + '</div><div style="font-size:0.66rem;color:var(--text-muted);margin-top:3px;">' + lbl + '</div></div>'; };
    var dot = '<div style="font-size:1.1rem;color:var(--text-muted);align-self:center;opacity:0.6;">·</div>';
    var nums = '<div style="display:flex;gap:10px;justify-content:center;align-items:flex-start;margin:12px 0 4px;">' +
      col(gi.ng, 'grupos') + dot + col(gi.perP, gi.isDupla ? 'pessoas/grupo' : 'por grupo') +
      (gi.isDupla ? (dot + col(gi.perU, 'duplas/grupo')) : '') + '</div>' +
      '<div style="text-align:center;font-size:0.74rem;color:var(--text-muted);"><b>' +
      (superEight === 'pairs' ? 'Super 8 de duplas por grupo' : 'Fase de Grupos') +
      '</b> — classificação por grupo</div>';
    return nums + _estimateLine(cfg);
  }

  // Agenda da fase de grupos. O valor é sempre por UNIDADE que joga (jogador no
  // individual, dupla na disputa em dupla), nunca por "time" agregado. Ausência
  // do objeto significa todos-contra-todos, preservando exatamente o legado.
  function _groupScheduleWarning(cfg) {
    var gi = _groupInfo(cfg), a = gi.assessment;
    if (!a.known || !cfg.classificationSchedule || (!a.unequalGroups && !a.limitedGroups)) return '';
    if (typeof cfg.classificationSchedule.allowRepeat === 'boolean') return '<div role="status">O número de jogos escolhido é incompatível com o tamanho ou a paridade dos grupos.</div>';
    var unit = window._t(gi.isDupla ? 'format2.scheduleUnitPair' : 'format2.scheduleUnitPerson');
    var message = a.minGames === a.maxGames
      ? window._t('format2.scheduleLimited', { games: a.maxGames, unit: unit })
      : window._t('format2.scheduleUnequal', { min: a.minGames, max: a.maxGames, unit: unit });
    return '<div role="status" style="margin-top:8px;padding:9px 11px;border:1px solid var(--sp-c-f59e0b,#f59e0b);border-radius:8px;color:var(--text-main);background:rgba(245,158,11,.12);font-size:.75rem;line-height:1.45;">' + message + '</div>';
  }
  function _groupScheduleControls(cfg) {
    var gi = _groupInfo(cfg);
    var sched = cfg.classificationSchedule;
    var isShort = !!sched;
    var current = isShort ? Math.max(1, parseInt(sched.gamesPerUnit, 10) || 1) : 1;
    var unit = gi.isDupla ? 'dupla' : 'atleta';
    var locked = _hasDrawnGames();
    var html = _pill(!isShort, 'window._f2GroupSchedule(null)', '🔄 Todos contra todos', null, locked) +
      _pill(isShort, "window._f2GroupSchedule('short')", 'Definir jogos por ' + unit, null, locked);
    if (!isShort) return html;
    html += '<div><label>Jogos por ' + unit + ' no grupo <input id="f2-group-schedule-games" type="number" min="1" max="128" value="' +
      current + '"' + (locked ? ' disabled' : '') + ' onchange="window._f2GroupSchedule(this.value,this)"></label></div>' +
      '<label><input type="checkbox" id="f2-group-repeat"' + (sched.allowRepeat ? ' checked' : '') + (locked ? ' disabled' : '') +
        ' onchange="window._f2GroupRepeat(this.checked)"> Permitir repetir adversários</label>' +
      '<div id="f2-group-schedule-warning" aria-live="polite">' + _groupScheduleWarning(cfg) + '</div>' +
      '<div style="margin-top:10px;font-size:.72rem;color:var(--text-muted);margin-bottom:6px;">Montagem dos confrontos</div>' +
      _pill(sched.mode !== 'structured', 'window._f2GroupScheduleMode(\'free\')', '🎲 Sorteio livre') +
      _pill(sched.mode === 'structured', 'window._f2GroupScheduleMode(\'structured\')', '📋 Estruturado') +
      '<div style="font-size:.72rem;color:var(--text-muted);margin-top:6px;line-height:1.45;">' +
        (sched.mode === 'structured' ? 'A grade segue uma ordem estável baseada nos identificadores das unidades, nunca em nomes.' : 'Os confrontos são sorteados dentro de cada grupo.') +
      '</div>';
    return html;
  }

  // Nas classificatórias de várias rodadas, cluster é uma faixa móvel da
  // classificação — não uma divisão fixa de inscritos. A cada novo sorteio o
  // motor recompõe as faixas pelos pontos e só repete adversário depois de esgotar
  // os inéditos no cluster então vigente.
  function _classificationPairingControls(cfg) {
    var pairing = cfg.classificationPairing || {};
    var byRanking = pairing.strategy !== 'free_draw';
    var size = Math.max(2, parseInt(pairing.clusterSize, 10) || 8);
    var html = '<div style="font-size:.72rem;color:var(--text-muted);margin:12px 0 6px;">Pareamento das rodadas</div>' +
      _pill(byRanking, 'window._f2ClassificationPairing(\'ranking_clusters\')', '📈 Por desempenho') +
      _pill(!byRanking, 'window._f2ClassificationPairing(\'free_draw\')', '🎲 Livre') +
      '<div style="font-size:.72rem;color:var(--text-muted);margin-top:6px;line-height:1.45;">' +
        (byRanking
          ? 'A classificação acumulada recalcula os clusters a cada rodada. Antes de repetir um adversário, o sorteio busca todos os demais do cluster atual.'
          : 'Os confrontos são sorteados livremente; ainda assim, o motor evita repetições desnecessárias.') +
      '</div>';
    if (!byRanking) return html;
    html += '<div style="font-size:.72rem;color:var(--text-muted);margin:12px 0 6px;">Participantes por cluster <b id="f2-cluster-size-value" style="color:var(--text-main);">' + size + '</b></div>' +
      '<input id="f2-cluster-size" type="range" min="2" max="32" step="1" value="' + size + '" oninput="window._f2ClusterSize(this.value,this)" style="width:100%;">' +
      '<div style="font-size:.72rem;color:var(--text-muted);margin-top:6px;line-height:1.45;">O número define somente o tamanho da faixa; ninguém fica preso nela entre rodadas.</div>';
    return html;
  }

  // Bloco de fase (Classificatória / Eliminatória) com cabeçalho destacado.
  function _phaseBlock(title, color, inner, headerRight) {
    var pill = '<span style="display:inline-block;font-size:1.05rem;font-weight:800;letter-spacing:0.4px;text-transform:uppercase;color:' + window._spCor(color, 'color') + ';background:' + window._spCor(color, 'background') + '22;padding:9px 17px;border-radius:10px;">' + title + '</span>';
    var header = headerRight
      ? '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:16px;">' + pill + headerRight + '</div>'
      : '<div style="margin-bottom:16px;">' + pill + '</div>';
    return '<div style="border:1px solid ' + window._spCor(color, 'borda') + '55;border-radius:14px;padding:14px 14px 8px;margin-bottom:16px;background:' + window._spCor(color, 'background') + '0d;">' +
      header + inner + '</div>';
  }

  // O número de duplas NÃO é uma propriedade implícita da categoria nem uma
  // particularidade do Neon. A categoria dita quem pode se inscrever; a agenda
  // declarada pelo organizador dita quantas duplas daquele time entram nela.
  // O mapa é persistido dentro da agenda da competição, portanto chega idêntico
  // à prévia, à Cloud Function e ao re-sorteio.
  function _teamCompetitionCategories(tc) {
    var categories = [];
    var add = function (value) {
      var name = String(value || '').trim();
      if (name && categories.indexOf(name) < 0) categories.push(name);
    };
    var t = S && S.t;
    ((t && (t.combinedCategories || t.categories)) || []).forEach(add);
    if (!categories.length && typeof window._getCreateFormCategoryData === 'function') {
      try { (((window._getCreateFormCategoryData() || {}).combinedCategories) || []).forEach(add); } catch (e) {}
    }
    var saved = tc && tc.schedule && tc.schedule.pairsPerTeamByCategory;
    Object.keys(saved || {}).forEach(add);
    Object.keys((tc && tc.schedule && tc.schedule.gamesPerPairByCategory) || {}).forEach(add);
    return categories;
  }
  function _capacityRoot() {
    return typeof window._createTournamentEditorRoot === 'function' ? window._createTournamentEditorRoot() : document;
  }
  function _capacityField(id) {
    var root=_capacityRoot();
    return root!==document && typeof root.querySelector==='function' ? root.querySelector('#'+id) : document.getElementById(id);
  }
  function _rotationCategories() {
    if (S && S.mode === 'form' && _capacityField('tourn-gender-categories') && typeof window._getCreateFormCategoryData === 'function') {
      var data = window._getCreateFormCategoryData(_capacityRoot());
      if (data && Array.isArray(data.combinedCategories)) return data.combinedCategories;
    }
    return _teamCompetitionCategories();
  }
  function _usesFixedPairs(cfg) {
    return cfg.disputa === 'dupla' && cfg.parceria === 'fixa';
  }
  function _defaultGroupFormation(cfg) {
    return cfg.groupFormation || (cfg.parceria === 'rotation_groups_8'
      ? { mode:'size', value:8 } : { mode:'count', value:cfg.grupos });
  }
  function _categoryPeople(category) {
    if (window.ScoreplaceSuperEight && S.t) {
      return window.ScoreplaceSuperEight.categoryPopulation(Object.assign({}, S.t,
        {maxParticipantsByCategory:null,maxParticipantsPerCategory:0}), category);
    }
    var participants = ((S.t && S.t.participants) || []).filter(function (entry) {
      return entry && entry.ligaActive !== false && (!category || (window._getParticipantCategories(entry) || [])[0] === category);
    });
    return _peopleCount({ participants:participants });
  }
  function _groupPreview(cfg, category, people) {
    var pairs = _usesFixedPairs(cfg);
    var units = pairs ? Math.floor(people / 2) : people;
    var plan = window.FORMAT2.groupPlanForCategory(cfg, category, units, cfg.gruposEqualOnly || S.t && S.t.gruposEqualOnly);
    var a = plan.assessment;
    var sizes = Array.from({length:a.groups}, function (_, i) { return a.base + (i < a.remainder ? 1 : 0); });
    var details = !people ? 'Aguardando inscrições' : people + ' pessoas · ' + (pairs ? units + ' duplas · ' : '') +
      (plan.error || (a.groups + (a.groups === 1 ? ' grupo' : ' grupos') + ' (' + sizes.join(' + ') + ') · ' + plan.matches + ' jogos' +
        (a.waitlist ? ' · ' + a.waitlist + ' em espera' : '')));
    return { plan:plan, details:details, people:people };
  }
  function _sliderCategories() {
    var categories = _rotationCategories();
    return categories.length ? categories : [''];
  }
  function _sliderPopulation(category, phase) {
    if (phase > 0) {
      // A formação usa classificados. Sem um elenco confirmado, a geometria fica projetada.
      if (S.cfg.qualificationCategoryRules || !S.cfg.eliminatoria.qualifyAll) {
        var rules = _sliderRules(0), rule = rules.find(function (r) { return r.category === category; });
        var roster = _sliderPopulation(category, 0);
        if (!roster || !rule) return 0;
        var layout = window.FORMAT2.resolveGroupFormation(rule.groupFormation, roster, 1);
        if (layout.invalid) return 0;
        var groupCount = S.cfg.classifScope === 'per_group' ? layout.groups : 1;
        var perUnit = S.cfg.disputa === 'dupla' && S.cfg.parceria === 'fixa' ? 2 : 1;
        var quota=S.cfg.qualificationCategoryRules?.find(r=>r.category===category);
        return Math.min(roster, (quota?quota.perGroup:S.cfg.classificados) * (quota?layout.groups:groupCount) * perUnit);
      }
    }
    var actual = _categoryPeople(category);
    if (actual) return actual;
    var custom = _capacityField('tourn-custom-category-capacity');
    if (custom && custom.checked) {
      var field = _capacityField('tourn-max-by-category');
      try { var limits = JSON.parse(field && field.value || '{}'); if (Number(limits[category]) > 0) return Number(limits[category]); } catch (_) {}
    }
    var limit = _capacityField('tourn-max-per-category');
    var capacity=Number(limit && limit.value || S.t?.maxParticipantsByCategory?.[category] || S.t?.maxParticipantsPerCategory || 0);
    var tc=S.cfg.teamCompetition;
    return capacity || (tc.enabled ? 2*tc.teamCount*(tc.schedule.pairsPerTeamByCategory[category] || 1) : 0);
  }
  function _classificationAgendaOrder(cfg) {
    if (!cfg.classificationSchedule && !cfg.groupCategoryRules?.length) return '';
    var ordered=cfg.classificationSchedule?.mode==='structured';
    return _sec('Ordem dos confrontos',
      _pill(!ordered,"window._f2GroupScheduleMode('free')",'Sorteio livre')+
      _pill(ordered,"window._f2GroupScheduleMode('structured')",'Estruturado'));
  }
  window._f2SliderPartnership=function (rotate) {
    if (!S || _hasDrawnGames()) return;
    var rules=_sliderRules(0);
    S.fixedClassification=!rotate; S.sliderModes={};
    if (rotate) { S.cfg.parceria='rotation_groups'; }
    else { S.cfg.parceria='fixa'; S.cfg.rotationCategoryRules=null; }
    _storeSliderRules(0,rules); window._f2RotationSliderDone();
  };
  function _sliderSport(phase) {
    if (phase) return 'rotation';
    var cfg = S.cfg;
    if (cfg.teamCompetition.enabled) return 'team';
    if (cfg.disputa === 'individual') return 'singles';
    if (cfg.parceria === 'fixa' && (cfg.formacaoDupla === 'manual' || S.fixedClassification ||
        cfg.groupCategoryRules?.length || typeof cfg.classificationSchedule?.allowRepeat === 'boolean')) return 'pairs';
    return 'rotation';
  }
  function _restoreSliderCapacities() {
    var grid=_capacityField('category-capacity-grid');
    var section=_capacityField('category-capacity-section');
    if(section) section.classList.remove('sp-capacity-integrated');
    if (!grid || !S?.mountEl?.querySelectorAll) return;
    S.mountEl.querySelectorAll('[data-slider-capacity] > label, [data-capacity-excluded] > label').forEach(function(label) {
      var input=label.querySelector('input[data-category]');
      var caption=Array.from(label.childNodes).find(node=>node.nodeType===3);
      if(input && caption) caption.nodeValue=decodeURIComponent(input.dataset.category);
      label.classList.remove('sp-capacity-cell');
      grid.appendChild(label);
    });
  }
  window._f2RestoreSliderCapacities=_restoreSliderCapacities;
  function _placeSliderCapacities() {
    var grid=_capacityField('category-capacity-grid');
    if (!grid || !grid.querySelectorAll || !S?.mountEl?.querySelector) return;
    // The scalar model also needs its real category inputs on the first mount.
    // Refresh through the existing capacity renderer, never by cloning inputs.
    if (!grid.querySelector('input[data-category]') && !S.mountEl.querySelector('input[data-category]') &&
        !S.preparingCapacity && typeof window._syncCategoryCapacity==='function') {
      S.preparingCapacity=true;
      try { window._syncCategoryCapacity({skipPreviewUpdate:true}); }
      finally { S.preparingCapacity=false; }
    }
    var names=_sliderCategories(), common=_sliderMode(0,_sliderRules(0)).common;
    var section=_capacityField('category-capacity-section');
    if(section) section.classList.toggle('sp-capacity-integrated',!!S.mountEl.querySelector('[data-rotation-phase="0"] [data-slider-capacity]'));
    grid.querySelectorAll('input[data-category]').forEach(function (input) {
      var index=names.indexOf(decodeURIComponent(input.dataset.category));
      var slot=S.mountEl.querySelector(common?'[data-rotation-phase="0"] [data-slider-capacity]':'[data-rotation-phase="0"] [data-slider-category="'+index+'"] [data-slider-capacity]');
      if(!slot && section?.classList.contains('sp-capacity-integrated')) slot=S.mountEl.querySelector('[data-capacity-excluded]');
      if (slot) {
        var label=input.closest('label');if(!label) return;
        var caption=Array.from(label.childNodes).find(node=>node.nodeType===3);
        if(caption) caption.nodeValue=common || index<0 ? decodeURIComponent(input.dataset.category) : 'Vagas';
        label.classList.add('sp-capacity-cell');
        slot.appendChild(label);
      }
    });
  }
  function _sliderRules(phase) {
    var cfg = S.cfg, sport = _sliderSport(phase), team = cfg.teamCompetition.schedule;
    var saved = phase ? cfg.eliminatoria.formationCategoryRules : cfg.rotationCategoryRules;
    var marker=phase ? cfg.eliminatoria.formationSliderMode : cfg.classificationSliderMode;
    var quotas=phase ? cfg.eliminatoria.formationQualificationCategoryRules : cfg.qualificationCategoryRules;
    var rows = _sliderCategories().map(function (category) {
      var row = saved?.find(function (r) { return r.category === category; });
      var ordinary = cfg.groupCategoryRules?.find(function (r) { return r.category === category; });
      var queen = phase || cfg.parceria === 'rei_rainha' || (!cfg.classifAtiva && cfg.eliminatoria.openReiRainha);
      var form = row?.groupFormation || (queen ? {mode:'size',value:4} : ordinary?.groupFormation || cfg.groupFormation);
      if (sport === 'team') form = team.groupFormationByCategory?.[category] || {mode:'size',value:team.teamsPerGroup};
      if (!form) form = sport === 'rotation' ? {mode:'size',value:8} : {mode:'count',value:cfg.grupos};
      var pairs = sport === 'team' || sport === 'pairs' || !phase && !row?.groupFormation && _usesFixedPairs(cfg);
      var formation = {mode:form.mode,value:form.value * (form.mode === 'size' && pairs ? 2 : 1)};
      var rounds = sport === 'team' ? team.gamesPerPairByCategory?.[category] || team.gamesPerPair :
        row?.rounds || (queen ? 3 : cfg.parceria === 'rotation_groups_8' ? cfg.rodadas.n :
          ordinary?.gamesPerUnit || cfg.classificationSchedule?.gamesPerUnit);
      if (!rounds && sport !== 'rotation') {
        var people = _sliderPopulation(category, phase);
        var groupSize = formation.mode === 'size' ? formation.value : Math.floor(people / formation.value);
        rounds = Math.max(1, Math.floor(groupSize / (pairs ? 2 : 1)) - 1);
      }
      return {category:category,groupFormation:formation,rounds:rounds || 7,
        ...(!phase && sport==='rotation' ? {groupAlternation:row?.groupAlternation===true} : {}),
        perGroup:quotas?.find(q=>q.category===category)?.perGroup || cfg.classificados || 2,
        allowRepeatPartners:sport === 'rotation' ? row?.allowRepeatPartners ?? (!queen && cfg.rotationAllowRepeatPartners === true)
          : sport !== 'team' && (ordinary?.allowRepeat ?? cfg.classificationSchedule?.allowRepeat ?? false),
        destination:phase || cfg.eliminatoria.ativa && (!row || row.destination === 'elimination') ? 'elimination' : 'ranking'};
    });
    if (marker==='common' && rows.length) {
      var source = rows.find(function (r) {
        return saved?.some(old=>old.category===r.category) || cfg.groupCategoryRules?.some(old=>old.category===r.category) ||
          Object.hasOwn(team.groupFormationByCategory || {},r.category);
      }) || rows[0];
      return rows.map(r=>_copySliderValues(r,source));
    }
    return rows;
  }
  function _sliderData(rule, phase) {
    var sport = _sliderSport(phase), people = _sliderPopulation(rule.category, phase), form = rule.groupFormation;
    var unit = (sport === 'pairs' || sport === 'team') ? 2 : 1;
    var minimum = sport === 'singles' ? 2 : 4;
    var units = Math.floor(people / unit);
    var formation = {mode:form.mode,value:form.mode === 'size' ? form.value/unit : form.value};
    var count = form.mode === 'count' ? form.value : people ? Math.ceil(units / formation.value) : 0;
    var layout = window.FORMAT2.resolveGroupFormation(formation, units, 1);
    var sizes = (layout.sizes || []).map(function (value) {return value * unit;});
    var size = form.mode === 'size' ? form.value : sizes.length ? Math.max.apply(null,sizes) : people ? Math.ceil(people/count) : 0;
    var sizeText = sizes.length && Math.min.apply(null,sizes)!==Math.max.apply(null,sizes)
      ? Math.min.apply(null,sizes)+'–'+Math.max.apply(null,sizes) : String(size || 'A definir');
    var error, matches, name;
    if (sport === 'rotation') {
      var plan = window.FORMAT2.groupPlanForCategory({parceria:'rotation_groups',rotationCategoryRules:[rule]},rule.category,people,false);
      error = plan.error;
      matches = plan.matches;
      var actual = sizes.length ? sizes : [size];
      name = !rule.allowRepeatPartners && actual.every(n=>n===4) && rule.rounds===3 ? 'Rei e Rainha' :
        !rule.allowRepeatPartners && actual.every(n=>n===8) && rule.rounds<=7 ? 'Super Oito ativado' : 'Fase de grupos';
    } else {
      var schedule = {gamesPerUnit:rule.rounds,allowRepeat:rule.allowRepeatPartners,mode:'free'};
      var plan = window.FORMAT2.groupPlanForCategory({groupFormation:formation,classificationSchedule:schedule},rule.category,units,false);
      error = unit===2 && (people%2 || !Number.isInteger(formation.value)) ? 'Informe um número par de pessoas para formar duplas.' : plan.error;
      if (!error && !people && form.mode==='size' && !rule.allowRepeatPartners && rule.rounds>=formation.value)
        error = 'O número de jogos excede os adversários disponíveis no grupo.';
      matches = plan.matches;
      name = 'Fase de grupos';
    }
    var preview = error || (name+' · '+(people ? count+(count===1?' grupo':' grupos')+' · '+sizeText+' pessoas por grupo · '+matches+' jogos'
      : 'A divisão final depende do elenco da categoria')+' · '+rule.rounds+' jogos por jogador');
    return {num:count,size:size,sizes:sizes,sizeText:sizeText,people:people,error:error,preview:preview,unit:unit,minimum:minimum,
      qualifierLimit:sizes.length?Math.floor(Math.min.apply(null,sizes)/unit):128,
      maxGames:Math.max(rule.rounds,rule.allowRepeatPartners ? 128 : Math.max(1,Math.floor((size || 128)/unit)-1))};
  }
  function _sliderId(kind,phase,index) { return 'f2-rotation-'+kind+'-'+(phase ? phase+'-' : '')+index; }
  function _sliderMode(phase,rules) {
    if (!S.sliderModes) S.sliderModes={};
    if (!S.sliderModes[phase]) {
      var saved = phase ? S.cfg.eliminatoria.formationCategoryRules : S.cfg.rotationCategoryRules ||
        S.cfg.groupCategoryRules?.length && S.cfg.groupCategoryRules || S.cfg.teamCompetition.schedule?.groupFormationByCategory;
      var signature = r => JSON.stringify([r.groupFormation,r.rounds,r.allowRepeatPartners,r.perGroup]);
      var marker=phase ? S.cfg.eliminatoria.formationSliderMode : S.cfg.classificationSliderMode;
      S.sliderModes[phase] = {common:marker ? marker==='common' : !saved || !rules.length || rules.every(r=>signature(r)===signature(rules[0]))};
    }
    return S.sliderModes[phase];
  }
  function _copySliderValues(rule, source) {
    return Object.assign({},rule,{groupFormation:Object.assign({},source.groupFormation),rounds:source.rounds,
      allowRepeatPartners:source.allowRepeatPartners,perGroup:source.perGroup});
  }
  function _sliderToggle(id,label,on,change,disabled) {
    return '<label style="display:flex;align-items:center;gap:9px;font-size:.82rem;margin:10px 0;cursor:pointer;color:var(--text-main)">'+
      '<span class="toggle-switch toggle-sm" style="flex-shrink:0"><input type="checkbox" id="'+id+'" aria-label="'+label+'"'+
      (on?' checked':'')+(disabled?' disabled':'')+' onchange="'+change+'"><span class="toggle-slider"></span></span>'+label+'</label>';
  }
  function _qualificationEnabled(rule,phase) {
    return S.cfg.eliminatoria.ativa && (phase || rule.destination==='elimination');
  }
  function _rotationSliderCards(phase) {
    var disabled = _hasDrawnGames() ? ' disabled' : '', rules = _sliderRules(phase), sport = _sliderSport(phase);
    var mode = _sliderMode(phase,rules);
    function partnerControls(rule,index,data) {
      if(sport==='team') return '<div style="font-size:.75rem">Cada jogador mantém sua dupla. A grade por times usa adversários distintos.</div>';
      var html=_sliderToggle(_sliderId('partners',phase,index),sport==='rotation'?'Não repetir parceiro':'Não repetir adversário',!rule.allowRepeatPartners,
        'window._f2RotationSlider('+phase+','+index+',\'partners\',!this.checked);window._f2RotationSliderDone()',!!disabled);
      var core=window.ScoreplaceGroupAlternation;
      if(!phase && sport==='rotation' && core) {
        var status=core.categoryEligibility(rule,data.sizes);
        if(status.eligible || rule.groupAlternation) html+='<div data-category-alternation="'+_safe(rule.category)+'">'+
          _sliderToggle(_sliderId('alternation',phase,index),'Alternar grupos',rule.groupAlternation===true,
            'window._f2CategoryAlternation('+index+',this.checked)',!!disabled)+
          '<div style="font-size:.72rem;color:var(--text-muted)">'+_safe(status.eligible?
            '':status.reason)+'</div></div>';
      }
      return '<div class="sp-category-partner-controls">'+html+'</div>';
    }
    var html = '<div data-rotation-phase="'+phase+'" style="min-width:0;max-width:860px;width:100%;color:var(--text-main)">';
    if (rules.length>1) {
      html += _sliderToggle('f2-slider-common-'+phase,'Personalizar por categoria',!mode.common,
        'window._f2SliderCommon('+phase+',!this.checked)',!!disabled)+
        '<div style="font-size:.75rem;color:var(--text-muted)">'+(mode.common?'Mesma configuração para todas as categorias':'Configuração de cada categoria')+'</div>';
      if (mode.common) ['count','size'].forEach(function (key) {
        html += '<button type="button" data-slider-priority="'+key+'" aria-pressed="'+(rules[0].groupFormation.mode===key)+'"'+disabled+
          ' onclick="window._f2SliderPriority('+phase+',\''+key+'\')">'+(key==='size'?'Pessoas por grupo':'Grupos por categoria')+'</button>';
      });
    }
    function preview(rule,index,data) {
      var grid=_capacityField('category-capacity-grid');
      var namedCapacity=!phase && Array.from(grid?.querySelectorAll('input[data-category]') || []).some(input=>decodeURIComponent(input.dataset.category)===rule.category);
      return '<div data-slider-category="'+index+'" style="min-width:0;overflow-wrap:anywhere;color:var(--text-main)">'+
        '<div data-slider-population style="font-size:.8rem">'+(mode.common && !namedCapacity?_safe(rule.category || 'Classificação geral')+' · ':'')+
        (data.people ? data.people+' pessoas' : 'Quantidade a definir')+'</div>'+
        '<div id="'+_sliderId('preview',phase,index)+'" role="status" style="font-size:.78rem;margin:6px 0">'+_safe(data.preview)+'</div></div>';
    }
    rules.forEach(function (rule,index) {
      var data = _sliderData(rule,phase);
      if(mode.common && index) return;
      function slider(kind,label,value,shown,min,max,step,extraDisabled) {
        var id = _sliderId(kind,phase,index);
        return '<div data-slider-kind="'+kind+'" style="min-width:0"><label for="'+id+'" style="display:block;font-size:.82rem;margin-bottom:5px;color:var(--text-main)">'+label+
          ' <output id="'+id+'-value" style="font-weight:700">'+shown+'</output></label>' +
          '<input id="'+id+'" type="range" min="'+min+'" max="'+max+'" step="'+(step || 1)+'" value="'+value+'" style="width:100%;min-width:0;box-sizing:border-box"'+disabled+(extraDisabled?' disabled':'')+
          ' oninput="window._f2RotationSlider('+phase+','+index+',\''+kind+'\',this.value)" onchange="window._f2RotationSliderDone()"></div>';
      }
      var eligible=_qualificationEnabled(rule,phase) || mode.common && rules.some(r=>_qualificationEnabled(r,phase));
      var maxQual=Math.max(1,rule.perGroup,data.qualifierLimit);
      html += '<fieldset style="min-width:0;box-sizing:border-box;margin:8px 0;padding:10px;border:1px solid var(--sp-b-255-255-255-02);border-radius:10px"><legend style="font-size:.85rem;color:var(--text-main)">'+
        _safe(mode.common?'Mesma configuração para todas':rule.category || 'Classificação geral')+'</legend>'+
        '<div data-slider-category="'+index+'" data-slider-layout class="sp-category-controls">'+
        (!phase ? '<div data-slider-capacity>'+(mode.common?'<span style="font-size:.82rem">Vagas</span>':'')+'</div>' : '<div style="font-size:.82rem">Vagas<br><strong>'+data.people+'</strong></div>')+
        slider('groups','Número de grupos',data.num || 1,data.num || 'A definir',1,Math.max(1,data.num,Math.min(128,data.people ? Math.floor(data.people/data.minimum) : 128)))+
        slider('size','Pessoas por grupo',Math.max(data.minimum,data.size),data.sizeText,data.minimum,Math.max(data.minimum,data.size,Math.min(128*data.unit,data.people || 128*data.unit)),data.unit)+
        slider('games','Jogos por jogador',rule.rounds,rule.rounds,1,data.maxGames)+
        slider('qualifiers',sport==='pairs'?'Duplas classificadas por grupo':'Classificados por grupo',rule.perGroup,rule.perGroup,1,maxQual,1,!eligible)+
        (mode.common && rules.length>1 && !phase && sport==='rotation'?'':partnerControls(rule,index,data))+'</div>'+
        (!eligible?'<div style="font-size:.75rem;color:var(--text-muted);margin-top:8px">Sem próxima fase para esta categoria.</div>':'')+
        (mode.common?'':preview(rule,index,data))+'</fieldset>';
    });
    if(mode.common) rules.forEach(function(rule,index) {
      var data=_sliderData(rule,phase);
      html+=!phase && sport==='rotation' && rules.length>1 ?
        '<fieldset data-category-controls="'+_safe(rule.category)+'" style="margin:8px 0;padding:10px;border:1px solid var(--border-color);border-radius:10px"><legend>'+_safe(rule.category || 'Classificação geral')+'</legend>'+preview(rule,index,data)+partnerControls(rule,index,data)+'</fieldset>':preview(rule,index,data);
    });
    if(!phase) html+='<div data-capacity-excluded data-slider-capacity class="sp-capacity-excluded"></div>';
    var quotas=phase?S.cfg.eliminatoria.formationQualificationCategoryRules:S.cfg.qualificationCategoryRules;
    if(!quotas && S.cfg.eliminatoria.ativa && (S.cfg.eliminatoria.qualifyAll || S.cfg.classifScope==='overall'))
      html+='<div style="font-size:.75rem;color:var(--text-muted)">Ao ajustar classificados, o avanço passa a ser definido por grupo. O corte salvo permanece até esse ajuste.</div>';
    var stored=phase ? S.cfg.eliminatoria.formationCategoryRules : S.cfg.rotationCategoryRules || S.cfg.groupCategoryRules;
    if (stored?.length && (stored.length!==rules.length || stored.some(r=>!rules.some(current=>current.category===r.category)))) {
      html += '<button type="button"'+disabled+' onclick="window._f2ApplySliderCategories('+phase+')">Aplicar às categorias atuais</button>';
    }
    return html+'</div>';
  }
  window._f2ApplySliderCategories=function (phase) {
    if (!S || _hasDrawnGames()) return;
    _storeSliderRules(phase,_sliderRules(phase)); window._f2RotationSliderDone();
  };
  function _storeSliderRules(phase,rules,qualificationChanged) {
    var cfg = S.cfg, sport = _sliderSport(phase);
    var marker=_sliderMode(phase,rules).common ? 'common' : 'category';
    if (phase) cfg.eliminatoria.formationSliderMode=marker; else cfg.classificationSliderMode=marker;
    var quotaKey=phase?'formationQualificationCategoryRules':'qualificationCategoryRules',holder=phase?cfg.eliminatoria:cfg;
    if(qualificationChanged || holder[quotaKey]) {
      holder[quotaKey]=rules.filter(r=>_qualificationEnabled(r,phase)).map(r=>({category:r.category,perGroup:r.perGroup}));
    }
    rules=rules.map(function(r){var clean=Object.assign({},r);delete clean.perGroup;return clean;});
    if (phase) { cfg.eliminatoria.formationCategoryRules=rules; return; }
    if (!cfg.classifAtiva && cfg.eliminatoria.openReiRainha) cfg.eliminatoria.openReiRainha=false;
    cfg.classifAtiva=true; cfg.rodadas.modo='todos'; cfg.rodadas.turnos='ida';
    if (sport==='rotation') {
      cfg.parceria='rotation_groups'; cfg.formacaoDupla='sorteio'; cfg.teamCompetition.enabled=false;
      if (cfg.groupCategoryRules) cfg.groupCategoryRules=[];
      delete cfg.rotationAllowRepeatPartners; delete cfg.classificationSchedule;
      cfg.rotationCategoryRules=rules;
      return;
    }
    var formed = rules.map(function (r) {
      var f=r.groupFormation, divide=sport!=='singles' && f.mode==='size';
      return {category:r.category,groupFormation:{mode:f.mode,value:divide ? f.value/2 : f.value},
        gamesPerUnit:r.rounds,allowRepeat:r.allowRepeatPartners};
    });
    if (sport==='team') {
      var schedule=cfg.teamCompetition.schedule;
      schedule.enabled=true;
      schedule.groupFormationByCategory=Object.fromEntries(formed.map(r=>[r.category,r.groupFormation]));
      schedule.gamesPerPairByCategory=Object.fromEntries(formed.map(r=>[r.category,r.gamesPerUnit]));
    } else if (rules.length===1) {
      cfg.groupFormation=formed[0].groupFormation;
      cfg.classificationSchedule=Object.assign({},cfg.classificationSchedule,{gamesPerUnit:formed[0].gamesPerUnit,
        allowRepeat:formed[0].allowRepeat,mode:cfg.classificationSchedule?.mode || 'free'});
      if (cfg.groupCategoryRules) cfg.groupCategoryRules=[];
    } else cfg.groupCategoryRules=formed;
  }
  window._f2SliderCommon=function (phase,common) {
    if (!S || _hasDrawnGames()) return;
    var rules=_sliderRules(phase), mode=_sliderMode(phase,rules);
    if (mode.common===common) return;
    if (common) {
      mode.personal=rules;
      rules=rules.map(r=>_copySliderValues(r,mode.shared || rules[0]));
    } else {
      mode.shared=rules[0];
      rules=rules.map(r=>_copySliderValues(r,mode.personal?.find(old=>old.category===r.category) || r));
    }
    mode.common=common; _storeSliderRules(phase,rules); window._f2RotationSliderDone();
  };
  window._f2SliderPriority=function (phase,key) {
    var rules=_sliderRules(phase), data=_sliderData(rules[0],phase);
    var kind=key==='count'?'groups':'size', value=key==='count' ? data.num || 1 : data.size || data.minimum;
    window._f2RotationSlider(phase,0,kind,value);window._f2RotationSliderDone();
  };
  window._f2RotationSlider=function (phase,index,kind,value) {
    if (!S || _hasDrawnGames()) return;
    var rules=_sliderRules(phase), rule=rules[index];
    if (!rule) return;
    var mode=_sliderMode(phase,rules), number=Number(value), before=_sliderData(rule,phase);
    if (kind==='partners') rule.allowRepeatPartners=value===true;
    else if (!Number.isInteger(number) || number<1 || number>(kind==='size'?128*before.unit:128)) return;
    else if (kind==='games') rule.rounds=number;
    else if (kind==='qualifiers' && (_qualificationEnabled(rule,phase) || mode.common && rules.some(r=>_qualificationEnabled(r,phase)))) rule.perGroup=number;
    else if (kind==='size' && number>=before.minimum && number%before.unit===0) rule.groupFormation={mode:'size',value:number};
    else if (kind==='groups') rule.groupFormation={mode:'count',value:number};
    else return;
    if (mode.common) rules=rules.map(r=>_copySliderValues(r,rule));
    if(!phase && rules.some(function(r) {return r.groupAlternation && !window.ScoreplaceGroupAlternation.categoryEligibility(r,_sliderData(r,phase).sizes).eligible;})) {
      if(window.showNotification) window.showNotification('Alternar grupos','Desative Alternar grupos antes de reduzir para um único grupo ou alterar o tamanho dos grupos.','warning');
      _rerender();return;
    }
    _storeSliderRules(phase,rules,kind==='qualifiers');
    rules.forEach(function (r,i) {
      if (i!==index && !mode.common) return;
      var data=_sliderData(r,phase);
      [['groups',data.num,data.num||'A definir'],['size',data.size,data.sizeText],['games',r.rounds,r.rounds],['qualifiers',r.perGroup,r.perGroup]].forEach(function (field) {
        var id=_sliderId(field[0],phase,i), input=document.getElementById(id), out=document.getElementById(id+'-value');
        if (input && field[1]) { if(field[0]==='games') input.max=String(data.maxGames); input.value=field[1]; }
        if (out) out.textContent=field[2];
      });
      var preview=document.getElementById(_sliderId('preview',phase,i)); if (preview) preview.textContent=data.preview;
    });
  };
  window._f2CategoryAlternation=function(index,value) {
    if(!S || _hasDrawnGames()) return;
    var rules=_sliderRules(0), rule=rules[index], core=window.ScoreplaceGroupAlternation;
    if(!rule || !core) return;
    var status=core.categoryEligibility(rule,_sliderData(rule,0).sizes);
    if(value && !status.eligible) {
      if(window.showNotification) window.showNotification('Alternar grupos',status.reason,'warning');
      _rerender();return;
    }
    rule.groupAlternation=value===true;
    _storeSliderRules(0,rules);window._f2RotationSliderDone();
    if(window._phaseGridCategoryAlternationChanged) window._phaseGridCategoryAlternationChanged();
  };
  window._f2RotationSliderDone=function () { if (S) { _norm(); _rerender(); if(typeof window._renderPhaseEstimate==='function') window._renderPhaseEstimate(); } };
  window._f2RotationConfigError=function () {
    if (!S) return '';
    for (var phase of [0,1]) {
      var cfg=S.cfg, names=_sliderCategories(), rules;
      if (phase) rules=cfg.eliminatoria.formationCategoryRules;
      else if (cfg.parceria==='rotation_groups') rules=cfg.rotationCategoryRules;
      else if (cfg.teamCompetition.schedule?.groupFormationByCategory || cfg.groupCategoryRules?.length ||
          typeof cfg.classificationSchedule?.allowRepeat==='boolean') rules=_sliderRules(0);
      if (!rules?.length) continue;
      if (rules.length!==names.length || rules.some(r=>!names.includes(r.category))) return 'Ajuste as regras às categorias atuais antes de salvar.';
      for (var r of rules) { var data=_sliderData(r,phase); if (data.error) return (r.category ? r.category+' · ' : '')+data.error;
        if(!phase && r.groupAlternation && !window.ScoreplaceGroupAlternation.categoryEligibility(r,data.sizes).eligible)
          return (r.category ? r.category+' · ' : '')+'Desative Alternar grupos antes de reduzir para um único grupo ou alterar o tamanho dos grupos.';
      }
    }
    return window.FORMAT2.qualificationError ? window.FORMAT2.qualificationError(S.cfg,_sliderCategories(),category=>_sliderPopulation(category,0),S.sport) : '';
  };
  function _groupCategoryControls(cfg) {
    var categories = _rotationCategories();
    var rules = cfg.groupCategoryRules || [];
    if ((categories.length < 2 && !rules.length) || cfg.teamCompetition.enabled ||
        (cfg.disputa === 'dupla' && !['fixa', 'rotation_groups_8'].includes(cfg.parceria))) return '';
    var locked = _hasDrawnGames() ? ' disabled' : '';
    var html = '<label><input type="checkbox" id="f2-group-category-enabled"' + locked + (rules.length ? ' checked' : '') +
      ' onchange="window._f2GroupByCategory(this.checked)"> Configurar grupos por categoria</label>';
    if (!rules.length) return html;
    if (rules.length !== categories.length || rules.some(function (rule) { return !categories.includes(rule.category); })) {
      html += '<div role="status">A lista de categorias mudou. <button type="button"' + locked +
        ' onclick="window._f2GroupByCategory(true)">Aplicar às categorias atuais</button></div>';
    }
    var pairs = _usesFixedPairs(cfg);
    categories.forEach(function (category, index) {
      var rule = rules.find(function (r) { return r.category === category; });
      if (!rule) return;
      var formation = rule.groupFormation;
      var mode = formation.mode === 'size' && pairs && S.groupPeople && S.groupPeople[category] ? 'people' : formation.mode;
      var value = formation.value * (mode === 'people' ? 2 : 1);
      var change = ' onchange="window._f2GroupRule(' + index + ',this)"';
      var changeMode = function (key, label) {
        return _pill(mode === key, "window._f2GroupRule(" + index + ",null,'" + key + "')", label, key, !!locked);
      };
      html += '<fieldset><legend>' + _safe(category) + '</legend><div id="f2-group-mode-' + index + '" role="group" aria-label="Definir grupos por">' +
        changeMode('count','Número de grupos') + changeMode('size',pairs ? 'Duplas por grupo' : 'Pessoas por grupo') +
        (pairs ? changeMode('people','Pessoas por grupo') : '') + '</div><label>Quantidade <input type="number" id="f2-group-value-' +
        index + '" min="' + (mode === 'count' ? 1 : mode === 'people' ? 4 : 2) + '" max="' + (mode === 'people' ? 256 : 128) +
        '" step="' + (mode === 'people' ? 2 : 1) + '" value="' + value + '"' + change + locked + '></label>';
      if (cfg.parceria !== 'rotation_groups_8') html += ' <label>Jogos por ' + (pairs ? 'dupla' : 'atleta') +
        ' <input type="number" min="1" max="128" id="f2-group-games-' + index + '" placeholder="Herdar" value="' +
        (rule.gamesPerUnit || '') + '"' + change + locked + '></label>';
      if (cfg.parceria !== 'rotation_groups_8') {
        var repeats = typeof rule.allowRepeat === 'boolean' ? rule.allowRepeat : !!cfg.classificationSchedule?.allowRepeat;
        html += '<label><input id="f2-group-repeat-' + index + '" type="checkbox"' + (repeats ? ' checked' : '') +
          locked + ' onchange="window._f2GroupRepeat(this.checked,' + index + ')"> Permitir repetir adversários</label>';
      }
      html += '<div id="f2-group-preview-' + index + '" role="status">' +
        _safe(_groupPreview(cfg, category, _categoryPeople(category)).details) + '</div></fieldset>';
    });
    return html;
  }
  window._f2GroupByCategory = function (enabled) {
    if (!S || _hasDrawnGames()) return;
    var previous = S.cfg.groupCategoryRules || [];
    var categories = _rotationCategories();
    S.cfg.groupCategoryRules = enabled && categories.length > 1 ? categories.map(function (category) {
      return previous.find(function (r) { return r.category === category; }) ||
        { category:category, groupFormation:Object.assign({}, _defaultGroupFormation(S.cfg)) };
    }) : [];
    if (enabled) { S.cfg.rodadas.modo = 'todos'; S.cfg.rodadas.turnos = 'ida'; }
    _norm(); _rerender();
  };
  window._f2GroupRule = function (index, input, selectedMode) {
    if (!S || _hasDrawnGames() || !S.cfg.groupCategoryRules) return;
    var category = _rotationCategories()[index];
    var rule = S.cfg.groupCategoryRules.find(function (r) { return r.category === category; });
    if (!rule) return;
    var selector = document.querySelector('#f2-group-mode-' + index + ' [aria-pressed="true"]');
    var number = document.getElementById('f2-group-value-' + index);
    var games = document.getElementById('f2-group-games-' + index);
    var mode = selectedMode || selector.dataset.value, value = number.valueAsNumber;
    S.groupPeople = S.groupPeople || Object.create(null);
    if (selectedMode) {
      value = rule.groupFormation.value;
      if (mode !== 'count') value = Math.max(2, value);
    } else if (mode === 'people') value /= 2;
    if (!Number.isSafeInteger(value) || value < (mode === 'count' ? 1 : 2) || value > 128) {
      number.setCustomValidity(mode === 'people' ? 'Informe um número par de pessoas entre 4 e 256.' : 'Confira a quantidade.');
      number.reportValidity(); return;
    }
    number.setCustomValidity('');
    if (games && games.value && (!Number.isSafeInteger(games.valueAsNumber) || games.valueAsNumber < 1 || games.valueAsNumber > 128)) {
      games.reportValidity(); return;
    }
    S.groupPeople[category] = mode === 'people';
    rule.groupFormation = { mode:mode === 'people' ? 'size' : mode, value:value };
    if (games && games.value) rule.gamesPerUnit = games.valueAsNumber;
    else delete rule.gamesPerUnit;
    _norm(); _rerender();
  };
  function _switchGroupUnits(toIndividuals) {
    var cfg = S.cfg;
    var formations = [cfg.groupFormation].concat((cfg.groupCategoryRules || []).map(function (r) { return r.groupFormation; }));
    for (var i = 0; i < formations.length; i++) {
      var formation = formations[i];
      if (formation && formation.mode === 'size') {
        var value = toIndividuals ? formation.value * 2 : formation.value / 2;
        if (!Number.isInteger(value) || value < 2 || value > 128) {
          S.groupNotice = 'Ajuste o tamanho dos grupos para que a formação possa ser convertida entre pessoas e duplas.';
          _rerender(); return false;
        }
      }
    }
    formations.forEach(function (formation) {
      if (formation && formation.mode === 'size') formation.value *= toIndividuals ? 2 : 0.5;
    });
    S.groupNotice = '';
    return true;
  }
  window._f2ClassificationStructure = function (value) {
    if (!S || _hasDrawnGames()) return;
    if (value === 'rei_rainha') {
      delete S.cfg.rotationAllowRepeatPartners;
      S.cfg.grupos = 1;
      delete S.cfg.groupFormation;
      delete S.cfg.classificationSchedule;
      if (S.cfg.groupCategoryRules) S.cfg.groupCategoryRules = [];
      S.cfg.parceria = 'rei_rainha'; S.cfg.formacaoDupla = 'sorteio';
    } else if (value === 'groups' || value === 'fixed') {
      if (S.cfg.parceria === 'rotation_groups_8' && value === 'groups') return;
      if (S.cfg.parceria === 'rotation_groups_8' && !_switchGroupUnits(false)) return;
      if (S.cfg.parceria === 'rotation_groups') S.cfg.rotationCategoryRules=null;
      if (S.cfg.disputa === 'dupla') { S.cfg.parceria = 'fixa'; S.fixedClassification=true; }
      delete S.cfg.rotationAllowRepeatPartners;
      S.cfg.rodadas.modo = 'todos';
    } else return;
    _norm(); _rerender();
  };

  function _rotationCategoryControls(cfg) {
    var categories = _rotationCategories();
    var rules = cfg.rotationCategoryRules || [];
    if (cfg.teamCompetition && cfg.teamCompetition.enabled) return '';
    if (categories.length < 2 && !rules.length) return '';
    var locked = _hasDrawnGames() ? ' disabled' : '';
    var html = '<label><input type="checkbox"' + locked + (rules.length ? ' checked' : '') +
      ' onchange="window._f2RotationByCategory(this.checked)"> Personalizar partidas e classificação por categoria</label>';
    if (!rules.length) return html;
    var removed = rules.filter(function (rule) { return categories.indexOf(rule.category) < 0; });
    if (removed.length) html += '<div role="status">Categorias removidas ou renomeadas: ' +
      removed.map(function (rule) { return _safe(rule.category); }).join(', ') +
      '. <button type="button"' + locked + ' onclick="window._f2RotationByCategory(true)">Aplicar às categorias atuais</button></div>';
    categories.forEach(function (category, index) {
      var rule = window.FORMAT2.rotationRuleForCategory(cfg, category);
      var rounds = rule ? rule.rounds : cfg.rodadas.n;
      var ranking = rule ? rule.destination === 'ranking' : !cfg.eliminatoria.ativa;
      html += '<fieldset><legend>' + _safe(category) + '</legend><label>Partidas por atleta <input type="number" min="1" max="' +
        (cfg.rotationAllowRepeatPartners ? 128 : 7) + '" value="' + rounds + '"' + locked + ' onchange="window._f2RotationRule(' + index +
        ',this.value,null)"></label><div role="group" aria-label="Classificação">' +
        _pill(ranking, "window._f2RotationRule(" + index + ",null,'ranking')", 'Encerrar no ranking individual', 'ranking', !!locked) +
        (cfg.eliminatoria.ativa ? _pill(!ranking, "window._f2RotationRule(" + index + ",null,'elimination')", 'Avançar à eliminatória', 'elimination', !!locked) : '') +
        '</div></fieldset>';
    });
    return html;
  }
  function _teamCategoryPairControls(tc) {
    var categories = _teamCompetitionCategories(tc);
    var gameValues = (tc.schedule && tc.schedule.gamesPerPairByCategory) || {};
    var fallbackGames = Math.max(1, parseInt(tc.schedule && (tc.schedule.gamesPerPair || tc.schedule.gamesPerTeam), 10) || 1);
    var maxGames = Math.max(1, parseInt(tc.schedule && tc.schedule.teamsPerGroup, 10) || 2) - 1;
    return '<div style="margin-top:14px;padding-top:12px;border-top:1px solid rgba(129,140,248,.22);">' +
      (!Object.keys(gameValues).length ? '<label for="f2-team-schedule-games" style="display:block;font-size:.78rem;color:var(--text-main);margin-bottom:6px;">Rodadas por dupla</label>' +
      '<input id="f2-team-schedule-games" type="number" min="1" max="' + maxGames + '" value="' + fallbackGames + '" oninput="window._f2TeamSchedule(\'gamesPerPair\',this.value,this)" onchange="window._f2TeamSchedule(\'gamesPerPair\',this.value,this)" style="width:68px;padding:7px;border-radius:8px;border:1px solid rgba(255,255,255,.25);background:var(--bg-darker,rgba(0,0,0,.25));color:var(--text-main);">' +
      '<div style="font-size:.7rem;color:var(--text-muted);margin-top:6px;">Cada rodada é um confronto por dupla. Ida e volta dobra os confrontos.</div>' : '') +
      '<label style="display:flex;align-items:center;gap:9px;margin-top:12px;font-size:.78rem;color:var(--text-main);cursor:pointer;"><span class="toggle-switch toggle-sm"><input type="checkbox" ' + (Object.keys(gameValues).length ? 'checked ' : '') + (!categories.length ? 'disabled ' : '') + 'onchange="window._f2TeamScheduleByCategory(this.checked)" aria-label="Personalizar rodadas por categoria"><span class="toggle-slider"></span></span>Personalizar rodadas por categoria</label>' +
      (Object.keys(gameValues).length ? (!categories.length
        ? '<div style="font-size:.72rem;color:var(--text-muted);margin-top:8px;">Defina as categorias para personalizar as rodadas.</div>'
        : '<div style="font-size:.72rem;color:var(--text-muted);margin:12px 0 7px;">Rodadas por categoria</div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(165px,1fr));gap:8px;">' +
      categories.map(function (category) {
        var games = Math.max(1, Math.min(maxGames, parseInt(gameValues[category], 10) || fallbackGames));
        var categoryArg = JSON.stringify(category).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        var gameHandler = "window._f2TeamCategorySchedule(" + categoryArg + ",'games',this.value,this)";
        return '<label style="display:block;padding:7px 8px;border:1px solid rgba(129,140,248,.25);border-radius:8px;font-size:.74rem;color:var(--text-muted);">' + _safe(category) + '<input type="number" min="1" max="' + maxGames + '" value="' + games + '" aria-label="Rodadas por dupla em ' + _safe(category) + '" oninput="' + gameHandler + '" onchange="' + gameHandler + '" style="display:block;width:68px;margin-top:6px;padding:5px;border-radius:6px;border:1px solid rgba(255,255,255,.2);background:var(--bg-darker,rgba(0,0,0,.25));color:var(--text-main);"></label>';
      }).join('') + '</div>') : '') +
      (Object.keys(gameValues).length ? '<div style="font-size:.68rem;color:var(--text-muted);margin-top:7px;">Desativar a personalização remove apenas as exceções de rodadas ao salvar.</div>' : '') + '</div>';
  }
  function _teamScheduleRequiresInternalAvoid(tc) {
    var values = (tc && tc.schedule && tc.schedule.pairsPerTeamByCategory) || {};
    return Object.keys(values).some(function (category) { return (parseInt(values[category], 10) || 0) > 1; });
  }

  // ── Controles do configurador (compartilhados form+page) ──
  function _bodyControls() {
    var cfg = S.cfg, sport = S.sport;
    var allowsS = window.FORMAT2.allowsSingles(sport);
    var isDupla = cfg.disputa === 'dupla';
    var um = cfg.grupos === 1;
    var rotativo = isDupla && (cfg.parceria === 'rei_rainha' || cfg.parceria === 'sorteio_rodada' || cfg.parceria === 'super_eight' || cfg.parceria === 'rotation_groups_8');
    var scoreInd = cfg._scoreBy === 'individual';
    var entryControls = '', formationControls = '', teamChoiceControls = '', scoringControls = '', structureControls = '';
    // v4.5.49: o AGENDAMENTO (Rodadas: repetição + nº de rodadas) e as DATAS/Inscrições da fase
    // (#f2-classif-extra) vão num acumulador SEPARADO — ficam SEMPRE editáveis, mesmo com a fase
    // classificatória já sorteada (o organizador ajusta a temporada: repetição, nº de rodadas e
    // término da fase durante a fase). Só a ESTRUTURA (formato/grupos/formação) é travada.
    var classifSchedule = '';

    // v4.4.51: editando torneio cuja fase classificatória JÁ FOI SORTEADA → trava a config
    // DELA (cinza, sem cliques). A eliminatória segue editável até avançar de fase. Em criação
    // (S.t null) e antes do sorteio → tudo livre. "Sorteada" = há jogos da fase 0 (t.matches
    // taggeado phaseIndex 0) OU rodadas nativas (t.rounds, Liga/Suíço classificatória).
    var _phaseLocks = _faseLockState(S);
    var _p0Drawn = _phaseLocks.p0Drawn;
    var _classifLocked = _phaseLocks.classifLocked;
    // v4.4.52: a eliminatória trava assim que a fase AVANÇA (é gerada) — depois disso a config
    // dela não muda mais. Com classificatória, a elim é fase posterior → travada quando
    // currentPhaseIndex>=1 (avançou) ou há jogos taggeados phaseIndex>=1. Sem classificatória
    // (eliminação direta), a elim É a fase 0 → trava quando a fase 0 é sorteada (_p0Drawn).
    var _elimLocked = _phaseLocks.elimLocked;

    entryControls += _binaryChoice('Simples', 'Duplas', isDupla,
      "window._f2Disputa(this.checked?'dupla':'individual')", 'Disputa em simples ou duplas');

    var isQueen = cfg.parceria === 'rei_rainha';
    structureControls += _sec('Formação dos grupos',
      '<div id="f2-category-capacity-slot"></div>'+_rotationSliderCards(0));

    // (A FORMAÇÃO das duplas — participantes montam × organizador, + times sorteados vs
    //  montados — fica nos toggles detalhados da seção "Formação de Duplas" abaixo do form.)
    if (isDupla && cfg.classifAtiva && !isQueen) {
      var pr = cfg.parceria;
      // v4.4.19: "Formação das equipes" — como as duplas se formam. Montadas (organizador/
      // jogadores montam) × Sorteio (sorteadas), ambas FIXAS. Rei/Rainha (rotativo) só com 1 grupo.
      var montadas = pr === 'fixa' && cfg.formacaoDupla === 'manual';
      // "Sorteio" cobre por-rodada (sorteio_rodada) E dupla fixa sorteada (fixa+sorteio).
      var fBtns = _binaryChoice('Inscrição individual', 'Dupla formada', montadas,
        'window._f2EnrollmentTeam(this.checked)', 'Inscrição individual ou dupla formada');
      if (montadas) {
        fBtns += _sec('Quem pode formar a dupla',
          _pill(cfg.manualPairingPolicy === 'organizer_only', "window._f2PairAuthority('organizer_only')", 'Organização') +
          _pill(cfg.manualPairingPolicy === 'athletes_only', "window._f2PairAuthority('athletes_only')", 'Atletas') +
          _pill(cfg.manualPairingPolicy === 'open', "window._f2PairAuthority('open')", 'Organização e atletas'));
      }
      if (!montadas && !cfg.teamCompetition.enabled) fBtns += _sec('Parceria nos jogos do grupo',
        _binaryChoice('Manter a dupla fixa','Trocar de parceiro',_sliderSport(0)==='rotation',
          'window._f2SliderPartnership(this.checked)','Parceria nos jogos do grupo'));
      formationControls += fBtns;
    }
    if (isDupla && !cfg.classifAtiva) {
      if (!cfg.eliminatoria.openReiRainha) {
        formationControls += _binaryChoice('Inscrição individual · sorteio', 'Dupla formada', cfg.formacaoDupla === 'manual',
          "window._f2Form(this.checked?'manual':'sorteio')", 'Inscrição individual ou dupla formada');
        if (cfg.formacaoDupla === 'manual') {
          formationControls += _sec('Quem pode formar a dupla',
            _pill(cfg.manualPairingPolicy === 'organizer_only', "window._f2PairAuthority('organizer_only')", 'Organização') +
            _pill(cfg.manualPairingPolicy === 'athletes_only', "window._f2PairAuthority('athletes_only')", 'Atletas') +
            _pill(cfg.manualPairingPolicy === 'open', "window._f2PairAuthority('open')", 'Organização e atletas'));
        }
      } else formationControls += '<p style="font-size:.84rem;color:var(--text-main);">Inscrição individual. A rodada Rei/Rainha forma as duplas pelo resultado.</p>';
    }

    // Grupos configuráveis não são um novo formato: as categorias continuam classificatórias de
    // duplas. Esta opção apenas cria oito times que recebem a soma dos resultados
    // dessas duplas. O valor fica na mesma configuração da fase para a CF sortear e
    // gravar os vínculos antes de gerar jogos — nunca como cálculo local da tela.
    if (isDupla && !rotativo && cfg.classifAtiva) {
      var tc = cfg.teamCompetition || { enabled: false, teamCount: 0, teamNames: [], formation: 'draw', internalMatches: 'avoid', ranking: 'points', aggregation: 'overall', schedule: { enabled: false, teamsPerGroup: 2, gamesPerPair: 1, gamesPerTeam: 1, pairsPerTeamByCategory: {}, gamesPerPairByCategory: {}, mode: 'structured' }, scoring: { win: 3, draw: 1, loss: 0 } };
      var tcLocked = _classifLocked;
      var tcToggle = '<label style="display:flex;align-items:center;justify-content:space-between;gap:12px;cursor:' + (tcLocked ? 'not-allowed' : 'pointer') + ';font-size:.9rem;color:var(--text-main);' + (tcLocked ? 'opacity:.55;' : '') + '">' +
        '<span>🏆 Competição por times</span><span class="toggle-switch"><input type="checkbox"' + (tc.enabled ? ' checked' : '') + (tcLocked ? ' disabled' : '') + ' onchange="window._f2TeamCompetition(this.checked)"><span class="toggle-slider"></span></span></label>';
      teamChoiceControls = _sec('Haverá times?', tcToggle +
        '<div style="font-size:.72rem;color:var(--text-muted);margin-top:7px;line-height:1.45;">' +
        (tc.enabled ? 'Sim. As duplas permanecem nas suas categorias; configure abaixo como os resultados contam para os times.' :
          'Não. A classificação usa apenas atletas ou duplas, conforme a formação escolhida.') + '</div>');
      tcToggle = '';
      if (tc.enabled) {
        var internalAvoidRequired = _teamScheduleRequiresInternalAvoid(tc);
        tcToggle += '<div style="font-size:.72rem;color:var(--text-muted);margin:6px 0 12px;line-height:1.45;">As duplas permanecem nas suas categorias e são distribuídas entre os times no sorteio. A tabela soma os resultados de todas as categorias.</div>' +
          (internalAvoidRequired
            ? '<div style="font-size:.78rem;color:#fbbf24;margin:6px 0 12px;line-height:1.45;">🔒 Com duas ou mais duplas do mesmo time na categoria, confronto interno é bloqueado obrigatoriamente.</div>'
            : _toggleRight('Duplas do mesmo time podem se enfrentar', tc.internalMatches === 'allow', 'window._f2TeamInternalMatches(this.checked)') +
              '<div style="font-size:.72rem;color:var(--text-muted);margin:6px 0 12px;">' + (tc.internalMatches === 'allow' ? 'Confrontos internos são permitidos.' : 'Confrontos internos são evitados ao montar os grupos.') + '</div>') +
          '<div style="font-size:.72rem;color:var(--text-muted);margin-bottom:6px;">Critério da classificação</div>' +
          _pill(tc.ranking !== 'games_diff', 'window._f2TeamRanking(\'points\')', '🏅 Pontos') +
          _pill(tc.ranking === 'games_diff', 'window._f2TeamRanking(\'games_diff\')', '➗ Saldo de games') +
          (tc.ranking === 'games_diff'
            ? '<div style="font-size:.72rem;color:var(--text-muted);margin-top:6px;">Ordem pelo total de games feitos menos games sofridos pelas duplas do time.</div>'
            : '<div style="margin-top:10px;font-size:.72rem;color:var(--text-muted);margin-bottom:6px;">Pontuação por resultado</div><div style="display:flex;gap:10px;flex-wrap:wrap;">' +
              '<label style="font-size:.78rem;color:var(--text-muted);">Vitória ' + _num(tc.scoring.win, -99, 99, 'window._f2TeamScore(\'win\',this.value,this)') + '</label>' +
              '<label style="font-size:.78rem;color:var(--text-muted);">Empate ' + _num(tc.scoring.draw, -99, 99, 'window._f2TeamScore(\'draw\',this.value,this)') + '</label>' +
              '<label style="font-size:.78rem;color:var(--text-muted);">Derrota ' + _num(tc.scoring.loss, -99, 99, 'window._f2TeamScore(\'loss\',this.value,this)') + '</label></div>') +
          _teamTiebreakersBlock(tc) +
          '<div style="margin-top:12px;font-size:.72rem;color:var(--text-muted);margin-bottom:6px;">Escopo da tabela</div>' +
          _pill(tc.aggregation !== 'per_category', 'window._f2TeamAggregation(\'overall\')', '🌐 Geral') +
          _pill(tc.aggregation === 'per_category', 'window._f2TeamAggregation(\'per_category\')', '🏷️ Por categoria') +
          '<div style="margin-top:8px;">' +
          _pill(tc.classificationUnit !== 'pair', 'window._f2TeamClassificationUnit(\'team\')', '👥 Por time') +
          _pill(tc.classificationUnit === 'pair', 'window._f2TeamClassificationUnit(\'pair\')', '🤝 Por dupla') + '</div>' +
          // Ação de criar é azul como os demais botões de inclusão. O `.btn` genérico
          // herda o gradiente claro e, neste painel escuro, parece desabilitado mesmo
          // estando ativo. [[regression_add_team_button_has_active_contrast]]
          '<div style="margin-top:12px;display:flex;align-items:center;justify-content:space-between;gap:10px;"><div style="font-size:.72rem;color:var(--text-muted);">Nomes dos times</div><button type="button" class="btn btn-primary btn-sm" onclick="window._f2AddTeam()">＋ Time</button></div>' +
          (!(tc.teamNames || []).length ? '<div style="font-size:.72rem;color:var(--text-muted);margin-top:6px;">Nenhum time criado. Adicione e nomeie cada time antes do sorteio.</div>' : '') +
          '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-top:6px;">' +
          (tc.teamNames || []).map(function (name, index) { return '<label style="font-size:.72rem;color:var(--text-muted);">Time ' + (index + 1) + '<span style="display:flex;gap:4px;margin-top:3px;"><input maxlength="80" placeholder="Nome do time" value="' + _safe(name).replace(/&quot;/g, '&quot;') + '" onchange="window._f2TeamName(' + index + ',this.value,this)" style="box-sizing:border-box;min-width:0;flex:1;padding:7px 8px;border-radius:8px;border:1px solid rgba(255,255,255,.2);background:var(--sp-b-255-255-255-02,rgba(0,0,0,.22));color:var(--text-main);"><button type="button" class="cancel-x-btn" title="Remover time" onclick="window._f2RemoveTeam(' + index + ')" style="cursor:pointer;">×</button></span></label>'; }).join('') + '</div>' +
          (tc.teamCount < 2 ? '<div style="font-size:.72rem;color:var(--text-muted);margin-top:12px;">Adicione ao menos dois times para definir os confrontos.</div>' :
            '<div style="margin-top:16px;padding-top:12px;border-top:1px solid rgba(129,140,248,.22);">' +
              // REGRESSÃO: range em foco não pode recriar o painel a cada pixel, mas o
              // número precisa acompanhar o arraste. IDs estáveis permitem atualizar só
              // os rótulos e o limite dependente sem interromper o gesto.
              '<div style="margin-top:12px;">' + _toggleRight('Distribuir duplas por dia quando uma categoria joga em dois dias',
                tc.schedule.originDayPolicy === 'organizer-pair-days', 'window._f2TeamPairDays(this.checked)') +
              '<div style="font-size:.72rem;color:var(--text-muted);margin-top:6px;">Os dias de cada dupla aparecem para revisão no painel de sorteio. Ative somente se quiser dividir a mesma categoria entre dias.</div></div>' +
              '<div style="margin-top:12px;font-size:.72rem;color:var(--text-muted);margin-bottom:6px;">Grade entre categorias</div>' +
              _pill(tc.schedule.mode !== 'structured', 'window._f2TeamSchedule(\'mode\',\'free\')', '🎲 Sorteio livre') +
              _pill(tc.schedule.mode === 'structured', 'window._f2TeamSchedule(\'mode\',\'structured\')', '📋 Estruturado') +
              '<div style="font-size:.72rem;color:var(--text-muted);margin-top:6px;">' + (tc.schedule.mode === 'structured' ? 'Os mesmos times se enfrentam na mesma ordem em cada categoria.' : 'Cada categoria recebe seus próprios confrontos sorteados.') + '</div>' +
            '</div>');
      }
      if (tc.enabled) scoringControls += _sec('Pontuação agregada para times', tcToggle);
    }

    var rModo = cfg.rodadas.modo;
    var rInner;
    if (window.FORMAT2.isGroupRotation(cfg.parceria)) {
      rInner = '';
    } else if (rotativo) {
      // Rei/Rainha (ou sorteio a cada rodada): SEMPRE nº de rodadas + agendamento (rotativo por
      // rodada). "Todos contra todos" não se aplica — mas o Nº de rodadas FICA (pedido do dono).
      rInner = _schedBlock(cfg.rodadas);
      if (cfg.parceria === 'rei_rainha' && cfg.rankingRemainderPolicy === 'lottery_average') {
        rInner += '<div style="font-size:0.72rem;color:var(--text-muted);margin-top:6px;">Atletas ativos sem quarteto ficam de folga por sorteio; antes de repetir uma folga, são priorizados os que ainda não folgaram.</div>';
      }
    } else if (tc && tc.enabled && tc.teamCount >= 2) {
      // A competição por times tem grade parcial própria. Os modos antigos descrevem
      // liga e esconderiam os dois controles que determinam os confrontos.
      // [[regression_team_schedule_replaces_round_mode_buttons]]
      var teamTurnos = window.FORMAT2.resolveTurnos(cfg);
      rInner = (teamTurnos.groups === 1
        ? _toggleRight('Ida e volta', teamTurnos.turnos === 'ida_volta', 'window._f2Turnos(this.checked ? \'ida_volta\' : \'ida\')')
        : '<div style="font-size:0.72rem;color:var(--text-muted);">Vários grupos: classificatória somente de ida.</div>') +
        '<div style="font-size:0.72rem;color:var(--text-muted);margin-top:6px;">Vagas e jogos por dupla são definidos em cada categoria' + (teamTurnos.turnos === 'ida_volta' ? ' em cada turno — ida e volta dobra o total.' : '.') + '</div>';
    } else if (um && !(cfg.groupCategoryRules && cfg.groupCategoryRules.length)) {
      // Pontos corridos: Nº de rodadas (PADRÃO, primeiro) × Todos contra todos.
      rInner = _pill(rModo === 'fixo', 'window._f2Modo(\'fixo\')', '🔢 Nº de rodadas') +
               _pill(rModo === 'todos', 'window._f2Modo(\'todos\')', '🔄 Todos contra todos');
      if (rModo === 'todos') {
        rInner += _classificationAgendaOrder(cfg);
        if (!cfg.classificationSchedule) {
          rInner += '<div style="margin-top:12px;">' + _toggleRight('Ida e volta', cfg.rodadas.turnos === 'ida_volta', 'window._f2Turnos(this.checked ? \'ida_volta\' : \'ida\')') + '</div>' +
            '<div style="font-size:0.72rem;color:var(--text-muted);margin-top:6px;">Cada ' + (isDupla ? 'dupla' : 'jogador') + ' enfrenta todos os outros' + (cfg.rodadas.turnos === 'ida_volta' ? ' — ida e volta (mando invertido)' : '') + '.</div>';
        }
      } else {
        rInner += _schedBlock(cfg.rodadas) + _classificationPairingControls(cfg);
      }
    } else {
      // Fase de grupos (2+): o motor gera uma passada de cada grade. Não expomos
      // "ida e volta" porque o compilador nunca a aplicou a vários grupos; em vez
      // de prometer uma configuração inexistente, mostramos a agenda real.
      rInner = _classificationAgendaOrder(cfg);
    }
    if (rInner) classifSchedule += _sec('Rodadas', rInner + (S.groupNotice ? '<div role="status">' + _safe(S.groupNotice) + '</div>' : ''));
    var isRankingRounds = cfg.classifAtiva && cfg.grupos === 1 && cfg.rodadas.modo === 'fixo' && !(tc && tc.enabled);
    var _canBye = cfg.parceria !== 'super_eight' && !!cfg.rodadas.allowSelfDeactivation;
    if (isRankingRounds && _canBye) {
      var so = cfg.rankingSitOutScoring || { mode: 'average' };
      var scoringLocked = !!(S.t && (((S.t.currentPhaseIndex || 0) > 0) || S.t.status === 'finished'));
      var sitOutControls =
        '<div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:8px;">A organização escolhe a pontuação de uma folga sorteada. Inatividade e W.O. não recebem esse crédito. A escolha pode mudar durante a classificatória e recalcula a tabela; fica travada após o avanço de fase.</div>' +
        _pill(so.mode === 'average', "window._f2SitOutScoring('average')", '📈 Média dinâmica (sugerida)') +
        _pill(so.mode === 'zero', "window._f2SitOutScoring('zero')", '0 pontos') +
        _pill(so.mode === 'fixed', "window._f2SitOutScoring('fixed')", 'Valor fixo') +
        (so.mode === 'fixed'
          ? '<label style="display:block;font-size:0.72rem;color:var(--text-muted);margin-top:8px;">Pontos por folga <input type="number" min="0" step="1" value="' + _safe(so.points || 0) + '" onchange="window._f2SitOutPoints(this.value)" style="width:82px;margin-left:6px;"></label>'
          : '<div style="font-size:0.72rem;color:var(--text-muted);margin-top:6px;">' +
            (so.mode === 'average' ? 'Cada nova rodada recalcula a média do desempenho real e atualiza também as folgas anteriores.' : 'Toda folga sorteada vale zero ponto.') + '</div>');
      classifSchedule += _sec('Pontos de quem folga', scoringLocked
        ? '<div style="pointer-events:none;opacity:.5;" aria-disabled="true">' + sitOutControls + '</div>'
        : sitOutControls);
    }
    if (S.mode !== 'form' && cfg._scoreBy === 'individual' && !(tc && tc.enabled)) classifSchedule += _sec('Empate após os critérios de desempate',
      '<div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:8px;">Quando atletas empatados seguiriam para destinos diferentes:</div>' +
      _pill(cfg.tieResolution === 'draw_order', "window._f2TieResolution('draw_order')", '🎲 Ordem do sorteio original') +
      _pill(cfg.tieResolution === 'singles_then_draw', "window._f2TieResolution('singles_then_draw')", '🎾 Simples / triangular') +
      _pill(cfg.tieResolution === 'singles_draw_two', "window._f2TieResolution('singles_draw_two')", '🎾 Sortear 2 e jogar simples') +
      '<div style="font-size:0.72rem;color:var(--text-muted);margin-top:6px;line-height:1.45;">' +
      (cfg.tieResolution === 'singles_then_draw'
        ? 'A regra prevê 1 simples para 2 empatados ou 3 simples em triangular para 3. Na hora do avanço, a organização pode dispensar os jogos por falta de tempo; nesse caso vale a ordem do sorteio original, sem novo sorteio.'
        : cfg.tieResolution === 'singles_draw_two'
          ? 'Com 3 ou mais empatados, sorteiam-se 2 para a simples; se houver outra posição relevante, o sorteio e a simples se repetem entre os restantes.'
        : 'Após os critérios estatísticos, vale a ordem definida no sorteio original. Nenhuma nova partida é criada.') + '</div>' +
      (['singles_then_draw', 'singles_draw_two'].includes(cfg.tieResolution)
        ? _tieSinglesControls(cfg)
        : ''));

    var e = cfg.eliminatoria;
    var eb = '';
    // v1.3.99: slot do FORM (DATAS + INSCRIÇÕES durante a fase) da fase INICIAL na eliminação
    // DIRETA. Fica FORA do wrapper de trava (igual às datas da classificatória) → editável no
    // calor do torneio mesmo após o sorteio. Só a ESTRUTURA trava. Ver [[project_late_enrollment_default_closed_live_toggle]].
    var _elimInitExtra = '';
    var _elimEndExtra = '';   // v1.6.80: bloco "📅 Término da fase" da eliminatória (fora da trava)
    if (e.ativa) {
      eb += '<label style="display:block;font-size:0.78rem;color:var(--text-muted);margin-bottom:12px;">Nome da fase eliminatória' +
        '<input type="text" class="form-control" maxlength="40" placeholder="Eliminatória" value="' + _safe(e.nome || '') +
        '" oninput="window._f2ElimName(this.value)" style="display:block;width:100%;box-sizing:border-box;margin-top:5px;"></label>';
      if (isDupla) eb += '<div style="margin-bottom:14px;">' + _blocoAbrirComRR(cfg, !!cfg.classifAtiva) + '</div>';
      if (!cfg.classifAtiva) {
        // v4.4.33: ELIMINAÇÃO DIRETA (sem classificatória) — todos os inscritos entram no bracket
        // por sorteio. A disputa e a formação das duplas moram AQUI (o início da eliminatória).
        eb += '<div style="font-size:0.74rem;color:var(--sp-c-fbbf24,#fbbf24);background:rgba(251,191,36,0.08);border-radius:8px;padding:8px 10px;margin-bottom:12px;">Sem fase classificatória — todos os inscritos entram direto na eliminatória.</div>';
      } else {
        // COM classificatória: escopo (2+ grupos) + Nº de classificados + resumo.
        var effectiveGroups = _effectiveGroupCount(cfg, _groupInfo(cfg));
        var perGroupScope = (effectiveGroups > 1 || cfg.parceria === 'rotation_groups_8' || (cfg.groupCategoryRules && cfg.groupCategoryRules.length)) && cfg.classifScope !== 'overall';
        var qAll=!!e.qualifyAll;
        eb += '<div style="font-size:.78rem;color:var(--text-muted);margin-bottom:12px">'+
          (cfg.qualificationCategoryRules ? cfg.qualificationCategoryRules.map(r=>_safe(r.category || 'Classificação geral')+': '+r.perGroup+' por grupo').join(' · ')
            : 'Defina o corte nos sliders de classificados da fase de grupos.')+'</div>';
        if (!qAll && perGroupScope && e.lineAssignment !== 'rank_ranges' && !e.openReiRainha) {
          var extra = e.bestNextByGroup || { count: 0, metric: 'points_per_game', destIndex: 0 };
          eb += '<div style="margin:12px 0;padding:10px;border:1px solid rgba(129,140,248,.25);border-radius:8px;">' +
            '<div style="font-size:.8rem;color:var(--text-main);margin-bottom:6px;">Vagas extras: melhores colocados seguintes entre os grupos</div>' +
            '<label style="font-size:.75rem;color:var(--text-muted);">Quantidade total ' +
            '<input type="number" min="0" max="' + cfg.grupos + '" class="form-control" value="' + extra.count +
            '" onchange="window._f2BestNext(\'count\',this.value)" style="width:75px;display:inline-block;margin-left:6px;"></label>';
          if (extra.count > 0) {
            eb += '<div style="font-size:.72rem;color:var(--text-muted);margin:7px 0;">Após os ' + cfg.classificados +
              ' primeiros de cada grupo, compara-se o próximo colocado de cada grupo.</div>' +
              '<label style="font-size:.75rem;color:var(--text-muted);">Comparar por <select class="form-control" onchange="window._f2BestNext(\'metric\',this.value)" style="display:inline-block;max-width:220px;margin-left:6px;">' +
              [['points_per_game', 'Pontos por jogo'], ['win_rate', 'Aproveitamento de vitórias'], ['total_points', 'Pontos totais (mesmo nº de jogos)']].map(function (option) {
                return '<option value="' + option[0] + '"' + (extra.metric === option[0] ? ' selected' : '') + '>' + option[1] + '</option>';
              }).join('') + '</select></label>';
            if (e.linhas > 1) eb += '<div style="margin-top:7px;"><label style="font-size:.75rem;color:var(--text-muted);">Enviar para <select class="form-control" onchange="window._f2BestNext(\'destIndex\',this.value)" style="display:inline-block;max-width:220px;margin-left:6px;">' +
              Array.from({ length: e.linhas }, function (_, index) {
                return '<option value="' + index + '"' + (extra.destIndex === index ? ' selected' : '') + '>' + _safe(e.nomes[index] || ('Chave ' + (index + 1))) + '</option>';
              }).join('') + '</select></label></div>';
          }
          eb += '</div>';
        }
        // v4.4.41: resumo LOGO ABAIXO do slider (pedido do dono).
        eb += '<div id="f2-elim-summary">' + _elimSummary(cfg) + '</div>';
        // Formação/pareamento e semeadura são decisões independentes do organizador.
        // A dupla eliminatória mantém sua semeadura própria; a formação ainda vale.
        var _forma = isDupla && e.origem === 'formar';       // há duplas a FORMAR dos indivíduos
        var _hP = _forma
          ? 'Forma duplas por colocação: 1º+2º, 3º+4º…'
          : 'Mantém as duplas classificadas por colocação.';
        var _hE = _forma
          ? 'Forma duplas equilibradas: 1º+4º, 2º+3º…'
          : 'Pareia as duplas classificadas por colocação oposta.';
        var _hints = { performance: _hP, equilibrio: _hE, sorteio: 'Forma as duplas por sorteio entre os classificados.' };
        var _fx = (e.formacao === 'sorteio' && !_forma) ? 'performance' : e.formacao; // sorteio só quando forma duplas
        // ⚠️ COM "Abrir com Rei/Rainha" LIGADO a estratégia é escolhida DENTRO daquele bloco
        // ("Como formar as duplas no grupo") — é o MESMO cfg.eliminatoria.formacao. Mostrar os
        // dois seria dois controles pro mesmo valor na mesma tela, que é o tipo de duplicidade
        // que este trabalho existe pra tirar.
        if (isDupla && !cfg.eliminatoria.openReiRainha) {
          eb += '<div style="margin-top:14px;font-size:0.72rem;color:var(--text-muted);margin-bottom:5px;">' + (_forma ? 'Como formar as duplas classificadas' : 'Como parear as duplas classificadas') + '</div>' +
            '<div>' + _pill(_fx === 'performance', 'window._f2Formacao(\'performance\')', '📈 Performance') +
            _pill(_fx === 'equilibrio', 'window._f2Formacao(\'equilibrio\')', '⚖️ Equilíbrio') +
            (_forma ? _pill(_fx === 'sorteio', 'window._f2Formacao(\'sorteio\')', '🎲 Sorteio') : '') + '</div>' +
            '<div style="font-size:0.72rem;color:var(--text-muted);margin-top:6px;line-height:1.45;">' + (_hints[_fx] || _hints.performance) + '</div>';
        }
      }
      // Só há colocação para semear quando uma fase anterior classificou os
      // participantes. A chave direta sem fase anterior segue o sorteio de entrada.
      if ((cfg.classifAtiva || e.openReiRainha) && !e.dupla) {
        eb += '<div style="margin-top:14px;font-size:0.72rem;color:var(--text-muted);margin-bottom:5px;">Confrontos na chave</div>' +
          _pill(e.semeadura === 'performance', 'window._f2Semeadura(\'performance\')', '🏅 Cabeças protegidas') +
          _pill(e.semeadura === 'equilibrio', 'window._f2Semeadura(\'equilibrio\')', '⚖️ Confrontos parelhos') +
          _pill(e.semeadura === 'sorteio', 'window._f2Semeadura(\'sorteio\')', '🎲 Posições sorteadas') +
          _pill(e.semeadura === 'grupos', 'window._f2Semeadura(\'grupos\')', 'Cruzar grupos') +
          '<div style="font-size:0.72rem;color:var(--text-muted);margin-top:6px;line-height:1.45;">' +
          (e.semeadura === 'grupos' ? 'As duplas são formadas por colocação dentro de cada grupo; os grupos se cruzam em espelho (1 × último, 2 × penúltimo).' : e.semeadura === 'sorteio'
            ? 'As posições na chave são sorteadas entre os classificados; o sorteio fica vinculado à operação publicada.'
            : e.semeadura === 'equilibrio'
            ? 'Colocações próximas se enfrentam desde a primeira rodada.'
            : 'As melhores colocações ficam em lados opostos da chave e tendem a se encontrar no fim.') + '</div>';
      }
      // v4.4.58: Dupla Eliminatória (repescagem) — toggle + explicação de como funciona.
      // Quando ON é UMA chave só (força 1 linha no normalize) → o controle de Linhas some.
      eb += '<div style="margin-top:14px;">' + _toggleRight('Dupla Eliminatória', !!e.dupla, 'window._f2ElimDupla(this.checked)') + '</div>' +
        '<div style="font-size:0.72rem;color:var(--text-muted);margin-top:6px;line-height:1.45;">' + (e.dupla
          ? 'Cada ' + (isDupla ? 'dupla' : 'jogador') + ' segue para a chave inferior após perder na superior. A organização decide abaixo se os vencedores das duas chaves se enfrentam.'
          : 'Eliminação simples — uma derrota e está fora. Ative para <b>Dupla Eliminatória</b>: só sai com 2 derrotas (quem perde na chave de cima cai na de baixo).') + '</div>';
      if (e.dupla) {
        eb += '<div style="margin-top:14px;">' + _toggleRight('Confronto entre vencedores das chaves', e.grandFinal !== false, 'window._f2GrandFinal(this.checked)') + '</div>' +
          '<div style="font-size:.72rem;color:var(--text-muted);margin-top:6px;">' +
          (e.grandFinal !== false ? 'O confronto decide o título geral. Sem ele, cada chave terá seu vencedor.'
            : 'Os vencedores das chaves superior e inferior recebem títulos separados.') + '</div>';
        if (e.grandFinal !== false && e.finalSeriesBestOf === 1) eb += '<div style="margin-top:12px;">' +
          _toggleRight('Segunda partida se o vencedor da chave inferior ganhar a primeira',
            e.grandFinalReset === true, 'window._f2GrandFinalReset(this.checked)') + '</div>';
      }
      /* ⛔⛔⛔ COMO O RESTO É RESOLVIDO — a escolha do organizador entre os três desenhos.
       * Só aparece na eliminatória SIMPLES: na dupla, a "repescagem" é o próprio formato (todo mundo
       * precisa perder duas vezes), não tratamento de resto — oferecer a escolha ali seria oferecer
       * um botão que não muda nada. A conta e as fórmulas de cada desenho estão em `chaves.js`. */
      var _effectiveGroups = _effectiveGroupCount(cfg, _groupInfo(cfg));
      var _knownCount = cfg.classifAtiva && !e.qualifyAll
        ? (cfg.classifScope === 'per_group' && (_effectiveGroups > 1 || cfg.parceria === 'rotation_groups_8' || (cfg.groupCategoryRules && cfg.groupCategoryRules.length)) ? _effectiveGroups * cfg.classificados : cfg.classificados)
        : (_peopleCount(S.t) || Number((document.getElementById('tourn-max-participants') || {}).value) || 0);
      if (cfg.disputa === 'dupla' && !cfg.classifAtiva && !e.openReiRainha) _knownCount = Math.floor(_knownCount / 2);
      if (cfg.disputa === 'dupla' && e.openReiRainha) _knownCount = Math.floor(_knownCount / 2);
      var _lateMode = e.lateEnrollment === 'inherit'
        ? ((document.getElementById('late-enrollment') || {}).value || 'closed') : e.lateEnrollment;
      var _mayChangeCount = _lateMode !== 'closed';
      if (!e.dupla && (_mayChangeCount || (_knownCount > 0 && (_knownCount & (_knownCount - 1)) !== 0))) {
        var _pol = e.politicaDaChave || 'repescagem';
        var _POLS = [
          ['repescagem', 'Repescagem', 'Todas jogam a estreia e as melhores derrotadas VOLTAM, até fechar a potência de 2. Ninguém fica de fora do primeiro dia, mas o torneio cresce: com 36 duplas são 50 jogos, e 14 das 18 que perdem seguem vivas.'],
          ['bye', 'Folga', 'Parte das equipes ESPERA a estreia e o campo já entra na potência de 2. Com 36 duplas são 36 jogos, os mesmos da sobra única — mas 28 delas não jogam o primeiro dia.'],
          /* ⛔ O TEXTO FOI CORRIGIDO: ele dizia "3 folgas" com 36 duplas, e o motor faz DUAS folgas e
           * uma sobra que JOGA — porque folga é proibida perto da final e, na penúltima rodada de três,
           * a sobra enfrenta o perdedor do jogo daquela rodada. Medido: 36 jogos, 2 folgas, 1 sobra
           * jogando. Prometer no rótulo o que o motor não faz é o defeito que este projeto mais repete.
           * [[feedback_nao_prometer_no_botao_o_que_nao_se_pode_conferir]] */
          /* ⛔⛔ O 3º LUGAR NA SOBRA ÚNICA — DECISÃO DO DONO, 26/set/2026, que encerra cinco rodadas
           * de impasse na revisão: _"tendo 3o, ok. pode ter 3. 1 passa. 2 disputam e passa o
           * ganhador"_.
           * ⇒ a penúltima rodada PODE ter três: a sobra passa direto, os outros dois jogam e o
           * vencedor vai à final. O 3º colocado é quem perde esse jogo. O que sempre existe é o 3º
           * COLOCADO — não um card rotulado "disputa de 3º contra 4º", que seria impossível ali
           * porque não existe 4º. Nas outras duas políticas a penúltima fecha em 4 e o jogo existe.
           * ⛔ Isto NÃO reabre a rodada de entrada: continua sem alvo de potência de 2 e sem ninguém
           * esperando a estreia. Medido: 36 → 18 → 9 → 5 → 3 → 2. */
          ['sobra_unica', 'Sobra única', 'Ninguém volta e ninguém espera a estreia: cada rodada com número ímpar tem UMA sobra. Ela folga, exceto perto da final — aí ela joga, porque folga em semifinal não existe. Todas jogam o primeiro dia e o torneio não cresce: com 36 duplas são 36 jogos, duas folgas no meio e uma sobra jogando na penúltima rodada. Quando a penúltima rodada tem três, uma passa direto, as outras duas jogam e quem perde fica em 3º.']
        ];
        eb += '<div style="margin-top:14px;font-size:0.72rem;color:var(--text-muted);margin-bottom:5px;">' +
          'Quando o número de equipes não fecha a chave</div>';
        eb += _POLS.map(function (o) {
          return _pill(_pol === o[0], "window._f2PoliticaDaChave('" + o[0] + "')", o[1]);
        }).join('');
        eb += '<div style="font-size:0.72rem;color:var(--text-muted);margin-top:6px;line-height:1.45;">' +
          _safe((_POLS.filter(function (o) { return o[0] === _pol; })[0] || _POLS[0])[2]) + '</div>';
      }
      // Linhas (chaves paralelas): só na eliminatória SIMPLES — a dupla-elim é chave única.
      if (!e.dupla) {
        eb += '<div style="margin-top:12px;">' + _binaryChoice('Uma chave', 'Chaves paralelas', e.linhas > 1,
          'window._f2ParallelLines(this.checked)', 'Usar chaves paralelas') + '</div>';
        if (e.linhas > 1) {
          eb += '<label style="display:block;font-size:.72rem;color:var(--text-muted);margin-bottom:5px;">Total de chaves</label>' +
            '<input type="number" class="form-control" min="2" max="32" step="1" value="' + e.linhas + '" onchange="window._f2Linhas(this.value)" aria-label="Quantidade total de chaves paralelas" style="max-width:110px;box-sizing:border-box;">';
        for (var i = 0; i < e.linhas; i++) {
          // v1.2.40: PADRÃO do formulário = class="form-control" (padding .75rem 1rem,
          // font-size 1rem) — igual aos campos de Início/Término da fase. Antes era estilo
          // à mão (padding 7px 10px, SEM font-size → herdava menor): campo mais baixo e
          // fonte menor que o resto do form.
          eb += '<div style="margin-top:8px;"><input type="text" class="form-control" value="' + _safe(e.nomes[i] || '') + '" placeholder="Nome da chave ' + (i + 1) + ' (opcional)" oninput="window._f2LineName(' + i + ',this.value)" style="max-width:300px;box-sizing:border-box;"></div>';
        }
        if (cfg.classifAtiva && e.linhas > 1) {
          eb += '<div style="margin-top:14px;font-size:.72rem;color:var(--text-muted);">Como cada chave recebe classificados</div>' +
            _pill(e.lineAssignment !== 'rank_ranges', "window._f2LineAssignment('strategy')", 'Distribuir por formação e semeadura') +
            _pill(e.lineAssignment === 'rank_ranges', "window._f2LineAssignment('rank_ranges')", 'Faixas de colocação por chave');
          if (e.lineAssignment === 'rank_ranges') {
            eb += '<div style="font-size:.72rem;color:var(--text-muted);margin:6px 0;">A colocação é ' +
              (cfg.classifScope === 'per_group' || (cfg.parceria === 'rei_rainha' && cfg.rodadas.n === 1)
                ? 'de cada grupo' : 'da classificação geral') +
              '. As faixas não devem se sobrepor. Duplas novas são formadas dentro de cada faixa.</div>';
            for (var ri = 0; ri < e.linhas; ri++) {
              var range = (e.lineRankRanges || [])[ri] || { from: ri + 1, to: ri + 1 };
              eb += '<div style="display:flex;align-items:center;gap:7px;margin-top:7px;flex-wrap:wrap;color:var(--text-main);">' +
                '<span style="min-width:95px;">' + _safe(e.nomes[ri] || ('Chave ' + (ri + 1))) + '</span>' +
                '<label>do <input type="number" min="1" max="999" class="form-control" value="' + range.from +
                '" onchange="window._f2LineRange(' + ri + ',\'from\',this.value)" style="width:75px;display:inline-block;"></label>' +
                '<label>ao <input type="number" min="1" max="999" class="form-control" value="' + range.to +
                '" onchange="window._f2LineRange(' + ri + ',\'to\',this.value)" style="width:75px;display:inline-block;"></label></div>';
            }
          }
        }
        // Grande Final — na SIMPLES com mais de uma linha (na dupla-elim é sempre,
        // não tem toggle). ON = campeões das linhas se cruzam numa grande final (após a
        // 1ª linha). OFF = linhas independentes, cada uma com seu campeão.
        if (e.linhas > 1) {
          eb += '<div style="margin-top:14px;">' + _toggleRight('Grande Final', e.grandFinal !== false, 'window._f2GrandFinal(this.checked)') + '</div>' +
            '<div style="font-size:0.72rem;color:var(--text-muted);margin-top:6px;line-height:1.45;">' + (e.grandFinal !== false
              ? 'Os campeões das chaves se cruzam numa <b>grande final</b> (com grandes semifinais), renderizada logo após a 1ª chave. Desative para deixar as chaves <b>independentes</b> — cada uma com seu próprio campeão.'
              : 'Chaves <b>independentes</b> — cada chave tem seu próprio campeão, sem grande final unindo-as. Ative para cruzá-las numa grande final.') + '</div>';
        }
        }
      }
      // 🎾 FORMATO DA PARTIDA DESTA FASE — só quando a eliminatória é fase POSTERIOR. Na
      // eliminação direta ela É a fase inicial e recebe o bloco #gsm-section do form pelo slot
      // abaixo (_elimInitExtra) — um formato só, sem duas fontes pro mesmo jogo.
      if (cfg.classifAtiva) eb += '<div style="margin-top:14px;">' + _gsmElimBlock(e) + '</div>';
      // "Inscrições durante a fase": cada fase tem a SUA. Sem classificatória, a eliminatória é a
      // fase inicial (onde há inscrição) e carrega o bloco do FORM (via slot #f2-classif-extra →
      // t.lateEnrollment). Com classificatória, ELA é a inicial (tem o bloco do form via slot);
      // a eliminatória é 2ª fase e ganha o SEU próprio painel (cfg.eliminatoria.lateEnrollment),
      // que só passa a valer quando o torneio avança de fase.
      // v1.3.99: na eliminação DIRETA (sem classificatória) a fase inicial carrega o slot do FORM
      // (#f2-classif-extra = DATAS + INSCRIÇÕES durante a fase). Guardo SEPARADO pra ficar FORA do
      // wrapper de trava — igual às datas da classificatória (abaixo). Só a ESTRUTURA trava.
      if (!cfg.classifAtiva) _elimInitExtra = '<div id="f2-hours-slot" style="margin-top:12px;"></div><div id="f2-classif-extra" style="margin-top:12px;"></div>';
      else {
        eb += _lateEnrollElimBlock(e);
        // v1.6.80: término PRÓPRIO da eliminatória — FORA do wrapper de trava (igual às datas
        // da classificatória): estender/ajustar o fim é exatamente o que o organizador precisa
        // fazer com a fase JÁ em andamento. Só a ESTRUTURA trava.
        _elimEndExtra = _elimEndDateBlock(e) + _elimRoundBoundsHtml();
      }
    }
    if (!cfg.classifAtiva && isDupla) eb = _phaseBlock('Inscrição e formação de duplas', '#818cf8', formationControls) + eb;
    var _elimDatesExtra = !cfg.classifAtiva && e.ativa ? '<div id="f2-hours-mode-slot" style="margin-top:12px;"></div><div id="f2-phase-dates-slot" style="margin-top:12px;"></div>' : '';
    if (e.ativa && cfg.rotationCategoryRules?.length) {
      var destinations = cfg.rotationCategoryRules.map(function (rule, index) {
        return '<fieldset><legend>' + _safe(rule.category || 'Classificação geral') + '</legend>' +
          _pill(rule.destination === 'ranking', "window._f2RotationRule("+index+",null,'ranking')", 'Encerrar no ranking individual', 'ranking', _p0Drawn) +
          _pill(rule.destination === 'elimination', "window._f2RotationRule("+index+",null,'elimination')", 'Avançar à eliminatória', 'elimination', _p0Drawn) +
          '</fieldset>';
      }).join('');
      eb += _sec('Destino por categoria', '<div id="f2-rotation-destinations">'+destinations+'</div>');
    }
    if (window.ScoreplaceGroupAlternation && window.ScoreplaceGroupAlternation.eightConfig(cfg,category=>_sliderPopulation(category,false))) {
      eb += '<div style="margin-top:14px;">' + _toggleRight('Disputa de terceiro lugar',
        e.thirdPlaceEnabled !== false, 'window._f2ThirdPlaceEnabled(this.checked)', _elimLocked) + '</div>';
    }
    var elimInner = e.ativa ? (_elimDatesExtra + eb + _elimEndExtra + _elimInitExtra) : '';
    // v4.4.52: fase avançou → config da eliminatória travada (cinza, sem cliques). Nota muda
    // conforme haja classificatória (avançou de fase) ou seja eliminação direta (já sorteada).
    if (_elimLocked) {
      var _elimNote = cfg.classifAtiva
        // v1.6.80: as DATAS saíram da trava — estender/ajustar o término é justamente o que o
        // organizador precisa fazer com a eliminatória já rolando.
        ? '🔒 <b>Fase eliminatória em andamento</b> — o torneio já avançou de fase; a estrutura não muda mais. Você ainda pode ajustar o <b>término da fase</b> abaixo.'
        // v1.3.99 (dono): eliminação direta já sorteada → só a ESTRUTURA trava. DATAS e INSCRIÇÕES
        // durante a fase (novos confrontos) ficam editáveis pra o organizador corrigir no calor do
        // torneio (estender/abreviar a fase, aceitar/parar novos confrontos).
        : '🔒 <b>Estrutura travada</b> — formato, chaves e estratégia não mudam mais (já sorteada). Você ainda pode ajustar as <b>datas</b> e as <b>inscrições durante a fase</b> abaixo.';
      elimInner = '<div style="font-size:0.76rem;color:var(--sp-c-fde68a,#fde68a);background:rgba(251,191,36,0.1);border:1px solid rgba(251,191,36,0.35);border-radius:9px;padding:9px 11px;margin-bottom:12px;line-height:1.45;">' + _elimNote + '</div>' +
        _elimDatesExtra + '<div style="pointer-events:none;opacity:0.5;filter:grayscale(0.4);" aria-disabled="true">' + eb + '</div>' +
        _elimEndExtra + _elimInitExtra;   // DATAS + INSCRIÇÕES FORA do lock → editáveis no calor do torneio
    }

    // Slot (Datas + Inscrições) dentro da CLASSIFICATÓRIA quando ela está ativa.
    if (cfg.classifAtiva) classifSchedule += '<div id="f2-hours-slot" style="margin-top:12px;"></div><div id="f2-classif-extra" style="margin-top:4px;"></div>';

    var datesSlot = '<div id="f2-hours-mode-slot" style="margin-top:12px;"></div><div id="f2-phase-dates-slot" style="margin-top:12px;"></div>';
    var formationStep = isDupla && cfg.classifAtiva && !isQueen ? _phaseBlock('Inscrição e formação de duplas', '#818cf8', formationControls) : '';
    var structureSummary = '<div id="f2-estrutura-block">' + _estruturaBlock(cfg) + '</div>';
    var teamChoiceStep = teamChoiceControls ? teamChoiceControls : '';
    var classifStructure = structureControls + formationStep + teamChoiceStep;
    var classifInner = cfg.classifAtiva ? (classifStructure + datesSlot + classifSchedule) : '';
    // v4.4.51/v4.5.49: fase classificatória já sorteada → só a ESTRUTURA (formato/grupos/formação)
    // fica cinza e sem interação. O AGENDAMENTO (repetição, nº de rodadas) e as DATAS/Inscrições
    // (#f2-classif-extra, dentro de classifSchedule) ficam FORA do wrapper → SEMPRE editáveis, pra
    // o organizador ajustar a temporada durante a fase (reduzir/estender rodadas, mudar o término).
    if (_classifLocked) {
      classifInner = '<div style="font-size:0.76rem;color:var(--sp-c-c7d2fe,#c7d2fe);background:rgba(129,140,248,0.12);border:1px solid rgba(129,140,248,0.35);border-radius:9px;padding:9px 11px;margin-bottom:12px;line-height:1.45;">🔒 <b>Estrutura travada</b> — formato, grupos e formação não mudam mais (fase já sorteada). Você ainda pode ajustar o <b>agendamento</b> (repetição, nº de rodadas, término da fase) e a <b>fase eliminatória</b>.</div>' +
        '<div style="pointer-events:none;opacity:0.5;filter:grayscale(0.4);" aria-disabled="true">' + classifStructure + '</div>' +
        datesSlot + classifSchedule;
    }

    // v4.4.52: cadeado 🔒 ENTRE o título e o toggle quando a fase está travada.
    function _hdrRight(locked, toggle) {
      var lk = locked ? '<span title="Fase travada — configuração não pode mais mudar" style="font-size:1.2rem;line-height:1;">🔒</span>' : '';
      return '<span style="display:inline-flex;align-items:center;gap:12px;">' + lk + toggle + '</span>';
    }
    var priorLocked = _p0Drawn
      ? '<div style="pointer-events:none;opacity:.55;" aria-disabled="true">'
      : '<div>';
    var entryStep = _phaseBlock('1. Disputa', '#818cf8',
      priorLocked + entryControls + '</div>');
    var classifStep = _phaseBlock('2. 🎯 Fase Classificatória', '#818cf8',
      cfg.classifAtiva ? (classifInner + scoringControls) : cfg.eliminatoria.openReiRainha ? '<div id="f2-category-capacity-slot"></div>'+_rotationSliderCards(0) : '',
      _hdrRight(_phaseLocks.classifToggleLocked,
        _toggleRight('Ativa', cfg.classifAtiva, 'window._f2ClassifAtiva(this.checked)',
          _phaseLocks.classifToggleLocked)));
    var h = entryStep + classifStep;
    var _titleUnit = cfg.teamCompetition && cfg.teamCompetition.enabled
      ? (cfg.teamCompetition.classificationUnit === 'pair' ? 'dupla' : 'time')
      : (cfg._scoreBy === 'individual' ? 'atleta' : 'dupla');
    var _outcome = !cfg.classifAtiva
      ? 'Saída escolhida: entrada direta na eliminatória.'
      : (e.ativa ? 'Saída escolhida: a classificatória seleciona participantes para a eliminatória.'
        : 'Saída escolhida: classificação final de ' + _titleUnit + ', sem eliminatória.');
    if (isDupla && cfg.classifAtiva && cfg.eliminatoria.ativa && cfg.eliminatoria.openReiRainha)
      h += _phaseBlock('Fase classificatória de formação', '#818cf8', _rotationSliderCards(1));
    var eliminationStep = _phaseBlock('3. 🏆 Fase Eliminatória', '#fbbf24', e.ativa ? elimInner : '',
      _hdrRight(_elimLocked,
        _toggleRight('Ativa', e.ativa, 'window._f2Elim(this.checked)',
          _elimLocked || (e.ativa && !!cfg.rotationCategoryRules && _hasDrawnGames()))));
    var review = _phaseBlock('4. Revisão das decisões', '#818cf8',
      '<p style="font-size:.85rem;color:var(--text-main);">' + _safe(_outcome) + '</p>' + structureSummary +
      (cfg.classifAtiva && !e.ativa
        ? '<p style="font-size:.78rem;color:var(--text-muted);">As colocações saem da tabela. Não há partida de disputa de 3º e 4º lugar.</p>'
        : '') +
      '<p style="font-size:.78rem;color:var(--text-muted);">' + _safe(window.FORMAT2.summary(cfg)) + '</p>');
    return h + eliminationStep + review;
  }

  // ── Handlers globais (form + page) ──
  window._f2Disputa = function (v) { if (_hasDrawnGames()) return;
    if (v === 'individual' && S.cfg.parceria === 'rotation_groups') S.cfg.rotationCategoryRules = null;
    if (v === 'individual' && S.cfg.eliminatoria.formationCategoryRules) S.cfg.eliminatoria.formationCategoryRules = null;
    S.fixedClassification=false; S.sliderModes={}; S.cfg.disputa = v; _norm(); _rerender(); };
  window._f2EnrollmentTeam = function (formed) { if (!S) return; window._f2TeamForm(formed ? 'montadas' : 'sorteio'); };
  window._f2PairAuthority = function (policy) {
    if (!S || ['organizer_only', 'athletes_only', 'open'].indexOf(policy) < 0) return;
    S.cfg.manualPairingPolicy = policy;
    S.cfg.manualPairingOpen = policy !== 'organizer_only';
    _norm(); _rerender();
  };
  window._f2TieResolution = function (v) {
    if (!S || !['draw_order', 'singles_then_draw', 'singles_draw_two'].includes(v)) return;
    S.cfg.tieResolution = v;
    if (v === 'singles_draw_two') {
      if (!(Number(S.cfg.tieSinglesPoints) >= 1)) S.cfg.tieSinglesPoints = 7;
      if (![1, 2].includes(Number(S.cfg.tieSinglesMargin))) S.cfg.tieSinglesMargin = 1;
    }
    _norm(); _rerender();
  };
  window._f2TieSinglesPoints = function (v) { if (!S) return; S.cfg.tieSinglesPoints = v; _norm(); _rerender(); };
  window._f2TieSinglesMargin = function (v) { if (!S) return; S.cfg.tieSinglesMargin = v; _norm(); _rerender(); };
  window._f2SitOutScoring = function (mode) {
    if (!S) return;
    S.cfg.rankingSitOutScoring = mode === 'fixed'
      ? { mode: 'fixed', points: (S.cfg.rankingSitOutScoring && S.cfg.rankingSitOutScoring.points) || 0 }
      : { mode: mode === 'zero' ? 'zero' : 'average' };
    _norm(); _rerender();
  };
  window._f2SitOutPoints = function (value) {
    if (!S) return;
    S.cfg.rankingSitOutScoring = { mode: 'fixed', points: Number(value) };
    _norm(); _rerender();
  };
  // ONINPUT (durante o arraste) — atualização LEVE e fluida: o número muda na hora, e os
  // números de baixo (grupos · pessoas/grupo · duplas/grupo + tempo) atualizam via
  // requestAnimationFrame (coalesce → no máx. 1 update por frame, sem lag). SEM re-render do
  // configurador inteiro (isso é que travava). Não normaliza aqui — só o display.
  window._f2GruposLive = function (v) {
    if (!S) return;
    S.cfg.grupos = Math.max(1, parseInt(v, 10) || 1);
    var lbl = document.getElementById('f2-grupos-val'); if (lbl) lbl.textContent = S.cfg.grupos;
    if (S._raf) return;
    S._raf = requestAnimationFrame(function () {
      S._raf = null;
      var est = document.getElementById('f2-estrutura-block'); if (est) est.innerHTML = _estruturaBlock(S.cfg);
    });
  };
  // ONCHANGE (ao SOLTAR) — re-render completo (ajusta os controles que dependem do nº de grupos).
  window._f2Grupos = function (v) {
    if (!S) return;
    if (S._raf) { cancelAnimationFrame(S._raf); S._raf = null; }
    S.cfg.grupos = Math.max(1, parseInt(v, 10) || 1);
    _norm();
    _rerender();
  };
  window._f2GroupFormation = function (mode, value, changedMode) {
    if (!S || _hasDrawnGames() || !['count','size','people'].includes(mode)) return;
    var parsed = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
    if (changedMode) parsed = Math.max(mode === 'count' ? 1 : 2, _defaultGroupFormation(S.cfg).value);
    else if (mode === 'people') parsed /= 2;
    var input = document.getElementById('f2-group-formation-value');
    if (!Number.isSafeInteger(parsed) || parsed < (mode === 'count' ? 1 : 2) || parsed > 128) {
      if (input && input.reportValidity) input.reportValidity();
      return;
    }
    S.globalGroupPeople = mode === 'people';
    S.cfg.groupFormation = { mode: mode === 'people' ? 'size' : mode, value: parsed };
    var resolved = window.FORMAT2.resolveGroupFormation(S.cfg.groupFormation, _groupInfo(S.cfg).units, S.cfg.grupos);
    if (resolved.groups != null && !resolved.invalid) S.cfg.grupos = resolved.groups;
    _norm(); _rerender();
  };
  window._f2GroupSchedule = function (v, input) {
    if (!S || _hasDrawnGames()) return;
    if (v == null) {
      if (typeof S.cfg.classificationSchedule?.allowRepeat === 'boolean') S.cfg.classificationSchedule = null;
      else delete S.cfg.classificationSchedule;
      S.groupNotice = ''; _norm(); _rerender(); return;
    }
    var current = Object.assign({gamesPerUnit:1, mode:'free', allowRepeat:false}, S.cfg.classificationSchedule);
    if (v === 'short') {
      var gi = _groupInfo(S.cfg);
      current.gamesPerUnit = Math.max(1, Math.floor(Math.max(2, gi.big || 2) / 2));
      S.cfg.rodadas.turnos = 'ida';
    } else {
      var n = Number(v);
      if (!Number.isSafeInteger(n) || n < 1 || n > 128) {
        if (input && input.reportValidity) input.reportValidity();
        return;
      }
      current.gamesPerUnit = n;
    }
    S.groupNotice = '';
    S.cfg.classificationSchedule = current;
    _norm(); _rerender();
  };
  window._f2GroupRepeat = function (allowed, index) {
    if (!S || _hasDrawnGames()) return;
    var cfg = S.cfg, categories = _rotationCategories();
    var target = index == null ? cfg.classificationSchedule : cfg.groupCategoryRules?.find(function (r) { return r.category === categories[index]; });
    if (!target) return;
    var previous = target.allowRepeat;
    target.allowRepeat = allowed;
    var tooMany = false;
    if (!allowed) {
      var names = index == null ? categories : [categories[index]];
      if (names.length) tooMany = names.some(function (cat) {
        var row = _groupPreview(cfg, cat, _categoryPeople(cat)); return row.people && row.plan.assessment.limitedGroups > 0;
      });
      else tooMany = _groupInfo(cfg).assessment.limitedGroups > 0;
    }
    if (tooMany) {
      if (previous == null) delete target.allowRepeat; else target.allowRepeat = previous;
      S.groupNotice = 'Reduza os jogos por unidade antes de impedir a repetição de adversários.';
    } else S.groupNotice = '';
    _norm(); _rerender();
  };
  window._f2RotationRepeat = function (allowed) {
    if (!S || _hasDrawnGames() || S.cfg.parceria !== 'rotation_groups_8') return;
    if (!allowed && (S.cfg.rodadas.n > 7 || (S.cfg.rotationCategoryRules || []).some(function (r) { return r.rounds > 7; }))) {
      S.groupNotice = 'Reduza os jogos por atleta a sete antes de impedir a repetição de parceiros.';
    } else {
      S.cfg.rotationAllowRepeatPartners = allowed;
      S.groupNotice = '';
    }
    _norm(); _rerender();
  };
  window._f2GroupScheduleMode = function (mode) {
    if (!S) return;
    var current = S.cfg.classificationSchedule || { gamesPerUnit: 1, mode: 'free' };
    current.mode = mode === 'structured' ? 'structured' : 'free';
    S.cfg.classificationSchedule = current;
    _norm(); _rerender();
  };
  window._f2ClassificationPairing = function (strategy) {
    if (!S) return;
    var current = S.cfg.classificationPairing || {};
    current.strategy = strategy === 'free_draw' ? 'free_draw' : 'ranking_clusters';
    current.clusterSize = Math.max(2, parseInt(current.clusterSize, 10) || 8);
    current.rematchPolicy = 'exhaust_cluster_before_repeat';
    S.cfg.classificationPairing = current;
    _norm(); _rerender();
  };
  window._f2ClusterSize = function (value, input) {
    if (!S) return;
    var current = S.cfg.classificationPairing || {};
    current.strategy = 'ranking_clusters';
    current.clusterSize = Math.max(2, Math.min(64, parseInt(value, 10) || 8));
    current.rematchPolicy = 'exhaust_cluster_before_repeat';
    S.cfg.classificationPairing = current;
    var output = document.getElementById('f2-cluster-size-value'); if (output) output.textContent = current.clusterSize;
    if (!input) { _norm(); _rerender(); }
  };
  window._f2Form = function (v) { S.cfg.formacaoDupla = v; _norm(); _rerender(); };
  window._f2ElimManualPairing = function (checked) { S.cfg.manualPairingOpen = !!checked; _norm(); _rerender(); };
  // v4.4.19: "Formação das equipes" — 1 controle: Montadas (fixa+manual) / Sorteio
  // (fixa+sorteio) / Rei/Rainha (rotativo, só 1 grupo).
  window._f2TeamForm = function (v) {
    if (!S) return;
    S.fixedClassification=false; S.sliderModes={};
    if (v === 'montadas') { if (S.cfg.parceria === 'rotation_groups') S.cfg.rotationCategoryRules=null; S.cfg.parceria = 'fixa'; S.cfg.formacaoDupla = 'manual'; }
    else if (v === 'sorteio') {
      // v4.4.30: Sorteio defaulta pra "por rodada" (só com 1 grupo); 2+ grupos = dupla fixa sorteada.
      S.cfg.formacaoDupla = 'sorteio';
      if (S.cfg.grupos === 1) { S.cfg.parceria = 'sorteio_rodada'; }
      else { S.cfg.parceria = 'fixa'; S.cfg.formacaoDupla = 'sorteio'; }
    }
    else if (v === 'rei_rainha') { window._f2ClassificationStructure(v); return; }
    else if (v === 'super_eight') {
      if (S.cfg.parceria !== 'super_eight') S.cfg.rodadas.n = 7;
      S.cfg.parceria = 'super_eight'; S.cfg.formacaoDupla = 'sorteio'; S.cfg.superEightDrawMode = 'single';
      if (!S.cfg.rodadas.drawFirstDate) S.cfg.rodadas.drawManual = true;
    }
    else if (v === 'rotation_groups_8') {
      if (S.cfg.parceria === 'fixa' && !_switchGroupUnits(true)) return;
      S.cfg.parceria = 'rotation_groups_8'; S.cfg.formacaoDupla = 'sorteio';
      delete S.cfg.classificationSchedule;
      if (S.cfg.groupCategoryRules) S.cfg.groupCategoryRules.forEach(function (rule) { delete rule.gamesPerUnit; delete rule.allowRepeat; });
      if (!('rotationAllowRepeatPartners' in S.cfg)) S.cfg.rotationAllowRepeatPartners = false;
      if (!Number.isInteger(Number(S.cfg.rodadas.n)) || Number(S.cfg.rodadas.n) < 1) S.cfg.rodadas.n = 5;
    }
    _norm(); _rerender();
  };
  function _currentRotationRules() {
    return _rotationCategories().map(function (category) {
      return Object.assign({ category:category, rounds:S.cfg.rodadas.n,
        destination:S.cfg.eliminatoria.ativa ? 'elimination' : 'ranking' }, window.FORMAT2.rotationRuleForCategory(S.cfg, category));
    });
  }
  window._f2RotationByCategory = function (enabled) {
    if (!S || _hasDrawnGames() || S.cfg.parceria !== 'rotation_groups_8') return;
    if (enabled && _rotationCategories().length > 1) S.cfg.rotationCategoryRules = _currentRotationRules();
    else delete S.cfg.rotationCategoryRules;
    _norm(); _rerender();
  };
  window._f2RefreshRotationCategories = function () {
    if (!S) return;
    var capacityFocus=document.activeElement?.dataset?.category;
    _restoreSliderCapacities();
    var groups = document.getElementById('f2-group-categories');
    if (groups && S) groups.innerHTML = _groupCategoryControls(S.cfg);
    if (S && S.mountEl?.querySelectorAll) S.mountEl.querySelectorAll('[data-rotation-phase]').forEach(function (block) {
      block.outerHTML = _rotationSliderCards(Number(block.dataset.rotationPhase));
    });
    _placeSliderCapacities();
    if (capacityFocus && S?.mountEl?.querySelectorAll) {
      var focused=Array.from(S.mountEl.querySelectorAll('input[data-category]')).find(input=>input.dataset.category===capacityFocus);
      if (focused) focused.focus({preventScroll:true});
    }
    var controls = document.getElementById('f2-rotation-categories');
    if (controls && S && S.cfg.parceria === 'rotation_groups_8') controls.innerHTML = _rotationCategoryControls(S.cfg);
  };
  function _reconcileQualificationDestinations() {
    if(!S) return;
    var cfg=S.cfg, eligible=_sliderCategories().filter(cat=>cfg.classifAtiva && cfg.eliminatoria.ativa &&
      !cfg.rotationCategoryRules?.some(r=>r.category===cat && r.destination==='ranking'));
    S.qualificationDrafts=S.qualificationDrafts || [{},{}];
    [0,1].forEach(function(phase){
      var holder=phase?cfg.eliminatoria:cfg,key=phase?'formationQualificationCategoryRules':'qualificationCategoryRules';
      if(!Array.isArray(holder[key])) return;
      holder[key].forEach(row=>{S.qualificationDrafts[phase][row.category]=row.perGroup;});
      holder[key]=(phase && !cfg.eliminatoria.openReiRainha?[]:eligible).map(category=>({category:category,
        perGroup:S.qualificationDrafts[phase][category] || cfg.classificados || 2}));
    });
  }
  window._f2RotationRule = function (index, rounds, destination) {
    if (!S || _hasDrawnGames() || !S.cfg.rotationCategoryRules) return;
    var rules = S.cfg.rotationCategoryRules.map(function (rule) {return Object.assign({},rule);}), rule = rules[index];
    if (!rule) return;
    if (rounds != null) {
      var n = Number(rounds);
      if (!Number.isSafeInteger(n) || n < 1 || n > (S.cfg.rotationAllowRepeatPartners ? 128 : 7)) return;
      rule.rounds = n;
    }
    if (destination === 'ranking' || (destination === 'elimination' && S.cfg.eliminatoria.ativa)) rule.destination = destination;
    S.cfg.rotationCategoryRules = rules;
    _reconcileQualificationDestinations();
    _norm(); _rerender();
  };
  window._f2RotationRounds = function (value) {
    if (!S || S.cfg.parceria !== 'rotation_groups_8' || _hasDrawnGames()) return;
    var n = Number(value);
    if (!Number.isSafeInteger(n) || n < 1 || n > (S.cfg.rotationAllowRepeatPartners ? 128 : 7)) return;
    S.cfg.rodadas.n = n; _norm(); _rerender();
  };
  // v4.4.30: toggle "Novo parceiro a cada rodada" dentro do Sorteio. ON = sorteio_rodada
  // (rotativo); OFF = dupla sorteada 1× e fixa (fixa+sorteio).
  window._f2SorteioPorRodada = function (checked) {
    if (!S) return;
    if (checked) { S.cfg.parceria = 'sorteio_rodada'; }
    else { S.cfg.parceria = 'fixa'; S.cfg.formacaoDupla = 'sorteio'; }
    _norm(); _rerender();
  };
  window._f2SuperEightDrawMode = function (single) {
    if (!S || S.cfg.parceria !== 'super_eight') return;
    S.cfg.superEightDrawMode = single ? 'single' : 'rounds';
    _norm(); _rerender();
  };
  window._f2Modo = function (v) { S.cfg.rodadas.modo = v; _norm(); _rerender(); };
  window._f2Turnos = function (v) {
    if (!S) return;
    if (v === 'ida_volta' && window.FORMAT2.resolveTurnos(S.cfg).groups > 1) { _rerender(); return; }
    S.cfg.rodadas.turnos = v; _norm(); _rerender();
  };
  window._f2Rn = function (v) {
    if (!S) return;
    var n = parseInt(v, 10);
    if (!(n >= 1)) { return; } // vazio → mantém tudo (repetir intacto), sem re-render
    if (_hasDrawnGames()) {
      if (S.cfg.parceria === 'super_eight' && S.cfg.superEightDrawMode === 'single') {
        if (n < S.cfg.rodadas.n || n > 7) { _rerender(); return; }
      }
      var drawn = Math.max((S.t.rounds || []).length, (S.t.swissRoundsData || []).length,
        (S.t.matches || []).reduce(function (max, match) {
          return match && Number(match.phaseIndex || 0) === 0 ? Math.max(max, Number(match.round) || 0) : max;
        }, 0), 1);
      if (n < drawn) { _rerender(); return; }
    }
    S.cfg.rodadas.n = n;
    _norm(); _rerender();
  };
  window._f2UniquePartner = function (checked) {
    if (!S) return;
    if (checked && S.cfg.parceria !== 'super_eight') S.cfg.rodadas.n = 7;
    S.cfg.parceria = checked ? 'super_eight' : 'sorteio_rodada';
    if (checked) { S.cfg.formacaoDupla = 'sorteio'; S.cfg.superEightDrawMode = 'single'; }
    _norm(); _rerender();
  };
  // O modo manual oculta a agenda automática e mantém a quantidade de rodadas.
  window._f2SchedManual = function (checked) { if (!S) return; S.cfg.rodadas.drawManual = !!checked; _norm(); _rerender(); };
  // v1.4.12/15: autodesativação dos inscritos (id liga-allow-self-deactivation, lido pelo save
  // do form). Sem _rerender: o toggle é estado puro do modelo, e re-renderizar aqui roubaria o
  // foco do bloco. Grava a escolha EXPLÍCITA — que vence o default de rodada única (format2.js).
  window._f2AllowSelfDeact = function (checked) { if (!S) return; S.cfg.rodadas.allowSelfDeactivation = !!checked; _norm(); _rerender(); };
  // v4.5.88: Nº de RODADAS derivado da janela pela MESMA fórmula ESTRITA do runtime
  // (window._phasePlannedRounds): floor((fim − 1º − 1ms) / (iv×dia)) + 1 = nº de sorteios
  // que disparam ESTRITAMENTE antes do fim. Antes usava Math.round(janela/iv), que diverge
  // do runtime por 1 em janelas fracionárias (ex.: 2,4 dias → round=2, estrito=3) — o editor
  // mostrava um N e a barra do torneio outro. Retorna null quando não dá pra derivar.
  function _strictNFromWindow(iv) {
    if (!S || !S.cfg || !S.cfg.rodadas) return null;
    iv = parseInt(iv, 10);
    if (!(iv >= 1)) return null;
    var _v = function (id) { var el = document.getElementById(id); return el ? (el.value || '') : ''; };
    var firstDate = S.cfg.rodadas.drawFirstDate || _v('tourn-start-date') || '';
    var firstTime = (S.cfg.rodadas.drawFirstDate ? (S.cfg.rodadas.drawFirstTime || '') : _v('tourn-start-time')) || '19:00';
    var endDate = _v('tourn-end-date');
    var endTime = _v('tourn-end-time') || '23:59';
    if (!firstDate || !endDate) return null;
    var fd = new Date(firstDate + 'T' + firstTime).getTime();
    var ed = new Date(endDate + 'T' + endTime).getTime();
    if (isNaN(fd) || isNaN(ed) || ed <= fd) return null;
    return Math.floor((ed - fd - 1) / (iv * 86400000)) + 1;
  }
  // v4.4.62: recalcula o Nº de RODADAS pela janela (fim − 1º sorteio, COM horário) mantendo o
  // intervalo. Chamado ao mudar data/hora do 1º sorteio, do início ou do fim da fase.
  function _recalcN() {
    if (!S || !S.cfg || !S.cfg.rodadas) return;
    var iv = parseInt(S.cfg.rodadas.drawIntervalDays, 10);
    if (!(iv >= 1)) return; // sem repetição → nº de rodadas não deriva da janela
    var n = _strictNFromWindow(iv);
    if (n != null) S.cfg.rodadas.n = Math.max(1, n);
  }
  // Exposto pros campos legados de Início/Término da fase (#tourn-start/end-date/time).
  window._f2RecalcRoundsFromWindow = function () { if (!S || !S.cfg || S.cfg.rodadas.modo !== 'fixo') return; _f2SchedRefresh(); };
  // v4.4.71: texto da nota derivado do estado — compartilhado por _schedBlock (render) e
  // _f2SchedRefresh (update in-place). Fonte única do texto, sem divergir.
  function _f2SchedNote(r) {
    var canAuto = !!r.drawFirstDate;
    var manual = !!r.drawManual;
    var ivVal = (parseInt(r.drawIntervalDays, 10) >= 1) ? parseInt(r.drawIntervalDays, 10) : '';
    if (manual) return 'Sorteio manual';
    if (!canAuto) return 'Informe a data do sorteio';
    if (S.cfg.parceria === 'super_eight' && S.cfg.superEightDrawMode === 'single') return 'Sorteio único';
    if (ivVal) return 'A cada ' + ivVal + ' dia(s)';
    return Number(r.n) > 1 ? 'Informe o intervalo entre sorteios' : '';
  }
  // v4.4.71 FIX: atualiza os valores DERIVADOS do bloco de agendamento (Nº de rodadas,
  // Repetir, ✕, nota) SEM reconstruir os inputs — preserva a digitação nativa. O bug do
  // "digita 17 e vira 1" era o _rerender destruindo o input a cada mudança. Só o _rerender
  // ESTRUTURAL (data vazia↔preenchida, que liga/desliga o modo auto) reconstrói o bloco.
  function _f2SchedRefresh() {
    if (!S || !S.cfg || !S.cfg.rodadas) return;
    var r = S.cfg.rodadas;
    var ivVal = (parseInt(r.drawIntervalDays, 10) >= 1) ? parseInt(r.drawIntervalDays, 10) : '';
    var setIdle = function (id, val) { var el = document.getElementById(id); if (el && document.activeElement !== el) el.value = val; };
    setIdle('f2-sched-n', r.n || '');
    setIdle('f2-sched-iv', ivVal);
    // v1.2.38: '' (não 'inline') devolve o display da classe .cancel-x-btn (inline-flex) —
    // 'inline' descentraria o X dentro do círculo.
    var x = document.getElementById('f2-sched-ivx'); if (x) x.style.display = ivVal ? '' : 'none';
    var note = document.getElementById('f2-sched-note'); if (note) note.textContent = _f2SchedNote(r);
  }
  // A DATA re-renderiza SÓ quando liga/desliga o modo auto (vazia↔preenchida) — aí a estrutura
  // muda (default manual/auto, nota). Mudar uma data já preenchida, a HORA, o intervalo ou o nº
  // de rodadas atualiza no lugar, sem destruir o input em edição.
  window._f2SchedDate = function (v) {
    if (!S) return;
    var was = !!S.cfg.rodadas.drawFirstDate;
    S.cfg.rodadas.drawFirstDate = v || '';
    var nowSet = !!S.cfg.rodadas.drawFirstDate;
    // A data do sorteio vem depois das datas da fase e antes do número de
    // rodadas. Não modifica os controles já percorridos pelo organizador.
    _norm();
    if (was !== nowSet) _rerender(); else _f2SchedRefresh();
  };
  window._f2SchedTime = function (v) { if (!S) return; S.cfg.rodadas.drawFirstTime = v || '19:00'; _norm(); _f2SchedRefresh(); };
  // CANON (v4.5.24): editar REPETIR (mantendo F) → recalcula as RODADAS pela janela.
  // CANON (dono, 17/jul): apagar o REPETIR = sorteio ÚNICO ⇒ o painel passa a mostrar
  // "Nº de rodadas = 1". Antes deixava vazio e NÃO mexia nas rodadas → dava pra salvar
  // "2 rodadas" + "sem repetição": o painel prometia 2 e o sistema fazia 1 (a rodada 2 nunca
  // tinha quando sortear → nextDrawAt nem existia). Dono: "não pode o painel dizer 2 rodadas
  // e o sistema fazer apenas uma em clara contradição" / "isso para que o usuário entenda o
  // que vai acontecer". A config agora é sempre COERENTE e VISÍVEL.
  window._f2SchedInterval = function (v) {
    if (!S) return;
    var iv = parseInt(v, 10);
    if (!(iv >= 1)) { S.cfg.rodadas.drawIntervalDays = null; _norm(); _f2SchedRefresh(); return; }
    S.cfg.rodadas.drawIntervalDays = iv;
    _norm(); _f2SchedRefresh();
  };
  // Slider de classificados: número + resumo da eliminatória ao vivo no arraste; re-render ao soltar.
  window._f2ClassLive = function (v) {
    if (!S) return;
    S.cfg.classificados = Math.max(1, parseInt(v, 10) || 1);
    var lbl = document.getElementById('f2-class-val'); if (lbl) lbl.textContent = S.cfg.classificados;
    if (S._rafC) return;
    S._rafC = requestAnimationFrame(function () { S._rafC = null; var b = document.getElementById('f2-elim-summary'); if (b) b.innerHTML = _elimSummary(S.cfg); });
  };
  window._f2Class = function (v) {
    if (!S) return;
    var n = Math.max(1, parseInt(v, 10) || 1);
    // v4.4.41: chegar no total de inscritos (geral) = TODOS → some a barra, botão vira Todos.
    var units = _groupInfo(S.cfg).units;
    var perGroupScope = (_effectiveGroupCount(S.cfg, _groupInfo(S.cfg)) > 1 || S.cfg.parceria === 'rotation_groups_8' || (S.cfg.groupCategoryRules && S.cfg.groupCategoryRules.length)) && S.cfg.classifScope !== 'overall';
    if (!perGroupScope && units > 1 && n >= units) { S.cfg.eliminatoria.qualifyAll = true; }
    else { S.cfg.classificados = n; }
    _norm(); _rerender();
  };
  // v4.4.31: escopo da classificação — por grupos × geral.
  window._f2ClassScope = function (v) { if (!S) return; S.cfg.classifScope = (v === 'overall') ? 'overall' : 'per_group'; _norm(); _rerender(); };
  // v4.4.36: quantos avançam — todos × os melhores (slider).
  window._f2QualifyAll = function (all) { if (!S) return; S.cfg.eliminatoria.qualifyAll = !!all; _norm(); _rerender(); };
  window._f2TeamCompetition = function (enabled) {
    if (!S) return;
    var tc = S.cfg.teamCompetition || {};
    tc.enabled = !!enabled;
    // Times começam vazios: a quantidade é a lista que o organizador criou, nunca
    // um número padrão escondido. Isso evita "Time 1…8" não escolhidos no sorteio.
    tc.teamNames = Array.isArray(tc.teamNames) ? tc.teamNames : [];
    tc.teamCount = tc.teamNames.length; tc.formation = 'draw';
    tc.schedule = tc.schedule || { teamsPerGroup: 2, gamesPerPair: 1, gamesPerTeam: 1, pairsPerTeamByCategory: {}, gamesPerPairByCategory: {}, mode: 'structured' };
    tc.schedule.enabled = true;
    if (tc.internalMatches !== 'allow' && tc.internalMatches !== 'avoid') tc.internalMatches = 'avoid';
    tc.scoring = tc.scoring || { win: 3, draw: 1, loss: 0 };
    if (tc.ranking !== 'games_diff') tc.ranking = 'points';
    if (tc.aggregation !== 'per_category') tc.aggregation = 'overall';
    S.cfg.teamCompetition = tc; _norm(); _rerender();
  };
  window._f2TeamInternalMatches = function (allowed) {
    if (!S || !S.cfg.teamCompetition) return;
    S.cfg.teamCompetition.internalMatches = allowed && !_teamScheduleRequiresInternalAvoid(S.cfg.teamCompetition) ? 'allow' : 'avoid'; _norm(); _rerender();
  };
  window._f2TeamRanking = function (ranking) {
    if (!S || !S.cfg.teamCompetition) return;
    S.cfg.teamCompetition.ranking = ranking === 'games_diff' ? 'games_diff' : 'points'; _norm(); _rerender();
  };
  window._f2TeamTiebreakStart = function () {
    if (!S || !S.cfg.teamCompetition) return;
    S.cfg.teamCompetition.tiebreakers = S.cfg.teamCompetition.classificationUnit === 'pair'
      ? ['vitorias', 'games_vencidos'] : ['vitorias', 'games_vencidos', 'sorteio'];
    _norm(); _rerender();
  };
  window._f2TeamTiebreakAdd = function (key) {
    if (!S || !S.cfg.teamCompetition || !key) return;
    var list = S.cfg.teamCompetition.tiebreakers;
    if (!Array.isArray(list) || list.indexOf(key) >= 0 ||
        (key === 'sorteio' && S.cfg.teamCompetition.classificationUnit === 'pair')) return;
    list.push(key); _norm(); _rerender();
  };
  window._f2TeamTiebreakRemove = function (index) {
    if (!S || !S.cfg.teamCompetition || !Array.isArray(S.cfg.teamCompetition.tiebreakers)) return;
    S.cfg.teamCompetition.tiebreakers.splice(index, 1); _norm(); _rerender();
  };
  window._f2TeamTiebreakMove = function (index, step) {
    if (!S || !S.cfg.teamCompetition || !Array.isArray(S.cfg.teamCompetition.tiebreakers)) return;
    var list = S.cfg.teamCompetition.tiebreakers, target = index + step;
    if (target < 0 || target >= list.length) return;
    var item = list[index]; list[index] = list[target]; list[target] = item; _norm(); _rerender();
  };
  window._f2TeamAggregation = function (aggregation) {
    if (!S || !S.cfg.teamCompetition) return;
    S.cfg.teamCompetition.aggregation = aggregation === 'per_category' ? 'per_category' : 'overall'; _norm(); _rerender();
  };
  window._f2TeamClassificationUnit = function (unit) {
    if (!S || !S.cfg.teamCompetition) return;
    S.cfg.teamCompetition.classificationUnit = unit === 'pair' ? 'pair' : 'team';
    if (S.cfg.teamCompetition.classificationUnit === 'pair' && Array.isArray(S.cfg.teamCompetition.tiebreakers)) {
      S.cfg.teamCompetition.tiebreakers = S.cfg.teamCompetition.tiebreakers.filter(function (key) { return key !== 'sorteio'; });
    }
    _norm(); _rerender();
  };
  window._f2TeamScheduleByCategory = function (enabled) {
    if (!S || !S.cfg.teamCompetition) return;
    var tc = S.cfg.teamCompetition;
    tc.schedule = tc.schedule || {};
    if (enabled) {
      var previous = tc.schedule.gamesPerPairByCategory || {};
      var all = {};
      _teamCompetitionCategories(tc).forEach(function (category) {
        all[category] = previous[category] || tc.schedule.gamesPerPair || 1;
      });
      tc.schedule.gamesPerPairByCategory = all;
    } else tc.schedule.gamesPerPairByCategory = {};
    _norm(); _rerender();
    if (typeof window._recalcDuration === 'function') window._recalcDuration();
  };
  window._f2TeamPairDays = function (enabled) {
    if (!S || !S.cfg.teamCompetition) return;
    var schedule = S.cfg.teamCompetition.schedule || (S.cfg.teamCompetition.schedule = {});
    schedule.originDayPolicy = enabled ? 'organizer-pair-days' : '';
    if (!enabled) { schedule.pairDayAssignments = []; schedule.rosterSnapshot = []; }
    _norm(); _rerender();
  };
  function _f2TeamScheduleRefresh(tc) {
    if (!tc || !tc.schedule) return;
    var teams = Math.max(2, parseInt(tc.schedule.teamsPerGroup, 10) || 2);
    var games = Math.max(1, parseInt(tc.schedule.gamesPerPair, 10) || parseInt(tc.schedule.gamesPerTeam, 10) || 1);
    var gamesMax = Math.max(1, teams - 1);
    if (games > gamesMax) games = gamesMax;
    var setText = function (id, value) { var target = document.getElementById(id); if (target) target.textContent = value; };
    setText('f2-team-schedule-teams-value', teams);
    setText('f2-team-schedule-games-value', games);
    var teamsInput = document.getElementById('f2-team-schedule-teams');
    if (teamsInput) { teamsInput.value = teams; teamsInput.setAttribute('aria-valuetext', teams + ' times por grupo'); }
    var gamesInput = document.getElementById('f2-team-schedule-games');
    if (gamesInput) { gamesInput.max = gamesMax; gamesInput.value = games; gamesInput.setAttribute('aria-valuetext', games + ' rodadas por dupla no grupo'); }
  }
  window._f2TeamSchedule = function (field, value, el) {
    if (!S || !S.cfg.teamCompetition) return;
    var tc = S.cfg.teamCompetition;
    tc.schedule = tc.schedule || {};
    if (field === 'mode') { tc.schedule.mode = value === 'structured' ? 'structured' : 'free'; tc.schedule.modeChosen = true; }
    else if (field === 'teamsPerGroup') tc.schedule.teamsPerGroup = value;
    else if (field === 'gamesPerPair' || field === 'gamesPerTeam') {
      tc.schedule.gamesPerPair = value;
      // Mantém apenas o espelho de compatibilidade; o motor lê gamesPerPair.
      tc.schedule.gamesPerTeam = value;
    }
    _norm();
    // O arraste atualiza os valores no mesmo frame. A reconstrução estrutural fica no
    // blur, pela proteção de _rerenderSemAtrapalhar, para o range não saltar de posição.
    _f2TeamScheduleRefresh(S.cfg.teamCompetition); _rerenderSemAtrapalhar(el);
    /* REGRESSÃO — Neon, 29/set/2026: os números dos sliders mudavam, mas a estimativa
     * de tempo permanecia na contagem anterior. O próprio `oninput` é o evento do
     * arraste; recalcular aqui mantém confrontos e duração sincronizados em cada pixel,
     * sem esperar salvar, soltar o controle ou trocar de seção. */
    if (typeof window._recalcDuration === 'function') window._recalcDuration();
  };
  window._f2TeamCategorySchedule = function (category, field, value, el) {
    if (!S || !S.cfg.teamCompetition) return;
    var name = String(category || '').trim();
    if (!name) return;
    var tc = S.cfg.teamCompetition;
    tc.schedule = tc.schedule || {};
    if (field === 'games') {
      tc.schedule.gamesPerPairByCategory = tc.schedule.gamesPerPairByCategory || {};
      var maxGames = Math.max(1, (parseInt(tc.schedule.teamsPerGroup, 10) || 2) - 1);
      tc.schedule.gamesPerPairByCategory[name] = Math.max(1, Math.min(maxGames, parseInt(value, 10) || 1));
    } else {
      tc.schedule.pairsPerTeamByCategory = tc.schedule.pairsPerTeamByCategory || {};
      tc.schedule.pairsPerTeamByCategory[name] = Math.max(1, Math.min(64, parseInt(value, 10) || 1));
    }
    if (_teamScheduleRequiresInternalAvoid(tc)) tc.internalMatches = 'avoid';
    _norm(); _rerenderSemAtrapalhar(el);
    // Atualiza a escada imediatamente. O rerender estrutural é deliberadamente
    // adiado para não roubar foco do campo, mas a prévia deve refletir cada
    // alteração de vagas/jogos no mesmo evento (inclusive antes do blur).
    // create-tournament.js is loaded immediately before this file (both `defer`),
    // and defines the global renderer at load time. Keep the guard for legacy/page
    // shells where the editor is mounted without the create view.
    if (typeof window._renderPhaseEstimate === 'function') window._renderPhaseEstimate();
    if (typeof window._recalcDuration === 'function') window._recalcDuration();
  };
  // Compatibilidade para páginas ainda montadas pela versão anterior da UI.
  window._f2TeamCategoryPairs = function (category, value, el) {
    window._f2TeamCategorySchedule(category, 'pairs', value, el);
  };
  window._f2TeamName = function (index, value, el) {
    if (!S || !S.cfg.teamCompetition || index < 0) return;
    var tc = S.cfg.teamCompetition;
    tc.teamNames = Array.isArray(tc.teamNames) ? tc.teamNames : [];
    tc.teamNames[index] = String(value || ''); tc.teamCount = tc.teamNames.length; _norm(); _rerenderSemAtrapalhar(el);
  };
  window._f2AddTeam = function () {
    if (!S || !S.cfg.teamCompetition) return;
    var tc = S.cfg.teamCompetition;
    tc.teamNames = Array.isArray(tc.teamNames) ? tc.teamNames.slice() : [];
    tc.teamNames.push(''); tc.teamCount = tc.teamNames.length;
    _norm(); _rerender();
  };
  window._f2RemoveTeam = function (index) {
    if (!S || !S.cfg.teamCompetition) return;
    var tc = S.cfg.teamCompetition;
    tc.teamNames = Array.isArray(tc.teamNames) ? tc.teamNames.slice() : [];
    if (index < 0 || index >= tc.teamNames.length) return;
    tc.teamNames.splice(index, 1); tc.teamCount = tc.teamNames.length;
    _norm(); _rerender();
  };
  window._f2TeamScore = function (field, value, el) {
    if (!S || !S.cfg.teamCompetition || ['win', 'draw', 'loss'].indexOf(field) === -1) return;
    S.cfg.teamCompetition.scoring = S.cfg.teamCompetition.scoring || {};
    S.cfg.teamCompetition.scoring[field] = value; _norm(); _rerenderSemAtrapalhar(el);
  };
  window._f2Elim = function (checked) {
    if (!S || _faseLockState(S).elimLocked || (!checked && S.cfg.rotationCategoryRules && _hasDrawnGames())) { _rerender(); return; }
    if (!checked && !S.cfg.classifAtiva) {
      if (_hasDrawnGames()) { _rerender(); return; }
      S.cfg.classifAtiva = true;
      S.cfg.eliminatoria.openReiRainha = false;
      S.cfg.rodadas.modo = 'todos';
    }
    if (!checked && S.cfg.eliminatoria.formationCategoryRules) S.cfg.eliminatoria.formationCategoryRules=null;
    S.cfg.eliminatoria.ativa = !!checked;
    if (!checked && S.cfg.rotationCategoryRules) S.cfg.rotationCategoryRules.forEach(function (rule) { rule.destination = 'ranking'; });
    _reconcileQualificationDestinations();
    _norm(); _rerender();
  };
  window._f2ClassifAtiva = function (checked) {
    if (!S || _faseLockState(S).classifToggleLocked || (!checked && !S.cfg.eliminatoria.ativa)) { _rerender(); return; }
    if (!checked && S.cfg.parceria==='rotation_groups') { S.cfg.rotationCategoryRules=null; S.cfg.parceria='fixa'; }
    if (!checked && S.cfg.eliminatoria.formationCategoryRules) S.cfg.eliminatoria.formationCategoryRules=null;
    S.cfg.classifAtiva = !!checked;
    _reconcileQualificationDestinations();
    _norm(); _rerender();
  };
  window._f2Linhas = function (n) { if (!S) return; S.cfg.eliminatoria.linhas = parseInt(n, 10) || 1; _norm(); _rerender(); };
  window._f2ParallelLines = function (enabled) { if (!S) return; S.cfg.eliminatoria.linhas = enabled ? 2 : 1; _norm(); _rerender(); };
  // ── Formato da partida da ELIMINATÓRIA (cfg.eliminatoria.scoring) ──
  // Ligar o toggle NÃO muda o jogo: começa com uma cópia do formato da fase inicial, e a
  // pessoa então escolhe outro. (Ligar e já mudar o placar por baixo seria surpresa.)
  window._f2GetElimScoring = function () {
    return (S && S.cfg && S.cfg.eliminatoria && S.cfg.eliminatoria.scoring) || null;
  };
  window._f2SetElimScoring = function (sc) {
    if (!S) return;
    var current = _elimEffScoring(S.cfg.eliminatoria || {});
    var hasResult = typeof window._scoringPhaseHasResult === 'function' && window._scoringPhaseHasResult(1);
    var hasTiebreak = typeof window._scoringPhaseHasTiebreak === 'function' && window._scoringPhaseHasTiebreak(1);
    if (current && (hasResult || hasTiebreak)) {
      // "Herdar" continua permitido antes de placares; depois, conserva as regras
      // que já podem afetar uma partida registrada, mesmo se a pessoa trocar preset.
      sc = Object.assign({}, sc || current);
      if (hasResult) {
        sc.gamesPerSet = current.gamesPerSet;
        sc.fixedSet = current.fixedSet;
        sc.fixedSetGames = current.fixedSetGames;
        sc.tiebreakAt = current.tiebreakAt;
      }
      if (hasTiebreak) {
        sc.tieRule = current.tieRule || (current.tiebreakEnabled === false ? 'extend' : 'tiebreak');
        sc.tiebreakEnabled = sc.tieRule === 'tiebreak';
        sc.setTwoPointAdvantage = current.setTwoPointAdvantage != null ? current.setTwoPointAdvantage : current.twoPointAdvantage;
        sc.tiebreakTwoPointAdvantage = current.tiebreakTwoPointAdvantage != null ? current.tiebreakTwoPointAdvantage : current.twoPointAdvantage;
        sc.tiebreakMargin = current.tiebreakMargin;
      }
    }
    // Configuração nova/alterada deriva o empate automaticamente: N games para
    // vencer significa que o tie-break, se ligado, começa em (N-1)–(N-1).
    // Um tie-break já registrado conserva a regra congelada da fase.
    if (sc && sc.gamesPerSet != null && !hasTiebreak) {
      var gamesTarget = Number(sc.gamesPerSet) || 6;
      sc.tiebreakAt = gamesTarget <= 1 ? '' : 'g-1';
    }
    S.cfg.eliminatoria.scoring = sc || null;
    _norm(); _rerender();
  };
  // Dois formatos são o MESMO quando toda regra que o jogo lê bate. Comparação por campo,
  // não por JSON.stringify: a ordem das chaves difere entre quem monta a mão e quem lê ocultos.
  function _mesmoFormato(a, b) {
    if (!a || !b) return false;
    var campos = ['setsToWin', 'gamesPerSet', 'tiebreakPoints', 'tiebreakMargin',
                  'superTiebreakPoints'];
    var bools = ['tiebreakEnabled', 'twoPointAdvantage', 'setTwoPointAdvantage', 'tiebreakTwoPointAdvantage', 'superTiebreak', 'advantageRule', 'fixedSet'];
    for (var i = 0; i < campos.length; i++) {
      if ((parseInt(a[campos[i]], 10) || 0) !== (parseInt(b[campos[i]], 10) || 0)) return false;
    }
    for (var j = 0; j < bools.length; j++) { if (!!a[bools[j]] !== !!b[bools[j]]) return false; }
    // Presets não trazem fixedSetGames; com "Games fixos" desligado ele não afeta o jogo.
    if (a.fixedSet && (parseInt(a.fixedSetGames, 10) || 0) !== (parseInt(b.fixedSetGames, 10) || 0)) return false;
    var atA = a.tiebreakAt || '', atB = b.tiebreakAt || '';
    var ruleA = a.tieRule || (a.tiebreakEnabled === false ? 'extend' : 'tiebreak');
    var ruleB = b.tieRule || (b.tiebreakEnabled === false ? 'extend' : 'tiebreak');
    return atA === atB && ruleA === ruleB && a.customRulesVersion === b.customRulesVersion;
  }
  function _setElimGameRule(patch,mark) {
    if(!S)return;
    if(window._gsmCustomRulesLocked && window._gsmCustomRulesLocked(1)){_rerender();return;}
    var base=_elimEffScoring(S.cfg.eliminatoria);if(!base)return;
    if(mark!==false && window._gsmControlsScoring)base=window._gsmControlsScoring(base);
    var sc=Object.assign({},base,patch,mark===false?{}:{customRulesVersion:1});
    sc.type='sets';
    var ini=window._gsmReadHidden?window._gsmReadHidden():null;
    window._f2SetElimScoring(ini&&_mesmoFormato(sc,ini)?null:sc);
  }
  window._f2ElimSetGameMode=function(fixed) {
    if(!S||typeof fixed!=='boolean')return;
    var base=_elimEffScoring(S.cfg.eliminatoria);if(!base)return;
    var n=Number(base.fixedSet?base.fixedSetGames||base.gamesPerSet:base.gamesPerSet)||6;
    _setElimGameRule(Object.assign({fixedSet:fixed,gamesPerSet:n},fixed?{fixedSetGames:n}:{}),false);
  };
  window._f2ElimSetGames=function(raw){
    var n=Number(raw),base=_elimEffScoring(S&&S.cfg.eliminatoria);
    if(!Number.isInteger(n)||n<1||!base){_rerender();return;}
    _setElimGameRule(Object.assign({gamesPerSet:n},base.fixedSet?{fixedSetGames:n}:{}));
  };
  window._f2ElimSetTieAt=function(raw){var n=Number(raw);if(Number.isInteger(n)&&n>=1&&n<=99)_setElimGameRule({tiebreakAt:String(n)});};
  window._f2ElimSetRule=function(rule){if(['tiebreak','extend'].indexOf(rule)>=0)_setElimGameRule({tieRule:rule,tiebreakEnabled:rule==='tiebreak'});};
  window._f2ElimSetTwoPoint=function(v){_setElimGameRule({setTwoPointAdvantage:!!v,twoPointAdvantage:!!v});};
  window._f2ElimSetTbTwoPoint=function(v){_setElimGameRule({tiebreakTwoPointAdvantage:!!v,tiebreakMargin:v?2:1});};
  window._f2ElimSetOption=function(key,value){
    if(['setsToWin','tiebreakPoints','superTiebreakPoints','superTiebreak'].indexOf(key)<0)return;
    if(key!=='superTiebreak'){value=Number(value);if(!Number.isInteger(value)||value<1||(key==='setsToWin'&&value>3))return;}
    var current=_elimEffScoring(S&&S.cfg.eliminatoria);if(!current)return;
    if(key==='superTiebreak' && value && ![2,3].includes(Number(current.setsToWin)))return;
    var patch={};patch[key]=value;if(key==='setsToWin' && value===1)patch.superTiebreak=false;_setElimGameRule(patch);
  };
  window._f2ElimScoringPreset = function (key) {
    if (!S) return;
    if (key === 'custom') { if (typeof window._openGSMConfig === 'function') window._openGSMConfig('elim'); return; }
    var p = (window._gsmPresets || {})[key];
    if (!p) return;
    var sc = Object.assign({ type: 'sets' }, p);
    delete sc.label; delete sc.icon;
    var current = _elimEffScoring(S.cfg.eliminatoria) || {};
    if(current.customRulesVersion===1 && window._gsmCustomRulesLocked && window._gsmCustomRulesLocked(1))return;
    if (key === 'fixedGames') {
      sc.gamesPerSet = Number(current.fixedSetGames || current.gamesPerSet) || 6;
      sc.fixedSetGames = sc.gamesPerSet;
      if (sc.gamesPerSet % 2 === 0) { sc.tieRule = 'tiebreak'; sc.tiebreakEnabled = true; }
    }
    if (Number(current.gamesPerSet || 6) !== Number(sc.gamesPerSet || 6) &&
        typeof window._scoringPhaseHasResult === 'function' && window._scoringPhaseHasResult(1)) {
      if (typeof showNotification !== 'undefined') showNotification('Games por set bloqueados', 'A fase já tem placar lançado; os games para vencer não podem mais mudar.', 'warning');
      return;
    }
    sc.tiebreakAt = current.tiebreakAt || 'g-1';
    sc.tieRule = current.tieRule || (current.tiebreakEnabled === false ? 'extend' : 'tiebreak');
    if (key === 'fixedGames' && Number(sc.gamesPerSet) % 2 === 0) sc.tieRule = 'tiebreak';
    sc.tiebreakEnabled = sc.tieRule === 'tiebreak';
    // Vantagem (deuce) é DERIVADA do esporte, nunca do preset — mesma regra do form.
    sc.advantageRule = (typeof window._gsmGetAdvantageForSport === 'function') ? window._gsmGetAdvantageForSport() : false;
    // Escolher o MESMO formato da fase inicial = voltar a HERDAR (scoring null), não congelar
    // uma cópia: assim a eliminatória continua acompanhando se a classificatória mudar depois.
    // É também o que o cânone pede — duas fontes pro mesmo jogo é o bug que este trabalho evita.
    var ini = (typeof window._gsmReadHidden === 'function') ? window._gsmReadHidden() : null;
    window._f2SetElimScoring(ini && _mesmoFormato(sc, ini) ? null : sc);
  };

  window._f2GrandFinal = function (checked) { if (!S) return; S.cfg.eliminatoria.grandFinal = !!checked; _norm(); _rerender(); };
  window._f2GrandFinalReset = function (checked) { if (!S) return; S.cfg.eliminatoria.grandFinalReset = !!checked; _norm(); _rerender(); };
  window._f2FinalSeries = function (value) { if (!S) return; S.cfg.eliminatoria.finalSeriesBestOf = Number(value); _norm(); _rerender(); };
  // Dupla eliminação não usa BYE/sobra única. A troca solicitada pelo organizador
  // é explícita e visível antes da normalização tolerante de documentos antigos.
  window._f2ElimDupla = function (checked) {
    if (!S || !S.cfg || !S.cfg.eliminatoria) return;
    var e = S.cfg.eliminatoria;
    var previous = e.politicaDaChave;
    e.dupla = !!checked;
    if (e.dupla && previous && previous !== 'repescagem' && previous !== 'playin') {
      e.politicaDaChave = 'repescagem';
      if (window.showNotification) window.showNotification('Política da chave alterada',
        'Dupla eliminação usa repescagem; BYE e sobra única não se aplicam.', 'warning');
    }
    _norm(); _rerender();
  };
  // A escolha simples é normalizada para leitura; writes explícitos incompatíveis
  // continuam recusados pela Function, independentemente desta interface.
  window._f2PoliticaDaChave = function (v) { S.cfg.eliminatoria.politicaDaChave = String(v || ''); _norm(); _rerender(); };
  // Novos confrontos só são escolhidos enquanto as inscrições estão abertas.
  window._f2ElimLateMaster = function (openOn) {
    if (!S) return; var e = S.cfg.eliminatoria;
    if (!openOn) { e.lateEnrollment = 'closed'; e.newMatchups = false; }
    else e.lateEnrollment = (e.newMatchups === true) ? 'expand' : 'standby';
    _norm(); _rerender();
  };
  window._f2ElimLateConf = function (expandOn) {
    if (!S) return; var e = S.cfg.eliminatoria;
    if (e.lateEnrollment === 'closed') return;
    e.newMatchups = !!expandOn;
    // lateEnrollment segue só a inscrição; mantém 'expand'/'standby' coerente quando ABERTA
    // (compat com quem lê o valor antigo), sem nunca reabrir uma inscrição fechada.
    if (e.lateEnrollment !== 'closed') e.lateEnrollment = expandOn ? 'expand' : 'standby';
    _norm(); _rerender();
  };
  // v1.6.80: término PRÓPRIO da eliminatória (2ª fase). Vazio = sem término próprio — o torneio
  // volta a terminar com a classificatória. A hora sozinha não vale nada (normalize a descarta
  // sem data), então limpar a data limpa a hora junto.
  window._f2ElimEndDate = function (v, el) {
    if (!S) return; var e = S.cfg.eliminatoria;
    e.endDate = String(v || '');
    if (!e.endDate) e.endTime = '';
    else if (!e.endTime) e.endTime = '23:59';   // fim do dia — o organizador escolheu o DIA
    _norm(); _rerenderSemAtrapalhar(el);
  };
  window._f2ElimEndTime = function (v, el) { if (!S) return; S.cfg.eliminatoria.endTime = String(v || ''); _norm(); _rerenderSemAtrapalhar(el); };
  // v4.5.51: abrir a eliminatória com rodada Rei/Rainha (grupos de 4 formam as duplas).
  window._f2ElimOpenRR = function (checked) { if (!S) return; if (!checked && S.cfg.eliminatoria.formationCategoryRules) S.cfg.eliminatoria.formationCategoryRules=null; S.cfg.eliminatoria.openReiRainha = !!checked; _reconcileQualificationDestinations(); _norm(); _rerender(); };
  window._f2ElimName = function (value) { if (!S) return; S.cfg.eliminatoria.nome = String(value || '').slice(0, 40); };
  window._f2ElimRRCut = function (n) { if (!S) return; S.cfg.eliminatoria.reiRainhaCut = (parseInt(n, 10) === 2) ? 2 : 4; _norm(); _rerender(); };
  // Formação/pareamento e semeadura são escolhas independentes.
  window._f2Formacao = function (v) { S.cfg.eliminatoria.formacao = v; _norm(); _rerender(); };
  window._f2Semeadura = function (v) {
    if (!S || _hasDrawnGames()) return;
    var e=S.cfg.eliminatoria;
    if(v==='grupos') delete e.groupCrossChangeConfirmed;
    else if(e.semeadura==='grupos') e.groupCrossChangeConfirmed=true;
    e.semeadura=v; _norm(); _rerender();
  };
  window._f2ThirdPlaceEnabled = function (value) {
    if (!S || !window.ScoreplaceGroupAlternation || !window.ScoreplaceGroupAlternation.eightConfig(S.cfg,category=>_sliderPopulation(category,false))) return;
    if (_faseLockState(S).elimLocked) return;
    S.cfg.eliminatoria.thirdPlaceEnabled = value === true;
    _norm(); _rerender();
  };
  window._f2LineName = function (i, v) { if (S && S.cfg.eliminatoria.nomes) S.cfg.eliminatoria.nomes[i] = v; };
  window._f2LineAssignment = function (value) {
    if (!S) return;
    var e = S.cfg.eliminatoria;
    e.lineAssignment = value === 'rank_ranges' ? 'rank_ranges' : 'strategy';
    if (e.lineAssignment === 'rank_ranges' && (!e.lineRankRanges || e.lineRankRanges.length !== e.linhas)) {
      var total = Math.max(S.cfg.classificados || 1, e.linhas);
      var base = Math.floor(total / e.linhas), extra = total % e.linhas, rank = 1;
      e.lineRankRanges = Array.from({ length: e.linhas }, function (_, i) {
        var count = base + (i < extra ? 1 : 0), out = { from: rank, to: rank + count - 1 };
        rank += count; return out;
      });
    }
    _norm(); _rerender();
  };
  window._f2LineRange = function (index, field, value) {
    if (!S || (field !== 'from' && field !== 'to')) return;
    var e = S.cfg.eliminatoria;
    if (!Array.isArray(e.lineRankRanges)) e.lineRankRanges = [];
    if (!e.lineRankRanges[index]) e.lineRankRanges[index] = { from: 1, to: 1 };
    e.lineRankRanges[index][field] = Number(value);
    _norm(); _rerender();
  };
  window._f2BestNext = function (field, value) {
    if (!S || ['count', 'metric', 'destIndex'].indexOf(field) < 0) return;
    if (!S.cfg.eliminatoria.bestNextByGroup) S.cfg.eliminatoria.bestNextByGroup = {};
    S.cfg.eliminatoria.bestNextByGroup[field] = field === 'metric' ? value : Number(value);
    _norm(); _rerender();
  };

  // ── MODO FORM: monta os controles dentro do #fase1-box do editar/criar. ──
  // sport: modalidade; initialCfg: config existente (t.fmt2) ou null (default do esporte).
  window._f2MountInForm = function (container, sport, initialCfg, tournament) {
    sport = sport || 'Beach Tennis';
    var cfg = (initialCfg && typeof initialCfg === 'object')
      ? window.FORMAT2.normalize(initialCfg, sport,category=>window.ScoreplaceGroupAlternation?.population(tournament || {},category))
      : ((tournament && typeof window.FORMAT2.configFromTournament === 'function')
        ? window.FORMAT2.configFromTournament(tournament, sport)
        : window.FORMAT2.defaultConfig(sport));
    var last = tournament && Array.isArray(tournament.phases) ? tournament.phases[tournament.phases.length - 1] : null;
    if (cfg.classifAtiva && cfg.eliminatoria && last && last.formatCode && String(last.formatCode).indexOf('elim_') === 0) {
      if (!Array.isArray(cfg.eliminatoria.roundBounds) || !cfg.eliminatoria.roundBounds.length) cfg.eliminatoria.roundBounds = Array.isArray(last.roundBounds) ? last.roundBounds.slice() : [];
    }
    if (container && S?.mountEl===container) _stashExt();
    S = { mode: 'form', mountEl: container, sport: sport, cfg: cfg, t: tournament || null };
    _syncTeamSize();
    if (container) { container.innerHTML = _bodyControls(); _placeExt(); _mountElimRoundBounds(); _renderTieResolution(); }
  };
  // Config atual (pro save do form). null se não montado em modo form.
  window._f2GetConfig = function () { return (S && S.mode === 'form') ? window.FORMAT2.normalize(S.cfg, S.sport,category=>_sliderPopulation(category,false)) : null; };
  // ── MODO PAGE (legado): página #formato/:tId ──
  window.renderFormatoPage = function (container) {
    var tId = _tid();
    var lookup = window._findTournamentById || function () { return null; };
    var t = lookup(tId);
    var hdr = window._renderBackHeader({ href: '#tournaments/' + tId, label: 'Voltar', middleHtml: '<b>Formato do torneio</b>' });
    if (!t) { container.innerHTML = hdr + '<div style="padding:24px;text-align:center;color:var(--text-muted);">Torneio não encontrado. Abra logado, pelo app.</div>'; return; }
    var sport = t.sport || 'Beach Tennis';
    if (!S || S.mode !== 'page' || S.tId !== tId) {
      var init = (t.fmt2 && typeof t.fmt2 === 'object')
        ? window.FORMAT2.normalize(t.fmt2, sport,category=>window.ScoreplaceGroupAlternation?.population(t,category))
        : (typeof window.FORMAT2.configFromTournament === 'function'
          ? window.FORMAT2.configFromTournament(t, sport)
          : window.FORMAT2.defaultConfig(sport));
      S = { mode: 'page', tId: tId, t: t, sport: sport, cfg: init };
    } else { S.t = t; }
    container.innerHTML = hdr + '<div style="max-width:720px;margin:0 auto;padding:14px 16px 44px;">' + _bodyControls() +
      '<button type="button" onclick="window._f2ApplyPage()" style="margin-top:16px;width:100%;padding:14px;border-radius:12px;border:none;background:linear-gradient(135deg,#10b981,#059669);color:#fff;font-size:0.95rem;font-weight:700;cursor:pointer;">Aplicar formato ao torneio</button></div>';
  };
  window._f2ApplyPage = function () {
    if (!S || !S.tId || !S.cfg || typeof window._callCF !== 'function') {
      if (window.showNotification) showNotification('Não foi possível aplicar', 'Entre na sua conta e tente novamente.', 'error');
      return;
    }
    var rotationError = window._f2RotationConfigError();
    if (rotationError) { window.showNotification?.('Confira os grupos', rotationError, 'error'); return; }
    window._callCF('applyTournamentFormat', {
      tournamentId: String(S.tId),
      fmt2: S.cfg
    }, 'Entre na sua conta para aplicar o formato.').then(function (res) {
      var out = (res && res.data) || res || {};
      if (!out.ok) throw new Error('format-not-applied');
      if (window.showNotification) showNotification('Formato aplicado', out.summary || window.FORMAT2.summary(S.cfg), 'success');
      location.hash = '#tournaments/' + S.tId;
    }).catch(function (e) {
      if (window.showNotification) showNotification('Erro ao salvar', String((e && e.message) || e), 'error');
    });
  };
})();
