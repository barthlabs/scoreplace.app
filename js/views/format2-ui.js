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
  function _rerender() {
    if (!S) return;
    if (S.mode === 'form') {
      _syncTeamSize();
      var el = document.getElementById('f2-config-mount');
      if (el) el.innerHTML = _bodyControls();
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
  function _phaseBlock(title, color, inner) {
    return '<div style="border:1px solid ' + color + '55;border-radius:14px;padding:14px 14px 8px;margin-bottom:16px;background:' + color + '0d;">' +
      '<div style="display:inline-block;font-size:1.05rem;font-weight:800;letter-spacing:0.4px;text-transform:uppercase;color:' + color + ';background:' + color + '22;padding:9px 17px;border-radius:10px;margin-bottom:16px;">' + title + '</div>' +
      inner + '</div>';
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
      var sorteadas = pr === 'fixa' && cfg.formacaoDupla !== 'manual';
      var fBtns = _pill(montadas, 'window._f2TeamForm(\'montadas\')', '🤝 Montadas') +
        _pill(sorteadas, 'window._f2TeamForm(\'sorteio\')', '🎲 Sorteio');
      if (um) fBtns += _pill(pr === 'rei_rainha', 'window._f2TeamForm(\'rei_rainha\')', '👑 Rei/Rainha');
      classif += _sec('Formação das equipes', fBtns);
    }

    if (!rotativo) {
      var modo = cfg.rodadas.modo;
      var rBtns = _pill(modo === 'todos', 'window._f2Modo(\'todos\')', '🔄 Todos contra todos');
      if (!isDupla) rBtns += _pill(modo === 'fixo', 'window._f2Modo(\'fixo\')', '#️⃣ Nº fixo de rodadas');
      var inner = rBtns;
      if (modo === 'todos') {
        inner += '<div style="margin-top:8px;">' + _pill(cfg.rodadas.turnos === 'ida', 'window._f2Turnos(\'ida\')', 'Ida') + _pill(cfg.rodadas.turnos === 'ida_volta', 'window._f2Turnos(\'ida_volta\')', 'Ida e volta') + '</div>';
      } else {
        inner += '<div style="margin-top:8px;display:flex;align-items:center;gap:8px;font-size:0.85rem;">Rodadas ' + _num(cfg.rodadas.n, 1, 30, 'window._f2Rn(this.value)') + '</div><div style="font-size:0.72rem;color:var(--text-muted);margin-top:4px;">Com rodadas insuficientes, os confrontos usam clusters (equilíbrio) e sit-out balanceado.</div>';
      }
      classif += _sec('Rodadas', inner);
    } else {
      classif += _sec('Rodadas', '<div style="display:flex;align-items:center;gap:8px;font-size:0.85rem;">Rodadas ' + _num(cfg.rodadas.n, 1, 30, 'window._f2Rn(this.value)') + '</div><div style="font-size:0.72rem;color:var(--text-muted);margin-top:4px;">Sorteio a cada rodada — parceiro' + (cfg.parceria === 'rei_rainha' ? ' (grupos de 4)' : '') + ' e adversário sorteados; pontuação individual; sit-out balanceado.</div>');
    }

    var e = cfg.eliminatoria;
    var elimForced = cfg.grupos > 1;
    // Fase de grupos sempre tem eliminatória → sem toggle, vai direto aos controles.
    // Pontos corridos (1 grupo) → toggle liga/desliga.
    var elimHead = elimForced
      ? ''
      : '<label style="display:inline-flex;align-items:center;gap:8px;cursor:pointer;"><input type="checkbox" ' + (e.ativa ? 'checked' : '') + ' onchange="window._f2Elim(this.checked)"> <span style="font-size:0.85rem;">Tem eliminatória no fim</span></label>';
    var eb = '';
    if (e.ativa) {
      // v4.4.17: "Nº de classificados" ABRE o box da Eliminatória, como slider (igual grupos).
      var classLabel = um ? 'Nº de classificados (total) para a eliminatória' : 'Nº de classificados por grupo';
      var classMax = um ? 32 : 8;
      if (cfg.classificados > classMax) classMax = cfg.classificados; // nunca corta valor salvo
      eb += '<div style="font-size:0.82rem;color:var(--text-muted);margin-bottom:8px;">' + classLabel + '</div>' +
        '<div style="display:flex;align-items:center;gap:12px;margin-bottom:6px;">' +
        '<input type="range" min="1" max="' + classMax + '" value="' + cfg.classificados + '" oninput="window._f2ClassLive(this.value)" onchange="window._f2Class(this.value)" style="flex:1;accent-color:#fbbf24;">' +
        '<span id="f2-class-val" style="min-width:30px;text-align:center;font-weight:800;font-size:1.15rem;color:#fde68a;">' + cfg.classificados + '</span></div>';
      eb += '<div style="margin-top:12px;font-size:0.72rem;color:var(--text-muted);margin-bottom:5px;">Linhas (chaves paralelas — nomes livres)</div>';
      eb += [1, 2, 4].map(function (n) { return _pill(e.linhas === n, 'window._f2Linhas(' + n + ')', String(n)); }).join('');
      for (var i = 0; i < e.linhas; i++) {
        eb += '<div style="margin-top:6px;"><input type="text" value="' + _safe(e.nomes[i] || '') + '" placeholder="Nome da linha ' + (i + 1) + ' (opcional)" oninput="window._f2LineName(' + i + ',this.value)" style="width:100%;max-width:300px;padding:7px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:var(--bg-darker,rgba(0,0,0,0.25));color:var(--text-main);box-sizing:border-box;"></div>';
      }
      if (scoreInd && isDupla) {
        eb += '<div style="margin-top:12px;font-size:0.72rem;color:var(--text-muted);margin-bottom:5px;">Origem das duplas na eliminatória</div>';
        eb += _pill(e.origem === 'ja_formadas', 'window._f2Origem(\'ja_formadas\')', 'Já formadas') + _pill(e.origem === 'formar', 'window._f2Origem(\'formar\')', 'Formar da classificação');
        if (e.origem === 'formar') {
          eb += '<div style="margin-top:6px;">' + _pill(e.formacao === 'performance', 'window._f2Formacao(\'performance\')', '📈 Performance') + _pill(e.formacao === 'equilibrio', 'window._f2Formacao(\'equilibrio\')', '⚖️ Equilíbrio') + _pill(e.formacao === 'sorteio', 'window._f2Formacao(\'sorteio\')', '🎲 Sorteio') + '</div>';
        }
      }
      // 3º lugar SEMPRE existe (project_third_place_always) — sem toggle.
    }
    var elimInner = (elimHead + eb) || '<div style="font-size:0.8rem;color:var(--text-muted);">—</div>';

    var h = _phaseBlock('🎯 Fase Classificatória', '#818cf8', classif) +
      _phaseBlock('🏆 Fase Eliminatória', '#fbbf24', elimInner) +
      '<div style="margin-top:2px;padding:11px 13px;border-radius:10px;background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.25);font-size:0.82rem;color:#a5b4fc;">📋 ' + _safe(window.FORMAT2.summary(cfg)) + '</div>';
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
  // v4.4.19: "Formação das equipes" — 1 controle: Montadas (fixa+manual) / Sorteio
  // (fixa+sorteio) / Rei/Rainha (rotativo, só 1 grupo).
  window._f2TeamForm = function (v) {
    if (!S) return;
    if (v === 'montadas') { S.cfg.parceria = 'fixa'; S.cfg.formacaoDupla = 'manual'; }
    else if (v === 'sorteio') { S.cfg.parceria = 'fixa'; S.cfg.formacaoDupla = 'sorteio'; }
    else if (v === 'rei_rainha') { S.cfg.parceria = 'rei_rainha'; }
    _norm(); _rerender();
  };
  window._f2Modo = function (v) { S.cfg.rodadas.modo = v; _norm(); _rerender(); };
  window._f2Turnos = function (v) { S.cfg.rodadas.turnos = v; _norm(); _rerender(); };
  window._f2Rn = function (v) { S.cfg.rodadas.n = Math.max(1, parseInt(v, 10) || 1); _norm(); _rerender(); };
  // Slider de classificados: número ao vivo no arraste; re-render ao soltar (igual grupos).
  window._f2ClassLive = function (v) {
    if (!S) return;
    S.cfg.classificados = Math.max(1, parseInt(v, 10) || 1);
    var lbl = document.getElementById('f2-class-val'); if (lbl) lbl.textContent = S.cfg.classificados;
  };
  window._f2Class = function (v) { S.cfg.classificados = Math.max(1, parseInt(v, 10) || 1); _norm(); _rerender(); };
  window._f2Elim = function (b) { S.cfg.eliminatoria.ativa = !!b; _norm(); _rerender(); };
  window._f2Linhas = function (n) { S.cfg.eliminatoria.linhas = n; _norm(); _rerender(); };
  window._f2Origem = function (v) { S.cfg.eliminatoria.origem = v; _norm(); _rerender(); };
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
    if (container) container.innerHTML = _bodyControls();
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
