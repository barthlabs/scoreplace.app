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
  function _norm() { if (S) S.cfg = window.FORMAT2.normalize(S.cfg, S.sport); }
  function _syncTeamSize() {
    if (!S) return;
    var cfg = S.cfg;
    var ts = document.getElementById('tourn-team-size');
    if (ts) ts.value = window.FORMAT2.teamSizeFor(cfg.disputa); // mantém o form (estimativa/categorias) coerente
    // Toggles de FORMAÇÃO DE DUPLAS (participantes montam · times sorteados vs montados) só
    // fazem sentido com DUPLAS FIXAS — não em singles nem em parceria rotativa (Rei/Rainha /
    // sorteio-a-cada-rodada). Sincroniza a visibilidade conforme a config.
    var fixedDupla = cfg.disputa === 'dupla' && (cfg.grupos > 1 || cfg.parceria === 'fixa');
    ['manual-pairing-container', 'mixed-pairing-container'].forEach(function (id) {
      var el = document.getElementById(id); if (el) el.style.display = fixedDupla ? '' : 'none';
    });
    // Pontuação Avançada (💯 pontos individuais custom) é feature de PONTOS CORRIDOS (1 grupo).
    var adv = document.getElementById('adv-scoring-section');
    if (adv) adv.style.display = (cfg.grupos === 1) ? '' : 'none';
  }
  // As seções "Datas da fase" (#phase-dates-box) e "Inscrições durante a fase"
  // (#late-enroll-box) são DO FORM — relocadas pra dentro do box da Fase Classificatória
  // (slot #f2-classif-extra). Como o mount reescreve innerHTML a cada mudança, movo pra
  // fora (pro pai do mount) ANTES de reescrever e de volta DEPOIS — preserva valores/listeners.
  var _EXT_IDS = ['phase-dates-box', 'late-enroll-box'];
  function _stashExt() {
    var mount = document.getElementById('f2-config-mount');
    var holder = mount && mount.parentNode;
    if (!holder) return;
    _EXT_IDS.forEach(function (id) { var el = document.getElementById(id); if (el && el.parentNode !== holder) holder.appendChild(el); });
  }
  function _placeExt() {
    var slot = document.getElementById('f2-classif-extra');
    if (!slot) return;
    _EXT_IDS.forEach(function (id) { var el = document.getElementById(id); if (el) slot.appendChild(el); });
  }
  window._f2PlaceExtSections = _placeExt; // pra chamar de fora após o mount

  function _rerender() {
    if (!S) return;
    if (S.mode === 'form') {
      _syncTeamSize();
      _stashExt();
      var el = document.getElementById('f2-config-mount');
      if (el) el.innerHTML = _bodyControls();
      _placeExt();
    } else {
      var c = document.getElementById('view-container');
      if (c) window.renderFormatoPage(c);
    }
  }

  function _pill(active, onclick, label) {
    var on = 'border:2px solid #818cf8;background:rgba(99,102,241,0.22);color:#c7d2fe;';
    var off = 'border:2px solid rgba(255,255,255,0.16);background:rgba(255,255,255,0.05);color:var(--text-main);';
    return '<button type="button" onclick="' + onclick + '" style="padding:8px 14px;border-radius:10px;font-size:0.85rem;font-weight:600;cursor:pointer;white-space:nowrap;margin:0 4px 4px 0;' + (active ? on : off) + '">' + label + '</button>';
  }
  function _sec(title, inner) {
    return '<div style="margin-bottom:16px;"><div style="font-size:0.72rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:7px;">' + title + '</div>' + inner + '</div>';
  }
  function _num(val, min, max, onchange) {
    return '<input type="number" min="' + min + '" max="' + max + '" value="' + val + '" onchange="' + onchange + '" style="width:60px;text-align:center;padding:6px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:var(--bg-darker,rgba(0,0,0,0.25));color:var(--text-main);">';
  }
  // Toggle padrão do app (.toggle-switch) com rótulo à direita do controle.
  function _toggle(label, checked, onchange) {
    return '<label style="display:inline-flex;align-items:center;gap:10px;cursor:pointer;font-size:0.9rem;color:var(--text-main);">' +
      '<span class="toggle-switch"><input type="checkbox"' + (checked ? ' checked' : '') + ' onchange="' + onchange + '"><span class="toggle-slider"></span></span>' +
      '<span>' + label + '</span></label>';
  }
  // Toggle em linha cheia: rótulo à ESQUERDA, controle alinhado à DIREITA.
  function _toggleRight(label, checked, onchange) {
    return '<label style="display:flex;align-items:center;justify-content:space-between;gap:12px;cursor:pointer;font-size:0.9rem;color:var(--text-main);width:100%;">' +
      '<span>' + label + '</span>' +
      '<span class="toggle-switch"><input type="checkbox"' + (checked ? ' checked' : '') + ' onchange="' + onchange + '"><span class="toggle-slider"></span></span></label>';
  }
  // Painel "Inscrições durante a fase" DA ELIMINATÓRIA (2ª fase). Espelha visualmente o bloco do
  // form (#late-enroll-box), mas grava em cfg.eliminatoria.lateEnrollment (não em t.lateEnrollment,
  // que é da fase inicial). Mesma semântica de 2 toggles → 3 valores: closed | standby | expand.
  //   master: ligado = Fechadas (🚫) · desligado = Abertas (🔓)
  //   conf  : ligado = Novos Confrontos (➕) · desligado = Suplentes Apenas (🪑)  [só aparece quando aberta]
  function _lateEnrollElimBlock(e) {
    var T = window._t || function (k) { return k; };
    // 'inherit' (default) = a elim SEGUE a inscrição da fase inicial (#late-enrollment do form).
    // Exibe o valor herdado + aviso; tocar num toggle grava um valor EXPLÍCITO (regra própria).
    var _explicit = ['closed', 'standby', 'expand'].indexOf(e.lateEnrollment) >= 0;
    var _inh = (function () { var el = document.getElementById('late-enrollment'); var val = el && el.value; return (['closed', 'standby', 'expand'].indexOf(val) >= 0) ? val : 'expand'; })();
    var v = _explicit ? e.lateEnrollment : _inh;
    var isClosed = v === 'closed', isExpand = v === 'expand';
    var onRow = 'border:1px solid rgba(251,191,36,0.25);background:rgba(251,191,36,0.08);';
    var offRow = 'border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.03);';
    function _tg(checked, on) {
      return '<label class="toggle-switch" style="--toggle-on-bg:#fbbf24;--toggle-on-glow:rgba(251,191,36,0.3);--toggle-on-border:#fbbf24;flex-shrink:0;"><input type="checkbox"' + (checked ? ' checked' : '') + ' onchange="' + on + '"><span class="toggle-slider"></span></label>';
    }
    function _row(active, icon, title, desc, tg) {
      return '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 12px;border-radius:10px;' + (active ? onRow : offRow) + '">' +
        '<div style="display:flex;gap:8px;align-items:flex-start;min-width:0;"><span style="font-size:1rem;line-height:1.2;">' + icon + '</span>' +
        '<div style="min-width:0;"><div style="font-weight:600;color:var(--text-main);font-size:0.88rem;">' + title + '</div>' +
        '<div style="font-size:0.72rem;color:var(--text-muted);margin-top:2px;line-height:1.4;">' + desc + '</div></div></div>' + tg + '</div>';
    }
    var masterRow = _row(isClosed, isClosed ? '🚫' : '🔓',
      T(isClosed ? 'create.lateEnrollClosed' : 'create.lateEnrollOpen'),
      T(isClosed ? 'create.lateEnrollClosedOnDesc' : 'create.lateEnrollClosedOffDesc'),
      _tg(isClosed, 'window._f2ElimLateMaster(this.checked)'));
    var confRow = isClosed ? '' : ('<div style="margin-top:8px;">' + _row(isExpand, isExpand ? '➕' : '🪑',
      T(isExpand ? 'create.lateEnrollExpand' : 'create.lateEnrollSuplentesOnly'),
      T(isExpand ? 'create.lateEnrollExpandOnDesc' : 'create.lateEnrollExpandOffDesc'),
      _tg(isExpand, 'window._f2ElimLateConf(this.checked)')) + '</div>');
    var inheritHint = _explicit ? '' : ('<div style="font-size:0.72rem;color:#93c5fd;margin:0 0 8px;display:flex;align-items:flex-start;gap:5px;line-height:1.4;"><span>🔗</span><span>' + T('create.lateEnrollInheritHint') + '</span></div>');
    return '<div style="background:rgba(251,191,36,0.06);border:1px solid rgba(251,191,36,0.15);border-radius:12px;padding:1rem;margin-top:14px;">' +
      '<p style="margin:0 0 0.75rem;font-size:0.8rem;color:#fbbf24;font-weight:600;text-transform:uppercase;letter-spacing:1px;">⏱️ ' + T('create.lateEnrollSection') + '</p>' +
      inheritHint + masterRow + confRow + '</div>';
  }
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
  // Bloco de agendamento dos sorteios (modo "nº de rodadas"). Layout pedido pelo dono:
  //   Data do 1º sorteio | Hora
  //   Nº de rodadas | Repetir a cada (dias)
  //   [toggle] Sortear manualmente  (embaixo)
  // Manual é o efetivo quando não há data do 1º sorteio (auto precisa dela).
  function _schedBlock(r) {
    var inp = 'padding:8px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:var(--bg-darker,rgba(0,0,0,0.25));color:var(--text-main);box-sizing:border-box;font-size:0.85rem;';
    var canAuto = !!r.drawFirstDate;
    var manual = !!r.drawManual || !canAuto;
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
    // v4.4.29: VIA DE MÃO DUPLA — "Repetir a cada" e "Nº de rodadas" se ajustam mutuamente pela
    // janela da fase (editar um recalcula o outro). Nenhum trava o outro. Apagar o repetir o deixa
    // VAZIO (sem repetição) e NÃO volta sozinho nem mexe nas rodadas; ✕ zera. Ambos editáveis.
    // v4.4.71: ids estáveis + ✕ SEMPRE no DOM (display alternado) → _f2SchedRefresh
    // atualiza os valores derivados sem reconstruir os inputs (preserva a digitação nativa).
    var ivInput = '<span style="display:inline-flex;align-items:center;gap:6px;">' +
      '<input id="f2-sched-iv" type="number" min="1" max="60" value="' + ivVal + '" placeholder="—" onchange="window._f2SchedInterval(this.value)" style="' + inp + 'width:90px;text-align:center;">' +
      // v1.2.38: usa o ✕ CANÔNICO (.cancel-x-btn — círculo vermelho, borda branca, X branco).
      // Era um "✕ solto colorido", que o cânone proíbe explicitamente (components.css:555).
      '<button type="button" id="f2-sched-ivx" class="cancel-x-btn" title="Sem repetição" onclick="window._f2SchedInterval(\'\')" style="--cx-size:20px;' + (ivVal ? '' : 'display:none;') + '">✕</button>' +
    '</span>';
    var row2 = '<div style="display:flex;flex-wrap:wrap;gap:14px;align-items:flex-end;">' +
      fld('Repetir a cada (dias)', ivInput) +
      fld('Nº de rodadas', '<input id="f2-sched-n" type="number" min="1" max="30" value="' + (r.n || '') + '" placeholder="—" onchange="window._f2Rn(this.value)" style="' + inp + 'width:90px;text-align:center;">') +
    '</div>';
    var tgl = '<div style="margin-top:14px;">' + _toggleRight('Sortear manualmente', manual, 'window._f2SchedManual(this.checked)') + '</div>';
    var note = '<div id="f2-sched-note" style="font-size:0.72rem;color:var(--text-muted);margin-top:8px;">' + _f2SchedNote(r) + '</div>';
    return '<div style="margin-top:14px;padding:12px 13px;border-radius:10px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.1);">' +
      '<div style="font-size:0.72rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:12px;">Agendamento dos sorteios</div>' +
      row1 + row2 + tgl + note + '</div>';
  }

  // Conta PESSOAS inscritas (dupla-entry = 2; senão 1). project_count_people_not_entries.
  function _peopleCount(t) {
    var ps = (t && t.participants) || [];
    var n = 0;
    ps.forEach(function (p) {
      if (!p) return;
      if (p.p2Name || (Array.isArray(p.participants) && p.participants.length > 1)) n += 2;
      else n += 1;
    });
    return n;
  }
  // Divisão em grupos a partir dos inscritos + slider.
  function _groupInfo(cfg) {
    var t = S && S.t;
    var people = _peopleCount(t);
    var isDupla = cfg.disputa === 'dupla';
    var units = isDupla ? Math.floor(people / 2) : people;
    var ng = units > 0 ? Math.min(cfg.grupos, units) : cfg.grupos;
    var base = units > 0 ? Math.floor(units / ng) : 0, rem = units > 0 ? units % ng : 0;
    var small = base, big = base + (rem > 0 ? 1 : 0);
    var perU = units > 0 ? (small + (rem ? '–' + big : '')) : '—';
    var perP = units > 0 ? (isDupla ? (small * 2 + (rem ? '–' + big * 2 : '')) : perU) : '—';
    return { t: t, people: people, isDupla: isDupla, units: units, ng: ng, base: base, rem: rem, perU: perU, perP: perP };
  }
  // Linha de estimativa (inscritos + tempo de jogos).
  function _estimateLine(cfg) {
    var gi = _groupInfo(cfg);
    if (!gi.people) return '<div style="margin-top:8px;font-size:0.72rem;color:var(--text-muted);">Sem inscritos ainda — a divisão dos grupos e o tempo aparecem quando houver gente inscrita.</div>';
    var groupGames = 0;
    for (var g = 0; g < gi.ng; g++) { var u = gi.base + (g < gi.rem ? 1 : 0); groupGames += u * (u - 1) / 2; }
    var elimGames = 0;
    if (cfg.eliminatoria.ativa) {
      var q = (cfg.grupos > 1) ? cfg.grupos * cfg.classificados : cfg.classificados;
      q = Math.min(q, gi.units);
      if (q >= 2) elimGames = (q - 1) + (cfg.eliminatoria.terceiro ? 1 : 0);
    }
    var gd = parseInt((document.getElementById('tourn-game-duration') || {}).value, 10) || (gi.t && gi.t.gameDuration) || 30;
    var cc = parseInt((document.getElementById('tourn-court-count') || {}).value, 10) || (gi.t && gi.t.courtCount) || 1;
    var totalGames = Math.round(groupGames + elimGames);
    var mins = Math.ceil(totalGames * gd / Math.max(1, cc));
    var hh = Math.floor(mins / 60), mm = mins % 60;
    var timeStr = hh > 0 ? (hh + 'h' + (mm ? ' ' + mm + 'min' : '')) : (mm + 'min');
    return '<div style="margin-top:8px;font-size:0.78rem;color:#a5b4fc;background:rgba(99,102,241,0.08);border-radius:8px;padding:9px 11px;line-height:1.5;">' +
      '👥 <b>' + gi.people + '</b> inscritos' + (gi.isDupla ? (' → <b>' + gi.units + '</b> duplas') : '') +
      ' · ⏱️ ~<b>' + timeStr + '</b> de jogos <span style="opacity:0.8;">(' + totalGames + ' jogos · ' + gd + 'min · ' + cc + ' quadra' + (cc > 1 ? 's' : '') + ')</span></div>';
  }
  // Resumo da eliminatória (abaixo do slider de classificados): pessoas/equipes, jogos, tempo.
  function _elimSummary(cfg) {
    if (!cfg.eliminatoria || !cfg.eliminatoria.ativa) return '';
    var gi = _groupInfo(cfg);
    var isDupla = cfg.disputa === 'dupla';
    var perGroupScope = cfg.grupos > 1 && cfg.classifScope !== 'overall';
    // v4.4.40: "Todos" → o total é o nº REAL de inscritos (não o classificados). Sem inscritos,
    // não dá pra saber quantos "todos" são → mensagem em vez de número fixo.
    if (cfg.eliminatoria.qualifyAll) {
      if (gi.units <= 0) {
        return '<div style="margin-top:8px;font-size:0.78rem;color:#fde68a;background:rgba(251,191,36,0.09);border:1px solid rgba(251,191,36,0.18);border-radius:8px;padding:9px 11px;line-height:1.5;">👥 <b>Todos</b> os inscritos entram na eliminatória — o total (duplas · jogos · tempo) aparece quando houver gente inscrita.</div>';
      }
    }
    var q = cfg.eliminatoria.qualifyAll ? gi.units : (perGroupScope ? cfg.grupos * cfg.classificados : cfg.classificados);
    if (gi.units > 0) q = Math.min(q, gi.units);
    var teams = Math.max(0, q);
    var people = teams * (isDupla ? 2 : 1);
    var games = (teams >= 2) ? (teams - 1) + (cfg.eliminatoria.terceiro ? 1 : 0) : 0;
    var gd = parseInt((document.getElementById('tourn-game-duration') || {}).value, 10) || (gi.t && gi.t.gameDuration) || 30;
    var cc = parseInt((document.getElementById('tourn-court-count') || {}).value, 10) || (gi.t && gi.t.courtCount) || 1;
    var mins = Math.ceil(games * gd / Math.max(1, cc));
    var hh = Math.floor(mins / 60), mm = mins % 60;
    var timeStr = hh > 0 ? (hh + 'h' + (mm ? ' ' + mm + 'min' : '')) : (mm + 'min');
    var who = isDupla
      ? ('👥 <b>' + people + '</b> ' + (people === 1 ? 'pessoa' : 'pessoas') + ' → <b>' + teams + '</b> ' + (teams === 1 ? 'dupla' : 'duplas'))
      : ('👥 <b>' + teams + '</b> ' + (teams === 1 ? 'jogador' : 'jogadores'));
    return '<div style="margin-top:8px;font-size:0.78rem;color:#fde68a;background:rgba(251,191,36,0.09);border:1px solid rgba(251,191,36,0.18);border-radius:8px;padding:9px 11px;line-height:1.5;">' +
      who + ' na eliminatória · 🎯 <b>' + games + '</b> ' + (games === 1 ? 'jogo' : 'jogos') +
      (games > 0 ? ' · ⏱️ ~<b>' + timeStr + '</b>' : '') + '</div>';
  }
  // Apresentação abaixo do slider: rótulo (1 grupo) OU números grandes (N grupos).
  function _estruturaBlock(cfg) {
    if (cfg.grupos === 1) {
      return '<div style="font-size:0.78rem;color:var(--text-muted);margin-top:6px;">1 grupo — <b>Pontos Corridos</b> (tabela única, classificação geral)</div>' + _estimateLine(cfg);
    }
    var gi = _groupInfo(cfg);
    var col = function (n, lbl) { return '<div style="text-align:center;min-width:62px;"><div style="font-size:1.7rem;font-weight:800;color:#c7d2fe;line-height:1;">' + n + '</div><div style="font-size:0.66rem;color:var(--text-muted);margin-top:3px;">' + lbl + '</div></div>'; };
    var dot = '<div style="font-size:1.1rem;color:var(--text-muted);align-self:center;opacity:0.6;">·</div>';
    var nums = '<div style="display:flex;gap:10px;justify-content:center;align-items:flex-start;margin:12px 0 4px;">' +
      col(cfg.grupos, 'grupos') + dot + col(gi.perP, gi.isDupla ? 'pessoas/grupo' : 'por grupo') +
      (gi.isDupla ? (dot + col(gi.perU, 'duplas/grupo')) : '') + '</div>' +
      '<div style="text-align:center;font-size:0.74rem;color:var(--text-muted);"><b>Fase de Grupos</b> — classificação por grupo</div>';
    return nums + _estimateLine(cfg);
  }

  // Bloco de fase (Classificatória / Eliminatória) com cabeçalho destacado.
  function _phaseBlock(title, color, inner, headerRight) {
    var pill = '<span style="display:inline-block;font-size:1.05rem;font-weight:800;letter-spacing:0.4px;text-transform:uppercase;color:' + color + ';background:' + color + '22;padding:9px 17px;border-radius:10px;">' + title + '</span>';
    var header = headerRight
      ? '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;">' + pill + headerRight + '</div>'
      : '<div style="margin-bottom:16px;">' + pill + '</div>';
    return '<div style="border:1px solid ' + color + '55;border-radius:14px;padding:14px 14px 8px;margin-bottom:16px;background:' + color + '0d;">' +
      header + inner + '</div>';
  }

  // ── Controles do configurador (compartilhados form+page) ──
  function _bodyControls() {
    var cfg = S.cfg, sport = S.sport;
    var allowsS = window.FORMAT2.allowsSingles(sport);
    var isDupla = cfg.disputa === 'dupla';
    var um = cfg.grupos === 1;
    var rotativo = isDupla && (cfg.parceria === 'rei_rainha' || cfg.parceria === 'sorteio_rodada');
    var scoreInd = cfg._scoreBy === 'individual';
    var classif = '';
    // v4.5.49: o AGENDAMENTO (Rodadas: repetição + nº de rodadas) e as DATAS/Inscrições da fase
    // (#f2-classif-extra) vão num acumulador SEPARADO — ficam SEMPRE editáveis, mesmo com a fase
    // classificatória já sorteada (o organizador ajusta a temporada: repetição, nº de rodadas e
    // término da fase durante a fase). Só a ESTRUTURA (formato/grupos/formação) é travada.
    var classifSchedule = '';

    // v4.4.51: editando torneio cuja fase classificatória JÁ FOI SORTEADA → trava a config
    // DELA (cinza, sem cliques). A eliminatória segue editável até avançar de fase. Em criação
    // (S.t null) e antes do sorteio → tudo livre. "Sorteada" = há jogos da fase 0 (t.matches
    // taggeado phaseIndex 0) OU rodadas nativas (t.rounds, Liga/Suíço classificatória).
    var _p0Drawn = !!(S && S.t && (
      (Array.isArray(S.t.matches) && S.t.matches.some(function (m) { return (m.phaseIndex || 0) === 0; })) ||
      (Array.isArray(S.t.rounds) && S.t.rounds.length > 0)
    ));
    var _classifLocked = _p0Drawn && cfg.classifAtiva;
    // v4.4.52: a eliminatória trava assim que a fase AVANÇA (é gerada) — depois disso a config
    // dela não muda mais. Com classificatória, a elim é fase posterior → travada quando
    // currentPhaseIndex>=1 (avançou) ou há jogos taggeados phaseIndex>=1. Sem classificatória
    // (eliminação direta), a elim É a fase 0 → trava quando a fase 0 é sorteada (_p0Drawn).
    var _elimAdvanced = !!(S && S.t && (
      (Array.isArray(S.t.matches) && S.t.matches.some(function (m) { return (m.phaseIndex || 0) >= 1; })) ||
      ((S.t.currentPhaseIndex || 0) >= 1)
    ));
    var _elimLocked = (cfg.classifAtiva ? _elimAdvanced : _p0Drawn) && cfg.eliminatoria.ativa;

    // Disputa só aparece onde o esporte permite singles (tênis/tênis de mesa). Nos demais
    // (sempre duplas) não faz sentido mostrar nada — é óbvio.
    if (allowsS) {
      classif += _sec('Disputa', _pill(cfg.disputa === 'individual', 'window._f2Disputa(\'individual\')', '👤 Individual') + _pill(isDupla, 'window._f2Disputa(\'dupla\')', '👥 Duplas'));
    }

    classif += _sec('Estrutura — nº de grupos',
      '<div style="display:flex;align-items:center;gap:12px;">' +
      '<input type="range" min="1" max="16" value="' + cfg.grupos + '" oninput="window._f2GruposLive(this.value)" onchange="window._f2Grupos(this.value)" style="flex:1;accent-color:#818cf8;">' +
      '<span id="f2-grupos-val" style="min-width:30px;text-align:center;font-weight:800;font-size:1.15rem;color:#c7d2fe;">' + cfg.grupos + '</span></div>' +
      '<div id="f2-estrutura-block">' + _estruturaBlock(cfg) + '</div>');

    // (A FORMAÇÃO das duplas — participantes montam × organizador, + times sorteados vs
    //  montados — fica nos toggles detalhados da seção "Formação de Duplas" abaixo do form.)
    if (isDupla) {
      var pr = cfg.parceria;
      // v4.4.19: "Formação das equipes" — como as duplas se formam. Montadas (organizador/
      // jogadores montam) × Sorteio (sorteadas), ambas FIXAS. Rei/Rainha (rotativo) só com 1 grupo.
      var montadas = pr === 'fixa' && cfg.formacaoDupla === 'manual';
      // "Sorteio" cobre por-rodada (sorteio_rodada) E dupla fixa sorteada (fixa+sorteio).
      var isSorteio = (pr === 'sorteio_rodada') || (pr === 'fixa' && cfg.formacaoDupla !== 'manual');
      var fBtns = _pill(montadas, 'window._f2TeamForm(\'montadas\')', '🤝 Montadas') +
        _pill(isSorteio, 'window._f2TeamForm(\'sorteio\')', '🎲 Sorteio');
      if (um) fBtns += _pill(pr === 'rei_rainha', 'window._f2TeamForm(\'rei_rainha\')', '👑 Rei/Rainha');
      // v4.4.30: Sorteio + 1 grupo → toggle "Novo parceiro a cada rodada" (ON por padrão).
      // ON = sorteio_rodada (rotativo, individual); OFF = dupla sorteada 1× e fixa até o fim.
      // 2+ grupos: só dupla fixa sorteada (rotativo exige 1 grupo) → sem toggle.
      if (isSorteio && um) {
        var porRodada = pr === 'sorteio_rodada';
        fBtns += '<div style="margin-top:12px;">' + _toggleRight('Novo parceiro a cada rodada', porRodada, 'window._f2SorteioPorRodada(this.checked)') + '</div>' +
          '<div style="font-size:0.72rem;color:var(--text-muted);margin-top:6px;">' + (porRodada
            ? 'A cada rodada, parceiro (e adversário) são sorteados de novo — pontuação individual.'
            : 'A dupla é sorteada 1× e permanece fixa até o fim do torneio.') + '</div>';
      }
      classif += _sec('Formação das equipes', fBtns);
    }

    var rModo = cfg.rodadas.modo;
    var rInner;
    if (rotativo) {
      // Rei/Rainha (ou sorteio a cada rodada): SEMPRE nº de rodadas + agendamento (rotativo por
      // rodada). "Todos contra todos" não se aplica — mas o Nº de rodadas FICA (pedido do dono).
      rInner = '<div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:2px;">Sorteio a cada rodada — ' +
        (cfg.parceria === 'rei_rainha' ? 'grupos de 4, parceiros rotativos' : 'parceiro e adversário sorteados') +
        '; pontuação individual.</div>' + _schedBlock(cfg.rodadas);
    } else if (um) {
      // Pontos corridos: Nº de rodadas (PADRÃO, primeiro) × Todos contra todos.
      rInner = _pill(rModo === 'fixo', 'window._f2Modo(\'fixo\')', '🔢 Nº de rodadas') +
               _pill(rModo === 'todos', 'window._f2Modo(\'todos\')', '🔄 Todos contra todos');
      if (rModo === 'todos') {
        rInner += '<div style="margin-top:12px;">' + _toggleRight('Ida e volta', cfg.rodadas.turnos === 'ida_volta', 'window._f2Turnos(this.checked ? \'ida_volta\' : \'ida\')') + '</div>' +
          '<div style="font-size:0.72rem;color:var(--text-muted);margin-top:6px;">Cada ' + (isDupla ? 'dupla' : 'jogador') + ' enfrenta todos os outros' + (cfg.rodadas.turnos === 'ida_volta' ? ' — ida e volta (mando invertido)' : '') + '.</div>';
      } else {
        rInner += _schedBlock(cfg.rodadas);
      }
    } else {
      // Fase de grupos (2+): round-robin dentro do grupo, com toggle ida/volta.
      rInner = _toggleRight('Ida e volta', cfg.rodadas.turnos === 'ida_volta', 'window._f2Turnos(this.checked ? \'ida_volta\' : \'ida\')') +
        '<div style="font-size:0.72rem;color:var(--text-muted);margin-top:6px;">Dentro de cada grupo, todos contra todos' + (cfg.rodadas.turnos === 'ida_volta' ? ' — ida e volta' : '') + '.</div>';
    }
    classifSchedule += _sec('Rodadas', rInner);

    var e = cfg.eliminatoria;
    // Toggle da eliminatória (habilitado, MENOS quando a fase já avançou → travado). Desligar →
    // torneio termina na classificatória. Sem classificatória, desligar religa a classif.
    var elimToggle = '<label class="toggle-switch" style="cursor:' + (_elimLocked ? 'not-allowed' : 'pointer') + ';' + (_elimLocked ? 'opacity:0.5;' : '') + '">' +
      '<input type="checkbox"' + (e.ativa ? ' checked' : '') + (_elimLocked ? ' disabled' : '') + ' onchange="window._f2Elim(this.checked)">' +
      '<span class="toggle-slider"></span></label>';
    var eb = '';
    if (e.ativa) {
      if (!cfg.classifAtiva) {
        // v4.4.33: ELIMINAÇÃO DIRETA (sem classificatória) — todos os inscritos entram no bracket
        // por sorteio. A disputa e a formação das duplas moram AQUI (o início da eliminatória).
        eb += '<div style="font-size:0.74rem;color:#fbbf24;background:rgba(251,191,36,0.08);border-radius:8px;padding:8px 10px;margin-bottom:12px;">Sem fase classificatória — todos os inscritos entram direto na eliminatória.</div>';
        if (allowsS) {
          eb += '<div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:6px;">Disputa</div>' +
            _pill(cfg.disputa === 'individual', 'window._f2Disputa(\'individual\')', '👤 Individual') +
            _pill(isDupla, 'window._f2Disputa(\'dupla\')', '👥 Duplas') + '<div style="height:12px;"></div>';
        }
        if (isDupla) {
          // v4.5.51: nova alternativa — ABRIR COM REI/RAINHA. Quando ON, as duplas NÃO são "já
          // formadas" nem "sorteadas": elas emergem de uma rodada Rei/Rainha (grupos de 4). Some
          // o par Já formadas/Sorteadas e aparecem o CORTE por grupo + a ESTRATÉGIA do pareamento.
          var _openRR = !!cfg.eliminatoria.openReiRainha;
          eb += _toggleRight('Abrir com rodada Rei/Rainha', _openRR, 'window._f2ElimOpenRR(this.checked)') +
            '<div style="font-size:0.72rem;color:var(--text-muted);margin:6px 0 12px;line-height:1.45;">' + (_openRR
              ? 'A eliminatória começa por <b>uma rodada Rei/Rainha</b>: grupos de 4 sorteados, e as <b>duplas se formam dentro de cada grupo</b> pelo resultado.'
              : 'Ative para a eliminatória <b>começar por uma rodada Rei/Rainha</b> (grupos de 4 que formam as duplas).') + '</div>';
          if (_openRR) {
            var _cut = cfg.eliminatoria.reiRainhaCut === 2 ? 2 : 4;
            eb += '<div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:6px;">Quantos de cada grupo de 4 avançam</div>' +
              _pill(_cut === 4, 'window._f2ElimRRCut(4)', '4 · todos (2 duplas)') +
              _pill(_cut === 2, 'window._f2ElimRRCut(2)', '2 · os melhores (1 dupla)') + '<div style="height:12px;"></div>';
            var _fxRR = (cfg.eliminatoria.formacao === 'equilibrio') ? 'equilibrio' : 'performance';
            eb += '<div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:5px;">Como formar as duplas no grupo</div>' +
              _pill(_fxRR === 'performance', 'window._f2Formacao(\'performance\')', '📈 Performance') +
              _pill(_fxRR === 'equilibrio', 'window._f2Formacao(\'equilibrio\')', '⚖️ Equilíbrio') +
              '<div style="font-size:0.72rem;color:var(--text-muted);margin:6px 0 12px;line-height:1.45;">' + (_fxRR === 'performance'
                ? 'Performance: os melhores do grupo jogam juntos (1º+2º, depois 3º+4º).'
                : 'Equilíbrio: forte com fraco (1º+4º, 2º+3º) — duplas mais parelhas.') + '</div>';
          } else {
            eb += '<div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:6px;">Duplas na eliminatória</div>' +
              _pill(cfg.formacaoDupla === 'manual', 'window._f2Form(\'manual\')', '🤝 Já formadas') +
              _pill(cfg.formacaoDupla !== 'manual', 'window._f2Form(\'sorteio\')', '🎲 Sorteadas') + '<div style="height:10px;"></div>';
            if (cfg.formacaoDupla === 'manual') {
              // Já formadas: quem forma as duplas? Toggle ON = participantes podem (arrastar/soltar);
              // OFF (padrão) = só o organizador. → t.manualPairing ('open' | 'organizer_only').
              eb += _toggleRight('Participantes podem formar suas duplas', !!cfg.manualPairingOpen, 'window._f2ElimManualPairing(this.checked)') +
                '<div style="font-size:0.72rem;color:var(--text-muted);margin-top:6px;">' + (cfg.manualPairingOpen
                  ? 'Os participantes podem formar suas próprias duplas (arrastar e soltar). O organizador também pode.'
                  : 'Apenas o organizador forma as duplas.') + '</div><div style="height:12px;"></div>';
            } else {
              // Sorteadas: as duplas da R1 saem no sorteio, seguindo livre/equilibrado entre gêneros.
              eb += '<div style="font-size:0.72rem;color:var(--text-muted);margin-top:-2px;">As duplas da 1ª rodada são <b>sorteadas</b> no momento do sorteio, seguindo a opção <b>livre</b> ou <b>equilibrado entre gêneros</b>.</div><div style="height:12px;"></div>';
            }
          }
        }
      } else {
        // COM classificatória: escopo (2+ grupos) + Nº de classificados + resumo.
        var perGroupScope = cfg.grupos > 1 && cfg.classifScope !== 'overall';
        if (cfg.grupos > 1) {
          eb += '<div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:6px;">Classificação dos participantes</div>' +
            _pill(perGroupScope, 'window._f2ClassScope(\'per_group\')', '🗂️ Por grupos') +
            _pill(!perGroupScope, 'window._f2ClassScope(\'overall\')', '📊 Geral') +
            '<div style="font-size:0.72rem;color:var(--text-muted);margin:6px 0 12px;">' + (perGroupScope
              ? 'Os melhores de CADA grupo avançam para a eliminatória.'
              : 'Uma classificação GERAL une todos os grupos; os melhores no geral avançam.') + '</div>';
        }
        // v4.4.36: Quantos avançam — TODOS × Os melhores (com slider). Todos = todos os
        // participantes da classificatória entram no bracket (semeados pela classificação).
        var qAll = !!e.qualifyAll;
        eb += '<div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:6px;">Quem avança para a eliminatória</div>' +
          _pill(!qAll, 'window._f2QualifyAll(false)', '🏅 Os melhores') +
          _pill(qAll, 'window._f2QualifyAll(true)', '👥 Todos') + '<div style="height:10px;"></div>';
        if (!qAll) {
          var classLabel = perGroupScope ? 'Nº de classificados por grupo' : 'Nº de classificados (total) para a eliminatória';
          // v4.4.41: o slider (geral) vai ATÉ o nº de unidades inscritas (duplas/jogadores);
          // chegar no total vira "Todos". Sem inscritos, cap generoso (64) pra passar de 32.
          var _units = _groupInfo(cfg).units;
          var classMax = perGroupScope ? 8 : (_units > 1 ? _units : 64);
          if (cfg.classificados > classMax) classMax = cfg.classificados; // nunca corta valor salvo
          eb += '<div style="font-size:0.82rem;color:var(--text-muted);margin-bottom:8px;">' + classLabel + '</div>' +
            '<div style="display:flex;align-items:center;gap:12px;margin-bottom:6px;">' +
            '<input type="range" min="1" max="' + classMax + '" value="' + cfg.classificados + '" oninput="window._f2ClassLive(this.value)" onchange="window._f2Class(this.value)" style="flex:1;accent-color:#fbbf24;">' +
            '<span id="f2-class-val" style="min-width:30px;text-align:center;font-weight:800;font-size:1.15rem;color:#fde68a;">' + cfg.classificados + '</span></div>';
        } else {
          eb += '<div style="font-size:0.74rem;color:#fde68a;margin-bottom:6px;">Todos os participantes da classificatória entram no bracket, semeados pela classificação.</div>';
        }
        // v4.4.41: resumo LOGO ABAIXO do slider (pedido do dono).
        eb += '<div id="f2-elim-summary">' + _elimSummary(cfg) + '</div>';
        // v4.4.x: ESTRATÉGIA da eliminatória — UM conceito geral (pedido do dono). Vale pra
        // TODO torneio (individual E duplas). NÃO são duas escolhas (formar duplas × confrontos):
        // é UMA só. Performance = beneficiar os melhores (duplas fortes juntas + cabeças de chave
        // protegidas). Equilíbrio = jogos disputados (duplas equilibradas + confrontos parelhos).
        // A Dupla Eliminatória tem semeadura própria (repescagem) → sem escolha de confronto, mas
        // a formação das duplas (quando aplicável) ainda usa a estratégia.
        var _forma = isDupla && e.origem === 'formar';       // há duplas a FORMAR dos indivíduos
        var _hP = _forma
          ? 'Beneficia os melhores: duplas fortes juntas (1º+2º, 3º+4º…) e cabeças de chave protegidas — os melhores só se cruzam no fim.'
          : 'Beneficia os melhores: cabeças de chave protegidas — o 1º pega o último, o 2º o penúltimo… os melhores só se cruzam no fim.';
        var _hE = _forma
          ? 'Jogos mais disputados: duplas equilibradas (1º+4º, 2º+3º…) e confrontos parelhos (1º×2º, 3º×4º…) desde a 1ª rodada.'
          : 'Jogos mais disputados: confrontos parelhos (1º×2º, 3º×4º…) desde a 1ª rodada — sem proteger os melhores.';
        var _hints = { performance: _hP, equilibrio: _hE, sorteio: 'Duplas e confrontos definidos por sorteio, sem usar a classificação.' };
        var _fx = (e.formacao === 'sorteio' && !_forma) ? 'performance' : e.formacao; // sorteio só quando forma duplas
        eb += '<div style="margin-top:14px;font-size:0.72rem;color:var(--text-muted);margin-bottom:5px;">Estratégia da eliminatória</div>' +
          '<div>' + _pill(_fx === 'performance', 'window._f2Formacao(\'performance\')', '📈 Performance') +
          _pill(_fx === 'equilibrio', 'window._f2Formacao(\'equilibrio\')', '⚖️ Equilíbrio') +
          (_forma ? _pill(_fx === 'sorteio', 'window._f2Formacao(\'sorteio\')', '🎲 Sorteio') : '') + '</div>' +
          '<div style="font-size:0.72rem;color:var(--text-muted);margin-top:6px;line-height:1.45;">' + (_hints[_fx] || _hints.performance) + '</div>';
      }
      // v4.4.58: Dupla Eliminatória (repescagem) — toggle + explicação de como funciona.
      // Quando ON é UMA chave só (força 1 linha no normalize) → o controle de Linhas some.
      eb += '<div style="margin-top:14px;">' + _toggleRight('Dupla Eliminatória', !!e.dupla, 'window._f2ElimDupla(this.checked)') + '</div>' +
        '<div style="font-size:0.72rem;color:var(--text-muted);margin-top:6px;line-height:1.45;">' + (e.dupla
          ? 'Cada ' + (isDupla ? 'dupla' : 'jogador') + ' só é ' + (isDupla ? 'eliminada' : 'eliminado') + ' após <b>2 derrotas</b>: quem perde na <b>chave de cima</b> cai na <b>chave de baixo</b> (ainda no torneio) e as duas se encontram na <b>grande final</b>.'
          : 'Eliminação simples — uma derrota e está fora. Ative para <b>Dupla Eliminatória</b>: só sai com 2 derrotas (quem perde na chave de cima cai na de baixo).') + '</div>';
      // Linhas (chaves paralelas): só na eliminatória SIMPLES — a dupla-elim é chave única.
      if (!e.dupla) {
        eb += '<div style="margin-top:12px;font-size:0.72rem;color:var(--text-muted);margin-bottom:5px;">Chaves paralelas (nomes livres)</div>';
        eb += [1, 2, 4].map(function (n) { return _pill(e.linhas === n, 'window._f2Linhas(' + n + ')', String(n)); }).join('');
        for (var i = 0; i < e.linhas; i++) {
          // v1.2.40: PADRÃO do formulário = class="form-control" (padding .75rem 1rem,
          // font-size 1rem) — igual aos campos de Início/Término da fase. Antes era estilo
          // à mão (padding 7px 10px, SEM font-size → herdava menor): campo mais baixo e
          // fonte menor que o resto do form.
          eb += '<div style="margin-top:8px;"><input type="text" class="form-control" value="' + _safe(e.nomes[i] || '') + '" placeholder="Nome da chave ' + (i + 1) + ' (opcional)" oninput="window._f2LineName(' + i + ',this.value)" style="max-width:300px;box-sizing:border-box;"></div>';
        }
        // v4.4.73: Grande Final — só na SIMPLES com 2/4 linhas (na dupla-elim é sempre,
        // não tem toggle). ON = campeões das linhas se cruzam numa grande final (após a
        // 1ª linha). OFF = linhas independentes, cada uma com seu campeão.
        if (e.linhas > 1) {
          eb += '<div style="margin-top:14px;">' + _toggleRight('Grande Final', e.grandFinal !== false, 'window._f2GrandFinal(this.checked)') + '</div>' +
            '<div style="font-size:0.72rem;color:var(--text-muted);margin-top:6px;line-height:1.45;">' + (e.grandFinal !== false
              ? 'Os campeões das chaves se cruzam numa <b>grande final</b> (com grandes semifinais), renderizada logo após a 1ª chave. Desative para deixar as chaves <b>independentes</b> — cada uma com seu próprio campeão.'
              : 'Chaves <b>independentes</b> — cada chave tem seu próprio campeão, sem grande final unindo-as. Ative para cruzá-las numa grande final.') + '</div>';
        }
      }
      // "Inscrições durante a fase": cada fase tem a SUA. Sem classificatória, a eliminatória é a
      // fase inicial (onde há inscrição) e carrega o bloco do FORM (via slot #f2-classif-extra →
      // t.lateEnrollment). Com classificatória, ELA é a inicial (tem o bloco do form via slot);
      // a eliminatória é 2ª fase e ganha o SEU próprio painel (cfg.eliminatoria.lateEnrollment),
      // que só passa a valer quando o torneio avança de fase.
      if (!cfg.classifAtiva) eb += '<div id="f2-classif-extra" style="margin-top:12px;"></div>';
      else eb += _lateEnrollElimBlock(e);
    }
    var elimInner = e.ativa ? eb : '';
    // v4.4.52: fase avançou → config da eliminatória travada (cinza, sem cliques). Nota muda
    // conforme haja classificatória (avançou de fase) ou seja eliminação direta (já sorteada).
    if (_elimLocked) {
      var _elimNote = cfg.classifAtiva
        ? '🔒 <b>Fase eliminatória em andamento</b> — o torneio já avançou de fase; a configuração não pode mais ser alterada.'
        : '🔒 <b>Eliminatória já sorteada</b> — a configuração não pode mais ser alterada.';
      elimInner = '<div style="font-size:0.76rem;color:#fde68a;background:rgba(251,191,36,0.1);border:1px solid rgba(251,191,36,0.35);border-radius:9px;padding:9px 11px;margin-bottom:12px;line-height:1.45;">' + _elimNote + '</div>' +
        '<div style="pointer-events:none;opacity:0.5;filter:grayscale(0.4);" aria-disabled="true">' + eb + '</div>';
    }

    // Slot (Datas + Inscrições) dentro da CLASSIFICATÓRIA quando ela está ativa.
    if (cfg.classifAtiva) classifSchedule += '<div id="f2-classif-extra" style="margin-top:4px;"></div>';

    // Toggle da classificatória (sempre habilitado, MENOS quando já sorteada → travado).
    // Desligar → eliminação direta.
    var classifToggle = '<label class="toggle-switch" style="cursor:' + (_classifLocked ? 'not-allowed' : 'pointer') + ';' + (_classifLocked ? 'opacity:0.5;' : '') + '">' +
      '<input type="checkbox"' + (cfg.classifAtiva ? ' checked' : '') + (_classifLocked ? ' disabled' : '') + ' onchange="window._f2ClassifAtiva(this.checked)">' +
      '<span class="toggle-slider"></span></label>';
    var classifInner = cfg.classifAtiva ? (classif + classifSchedule) : '';
    // v4.4.51/v4.5.49: fase classificatória já sorteada → só a ESTRUTURA (formato/grupos/formação)
    // fica cinza e sem interação. O AGENDAMENTO (repetição, nº de rodadas) e as DATAS/Inscrições
    // (#f2-classif-extra, dentro de classifSchedule) ficam FORA do wrapper → SEMPRE editáveis, pra
    // o organizador ajustar a temporada durante a fase (reduzir/estender rodadas, mudar o término).
    if (_classifLocked) {
      classifInner = '<div style="font-size:0.76rem;color:#c7d2fe;background:rgba(129,140,248,0.12);border:1px solid rgba(129,140,248,0.35);border-radius:9px;padding:9px 11px;margin-bottom:12px;line-height:1.45;">🔒 <b>Estrutura travada</b> — formato, grupos e formação não mudam mais (fase já sorteada). Você ainda pode ajustar o <b>agendamento</b> (repetição, nº de rodadas, término da fase) e a <b>fase eliminatória</b>.</div>' +
        '<div style="pointer-events:none;opacity:0.5;filter:grayscale(0.4);" aria-disabled="true">' + classif + '</div>' +
        classifSchedule;
    }

    // v4.4.52: cadeado 🔒 ENTRE o título e o toggle quando a fase está travada.
    function _hdrRight(locked, toggle) {
      var lk = locked ? '<span title="Fase travada — configuração não pode mais mudar" style="font-size:1.2rem;line-height:1;">🔒</span>' : '';
      return '<span style="display:inline-flex;align-items:center;gap:12px;">' + lk + toggle + '</span>';
    }
    var h = _phaseBlock('🎯 Fase Classificatória', '#818cf8', classifInner, _hdrRight(_classifLocked, classifToggle)) +
      _phaseBlock('🏆 Fase Eliminatória', '#fbbf24', elimInner, _hdrRight(_elimLocked, elimToggle));
    return h;
  }

  // ── Handlers globais (form + page) ──
  window._f2Disputa = function (v) { S.cfg.disputa = v; _norm(); _rerender(); };
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
  window._f2Parceria = function (v) { S.cfg.parceria = v; _norm(); _rerender(); };
  window._f2Form = function (v) { S.cfg.formacaoDupla = v; _norm(); _rerender(); };
  window._f2ElimManualPairing = function (checked) { S.cfg.manualPairingOpen = !!checked; _norm(); _rerender(); };
  // v4.4.19: "Formação das equipes" — 1 controle: Montadas (fixa+manual) / Sorteio
  // (fixa+sorteio) / Rei/Rainha (rotativo, só 1 grupo).
  window._f2TeamForm = function (v) {
    if (!S) return;
    if (v === 'montadas') { S.cfg.parceria = 'fixa'; S.cfg.formacaoDupla = 'manual'; }
    else if (v === 'sorteio') {
      // v4.4.30: Sorteio defaulta pra "por rodada" (só com 1 grupo); 2+ grupos = dupla fixa sorteada.
      if (S.cfg.grupos === 1) { S.cfg.parceria = 'sorteio_rodada'; }
      else { S.cfg.parceria = 'fixa'; S.cfg.formacaoDupla = 'sorteio'; }
    }
    else if (v === 'rei_rainha') { S.cfg.parceria = 'rei_rainha'; }
    _norm(); _rerender();
  };
  // v4.4.30: toggle "Novo parceiro a cada rodada" dentro do Sorteio. ON = sorteio_rodada
  // (rotativo); OFF = dupla sorteada 1× e fixa (fixa+sorteio).
  window._f2SorteioPorRodada = function (checked) {
    if (!S) return;
    if (checked) { S.cfg.parceria = 'sorteio_rodada'; }
    else { S.cfg.parceria = 'fixa'; S.cfg.formacaoDupla = 'sorteio'; }
    _norm(); _rerender();
  };
  window._f2Modo = function (v) { S.cfg.rodadas.modo = v; _norm(); _rerender(); };
  window._f2Turnos = function (v) { S.cfg.rodadas.turnos = v; _norm(); _rerender(); };
  // CANON (v4.5.24, regra-mãe): editar o Nº de RODADAS → MOVE a DATA FINAL (mantém V). Fim =
  // 1º + N×repetição (última rodada tem 1 intervalo pra ser jogada → todos os N sorteios disparam).
  // Só cai no legado (deriva o intervalo pela janela) quando não dá pra derivar o fim (sem V/1º sorteio).
  window._f2Rn = function (v) {
    if (!S) return;
    var n = parseInt(v, 10);
    if (!(n >= 1)) { return; } // vazio → mantém tudo (repetir intacto), sem re-render
    S.cfg.rodadas.n = n;
    if (n <= 1) S.cfg.rodadas.drawIntervalDays = null;             // 1 rodada não repete
    // v4.5.47: com repetição definida, o Nº de rodadas define o TÉRMINO da fase (1º + N×intervalo).
    // Só quando não dá pra derivar o fim (sem repetição/1º sorteio) cai no legado: intervalo pela janela.
    else if (!_syncEndFromSchedule()) { var d = _windowDays(); if (d) S.cfg.rodadas.drawIntervalDays = Math.max(1, Math.round(d / n)); }
    // CANON (dono, 17/jul): N > 1 EXIGE repetição — o painel TEM que MOSTRAR de quanto em
    // quanto tempo. Sem isso o intervalo ficava vazio (= sorteio único) e o sistema fazia 1
    // rodada enquanto o painel dizia N: contradição invisível pro usuário, e a rodada 2 nunca
    // sorteava (sem intervalo não há próximo slot ⇒ nextDrawAt inexistente). Fallback: divide
    // a janela da fase; sem janela, diário (o menor passo real) — nunca vazio.
    if (n > 1) {
      var _iv = parseInt(S.cfg.rodadas.drawIntervalDays, 10);
      if (!(_iv >= 1)) { var _wd = _windowDays(); S.cfg.rodadas.drawIntervalDays = (_wd && _wd >= n) ? Math.max(1, Math.floor(_wd / n)) : 1; }
    }
    _norm(); _f2SchedRefresh(); // v4.4.71: atualiza no lugar (sem destruir o input em edição)
  };
  // Agendamento dos sorteios (modo "nº de rodadas"). Toggle "Sortear manualmente" (checked =
  // manual). A data re-renderiza (recalcula o intervalo sugerido e o default manual/auto). Hora
  // e intervalo NÃO re-renderizam (preserva foco); editar o intervalo desliga o auto-sugerido.
  window._f2SchedManual = function (checked) { if (!S) return; S.cfg.rodadas.drawManual = !!checked; _norm(); _rerender(); };
  // A data/hora do 1º sorteio é TAMBÉM o início da fase (pedido do dono): espelha nos
  // campos #tourn-start-date/#tourn-start-time e dispara os recálculos do form.
  function _mirrorPhaseStart() {
    var sd = document.getElementById('tourn-start-date'); if (sd && S.cfg.rodadas.drawFirstDate) sd.value = S.cfg.rodadas.drawFirstDate;
    var st = document.getElementById('tourn-start-time'); if (st && S.cfg.rodadas.drawFirstTime) st.value = S.cfg.rodadas.drawFirstTime;
    ['_recalcDuration', '_checkWeather'].forEach(function (fn) { if (typeof window[fn] === 'function') { try { window[fn](); } catch (e) {} } });
  }
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
  // v4.5.47 (pedido do dono): 1º sorteio + repetição + Nº de rodadas → o TÉRMINO da fase DERIVA
  // pra MANTER o Nº de rodadas escolhido. Último sorteio = 1º + (N−1)×intervalo; o fim fica UM
  // intervalo além (o "tempo médio de uma rodada" = dias de repetição), dando à última rodada a
  // janela pra ser jogada → fim = 1º + N×intervalo, na MESMA hora do 1º sorteio. Cai ESTRITAMENTE
  // depois do último sorteio, então os N sorteios disparam e a contagem estrita (_phasePlannedRounds)
  // relê exatamente N. Escreve nos campos de término da fase (#tourn-end-date/#tourn-end-time).
  // Retorna true se conseguiu derivar o fim (precisa de 1º sorteio + intervalo + rodadas).
  function _syncEndFromSchedule() {
    if (!S || !S.cfg || !S.cfg.rodadas) return false;
    var r = S.cfg.rodadas;
    var n = parseInt(r.n, 10);
    var iv = parseInt(r.drawIntervalDays, 10);
    if (!(n >= 1) || !(iv >= 1)) return false;
    var _v = function (id) { var el = document.getElementById(id); return el ? (el.value || '') : ''; };
    var firstDate = r.drawFirstDate || _v('tourn-start-date') || '';
    var firstTime = (r.drawFirstDate ? (r.drawFirstTime || '19:00') : (_v('tourn-start-time') || '19:00'));
    if (!firstDate) return false;
    var first = new Date(firstDate + 'T' + firstTime);
    if (isNaN(first.getTime())) return false;
    var end = new Date(first.getTime() + n * iv * 86400000);
    var endDEl = document.getElementById('tourn-end-date');
    if (!endDEl) return false;
    endDEl.value = end.getFullYear() + '-' + String(end.getMonth() + 1).padStart(2, '0') + '-' + String(end.getDate()).padStart(2, '0');
    var endTEl = document.getElementById('tourn-end-time'); if (endTEl) endTEl.value = firstTime;
    ['_recalcDuration', '_checkWeather'].forEach(function (fn) { if (typeof window[fn] === 'function') { try { window[fn](); } catch (e) {} } });
    return true;
  }
  // Exposto pros campos legados de Início/Término da fase (#tourn-start/end-date/time).
  window._f2RecalcRoundsFromWindow = function () { if (!S || !S.cfg || S.cfg.rodadas.modo !== 'fixo') return; _recalcN(); _norm(); _f2SchedRefresh(); };
  // v4.4.71: texto da nota derivado do estado — compartilhado por _schedBlock (render) e
  // _f2SchedRefresh (update in-place). Fonte única do texto, sem divergir.
  function _f2SchedNote(r) {
    var canAuto = !!r.drawFirstDate;
    var manual = !!r.drawManual || !canAuto;
    var ivVal = (parseInt(r.drawIntervalDays, 10) >= 1) ? parseInt(r.drawIntervalDays, 10) : '';
    if (manual) return canAuto ? 'Você sorteia cada rodada manualmente, quando quiser.' : 'Informe a data do 1º sorteio para poder sortear automaticamente.';
    if (ivVal) return 'Sorteia a cada ' + ivVal + ' dia(s) a partir do 1º sorteio, dentro das datas da fase. Editar rodadas ou repetição ajusta o outro pela janela.';
    return 'Sem repetição: sorteia só o 1º; você libera as próximas rodadas manualmente.';
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
    // v4.4.76: preencher a data (vazia→setada) LIGA o modo automático sozinho — a
    // presença de uma data futura já sinaliza intenção de sortear automaticamente.
    // O usuário pode voltar pra manual no toggle em seguida. Mata a pegadinha
    // "data setada + Sortear manualmente ligado = sorteio que nunca acontece"
    // (nextDrawAt nem era computado). Só na transição vazia→setada (não briga com
    // edições de data já preenchida nem com o manual reativado depois).
    if (nowSet && !was) S.cfg.rodadas.drawManual = false;
    // CANON (v4.5.24): mexeu em qualquer coisa que NÃO seja o Nº de rodadas → recalcula as RODADAS
    // pela janela (mantém V e F). Só editar o campo "Nº de rodadas" move a data final (_f2Rn).
    _mirrorPhaseStart(); _recalcN(); _norm();
    if (was !== nowSet) _rerender(); else _f2SchedRefresh();
  };
  window._f2SchedTime = function (v) { if (!S) return; S.cfg.rodadas.drawFirstTime = v || '19:00'; _mirrorPhaseStart(); _recalcN(); _norm(); _f2SchedRefresh(); };
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
    if (!(iv >= 1)) { S.cfg.rodadas.drawIntervalDays = null; S.cfg.rodadas.n = 1; _norm(); _f2SchedRefresh(); return; } // vazio = sorteio único ⇒ 1 rodada (mostrado)
    S.cfg.rodadas.drawIntervalDays = iv;
    var _n = _strictNFromWindow(iv); if (_n != null) S.cfg.rodadas.n = Math.max(1, _n); // recalcula rodadas (estrito = runtime)
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
    var perGroupScope = S.cfg.grupos > 1 && S.cfg.classifScope !== 'overall';
    if (!perGroupScope && units > 1 && n >= units) { S.cfg.eliminatoria.qualifyAll = true; }
    else { S.cfg.classificados = n; }
    _norm(); _rerender();
  };
  // v4.4.31: escopo da classificação — por grupos × geral.
  window._f2ClassScope = function (v) { if (!S) return; S.cfg.classifScope = (v === 'overall') ? 'overall' : 'per_group'; _norm(); _rerender(); };
  // v4.4.36: quantos avançam — todos × os melhores (slider).
  window._f2QualifyAll = function (all) { if (!S) return; S.cfg.eliminatoria.qualifyAll = !!all; _norm(); _rerender(); };
  // Ao menos UMA fase ativa (sem travar toggle): desligar a eliminatória religa a classificatória.
  window._f2Elim = function (b) { if (!S) return; S.cfg.eliminatoria.ativa = !!b; if (!b) S.cfg.classifAtiva = true; _norm(); _rerender(); };
  // v4.4.33: toggle da fase classificatória. Desligar → eliminação direta (elim obrigatória).
  window._f2ClassifAtiva = function (checked) { if (!S) return; S.cfg.classifAtiva = !!checked; if (!checked) S.cfg.eliminatoria.ativa = true; _norm(); _rerender(); };
  window._f2Linhas = function (n) { S.cfg.eliminatoria.linhas = n; _norm(); _rerender(); };
  window._f2GrandFinal = function (checked) { if (!S) return; S.cfg.eliminatoria.grandFinal = !!checked; _norm(); _rerender(); };
  // v4.4.58: Dupla Eliminatória (repescagem). ON força 1 linha (chave única) no normalize.
  window._f2ElimDupla = function (checked) { S.cfg.eliminatoria.dupla = !!checked; _norm(); _rerender(); };
  // "Inscrições durante a fase" DA ELIMINATÓRIA (cfg.eliminatoria.lateEnrollment). master ON =
  // Fechadas; master OFF preserva o conf (expand/standby). conf só vale com inscrição aberta.
  window._f2ElimLateMaster = function (closedOn) {
    if (!S) return; var e = S.cfg.eliminatoria;
    if (closedOn) e.lateEnrollment = 'closed';
    else e.lateEnrollment = (e.lateEnrollment === 'expand') ? 'expand' : 'standby';
    _norm(); _rerender();
  };
  window._f2ElimLateConf = function (expandOn) {
    if (!S) return; var e = S.cfg.eliminatoria;
    if (e.lateEnrollment === 'closed') return; // conf irrelevante quando fechada
    e.lateEnrollment = expandOn ? 'expand' : 'standby';
    _norm(); _rerender();
  };
  window._f2Origem = function (v) { S.cfg.eliminatoria.origem = v; _norm(); _rerender(); };
  // v4.5.51: abrir a eliminatória com rodada Rei/Rainha (grupos de 4 formam as duplas).
  window._f2ElimOpenRR = function (checked) { if (!S) return; S.cfg.eliminatoria.openReiRainha = !!checked; _norm(); _rerender(); };
  window._f2ElimRRCut = function (n) { if (!S) return; S.cfg.eliminatoria.reiRainhaCut = (parseInt(n, 10) === 2) ? 2 : 4; _norm(); _rerender(); };
  // v4.4.x: estratégia ÚNICA da eliminatória (performance/equilíbrio/sorteio) — dirige formação
  // das duplas E semeadura dos confrontos (compilador deriva bracketSeeding).
  window._f2Formacao = function (v) { S.cfg.eliminatoria.formacao = v; _norm(); _rerender(); };
  window._f2Terceiro = function (b) { S.cfg.eliminatoria.terceiro = !!b; _norm(); };
  window._f2LineName = function (i, v) { if (S && S.cfg.eliminatoria.nomes) S.cfg.eliminatoria.nomes[i] = v; };

  // ── MODO FORM: monta os controles dentro do #fase1-box do editar/criar. ──
  // sport: modalidade; initialCfg: config existente (t.fmt2) ou null (default do esporte).
  window._f2MountInForm = function (container, sport, initialCfg, tournament) {
    sport = sport || 'Beach Tennis';
    var cfg = (initialCfg && typeof initialCfg === 'object') ? window.FORMAT2.normalize(initialCfg, sport) : window.FORMAT2.defaultConfig(sport);
    S = { mode: 'form', mountEl: container, sport: sport, cfg: cfg, t: tournament || null };
    _syncTeamSize();
    if (container) { container.innerHTML = _bodyControls(); _placeExt(); }
  };
  // Config atual (pro save do form). null se não montado em modo form.
  window._f2GetConfig = function () { return (S && S.mode === 'form') ? window.FORMAT2.normalize(S.cfg, S.sport) : null; };
  // Atualiza a modalidade sem perder a config (quando o form troca o esporte).
  window._f2SetSport = function (sport) { if (S) { S.sport = sport || S.sport; _norm(); _rerender(); } };

  // ── MODO PAGE (legado): página #formato/:tId ──
  window.renderFormatoPage = function (container) {
    var tId = _tid();
    var lookup = window._findTournamentById || function () { return null; };
    var t = lookup(tId);
    var hdr = window._renderBackHeader({ href: '#tournaments/' + tId, label: 'Voltar', middleHtml: '<b>Formato do torneio</b>' });
    if (!t) { container.innerHTML = hdr + '<div style="padding:24px;text-align:center;color:var(--text-muted);">Torneio não encontrado. Abra logado, pelo app.</div>'; return; }
    var sport = t.sport || 'Beach Tennis';
    if (!S || S.mode !== 'page' || S.tId !== tId) {
      var init = (t.fmt2 && typeof t.fmt2 === 'object') ? window.FORMAT2.normalize(t.fmt2, sport) : window.FORMAT2.defaultConfig(sport);
      S = { mode: 'page', tId: tId, t: t, sport: sport, cfg: init };
    } else { S.t = t; }
    container.innerHTML = hdr + '<div style="max-width:720px;margin:0 auto;padding:14px 16px 44px;">' + _bodyControls() +
      '<button type="button" onclick="window._f2ApplyPage()" style="margin-top:16px;width:100%;padding:14px;border-radius:12px;border:none;background:linear-gradient(135deg,#10b981,#059669);color:#fff;font-size:0.95rem;font-weight:700;cursor:pointer;">Aplicar formato ao torneio</button></div>';
  };
  window._f2ApplyPage = function () {
    var t = S.t;
    var out = window.FORMAT2.compileToPhases(S.cfg, { sport: S.sport, resultEntry: t.resultEntry || ['organizer'] });
    Object.assign(t, out.topLevel);
    t.phases = out.phases; t.fmt2 = S.cfg;
    if (t.format === 'Fase de Grupos') { t.ligaRoundFormat = 'standard'; t.ligaDrawMode = 'standard'; }
    t.currentPhaseIndex = 0; t.currentStage = null;
    t.matches = []; t.rounds = []; t.groups = []; t.standings = []; t.thirdPlaceMatch = null;
    t.updatedAt = new Date().toISOString();
    var done = function () { if (window.showNotification) showNotification('Formato aplicado', window.FORMAT2.summary(S.cfg), 'success'); location.hash = '#tournaments/' + S.tId; };
    try { var p = (window.FirestoreDB && window.FirestoreDB.saveTournament) ? window.FirestoreDB.saveTournament(t) : null; if (p && p.then) p.then(done).catch(function (e) { if (window.showNotification) showNotification('Erro ao salvar', String((e && e.message) || e), 'error'); }); else done(); }
    catch (e) { if (window.showNotification) showNotification('Erro ao salvar', String((e && e.message) || e), 'error'); }
  };
})();
